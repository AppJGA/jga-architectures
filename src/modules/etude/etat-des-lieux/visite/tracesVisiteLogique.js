// ─── Liaisons, cotes et murs pendant la visite : gestes et dessin (pur) ────
//
// Gestes de la visite, sans bouton de mode (décisions de l'agence du
// 2026-11-20, migration 085) — dans la pièce ouverte, un toucher va :
//   · à un **angle** s'il tombe pile sur un sommet du contour : le premier
//     s'allume (~20 s), le second crée la cote tout de suite (084) ;
//   · sinon à un **mur** s'il tombe pile sur un côté : le mur s'allume et le
//     toucher est noté (`mur-touche`) ; la finition dite autour est lue à
//     l'analyse (rien de dit, rien de créé) ;
//   · sinon comme avant : un point existant se choisit, ou un point se pose.
// « Pile » : `TOLERANCE_PILE_PX` (≈ 1 cm au doigt), plus fin que les points
// (22 px), pour qu'un interrupteur posé près d'un mur reste un point.
// « Relier » reste un mode, ouvert depuis le panneau d'un interrupteur ou
// d'un luminaire. `texteAide` donne les textes d'aide du bandeau.
// Et la géométrie du dessin, commune à l'écran, au DXF et aux planches :
// `courbeCommande` (trait courbe du dessin électrique), `traitsCote` (ligne
// de cote, traits obliques, texte jamais à l'envers) et `decalageFinition`
// (trait d'une finition de mur, décalé dans la pièce).
// Pur, testé (tests/etat-des-lieux-traces.test.js, etat-des-lieux-murs.test.js).

import { estInterrupteur, estLuminaire, liaisonPossible, liaisonExiste, texteValeur, valeurCote, typeEffectif, angleSous, murLePlusProche } from '../tracesEdl.js'
import { typeEdl } from '../calquesEdl.js'
import { pointDansPolygone } from '../geometrieEdl.js'

// Couleurs : électricité pour les liaisons ; bleu canard pour ce qui touche
// aux cotes dans l'interface (angle allumé, champ de la valeur) ; le
// trait de cote lui-même à l'encre, convention du dessin d'architecture
// (le bleu canard est aussi celui de la plomberie sur les planches). Les
// propositions de l'IA se dessinent en tirets de leur bleu.
export const COULEUR_COMMANDE = '#1565C0'
export const COULEUR_COTE = '#0E7490'
export const COULEUR_TRAIT_COTE = '#3A3632'

// Flèche de la courbe d'une liaison : 20 % de la longueur
export const FLECHE_COMMANDE = 0.2

const court = (point) => `P${point?.numero ?? '?'}`
const nomType = (point) => typeEdl(point?.type)?.libelle?.toLowerCase() ?? 'sans type'

// ─── Modes ───────────────────────────────────────────────────────────────────

// Le point avec son type effectif : celui du geste, sinon celui d'un élément
// relevé sur lui par l'analyse (`typeEffectif`)
const effectif = (point, elements) => (point && !point.type && elements?.length ? { ...point, type: typeEffectif(point, elements) } : point)

/**
 * Le mode « Relier » ouvert depuis ce point, ou null s'il n'est ni un
 * interrupteur ni un luminaire — d'après son type, ou à défaut celui que
 * l'analyse lui a donné (`elements`). `attendu` : ce que le toucher suivant
 * doit désigner.
 */
export function debutRelier(pointDuGeste, elements = []) {
  const point = effectif(pointDuGeste, elements)
  if (estInterrupteur(point)) return { sorte: 'relier', depuis: point.id, attendu: 'luminaire', raison: null }
  if (estLuminaire(point)) return { sorte: 'relier', depuis: point.id, attendu: 'interrupteur', raison: null }
  return null
}

/** Ce que la barre de la pièce affiche pendant un mode (la raison d'un refus d'abord). */
export function consigneMode(mode) {
  if (!mode) return null
  if (mode.raison) return mode.raison
  if (mode.sorte === 'relier') return mode.attendu === 'luminaire' ? 'Touchez le luminaire à relier' : 'Touchez l’interrupteur à relier'
  return null
}

