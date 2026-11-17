// ─── Les couloirs : ce qui reste des zones englobantes ───────────────────────
//
// Dans un modèle ArchiCAD, chaque pièce a sa zone (tampon « SU »), mais les
// circulations n'ont souvent pas de zone à elles : elles n'existent que dans
// les grandes zones « SDO » qui regroupent une suite de numéros. Ces zones
// sont écartées (deux pièces ne se superposent jamais) ; leur reste — la zone
// moins les pièces qu'elle contient — est le couloir. Chaque morceau de reste
// qui porte un nom écrit sur le calque des désignations devient une pièce ;
// un reste sans nom (liseré entre deux pièces) est ignoré.
//
// Calcul sur une grille (10 cm) plutôt que par différence de polygones :
// simple, sûr pour des pièces quelconques, et la précision suffit — le
// contour se corrige à l'écran comme les autres.

import { aire, boite, pointDansPolygone } from './geometrieEdl'
import { CALQUE_DESIGNATION, estNom, lireNumero } from './piecesDxfLogique'

const PAS = 0.1
const AIRE_MIN = 0.5
const CELLULES_MAX = 2_000_000
// Un nom posé à cheval sur un trait : on cherche la case libre la plus
// proche dans ce rayon (en cases)
const RAYON_ETIQUETTE = 6

const premiereLigne = (t) => t.split('\n')[0].trim()

export function piecesDesRestes(conteneurs, gardees, textes, { pas = PAS } = {}) {
  const noms = textes.filter((t) => CALQUE_DESIGNATION.test(t.calque ?? '') && estNom(t.texte))
  const numeros = textes
    .map((t) => ({ pos: t.pos, numero: t.texte.split('\n').map(lireNumero).find(Boolean) ?? null }))
    .filter((t) => t.numero)
  const occupees = [...gardees]
  const nomsPris = new Set()
  const crees = []

  // Des plus petites aux plus grandes : une zone déjà traitée bloque les
  // plus grandes qui la contiennent, son couloir n'est pas repris deux fois
  for (const zone of [...conteneurs].sort((a, b) => aire(a.contour) - aire(b.contour))) {
    const grille = grilleLibre(zone, occupees, pas)
    if (grille) {
      // Un nom écrit dans une pièce déjà retenue (près de son mur) est le sien,
      // pas celui du couloir voisin
      const etiquettes = noms
        .filter((t) => !nomsPris.has(t) && pointDansPolygone(t.pos, zone.contour))
        .filter((t) => !occupees.some((p) => pointDansPolygone(t.pos, p.contour)))
        .map((t) => ({ t, cellule: celluleLibreProche(grille, t.pos) }))
        .filter((e) => e.cellule >= 0)
      for (const { etiquette, cellules } of regionsNommees(grille, etiquettes)) {
        if (cellules.length * pas * pas < AIRE_MIN) continue
        const contour = tracerContour(grille, cellules)
        if (contour.length < 3) continue
        const piece = {
          nom: premiereLigne(etiquette.t.texte),
          numero: numeroDansRegion(grille, cellules, numeros, etiquette.t.pos),
          surfaceLue: null, hspLue: null,
          calque: zone.calque, bloc: zone.bloc ?? null,
          contour,
        }
        crees.push(piece)
        occupees.push(piece)
        nomsPris.add(etiquette.t)
      }
    }
    occupees.push(zone)
  }
  return crees
}

function grilleLibre(zone, occupees, pas) {
  const [x0, y0, x1, y1] = boite(zone.contour)
  const nx = Math.max(1, Math.ceil((x1 - x0) / pas))
  const ny = Math.max(1, Math.ceil((y1 - y0) / pas))
  if (nx * ny > CELLULES_MAX) return null
  const libre = new Uint8Array(nx * ny)
  const occupe = new Uint8Array(nx * ny) // cases d'une pièce voisine
  const centre = (i, j) => [x0 + (i + 0.5) * pas, y0 + (j + 0.5) * pas]
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (pointDansPolygone(centre(i, j), zone.contour)) libre[j * nx + i] = 1
  for (const p of occupees) {
    const [px0, py0, px1, py1] = boite(p.contour)
    if (px1 <= x0 || px0 >= x1 || py1 <= y0 || py0 >= y1) continue
    const i0 = Math.max(0, Math.floor((px0 - x0) / pas)), i1 = Math.min(nx - 1, Math.ceil((px1 - x0) / pas))
    const j0 = Math.max(0, Math.floor((py0 - y0) / pas)), j1 = Math.min(ny - 1, Math.ceil((py1 - y0) / pas))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i
        if (!occupe[k] && pointDansPolygone(centre(i, j), p.contour)) { occupe[k] = 1; libre[k] = 0 }
      }
    }
  }
  return { x0, y0, nx, ny, pas, libre: eroder(libre, occupe, nx, ny) }
}

// Une case de marge le long des pièces voisines (pas le long de la façade) :
// le contour en marches de la grille ne mord pas sur elles — jamais deux
// pièces superposées
function eroder(libre, occupe, nx, ny) {
  const reste = new Uint8Array(libre)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!libre[j * nx + i]) continue
      voisins: for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const vi = i + di, vj = j + dj
          if (vi < 0 || vj < 0 || vi >= nx || vj >= ny) continue
          if (occupe[vj * nx + vi]) { reste[j * nx + i] = 0; break voisins }
        }
      }
    }
  }
  return reste
}

