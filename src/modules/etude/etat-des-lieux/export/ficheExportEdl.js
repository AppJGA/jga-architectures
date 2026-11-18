// ─── Fiche d'une pièce et HSP : une seule règle pour le DXF et le rapport ────
//
// Le DXF et le PDF lisaient la fiche chacun à leur façon : le PDF imprimait
// une fiche proposée par l'analyse que le DXF laissait de côté, et donnait la
// HSP dite en visite avant celle du plan quand le DXF faisait l'inverse. Les
// deux exports passent désormais par ici. Pur, testé
// (tests/etat-des-lieux-export-pdf.test.js et …-export-dxf.test.js).

/** Fiche proposée par l'analyse, pas encore relue, et laissée hors de l'export. */
export const ficheEcartee = (piece, { inclurePropositions = false } = {}) => !!piece?.fiche_a_valider && !inclurePropositions

/** La fiche telle qu'elle part dans l'export : vide (null) si elle est écartée. */
export function ficheExportee(piece, options = {}) {
  if (ficheEcartee(piece, options)) return null
  const fiche = piece?.fiche
  return fiche && typeof fiche === 'object' ? fiche : null
}

const virgule = (v) => v.toFixed(2).replace('.', ',')

/**
 * HSP de la pièce : lue sur le plan d'abord (mesure du géomètre ou de la
 * zone ArchiCAD), sinon dite en visite — à condition que la fiche parte.
 * Un nombre seul (« 2,7 », « 2.70 ») s'écrit « 2,70 m », comme la HSP lue ;
 * un texte dicté (« 2,40 m sous poutre ») reste tel quel.
 *
 * @returns { texte, lue } ou null ; `lue` vrai si elle vient du plan
 */
export function hspExport(piece, options = {}) {
  const lue = Number(piece?.hsp_lue)
  if (piece?.hsp_lue != null && piece.hsp_lue !== '' && Number.isFinite(lue) && lue > 0) return { texte: `${virgule(lue)} m`, lue: true }
  const dite = String(ficheExportee(piece, options)?.hsp ?? '').replace(/\s+/g, ' ').trim()
  if (!dite) return null
  if (/^\d+(?:[.,]\d+)?$/.test(dite)) return { texte: `${virgule(Number(dite.replace(',', '.')))} m`, lue: false }
  return { texte: dite, lue: false }
}
