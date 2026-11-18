// ─── Visite d'un état des lieux : ce qui se calcule sans navigateur ──────────
//
// Pièce sous le doigt, cadre d'une pièce agrandie, numéros des points, pièces
// visitées, pense-bête, ce que le journal note quand le micro change d'état.
// Pur, testé (tests/etat-des-lieux-visite.test.js).

import { aire, pointDansPolygone, boite, versPixels } from '../geometrieEdl'
import { etatAnalysePiece } from '../analyse/analyseEdlLogique'

// Un placard sur un étage de 60 m doit pouvoir remplir l'écran ; le plan
// (image) s'adoucit à ce zoom, les contours et les points restent nets (SVG)
export const ZOOM_MAX_VISITE = 60

export const PENSE_BETE = [
  { cle: 'sol', libelle: 'Sol' },
  { cle: 'murs', libelle: 'Murs' },
  { cle: 'plafond', libelle: 'Plafond' },
  { cle: 'plinthes', libelle: 'Plinthes' },
  { cle: 'hsp', libelle: 'HSP' },
]

const rempli = (v) => v != null && String(v).trim() !== ''

/** Rubriques de la fiche à dire dans la pièce ; cochées quand l'analyse (lot 3) les a remplies. */
export function penseBete(fiche) {
  return PENSE_BETE.map((r) => ({ ...r, fait: rempli(fiche?.[r.cle]) }))
}

/** La plus petite pièce qui contient le point (mètres), ou null. */
export function pieceSous(pieces, point) {
  const sous = (pieces ?? []).filter((p) => p.contour?.length >= 3 && pointDansPolygone(point, p.contour))
  if (!sous.length) return null
  return sous.reduce((a, b) => (aire(b.contour) < aire(a.contour) ? b : a))
}

/**
 * Le point le plus proche de l'endroit touché, s'il est à moins de
 * `toleranceM` mètres (la zone de 44 px au doigt, convertie par l'écran).
 * Seul le point choisi capture le doigt (pour le glisser) ; les autres se
 * choisissent ainsi, et un doigt posé dessus fait toujours défiler le plan.
 */
export function pointProche(points, [x, y], toleranceM) {
  let meilleur = null
  let distance = toleranceM
  for (const p of points ?? []) {
    const d = Math.hypot(Number(p.x) - x, Number(p.y) - y)
    if (d <= distance) { meilleur = p; distance = d }
  }
  return meilleur
}

/** Cadre d'une pièce dans l'image de son étage, en fractions (0 à 1) : la visionneuse l'agrandit à tout l'écran. */
export function cadrePiece(piece, niveau) {
  const [x0, y0, x1, y1] = boite(piece.contour.map((p) => versPixels(niveau.cadrage, p)))
  return { x0: x0 / niveau.largeur, y0: y0 / niveau.hauteur, x1: x1 / niveau.largeur, y1: y1 / niveau.hauteur }
}

export const designationPiece = (p) => [p?.numero, p?.nom].filter(Boolean).join(' · ') || 'Pièce sans nom'

/** Les points sont numérotés dans l'ordre de l'état des lieux, toutes visites confondues. */
export function numeroSuivant(points) {
  return (points ?? []).reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1
}

/** Un point rendu par « Annuler » garde son numéro, sauf si un autre l'a pris entre-temps. */
export function numeroPourRestauration(point, points) {
  const pris = (points ?? []).some((p) => p.id !== point.id && p.numero === point.numero)
  return pris ? numeroSuivant(points) : point.numero
}

export const arrondirMetre = (v) => Math.round(Number(v) * 1000) / 1000

/** Pièces où l'on est entré au moins une fois, toutes visites confondues. */
export function piecesVisitees(entrees) {
  return new Set((entrees ?? []).map((e) => e.piece_id).filter(Boolean))
}

// Lot 2 : visitée ou non (encore employé sans la migration 082)
export const etatPiece = (piece, visitees) => (visitees.has(piece.id) ? 'visitee' : 'non-visitee')

/**
 * Lot 3 : couleur d'après l'analyse (`etatAnalysePiece`). Une pièce est en
 * attente tant qu'elle n'a jamais été analysée, qu'on y est entré depuis la
 * dernière analyse (entrées de l'appareil comprises, pas encore envoyées) ou
 * que l'analyse tourne. Sans la 082 (`analyse_le` absent de la pièce), la
 * couleur du lot 2.
 *
 * @param entrees événements « entree » de la visite (instantané + file)
 * @param enCours identifiant de la pièce en cours d'analyse
 */
export function etatPieceVisite(piece, { visitees, entrees = [], enCours = null }) {
  if (!visitees.has(piece.id)) return 'non-visitee'
  if (!('analyse_le' in (piece ?? {}))) return 'visitee'
  const analyse = piece.analyse_le ? Date.parse(piece.analyse_le) : null
  const revisitee = analyse != null && (entrees ?? []).some((e) => e.piece_id === piece.id && Date.parse(e.le) > analyse)
  return etatAnalysePiece(piece, { visitee: true, attente: enCours === piece.id || revisitee })
}

