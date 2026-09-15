// ─── Plans et pastilles : logique pure ───────────────────────────────────────
//
// Sans navigateur ni base, pour être testée (tests/plans.test.js).

// Plan converti en image : 6 000 px au plus, et 16 millions de pixels au plus —
// au-delà, Safari sur iPad refuse de dessiner le canevas. L'aperçu sert à
// l'affichage rapide et au PDF du compte rendu.
export const TAILLE_PLAN = 6000
export const PIXELS_MAX_PLAN = 16_000_000
export const TAILLE_APERCU_PLAN = 2000

export function dimensionsPlan(largeur, hauteur, max = TAILLE_PLAN, pixelsMax = PIXELS_MAX_PLAN) {
  const echelle = Math.min(1, max / Math.max(largeur, hauteur), Math.sqrt(pixelsMax / (largeur * hauteur)))
  return {
    largeur: Math.max(1, Math.floor(largeur * echelle)),
    hauteur: Math.max(1, Math.floor(hauteur * echelle)),
  }
}

// Indice de version suivant : A → B, Z → AA, AZ → BA. Un indice non
// alphabétique (« 2 », « B1 ») repart de la lettre qui suit sa première lettre.
export function indiceSuivant(indice) {
  const texte = String(indice ?? '').toUpperCase()
  if (!texte) return 'A'
  if (!/^[A-Z]+$/.test(texte)) return /^[A-Z]/.test(texte) ? indiceSuivant(texte[0]) : 'A'
  const lettres = texte.split('')
  let i = lettres.length - 1
  while (i >= 0) {
    if (lettres[i] !== 'Z') {
      lettres[i] = String.fromCharCode(lettres[i].charCodeAt(0) + 1)
      return lettres.join('')
    }
    lettres[i] = 'A'
    i--
  }
  return 'A' + lettres.join('')
}

// Version en vigueur d'un plan : la plus récente
export function versionCourante(versions, planId) {
  return (versions ?? [])
    .filter((v) => v.plan_id === planId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null
}

// Versions d'un plan qu'aucune pastille n'affiche plus, hors version gardée :
// leurs fichiers peuvent partir.
export function versionsInutilisees(versions, pastilles, planId, gardeId) {
  const affichees = new Set((pastilles ?? []).map((p) => p.version_id))
  return (versions ?? []).filter((v) => v.plan_id === planId && v.id !== gardeId && !affichees.has(v.id))
}

const borner = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Cadrage de l'extrait de plan affiché sous une remarque (PDF) : une fenêtre
 * couvrant `part` de la largeur du plan, centrée sur la pastille autant que
 * les bords le permettent.
 *
 * @param x, y        position de la pastille (0 à 1)
 * @param ratioPlan   hauteur / largeur du plan
 * @param ratioCadre  hauteur / largeur de la fenêtre
 * @returns pourcentages CSS : largeur de l'image, décalages, position de la pastille
 */
export function cadrageExtrait(x, y, ratioPlan, ratioCadre = 2 / 3, part = 0.3) {
  let largeur = Math.min(1, part)
  let hauteur = (largeur * ratioCadre) / ratioPlan
  if (hauteur > 1) { // plan très allongé : la fenêtre prend toute la hauteur
    hauteur = 1
    largeur = Math.min(1, ratioPlan / ratioCadre)
  }
  const gauche = borner(x - largeur / 2, 0, 1 - largeur)
  const haut = borner(y - hauteur / 2, 0, 1 - hauteur)
  return {
    imageLargeur: 100 / largeur,
    imageGauche: (-gauche / largeur) * 100,
    imageHaut: (-haut / hauteur) * 100,
    pastilleX: ((x - gauche) / largeur) * 100,
    pastilleY: ((y - haut) / hauteur) * 100,
  }
}

// Point touché sur le plan, en coordonnées relatives, depuis sa position à
// l'écran (rectangle affiché de l'image). Null en dehors du plan.
export function pointSurPlan(clientX, clientY, rect) {
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x, y }
}

/**
 * Zoom autour d'un point de l'écran : le point sous le doigt (ou la souris)
 * reste immobile.
 * @param vue { zoom, dx, dy } transformation actuelle
 * @returns nouvelle transformation
 */
export function zoomAutour(vue, facteur, px, py, zoomMin = 1, zoomMax = 12) {
  const zoom = borner(vue.zoom * facteur, zoomMin, zoomMax)
  const k = zoom / vue.zoom
  return { zoom, dx: px - (px - vue.dx) * k, dy: py - (py - vue.dy) * k }
}

// Garde au moins un quart du plan à l'écran quand on le fait glisser
// (largeur, hauteur : taille du plan affiché au zoom 1)
export function limiterVue(vue, largeur, hauteur) {
  return {
    zoom: vue.zoom,
    dx: borner(vue.dx, largeur * 0.25 - largeur * vue.zoom, largeur * 0.75),
    dy: borner(vue.dy, hauteur * 0.25 - hauteur * vue.zoom, hauteur * 0.75),
  }
}
