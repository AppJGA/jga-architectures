// ─── Géométrie plane pour l'allègement des plans ─────────────────────────────
//
// Matrices de transformation PDF [a b c d e f]. La décision « caché ou non »
// se prend sur une trame de pixels (`trame.js`).

export const IDENTITE = [1, 0, 0, 1, 0, 0]

// Produit m × n au sens PDF : appliquer n puis m revient à `multiplier(n, m)`.
// Ici `concat(ctm, cm)` donne la nouvelle matrice courante après `cm`.
export function concat(ctm, m) {
  return [
    m[0] * ctm[0] + m[1] * ctm[2], m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2], m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4], m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
  ]
}

export function appliquer(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}