function celluleLibreProche({ x0, y0, nx, ny, pas, libre }, [x, y]) {
  const ci = Math.floor((x - x0) / pas)
  const cj = Math.floor((y - y0) / pas)
  let meilleure = -1
  let distance = Infinity
  for (let dj = -RAYON_ETIQUETTE; dj <= RAYON_ETIQUETTE; dj++) {
    for (let di = -RAYON_ETIQUETTE; di <= RAYON_ETIQUETTE; di++) {
      const i = ci + di, j = cj + dj
      if (i < 0 || j < 0 || i >= nx || j >= ny || !libre[j * nx + i]) continue
      const d = di * di + dj * dj
      if (d < distance) { distance = d; meilleure = j * nx + i }
    }
  }
  return meilleure
}

// Morceaux de reste (cases libres voisines) qui portent au moins un nom ;
// un morceau à plusieurs noms est partagé : chaque case va au nom le plus proche
function regionsNommees(grille, etiquettes) {
  const { nx, ny, pas, x0, y0, libre } = grille
  const composante = new Int32Array(nx * ny).fill(-1)
  const regions = []
  for (const e of etiquettes) {
    if (composante[e.cellule] >= 0) continue
    const id = regions.length
    const cellules = []
    const pile = [e.cellule]
    composante[e.cellule] = id
    while (pile.length) {
      const k = pile.pop()
      cellules.push(k)
      const i = k % nx, j = (k - i) / nx
      for (const [vi, vj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (vi < 0 || vj < 0 || vi >= nx || vj >= ny) continue
        const v = vj * nx + vi
        if (libre[v] && composante[v] < 0) { composante[v] = id; pile.push(v) }
      }
    }
    regions.push(cellules)
  }
  const resultat = []
  regions.forEach((cellules, id) => {
    const siennes = etiquettes.filter((e) => composante[e.cellule] === id)
    if (siennes.length === 1) { resultat.push({ etiquette: siennes[0], cellules }); return }
    const parts = siennes.map(() => [])
    for (const k of cellules) {
      const i = k % nx, j = (k - i) / nx
      const cx = x0 + (i + 0.5) * pas, cy = y0 + (j + 0.5) * pas
      let m = 0
      let d = Infinity
      siennes.forEach((e, n) => {
        const dd = (e.t.pos[0] - cx) ** 2 + (e.t.pos[1] - cy) ** 2
        if (dd < d) { d = dd; m = n }
      })
      parts[m].push(k)
    }
    siennes.forEach((e, n) => resultat.push({ etiquette: e, cellules: parts[n] }))
  })
  return resultat
}

function numeroDansRegion({ x0, y0, nx, ny, pas }, cellules, numeros, [lx, ly]) {
  const dedans = new Set(cellules)
  let choisi = null
  let distance = Infinity
  for (const n of numeros) {
    const i = Math.floor((n.pos[0] - x0) / pas), j = Math.floor((n.pos[1] - y0) / pas)
    if (i < 0 || j < 0 || i >= nx || j >= ny || !dedans.has(j * nx + i)) continue
    const d = (n.pos[0] - lx) ** 2 + (n.pos[1] - ly) ** 2
    if (d < distance) { distance = d; choisi = n.numero }
  }
  return choisi
}

// Contour extérieur d'un ensemble de cases : côtés de bord orientés (la
// région à gauche), enchaînés en boucles ; la plus grande est le contour
function tracerContour({ x0, y0, nx, pas }, cellules) {
  const dedans = new Set(cellules)
  const a = (i, j) => dedans.has(j * nx + i) && i >= 0 && i < nx
  const suivants = new Map()
  const ajouter = (de, vers) => {
    const cle = `${de[0]},${de[1]}`
    if (!suivants.has(cle)) suivants.set(cle, [])
    suivants.get(cle).push(vers)
  }
  for (const k of cellules) {
    const i = k % nx, j = (k - i) / nx
    if (!a(i, j - 1)) ajouter([i, j], [i + 1, j])
    if (!a(i + 1, j)) ajouter([i + 1, j], [i + 1, j + 1])
    if (!a(i, j + 1)) ajouter([i + 1, j + 1], [i, j + 1])
    if (!a(i - 1, j)) ajouter([i, j + 1], [i, j])
  }
  let meilleure = []
  let aireMax = 0
  for (const [cleDepart, liste] of suivants) {
    while (liste.length) {
      const boucle = []
      let courant = cleDepart.split(',').map(Number)
      let prochain = liste.pop()
      boucle.push(courant)
      while (prochain && `${prochain[0]},${prochain[1]}` !== cleDepart) {
        boucle.push(prochain)
        courant = prochain
        prochain = suivants.get(`${courant[0]},${courant[1]}`)?.pop()
      }
      const surface = aire(boucle)
      if (surface > aireMax) { aireMax = surface; meilleure = boucle }
    }
  }
  const enMetres = meilleure.map(([i, j]) => [x0 + i * pas, y0 + j * pas])
  return simplifier(enMetres, pas * 0.6)
}

// Douglas-Peucker sur un contour fermé : les marches de la grille le long
// d'un mur biais redeviennent une droite
function simplifier(pts, tolerance) {
  if (pts.length < 4) return pts
  let loin = 0
  let dMax = -1
  pts.forEach((p, i) => {
    const d = (p[0] - pts[0][0]) ** 2 + (p[1] - pts[0][1]) ** 2
    if (d > dMax) { dMax = d; loin = i }
  })
  const moitie1 = dp(pts.slice(0, loin + 1), tolerance)
  const moitie2 = dp([...pts.slice(loin), pts[0]], tolerance)
  return [...moitie1.slice(0, -1), ...moitie2.slice(0, -1)]
}

function dp(pts, tolerance) {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const longueur = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let indice = 0
  let dMax = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / longueur
    if (d > dMax) { dMax = d; indice = i }
  }
  if (dMax <= tolerance) return [a, b]
  return [...dp(pts.slice(0, indice + 1), tolerance).slice(0, -1), ...dp(pts.slice(indice), tolerance)]
}
