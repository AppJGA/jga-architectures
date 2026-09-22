// ─── Décaler tout le planning ────────────────────────────────────────────────
//
// Quand le démarrage du chantier glisse (novembre → mars), toutes les barres
// doivent suivre, y compris celles qu'aucun lien ne relie. On donne la
// nouvelle date de démarrage ; tout ce qui est concerné avance (ou recule) du
// même nombre de jours OUVRÉS :
//   · les durées, en jours ouvrés, ne changent pas ;
//   · rien ne démarre un week-end ni pendant une fermeture ;
//   · les périodes (congés, fermetures) restent à leurs dates : une tâche qui
//     en traverse désormais une s'allonge d'autant, comme ailleurs dans l'app.
// Les segments ont leur propre date de début : ils sont décalés eux aussi.
//
// Avec « à partir du », seul ce qui commence à cette date ou après bouge. Un
// lien qui relie un élément resté en place à un élément décalé reçoit son
// nouvel écart : sans cela, le prochain recalage (une période modifiée) le
// ramènerait contre son prédécesseur. Les éléments liés sont enfin placés
// par `propagerDepuisRacines`, comme partout ailleurs dans l'app.

import {
  parseDate, formatDateISO, isWorkingDay, estBloque, addWorkingDaysBlocked,
  dernierJourTache, computeLag,
} from './types'
import { skipBlockedPeriods, propagerDepuisRacines, entityKey } from './propagation'

const iso = (d) => (typeof d === 'string' ? d.split('T')[0] : formatDateISO(d))
const ouvre = (d, periodes) => isWorkingDay(d) && !estBloque(d, periodes)

/** Plus petite date de début des tâches et segments concernés, ou null. */
export function debutActuel({ tasks = [], segments = [], aPartirDe = null }) {
  const dates = [
    ...tasks.map((t) => t.debut),
    ...segments.map((s) => s.date_debut),
  ].filter(Boolean).map(iso).filter((d) => !aPartirDe || d >= aPartirDe)
  return dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null
}

/**
 * Écart signé, en jours ouvrés (week-ends et fermetures bloquantes exclus),
 * pour aller du premier jour ouvré à partir de `ancien` au premier jour ouvré
 * à partir de `nouveau`.
 */
export function ecartOuvre(ancien, nouveau, periodes = []) {
  const a = skipBlockedPeriods(parseDate(iso(ancien)), periodes)
  const b = skipBlockedPeriods(parseDate(iso(nouveau)), periodes)
  const sens = b > a ? 1 : -1
  let n = 0
  const d = new Date(a)
  let garde = 0
  while (formatDateISO(d) !== formatDateISO(b) && garde++ < 20000) {
    d.setDate(d.getDate() + sens)
    if (ouvre(d, periodes)) n += sens
  }
  return n
}

/** Date décalée de `ecart` jours ouvrés, posée sur un jour ouvré. */
export function decalerDate(date, ecart, periodes = []) {
  const depart = skipBlockedPeriods(parseDate(iso(date)), periodes)
  return formatDateISO(skipBlockedPeriods(addWorkingDaysBlocked(depart, ecart, periodes), periodes))
}

// Nombre de jours du calendrier entre deux dates ISO (arrondi : l'heure d'été
// ôte ou ajoute une heure à l'écart)
const joursCalendaires = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000)

/**
 * @param nouveauDebut 'YYYY-MM-DD'
 * @param aPartirDe    'YYYY-MM-DD' ou null (tout le planning)
 * @returns null si rien n'est concerné, sinon {
 *   ancienDebut, ecart (jours ouvrés), semaines (calendaires, arrondies),
 *   changements: Map<clé, { type, id, debut }> — pour applyCascadeLocally / persistCascade,
 *   lagsTaches: [{ id, lag_days }], lagsDependances: [{ id, lag_jours }],
 *   jalons: [{ id, date }],
 *   resume: { taches, segments, jalons, allongees: [nom] }
 * }
 */
