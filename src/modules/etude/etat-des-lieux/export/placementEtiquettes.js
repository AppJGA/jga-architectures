// ─── Placement des textes de l'état des lieux, sans chevauchement ───────────
//
// Demande de l'agence après un premier essai (2026-11-18) : dans une petite
// salle d'eau, nom, surface, HSP, finitions et libellés « P5 · Lavabo… » se
// recouvraient. Désormais :
//   - les textes d'une pièce (nom, surface, HSP, finitions) tiennent dans un
//     CADRE, posé dans la pièce là où il ne couvre aucun symbole, au plus
//     près de son centre visuel ; réduit jusqu'à 0,6 × s'il ne tient pas ;
//   - chaque libellé d'élément (et chaque « Ph n ») essaie huit places autour
//     de son symbole, puis les mêmes plus loin (avec un trait de rappel),
//     sans jamais entrer dans un cadre ni dans un libellé déjà posé.
// Pur et déterministe : mêmes données, mêmes positions (testé dans
// tests/etat-des-lieux-export-etiquettes.test.js). Tout est en mètres, dans
// le repère tourné de chaque pièce (`orientationPiece`), puis ramené au plan.
// Le plan existant (`…-avec-plan.dxf`) n'est qu'un fond : ses textes ne
// gênent rien.

import { pointDansPolygone } from '../geometrieEdl.js'
import { largeurTexte } from './symbolesEdl.js'

// Une ligne occupe sa hauteur × INTERLIGNE (textes centrés sur la hauteur)
export const INTERLIGNE = 1.5
// Entre un symbole et son libellé
export const ECART_LIBELLE = 0.08
// Entre le texte et le bord du cadre
export const MARGE_CADRE = 0.06
// En deçà, un texte de 0,12 m ne se lirait plus au 1/50 (0,072 m)
export const REDUCTION_MIN = 0.6
const PALIERS = [1, 0.9, 0.8, 0.7, 0.6]
// Pas de la recherche du cadre ; élargi sur une très grande pièce pour
// qu'un étage de 200 pièces reste rapide
const PAS_GRILLE = 0.1
const CANDIDATS_MAX = 2500
// Un anneau plus loin s'écarte au moins d'autant (un symbole minuscule ne
// donnerait sinon que des anneaux collés au premier)
const PAS_ANNEAU_MIN = 0.15
const ANNEAUX = 5
// Droite, gauche, dessus, dessous, puis les diagonales : le libellé à droite
// reste la lecture habituelle
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
// Recouvrement négligeable (m²) : deux boîtes qui se touchent ne se gênent pas
const AIRE_NEGLIGEABLE = 1e-6
const EPS = 1e-9
// Petite boîte autour d'un point : le cadre ne le couvre jamais
const DEMI_POINT = 0.03

// ─── Géométrie ──────────────────────────────────────────────────────────────

/**
 * Point où écrire dans une pièce : le centre de gravité de la surface, ou,
 * s'il tombe dehors (pièce en L, en U), le milieu de la plus large traversée
 * horizontale à sa hauteur.
 */
export function pointInterieur(contour) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < contour.length; i++) {
    const [x1, y1] = contour[i]
    const [x2, y2] = contour[(i + 1) % contour.length]
    const k = x1 * y2 - x2 * y1
    a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
  }
  const moyenne = [contour.reduce((s, p) => s + p[0], 0) / contour.length, contour.reduce((s, p) => s + p[1], 0) / contour.length]
  if (Math.abs(a) < 1e-12) return moyenne
  const c = [cx / (3 * a), cy / (3 * a)]
  if (pointDansPolygone(c, contour)) return c
  const y = c[1]
  const xs = []
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [xi, yi] = contour[i]
    const [xj, yj] = contour[j]
    if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
  }
  xs.sort((p, q) => p - q)
  let meilleur = null
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!meilleur || xs[i + 1] - xs[i] > meilleur[1] - meilleur[0]) meilleur = [xs[i], xs[i + 1]]
  }
  return meilleur ? [(meilleur[0] + meilleur[1]) / 2, y] : moyenne
}