/**
 * Toucher pendant « Relier ». `cible` : le point touché, ou null (le plan,
 * une pièce) ; `elements` : ceux de l'analyse, qui typent un point posé sans
 * type. Rend :
 *   { action: 'creer', interrupteur, luminaire }   la liaison à créer ;
 *   { action: 'refus', mode }                      rien de posé, `mode.raison` dit pourquoi.
 */
export function toucherRelier(mode, pointTouche, { points = [], traces = [], elements = [] } = {}) {
  const depuis = effectif(points.find((p) => p.id === mode.depuis) ?? null, elements)
  const cible = effectif(pointTouche, elements)
  const attendu = mode.attendu === 'luminaire' ? 'le luminaire' : 'l’interrupteur'
  const refus = (raison) => ({ action: 'refus', mode: { ...mode, raison } })
  if (!depuis) return refus('Le point de départ n’existe plus : Annuler, puis recommencez.')
  if (!cible) return refus(`Aucun point ici : touchez ${attendu} à relier (rien n’a été relié).`)
  if (cible.id === depuis.id) return refus(`C’est le point de départ : touchez ${attendu} à relier.`)
  const liaison = liaisonPossible(depuis, cible)
  if (!liaison) {
    const voulu = mode.attendu === 'luminaire' ? 'un luminaire' : 'un interrupteur'
    return refus(`${court(cible)} (${nomType(cible)}) n’est pas ${voulu} : rien n’a été relié.`)
  }
  if (liaisonExiste(traces, liaison.interrupteur.id, liaison.luminaire.id)) {
    return refus(`${court(liaison.interrupteur)} et ${court(liaison.luminaire)} sont déjà reliés : touchez un autre point, ou Annuler.`)
  }
  return { action: 'creer', interrupteur: liaison.interrupteur, luminaire: liaison.luminaire }
}

// ─── Angles et murs : toucher sans bouton (085) ─────────────────────────────

// Zone « pile » d'un angle ou d'un mur, en pixels d'écran (≈ 1 cm au doigt)
export const TOLERANCE_PILE_PX = 12
// Le premier angle d'une cote reste allumé ce temps-là
export const DUREE_PREMIER_ANGLE_MS = 20_000
// Un mur touché reste en surbrillance quelques secondes
export const DUREE_MUR_ALLUME_MS = 5_000
// Un texte d'aide s'efface seul (sauf celui du premier angle, tant qu'il est allumé)
export const DUREE_AIDE_MS = 4_000

const memeAngle = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

/**
 * Où va un toucher dans la pièce ouverte, priorité angle > mur > le reste.
 * `contour` : celui de la pièce ouverte (null : plan de l'étage, ni angle ni
 * mur) ; `tolerance` : la zone « pile » en mètres ; `avecAngles` faux (base
 * sans la 084) : un angle n'est que le bout de ses deux murs. `pointExistant`
 * ({ point, distance }) : le point existant le plus proche dans sa zone du
 * doigt — il l'emporte sur l'angle ou le mur seulement s'il est plus près du
 * doigt qu'eux (un point déjà posé contre un mur se choisit en touchant son
 * centre ; toucher le mur lui-même va au mur).
 * Rend { sorte: 'angle', angle, index } | { sorte: 'mur', mur } |
 * { sorte: 'point', point } | { sorte: 'plan' } (rien de tout cela : la
 * suite d'avant, trace ou point posé).
 */
export function cibleToucher({ contour = null, position, tolerance, pointExistant = null, avecAngles = true }) {
  const angle = contour && avecAngles ? angleSous(contour, position, tolerance) : null
  const mur = contour && !angle ? murLePlusProche(contour, position, tolerance) : null
  const pile = angle ?? mur
  if (pointExistant?.point && (!pile || pointExistant.distance < pile.distance)) return { sorte: 'point', point: pointExistant.point }
  if (angle) return { sorte: 'angle', angle: angle.angle, index: angle.index }
  if (mur) return { sorte: 'mur', mur }
  return { sorte: 'plan' }
}

