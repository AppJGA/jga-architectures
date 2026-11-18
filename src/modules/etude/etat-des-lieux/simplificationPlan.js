// ─── Simplification d'un plan d'étage, calque par calque ─────────────────────
//
// Un DXF d'ArchiCAD exporte un mur noir en milliers de traits serrés (1 à 2 mm
// d'écart) et une toiture en centaines de milliers de petits traits de tuiles :
// un R+1 dépasse le demi-million de traits, que ni l'écran ni la tablette ne
// redessinent à chaque geste. Chaque calque reçoit donc un traitement
// (`TRAITEMENTS`) : les remplissages de murs deviennent des masses pleines, les
// motifs décoratifs disparaissent, le reste est gardé tel quel. Tout est en
// mètres, dans le repère du plan d'origine (y vers le haut), comme les pièces.
//
// Le fichier vectoriel enregistré par étage (`encoderVecteurs`) est un JSON
// compact compressé : quelques milliers de traits au millimètre.

// Extension écrite : `TRAITEMENTS` est aussi lu par la fonction serveur
// api/edl-calques.js, où Node ne complète pas les chemins.
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'
import { boite, pointDansPolygone } from './geometrieEdl.js'

export const TRAITEMENTS = ['garder', 'masse', 'masquer-motif', 'masquer']
export const LIBELLES_TRAITEMENT = {
  garder: 'Garder',
  masse: 'Pocher (murs)',
  'masquer-motif': 'Masquer le motif',
  masquer: 'Masquer',
}
// Un trait de remplissage ou de motif est court ; les vrais contours de murs
// sont des lignes longues, qu'on garde pour le trait épais du pochage.
export const LONGUEUR_MOTIF = 0.1

// Au-dessous, une masse n'est qu'une miette de remplissage isolée.
const AIRE_MIN_MASSE = 0.0004
// Fermeture de 2 cellules : soude des traits espacés de quelques centimètres
// sans réunir deux murs distincts.
const RAYON_FERMETURE = 2
// Calques assez fournis pour qu'un remplissage se reconnaisse à coup sûr.
const PART_COURTS_MOTIF = 0.9
const TRAITS_MIN_MOTIF = 500

export function longueurTrait(trait) {
  const pts = trait.pts
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  if (trait.ferme && pts.length > 2) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])
  return l
}

const estCourt = (t) => longueurTrait(t) < LONGUEUR_MOTIF

export function analyserCalques(traits, textes = []) {
  const parNom = new Map()
  const calque = (nom) => {
    if (!parNom.has(nom)) parNom.set(nom, { nom, traits: 0, courts: 0, partCourts: 0, fermes: 0, textes: 0, boite: [Infinity, Infinity, -Infinity, -Infinity] })
    return parNom.get(nom)
  }
  const etendre = (b, x, y) => {
    if (x < b[0]) b[0] = x
    if (y < b[1]) b[1] = y
    if (x > b[2]) b[2] = x
    if (y > b[3]) b[3] = y
  }
  for (const t of traits) {
    const c = calque(t.calque)
    c.traits++
    if (estCourt(t)) c.courts++
    if (t.ferme) c.fermes++
    for (const [x, y] of t.pts) etendre(c.boite, x, y)
  }
  for (const t of textes) {
    const c = calque(t.calque)
    c.textes++
    etendre(c.boite, t.pos[0], t.pos[1])
  }
  const liste = [...parNom.values()]
  for (const c of liste) c.partCourts = c.traits ? c.courts / c.traits : 0
  return liste.sort((a, b) => b.traits - a.traits)
}

// Les calques s'analysent sur tout le fichier, étages réunis : un même calque
// reçoit ainsi le même traitement à tous les étages qu'il traverse. Tous les
// étages proposés comptent, cochés ou non : décocher un étage ne fait pas
// changer la liste des calques sous les yeux de l'utilisateur.
export function analyserNiveaux(niveaux) {
  return analyserCalques(niveaux.flatMap((n) => n.traits), niveaux.flatMap((n) => n.textes ?? []))
}