/** Repère tourné de `angle` degrés autour de `origine` : local (u, v) ↔ plan. */
export function repere([ox, oy], angle = 0) {
  const r = (angle * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return {
    versPlan: ([u, v]) => [ox + u * c - v * s, oy + u * s + v * c],
    versLocal: ([x, y]) => {
      const dx = x - ox
      const dy = y - oy
      return [dx * c + dy * s, -dx * s + dy * c]
    },
  }
}

// Coins dans le sens trigonométrique : le découpage d'`aireIntersection` en dépend
const coinsBoite = (b) => [[b.xmin, b.ymin], [b.xmax, b.ymin], [b.xmax, b.ymax], [b.xmin, b.ymax]]

/** Boîte locale → quadrilatère du plan. */
export const polygoneBoite = (b, versPlan) => coinsBoite(b).map(versPlan)

export function enveloppe(pts) {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const [x, y] of pts) {
    if (x < xmin) xmin = x
    if (y < ymin) ymin = y
    if (x > xmax) xmax = x
    if (y > ymax) ymax = y
  }
  return { xmin, ymin, xmax, ymax }
}

const seRecouvrent = (a, b) => a.xmin < b.xmax - EPS && b.xmin < a.xmax - EPS && a.ymin < b.ymax - EPS && b.ymin < a.ymax - EPS

function aireAbs(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

/**
 * Aire commune de deux polygones convexes tournés dans le sens
 * trigonométrique (découpage de Sutherland-Hodgman) : les boîtes viennent de
 * repères d'angles différents, une comparaison de bornes ne suffit pas.
 */
export function aireIntersection(a, b) {
  let sortie = a
  for (let i = 0; i < b.length && sortie.length; i++) {
    const p1 = b[i]
    const p2 = b[(i + 1) % b.length]
    const cote = (q) => (p2[0] - p1[0]) * (q[1] - p1[1]) - (p2[1] - p1[1]) * (q[0] - p1[0])
    const entree = sortie
    sortie = []
    for (let j = 0; j < entree.length; j++) {
      const cur = entree[j]
      const prev = entree[(j + entree.length - 1) % entree.length]
      const cc = cote(cur)
      const cp = cote(prev)
      const coupe = () => {
        const t = cp / (cp - cc)
        return [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]
      }
      if (cc >= 0) {
        if (cp < 0) sortie.push(coupe())
        sortie.push(cur)
      } else if (cp >= 0) sortie.push(coupe())
    }
  }
  return sortie.length >= 3 ? aireAbs(sortie) : 0
}

// Le segment p → q entre-t-il dans l'intérieur de la boîte ? (Liang-Barsky)
function segmentDansBoite(p, q, b) {
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  let t0 = 0
  let t1 = 1
  const bornes = [[-dx, p[0] - (b.xmin + EPS)], [dx, b.xmax - EPS - p[0]], [-dy, p[1] - (b.ymin + EPS)], [dy, b.ymax - EPS - p[1]]]
  for (const [pp, qq] of bornes) {
    if (Math.abs(pp) < 1e-15) {
      if (qq < 0) return false
    } else {
      const t = qq / pp
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t }
    }
  }
  return t1 - t0 > 1e-12
}

// Boîte entièrement dans le polygone : ses coins dedans, et aucun côté du
// contour ne la traverse (exact : un angle rentrant d'une pièce en L entre
// deux points échantillonnés serait passé inaperçu)
function boiteDansPolygone(b, poly) {
  for (const c of coinsBoite(b)) if (!pointDansPolygone(c, poly)) return false
  for (let i = 0; i < poly.length; i++) {
    if (segmentDansBoite(poly[i], poly[(i + 1) % poly.length], b)) return false
  }
  return true
}

// Part de la boîte dans le polygone, sur une grille de 6 × 6 points
function partDedans(b, poly) {
  let dedans = 0
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const p = [b.xmin + ((b.xmax - b.xmin) * i) / 5, b.ymin + ((b.ymax - b.ymin) * j) / 5]
      if (pointDansPolygone(p, poly)) dedans++
    }
  }
  return dedans / 36
}

// ─── Obstacles ──────────────────────────────────────────────────────────────

/**
 * Index des boîtes déjà posées, par cases d'un mètre : un étage de 200
 * éléments ne compare chaque candidat qu'à ses voisins.
 */