/** Le premier angle d'une cote est-il encore allumé à `maintenant` ? */
export const premierAngleActif = (premier, maintenant) => !!premier && maintenant < premier.jusqua

/**
 * Toucher pile sur un angle. `premier` : le premier angle allumé
 * ({ angle, traceId, jusqua }) ou null. Rend :
 *   { action: 'premier', premier }        l'angle s'allume (identifiant de la
 *                                          future cote décidé ici : le journal
 *                                          des deux angles le porte) ;
 *   { action: 'creer', a, b, traceId }    second angle : la cote à créer ;
 *   { action: 'meme', premier }           le même angle : rien de créé, il
 *                                          reste allumé (délai relancé).
 * Un premier angle éteint (délai passé) compte pour rien.
 */
export function toucherAngle(premier, angle, { maintenant, traceId = null } = {}) {
  const jusqua = maintenant + DUREE_PREMIER_ANGLE_MS
  if (premierAngleActif(premier, maintenant)) {
    if (memeAngle(premier.angle, angle)) return { action: 'meme', premier: { ...premier, jusqua } }
    return { action: 'creer', a: premier.angle, b: [angle[0], angle[1]], traceId: premier.traceId }
  }
  return { action: 'premier', premier: { angle: [angle[0], angle[1]], traceId: traceId ?? crypto.randomUUID(), jusqua } }
}

/**
 * Ce que le journal garde d'un mur touché (`mur-touche`) : ses extrémités
 * en mètres, le côté du contour (`index`) et sa longueur — de quoi la frise
 * de l'analyse le nomme (`M<n>`) et y rattache la finition dite.
 */
export function detailMurTouche(mur) {
  const r = (v) => Math.round(v * 1000) / 1000
  return { xa: r(mur.a[0]), ya: r(mur.a[1]), xb: r(mur.b[0]), yb: r(mur.b[1]), index: mur.index, longueur: r(mur.longueur) }
}

// ─── Textes d'aide (validés par l'agence, 2026-11-20) ───────────────────────

const libelleTypePoint = (point) => typeEdl(point?.type)?.libelle ?? null

/**
 * Le texte d'aide du bandeau après un geste, ou null.
 *   { sorte: 'entree', piece: 'Cuisine', angles? }   entrée dans une pièce
 *     (`angles` faux sans la 084 : « touchez un angle » n'y est pas) ;
 *   { sorte: 'angle' }                                premier angle ;
 *   { sorte: 'cote' }                                 second angle, cote créée ;
 *   { sorte: 'mur' }                                  mur touché ;
 *   { sorte: 'point-pose', point }                    point posé dans la pièce ;
 *   { sorte: 'hors-piece' }                           point posé hors des pièces ;
 *   { sorte: 'point-touche', point, relier? }         point existant (`relier` :
 *                                                      interrupteur ou luminaire) ;
 *   { sorte: 'relier', attendu }                      « Relier » ouvert ;
 *   { sorte: 'liaison', interrupteur, luminaire }     liaison créée.
 */
export function texteAide(evenement) {
  const e = evenement ?? {}
  switch (e.sorte) {
    case 'entree':
      return e.angles === false
        ? `${e.piece} · touchez un mur, ou posez un point`
        : `${e.piece} · touchez un angle, un mur, ou posez un point`
    case 'angle':
      return 'Angle choisi · touchez un 2ᵉ angle pour coter'
    case 'cote':
      return 'Cote créée · dites la dimension ou tapez-la'
    case 'mur':
      return 'Mur choisi · dites sa finition (ex. faïence toute hauteur) — sans rien dire, rien n’est enregistré'
    case 'point-pose':
      return `Point ${court(e.point)} posé · dites ce que c’est ou choisissez son type`
    case 'hors-piece':
      return 'Point posé hors pièce · il est rattaché à l’étage'
    case 'point-touche': {
      const type = libelleTypePoint(e.point)
      const actions = e.relier ? 'dites ce qui change, photographiez ou reliez' : 'dites ce qui change ou photographiez'
      return `${court(e.point)}${type ? ` · ${type}` : ''} · ${actions}`
    }
    case 'relier':
      return e.attendu === 'interrupteur'
        ? 'Touchez l’interrupteur qui commande ce luminaire'
        : 'Touchez le luminaire commandé par cet interrupteur'
    case 'liaison':
      return `Liaison ${court(e.interrupteur)} → ${court(e.luminaire)} créée`
    default:
      return null
  }
}

