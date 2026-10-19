import { useMemo } from 'react'
import { BookOpen, AlertTriangle } from 'lucide-react'
import { formatQuantite } from './dpgfLogique'
import { CadreLecture, ReperePage } from './CadreLecture'

// ─── Lecture d'un DPGF ───────────────────────────────────────────────────────
//
// Le tableau du DPGF tel qu'il a été lu : numéro, désignation, unité,
// quantité (jamais les prix). Les titres d'articles en gras selon leur
// niveau, les lignes de détail en retrait sous leur article. Une ligne
// numérotée reliée au CCTP du lot porte « CCTP » : la lecture du CCTP s'ouvre
// sur l'article (`onLireArticle`) ; celle qui n'a pas trouvé son article
// porte « Absent du CCTP », aux couleurs du bandeau qui les compte.
// `ligneId` : la ligne sur laquelle ouvrir.

// Numéro, désignation, unité, quantité ; plus serré sur tablette en portrait
const colonnes = (large) => (large ? '72px minmax(0, 1fr) 52px 120px' : '50px minmax(0, 1fr) 38px 64px')

export function LecteurDpgf({ piece, lignes = [], ligneId = null, lien = null, aCctp = false, grand = false, actions = null, onLireArticle, onFermer }) {
  const siennes = useMemo(
    () => lignes.filter((l) => l.piece_id === piece?.id).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [lignes, piece?.id],
  )
  // Un repère à chaque page qui commence (DPGF lu en PDF)
  const pages = useMemo(() => {
    const debut = new Set()
    let precedente = null
    for (const l of siennes) {
      if (l.page != null && l.page !== precedente) { if (precedente != null) debut.add(l.id); precedente = l.page }
    }
    return debut
  }, [siennes])
  const reperes = useMemo(() => siennes.map((l) => ({ id: l.id, niveau: l.numero ? l.niveau : null, page: l.page })), [siennes])
  const sommaire = useMemo(
    () => siennes.filter((l) => l.numero && (l.niveau ?? 1) <= 2).map((l) => ({ id: l.id, numero: l.numero, titre: l.designation, niveau: l.niveau ?? 1 })),
    [siennes],
  )
  // Articles du DPGF sans article de même numéro dans le CCTP du lot (sans
  // CCTP, rien n'est relié : le bandeau gris le dit une fois pour toutes)
  const nonRelies = useMemo(
    () => new Set(aCctp && lien ? siennes.filter((l) => l.numero && !lien.articleDeLigne.has(l.id)).map((l) => l.id) : []),
    [aCctp, lien, siennes],
  )

  return (
    <CadreLecture
      titre={piece?.titre ?? 'DPGF'}
      sousTitre={(page) => `${page ? `page ${page}${piece?.nb_pages ? ` / ${piece.nb_pages}` : ''} · ` : ''}DPGF · ${siennes.length} lignes${piece?.indice ? ` · indice ${piece.indice}` : ''}`}
      reperes={reperes} sommaire={sommaire} cibleId={ligneId} nomSommaire="Sommaire du DPGF"
      actions={actions} grand={grand} largeurFeuille={880} onFermer={onFermer}
    >
      {({ accent, inscrire, taille, large }) => (
        <>
          {nonRelies.size > 0 && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', padding: '8px 12px', fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              {nonRelies.size} article{nonRelies.size > 1 ? 's' : ''} du DPGF sans article correspondant dans le CCTP du lot (numérotation différente, ou article absent du CCTP), marqué{nonRelies.size > 1 ? 's' : ''} « Absent du CCTP » ci-dessous.
            </p>
          )}
          {!aCctp && siennes.length > 0 && (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9C9591' }}>Aucun CCTP importé pour ce lot : les lignes ne sont reliées à aucun article.</p>
          )}
          {siennes.length === 0 && <p style={{ margin: 0, fontSize: taille, color: '#9C9591' }}>Ce DPGF n’a aucune ligne.</p>}
          {siennes.length > 0 && (
            <div role="table" aria-label="Lignes du DPGF" style={{ fontSize: taille - 1, color: '#1F1B17' }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: colonnes(large), gap: 8, padding: '0 0 6px', borderBottom: '1px solid rgba(0,0,0,0.15)', fontSize: 11, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span role="columnheader">Art.</span><span role="columnheader">Désignation</span>
                <span role="columnheader">U</span><span role="columnheader" style={{ textAlign: 'right' }}>Qté</span>
              </div>
              {siennes.map((l) => {
                const niveau = l.niveau ?? 1
                const article = l.numero ? lien?.articleDeLigne.get(l.id) : null
                const cible = l.id === ligneId
                return (
                  <div key={l.id} ref={inscrire(l.id)}>
                    {pages.has(l.id) && <div style={{ marginTop: 10 }}><ReperePage page={l.page} /></div>}
                    <div role="row" style={{
                      display: 'grid', gridTemplateColumns: colonnes(large), gap: 8, alignItems: 'baseline',
                      padding: l.titre ? `${niveau === 1 ? 14 : 9}px 0 4px` : '4px 0',
                      borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                      ...(cible ? { background: '#FFF8E6', boxShadow: `inset 3px 0 0 ${accent}` } : {}),
                    }}>
                      <span role="cell" style={{ fontFamily: "'JetBrains Mono', monospace", color: accent, fontSize: taille - 2, paddingLeft: cible ? 6 : 0 }}>{l.numero ?? ''}</span>
                      <span role="cell" style={{
                        paddingLeft: l.numero ? 0 : 14, lineHeight: 1.45,
                        fontWeight: l.titre ? (niveau <= 2 ? 700 : 600) : 400,
                        fontSize: l.titre && niveau === 1 ? taille + 1 : undefined,
                        textTransform: l.titre && niveau === 1 ? 'uppercase' : undefined,
                      }}>
                        {l.designation}
                        {nonRelies.has(l.id) && (
                          <span title="Aucun article de ce numéro dans le CCTP du lot"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, padding: grand ? '5px 9px' : '1px 6px', border: '0.5px solid #F59E0B', borderRadius: 2, background: '#FFFBEB', color: '#92400E', fontSize: grand ? 12 : 10, fontWeight: 600, textTransform: 'none', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <AlertTriangle size={11} /> Absent du CCTP
                          </span>
                        )}
                        {article && onLireArticle && (
                          <button type="button" onClick={() => onLireArticle(article)} title="Lire cet article dans le CCTP"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, padding: grand ? '6px 10px' : '1px 6px', minHeight: 0, border: `0.5px solid ${accent}`, borderRadius: 2, background: 'white', color: accent, fontSize: grand ? 12 : 10, fontWeight: 600, textTransform: 'none', verticalAlign: 'middle', cursor: 'pointer' }}>
                            <BookOpen size={11} /> CCTP
                          </button>
                        )}
                      </span>
                      <span role="cell">{l.unite ?? ''}</span>
                      <span role="cell" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatQuantite(l)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </CadreLecture>
  )
}
