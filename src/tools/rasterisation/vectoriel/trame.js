// ─── Trame de visibilité ─────────────────────────────────────────────────────
//
// Pour décider qu'un élément est caché, la page est ramenée à une grille de
// pixels (quelques pixels par point). Chaque zone — aplat ou découpe — y est
// décrite ligne par ligne par des intervalles de deux sortes :
//   · « possibles » : pixels que la zone touche, même d'un coin ;
//   · « sûrs » : pixels entièrement dans la zone.
// Un élément n'est déclaré caché que si tous les pixels qu'il pourrait toucher
// sont sûrement recouverts. Une grille grossière fait donc perdre du gain au
// bord des aplats, jamais de dessin.
//
// Intervalles : tableau plat [xa, xb, xa, xb, …] d'entiers, bornes comprises,
// triés et disjoints.

export const PIXELS_PAR_POINT = 2

// Au-delà, une zone est traitée comme illimitée : elle ne restreint rien et ne
// masque rien (un rectangle de découpe géant ne doit pas allouer des millions de lignes)
const LIGNES_MAX = 100000
// Marge autour des bords d'une zone, en pixels : couvre l'écart entre une
// courbe et son aplatissement en segments
const MARGE_BORD = 0.3
const TOLERANCE_COURBE = 0.2

export function fusionnerIntervalles(liste) {
  if (liste.length <= 2) return liste
  const paires = []
  for (let i = 0; i < liste.length; i += 2) paires.push([liste[i], liste[i + 1]])
  paires.sort((a, b) => a[0] - b[0])
  const res = [paires[0][0], paires[0][1]]
  for (let i = 1; i < paires.length; i++) {
    const [a, b] = paires[i]
    if (a <= res[res.length - 1] + 1) res[res.length - 1] = Math.max(res[res.length - 1], b)
    else res.push(a, b)
  }
  return res
}

export function intersecterIntervalles(a, b) {
  const res = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i], b[j]), hi = Math.min(a[i + 1], b[j + 1])
    if (lo <= hi) res.push(lo, hi)
    if (a[i + 1] < b[j + 1]) i += 2
    else j += 2
  }
  return res
}

export function soustraireIntervalles(a, b) {
  const res = []
  let j = 0
  for (let i = 0; i < a.length; i += 2) {
    let lo = a[i]
    const hi = a[i + 1]
    while (j < b.length && b[j + 1] < lo) j += 2
    let k = j
    while (k < b.length && b[k] <= hi) {
      if (b[k] > lo) res.push(lo, b[k] - 1)
      lo = Math.max(lo, b[k + 1] + 1)
      k += 2
    }
    if (lo <= hi) res.push(lo, hi)
  }
  return res
}

/**
 * Lignes d'un polygone convexe : pour chaque ligne de pixels, l'intervalle des
 * pixels dont le carré touche le polygone.
 */
export function parcourirConvexe(poly, rappel) {
  let y0 = Infinity, y1 = -Infinity
  for (const p of poly) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
  const n = poly.length
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
    const lo = Math.max(y, y0), hi = Math.min(y + 1, y1)
    let xmin = Infinity, xmax = -Infinity
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n]
      if (a[1] >= lo && a[1] <= hi) { if (a[0] < xmin) xmin = a[0]; if (a[0] > xmax) xmax = a[0] }
      if (a[1] === b[1]) continue
      for (const yy of [lo, hi]) {
        const t = (yy - a[1]) / (b[1] - a[1])
        if (t < 0 || t > 1) continue
        const x = a[0] + t * (b[0] - a[0])
        if (x < xmin) xmin = x
        if (x > xmax) xmax = x
      }
    }
    if (xmin <= xmax) rappel(y, Math.floor(xmin), Math.floor(xmax))
  }
}

/** Segment épaissi de `r` de chaque côté et à chaque bout (couvre les extrémités rondes ou carrées). */
export function quadSegment(a, b, r) {
  let dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 1e-9) return [[a[0] - r, a[1] - r], [a[0] + r, a[1] - r], [a[0] + r, a[1] + r], [a[0] - r, a[1] + r]]
  dx /= L; dy /= L
  const nx = -dy * r, ny = dx * r, ex = dx * r, ey = dy * r
  return [
    [a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny],
    [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny],
  ]
}

/** Rectangle englobant de points, élargi de `r` : quadrilatère convexe. */
export function rectangleAutour(points, r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [[x0 - r, y0 - r], [x1 + r, y0 - r], [x1 + r, y1 + r], [x0 - r, y1 + r]]
}

/** Points d'une courbe de Bézier (sans le point de départ), assez serrés pour la tolérance. */
export function aplatirCourbe(p0, p1, p2, p3, sortie, tolerance = TOLERANCE_COURBE) {
  const dd = Math.max(
    Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1]),
    Math.hypot(p1[0] - 2 * p2[0] + p3[0], p1[1] - 2 * p2[1] + p3[1]),
  )
  // Formule de Wang : nombre de segments garantissant l'écart maximal
  const n = Math.min(256, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tolerance))))
  for (let t = 1; t <= n; t++) {
    const u = t / n, v = 1 - u
    const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u
    sortie.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]])
  }
}