// ─── Dessin ──────────────────────────────────────────────────────────────────

/**
 * Courbe d'une liaison de l'interrupteur `a` au luminaire `b` : Bézier
 * quadratique dont la flèche (écart au milieu de la corde) vaut 20 % de la
 * longueur, toujours à gauche du sens a → b dans un repère y vers le haut
 * (mètres du plan, DXF). Calculer dans ce repère puis convertir : le côté
 * reste le bon une fois le plan affiché. Rend { a, controle, b, sommet,
 * points } (`points` : la courbe en `segments` traits, pour un DXF R12 qui
 * n'a pas de courbes), ou null si les deux points se confondent.
 */
export function courbeCommande(a, b, { segments = 16 } = {}) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const longueur = Math.hypot(dx, dy)
  if (!(longueur > 0)) return null
  // Normale à gauche du sens a → b (repère y vers le haut)
  const nx = -dy / longueur
  const ny = dx / longueur
  const milieu = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const fleche = FLECHE_COMMANDE * longueur
  // Le sommet d'une quadratique est à mi-chemin du milieu et du point de contrôle
  const controle = [milieu[0] + nx * 2 * fleche, milieu[1] + ny * 2 * fleche]
  const sommet = [milieu[0] + nx * fleche, milieu[1] + ny * fleche]
  const points = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    points.push([
      u * u * a[0] + 2 * u * t * controle[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * controle[1] + t * t * b[1],
    ])
  }
  return { a: [a[0], a[1]], controle, b: [b[0], b[1]], sommet, points }
}

/**
 * Côté intérieur d'une cote prise entre deux angles de la pièce, en mètres
 * du plan (y vers le haut) : +1 à gauche du sens a → b, −1 à droite. Trois
 * essais le long de la corde, de part et d'autre, votent ; à égalité (cote
 * en diagonale, pièce inconnue), la gauche. Le signe se reporte tel quel à
 * `traitsCote` dans tout repère (écran, papier) : passer de y vers le haut à
 * y vers le bas retourne aussi la normale « à gauche ».
 */
export function sensInterieurCote(a, b, contour) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const longueur = Math.hypot(dx, dy)
  if (!(longueur > 0) || !Array.isArray(contour) || contour.length < 3) return 1
  const n = [-dy / longueur, dx / longueur]
  const pas = Math.min(0.05, longueur * 0.05)
  let vote = 0
  for (const t of [0.25, 0.5, 0.75]) {
    const m = [a[0] + dx * t, a[1] + dy * t]
    const gauche = pointDansPolygone([m[0] + n[0] * pas, m[1] + n[1] * pas], contour)
    const droite = pointDansPolygone([m[0] - n[0] * pas, m[1] - n[1] * pas], contour)
    if (gauche && !droite) vote += 1
    else if (droite && !gauche) vote -= 1
  }
  return vote < 0 ? -1 : 1
}

