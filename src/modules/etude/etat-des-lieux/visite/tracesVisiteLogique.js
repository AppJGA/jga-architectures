// ─── Liaisons et cotes pendant la visite : modes et dessin (logique pure) ───
//
// Deux modes de la visite (migration 084) :
//   · « Relier » — ouvert depuis le panneau d'un interrupteur ou d'un
//     luminaire ; le toucher suivant sur un point compatible crée la liaison,
//     un toucher ailleurs ne pose rien et dit pourquoi ;
//   · « Coter » — ouvert depuis la barre de la pièce ; les deux touchers
//     suivants s'accrochent aux angles du contour de la pièce, aucun point
//     n'est posé.
// Et la géométrie du dessin, commune à l'écran, au DXF et aux planches :
// `courbeCommande` (trait courbe du dessin électrique) et `traitsCote`
// (ligne de cote, traits obliques, texte jamais à l'envers).
// Pur, testé (tests/etat-des-lieux-traces.test.js).

import { estInterrupteur, estLuminaire, liaisonPossible, liaisonExiste, angleLePlusProche, texteValeur, valeurCote } from '../tracesEdl.js'
import { typeEdl } from '../calquesEdl.js'

// Couleurs du dessin : électricité pour les liaisons, bleu canard des cotes
// (distinct du bleu des propositions de l'IA, qui les dessine en tirets)
export const COULEUR_COMMANDE = '#1565C0'
export const COULEUR_COTE = '#0E7490'

// Flèche de la courbe d'une liaison : 20 % de la longueur
export const FLECHE_COMMANDE = 0.2

const court = (point) => `P${point?.numero ?? '?'}`
const nomType = (point) => typeEdl(point?.type)?.libelle?.toLowerCase() ?? 'sans type'

// ─── Modes ───────────────────────────────────────────────────────────────────

/**
 * Le mode « Relier » ouvert depuis ce point, ou null s'il n'est ni un
 * interrupteur ni un luminaire. `attendu` : ce que le toucher suivant doit
 * désigner.
 */
export function debutRelier(point) {
  if (estInterrupteur(point)) return { sorte: 'relier', depuis: point.id, attendu: 'luminaire', raison: null }
  if (estLuminaire(point)) return { sorte: 'relier', depuis: point.id, attendu: 'interrupteur', raison: null }
  return null
}

/**
 * Le mode « Coter ». L'identifiant de la future cote est décidé dès
 * l'ouverture : les deux touchers d'angle notés au journal le portent, la
 * frise de l'analyse les rattache ainsi à leur cote.
 */
export function debutCoter(traceId = crypto.randomUUID()) {
  return { sorte: 'coter', traceId, angles: [], raison: null }
}

/** Ce que la barre de la pièce affiche pendant un mode (la raison d'un refus d'abord). */
export function consigneMode(mode) {
  if (!mode) return null
  if (mode.raison) return mode.raison
  if (mode.sorte === 'relier') return mode.attendu === 'luminaire' ? 'Touchez le luminaire à relier' : 'Touchez l’interrupteur à relier'
  if (mode.sorte === 'coter') return mode.angles.length ? 'Touchez le second angle de la cote' : 'Touchez le premier angle de la cote'
  return null
}

/**
 * Toucher pendant « Relier ». `cible` : le point touché, ou null (le plan,
 * une pièce). Rend :
 *   { action: 'creer', interrupteur, luminaire }   la liaison à créer ;
 *   { action: 'refus', mode }                      rien de posé, `mode.raison` dit pourquoi.
 */
export function toucherRelier(mode, cible, { points = [], traces = [] } = {}) {
  const depuis = points.find((p) => p.id === mode.depuis) ?? null
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

const memeAngle = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

/**
 * Toucher pendant « Coter » : accroché à l'angle le plus proche du contour
 * de la pièce, à `toleranceM` près (zone sensible de 44 px autour de chaque
 * angle ; sans tolérance, l'angle le plus proche quel qu'il soit). Rend :
 *   { action: 'angle', angle, mode }     premier angle retenu ;
 *   { action: 'creer', angle, a, b }     second angle : la cote à créer ;
 *   { action: 'refus', mode }            rien de retenu, `mode.raison` dit pourquoi.
 */
export function toucherCoter(mode, contour, position, toleranceM = Infinity) {
  const refus = (raison) => ({ action: 'refus', mode: { ...mode, raison } })
  const angle = angleLePlusProche(contour, position)
  if (!angle) return refus('Cette pièce n’a pas de contour : rien à coter.')
  if (Math.hypot(angle[0] - position[0], angle[1] - position[1]) > toleranceM) {
    return refus('Touchez plus près d’un angle de la pièce (rond bleu).')
  }
  const [premier] = mode.angles
  if (!premier) return { action: 'angle', angle, mode: { ...mode, angles: [angle], raison: null } }
  if (memeAngle(premier, angle)) return refus('C’est le même angle : touchez le second angle de la cote.')
  return { action: 'creer', angle, a: premier, b: angle }
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
 * Ligne de cote entre deux angles : la ligne, un trait oblique à 45° centré
 * sur chaque extrémité (de longueur `tic`), et le texte posé au milieu,
 * décalé de `decalage` du côté de son haut, tourné comme la ligne mais
 * jamais à l'envers. `yVersLeBas` : repère de l'écran ou du papier (SVG,
 * planche) ; sinon y vers le haut (mètres, DXF). L'angle du texte est en
 * degrés dans le sens du repère (celui de `rotate()` en SVG, de l'angle
 * d'un TEXT en DXF) ; une cote verticale se lit de la droite (de bas en haut).
 * Rend { ligne, obliques, texte: { position, angle }, longueur } ou null.
 */
export function traitsCote(a, b, { tic = 1, decalage = 1, yVersLeBas = false } = {}) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const longueur = Math.hypot(dx, dy)
  if (!(longueur > 0)) return null
  const ux = dx / longueur
  const uy = dy / longueur
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
  const milieu = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  return {
    ligne: [[a[0], a[1]], [b[0], b[1]]],
    obliques: [oblique(a), oblique(b)],
    // `+ 0` : pas de −0 dans les sorties
    texte: { position: [milieu[0] + haut[0] * decalage, milieu[1] + haut[1] * decalage], angle: angle + 0 },
    longueur,
  }
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
 * null : une liaison se touche sur sa courbe, une cote sur sa ligne.
 */
export function traceProche(traces, points, position, toleranceM) {
  let meilleure = null
  let distance = Infinity
  for (const t of traces ?? []) {
    const bouts = extremitesTrace(t, points)
    if (!bouts) continue
    const traits = t.sorte === 'commande' ? courbeCommande(...bouts)?.points : bouts
    if (!traits) continue
    const d = distanceTrait(position, traits)
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