export function indexObstacles(cellule = 1) {
  const cases = new Map()
  const entrees = []
  const parcourir = (b, f) => {
    const i0 = Math.floor(b.xmin / cellule)
    const i1 = Math.floor(b.xmax / cellule)
    const j0 = Math.floor(b.ymin / cellule)
    const j1 = Math.floor(b.ymax / cellule)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f(`${i} ${j}`)
  }
  return {
    entrees,
    ajouter(poly, genre) {
      const e = { poly, boite: enveloppe(poly), genre }
      entrees.push(e)
      parcourir(e.boite, (k) => {
        const liste = cases.get(k)
        if (liste) liste.push(e)
        else cases.set(k, [e])
      })
      return e
    },
    autour(b) {
      const vus = new Set()
      const trouves = []
      parcourir(b, (k) => {
        for (const e of cases.get(k) ?? []) {
          if (vus.has(e)) continue
          vus.add(e)
          if (seRecouvrent(e.boite, b)) trouves.push(e)
        }
      })
      return trouves
    },
  }
}

// Poids d'un recouvrement, quand aucune place n'est libre : entrer dans un
// cadre est ce que l'agence ne veut pas voir (« aucun autre texte dans ce
// cadre »), cacher un symbole vient ensuite, chevaucher un libellé en dernier
const POIDS = { cadre: 100, symbole: 10, point: 10, photo: 10, libelle: 1 }

// Aire (pondérée) couverte par le polygone sur les obstacles de l'index
function gene(poly, index) {
  let total = 0
  for (const e of index.autour(enveloppe(poly))) total += aireIntersection(poly, e.poly) * (POIDS[e.genre] ?? 1)
  return total
}

// ─── Bloc de lignes ─────────────────────────────────────────────────────────

const largeurBloc = (lignes, k = 1) => lignes.reduce((m, l) => Math.max(m, largeurTexte(l.texte, l.hauteur * k)), 0)
const hauteurBloc = (lignes, k = 1) => lignes.reduce((s, l) => s + l.hauteur * k * INTERLIGNE, 0)

// Positions des lignes dans une boîte locale, de haut en bas ; `x` donné
// par l'alignement (centre du cadre, bord gauche d'un libellé)
function poserLignes(lignes, b, k, x, versPlan, haut = b.ymax) {
  let v = haut
  return lignes.map((l) => {
    const h = l.hauteur * k
    v -= (h * INTERLIGNE) / 2
    const pos = versPlan([x, v])
    v -= (h * INTERLIGNE) / 2
    return { ...l, hauteur: h, pos }
  })
}

// ─── Cadre d'une pièce ──────────────────────────────────────────────────────

// Centres candidats sur une grille calée sur le centre visuel (0, 0), du plus
// proche au plus loin ; à distance égale, l'ordre de la grille départage
function grille(zone) {
  const aire = (zone.xmax - zone.xmin) * (zone.ymax - zone.ymin)
  const pas = Math.max(PAS_GRILLE, Math.sqrt(aire / CANDIDATS_MAX))
  const candidats = []
  for (let i = Math.ceil(zone.xmin / pas); i * pas <= zone.xmax; i++) {
    for (let j = Math.ceil(zone.ymin / pas); j * pas <= zone.ymax; j++) {
      candidats.push({ u: i * pas, v: j * pas, d: (i * i + j * j) * pas * pas })
    }
  }
  candidats.sort((a, b) => a.d - b.d || b.v - a.v || a.u - b.u)
  return candidats
}

/**
 * Cadre des textes d'une pièce.
 *
 * @param contour   contour de la pièce (m, plan)
 * @param angle     orientation (degrés) : le cadre est tourné comme la pièce
 * @param lignes    [{ texte, hauteur, … }] de haut en bas (le reste est recopié)
 * @param obstacles polygones du plan que le cadre ne doit pas couvrir
 *                  (symboles, points, cadres déjà posés)
 * @param reductionMin réduction la plus forte admise (1 : jamais réduit)
 * @returns { coins (plan), lignes [{ …, hauteur, pos }], echelle, dedans,
 *   boite (locale), origine, angle } — `dedans` faux si le cadre déborde
 *   de la pièce (rien ne tenait, même réduit)
 */