/** Map nom du calque → éléments (traits ou textes) de ce calque. */
export function parCalque(elements) {
  const m = new Map()
  for (const e of elements) {
    if (!m.has(e.calque)) m.set(e.calque, [])
    m.get(e.calque).push(e)
  }
  return m
}

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// Repli quand Claude ne répond pas : un calque presque entièrement fait de
// traits courts est un remplissage (mur, d'après son nom) ou un motif.
export function decisionsParDefaut(analyse) {
  const decisions = {}
  for (const c of analyse) {
    if (c.partCourts >= PART_COURTS_MOTIF && c.traits >= TRAITS_MIN_MOTIF) {
      decisions[c.nom] = /MUR|CLOISON/.test(sansAccents(c.nom)) ? 'masse' : 'masquer-motif'
    } else decisions[c.nom] = 'garder'
  }
  return decisions
}

// ─── Grille creuse ───────────────────────────────────────────────────────────
//
// Des corps de bâtiment peuvent être à 150 m l'un de l'autre, et un plan de
// géomètre porte ses coordonnées Lambert : une grille pleine au centimètre ne
// tient pas en mémoire. La grille est faite de morceaux de 256 × 256 cellules,
// créés à la demande dans une `Map`. Chaque morceau est un bitmap (une ligne =
// 8 mots de 32 bits) : dilatation et érosion travaillent 32 cellules à la fois.

const TAILLE = 256
const MOTS = TAILLE / 32
const LONGUEUR_MORCEAU = TAILLE * MOTS
const K = 2 ** 26
// Décalage des indices de morceau : la dilatation déborde d'un morceau vers
// les indices négatifs, la clé doit rester positive et sans collision.
const DECALAGE = 4
const cle = (cx, cy) => (cx + DECALAGE) * K + (cy + DECALAGE)
const cxDe = (c) => Math.floor(c / K) - DECALAGE
const cyDe = (c) => (c % K) - DECALAGE

function creerGrille() {
  const morceaux = new Map()
  let dernierCle = -1
  let dernier = null
  return {
    morceaux,
    poser(x, y) {
      const cx = Math.floor(x / TAILLE)
      const cy = Math.floor(y / TAILLE)
      const c = cle(cx, cy)
      if (c !== dernierCle) {
        dernier = morceaux.get(c)
        if (!dernier) {
          dernier = new Uint32Array(LONGUEUR_MORCEAU)
          morceaux.set(c, dernier)
        }
        dernierCle = c
      }
      const lx = x - cx * TAILLE
      const ly = y - cy * TAILLE
      dernier[ly * MOTS + (lx >>> 5)] |= 1 << (lx & 31)
    },
  }
}

// Une cellule est marquée quand le segment passe par son centre dans le sens
// où il avance le plus : un trait de 8 cm en travers d'un mur marque 8
// cellules, pas 9, et l'épaisseur du mur pochée reste juste.
function tracerSegment(grille, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  let marque = false
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy !== 0) {
      const j0 = Math.ceil(Math.min(ay, by) - 0.5)
      const j1 = Math.floor(Math.max(ay, by) - 0.5)
      for (let j = j0; j <= j1; j++) {
        grille.poser(Math.floor(ax + ((j + 0.5 - ay) / dy) * dx), j)
        marque = true
      }
    }
  } else {
    const i0 = Math.ceil(Math.min(ax, bx) - 0.5)
    const i1 = Math.floor(Math.max(ax, bx) - 0.5)
    for (let i = i0; i <= i1; i++) {
      grille.poser(i, Math.floor(ay + ((i + 0.5 - ax) / dx) * dy))
      marque = true
    }
  }
  // Un segment plus court qu'une cellule ne passe par aucun centre : on garde
  // tout de même sa trace.
  if (!marque) grille.poser(Math.floor((ax + bx) / 2), Math.floor((ay + by) / 2))
}

