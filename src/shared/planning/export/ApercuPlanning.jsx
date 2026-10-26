import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'
import { PX_PAR_MM, libelleApercu } from './apercuPlanningLogique'

// ─── Aperçu du PDF d'un planning, dans la fenêtre d'export ──────────────────
//
// La page même qui partira à l'impression (`construire`, version « aperçu »
// du générateur), dans un cadre isolé et réduite à la largeur disponible.
// La page fabrique elle-même ses feuilles (`miseEnPageExport.js`) : l'aperçu
// les montre une à une, comme elles sortiront. Refaite un court instant après
// le dernier réglage, comme l'aperçu des comptes rendus : une frappe dans les
// textes ne refabrique pas tout.

const ATTENTE_MS = 450

export function ApercuPlanning({ parametres, construire, valide = true }) {
  // Page et format vont ensemble : pendant l'attente, l'ancienne page garde
  // son ancien format
  const [page, setPage] = useState(null)
  const [servis, setServis] = useState(null)
  const [agrandi, setAgrandi] = useState(false)
  const [mesure, setMesure] = useState(null)
  const construireCourant = useRef(construire)
  useLayoutEffect(() => { construireCourant.current = construire })

  useEffect(() => {
    if (!valide || !parametres) return
    const minuterie = setTimeout(() => {
      setPage({
        html: construireCourant.current(parametres),
        largeurMm: parametres.largeurMm,
        hauteurMm: parametres.hauteurMm,
      })
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
          Aperçu{page && mesure ? ` · ${libelleApercu(mesure)}` : ''}
        </p>
        {enCours && <span role="status" style={{ fontSize: 11, color: '#9C9591' }}>Mise à jour…</span>}
        {page && (
          <button type="button" onClick={() => setAgrandi(true)} title="Agrandir l’aperçu"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer', color: '#374151' }}>
            <Maximize2 size={12} /> Agrandir
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', backgroundColor: '#EEEBE7', padding: 12 }}>
        {!valide ? (
          <p style={{ fontSize: 12, color: '#9C9591', textAlign: 'center', margin: '40px 0' }}>Période invalide : rien à montrer.</p>
        ) : page ? (
          <Feuilles page={page} pali={enCours} onMesure={setMesure} />
        ) : (
          <p style={{ fontSize: 12, color: '#9C9591', textAlign: 'center', margin: '40px 0' }}>Préparation de l’aperçu…</p>
        )}
      </div>

      {agrandi && page && createPortal(
        <div role="dialog" aria-label="Aperçu agrandi"
          style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: 'rgba(31,27,23,0.85)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' }}>
            <button type="button" onClick={() => setAgrandi(false)} title="Fermer (Échap)"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 'none', borderRadius: 2, background: 'white', cursor: 'pointer', color: '#1F1B17' }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px 24px' }}>
            <Feuilles page={page} />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// Le cadre à la largeur réelle de la feuille, réduit par `scale` à la largeur
// disponible ; sa hauteur est celle que la page annonce une fois ses feuilles
// faites.
function Feuilles({ page, pali = false, onMesure }) {
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

  const surMesure = useRef(onMesure)
  useLayoutEffect(() => { surMesure.current = onMesure })
  useEffect(() => {
    const surMessage = (e) => {
      if (e.source !== cadre.current?.contentWindow || !e.data?.apercuPlanning) return
      setHauteur(e.data.hauteur)
      surMesure.current?.({ pages: e.data.pages, reduction: e.data.reduction })
    }
    window.addEventListener('message', surMessage)
    return () => window.removeEventListener('message', surMessage)
  }, [])

  const largeurPx = page.largeurMm * PX_PAR_MM
  const hauteurPx = hauteur ?? page.hauteurMm * PX_PAR_MM
  const echelle = largeurDispo > 0 ? largeurDispo / largeurPx : 0

  return (
    <div ref={conteneur} style={{ width: '100%' }}>
      <div style={{
        position: 'relative', overflow: 'hidden', height: hauteurPx * echelle,
        opacity: pali ? 0.5 : 1, transition: 'opacity 150ms',
      }}>
        {echelle > 0 && (
          <iframe
            ref={cadre}
            title="Aperçu du PDF"
            srcDoc={page.html}
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
      </div>
    </div>
  )
}
