// ─── Comparaison de deux rendus d'une même page ──────────────────────────────
//
// L'allègement ne doit rien changer à ce qu'on voit. Les deux PDF sont rendus
// à la même résolution, puis comparés pixel par pixel.
//
// Deux niveaux d'écart :
//   · un écart **franc** (un trait présent d'un côté, absent de l'autre) —
//     aucun n'est admis ;
//   · un écart **d'anticrénelage** : regrouper des traits qui se touchent
//     change très légèrement l'adoucissement de leurs bords, sans qu'aucun
//     trait n'apparaisse ni ne disparaisse. Il est mesuré, pas bloquant.

export const SEUIL_FRANC = 128   // sur 255, pour la composante la plus touchée
export const SEUIL_LEGER = 24

/**
 * @param a, b Uint8ClampedArray RGBA de même taille
 * @returns { francs, legers, total, emprise: [x0, y0, x1, y1] | null }
 */
export function comparerPixels(a, b, largeur) {
  let francs = 0
  let legers = 0
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  const total = a.length / 4
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const d = Math.max(
      Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]),
    )
    if (d <= SEUIL_LEGER) continue
    if (d < SEUIL_FRANC) { legers++; continue }
    francs++
    const x = p % largeur
    const y = (p - x) / largeur
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { francs, legers, total, emprise: francs ? [x0, y0, x1, y1] : null }
}

/**
 * Verdict : une page est conforme si aucun pixel ne diffère franchement. Une
 * poussière de quelques pixels isolés (bruit du moteur de rendu) est tolérée.
 */
export function pageConforme({ francs, total }, tolerance = 1e-6) {
  return francs <= Math.max(4, total * tolerance)
}
