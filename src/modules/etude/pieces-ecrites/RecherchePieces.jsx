import { useMemo, useState } from 'react'
import { Search, ChevronLeft, FileText } from 'lucide-react'
import { chercherArticles, extrait, motsRecherche } from './piecesLogique'

// ─── Recherche dans les CCTP ─────────────────────────────────────────────────
//
// Commune au module (bureau) et au mode Visite (tablette) : un champ, un
// filtre par lot, les résultats groupés par CCTP, mots surlignés ; toucher un
// résultat ouvre l'article entier. `grand` : tailles du mode Visite (doigt).

const MAX_RESULTATS = 60

// Mots trouvés surlignés ; gras, italique et souligné du CCTP d'origine
// gardés, pour distinguer titres, références et réserves comme sur le papier
function Surligne({ morceaux }) {
  return morceaux.map((m, i) => {
    const style = {
      fontWeight: m.gras ? 700 : undefined,
      fontStyle: m.italique ? 'italic' : undefined,
      textDecoration: m.souligne ? 'underline' : undefined,
    }
    return m.surligne
      ? <mark key={i} style={{ ...style, background: '#FDE68A', color: 'inherit', padding: 0 }}>{m.texte}</mark>
      : <span key={i} style={style}>{m.texte}</span>
  })
}

export function RecherchePieces({ pieces = [], articles = [], grand = false, autoFocus = false }) {
  const [requete, setRequete] = useState('')
  const [lotId, setLotId] = useState('')
  const [ouvert, setOuvert] = useState(null)

  const mots = useMemo(() => motsRecherche(requete), [requete])
  const resultats = useMemo(
    () => chercherArticles(articles, requete, { lotId: lotId || null }),
    [articles, requete, lotId],
  )
  const piecesParId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces])
  const lots = pieces.filter((p) => p.lot_id)

  const taille = grand ? 15 : 13
  const champ = {
    height: grand ? 48 : 38, padding: '0 12px', fontSize: grand ? 16 : 14, border: '0.5px solid rgba(0,0,0,0.18)',
    borderRadius: 3, background: 'white', color: '#1F1B17', boxSizing: 'border-box',
  }

  if (ouvert) {
    const piece = piecesParId.get(ouvert.piece_id)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button type="button" onClick={() => setOuvert(null)}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 4px', border: 'none', background: 'none', fontSize: taille, fontWeight: 600, color: '#5E5854', cursor: 'pointer' }}>
          <ChevronLeft size={18} /> Résultats
        </button>
        <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: grand ? 18 : 16 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {piece?.titre ?? 'CCTP'}{ouvert.page ? ` · page ${ouvert.page}` : ''}
          </p>
          <h3 style={{ margin: '6px 0 12px', fontSize: grand ? 18 : 16, fontWeight: 600, color: '#1F1B17' }}>
            {ouvert.numero && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8602C', marginRight: 8 }}>{ouvert.numero}</span>}
            <Surligne morceaux={extrait(ouvert.titre, mots, ouvert.titre.length + 1)} />
          </h3>
          <p style={{ margin: 0, fontSize: taille, lineHeight: 1.6, color: '#1F1B17', whiteSpace: 'pre-wrap' }}>
            {ouvert.texte
              ? <Surligne morceaux={extrait(ouvert.texte, mots, ouvert.texte.length + 1, ouvert.styles)} />
              : <em style={{ color: '#9C9591' }}>Titre de chapitre, sans texte propre : voir les articles qui suivent.</em>}
          </p>
        </div>
      </div>
    )
  }

  // Résultats groupés par CCTP, dans l'ordre de pertinence du premier de chaque groupe
  const affiches = resultats.slice(0, MAX_RESULTATS)
  const groupes = []
  const index = new Map()
  for (const r of affiches) {
    if (!index.has(r.article.piece_id)) { index.set(r.article.piece_id, groupes.length); groupes.push({ piece: piecesParId.get(r.article.piece_id), resultats: [] }) }
    groupes[index.get(r.article.piece_id)].resultats.push(r)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={16} color="#9C9591" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="search" value={requete} onChange={(e) => setRequete(e.target.value)} autoFocus={autoFocus}
            placeholder="Chercher dans les CCTP : « garde-corps », « classement feu porte »…"
            aria-label="Chercher dans les CCTP"
            style={{ ...champ, width: '100%', paddingLeft: 36 }}
          />
        </label>
        {lots.length > 1 && (
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lot" style={{ ...champ, flex: '0 1 240px', cursor: 'pointer' }}>
            <option value="">Tous les lots</option>
            {lots.map((p) => <option key={p.id} value={p.lot_id}>{p.titre}</option>)}
          </select>
        )}
      </div>

      {mots.length === 0 ? (
        <p style={{ margin: 0, fontSize: taille, color: '#9C9591' }}>
          {articles.length} article{articles.length > 1 ? 's' : ''} dans {pieces.length} CCTP. Tapez un ou plusieurs mots : chaque mot doit figurer dans l’article.
        </p>
      ) : resultats.length === 0 ? (
        <p style={{ margin: 0, fontSize: taille, color: '#5E5854' }}>Aucun article ne contient tous ces mots.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 12, color: '#9C9591' }}>
            {resultats.length} article{resultats.length > 1 ? 's' : ''}
            {resultats.length > MAX_RESULTATS ? ` — les ${MAX_RESULTATS} plus pertinents affichés, précisez la recherche` : ''}
          </p>
          {groupes.map(({ piece, resultats: liste }) => (
            <section key={piece?.id ?? 'x'}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 6px', fontSize: 12, fontWeight: 600, color: '#5E5854' }}>
                <FileText size={14} /> {piece?.titre ?? 'CCTP'}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {liste.map(({ article, extrait: morceaux }) => (
                  <li key={article.id}>
                    <button type="button" onClick={() => setOuvert(article)}
                      style={{ width: '100%', textAlign: 'left', minHeight: 44, padding: grand ? '12px 14px' : '10px 12px', background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 2, cursor: 'pointer' }}>
                      <span style={{ display: 'block', fontSize: taille, fontWeight: 600, color: '#1F1B17' }}>
                        {article.numero && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8602C', marginRight: 6 }}>{article.numero}</span>}
                        <Surligne morceaux={extrait(article.titre, mots, article.titre.length + 1)} />
                        {article.page && <span style={{ fontWeight: 400, fontSize: 11, color: '#9C9591' }}> · p. {article.page}</span>}
                      </span>
                      {article.texte && (
                        <span style={{ display: 'block', marginTop: 4, fontSize: taille - 1, lineHeight: 1.5, color: '#5E5854' }}>
                          <Surligne morceaux={morceaux} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
