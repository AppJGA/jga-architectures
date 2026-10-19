import { useMemo, useState } from 'react'
import { Search, ChevronLeft, FileText, BookOpen } from 'lucide-react'
import { chercherArticles, extrait, motsRecherche, recomposerTexte } from './piecesLogique'
import { chercherLignesDpgf, formatQuantite, piecesParLot } from './dpgfLogique'
import { Surligne } from './Surligne'
import { LecturePiece } from './LecturePiece'

// ─── Recherche dans les pièces écrites ───────────────────────────────────────
//
// Commune au module (bureau) et au mode Visite (tablette) : un champ, un
// filtre par lot, les résultats groupés par pièce, mots surlignés. Toucher un
// article de CCTP l'ouvre en entier, puis « Lire dans le CCTP » le replace
// dans tout son document ; toucher une ligne de DPGF ouvre la lecture du DPGF
// sur elle. `grand` : tailles du mode Visite (doigt).

const MAX_RESULTATS = 60

export function RecherchePieces({ pieces = [], articles = [], lignes = [], grand = false, autoFocus = false }) {
  const [requete, setRequete] = useState('')
  const [lotId, setLotId] = useState('')
  const [ouvert, setOuvert] = useState(null)
  const [lecture, setLecture] = useState(null) // { type, pieceId, cibleId }

  const mots = useMemo(() => motsRecherche(requete), [requete])
  const resultats = useMemo(
    () => chercherArticles(articles, requete, { lotId: lotId || null }),
    [articles, requete, lotId],
  )
  const resultatsDpgf = useMemo(
    () => chercherLignesDpgf(lignes, requete, { lotId: lotId || null }),
    [lignes, requete, lotId],
  )
  const piecesParId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces])
  // Un lot par entrée du filtre, même s'il a un CCTP et un DPGF
  const lots = useMemo(() => piecesParLot(pieces).filter((t) => t.lotId), [pieces])

  const taille = grand ? 15 : 13
  const champ = {
    height: grand ? 48 : 38, padding: '0 12px', fontSize: grand ? 16 : 14, border: '0.5px solid rgba(0,0,0,0.18)',
    borderRadius: 3, background: 'white', color: '#1F1B17', boxSizing: 'border-box',
  }
  const lectureOuverte = lecture && (
    <LecturePiece pieces={pieces} articles={articles} lignes={lignes} depart={lecture} grand={grand} onFermer={() => setLecture(null)} />
  )

  if (ouvert) {
    const piece = piecesParId.get(ouvert.piece_id)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setOuvert(null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 4px', border: 'none', background: 'none', fontSize: taille, fontWeight: 600, color: '#5E5854', cursor: 'pointer' }}>
            <ChevronLeft size={18} /> Résultats
          </button>
          {piece && (
            <button type="button" onClick={() => setLecture({ type: 'cctp', pieceId: piece.id, cibleId: ouvert.id })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 14px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', fontSize: taille, fontWeight: 600, color: '#1F1B17', cursor: 'pointer' }}>
              <BookOpen size={16} /> Lire dans le CCTP
            </button>
          )}
        </div>
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
              ? <Surligne morceaux={extrait(recomposerTexte(ouvert.texte), mots, ouvert.texte.length + 1, ouvert.styles)} />
              : <em style={{ color: '#9C9591' }}>Titre de chapitre, sans texte propre : voir les articles qui suivent.</em>}
          </p>
        </div>
        {lectureOuverte}
      </div>
    )
  }

  // Résultats groupés par pièce : CCTP dans l'ordre de pertinence du premier
  // article de chaque groupe, puis DPGF dans l'ordre du document
  const groupes = []
  const index = new Map()
  const ranger = (pieceId, element) => {
    if (!index.has(pieceId)) { index.set(pieceId, groupes.length); groupes.push({ piece: piecesParId.get(pieceId), elements: [] }) }
    groupes[index.get(pieceId)].elements.push(element)
  }
  for (const r of resultats.slice(0, MAX_RESULTATS)) ranger(r.article.piece_id, { type: 'cctp', ...r })
  for (const r of resultatsDpgf.slice(0, MAX_RESULTATS)) ranger(r.ligne.piece_id, { type: 'dpgf', ...r })
  const total = resultats.length + resultatsDpgf.length
  const tronque = resultats.length > MAX_RESULTATS || resultatsDpgf.length > MAX_RESULTATS
  const carte = { width: '100%', textAlign: 'left', minHeight: 44, padding: grand ? '12px 14px' : '10px 12px', background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 2, cursor: 'pointer' }
  const numero = (n) => n && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8602C', marginRight: 6 }}>{n}</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={16} color="#9C9591" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="search" value={requete} onChange={(e) => setRequete(e.target.value)} autoFocus={autoFocus}
            placeholder="Chercher dans les CCTP et DPGF : « garde-corps », « classement feu porte »…"
            aria-label="Chercher dans les pièces écrites"
            style={{ ...champ, width: '100%', paddingLeft: 36 }}
          />
        </label>
        {lots.length > 1 && (
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lot" style={{ ...champ, flex: '0 1 240px', cursor: 'pointer' }}>
            <option value="">Tous les lots</option>
            {lots.map((t) => <option key={t.cle} value={t.lotId}>{t.titre}</option>)}
          </select>
        )}
      </div>

      {mots.length === 0 ? (
        <p style={{ margin: 0, fontSize: taille, color: '#9C9591' }}>
          {articles.length} article{articles.length > 1 ? 's' : ''}{lignes.length ? ` et ${lignes.length} ligne${lignes.length > 1 ? 's' : ''} de DPGF` : ''} dans {pieces.length} pièce{pieces.length > 1 ? 's' : ''}. Tapez un ou plusieurs mots : chaque mot doit figurer dans l’article ou la ligne.
        </p>
      ) : total === 0 ? (
        <p style={{ margin: 0, fontSize: taille, color: '#5E5854' }}>Aucun article ni ligne de DPGF ne contient tous ces mots.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 12, color: '#9C9591' }}>
            {[resultats.length && `${resultats.length} article${resultats.length > 1 ? 's' : ''}`, resultatsDpgf.length && `${resultatsDpgf.length} ligne${resultatsDpgf.length > 1 ? 's' : ''} de DPGF`].filter(Boolean).join(' · ')}
            {tronque ? ` — les ${MAX_RESULTATS} premiers de chaque sorte affichés, précisez la recherche` : ''}
          </p>
          {groupes.map(({ piece, elements }) => (
            <section key={piece?.id ?? 'x'}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 6px', fontSize: 12, fontWeight: 600, color: '#5E5854' }}>
                <FileText size={14} /> {piece?.titre ?? 'Pièce'}
                <span style={{ padding: '0 5px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 2, fontSize: 10, letterSpacing: '0.04em' }}>{(piece?.type ?? 'cctp').toUpperCase()}</span>
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {elements.map((r) => (r.type === 'cctp' ? (
                  <li key={r.article.id}>
                    <button type="button" onClick={() => setOuvert(r.article)} style={carte}>
                      <span style={{ display: 'block', fontSize: taille, fontWeight: 600, color: '#1F1B17' }}>
                        {numero(r.article.numero)}
                        <Surligne morceaux={extrait(r.article.titre, mots, r.article.titre.length + 1)} />
                        {r.article.page && <span style={{ fontWeight: 400, fontSize: 11, color: '#9C9591' }}> · p. {r.article.page}</span>}
                      </span>
                      {r.article.texte && (
                        <span style={{ display: 'block', marginTop: 4, fontSize: taille - 1, lineHeight: 1.5, color: '#5E5854' }}>
                          <Surligne morceaux={r.extrait} />
                        </span>
                      )}
                    </button>
                  </li>
                ) : (
                  <li key={r.ligne.id}>
                    <button type="button" onClick={() => setLecture({ type: 'dpgf', pieceId: r.ligne.piece_id, cibleId: r.ligne.id })}
                      style={{ ...carte, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: taille, color: '#1F1B17', fontWeight: r.ligne.titre ? 600 : 400 }}>
                        {numero(r.ligne.numero ?? r.ligne.article)}
                        <Surligne morceaux={r.extrait} />
                      </span>
                      {formatQuantite(r.ligne) && (
                        <span style={{ flexShrink: 0, fontSize: taille - 1, color: '#5E5854', fontVariantNumeric: 'tabular-nums' }}>
                          {formatQuantite(r.ligne)} {r.ligne.unite ?? ''}
                        </span>
                      )}
                    </button>
                  </li>
                )))}
              </ul>
            </section>
          ))}
        </>
      )}
      {lectureOuverte}
    </div>
  )
}
