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

/** Traits, masses et textes dont l'emprise croise `rect` (mètres). */
export function elementsVisibles(vecteurs, rect) {
  return {
    traits: (vecteurs?.traits ?? []).filter((t) => t.boite && boitesCroisees(t.boite, rect)),
    masses: (vecteurs?.masses ?? []).filter((m) => m.boite && boitesCroisees(m.boite, rect)),
    textes: (vecteurs?.textes ?? []).filter((x) => x.pos && boitesCroisees(boiteTexte(x), rect)),
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
 * l'image enregistrée.
 */
export function dessinerVecteurs(ctx, vecteurs, cadrage, t) {
  if (!vecteurs || !cadrage || !(t?.echelle > 0)) return
  const visibles = elementsVisibles(vecteurs, rectangleVisible(cadrage, t))
  // versEcran(versPixels(p)) développé : sx = ex + (x − x0)·ppm·e,
  // sy = ey + (y1 − y)·ppm·e
  const [ex, ey] = t.versEcran(0, 0)
  const k = cadrage.pxParMetre * t.echelle
  const vers = { ax: ex - cadrage.x0 * k, ay: ey + cadrage.y1 * k, k }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (visibles.masses.length) {
    // Un remplissage par calque : en evenodd sur un seul chemin, deux masses
    // de calques différents qui se chevauchent se creuseraient l'une
    // l'autre ; celles d'un même calque, nées d'une même grille, ne se
    // chevauchent jamais. Une vingtaine de masses sur un étage réel.
    const parCalque = new Map()
    for (const m of visibles.masses) {
      if (!parCalque.has(m.calque)) parCalque.set(m.calque, [])
      parCalque.get(m.calque).push(m)
    }
    ctx.fillStyle = '#FFFFFF'
    for (const masses of parCalque.values()) {
      ctx.beginPath()
      for (const m of masses) for (const anneau of m.anneaux) tracer(ctx, anneau, true, vers)
      ctx.fill('evenodd')
    }
    ctx.strokeStyle = COULEUR_MASSE
    ctx.lineWidth = EPAISSEUR_CONTOUR_MASSE
    ctx.beginPath()
    for (const m of visibles.masses) for (const anneau of m.anneaux) tracer(ctx, anneau, true, vers)
    ctx.stroke()
  }

  if (visibles.traits.length) {
    ctx.strokeStyle = COULEUR_TRAIT
    ctx.lineWidth = EPAISSEUR_TRAIT
    ctx.beginPath()
    for (const trait of visibles.traits) tracer(ctx, trait.pts, trait.ferme, vers)
    ctx.stroke()
  }

  ctx.fillStyle = COULEUR_MASSE
  ctx.textBaseline = 'alphabetic'
  let police = null
  for (const x of visibles.textes) {
    const h = x.hauteur * k // hauteur réelle, en pixels d'écran
    if (!(h >= HAUTEUR_TEXTE_MIN)) continue
    const voulue = `${Math.round(h * 10) / 10}px Arial, sans-serif`
    if (voulue !== police) { ctx.font = voulue; police = voulue }
    const sx = vers.ax + x.pos[0] * k
    const sy = vers.ay - x.pos[1] * k
    String(x.texte).split('\n').forEach((ligne, k) => ctx.fillText(ligne, sx, sy + k * h * INTERLIGNE))
  }
}