// Passe horizontale : chaque cellule prend le OU (dilatation) ou le ET
// (érosion) de ses voisines à ± r sur sa ligne.
function passeHorizontale(source, r, dilater) {
  const candidats = new Set()
  for (const c of source.keys()) {
    candidats.add(c)
    if (dilater) {
      candidats.add(c - K)
      candidats.add(c + K)
    }
  }
  const sortie = new Map()
  for (const c of candidats) {
    const ici = source.get(c)
    const gauche = source.get(c - K)
    const droite = source.get(c + K)
    const out = new Uint32Array(LONGUEUR_MORCEAU)
    let rien = 0
    for (let base = 0; base < LONGUEUR_MORCEAU; base += MOTS) {
      for (let w = 0; w < MOTS; w++) {
        const cur = ici ? ici[base + w] : 0
        const prev = w > 0 ? (ici ? ici[base + w - 1] : 0) : (gauche ? gauche[base + MOTS - 1] : 0)
        const next = w < MOTS - 1 ? (ici ? ici[base + w + 1] : 0) : (droite ? droite[base] : 0)
        let v = cur
        for (let k = 1; k <= r; k++) {
          // Bit x ← cellule x − k (vers la gauche), puis cellule x + k.
          const aGauche = (cur << k) | (prev >>> (32 - k))
          const aDroite = (cur >>> k) | (next << (32 - k))
          v = dilater ? v | aGauche | aDroite : v & aGauche & aDroite
        }
        out[base + w] = v
        rien |= v
      }
    }
    if (rien) sortie.set(c, out)
  }
  return sortie
}

// Passe verticale : même chose sur les lignes ± r, prises au besoin dans les
// morceaux du dessous et du dessus.
function passeVerticale(source, r, dilater) {
  const candidats = new Set()
  for (const c of source.keys()) {
    candidats.add(c)
    if (dilater) {
      candidats.add(c - 1)
      candidats.add(c + 1)
    }
  }
  const sortie = new Map()
  for (const c of candidats) {
    const ici = source.get(c)
    const dessous = source.get(c - 1)
    const dessus = source.get(c + 1)
    const out = new Uint32Array(LONGUEUR_MORCEAU)
    let rien = 0
    for (let y = 0; y < TAILLE; y++) {
      for (let w = 0; w < MOTS; w++) {
        let v = dilater ? 0 : -1
        for (let k = -r; k <= r; k++) {
          const yy = y + k
          let m
          if (yy < 0) m = dessous ? dessous[(yy + TAILLE) * MOTS + w] : 0
          else if (yy >= TAILLE) m = dessus ? dessus[(yy - TAILLE) * MOTS + w] : 0
          else m = ici ? ici[yy * MOTS + w] : 0
          v = dilater ? v | m : v & m
        }
        out[y * MOTS + w] = v
        rien |= v
      }
    }
    if (rien) sortie.set(c, out)
  }
  return sortie
}

function fermeture(morceaux, r) {
  const dilate = passeVerticale(passeHorizontale(morceaux, r, true), r, true)
  return passeVerticale(passeHorizontale(dilate, r, false), r, false)
}

// ─── Suivi des bords ─────────────────────────────────────────────────────────
//
// Chaque bord suit les arêtes entre cellule pleine et cellule vide, la
// cellule pleine à gauche : l'extérieur d'une masse tourne dans le sens
// direct, ses trous dans l'autre. À un point de selle (deux cellules pleines
// en diagonale), on tourne toujours à gauche : les deux cellules sont tenues
// pour séparées, et les deux bords qui passent là ne se partagent rien.

const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

function lecteur(morceaux) {
  let dernierCle = -1
  let dernier = null
  return (x, y) => {
    const cx = Math.floor(x / TAILLE)
    const cy = Math.floor(y / TAILLE)
    const c = cle(cx, cy)
    if (c !== dernierCle) {
      dernier = morceaux.get(c)
      dernierCle = c
    }
    if (!dernier) return 0
    const lx = x - cx * TAILLE
    return (dernier[(y - cy * TAILLE) * MOTS + (lx >>> 5)] >>> (lx & 31)) & 1
  }
}

