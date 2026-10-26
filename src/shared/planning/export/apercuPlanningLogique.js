// ─── Aperçu des PDF de planning : calculs sans navigateur ────────────────────

export const PX_PAR_MM = 96 / 25.4

// Au-delà, l'aperçu cesse de tracer les sauts : un planning de cinquante pages
// n'a plus besoin d'être compté au trait près
const SAUTS_MAX = 50

/**
 * Sauts de page d'un document affiché d'un seul tenant, en pixels depuis le
 * haut de la page. La feuille imprimée garde `margeMm` en haut et en bas.
 * Estimation : à l'impression, l'en-tête du tableau se répète sur chaque page
 * et une ligne n'est pas coupée, les sauts réels arrivent un peu plus tôt.
 */
export function sautsDePage(hauteurPx, hauteurPageMm, margeMm = 10) {
  const marge = margeMm * PX_PAR_MM
  const utile = (hauteurPageMm - 2 * margeMm) * PX_PAR_MM
  if (!(utile > 0) || !(hauteurPx > 0)) return []
  const contenu = hauteurPx - 2 * marge
  const sauts = []
  // Un pixel de tolérance : un contenu de la hauteur exacte tient sur une page
  for (let y = utile; y < contenu - 1 && sauts.length < SAUTS_MAX; y += utile) sauts.push(marge + y)
  return sauts
}

/** Libellé du nombre de pages, approché dès qu'il y en a plus d'une. */
export function libellePages(n) {
  return n === 1 ? 'tient sur une page' : `environ ${n} pages`
}