/**
 * Ligne de cote entre deux angles, dans les unités du repère reçu.
 *
 * Sans `sens` (ancien tracé) : la ligne d'angle à angle. Avec `sens` (+1 /
 * −1, de `sensInterieurCote`) : la ligne de cote est tracée parallèle, à
 * `ecart` à l'intérieur de la pièce, pour ne pas se confondre avec le mur ;
 * une ligne d'attache part de chaque angle (à `jeu` de l'angle) et dépasse
 * la ligne de cote de `jeu`. Un trait oblique à 45° (longueur `tic`) marque
 * chaque bout de la ligne de cote ; la valeur est posée au milieu, à
 * `decalage` de la ligne du côté de l'intérieur, tournée comme la ligne mais
 * jamais à l'envers : quand son haut regarde le mur, sa ligne de base
 * s'écarte de `hauteurTexte` de plus pour que le texte ne touche pas la
 * ligne. `yVersLeBas` : repère de l'écran ou du papier (SVG, planche) ;
 * sinon y vers le haut (mètres, DXF). L'angle du texte est en degrés dans le
 * sens du repère (celui de `rotate()` en SVG, de l'angle d'un TEXT en DXF) ;
 * une cote verticale se lit de la droite (de bas en haut).
 * Rend { ligne, attaches, obliques, texte: { position, angle }, longueur,
 * normale } ou null.
 */
export function traitsCote(a, b, { tic = 1, decalage = 1, yVersLeBas = false, sens = null, ecart = 0, jeu = 0, hauteurTexte = 0 } = {}) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const longueur = Math.hypot(dx, dy)
  if (!(longueur > 0)) return null
  const ux = dx / longueur
  const uy = dy / longueur
  const decale = sens === 1 || sens === -1
  // Normale vers l'intérieur : « à gauche » vue sur le plan, quel que soit le repère
  const normale = decale ? (yVersLeBas ? [uy * sens, -ux * sens] : [-uy * sens, ux * sens]) : [0, 0]
  const pousser = (p, d) => [p[0] + normale[0] * d, p[1] + normale[1] * d]
  const a2 = decale ? pousser(a, ecart) : [a[0], a[1]]
  const b2 = decale ? pousser(b, ecart) : [b[0], b[1]]
  const attaches = decale && ecart > jeu ? [[pousser(a, jeu), pousser(a, ecart + jeu)], [pousser(b, jeu), pousser(b, ecart + jeu)]] : []

  // Oblique : la direction de la ligne tournée de 45°, la même aux deux bouts,
  // dans le sens qui la montre en « / » sur une cote horizontale quel que soit
  // le repère (y vers le bas : le sens de rotation s'inverse)
  const c = Math.SQRT1_2
  const s = yVersLeBas ? -1 : 1
  const ox = (ux * c - s * uy * c) * (tic / 2)
  const oy = (s * ux * c + uy * c) * (tic / 2)
  const oblique = (p) => [[p[0] - ox, p[1] - oy], [p[0] + ox, p[1] + oy]]

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI
  // Texte la tête en bas : retourné d'un demi-tour. Bornes : une verticale se
  // lit de bas en haut, soit 90° y vers le haut, −90° y vers le bas
  if (yVersLeBas) {
    if (angle >= 90) angle -= 180
    else if (angle < -90) angle += 180
  } else if (angle > 90) angle -= 180
  else if (angle <= -90) angle += 180
  const r = (angle * Math.PI) / 180
  // Le haut du texte : sa ligne de base tournée d'un quart de tour vers le haut du repère
  const haut = yVersLeBas ? [Math.sin(r), -Math.cos(r)] : [-Math.sin(r), Math.cos(r)]
  const milieu = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2]
  let position
  if (!decale) position = [milieu[0] + haut[0] * decalage, milieu[1] + haut[1] * decalage]
  else {
    const versLInterieur = haut[0] * normale[0] + haut[1] * normale[1] >= 0
    position = pousser(milieu, decalage + (versLInterieur ? 0 : hauteurTexte))
  }
  return {
    ligne: [a2, b2],
    attaches,
    obliques: [oblique(a2), oblique(b2)],
    // `+ 0` : pas de −0 dans les sorties
    texte: { position: position.map((v) => v + 0), angle: angle + 0 },
    longueur,
    normale,
  }
}

