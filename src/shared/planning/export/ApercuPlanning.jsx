import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'
import { MARGE_PAGE_MM } from './grilleExport'
import { PX_PAR_MM, sautsDePage, libellePages } from './apercuPlanningLogique'

// ─── Aperçu du PDF d'un planning, dans la fenêtre d'export ──────────────────
//
// La page même qui partira à l'impression (`construire`, version « aperçu »
// du générateur), dans un cadre isolé et réduite à la largeur disponible.
// Refaite un court instant après le dernier réglage, comme l'aperçu des
// comptes rendus : une frappe dans les textes ne refabrique pas tout. Les
// sauts de page sont estimés (pointillés), le document s'affichant d'un seul
// tenant.

const ATTENTE_MS = 450

export function ApercuPlanning({ parametres, construire, largeurMm, hauteurMm, valide = true }) {
  const [html, setHtml] = useState(null)
  const [servis, setServis] = useState(null)
  const [agrandi, setAgrandi] = useState(false)
  const [nombrePages, setNombrePages] = useState(1)
  const construireCourant = useRef(construire)
  useLayoutEffect(() => { construireCourant.current = construire })

  useEffect(() => {
    if (!valide) return
    const minuterie = setTimeout(() => {
      setHtml(construireCourant.current(parametres))
      setServis(parametres)
    }, ATTENTE_MS)
    return () => clearTimeout(minuterie)
  }, [parametres, valide])

  useEffect(() => {
    if (!agrandi) return
    const surTouche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAgrandi(false) } }
    window.addEventListener('keydown', surTouche, true)
    return () => window.removeEventListener('keydown', surTouche, true)
  }, [agrandi])

  const enCours = valide && servis !== parametres

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 26 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591' }}>
          Aperçu{html ? ` · ${libellePages(nombrePages)}` : ''}
        </p>
        {enCours && <span role="status" style={{ fontSize: 11, color: '#9C9591' }}>Mise à jour…</span>}
        {html && (
          <button type="button" onClick={() => setAgrandi(true)} title="Agrandir l’aperçu"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer', color: '#374151' }}>
            <Maximize2 size={12} /> Agrandir
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', backgroundColor: '#EEEBE7', padding: 12 }}>
        {!valide ? (
          <p style={{ fontSize: 12, color: '#9C9591', textAlign: 'center', margin: '40px 0' }}>Période invalide : rien à montrer.</p>
        ) : html ? (
          <Feuille html={html} largeurMm={largeurMm} hauteurMm={hauteurMm} pali={enCours} onNombrePages={setNombrePages} />
        ) : (
          <p style={{ fontSize: 12, color: '#9C9591', textAlign: 'center', margin: '40px 0' }}>Préparation de l’aperçu…</p>
        )}
      </div>
      {nombrePages > 1 && (
        <p style={{ fontSize: 10, color: '#9C9591', marginTop: 6, fontStyle: 'italic' }}>
          Les pointillés marquent les sauts de page, à peu près : l’en-tête du tableau est répété en haut de chaque page.
        </p>
      )}

      {agrandi && html && createPortal(
        <div role="dialog" aria-label="Aperçu agrandi"
          style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: 'rgba(31,27,23,0.85)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' }}>
            <button type="button" onClick={() => setAgrandi(false)} title="Fermer (Échap)"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 'none', borderRadius: 2, background: 'white', cursor: 'pointer', color: '#1F1B17' }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px 24px' }}>
            <Feuille html={html} largeurMm={largeurMm} hauteurMm={hauteurMm} />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// Une feuille : le cadre à la taille réelle de la page, réduit par `scale` à la
// largeur disponible. La page envoie sa hauteur une fois dessinée.
function Feuille({ html, largeurMm, hauteurMm, pali = false, onNombrePages }) {
  const conteneur = useRef(null)
  const cadre = useRef(null)
  const [largeurDispo, setLargeurDispo] = useState(0)
  const [hauteur, setHauteur] = useState(null)

  useLayoutEffect(() => {
    const el = conteneur.current
    if (!el) return
    const mesurer = () => setLargeurDispo(el.clientWidth)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const surMessage = (e) => {
      if (e.source !== cadre.current?.contentWindow || !e.data?.apercuPlanning) return
      setHauteur(e.data.hauteur)
    }
    window.addEventListener('message', surMessage)
    return () => window.removeEventListener('message', surMessage)
  }, [])

  const largeurPx = largeurMm * PX_PAR_MM
  // Au moins une page : une page courte reste une feuille entière
  const hauteurPx = Math.max(hauteur ?? 0, hauteurMm * PX_PAR_MM)
  const echelle = largeurDispo > 0 ? largeurDispo / largeurPx : 0
  const sauts = hauteur ? sautsDePage(hauteur, hauteurMm, MARGE_PAGE_MM) : []
  const nombrePages = sauts.length + 1

  useEffect(() => { onNombrePages?.(nombrePages) }, [nombrePages, onNombrePages])

  return (
    <div ref={conteneur} style={{ width: '100%' }}>
      <div style={{
        position: 'relative', overflow: 'hidden', backgroundColor: 'white',
        height: hauteurPx * echelle, boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
        opacity: pali ? 0.5 : 1, transition: 'opacity 150ms',
      }}>
        {echelle > 0 && (
          <iframe
            ref={cadre}
            title="Aperçu du PDF"
            srcDoc={html}
            sandbox="allow-scripts"
            scrolling="no"
            style={{
              position: 'absolute', top: 0, left: 0, border: 0,
              width: largeurPx, height: hauteurPx,
              transform: `scale(${echelle})`, transformOrigin: '0 0',
              pointerEvents: 'none',
            }}
          />
        )}
        {sauts.map((y, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: y * echelle, borderTop: '1px dashed var(--affaire-accent, #E8602C)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', right: 4, top: 2, fontSize: 9, fontWeight: 600, color: 'var(--affaire-accent, #E8602C)', backgroundColor: 'rgba(255,255,255,0.9)', padding: '0 3px' }}>
              Page {i + 2}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