function suivreBords(morceaux) {
  const plein = lecteur(morceaux)
  // Arêtes « vers l'est » déjà parcourues, rangées comme les cellules : tout
  // bord en a une, on démarre de la première qui n'a pas servi.
  const vues = new Map()
  const marquer = (x, y) => {
    const cx = Math.floor(x / TAILLE)
    const cy = Math.floor(y / TAILLE)
    const c = cle(cx, cy)
    let m = vues.get(c)
    if (!m) {
      m = new Uint32Array(LONGUEUR_MORCEAU)
      vues.set(c, m)
    }
    const lx = x - cx * TAILLE
    m[(y - cy * TAILLE) * MOTS + (lx >>> 5)] |= 1 << (lx & 31)
  }

  const suivre = (x0, y0) => {
    const coins = []
    let x = x0
    let y = y0
    let d = 0
    for (;;) {
      if (d === 0) marquer(x, y)
      x += DX[d]
      y += DY[d]
      let gauche, droite
      if (d === 0) { gauche = plein(x, y); droite = plein(x, y - 1) }
      else if (d === 1) { gauche = plein(x - 1, y); droite = plein(x, y) }
      else if (d === 2) { gauche = plein(x - 1, y - 1); droite = plein(x - 1, y) }
      else { gauche = plein(x, y - 1); droite = plein(x - 1, y - 1) }
      const nd = !gauche ? (d + 1) & 3 : !droite ? d : (d + 3) & 3
      if (x === x0 && y === y0 && nd === 0) {
        if (d !== 0) coins.push([x, y])
        return coins
      }
      if (nd !== d) coins.push([x, y])
      d = nd
    }
  }

  const anneaux = []
  for (const [c, ch] of morceaux) {
    const cx = cxDe(c)
    const cy = cyDe(c)
    const dessous = morceaux.get(c - 1)
    for (let ly = 0; ly < TAILLE; ly++) {
      for (let w = 0; w < MOTS; w++) {
        const ligne = ch[ly * MOTS + w]
        if (!ligne) continue
        const sous = ly > 0 ? ch[(ly - 1) * MOTS + w] : (dessous ? dessous[(TAILLE - 1) * MOTS + w] : 0)
        let bits = ligne & ~sous
        while (bits) {
          const bas = bits & -bits
          const b = 31 - Math.clz32(bas)
          bits &= bits - 1
          const m = vues.get(c)
          if (m && (m[ly * MOTS + w] >>> b) & 1) continue
          const x = cx * TAILLE + w * 32 + b
          const y = cy * TAILLE + ly
          anneaux.push({ coins: suivre(x, y), depart: [x + 0.5, y + 0.5] })
        }
      }
    }
  }
  return anneaux
}

function aireSignee(pts) {
  let s = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  return s / 2
}

function distanceSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function douglasPeucker(pts, tolerance) {
  const n = pts.length
  if (n <= 2) return pts
  const garde = new Uint8Array(n)
  garde[0] = garde[n - 1] = 1
  const pile = [[0, n - 1]]
  while (pile.length) {
    const [a, b] = pile.pop()
    let loin = -1
    let dMax = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = distanceSegment(pts[i], pts[a], pts[b])
      if (d > dMax) { dMax = d; loin = i }
    }
    if (loin >= 0) {
      garde[loin] = 1
      pile.push([a, loin], [loin, b])
    }
  }
  return pts.filter((_, i) => garde[i])
}

// Anneau fermé : coupé en deux au point le plus éloigné du premier, chaque
// moitié simplifiée, puis le premier point retiré s'il est dans l'alignement.
function simplifierAnneau(anneau, tolerance) {
  const n = anneau.length
  if (n <= 3) return anneau
  let loin = 1
  let dMax = -1
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(anneau[i][0] - anneau[0][0], anneau[i][1] - anneau[0][1])
    if (d > dMax) { dMax = d; loin = i }
  }
  const a = douglasPeucker(anneau.slice(0, loin + 1), tolerance)
  const b = douglasPeucker([...anneau.slice(loin), anneau[0]], tolerance)
  const res = [...a.slice(0, -1), ...b.slice(0, -1)]
  if (res.length > 3 && distanceSegment(res[0], res[res.length - 1], res[1]) <= tolerance) res.shift()
  return res
}

