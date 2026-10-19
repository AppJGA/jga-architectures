import { useMemo } from 'react'
import { extrait, lectureCctp, recomposerTexte } from './piecesLogique'
import { formatQuantite } from './dpgfLogique'
import { Surligne } from './Surligne'
import { CadreLecture, ReperePage } from './CadreLecture'

// ─── Lecture d'un CCTP d'un bout à l'autre ───────────────────────────────────
//
// Le PDF n'est pas gardé (seul le texte l'est, stockage plafonné) : on lit le
// texte remis en page, articles à la suite, repères de page et sommaire.
// Ouvert depuis la tuile d'un lot ou depuis un article trouvé (`articleId` :
// la lecture s'ouvre sur lui). Sous chaque article, ses lignes du DPGF du
// même lot (`lignesParArticle`, calculé par `lienCctpDpgf`).

// Une ligne titre qui ne fait que répéter l'article (même numéro, ni
// quantité ni « PM ») n'apprend rien sous lui
const utile = (l) => !(l.titre && l.numero && !l.quantite_texte)

function LignesDpgf({ lignes, taille }) {
  const visibles = lignes.filter(utile)
  if (!visibles.length) return null
  return (
    <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse', background: '#F5F3EF', fontSize: taille - 2, color: '#3A3530' }}>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '0 0 3px', fontSize: 10, fontWeight: 600, color: '#9C9591', letterSpacing: '0.06em' }}>DPGF</caption>
      <tbody>
        {visibles.map((l) => (
          <tr key={l.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
            <td style={{ padding: '4px 8px', fontWeight: l.titre ? 600 : 400 }}>
              {l.numero && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#9C9591', marginRight: 6 }}>{l.numero}</span>}
              {l.designation}
            </td>
            <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', width: 1 }}>{l.unite ?? ''}</td>
            <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', width: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatQuantite(l)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function LecteurCctp({ piece, articles = [], articleId = null, lignesParArticle = null, grand = false, actions = null, onFermer }) {
  const { blocs, sommaire } = useMemo(() => lectureCctp(articles, piece?.id), [articles, piece?.id])
  const reperes = useMemo(() => blocs.map(({ article }) => ({ id: article.id, niveau: article.niveau ?? 1, page: article.page })), [blocs])

  return (
    <CadreLecture
      titre={piece?.titre ?? 'CCTP'}
      sousTitre={(page) => `${page ? `page ${page}${piece?.nb_pages ? ` / ${piece.nb_pages}` : ''} · ` : ''}CCTP · ${blocs.length} articles${piece?.indice ? ` · indice ${piece.indice}` : ''}`}
      reperes={reperes} sommaire={sommaire} cibleId={articleId} nomSommaire="Sommaire du CCTP"
      actions={actions} grand={grand} onFermer={onFermer}
    >
      {({ accent, inscrire, taille }) => (
        <>
          {blocs.length === 0 && <p style={{ margin: 0, fontSize: taille, color: '#9C9591' }}>Ce CCTP n’a aucun article.</p>}
          {blocs.map(({ article, page }, k) => {
            const niveau = article.niveau ?? 1
            const cible = article.id === articleId
            return (
              <section key={article.id} ref={inscrire(article.id)} style={{ marginTop: k === 0 ? 0 : niveau === 1 ? 28 : 16 }}>
                {page != null && k > 0 && <ReperePage page={page} />}
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
                  {lignesParArticle?.get(article.id) && <LignesDpgf lignes={lignesParArticle.get(article.id)} taille={taille} />}
                </div>
              </section>
            )
          })}
        </>
      )}
    </CadreLecture>
  )
}