// Charte : vert du pense-bête, ambre #FFFBEB / #92400E, rouge #B8412C.
// L'attente ne suit pas l'accent de la phase (vert au chantier, elle se
// confondrait avec « complète ») : gris chaud, avec le sablier. `opacite` :
// un fond clair mais plein (l'ambre de la charte) laisse voir le plan dessous.
export const COULEURS_PIECE = {
  'non-visitee': { fond: 'rgba(156,149,145,0.16)', trait: '#9C9591' },
  visitee: { fond: 'var(--affaire-accent-clair, rgba(232,96,44,0.10))', trait: 'var(--affaire-accent, #E8602C)' },
  attente: { fond: 'rgba(122,106,90,0.14)', trait: '#7A6A5A' },
  complete: { fond: 'rgba(42,138,78,0.16)', trait: '#2A8A4E' },
  incomplete: { fond: '#FFFBEB', trait: '#92400E', opacite: 0.75 },
  echec: { fond: 'rgba(184,65,44,0.12)', trait: '#B8412C' },
}

/** La visite qu'on peut reprendre : la plus récente qui n'a pas été terminée. */
export function visiteEnCours(visites) {
  return [...(visites ?? [])]
    .filter((v) => !v.fin)
    .sort((a, b) => String(b.debut).localeCompare(String(a.debut)))[0] ?? null
}

const ARRETS = ['pause', 'muet', 'coupe', 'echec']

/** Ce que le journal note quand l'état du micro change (le début et la fin sont notés à part). */
export function evenementPourEtat(ancien, nouveau) {
  if (nouveau === 'pause') return 'pause'
  if (ancien === 'enregistre' && ARRETS.includes(nouveau)) return 'coupure'
  if (nouveau === 'enregistre' && ARRETS.includes(ancien)) return 'reprise'
  return null
}

const MESSAGES_ARRET = {
  pause: 'Enregistrement en pause',
  muet: 'Micro en sourdine : une autre application l’utilise peut-être',
  coupe: 'Micro coupé (écran verrouillé ou autre application)',
  echec: 'L’enregistrement a échoué sur cet appareil',
}
export const messageArret = (etat) => MESSAGES_ARRET[etat] ?? 'L’enregistrement est arrêté'

export function cheminsPhotoEdl(affaireId, id, extension) {
  return {
    chemin: `${affaireId}/edl/photos/${id}.${extension}`,
    chemin_miniature: `${affaireId}/edl/photos/${id}-mini.${extension}`,
  }
}

// ─── Lecture bornée dans le temps ────────────────────────────────────────────

export const DELAI_LECTURE_MS = 8000
const CODE_DELAI = 'DELAI_DEPASSE'

/** Lecture abandonnée faute de réponse : vaut « pas de réseau ». */
export const delaiDepasse = (err) => err?.code === CODE_DELAI

/**
 * `construire(signal)` rend une requête (promesse ou thenable) ; passé
 * `delaiMs`, la requête est abandonnée et la promesse rejetée (`delaiDepasse`).
 * La course rend la main même si la requête n'écoute pas le signal :
 * supabase-js attend le renouvellement du jeton avant de lancer le fetch, et
 * cette attente-là ne s'abandonne pas.
 */
export function bornerDelai(construire, delaiMs = DELAI_LECTURE_MS) {
  const controleur = new AbortController()
  let minuteur
  const delai = new Promise((_, rejeter) => {
    minuteur = setTimeout(() => {
      // Rejet avant l'abandon : la course rend notre erreur, pas celle du fetch
      rejeter(Object.assign(new Error('Le réseau ne répond pas.'), { code: CODE_DELAI }))
      controleur.abort()
    }, delaiMs)
  })
  return Promise.race([construire(controleur.signal), delai]).finally(() => clearTimeout(minuteur))
}

const nombre = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

/**
 * Ce que « Remplacer les plans » emporte, en une phrase : tout l'état des
 * lieux, et d'abord ce qui a été saisi sur place (demande de l'agence, 2026-11-18).
 */
export function perteRemplacement({ visites = 0, points = 0, photos = 0, enAttente = 0, son = 0 } = {}) {
  if (!visites && !enAttente && !son) return null
  const saisi = [nombre(visites, 'visite', 'visites'), nombre(points, 'point', 'points'), nombre(photos, 'photo', 'photos')].join(', ')
  const appareil = enAttente ? ` Les ${nombre(enAttente, 'geste', 'gestes')} pas encore envoyé${enAttente > 1 ? 's' : ''} depuis cet appareil seront aussi abandonnés.` : ''
  // Le son pas encore transcrit est effacé de l'appareil avec les visites
  const audio = !son ? ''
    : son > 1 ? ` Les ${son} morceaux de son non transcrits de cet appareil seront effacés.`
      : ' Le morceau de son non transcrit de cet appareil sera effacé.'
  return `L’état des lieux déjà réalisé sera supprimé définitivement : ${saisi}, avec leur journal.${appareil}${audio}`
}
