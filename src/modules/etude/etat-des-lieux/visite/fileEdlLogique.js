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
import { tracesIndisponibles, TYPES_JOURNAL_TRACES, MESSAGE_TRACES_INDISPONIBLES } from '../tracesEdl'

export { ESSAIS_MAX, estEnEchec, aEnvoyer }

export const TYPES_EDL = {
  visiteCreer: 'visite.creer',
  visiteTerminer: 'visite.terminer',
  evenement: 'evenement.ajouter',
  pointPoser: 'point.poser',
  pointModifier: 'point.modifier',
  pointSupprimer: 'point.supprimer',
  photoAjouter: 'photo.ajouter',
  // Liaisons et cotes (migration 084)
  traceCreer: 'trace.creer',
  traceModifier: 'trace.modifier',
  traceSupprimer: 'trace.supprimer',
}

export function operationEdl(type, charge, { affaireId, id = null, creeLe = Date.now() } = {}) {
  return { id: id ?? crypto.randomUUID(), affaireId, type, charge, creeLe, essais: 0, erreur: null }
}

/**
 * Le geste ferme-t-il un passage dans une pièce ? Une sortie, la fin de la
 * visite. Seuls ceux-là, une fois envoyés, peuvent rendre une pièce prête à
 * analyser : le moteur de synchro ne relit l'analyse que pour eux, pas pour
 * chaque point posé.
 */
export function fermePassage(op) {
  if (op?.type === TYPES_EDL.visiteTerminer) return true
  return op?.type === TYPES_EDL.evenement && ['sortie', 'fin'].includes(op.charge?.evenement?.type)
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

// Supprimer un point emporte ses liaisons (cascade de la 084) : l'écran fait
// de même. La clé n'est ajoutée qu'à un instantané qui a déjà ses traces.
const sansTracesDuPoint = (etat, pointId) => (etat.traces
  ? { traces: etat.traces.filter((t) => t.point_a !== pointId && t.point_b !== pointId) }
  : {})

/** Applique une opération à l'instantané { etat, niveaux, pieces, visites, points, photos, entrees, traces }. */
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
        // Un point rendu par « Annuler » revient avec ses liaisons
        ...(c.traces?.length ? { traces: c.traces.reduce(remplacer, etat.traces ?? []) } : {}),
      }
    case TYPES_EDL.pointModifier:
      return { ...etat, points: (etat.points ?? []).map((p) => (p.id === c.id ? { ...p, ...c.champs } : p)) }
    case TYPES_EDL.pointSupprimer:
      return {
        ...etat,
        points: (etat.points ?? []).filter((p) => p.id !== c.id),
        photos: (etat.photos ?? []).filter((p) => p.point_id !== c.id),
        ...sansTracesDuPoint(etat, c.id),
      }
    case TYPES_EDL.photoAjouter:
      return { ...etat, photos: remplacer(etat.photos, c.photo) }
    case TYPES_EDL.traceCreer:
      return { ...etat, traces: remplacer(etat.traces, c.trace) }
    case TYPES_EDL.traceModifier:
      return { ...etat, traces: (etat.traces ?? []).map((t) => (t.id === c.id ? { ...t, ...c.champs } : t)) }
    case TYPES_EDL.traceSupprimer:
      return { ...etat, traces: (etat.traces ?? []).filter((t) => t.id !== c.id) }
    default:
      return etat
  }
}

// Pièce supprimée au bureau pendant que le geste attendait : la base refuse
// la ligne (clé étrangère, 23503) et la refuserait à chaque essai. Le point
// ou l'événement reste à l'étage, sans pièce — ce que la base ferait d'elle-même
// si la pièce avait été supprimée après l'envoi (079 : on delete set null).
const TABLES_A_PIECE = new Set(['edl_points', 'edl_evenements', 'edl_traces'])
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

