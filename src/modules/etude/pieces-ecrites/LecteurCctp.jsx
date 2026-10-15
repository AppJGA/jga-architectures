import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, List, X } from 'lucide-react'
import { extrait, lectureCctp, recomposerTexte } from './piecesLogique'
import { Surligne } from './Surligne'

// ─── Lecture d'un CCTP d'un bout à l'autre ───────────────────────────────────
//
// Le PDF n'est pas gardé (seul le texte l'est, stockage plafonné) : on lit le
// texte remis en page, articles à la suite, repères de page et sommaire.
// Ouvert depuis la tuile d'un CCTP ou depuis un article trouvé (`articleId` :
// la lecture s'ouvre sur lui). Plein écran par un portail : une fenêtre
// `fixed` sous une carte animée resterait prise dans la carte.

const LARGE = '(min-width: 900px)'

export function LecteurCctp({ piece, articles = [], articleId = null, grand = false, onFermer }) {
  const { blocs, sommaire } = useMemo(() => lectureCctp(articles, piece?.id), [articles, piece?.id])
  const ancre = useRef(null)
  const defilement = useRef(null)
  const elements = useRef(new Map())
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

  const allerA = useCallback((id, comportement = 'smooth') => {
    const cible = elements.current.get(id)
    const boite = defilement.current
    if (!cible || !boite) return
    boite.scrollTo({ top: cible.offsetTop - 16, behavior: comportement })
  }, [])

  useLayoutEffect(() => { if (articleId) allerA(articleId, 'auto') }, [articleId, allerA])

  // Chapitre et page à hauteur du haut de l'écran : sommaire et en-tête suivent
  const suivreLecture = useCallback(() => {
    const boite = defilement.current
    if (!boite) return
    const seuil = boite.scrollTop + 40
    let id = null
    let page = null
    for (const { article } of blocs) {
      const el = elements.current.get(article.id)
      if (!el || el.offsetTop > seuil) break
      if ((article.niveau ?? 1) <= 2) id = article.id
      if (article.page != null) page = article.page
    }
    setCourant((c) => (c.id === id && c.page === page ? c : { id, page }))
  }, [blocs])
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
  const navigation = useRef(null)
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

  const listeSommaire = (
    <nav ref={navigation} aria-label="Sommaire du CCTP" style={{
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
  )

  return (
    <>
      <span ref={ancre} hidden />
      {createPortal(
        <div role="dialog" aria-modal="true" aria-label={piece?.titre ?? 'CCTP'}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#EDE8DF', display: 'flex', flexDirection: 'column' }}>
          {/* App installée sur l'iPad : la barre d'état passe par-dessus */}
          <div style={{ height: 'env(safe-area-inset-top)', background: '#1F1B17', flexShrink: 0 }} />
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 16px', background: '#1F1B17', color: '#F5F1E9', flexShrink: 0 }}>
            <FileText size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{piece?.titre ?? 'CCTP'}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(245,241,233,0.65)' }}>
                {courant.page ? `page ${courant.page}${piece?.nb_pages ? ` / ${piece.nb_pages}` : ''} · ` : ''}
                {blocs.length} articles{piece?.indice ? ` · indice ${piece.indice}` : ''}
              </p>
            </div>
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
            {afficherSommaire && listeSommaire}
            <div ref={defilement} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: large ? '24px 24px 80px' : '12px 8px 80px', position: 'relative' }}>
              <article style={{
                maxWidth: 760, margin: '0 auto', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                padding: large ? '40px 56px 56px' : '20px 18px 32px', boxSizing: 'border-box',
              }}>
                {blocs.length === 0 && <p style={{ margin: 0, fontSize: taille, color: '#9C9591' }}>Ce CCTP n’a aucun article.</p>}
                {blocs.map(({ article, page }, k) => {
                  const niveau = article.niveau ?? 1
                  const cible = article.id === articleId
                  return (
                    <section key={article.id} ref={(el) => { if (el) elements.current.set(article.id, el); else elements.current.delete(article.id) }}
                      style={{ marginTop: k === 0 ? 0 : niveau === 1 ? 28 : 16 }}>
                      {page != null && k > 0 && (
                        <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', color: '#B5AEA8', fontSize: 11 }}>
                          <span style={{ flex: 1, borderTop: '1px dashed rgba(0,0,0,0.12)' }} />
                          page {page}
                          <span style={{ flex: 1, borderTop: '1px dashed rgba(0,0,0,0.12)' }} />
                        </div>
                      )}
                      <div style={cible ? { margin: '0 -12px', padding: '8px 12px', background: '#FFF8E6', borderLeft: `3px solid ${accent}` } : undefined}>
                      <h3 style={{
                        margin: '0 0 6px', color: '#1F1B17', lineHeight: 1.35,
                        fontSize: niveau === 1 ? taille + 3 : niveau === 2 ? taille + 1 : taille,
                        fontWeight: niveau <= 2 ? 700 : 600,
                        textTransform: niveau === 1 ? 'uppercase' : undefined,
                      }}>
                        {article.numero && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: accent, marginRight: 8 }}>{article.numero}</span>}
                        {article.titre}
                      </h3>
                      {article.texte && (
                        <p style={{ margin: 0, fontSize: taille, lineHeight: 1.6, color: '#1F1B17', whiteSpace: 'pre-wrap' }}>
                          <Surligne morceaux={extrait(recomposerTexte(article.texte), [], article.texte.length + 1, article.styles)} />
                        </p>
                      )}
                      </div>
                    </section>
                  )
                })}
              </article>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
