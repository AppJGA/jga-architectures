// ─── File d'attente de la visite d'un état des lieux : logique pure ──────────
//
// Tout geste de la visite passe par une file rangée sur l'appareil, même avec
// du réseau : l'écran montre l'instantané emporté plus la file (`etatAvecFileEdl`),
// l'envoi suit. Mêmes règles que le mode Visite des CR (horsLigne/fileLogique.js) :
//   · l'identifiant de chaque ligne est décidé sur l'appareil : un envoi rejoué
//     écrit la même ligne, et l'application ici est idempotente ;
//   · l'ordre de création est l'ordre d'envoi (`creeLe` strictement croissant,
//     `horodatageSuivant` : deux gestes dans la même milliseconde gardent leur ordre).
// Pur, testé (tests/etat-des-lieux-visite.test.js).

import { ESSAIS_MAX, estEnEchec, aEnvoyer } from '../../../chantier/comptes-rendus/horsLigne/fileLogique'
import { numeroPourRestauration } from './visiteLogique'

export { ESSAIS_MAX, estEnEchec, aEnvoyer }

export const TYPES_EDL = {
  visiteCreer: 'visite.creer',
  visiteTerminer: 'visite.terminer',
  evenement: 'evenement.ajouter',
  pointPoser: 'point.poser',
  pointModifier: 'point.modifier',
  pointSupprimer: 'point.supprimer',
  photoAjouter: 'photo.ajouter',
}

export function operationEdl(type, charge, { affaireId, id = null, creeLe = Date.now() } = {}) {
  return { id: id ?? crypto.randomUUID(), affaireId, type, charge, creeLe, essais: 0, erreur: null }
}

export const horodatageSuivant = (dernier, maintenant) => Math.max(maintenant, (dernier ?? 0) + 1)

export function evenementEdl(type, { visiteId, affaireId, niveauId = null, pieceId = null, pointId = null, detail = {} }, le = new Date()) {
  return {
    id: crypto.randomUUID(), visite_id: visiteId, affaire_id: affaireId, type,
    niveau_id: niveauId, piece_id: pieceId, point_id: pointId,
    le: new Date(le).toISOString(), detail,
  }
}

const remplacer = (liste, ligne) => [...(liste ?? []).filter((x) => x.id !== ligne.id), ligne]

/** Applique une opération à l'instantané { etat, niveaux, pieces, visites, points, photos, entrees }. */
export function appliquerOperationEdl(etat, op) {
  const c = op.charge
  switch (op.type) {
    case TYPES_EDL.visiteCreer:
      return { ...etat, visites: remplacer(etat.visites, c.visite) }
    case TYPES_EDL.visiteTerminer:
      return { ...etat, visites: (etat.visites ?? []).map((v) => (v.id === c.id ? { ...v, fin: c.fin } : v)) }
    case TYPES_EDL.evenement:
      // Sur l'appareil, seules les entrées servent (pièces visitées) ; le
      // reste du journal ne sert qu'à l'analyse, au bureau
      return c.evenement.type === 'entree' ? { ...etat, entrees: remplacer(etat.entrees, c.evenement) } : etat
    case TYPES_EDL.pointPoser:
      return {
        ...etat,
        points: remplacer(etat.points, c.point),
        photos: (c.photos ?? []).reduce(remplacer, etat.photos ?? []),
      }
    case TYPES_EDL.pointModifier:
      return { ...etat, points: (etat.points ?? []).map((p) => (p.id === c.id ? { ...p, ...c.champs } : p)) }
    case TYPES_EDL.pointSupprimer:
      return {
        ...etat,
        points: (etat.points ?? []).filter((p) => p.id !== c.id),
        photos: (etat.photos ?? []).filter((p) => p.point_id !== c.id),
      }
    case TYPES_EDL.photoAjouter:
      return { ...etat, photos: remplacer(etat.photos, c.photo) }
    default:
      return etat
  }
}

// Pièce supprimée au bureau pendant que le geste attendait : la base refuse
// la ligne (clé étrangère, 23503) et la refuserait à chaque essai. Le point
// ou l'événement reste à l'étage, sans pièce — ce que la base ferait d'elle-même
// si la pièce avait été supprimée après l'envoi (079 : on delete set null).
const TABLES_A_PIECE = new Set(['edl_points', 'edl_evenements'])
export const pieceDisparue = (error) =>
  error?.code === '23503' && /piece_id/.test(`${error.message ?? ''} ${error.details ?? ''}`)

/**
 * Insère par `inserer(ligne)` (rend l'erreur de la base ou null), une seconde
 * fois sans pièce si la pièce n'existe plus. Rend l'erreur du dernier essai.
 */
export async function insererSansPieceDisparue(table, ligne, inserer) {
  const error = await inserer(ligne)
  if (TABLES_A_PIECE.has(table) && ligne?.piece_id && pieceDisparue(error)) return inserer({ ...ligne, piece_id: null })
  return error
}

/**
 * L'instantané emporté, puis la file par-dessus. Les opérations refusées par
 * la base restent appliquées : un point posé pendant la visite ne disparaît
 * pas de l'écran ; le bandeau dit à part ce qui n'est pas passé.
 */
export function etatAvecFileEdl(instantane, operations) {
  return [...(operations ?? [])].sort((a, b) => a.creeLe - b.creeLe).reduce(appliquerOperationEdl, instantane)
}

export function resumeFileEdl(operations) {
  const ops = operations ?? []
  const echecs = ops.filter(estEnEchec)
  return { total: ops.length, enAttente: ops.length - echecs.length, echecs: echecs.length, premierEchec: echecs[0] ?? null }
}

/** L'opération qui défait un geste (« Annuler »), et ce que le journal en note. */
export function operationInverse(geste, points) {
  switch (geste?.type) {
    case 'pose':
      return { type: TYPES_EDL.pointSupprimer, charge: { id: geste.point.id }, evenement: 'point-supprime' }
    case 'suppression':
      return {
        type: TYPES_EDL.pointPoser,
        charge: { point: { ...geste.point, numero: numeroPourRestauration(geste.point, points) }, photos: geste.photos ?? [] },
        evenement: 'point',
      }
    case 'modification':
      return { type: TYPES_EDL.pointModifier, charge: { id: geste.id, champs: geste.avant }, evenement: 'point-modifie' }
    default:
      return null
  }
}

/** Identifiants des photos gardées sur l'appareil par ces gestes (magasin `fichiers`). */
export function photosDesOperations(operations) {
  const ids = new Set()
  for (const op of operations ?? []) {
    if (op.type === TYPES_EDL.photoAjouter && op.charge?.photo?.id) ids.add(op.charge.photo.id)
    if (op.type === TYPES_EDL.pointPoser) for (const ph of op.charge?.photos ?? []) if (ph?.id) ids.add(ph.id)
  }
  return [...ids]
}
