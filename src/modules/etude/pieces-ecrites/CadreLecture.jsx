import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, List, X } from 'lucide-react'

// ─── Cadre commun aux lectures d'un CCTP et d'un DPGF ────────────────────────
//
// Plein écran par un portail (une fenêtre `fixed` sous une carte animée
// resterait prise dans la carte), bande sombre de la barre d'état de l'iPad,
// en-tête (titre, page en cours, actions, ✕), sommaire qui suit la lecture —
// colonne à gauche sur grand écran, bouton sur tablette — et feuille blanche
// qui défile. Fermé par ✕ ou Échap seulement. Le contenu est dessiné par
// `children({ accent, inscrire, taille, large })` : `inscrire(id)` est la
// référence à poser sur chaque bloc repéré (sommaire, page, cible).

const LARGE = '(min-width: 900px)'

/**
 * @param reperes [{ id, niveau, page }] dans l'ordre du document
 * @param sommaire [{ id, numero, titre, niveau }]
 * @param cibleId le bloc sur lequel la lecture s'ouvre
 * @param sousTitre (page en cours) → texte sous le titre
 * @param actions boutons ajoutés à l'en-tête
 */
export function CadreLecture({ titre, sousTitre, reperes = [], sommaire = [], cibleId = null, nomSommaire = 'Sommaire', actions = null, grand = false, largeurFeuille = 760, onFermer, children }) {
  const ancre = useRef(null)
  const defilement = useRef(null)
  const elements = useRef(new Map())
  const navigation = useRef(null)
  const [accent, setAccent] = useState('#E8602C')
  const [large, setLarge] = useState(() => typeof window === 'undefined' || window.matchMedia(LARGE).matches)
  const [sommaireOuvert, setSommaireOuvert] = useState(false)
  const [courant, setCourant] = useState({ id: null, page: null })

  // Le portail sort du cadre de l'affaire, qui porte la couleur de sa phase
  useLayoutEffect(() => {
    const valeur = ancre.current && getComputedStyle(ancre.current).getPropertyValue('--affaire-accent').trim()
    if (valeur) setAccent(valeur)
  }, [])

  useEffect(() => {
    const requete = window.matchMedia(LARGE)
    const suivre = () => setLarge(requete.matches)
    requete.addEventListener('change', suivre)
    return () => requete.removeEventListener('change', suivre)
  }, [])

  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])

  const inscrire = useCallback((id) => (el) => {
    if (el) elements.current.set(id, el)
    else elements.current.delete(id)
  }, [])

  const allerA = useCallback((id, comportement = 'smooth') => {
    const cible = elements.current.get(id)
    const boite = defilement.current
    if (!cible || !boite) return
    boite.scrollTo({ top: cible.offsetTop - 16, behavior: comportement })
  }, [])

  useLayoutEffect(() => { if (cibleId) allerA(cibleId, 'auto') }, [cibleId, allerA])

  // Chapitre et page à hauteur du haut de l'écran : sommaire et en-tête suivent
  const suivreLecture = useCallback(() => {
    const boite = defilement.current
    if (!boite) return
    const seuil = boite.scrollTop + 40
    let id = null
    let page = null
    for (const r of reperes) {
      const el = elements.current.get(r.id)
      if (!el || el.offsetTop > seuil) break
      if (r.niveau != null && r.niveau <= 2) id = r.id
      if (r.page != null) page = r.page
    }
    setCourant((c) => (c.id === id && c.page === page ? c : { id, page }))
  }, [reperes])
  useEffect(() => {
    const boite = defilement.current
    if (!boite) return
    let image = null
    const surDefilement = () => {
      if (image) return
      image = requestAnimationFrame(() => { image = null; suivreLecture() })
    }
    suivreLecture()
    boite.addEventListener('scroll', surDefilement, { passive: true })
    return () => { boite.removeEventListener('scroll', surDefilement); if (image) cancelAnimationFrame(image) }
  }, [suivreLecture])

  // Le sommaire garde le chapitre en cours sous les yeux
  useEffect(() => {
    const actif = courant.id && navigation.current?.querySelector('[aria-current="location"]')
    actif?.scrollIntoView({ block: 'nearest' })
  }, [courant.id])

  const taille = grand ? 16 : 14
  const bouton = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 44, minHeight: 44,
    padding: '0 10px', border: 'none', background: 'none', color: '#F5F1E9', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }
  const afficherSommaire = sommaire.length > 1 && (large || sommaireOuvert)

  return (
    <>
      <span ref={ancre} hidden />
      {createPortal(
        <div role="dialog" aria-modal="true" aria-label={titre}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#EDE8DF', display: 'flex', flexDirection: 'column' }}>
          {/* App installée sur l'iPad : la barre d'état passe par-dessus */}
          <div style={{ height: 'env(safe-area-inset-top)', background: '#1F1B17', flexShrink: 0 }} />
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 16px', background: '#1F1B17', color: '#F5F1E9', flexShrink: 0 }}>
            <FileText size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(245,241,233,0.65)' }}>{sousTitre?.(courant.page)}</p>
            </div>
            {actions && actions(bouton)}
            {!large && sommaire.length > 1 && (
              <button type="button" onClick={() => setSommaireOuvert((o) => !o)} aria-pressed={sommaireOuvert} style={bouton}>
                <List size={18} /> Sommaire
              </button>
            )}
            <button type="button" onClick={onFermer} aria-label="Fermer la lecture" title="Fermer (Échap)" style={bouton}>
              <X size={20} />
            </button>
          </header>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
            {afficherSommaire && (
              <nav ref={navigation} aria-label={nomSommaire} style={{
                width: large ? 280 : '100%', flexShrink: 0, overflowY: 'auto', background: '#FBF9F5',
                borderRight: large ? '0.5px solid rgba(0,0,0,0.1)' : 'none', padding: '12px 0',
                ...(large ? {} : { position: 'absolute', inset: 0, zIndex: 1 }),
              }}>
                <p style={{ margin: '0 16px 8px', fontSize: 11, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sommaire</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {sommaire.map((s) => {
                    const actif = s.id === courant.id
                    return (
                      <li key={s.id}>
                        <button type="button" onClick={() => { allerA(s.id, large ? 'smooth' : 'auto'); if (!large) setSommaireOuvert(false) }}
                          aria-current={actif ? 'location' : undefined}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', minHeight: 36, border: 'none', cursor: 'pointer',
                            padding: `6px 16px 6px ${s.niveau > 1 ? 30 : 16}px`, fontSize: s.niveau > 1 ? 12 : 13,
                            fontWeight: s.niveau > 1 ? 400 : 600, lineHeight: 1.35,
                            color: actif ? accent : '#1F1B17', background: actif ? 'rgba(0,0,0,0.04)' : 'none',
                            borderLeft: `3px solid ${actif ? accent : 'transparent'}`,
                          }}>
                          {s.numero && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: accent, marginRight: 6 }}>{s.numero}</span>}
                          {s.titre}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            )}
            <div ref={defilement} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: large ? '24px 24px 80px' : '12px 8px 80px', position: 'relative' }}>
              <article style={{
                maxWidth: largeurFeuille, margin: '0 auto', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                padding: large ? '40px 56px 56px' : '20px 18px 32px', boxSizing: 'border-box',
              }}>
                {children({ accent, inscrire, taille, large })}
              </article>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Repère « page 12 » entre deux blocs, comme un saut de page. */
export function ReperePage({ page }) {
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', color: '#B5AEA8', fontSize: 11 }}>
      <span style={{ flex: 1, borderTop: '1px dashed rgba(0,0,0,0.12)' }} />
      page {page}
      <span style={{ flex: 1, borderTop: '1px dashed rgba(0,0,0,0.12)' }} />
    </div>
  )
}
