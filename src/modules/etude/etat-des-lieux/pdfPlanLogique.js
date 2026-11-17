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

// Mètres lus sur la feuille telle qu'elle est affichée (rotation de la page
// comprise), y vers le haut. Passer par le repère du PDF non pivoté
// (`convertToPdfPoint`) transposait contours et textes d'une page en /Rotate
// 90 : l'image découpée, elle, est la feuille affichée.
export function pointFeuilleEnMetres([px, py], { scale, hauteurPx, mpp }) {
  return [(px / scale) * mpp, ((hauteurPx - py) / scale) * mpp]
}

// Cadrage (geometrieEdl) de l'image découpée dans la feuille au cadre
// [x0, y0, x1, y1] en pixels de la feuille
export function cadrageDecoupe([x0, y0, x1, y1], feuille) {
  const [mx0, my0] = pointFeuilleEnMetres([x0, y1], feuille)
  const [mx1, my1] = pointFeuilleEnMetres([x1, y0], feuille)
  const largeur = Math.max(1, Math.round(x1 - x0))
  return {
    x0: mx0, y0: my0, x1: mx1, y1: my1,
    largeur, hauteur: Math.max(1, Math.round(y1 - y0)),
    pxParMetre: largeur / (mx1 - mx0),
  }
}