// Un mur en biais sort de la grille en escalier ; ses coins alternent de part
// et d'autre du vrai bord, et Douglas-Peucker à une cellule près les gardait
// presque tous (200 sommets pour 3 m de mur à 45°), ou décalait le bord vers
// l'extérieur avec une tolérance plus large. Les marches (côtés de moins de
// `MARCHE` cellules : le tracé d'un trait en biais en fait aussi de 2) sont
// donc remplacées par leur milieu, qui tombe sur le vrai bord ; un coin entre
// deux côtés plus longs reste un vrai angle (un mur droit garde ses angles).
// Essai sur un mur de 8 cm à 0°, 2°, 10°, 30°, 45°, 80° : 4 à 9 sommets,
// aire à moins de 6 % de la vraie.
const MARCHE = 3
function adoucirEscaliers(coins) {
  const n = coins.length
  const longueur = (i) => {
    const [ax, ay] = coins[i]
    const [bx, by] = coins[(i + 1) % n]
    return Math.abs(bx - ax) + Math.abs(by - ay)
  }
  const res = []
  for (let i = 0; i < n; i++) {
    if (longueur((i + n - 1) % n) >= MARCHE && longueur(i) >= MARCHE) res.push(coins[i])
    if (longueur(i) < MARCHE) {
      const [bx, by] = coins[(i + 1) % n]
      res.push([(coins[i][0] + bx) / 2, (coins[i][1] + by) / 2])
    }
  }
  return res
}

function massesDuCalque(calque, courts, pas) {
  let ox = Infinity
  let oy = Infinity
  for (const t of courts) for (const [x, y] of t.pts) {
    if (x < ox) ox = x
    if (y < oy) oy = y
  }
  // Indices de cellule comptés depuis le coin du calque : ils restent petits
  // même en coordonnées Lambert (millions de mètres), et la soustraction se
  // fait avant la division, sans perdre les millimètres entre traits voisins.
  const grille = creerGrille()
  for (const t of courts) {
    const pts = t.pts
    const n = pts.length
    if (n === 1) grille.poser(Math.floor((pts[0][0] - ox) / pas), Math.floor((pts[0][1] - oy) / pas))
    const segments = t.ferme && n > 2 ? n : n - 1
    for (let i = 0; i < segments; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % n]
      tracerSegment(grille, (p[0] - ox) / pas, (p[1] - oy) / pas, (q[0] - ox) / pas, (q[1] - oy) / pas)
    }
  }
  const pleins = fermeture(grille.morceaux, RAYON_FERMETURE)
  const seuil = AIRE_MIN_MASSE / (pas * pas)
  const exterieurs = []
  const trous = []
  for (const a of suivreBords(pleins)) {
    const s = aireSignee(a.coins)
    if (Math.abs(s) < seuil) continue
    if (s > 0) exterieurs.push({ ...a, aire: s, boite: boite(a.coins), trous: [] })
    else trous.push(a)
  }
  // Un trou appartient à la plus petite masse qui contient une de ses
  // cellules pleines voisines (prise au départ de son suivi).
  exterieurs.sort((p, q) => p.aire - q.aire)
  for (const t of trous) {
    const [x, y] = t.depart
    const hote = exterieurs.find((e) => x >= e.boite[0] && x <= e.boite[2] && y >= e.boite[1] && y <= e.boite[3] && pointDansPolygone(t.depart, e.coins))
    if (hote) hote.trous.push(t.coins)
  }
  const enMetres = (coins) => simplifierAnneau(adoucirEscaliers(coins).map(([x, y]) => [ox + x * pas, oy + y * pas]), pas)
  const masses = []
  for (const e of exterieurs) {
    const exterieur = enMetres(e.coins)
    if (exterieur.length < 3) continue
    masses.push({ calque, anneaux: [exterieur, ...e.trous.map(enMetres).filter((r) => r.length >= 3)] })
  }
  return masses
}