/**
 * Zone (aplat ou découpe) en intervalles par ligne.
 * @param sousChemins [[x, y], …][] en pixels, chacun implicitement fermé
 * @returns { illimitee, y0, possibles: intervalles[], surs: intervalles[] }
 */
export function zoneDe(sousChemins, pairImpair) {
  let ymin = Infinity, ymax = -Infinity
  for (const sc of sousChemins) for (const p of sc) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1] }
  if (!(ymin <= ymax)) return { illimitee: false, y0: 0, possibles: [], surs: [] }
  const y0 = Math.floor(ymin - MARGE_BORD)
  const hauteur = Math.floor(ymax + MARGE_BORD) - y0 + 1
  if (hauteur > LIGNES_MAX) return { illimitee: true }

  const aretes = []
  for (const sc of sousChemins) {
    for (let i = 0; i < sc.length; i++) {
      const a = sc[i], b = sc[(i + 1) % sc.length]
      if (a[0] !== b[0] || a[1] !== b[1]) aretes.push([a, b])
    }
  }

  // Pixels dont le centre est dans la zone, selon la règle de remplissage
  const centres = new Array(hauteur)
  for (let j = 0; j < hauteur; j++) {
    const cy = y0 + j + 0.5
    const croisements = []
    for (const [a, b] of aretes) {
      if ((a[1] <= cy) === (b[1] <= cy)) continue
      croisements.push([a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), a[1] < b[1] ? 1 : -1])
    }
    croisements.sort((p, q) => p[0] - q[0])
    const lignes = []
    let enroulement = 0
    for (let k = 0; k < croisements.length - 1; k++) {
      enroulement += croisements[k][1]
      const dedans = pairImpair ? k % 2 === 0 : enroulement !== 0
      if (!dedans) continue
      const xa = Math.ceil(croisements[k][0] - 0.5)
      const xb = Math.floor(croisements[k + 1][0] - 0.5)
      if (xa <= xb) lignes.push(xa, xb)
    }
    centres[j] = fusionnerIntervalles(lignes)
  }

  // Pixels traversés par un bord : ni sûrement dedans, ni sûrement dehors
  const bords = Array.from({ length: hauteur }, () => [])
  for (const [a, b] of aretes) {
    parcourirConvexe(quadSegment(a, b, MARGE_BORD), (y, xa, xb) => {
      const j = y - y0
      if (j >= 0 && j < hauteur) bords[j].push(xa, xb)
    })
  }

  const possibles = new Array(hauteur)
  const surs = new Array(hauteur)
  for (let j = 0; j < hauteur; j++) {
    const b = fusionnerIntervalles(bords[j])
    possibles[j] = fusionnerIntervalles([...centres[j], ...b])
    surs[j] = soustraireIntervalles(centres[j], b)
  }
  return { illimitee: false, y0, possibles, surs }
}

export function ligneDeZone(zone, y, genre) {
  const j = y - zone.y0
  const lignes = genre === 'sur' ? zone.surs : zone.possibles
  return j >= 0 && j < lignes.length ? lignes[j] : []
}

// ── Pixels recouverts, par blocs alloués à la demande ──────────────────────────

const BLOC = 64

export class Occultation {
  constructor() { this.blocs = new Map() }

  bloc(bx, by, creer) {
    const cle = by * 1048576 + bx
    let b = this.blocs.get(cle)
    if (!b && creer) { b = new Uint8Array(BLOC * BLOC); this.blocs.set(cle, b) }
    return b
  }

  marquer(y, xa, xb) {
    if (y < 0 || xb < 0) return
    const by = Math.floor(y / BLOC), ly = (y - by * BLOC) * BLOC
    for (let x = Math.max(0, xa); x <= xb;) {
      const bx = Math.floor(x / BLOC)
      const fin = Math.min(xb, (bx + 1) * BLOC - 1)
      const b = this.bloc(bx, by, true)
      b.fill(1, ly + x - bx * BLOC, ly + fin - bx * BLOC + 1)
      x = fin + 1
    }
  }

  /** Au moins un pixel de l'intervalle n'est pas recouvert ? */
  libreDans(y, xa, xb) {
    if (y < 0 || xa < 0) return true
    const by = Math.floor(y / BLOC), ly = (y - by * BLOC) * BLOC
    for (let x = xa; x <= xb;) {
      const bx = Math.floor(x / BLOC)
      const fin = Math.min(xb, (bx + 1) * BLOC - 1)
      const b = this.bloc(bx, by, false)
      if (!b) return true
      for (let i = ly + x - bx * BLOC, f = ly + fin - bx * BLOC; i <= f; i++) if (!b[i]) return true
      x = fin + 1
    }
    return false
  }
}