export function placerCadre({ contour, angle = 0, lignes = [], obstacles = [], marge = MARGE_CADRE, reductionMin = REDUCTION_MIN }) {
  const origine = pointInterieur(contour)
  const { versPlan, versLocal } = repere(origine, angle)
  const local = contour.map(versLocal)
  const zone = enveloppe(local)
  const genes = obstacles.map((poly) => enveloppe(poly.map(versLocal))).filter((b) => seRecouvrent(b, zone))
  const libre = (b) => !genes.some((g) => seRecouvrent(g, b))
  const paliers = PALIERS.filter((k) => k >= reductionMin - EPS)
  if (!paliers.length) paliers.push(1)
  const candidats = grille(zone)
  const taille = (k) => [largeurBloc(lignes, k) + 2 * marge, hauteurBloc(lignes, k) + 2 * marge]
  const boiteEn = (c, [l, h]) => ({ xmin: c.u - l / 2, ymin: c.v - h / 2, xmax: c.u + l / 2, ymax: c.v + h / 2 })

  const resultat = (c, k, dedans) => {
    const dims = taille(k)
    const b = boiteEn(c, dims)
    return {
      origine, angle, echelle: k, dedans, boite: b,
      coins: polygoneBoite(b, versPlan),
      lignes: poserLignes(lignes, b, k, c.u, versPlan, b.ymax - marge),
    }
  }

  for (const k of paliers) {
    const [l, h] = taille(k)
    if (l > zone.xmax - zone.xmin + EPS || h > zone.ymax - zone.ymin + EPS) continue
    for (const c of candidats) {
      const b = boiteEn(c, [l, h])
      if (b.xmin < zone.xmin - EPS || b.xmax > zone.xmax + EPS || b.ymin < zone.ymin - EPS || b.ymax > zone.ymax + EPS) continue
      if (libre(b) && boiteDansPolygone(b, local)) return resultat(c, k, true)
    }
  }

  // Rien ne tient, même réduit : la place la plus dans la pièce sans couvrir
  // de symbole — le cadre traversera un mur, c'est accepté
  const k = paliers.at(-1)
  const dims = taille(k)
  let meilleur = null
  for (const c of candidats) {
    if (!pointDansPolygone([c.u, c.v], local)) continue
    const b = boiteEn(c, dims)
    const note = { c, couvre: libre(b) ? 0 : 1, part: partDedans(b, local) }
    if (!meilleur || note.couvre < meilleur.couvre || (note.couvre === meilleur.couvre && note.part > meilleur.part + EPS)) meilleur = note
  }
  return resultat(meilleur?.c ?? { u: 0, v: 0 }, k, false)
}

// ─── Libellé d'un élément ou d'une photo ────────────────────────────────────

// Écart au symbole pour l'anneau `n` (1, 2, 3) : la distance du centre au
// libellé est multipliée par n, et au moins `PAS_ANNEAU_MIN` de plus à chaque anneau
const ecartAnneau = (n, demi, ecart) => Math.max(n * (demi + ecart) - demi, ecart + (n - 1) * PAS_ANNEAU_MIN)

// Plus court trait entre deux boîtes alignées : du bord de l'une au bord de l'autre
function rappel(a, b) {
  const axe = (amin, amax, bmin, bmax) => {
    if (amax < bmin) return [amax, bmin]
    if (bmax < amin) return [amin, bmax]
    const m = (Math.max(amin, bmin) + Math.min(amax, bmax)) / 2
    return [m, m]
  }
  const [ax, bx] = axe(a.xmin, a.xmax, b.xmin, b.xmax)
  const [ay, by] = axe(a.ymin, a.ymax, b.ymin, b.ymax)
  return [[ax, ay], [bx, by]]
}

/**
 * Libellé posé autour de la boîte `ancre` (symboles d'un point, repère d'une
 * photo), dans le repère du point : huit places au premier anneau, puis au
 * deuxième et au troisième. La première place qui ne couvre rien de
 * l'index l'emporte ; sinon, la moins couverte. Au-delà du premier anneau,
 * un trait de rappel relie le symbole au libellé.
 *
 * @returns { coins (plan), boite (locale), lignes [{ …, pos }] calées à
 *   gauche, rappel [a, b] (plan) ou null, anneau, libre }
 */