/**
 * Trait d'une finition de mur : le mur de `a` à `b`, décalé de `ecart` vers
 * l'intérieur de la pièce (`sens` de `sensInterieurCote`, calculé en mètres
 * y vers le haut puis reporté tel quel), pour se lire à côté du trait du mur
 * au lieu de le recouvrir. Dans les unités du repère reçu ; `yVersLeBas` :
 * écran ou papier. Même convention que `traitsCote` : écran, planche et DXF
 * placent la finition du même côté. Rend { a, b, normale } ou null.
 */
export function decalageFinition(a, b, { sens = 1, ecart = 0, yVersLeBas = false } = {}) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const longueur = Math.hypot(dx, dy)
  if (!(longueur > 0)) return null
  const ux = dx / longueur
  const uy = dy / longueur
  const s = sens === -1 ? -1 : 1
  const normale = yVersLeBas ? [uy * s, -ux * s] : [-uy * s, ux * s]
  const pousser = (p) => [p[0] + normale[0] * ecart + 0, p[1] + normale[1] * ecart + 0]
  return { a: pousser(a), b: pousser(b), normale: normale.map((v) => v + 0) }
}

/** Les deux bouts d'une finition de mur en mètres ([a, b]), ou null. */
export function extremitesFinition(trace) {
  const v = [trace?.xa, trace?.ya, trace?.xb, trace?.yb].map((x) => (x === null || x === undefined || x === '' ? NaN : Number(x)))
  return trace?.sorte === 'finition' && v.every(Number.isFinite) ? [[v[0], v[1]], [v[2], v[3]]] : null
}

/**
 * La valeur d'une cote hors des symboles : centrée si sa boîte ne touche
 * aucun obstacle, sinon glissée le long de la ligne de cote, par pas de `pas`
 * (+pas, −pas, +2 pas…) tant qu'elle reste sur la ligne ; centrée si rien
 * n'est libre. `cote` : sortie de `traitsCote` ; `largeur`, `hauteur` : la
 * boîte du texte (ligne de base, vers son haut) ; `obstacles` : boîtes
 * { xmin, ymin, xmax, ymax } du même repère.
 * Rend { position, coins, glisse } (`coins` : les quatre coins de la boîte).
 */
export function placerValeurCote(cote, { largeur, hauteur, obstacles = [], pas, yVersLeBas = false }) {
  const r = (cote.texte.angle * Math.PI) / 180
  const u = [Math.cos(r), Math.sin(r)]
  const haut = yVersLeBas ? [Math.sin(r), -Math.cos(r)] : [-Math.sin(r), Math.cos(r)]
  const coinsA = (p) => {
    const g = [p[0] - (u[0] * largeur) / 2, p[1] - (u[1] * largeur) / 2]
    const d = [p[0] + (u[0] * largeur) / 2, p[1] + (u[1] * largeur) / 2]
    return [g, d, [d[0] + haut[0] * hauteur, d[1] + haut[1] * hauteur], [g[0] + haut[0] * hauteur, g[1] + haut[1] * hauteur]]
  }
  const boite = (coins) => ({
    xmin: Math.min(...coins.map((p) => p[0])), xmax: Math.max(...coins.map((p) => p[0])),
    ymin: Math.min(...coins.map((p) => p[1])), ymax: Math.max(...coins.map((p) => p[1])),
  })
  const touche = (b) => obstacles.some((o) => b.xmin < o.xmax && o.xmin < b.xmax && b.ymin < o.ymax && o.ymin < b.ymax)
  const [x0, y0] = cote.texte.position
  const marge = Math.max(0, (cote.longueur - largeur) / 2)
  const essais = [0]
  if (pas > 0) for (let k = 1; k * pas <= marge + 1e-9; k++) essais.push(k * pas, -k * pas)
  for (const glisse of essais) {
    const position = [x0 + u[0] * glisse, y0 + u[1] * glisse]
    const coins = coinsA(position)
    if (!touche(boite(coins))) return { position, coins, glisse }
  }
  return { position: [x0, y0], coins: coinsA([x0, y0]), glisse: 0 }
}

