import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X, RefreshCw } from 'lucide-react'

// ─── Aperçu du PDF dans la page ──────────────────────────────────────────────
//
// À la demande de l'agence, l'aperçu ne s'ouvre plus dans un autre onglet : les
// pages s'affichent en miniatures et suivent les réglages. Le PDF est refait
// un court instant après le dernier changement (`cle`), pas à chaque clic ;
// les anciennes pages restent visibles, pâlies, pendant la fabrication.

const ATTENTE_MS = 450
const LARGEUR_MINIATURE = 760 // pixels de l'image, l'écran la réduit
const LARGEUR_AGRANDIE = 1400

function liberer(pages) {
  for (const p of pages ?? []) URL.revokeObjectURL(p.url)
}

export function ApercuPdf({ cle, fabriquer, onAvertissements }) {
  const [pages, setPages] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [agrandi, setAgrandi] = useState(false)
  const [relance, setRelance] = useState(0)
  const [dernierPdf, setDernierPdf] = useState(null)
  // L'aperçu est à jour quand la dernière demande servie est la demande courante
  const demande = `${cle}|${relance}`
  const [servie, setServie] = useState(null)
  const enCours = servie !== demande
  const tour = useRef(0)
  // `fabriquer` change à chaque rendu de la page : seule la clé relance
  const fabriquerCourant = useRef(fabriquer)
  const avertir = useRef(onAvertissements)
  useLayoutEffect(() => {
    fabriquerCourant.current = fabriquer
    avertir.current = onAvertissements
  })

  useEffect(() => {
    const ce = ++tour.current
    const minuterie = setTimeout(async () => {
      try {
        const { blob, avertissements } = await fabriquerCourant.current()
        const { pagesEnImages } = await import('./apercuPdfRendu')
        const images = await pagesEnImages(blob, LARGEUR_MINIATURE)
        if (ce !== tour.current) { liberer(images); return }
        setDernierPdf(blob)
        setPages((avant) => { liberer(avant); return images })
        setErreur(null)
        avertir.current?.(avertissements ?? [])
      } catch (err) {
        if (ce === tour.current) setErreur(err?.message ?? String(err))
      }
      if (ce === tour.current) setServie(`${cle}|${relance}`)
    }, ATTENTE_MS)
    return () => clearTimeout(minuterie)
  }, [cle, relance])

  useEffect(() => () => setPages((avant) => { liberer(avant); return null }), [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591' }}>
          Aperçu{pages ? ` · ${pages.length} page${pages.length > 1 ? 's' : ''}` : ''}
        </p>
        {enCours && <span role="status" style={{ fontSize: 11, color: '#9C9591' }}>Mise à jour…</span>}
        {!enCours && erreur && (
          <button type="button" onClick={() => setRelance((n) => n + 1)} title="Refaire l’aperçu"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer' }}>
            <RefreshCw size={12} /> Réessayer
          </button>
        )}
        {pages?.length > 0 && (
          <button type="button" onClick={() => setAgrandi(true)} title="Agrandir l’aperçu"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer' }}>
            <Maximize2 size={12} /> Agrandir
          </button>
        )}
      </div>

      {erreur && <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: '#B8412C' }}>Aperçu impossible : {erreur}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: enCours && pages ? 0.55 : 1, transition: 'opacity 0.2s' }}>
        {!pages && !erreur && (
          <div style={{ aspectRatio: '210 / 297', background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9C9591' }}>
            Préparation de l’aperçu…
          </div>
        )}
        {pages?.map((p, i) => (
          <button key={p.url} type="button" onClick={() => setAgrandi(true)} aria-label={`Page ${i + 1}, agrandir`}
            style={{ display: 'block', padding: 0, border: '0.5px solid rgba(0,0,0,0.1)', background: 'white', cursor: 'zoom-in', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <img src={p.url} alt={`Page ${i + 1}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
          </button>
        ))}
      </div>

      {agrandi && dernierPdf && <ApercuAgrandi pdf={dernierPdf} onFermer={() => setAgrandi(false)} />}
    </div>
  )
}

// Les pages en grand, refaites à haute définition depuis le dernier PDF
function ApercuAgrandi({ pdf, onFermer }) {
  const [pages, setPages] = useState(null)

  useEffect(() => {
    let abandon = false
    let obtenues = null
    import('./apercuPdfRendu')
      .then(({ pagesEnImages }) => pagesEnImages(pdf, LARGEUR_AGRANDIE))
      .then((images) => { obtenues = images; if (abandon) liberer(images); else setPages(images) })
      .catch((err) => console.warn('Aperçu agrandi :', err))
    return () => { abandon = true; liberer(obtenues) }
  }, [pdf])

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  // Ne se ferme pas au clic à côté (règle de l'agence) : ✕ ou Échap
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Aperçu du compte rendu"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(31,27,23,0.82)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px' }}>
        <button type="button" onClick={onFermer} aria-label="Fermer l’aperçu"
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer' }}>
          <X size={22} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 32px' }}>
        {!pages && <p style={{ textAlign: 'center', color: 'white', fontSize: 13 }}>Préparation…</p>}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {pages?.map((p, i) => (
            <img key={p.url} src={p.url} alt={`Page ${i + 1}`} style={{ display: 'block', width: '100%', maxWidth: 900, height: 'auto', background: 'white' }} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
