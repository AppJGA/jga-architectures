// ─── Dessin du plan vectoriel d'un étage, sans navigateur ────────────────────
//
// L'image d'un étage (6 000 px) devient floue dès qu'on zoome sur une pièce ;
// le fichier vectoriel (`encoderVecteurs`) reste net à tous les zooms, à
// condition d'être redessiné à chaque vue. Sur un R+1 réel, il reste une
// dizaine de milliers de traits : on ne dessine que ce qui croise l'écran, et
// en un seul chemin par famille (traits, contours de masses), sinon un
// pincement sur l'iPad saccade. Tout ici se calcule sans navigateur
// (`ctx` est n'importe quel contexte 2D), d'où ce fichier à part de
// `vecteursEdl.js`, qui charge les fichiers.

import { versMetres } from './geometrieEdl.js'

// Épaisseurs en pixels d'écran, quel que soit le zoom : un trait qui grossit
// avec le zoom boucherait les petites pièces, un trait qui maigrit
// disparaîtrait en vue d'ensemble
export const EPAISSEUR_TRAIT = 1
export const EPAISSEUR_CONTOUR_MASSE = 2.5
export const COULEUR_TRAIT = '#3A3633'
export const COULEUR_MASSE = '#1F1B17'
// Sous cette hauteur à l'écran, un texte n'est plus qu'une tache grise : il
// coûte du temps de dessin sans rien apprendre
export const HAUTEUR_TEXTE_MIN = 6

// Zoom maximal d'un plan vectoriel : de quoi lire au centimètre (1 cm =
// 20 px à l'écran). Le plafond fixe des images (12, 60 en visite) venait de
// leur flou ; une feuille de 200 m de haut restait alors illisible.
export const PX_ECRAN_PAR_METRE_MAX = 2000

/** `echelle` : px d'écran par px d'image au zoom 1 ; jamais sous `plancher`. */
export function zoomMaxVectoriel(echelle, pxParMetre, plancher) {
  if (!(echelle > 0) || !(pxParMetre > 0)) return plancher
  return Math.max(plancher, PX_ECRAN_PAR_METRE_MAX / (echelle * pxParMetre))
}
// Marge autour de l'écran, en pixels : un trait posé juste au bord garde la
// moitié de son épaisseur visible
const MARGE_ECRAN = 3
// Largeur moyenne d'un caractère d'Arial, en hauteurs de texte, un peu
// généreuse : un texte coupé au bord de l'écran vaut mieux qu'un texte absent
const LARGEUR_CARACTERE = 0.75
const INTERLIGNE = 1.2

/**
 * Rectangle de l'écran en mètres, [x0, y0, x1, y1] (y vers le haut), d'après
 * le cadrage de l'étage et la vue de la visionneuse (`t` : `versEcran`,
 * `echelle` en pixels d'écran par pixel d'image, `ecran` en pixels CSS).
 */
export function rectangleVisible(cadrage, t, marge = MARGE_ECRAN) {
  const [ex, ey] = t.versEcran(0, 0)
  // Pixel d'écran → pixel de l'image : l'inverse de versEcran, qui n'est
  // qu'un décalage et une échelle
  const versImage = (sx, sy) => [(sx - ex) / t.echelle, (sy - ey) / t.echelle]
  const [ax, ay] = versMetres(cadrage, versImage(-marge, -marge))
  const [bx, by] = versMetres(cadrage, versImage(t.ecran.largeur + marge, t.ecran.hauteur + marge))
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}

export const boitesCroisees = (a, [x0, y0, x1, y1]) => a[0] <= x1 && a[2] >= x0 && a[1] <= y1 && a[3] >= y0

/** Emprise d'un texte en mètres : écrit vers la droite, lignes vers le bas. */
export function boiteTexte({ texte, pos, hauteur }) {
  const lignes = String(texte ?? '').split('\n')
  const longueur = Math.max(0, ...lignes.map((l) => l.length))
  const [x, y] = pos
  return [x, y - (lignes.length - 1) * hauteur * INTERLIGNE - hauteur * 0.3, x + longueur * hauteur * LARGEUR_CARACTERE, y + hauteur]
}

// Ce qui ne dépend que du fichier, calculé une fois par objet décodé et non à
// chaque image d'un pincement : emprise et lignes des textes, masses
// rangées par calque
const preparations = new WeakMap()

function preparation(vecteurs) {
  let p = preparations.get(vecteurs)
  if (p) return p
  const textes = (vecteurs.textes ?? []).map((x) => ({
    boite: x.pos ? boiteTexte(x) : null,
    lignes: String(x.texte ?? '').split('\n'),
  }))
  const parCalque = new Map()
  for (const m of vecteurs.masses ?? []) {
    if (!parCalque.has(m.calque)) parCalque.set(m.calque, [])
    parCalque.get(m.calque).push(m)
  }
  p = { textes, massesParCalque: [...parCalque.values()] }
  preparations.set(vecteurs, p)
  return p
}

const visible = (b, r) => !!b && boitesCroisees(b, r)

/** Traits, masses et textes dont l'emprise croise `rect` (mètres). */
export function elementsVisibles(vecteurs, rect) {
  if (!vecteurs) return { traits: [], masses: [], textes: [] }
  const { textes } = preparation(vecteurs)
  return {
    traits: (vecteurs.traits ?? []).filter((t) => visible(t.boite, rect)),
    masses: (vecteurs.masses ?? []).filter((m) => visible(m.boite, rect)),
    textes: (vecteurs.textes ?? []).filter((x, i) => visible(textes[i].boite, rect)),
  }
}

