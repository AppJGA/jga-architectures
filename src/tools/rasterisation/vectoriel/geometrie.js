// ─── Géométrie plane pour l'allègement des plans ─────────────────────────────
//
// Matrices de transformation PDF [a b c d e f] et polygones en coordonnées de
// page. Tout ce qui décide qu'un trait est caché passe par ici, et reste
// prudent : dans le doute, un élément est considéré visible.

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

// Facteur d'échelle d'une épaisseur de trait : racine du déterminant
export function echelle(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
}

/** Polygone convexe (sommets dans l'ordre, sens quelconque, pas de doublon parasite). */
export function estConvexe(poly) {
  const n = poly.length
  if (n < 3) return false
  let signe = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    const [x2, y2] = poly[(i + 2) % n]
    const z = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1)
    if (Math.abs(z) < 1e-9) continue
    const s = Math.sign(z)
    if (signe === 0) signe = s
    else if (s !== signe) return false
  }
  return signe !== 0
}

/**
 * Point dans un polygone convexe, bord compris avec une petite tolérance. La
 * convexité est vérifiée en amont : un polygone non convexe n'arrive pas ici.
 */
export function dansConvexe(p, poly) {
  const n = poly.length
  let signe = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    const z = (x1 - x0) * (p[1] - y0) - (y1 - y0) * (p[0] - x0)
    if (Math.abs(z) < 1e-7) continue
    const s = Math.sign(z)
    if (signe === 0) signe = s
    else if (s !== signe) return false
  }
  return true
}

/** Emprise [xmin, ymin, xmax, ymax] d'un ensemble de points. */
export function emprise(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/**
 * Retire les sommets répétés (un contour fermé repasse souvent par son point
 * de départ) : la convexité se juge sur les sommets distincts.
 */
export function sommetsDistincts(points) {
  const res = []
  for (const p of points) {
    const q = res[res.length - 1]
    if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) res.push(p)
  }
  if (res.length > 1) {
    const a = res[0], b = res[res.length - 1]
    if (Math.abs(a[0] - b[0]) <= 1e-6 && Math.abs(a[1] - b[1]) <= 1e-6) res.pop()
  }
  return res
}
