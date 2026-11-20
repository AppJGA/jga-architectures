// ─── Onglet « Plans » de l'état des lieux : ce qui se décide sans navigateur ─
//
// Un seul plan par étage (demande de l'agence, 2026-11-20) : l'éditeur des
// pièces et, dès qu'une visite a eu lieu, les relevés dessinés dessus
// (symboles, liaisons, cotes). L'onglet « État des lieux » n'est plus que la
// liste des pièces ; en toucher une ramène ici, la pièce choisie et cadrée.
// Adresse, priorité d'un toucher, cadrage, pièce suivante. Pur, testé
// (tests/etat-des-lieux-plans.test.js).

import { pieceSous, pointProche, cadrePiece } from './visite/visiteLogique.js'
import { traceProche } from './visite/tracesVisiteLogique.js'

export const VUE_PLANS = 'plans'
export const VUE_LISTE = 'liste'

/**
 * L'adresse du module → { vue, pieceId, cadreId }. `piece` = la pièce
 * choisie, `cadre` = la pièce sur laquelle le plan est agrandi (gardé quand
 * on touche hors des pièces : la vue ne saute pas à tout l'étage). Les
 * anciens liens `?vue=relecture&piece=…` ouvrent la pièce sur le plan, et
 * `?vue=relecture` seul la liste ; `cadre=1` vaut la pièce choisie.
 */
export function lireVueEdl(params) {
  const lire = (cle) => params?.get?.(cle) || null
  const vue = lire('vue')
  const pieceId = lire('piece')
  if (vue === 'relecture') {
    return pieceId ? { vue: VUE_PLANS, pieceId, cadreId: pieceId } : { vue: VUE_LISTE, pieceId: null, cadreId: null }
  }
  if (vue === VUE_LISTE) return { vue: VUE_LISTE, pieceId: null, cadreId: null }
  const cadre = lire('cadre')
  return { vue: VUE_PLANS, pieceId, cadreId: cadre === '1' ? pieceId : cadre }
}

/** Les paramètres d'adresse de `adresse` posés sur `params` (copie : le reste est gardé). */
export function ecrireVueEdl(params, { vue = VUE_PLANS, pieceId = null, cadreId = null } = {}) {
  const n = new URLSearchParams(params)
  n.delete('vue')
  n.delete('piece')
  n.delete('cadre')
  if (vue === VUE_LISTE) {
    n.set('vue', VUE_LISTE)
    return n
  }
  if (pieceId || cadreId) n.set('vue', VUE_PLANS)
  if (pieceId) n.set('piece', pieceId)
  if (cadreId) n.set('cadre', cadreId)
  return n
}

/**
 * Une pièce choisie sur le plan (ou aucune). Plan agrandi sur une pièce :
 * le cadre suit la pièce choisie, comme l'ancienne vue de la pièce ; hors
 * des pièces, il reste où il est. Plan de l'étage entier : on choisit sans
 * agrandir (on corrige des contours à travers l'étage).
 */
export function choixPiece(adresse, pieceId) {
  const cadreId = adresse?.cadreId && pieceId ? pieceId : (adresse?.cadreId ?? null)
  return { vue: VUE_PLANS, pieceId: pieceId ?? null, cadreId }
}

/** Ouvrir une pièce depuis la liste (ou « Pièce suivante ») : choisie et cadrée. */
export const ouvrirPiece = (pieceId) => ({ vue: VUE_PLANS, pieceId, cadreId: pieceId })

/** « Voir tout l'étage » : la pièce reste choisie, le plan revient à l'étage entier. */
export const voirEtage = (adresse) => ({ vue: VUE_PLANS, pieceId: adresse?.pieceId ?? null, cadreId: null })

/** Le cadre de la visionneuse (fractions de l'image) pour la pièce `cadreId`, ou null (tout l'étage). */
export function cadreAffiche(cadreId, pieces, niveau) {
  const piece = cadreId ? (pieces ?? []).find((p) => p.id === cadreId) : null
  if (!piece || !(piece.contour?.length >= 3) || !niveau?.cadrage) return null
  return cadrePiece(piece, niveau)
}

const pieceDuPoint = (points, id) => (points ?? []).find((p) => p.id === id)?.piece_id ?? null

/**
 * Ce que vise un appui bref sur le plan (`position` en mètres, `tolerance`
 * = 22 px d'écran en mètres). Par ordre : pendant « Relier », le point le
 * plus proche (ou aucun : la consigne dit pourquoi) ; sinon un point (celui
 * d'une autre pièce, pâli, reste touchable et choisit sa pièce), puis une
 * liaison ou une cote, puis la plus petite pièce qui contient l'appui. Les
 * poignées du contour de la pièce choisie passent avant tout : elles
 * captent le doigt avant que l'appui n'arrive ici.
 *   { sorte: 'relier', point }            point visé (ou null) ;
 *   { sorte: 'point', point, pieceId }    pieceId : la pièce du point ;
 *   { sorte: 'trace', trace, pieceId }    pieceId : sa pièce, à défaut celle d'un bout ;
 *   { sorte: 'piece', pieceId }           null hors des pièces.
 */
export function resoudreToucher({ position, tolerance, points = [], traces = [], pieces = [], ecartCote = 0, relier = false }) {
  const point = pointProche(points, position, tolerance)
  if (relier) return { sorte: 'relier', point }
  if (point) return { sorte: 'point', point, pieceId: point.piece_id ?? null }
  const trace = traceProche(traces, points, position, tolerance, {
    ecartCote,
    contourDe: (t) => pieces.find((pc) => pc.id === t.piece_id)?.contour ?? null,
  })
  if (trace) {
    const pieceId = trace.piece_id ?? pieceDuPoint(points, trace.point_b) ?? pieceDuPoint(points, trace.point_a)
    return { sorte: 'trace', trace, pieceId }
  }
  return { sorte: 'piece', pieceId: pieceSous(pieces, position)?.id ?? null }
}

/** Une pièce choisie : ses points pleins, ceux des autres pâlis (toujours touchables). */
export const opacitePoint = (point, pieceId) => (!pieceId || point?.piece_id === pieceId ? 1 : 0.4)

/** La trace concerne-t-elle la pièce ? Sa pièce, ou l'un de ses deux points. */
export function traceDeLaPiece(trace, pieceId, points = []) {
  if (!pieceId) return true
  if (trace?.piece_id === pieceId) return true
  return [trace?.point_a, trace?.point_b].some((id) => id && pieceDuPoint(points, id) === pieceId)
}

/**
 * « Pièce suivante » : `ordre`, les identifiants dans l'ordre de la liste
 * (à valider d'abord, `piecesARelire`). Aucune pièce choisie (ou une pièce
 * hors liste) : la première ; la dernière : null.
 */
export function pieceSuivante(ordre = [], pieceId = null) {
  if (!ordre.length) return null
  const rang = pieceId ? ordre.indexOf(pieceId) : -1
  if (rang < 0) return ordre[0]
  return ordre[rang + 1] ?? null
}

/** La pièce d'une liaison posée sur le plan : celle du luminaire, à défaut celle de l'interrupteur, sinon la pièce choisie. */
export const pieceDeLiaison = ({ interrupteur, luminaire }, pieceChoisie = null) =>
  luminaire?.piece_id ?? interrupteur?.piece_id ?? pieceChoisie ?? null