export function simplifierNiveau({ traits, textes = [] }, decisions = {}, { pas = 0.01 } = {}) {
  const gardes = []
  const courtsParMasse = new Map()
  let retires = 0
  for (const t of traits) {
    const traitement = decisions[t.calque] ?? 'garder'
    if (traitement === 'garder') { gardes.push(t); continue }
    if (traitement === 'masquer') { retires++; continue }
    if (!estCourt(t)) { gardes.push(t); continue }
    retires++
    if (traitement === 'masse') {
      if (!courtsParMasse.has(t.calque)) courtsParMasse.set(t.calque, [])
      courtsParMasse.get(t.calque).push(t)
    }
  }
  const masses = []
  for (const [calque, courts] of courtsParMasse) masses.push(...massesDuCalque(calque, courts, pas))
  return {
    traits: gardes,
    masses,
    textes: textes.filter((t) => (decisions[t.calque] ?? 'garder') !== 'masquer'),
    retires,
  }
}

// ─── Fichier vectoriel ───────────────────────────────────────────────────────

const mm = (v) => Math.round(v * 1000) / 1000
const aplatir = (pts) => pts.flatMap(([x, y]) => [mm(x), mm(y)])
const enPoints = (plat) => {
  const pts = []
  for (let i = 0; i + 1 < plat.length; i += 2) pts.push([plat[i], plat[i + 1]])
  return pts
}

export function encoderVecteurs({ traits = [], masses = [], textes = [], boite: cadre }) {
  const calques = []
  const indices = new Map()
  const indice = (nom) => {
    if (!indices.has(nom)) {
      indices.set(nom, calques.length)
      calques.push(nom)
    }
    return indices.get(nom)
  }
  const donnees = {
    v: 1,
    calques,
    traits: traits.map((t) => [indice(t.calque), t.ferme ? 1 : 0, ...aplatir(t.pts)]),
    masses: masses.map((m) => [indice(m.calque), m.anneaux.map(aplatir)]),
    textes: textes.map((t) => [indice(t.calque), t.texte, mm(t.pos[0]), mm(t.pos[1]), mm(t.hauteur)]),
    boite: null,
  }
  if (cadre) donnees.boite = cadre.map(mm)
  else {
    const pts = [...traits.flatMap((t) => t.pts), ...masses.flatMap((m) => m.anneaux[0] ?? []), ...textes.map((t) => t.pos)]
    if (pts.length) donnees.boite = boite(pts).map(mm)
  }
  return gzipSync(strToU8(JSON.stringify(donnees)), { level: 6 })
}

export function decoderVecteurs(octets) {
  // Le fichier est envoyé compressé, mais un intermédiaire qui l'a servi en
  // `Content-Encoding: gzip` peut l'avoir déjà décompressé : on ne dégonfle
  // que ce qui porte la signature gzip (1f 8b), le reste est lu tel quel
  const gzip = octets.length >= 2 && octets[0] === 0x1f && octets[1] === 0x8b
  const d = JSON.parse(strFromU8(gzip ? gunzipSync(octets) : octets))
  if (d?.v !== 1) throw new Error('Fichier vectoriel d’une version inconnue')
  const calques = d.calques
  return {
    calques,
    traits: d.traits.map(([i, ferme, ...plat]) => {
      const pts = enPoints(plat)
      return { calque: calques[i], ferme: ferme === 1, pts, boite: boite(pts) }
    }),
    masses: d.masses.map(([i, anneaux]) => {
      const pts = anneaux.map(enPoints)
      return { calque: calques[i], anneaux: pts, boite: boite(pts[0] ?? []) }
    }),
    textes: d.textes.map(([i, texte, x, y, hauteur]) => ({ calque: calques[i], texte, pos: [x, y], hauteur })),
    boite: d.boite,
  }
}