/**
 * L'opération qui défait un geste (« Annuler »), et ce que le journal en note.
 * Gestes des points : 'pose' { point }, 'suppression' { point, photos,
 * traces? } (ses liaisons, parties avec lui), 'modification' { id, avant }.
 * Gestes des traces (`traceId` désigne alors la trace, pas un point) :
 * 'trace-creation' { trace }, 'trace-suppression' { trace },
 * 'trace-modification' { id, avant }.
 */
export function operationInverse(geste, points) {
  switch (geste?.type) {
    case 'pose':
      return { type: TYPES_EDL.pointSupprimer, charge: { id: geste.point.id }, evenement: 'point-supprime' }
    case 'suppression':
      return {
        type: TYPES_EDL.pointPoser,
        charge: {
          point: { ...geste.point, numero: numeroPourRestauration(geste.point, points) },
          photos: geste.photos ?? [],
          ...(geste.traces?.length ? { traces: geste.traces } : {}),
        },
        evenement: 'point',
      }
    case 'modification':
      return { type: TYPES_EDL.pointModifier, charge: { id: geste.id, champs: geste.avant }, evenement: 'point-modifie' }
    case 'trace-creation':
      return { type: TYPES_EDL.traceSupprimer, charge: { id: geste.trace.id }, evenement: 'trace-supprimee', traceId: geste.trace.id }
    case 'trace-suppression':
      return { type: TYPES_EDL.traceCreer, charge: { trace: geste.trace }, evenement: 'trace', traceId: geste.trace.id }
    case 'trace-modification':
      return { type: TYPES_EDL.traceModifier, charge: { id: geste.id, champs: geste.avant }, evenement: 'trace', traceId: geste.id }
    default:
      return null
  }
}

// ─── Envoi des traces (logique, base injectée) ───────────────────────────────

const DOUBLON = '23505'
const CONTRAINTE = '23514'

/**
 * Refus qui ne passera pas tant que la 084 manque : l'opération est mise de
 * côté d'emblée (`definitif`), sans retenir trois fois de suite les gestes
 * suivants ; « Réessayer » la renvoie une fois la migration passée.
 */
export function erreurTracesIndisponibles() {
  const err = new Error(MESSAGE_TRACES_INDISPONIBLES)
  err.definitif = true
  return err
}

/**
 * Une ligne de journal propre à la 084 (un toucher, une trace) refusée par
 * l'ancienne contrainte de type : elle ne sert qu'à l'analyse, on la laisse
 * tomber plutôt que de bloquer la file.
 */
export const journalSansMigration = (evenement, error) =>
  error?.code === CONTRAINTE && TYPES_JOURNAL_TRACES.includes(evenement?.type)

/**
 * Envoie une opération de trace par `base` :
 *   inserer(ligne) → erreur | null
 *   modifier(id, champs) → { error, nombre }   (lignes touchées)
 *   supprimer(id) → { error, nombre }
 *   existe(id) → booléen
 * Un doublon (envoi rejoué) est un succès, une suppression qui ne trouve
 * rien aussi ; une modification qui ne touche rien est un refus (droits, ou
 * trace disparue). Table absente : erreur définitive.
 */
export async function envoyerTrace(op, base) {
  const echec = (error) => (tracesIndisponibles(error) ? erreurTracesIndisponibles() : error)
  const c = op.charge
  switch (op.type) {
    case TYPES_EDL.traceCreer: {
      const error = await insererSansPieceDisparue('edl_traces', c.trace, base.inserer)
      if (error && error.code !== DOUBLON) throw echec(error)
      return
    }
    case TYPES_EDL.traceModifier: {
      const { error, nombre } = await base.modifier(c.id, c.champs)
      if (error) throw echec(error)
      if (!nombre) throw new Error('La base n’a rien modifié (trace absente ou droits insuffisants).')
      return
    }
    case TYPES_EDL.traceSupprimer: {
      const { error, nombre } = await base.supprimer(c.id)
      if (error) throw echec(error)
      if (!nombre && await base.existe(c.id)) throw new Error('La base n’a pas supprimé la trace (droits insuffisants).')
      return
    }
    default:
      throw new Error(`Opération de trace inconnue : ${op.type}`)
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