export function placerLibelle({ origine, angle = 0, ancre, lignes = [], index, ecart = ECART_LIBELLE }) {
  const { versPlan } = repere(origine, angle)
  const l = largeurBloc(lignes)
  const h = hauteurBloc(lignes)
  const demiX = (ancre.xmax - ancre.xmin) / 2
  const demiY = (ancre.ymax - ancre.ymin) / 2
  const cx = (ancre.xmin + ancre.xmax) / 2
  const cy = (ancre.ymin + ancre.ymax) / 2

  let choix = null
  for (let n = 1; n <= ANNEAUX && !choix?.libre; n++) {
    const gx = ecartAnneau(n, demiX, ecart)
    const gy = ecartAnneau(n, demiY, ecart)
    for (const [dx, dy] of DIRECTIONS) {
      const xmin = dx > 0 ? ancre.xmax + gx : dx < 0 ? ancre.xmin - gx - l : cx - l / 2
      const ymin = dy > 0 ? ancre.ymax + gy : dy < 0 ? ancre.ymin - gy - h : cy - h / 2
      const b = { xmin, ymin, xmax: xmin + l, ymax: ymin + h }
      const coins = polygoneBoite(b, versPlan)
      const g = index ? gene(coins, index) : 0
      if (g <= AIRE_NEGLIGEABLE) { choix = { b, coins, n, libre: true }; break }
      if (!choix || g < choix.g - EPS) choix = { b, coins, n, g, libre: false }
    }
  }
  const { b, coins, n, libre } = choix
  const avecRappel = n > 1 || !libre
  return {
    boite: b, coins, anneau: n, libre,
    lignes: poserLignes(lignes, b, 1, b.xmin, versPlan),
    rappel: avecRappel ? rappel(ancre, b).map(versPlan) : null,
  }
}

// ─── Un étage ───────────────────────────────────────────────────────────────

const boitePoint = { xmin: -DEMI_POINT, ymin: -DEMI_POINT, xmax: DEMI_POINT, ymax: DEMI_POINT }

/**
 * Tout un étage : les cadres d'abord (ils évitent symboles, points et photos),
 * puis les libellés dans l'ordre reçu (ils évitent cadres, symboles, photos
 * et libellés déjà posés).
 *
 * @param cadres  [{ id, contour, angle, lignes }] dans l'ordre des pièces
 * @param reperes [{ cle, origine, angle, symbole (boîte locale) | null,
 *   lignes, photo: { ancre (boîte locale), lignes } | null }] — l'appelant
 *   les range (pièce, puis numéro du point) : l'ordre décide des places
 * @returns { cadres: [{ id, …placerCadre }], reperes: [{ cle, libelle, photo }] }
 */
export function placerEtiquettes({ cadres = [], reperes = [], reductionMin = REDUCTION_MIN, marge = MARGE_CADRE } = {}) {
  const index = indexObstacles()
  for (const r of reperes) {
    const { versPlan } = repere(r.origine, r.angle)
    if (r.symbole) index.ajouter(polygoneBoite(r.symbole, versPlan), 'symbole')
    index.ajouter(polygoneBoite(boitePoint, versPlan), 'point')
    if (r.photo) index.ajouter(polygoneBoite(r.photo.ancre, versPlan), 'photo')
  }

  const cadresPlaces = cadres.map((c) => {
    const zone = enveloppe(c.contour)
    const obstacles = index.autour(zone).map((e) => e.poly)
    const place = placerCadre({ contour: c.contour, angle: c.angle, lignes: c.lignes, obstacles, reductionMin, marge })
    index.ajouter(place.coins, 'cadre')
    return { id: c.id, ...place }
  })

  const reperesPlaces = reperes.map((r) => {
    let libelle = null
    let photo = null
    if (r.lignes?.length) {
      libelle = placerLibelle({ origine: r.origine, angle: r.angle, ancre: r.symbole ?? boitePoint, lignes: r.lignes, index })
      index.ajouter(libelle.coins, 'libelle')
    }
    if (r.photo?.lignes?.length) {
      photo = placerLibelle({ origine: r.origine, angle: r.angle, ancre: r.photo.ancre, lignes: r.photo.lignes, index })
      index.ajouter(photo.coins, 'libelle')
    }
    return { cle: r.cle, libelle, photo }
  })

  return { cadres: cadresPlaces, reperes: reperesPlaces }
}
