// ─── Un plan en PDF ──────────────────────────────────────────────────────────
//
// Un PDF vectorisé est dessiné au papier : 1 point = 1/72 de pouce. À
// l'échelle du cartouche (« Echelle:1/100° »), on sait combien de mètres vaut
// un point. Un PDF sans chemins dessinés est un scan : refusé (pas de pièces
// fiables, pas d'export DXF possible).

export function lireEchelle(textes) {
  for (const t of textes) {
    // Les accents sont retirés (« ÉCHELLE » et « Echelle » doivent se lire pareil)
    const sansAccents = String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    const m = sansAccents.match(/ECHELLE\s*:?\s*1\s*\/\s*(\d{1,4})/)
    if (m) return Number(m[1])
  }
  return null
}

export const METRES_PAR_POINT = 0.0254 / 72
export const metresParPoint = (echelle) => METRES_PAR_POINT * echelle

export const MIN_CHEMINS_VECTORIELS = 30

export function compterChemins(fnArray, OPS) {
  let n = 0
  for (const f of fnArray) if (f === OPS.constructPath) n++
  return n
}

export const estVectoriel = (fnArray, OPS) => compterChemins(fnArray, OPS) >= MIN_CHEMINS_VECTORIELS