// Mètres → pixels d'écran en une multiplication et une addition par axe,
// sans tableau intermédiaire : des dizaines de milliers de points par image
// pendant un pincement
function tracer(ctx, pts, ferme, r) {
  for (let i = 0; i < pts.length; i++) {
    const x = r.ax + pts[i][0] * r.k
    const y = r.ay - pts[i][1] * r.k
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  if (ferme) ctx.closePath()
}

/**
 * Dessine l'étage dans `ctx`, repère en pixels CSS du conteneur (`t` : second
 * argument de `dessinFond` de la visionneuse). Masses d'abord (les traits
 * longs gardés des murs passent par-dessus), puis traits, puis textes, comme
 * l'image enregistrée. Chaque élément est testé et tracé sur place : aucune
 * liste filtrée n'est construite à chaque image.
 */
export function dessinerVecteurs(ctx, vecteurs, cadrage, t) {
  if (!vecteurs || !cadrage || !(t?.echelle > 0)) return
  const rect = rectangleVisible(cadrage, t)
  const prep = preparation(vecteurs)
  // versEcran(versPixels(p)) développé : sx = ex + (x − x0)·ppm·e,
  // sy = ey + (y1 − y)·ppm·e
  const [ex, ey] = t.versEcran(0, 0)
  const k = cadrage.pxParMetre * t.echelle
  const vers = { ax: ex - cadrage.x0 * k, ay: ey + cadrage.y1 * k, k }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Un remplissage par calque : en evenodd sur un seul chemin, deux masses
  // de calques différents qui se chevauchent se creuseraient l'une l'autre ;
  // celles d'un même calque, nées d'une même grille, ne se chevauchent
  // jamais. Une vingtaine de masses sur un étage réel.
  let massesVues = false
  ctx.fillStyle = '#FFFFFF'
  for (const masses of prep.massesParCalque) {
    let vues = false
    for (const m of masses) {
      if (!visible(m.boite, rect)) continue
      if (!vues) { ctx.beginPath(); vues = true }
      for (const anneau of m.anneaux) tracer(ctx, anneau, true, vers)
    }
    if (vues) { ctx.fill('evenodd'); massesVues = true }
  }
  if (massesVues) {
    ctx.strokeStyle = COULEUR_MASSE
    ctx.lineWidth = EPAISSEUR_CONTOUR_MASSE
    ctx.beginPath()
    for (const m of vecteurs.masses) {
      if (visible(m.boite, rect)) for (const anneau of m.anneaux) tracer(ctx, anneau, true, vers)
    }
    ctx.stroke()
  }

  let traitsVus = false
  for (const trait of vecteurs.traits ?? []) {
    if (!visible(trait.boite, rect)) continue
    if (!traitsVus) {
      ctx.strokeStyle = COULEUR_TRAIT
      ctx.lineWidth = EPAISSEUR_TRAIT
      ctx.beginPath()
      traitsVus = true
    }
    tracer(ctx, trait.pts, trait.ferme, vers)
  }
  if (traitsVus) ctx.stroke()

  ctx.fillStyle = COULEUR_MASSE
  ctx.textBaseline = 'alphabetic'
  let police = null
  const textes = vecteurs.textes ?? []
  for (let i = 0; i < textes.length; i++) {
    const x = textes[i]
    // La hauteur d'abord : la plupart des textes sont trop petits en vue
    // d'ensemble, inutile de tester leur emprise
    const h = x.hauteur * k // hauteur réelle, en pixels d'écran
    if (!(h >= HAUTEUR_TEXTE_MIN)) continue
    const { boite: b, lignes } = prep.textes[i]
    if (!visible(b, rect)) continue
    const voulue = `${Math.round(h * 10) / 10}px Arial, sans-serif`
    if (voulue !== police) { ctx.font = voulue; police = voulue }
    const sx = vers.ax + x.pos[0] * k
    const sy = vers.ay - x.pos[1] * k
    for (let n = 0; n < lignes.length; n++) ctx.fillText(lignes[n], sx, sy + n * h * INTERLIGNE)
  }
}

// ─── Mémoire des étages décodés ──────────────────────────────────────────────
//
// Un étage gardé avec « Garder » partout peut porter des centaines de milliers
// de traits : décodé, il dépasse la centaine de Mo. Compter les étages ne
// protégeait donc rien ; la mémoire se compte en points décodés (un point =
// un tableau de deux nombres, de l'ordre de 50 à 70 octets en JavaScript).
export const POINTS_GARDES_MAX = 1_500_000

/** Poids d'un étage décodé, en points (traits, anneaux des masses, textes). */
export function pointsVecteurs(vecteurs) {
  let n = 0
  for (const t of vecteurs?.traits ?? []) n += t.pts?.length ?? 0
  for (const m of vecteurs?.masses ?? []) for (const a of m.anneaux ?? []) n += a.length
  return n + (vecteurs?.textes?.length ?? 0)
}

/**
 * Étages à retirer de la mémoire, les plus anciens d'abord, jusqu'à tenir
 * dans le budget. L'étage `garde` (celui qu'on affiche) n'est jamais retiré,
 * même seul au-dessus du budget.
 * @param poids Map chemin → points, dans l'ordre d'usage (le plus ancien en tête)
 */
export function cheminsAEcarter(poids, garde, budget = POINTS_GARDES_MAX) {
  let total = 0
  for (const p of poids.values()) total += p
  const ecartes = []
  for (const [chemin, p] of poids) {
    if (total <= budget) break
    if (chemin === garde) continue
    ecartes.push(chemin)
    total -= p
  }
  return ecartes
}
