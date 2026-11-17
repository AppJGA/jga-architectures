// ─── Géométrie de l'état des lieux ───────────────────────────────────────────
//
// Les contours sont en mètres, dans le repère du plan d'origine (y vers le
// haut) ; l'image d'un étage a son y vers le bas. `cadrage` fait le lien : la
// même fonction sert au dessin, aux gestes et à l'export.

export function aire(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function pointDansPolygone([x, y], pts) {
  let dedans = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

export function boite(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

export const dansBoite = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1

export function centre(pts) {
  const n = pts.length || 1
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
}

export function mediane(valeurs) {
  const s = [...valeurs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Au-delà, la surface dessinée et la surface écrite ne parlent plus de la
// même pièce (contour mal placé, ou échelle fausse si toutes s'écartent)
export const SEUIL_ECART = 0.05

export function ecartSurface(contour, surfaceLue) {
  if (!surfaceLue) return null
  return aire(contour) / surfaceLue - 1
}

// Toutes les pièces d'un étage s'écartent du même facteur : c'est l'échelle
// (unité du DXF, échelle du PDF) qui est fausse, pas les contours. La médiane
// ignore une pièce mal dessinée.
const SEUIL_ECHELLE = 0.15
const MIN_SURFACES_ECHELLE = 3

export function ecartEchelle(pieces) {
  const rapports = pieces
    .map((p) => ({ contour: p.contour, surface: Number(p.surface_lue ?? p.surfaceLue) }))
    .filter((p) => p.surface > 0 && p.contour?.length >= 3)
    .map((p) => aire(p.contour) / p.surface)
  if (rapports.length < MIN_SURFACES_ECHELLE) return null
  const r = mediane(rapports)
  return Math.abs(r - 1) > SEUIL_ECHELLE ? r : null
}

export function cadrage([x0, y0, x1, y1], { marge = 0.03, pxMax = 6000, pixelsMax = 16_000_000 } = {}) {
  const m = Math.max(x1 - x0, y1 - y0) * marge
  const b = [x0 - m, y0 - m, x1 + m, y1 + m]
  const largeurM = b[2] - b[0]
  const hauteurM = b[3] - b[1]
  const pxParMetre = Math.min(pxMax / Math.max(largeurM, hauteurM), Math.sqrt(pixelsMax / (largeurM * hauteurM)))
  return {
    x0: b[0], y0: b[1], x1: b[2], y1: b[3], pxParMetre,
    largeur: Math.round(largeurM * pxParMetre), hauteur: Math.round(hauteurM * pxParMetre),
  }
}

export const versPixels = (c, [x, y]) => [(x - c.x0) * c.pxParMetre, (c.y1 - y) * c.pxParMetre]
export const versMetres = (c, [px, py]) => [c.x0 + px / c.pxParMetre, c.y1 - py / c.pxParMetre]

// ─── Pièces superposées ──────────────────────────────────────────────────────
//
// Deux pièces ne se superposent jamais (règle de l'agence). ArchiCAD dessine
// pourtant des zones qui en regroupent d'autres (surfaces « SDO », tout
// l'étage) : on garde les plus petites, les vraies pièces. Au-delà de 5 %,
// ce n'est plus un mur partagé ou un arrondi de dessin.
export const SEUIL_SUPERPOSITION = 0.05
const ECHANTILLONS = 40

// Part de la surface de `a` recouverte par `b`, par échantillonnage : juste
// pour des pièces quelconques (en L, biaises) sans calcul d'intersection
export function partRecouverte(a, b) {
  const [ax0, ay0, ax1, ay1] = boite(a)
  const [bx0, by0, bx1, by1] = boite(b)
  if (bx0 >= ax1 || bx1 <= ax0 || by0 >= ay1 || by1 <= ay0) return 0
  let dansA = 0
  let dansLesDeux = 0
  for (let i = 0; i < ECHANTILLONS; i++) {
    for (let j = 0; j < ECHANTILLONS; j++) {
      const p = [ax0 + ((ax1 - ax0) * (i + 0.5)) / ECHANTILLONS, ay0 + ((ay1 - ay0) * (j + 0.5)) / ECHANTILLONS]
      if (!pointDansPolygone(p, a)) continue
      dansA++
      if (pointDansPolygone(p, b)) dansLesDeux++
    }
  }
  return dansA ? dansLesDeux / dansA : 0
}

export const seSuperposent = (a, b) => partRecouverte(a, b) > SEUIL_SUPERPOSITION || partRecouverte(b, a) > SEUIL_SUPERPOSITION

/** Garde les plus petites pièces ; une pièce qui en recouvre une déjà gardée est écartée. */
export function retirerSuperpositions(pieces) {
  const parTaille = pieces.map((p, i) => ({ p, i, a: aire(p.contour) })).sort((x, y) => x.a - y.a)
  const gardees = []
  const ecartees = []
  for (const x of parTaille) {
    if (gardees.some((g) => seSuperposent(x.p.contour, g.p.contour))) ecartees.push(x.p)
    else gardees.push(x)
  }
  return { gardees: gardees.sort((x, y) => x.i - y.i).map((x) => x.p), ecartees }
}

/** La première des `autres` pièces que `contour` chevaucherait, ou null. */
export const pieceChevauchee = (contour, autres) => autres.find((p) => seSuperposent(contour, p.contour)) ?? null

export const deplacerSommet = (contour, i, p) => contour.map((q, k) => (k === i ? p : q))
export const insererSommet = (contour, apres, p) => [...contour.slice(0, apres + 1), p, ...contour.slice(apres + 1)]
export const retirerSommet = (contour, i) => (contour.length <= 3 ? contour : contour.filter((_, k) => k !== i))
export const arrondirContour = (contour) => contour.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
