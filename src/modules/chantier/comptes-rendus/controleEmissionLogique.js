// ─── Avant d'émettre : la liste de contrôle ──────────────────────────────────
//
// Au clic sur « Émettre le CR », l'agence voit ce qui a été fait et ce qui
// manque : présences des convoqués pointées, prochaine visite (date et convocations),
// avancement reporté depuis la visite précédente, propositions de l'IA
// relues. Rien de cela n'empêche l'émission — sauf les propositions de l'IA :
// la base refuse d'émettre tant qu'il en reste (migration 058), pour qu'une
// remarque jamais relue ne parte pas chez les entreprises.
// Pur (tests/controle-emission.test.js).

import { affichagePresence } from './crLogique'
import { convocationDe } from './convocationLogique'

const POINTEES = new Set(['p', 'r', 'a', 'e'])
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

/**
 * @param avancement lignes du jour (lot_id, realise)
 * @param precedent { numero, avancement_lots } du CR d'avant, ou null
 * @returns [{ id, libelle, ok, detail, bloquant, vue }]
 */
export function controlesEmission({ cr, presences = [], convocations = new Map(), avancement = [], precedent = null, nbPropositions = 0 }) {
  const participants = presences.filter((p) => affichagePresence(p).type)
  const convoques = participants.filter((p) => p.convoque).length
  const pointage = controlePresences(participants, convocations)
  const manqueProchaine = [
    !cr?.date_prochaine_reunion && 'date de la prochaine réunion à fixer',
    convoques === 0 && 'personne n’est convoqué',
  ].filter(Boolean)

  return [
    { id: 'presences', vue: 'presences', libelle: 'Présences pointées', ...pointage },
    {
      id: 'convocations', vue: 'organisation', libelle: 'Prochaine visite et convocations',
      ok: manqueProchaine.length === 0,
      detail: manqueProchaine.length ? manqueProchaine.join(' ; ')
        : `${pluriel(convoques, 'convoqué')} pour le ${new Date(`${cr.date_prochaine_reunion}T00:00:00`).toLocaleDateString('fr-FR')}`,
    },
    { id: 'avancement', vue: 'avancement', libelle: 'Avancement des lots mis à jour', ...controleAvancement(avancement, precedent) },
    {
      id: 'ia', vue: 'remarques', libelle: 'Propositions de l’IA relues',
      ok: nbPropositions === 0, bloquant: nbPropositions > 0,
      detail: nbPropositions === 0 ? 'Aucune en attente'
        : `${pluriel(nbPropositions, 'proposition')} à valider, modifier ou écarter avant d’émettre`,
    },
  ]
}

/**
 * Seuls les convoqués de cette réunion (convocations du CR précédent) doivent
 * être pointés : une entreprise qui n'était pas attendue n'a pas à figurer
 * absente au CR, et ne pas la pointer ne manque à rien. Sans aucune
 * convocation (première visite), il suffit qu'un participant soit pointé.
 */
export function controlePresences(participants = [], convocations = new Map()) {
  if (participants.length === 0) return { ok: false, detail: 'Aucun participant' }
  const attendus = participants.filter((p) => convocationDe(p, convocations))
  if (attendus.length === 0) {
    const pointes = participants.filter((p) => POINTEES.has(p.presence)).length
    return pointes > 0
      ? { ok: true, detail: `${pluriel(pointes, 'participant')} pointé${pointes > 1 ? 's' : ''}` }
      : { ok: false, detail: 'Personne n’est pointé' }
  }
  const manquent = attendus.filter((p) => !POINTEES.has(p.presence)).length
  return manquent === 0
    ? { ok: true, detail: `${pluriel(attendus.length, 'convoqué')}, tous pointés` }
    : { ok: false, detail: `${pluriel(manquent, 'convoqué')} sans pointage` }
}

/**
 * Le planning a-t-il été pointé depuis la visite précédente ? On compare le
 * réalisé du jour à celui que le CR précédent a figé à son émission ; sans
 * CR précédent figé (première visite), il suffit qu'un lot ait avancé.
 */
export function controleAvancement(avancement = [], precedent = null) {
  if (!avancement.length) return { ok: false, detail: 'Planning chantier non renseigné : aucun avancement à reporter' }
  const avant = Array.isArray(precedent?.avancement_lots) ? precedent.avancement_lots : null
  if (!avant || avant.length === 0) {
    return avancement.some((l) => Number(l.realise) > 0)
      ? { ok: true, detail: 'Avancement pointé' }
      : { ok: false, detail: 'Aucun avancement pointé dans le planning' }
  }
  const realiseAvant = new Map(avant.map((l) => [l.lot_id, Number(l.realise) || 0]))
  const evolues = avancement.filter((l) => (Number(l.realise) || 0) !== (realiseAvant.get(l.lot_id) ?? 0)).length
  return evolues > 0
    ? { ok: true, detail: `${pluriel(evolues, 'lot')} en évolution depuis la visite n°${precedent.numero}` }
    : { ok: false, detail: `Identique à la visite n°${precedent.numero} : le planning a-t-il été pointé ?` }
}

/** « Émettre », ou « Émettre quand même » s'il manque quelque chose. */
export function libelleEmission(controles = []) {
  return controles.every((c) => c.ok) ? 'Émettre' : 'Émettre quand même'
}