// ─── Touchers et libellés ────────────────────────────────────────────────────

function distanceSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const distanceTrait = (p, traits) => {
  let d = Infinity
  for (let i = 1; i < traits.length; i++) d = Math.min(d, distanceSegment(p, traits[i - 1], traits[i]))
  return d
}

/** Les deux extrémités d'une trace en mètres ([a, b]), ou null (point disparu, cote incomplète). */
export function extremitesTrace(trace, points) {
  if (trace?.sorte === 'commande') {
    const a = points.find((p) => p.id === trace.point_a)
    const b = points.find((p) => p.id === trace.point_b)
    return a && b ? [[Number(a.x), Number(a.y)], [Number(b.x), Number(b.y)]] : null
  }
  const v = [trace?.xa, trace?.ya, trace?.xb, trace?.yb].map(Number)
  return trace?.sorte === 'cote' && v.every(Number.isFinite) ? [[v[0], v[1]], [v[2], v[3]]] : null
}

/**
 * La trace la plus proche de `position` (mètres) à `toleranceM` près, ou
 * null : une liaison se touche sur sa courbe, une cote sur sa ligne de cote
 * (décalée de `ecartCote` mètres dans sa pièce, `contourDe(trace)`) comme
 * sur le mur entre ses deux angles.
 */
export function traceProche(traces, points, position, toleranceM, { ecartCote = 0, contourDe = () => null } = {}) {
  let meilleure = null
  let distance = Infinity
  for (const t of traces ?? []) {
    const bouts = extremitesTrace(t, points)
    if (!bouts) continue
    let d
    if (t.sorte === 'commande') {
      const traits = courbeCommande(...bouts)?.points
      if (!traits) continue
      d = distanceTrait(position, traits)
    } else {
      d = distanceTrait(position, bouts)
      if (ecartCote > 0) {
        const c = traitsCote(bouts[0], bouts[1], { sens: sensInterieurCote(bouts[0], bouts[1], contourDe(t)), ecart: ecartCote })
        if (c) d = Math.min(d, distanceTrait(position, c.ligne))
      }
    }
    if (d <= toleranceM && d < distance) {
      distance = d
      meilleure = t
    }
  }
  return meilleure
}

/** « 3,45 m », ou « ? » tant que personne n'a donné la valeur. */
export const texteCote = (trace) => texteValeur(valeurCote(trace?.valeur)) ?? (trace?.valeur ? String(trace.valeur) : '?')

/** Titre du panneau d'une trace choisie : « Liaison P3 → P7 », « Cote 3,45 m », « Cote à préciser ». */
export function libelleTrace(trace, points) {
  if (trace?.sorte === 'commande') {
    const a = points.find((p) => p.id === trace.point_a)
    const b = points.find((p) => p.id === trace.point_b)
    return `Liaison ${court(a)} → ${court(b)}`
  }
  const v = texteCote(trace)
  return v === '?' ? 'Cote à préciser' : `Cote ${v}`
}

/** Les traces qui concernent une pièce : la sienne, ou une liaison dont un bout y est posé. */
export function tracesDeLaPiece(traces, pieceId, points = []) {
  if (!pieceId) return []
  const dedans = new Set(points.filter((p) => p.piece_id === pieceId).map((p) => p.id))
  return (traces ?? []).filter((t) => t.piece_id === pieceId || dedans.has(t.point_a) || dedans.has(t.point_b))
}

/**
 * Le geste « suppression » d'un point, à empiler pour « Annuler » : il
 * emporte ses photos et ses liaisons (parties avec lui par cascade), que
 * l'annulation remet à l'écran et en base.
 */
export function gesteSuppressionPoint(point, { photos = [], traces = [] } = {}) {
  return {
    type: 'suppression',
    point,
    photos: photos.filter((ph) => ph.point_id === point.id),
    traces: traces.filter((t) => t.point_a === point.id || t.point_b === point.id),
  }
}