export function planDecalage({
  tasks = [], segments = [], jalons = [], dependances = [], periodes = [],
  nouveauDebut, aPartirDe = null,
}) {
  const ancienDebut = debutActuel({ tasks, segments, aPartirDe })
  if (!ancienDebut || !nouveauDebut) return null
  const ecart = ecartOuvre(ancienDebut, nouveauDebut, periodes)
  const concerne = (date) => !!date && (!aPartirDe || iso(date) >= aPartirDe)

  // 1. Tout ce qui est concerné avance du même nombre de jours ouvrés
  const bougees = new Set()
  const taches2 = tasks.map((t) => {
    if (!concerne(t.debut)) return t
    bougees.add(entityKey('task', t.id))
    return { ...t, debut: decalerDate(t.debut, ecart, periodes) }
  })
  const segments2 = segments.map((s) => {
    if (!concerne(s.date_debut)) return s
    bougees.add(entityKey('segment', s.id))
    return { ...s, date_debut: decalerDate(s.date_debut, ecart, periodes) }
  })

  // 2. Liens à cheval sur la frontière (décalage partiel) : nouvel écart
  const tacheParId = new Map(taches2.map((t) => [t.id, t]))
  const segmentParId = new Map(segments2.map((s) => [s.id, s]))
  const lagsTaches = []
  const taches3 = taches2.map((t) => {
    if (t.depends_on == null) return t
    const parent = tacheParId.get(t.depends_on)
    if (!parent?.debut || !t.debut) return t
    const cote = (id) => bougees.has(entityKey('task', id))
    if (cote(t.id) === cote(parent.id)) return t
    const lag = computeLag(parent.debut, parent.duree, t.debut, periodes)
    if (lag === (t.lag_days ?? 0)) return t
    lagsTaches.push({ id: t.id, lag_days: lag })
    return { ...t, lag_days: lag }
  })
  const lagsDependances = []
  const dependances2 = dependances.map((d) => {
    const cleSource = d.source_segment_id != null ? entityKey('segment', d.source_segment_id) : entityKey('task', d.source_tache_id)
    const cleCible = d.cible_segment_id != null ? entityKey('segment', d.cible_segment_id) : entityKey('task', d.cible_tache_id)
    if (bougees.has(cleSource) === bougees.has(cleCible)) return d
    const source = d.source_segment_id != null ? segmentParId.get(d.source_segment_id) : tacheParId.get(d.source_tache_id)
    const cible = d.cible_segment_id != null ? segmentParId.get(d.cible_segment_id) : tacheParId.get(d.cible_tache_id)
    const sourceDebut = d.source_segment_id != null ? source?.date_debut : source?.debut
    const sourceDuree = d.source_segment_id != null ? source?.duree_jours : source?.duree
    const cibleDebut = d.cible_segment_id != null ? cible?.date_debut : cible?.debut
    if (!sourceDebut || !cibleDebut) return d
    const lag = computeLag(sourceDebut, sourceDuree, cibleDebut, periodes)
    if (lag === (d.lag_jours ?? 0)) return d
    lagsDependances.push({ id: d.id, lag_jours: lag })
    return { ...d, lag_jours: lag }
  })

  // 3. Les éléments liés se placent sur leurs liens, comme partout ailleurs.
  // Seuls les éléments décalés en profitent : le reste du planning ne bouge pas.
  const places = propagerDepuisRacines({ tasks: taches3, segments: segments2, dependances: dependances2, periodes })
  const debutFinal = new Map()
  taches3.forEach((t) => debutFinal.set(entityKey('task', t.id), t.debut))
  segments2.forEach((s) => debutFinal.set(entityKey('segment', s.id), s.date_debut))
  places.forEach((u, cle) => { if (bougees.has(cle)) debutFinal.set(cle, u.debut) })

  const changements = new Map()
  tasks.forEach((t) => {
    const cle = entityKey('task', t.id)
    if (bougees.has(cle) && debutFinal.get(cle) !== iso(t.debut)) changements.set(cle, { type: 'task', id: t.id, debut: debutFinal.get(cle) })
  })
  segments.forEach((s) => {
    const cle = entityKey('segment', s.id)
    if (bougees.has(cle) && debutFinal.get(cle) !== iso(s.date_debut)) changements.set(cle, { type: 'segment', id: s.id, debut: debutFinal.get(cle) })
  })

  const jalonsDecales = jalons
    .filter((j) => concerne(j.date))
    .map((j) => ({ id: j.id, avant: iso(j.date), date: decalerDate(j.date, ecart, periodes) }))
    .filter((j) => j.date !== j.avant)
    .map(({ id, date }) => ({ id, date }))

  // Tâches qui traversent désormais davantage de jours fermés : elles s'allongent
  const joursFermes = (debut, duree) => {
    const fin = dernierJourTache(debut, duree, periodes)
    let n = 0
    for (const d = parseDate(iso(debut)); d <= fin; d.setDate(d.getDate() + 1)) {
      if (isWorkingDay(d) && estBloque(d, periodes)) n++
    }
    return n
  }
  const allongees = tasks
    .filter((t) => bougees.has(entityKey('task', t.id)) && t.debut)
    .filter((t) => joursFermes(debutFinal.get(entityKey('task', t.id)), t.duree) > joursFermes(t.debut, t.duree))
    .map((t) => t.nom)

  return {
    ancienDebut,
    ecart,
    semaines: Math.round(joursCalendaires(ancienDebut, nouveauDebut) / 7),
    changements,
    lagsTaches,
    lagsDependances,
    jalons: jalonsDecales,
    resume: {
      taches: tasks.filter((t) => bougees.has(entityKey('task', t.id))).length,
      segments: segments.filter((s) => bougees.has(entityKey('segment', s.id))).length,
      jalons: jalons.filter((j) => concerne(j.date)).length,
      allongees,
    },
  }
}
