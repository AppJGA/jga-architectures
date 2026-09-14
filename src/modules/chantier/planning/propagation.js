// ─── Propagation en cascade des chemins critiques ─────────────────────────────
//
// Règle : debut(enfant) = max sur TOUS ses parents de (fin(parent) + lag)
//
//   - fin = dernier jour ouvré de la tâche. Les délais avant/après (appro,
//     séchage…) sont purement visuels : ils n'entrent pas dans le calcul du
//     chemin critique ;
//
//   - le lag est calculé une seule fois à la création du lien, puis conservé ;
//   - un enfant est contraint par TOUS ses parents, pas seulement par celui d'où
//     vient la propagation — c'est ce qui rend corrects les cas de convergence
//     (A→C, B→C) et de diamant (A→B→D, A→C→D) : l'enfant se cale sur la
//     contrainte la plus tardive, et ne recule que si TOUTES ses contraintes
//     reculent ;
//   - la fin d'un parent inclut les fermetures bloquantes qu'il traverse, comme
//     sa barre à l'écran ;
//   - la date obtenue est repoussée hors des week-ends et des périodes bloquées.
//
// Deux graphes de dépendances sont fusionnés :
//   - historique : `planning.depends_on` / `planning.lag_days` (tâche → tâche)
//   - étendu : table `planning_dependances` (tâche/segment → tâche/segment)
//
// La fonction est pure : elle ne lit aucun state et n'écrit rien. Elle renvoie
// la liste des entités à décaler, à charge de l'appelant de l'appliquer au state
// puis de la persister.

import { parseDate, formatDateISO, addWorkingDays, applyLag, computeLag, estBloque } from './types'

// Garde-fou contre les dépendances cycliques (A→B→A) : au-delà, on s'arrête en
// signalant plutôt que de boucler indéfiniment.
const MAX_PROPAGATION_STEPS = 5000

export function entityKey(type, id) { return `${type}:${id}` }

// ── Périodes bloquées ─────────────────────────────────────────────────────────

// Première date ouvrée à partir de `date`, hors week-end et hors période bloquée
export function skipBlockedPeriods(date, periodes = []) {
  const d = new Date(date)
  let guard = 0
  while (d.getDay() === 0 || d.getDay() === 6 || estBloque(d, periodes)) {
    d.setDate(d.getDate() + 1)
    if (++guard > 400) break
  }
  return d
}

// ── Graphe de dépendances ─────────────────────────────────────────────────────

// Index inverse : cléEnfant → [{ parentKey, lag }], construit depuis les DEUX
// sources de dépendances.
export function buildParentEdges(tasks, dependances) {
  const parents = new Map()
  const addEdge = (parentKey, childKey, lag) => {
    if (!parents.has(childKey)) parents.set(childKey, [])
    parents.get(childKey).push({ parentKey, lag: lag ?? 0 })
  }

  // Source 1 : planning.depends_on / planning.lag_days
  tasks.forEach((task) => {
    if (task.depends_on == null) return
    addEdge(entityKey('task', task.depends_on), entityKey('task', task.id), task.lag_days ?? 0)
  })

  // Source 2 : planning_dependances (peut impliquer des segments des deux côtés)
  dependances.forEach((dep) => {
    const sourceKey = dep.source_segment_id != null
      ? entityKey('segment', dep.source_segment_id)
      : dep.source_tache_id != null ? entityKey('task', dep.source_tache_id) : null
    const cibleKey = dep.cible_segment_id != null
      ? entityKey('segment', dep.cible_segment_id)
      : dep.cible_tache_id != null ? entityKey('task', dep.cible_tache_id) : null
    if (!sourceKey || !cibleKey) return
    addEdge(sourceKey, cibleKey, dep.lag_jours ?? 0)
  })

  return parents
}

// Index direct dérivé de l'index inverse : cléParent → [cléEnfant]
function buildChildEdges(parentEdges) {
  const children = new Map()
  parentEdges.forEach((liens, childKey) => {
    liens.forEach(({ parentKey }) => {
      if (!children.has(parentKey)) children.set(parentKey, [])
      children.get(parentKey).push(childKey)
    })
  })
  return children
}

// ── Propagation ───────────────────────────────────────────────────────────────

// Dates de toutes les entités, sous une forme commune tâche / segment
function instantaneDates(tasks, segments) {
  const snapshot = new Map()
  tasks.forEach((t) => snapshot.set(entityKey('task', t.id), {
    type: 'task', id: t.id, debut: t.debut, duree: t.duree,
  }))
  segments.forEach((s) => snapshot.set(entityKey('segment', s.id), {
    type: 'segment', id: s.id, debut: s.date_debut, duree: s.duree_jours,
  }))
  return snapshot
}

// Début au plus tôt d'une entité, contraint par l'ensemble de ses parents
function debutAuPlusTot(key, parentEdges, snapshot, periodes) {
  let best = null
  ;(parentEdges.get(key) ?? []).forEach(({ parentKey, lag }) => {
    const parent = snapshot.get(parentKey)
    if (!parent?.debut) return
    const duree = Math.max(1, Number(parent.duree) || 1)
    const start = skipBlockedPeriods(applyLag(parent.debut, duree, lag, periodes), periodes)
    if (!best || start > best) best = start
  })
  return best
}

/**
 * Calcule toutes les entités à décaler après le déplacement/redimensionnement
 * d'une tâche ou d'un segment.
 *
 * @returns Map<cléEntité, { type, id, debut }> — les descendantes à mettre à
 *          jour ; l'entité modifiée elle-même n'y figure jamais.
 */
export function propagateAllDependencies({
  tasks, segments, dependances,
  changedType, changedId, newDebut, newDuree,
  periodes = [],
}) {
  const snapshot = instantaneDates(tasks, segments)

  const changedKey = entityKey(changedType, changedId)
  const changed = snapshot.get(changedKey)
  if (!changed) return new Map()
  snapshot.set(changedKey, { ...changed, debut: newDebut, duree: newDuree })

  const parentEdges = buildParentEdges(tasks, dependances)
  const childEdges = buildChildEdges(parentEdges)
  const earliestStart = (key) => debutAuPlusTot(key, parentEdges, snapshot, periodes)

  const updates = new Map()
  const queue = [changedKey]
  let steps = 0

  while (queue.length > 0) {
    if (++steps > MAX_PROPAGATION_STEPS) {
      console.warn('Propagation interrompue : dépendances probablement cycliques')
      break
    }

    const parentKey = queue.shift()

    ;(childEdges.get(parentKey) ?? []).forEach((childKey) => {
      // L'entité que l'utilisateur vient de déplacer reste où il l'a posée,
      // même si elle est par ailleurs l'enfant d'une de ses propres descendantes
      // (cycle A→B→A) — ce qui coupe court aux cycles les plus courants.
      if (childKey === changedKey) return

      const child = snapshot.get(childKey)
      if (!child) return

      const start = earliestStart(childKey)
      if (!start) return

      const newChildDebut = formatDateISO(start)
      if (newChildDebut === child.debut) return

      const updated = { ...child, debut: newChildDebut }
      snapshot.set(childKey, updated)
      updates.set(childKey, updated)
      queue.push(childKey)
    })
  }

  return updates
}

/**
 * Fin d'une tâche : son dernier jour ouvré. Les délais avant/après ne comptent
 * pas — ils n'ont qu'une valeur d'affichage.
 *
 * @param entite { debut, duree }
 */
export function finTache({ debut, duree }) {
  return addWorkingDays(parseDate(debut), Math.max(1, Number(duree) || 1) - 1)
}

/**
 * La date de fin d'une tâche change-t-elle ?
 *
 * Un redimensionnement par la poignée gauche recule la date de début et
 * augmente la durée d'autant : la fin ne bouge pas, donc aucune dépendance
 * n'est affectée et toute propagation serait un faux positif.
 *
 * @param avant { debut, duree }
 * @param apres { debut, duree }
 */
export function endDateChanged(avant, apres) {
  return finTache(avant).getTime() !== finTache(apres).getTime()
}

// ── Déplacement manuel d'une entité liée ──────────────────────────────────────
//
// La propagation replace les descendantes d'après l'écart mémorisé sur chaque
// lien. Quand l'utilisateur déplace lui-même une tâche liée, cet écart doit
// suivre : sinon, au décalage suivant du prédécesseur, la tâche revient se
// coller à son ancienne position au lieu d'être décalée.

/**
 * Lien historique `depends_on` / `lag_days` : un écart saisi (modale) replace
 * la tâche, un début modifié (glissement ou modale) ou un nouveau parent
 * recalcule l'écart. `avant` vaut null à la création.
 *
 * @returns { debut, lag_days } à enregistrer
 */
export function reconcilierLienHistorique(avant, apres, parent, periodes = []) {
  const resultat = { debut: apres.debut, lag_days: apres.lag_days }
  if (apres.depends_on == null || !parent?.debut || !apres.debut) return resultat

  const memeLien = avant != null && avant.depends_on === apres.depends_on
  // L'écart de référence : celui que la modale a proposé au choix du parent
  // (`lag_propose`), sinon celui du lien existant. S'il a été modifié, c'est
  // une saisie — y compris quand le parent vient d'être choisi.
  const reference = apres.lag_propose !== undefined ? apres.lag_propose : (memeLien ? avant.lag_days : undefined)
  const lagSaisi = reference !== undefined && (apres.lag_days ?? 0) !== (reference ?? 0)
  if (lagSaisi) {
    const debut = skipBlockedPeriods(applyLag(parent.debut, parent.duree, apres.lag_days, periodes), periodes)
    return { debut: formatDateISO(debut), lag_days: apres.lag_days }
  }
  if (!memeLien || apres.debut !== avant.debut) {
    return { debut: apres.debut, lag_days: computeLag(parent.debut, parent.duree, apres.debut, periodes) }
  }
  return resultat
}

/**
 * Liens de `planning_dependances` qui visent l'entité déplacée, avec l'écart
 * correspondant à sa nouvelle position. Seuls les écarts qui changent sont
 * renvoyés.
 *
 * @returns [{ id, lag_jours }]
 */
export function lagsDependancesCible({ type, id, debut, tasks, segments, dependances, periodes = [] }) {
  return dependances
    .filter((dep) => (type === 'segment'
      ? dep.cible_segment_id === id
      : dep.cible_segment_id == null && dep.cible_tache_id === id))
    .map((dep) => {
      const source = dep.source_segment_id != null
        ? segments.find((sg) => sg.id === dep.source_segment_id)
        : tasks.find((t) => t.id === dep.source_tache_id)
      if (!source) return null
      const sourceDebut = dep.source_segment_id != null ? source.date_debut : source.debut
      const sourceDuree = dep.source_segment_id != null ? source.duree_jours : source.duree
      if (!sourceDebut) return null
      const lag = computeLag(sourceDebut, sourceDuree, debut, periodes)
      return lag === (dep.lag_jours ?? 0) ? null : { id: dep.id, lag_jours: lag }
    })
    .filter(Boolean)
}

/**
 * Un lien source → cible fermerait-il une boucle ? C'est le cas si la source
 * descend déjà de la cible (ou si c'est la même entité). Une boucle fait
 * avancer les tâches par à-coups à chaque propagation.
 *
 * @param sourceKey, cibleKey — clés `entityKey`
 */
export function creeraitUnCycle(sourceKey, cibleKey, tasks, dependances) {
  if (sourceKey === cibleKey) return true
  const enfants = buildChildEdges(buildParentEdges(tasks, dependances))
  const vus = new Set([cibleKey])
  const file = [cibleKey]
  while (file.length > 0) {
    const cle = file.shift()
    for (const enfant of enfants.get(cle) ?? []) {
      if (enfant === sourceKey) return true
      if (!vus.has(enfant)) { vus.add(enfant); file.push(enfant) }
    }
  }
  return false
}

/**
 * Recale tout le planning sur ses liens, sans entité de départ : sert quand ce
 * qui change n'est pas une tâche mais le calendrier (fermeture ajoutée,
 * modifiée ou supprimée). Les entités sont traitées parents d'abord ; celles
 * prises dans un cycle sont laissées en place.
 *
 * @returns Map<cléEntité, { type, id, debut }> — les entités à décaler
 */
export function propagerDepuisRacines({ tasks, segments, dependances, periodes = [] }) {
  const snapshot = instantaneDates(tasks, segments)
  const parentEdges = buildParentEdges(tasks, dependances)
  const childEdges = buildChildEdges(parentEdges)

  // Ordre topologique (Kahn) : un enfant n'est calculé qu'une fois tous ses
  // parents recalés.
  const restants = new Map()
  snapshot.forEach((_, cle) => {
    restants.set(cle, (parentEdges.get(cle) ?? []).filter(({ parentKey }) => snapshot.has(parentKey)).length)
  })
  const file = [...restants].filter(([, n]) => n === 0).map(([cle]) => cle)
  const updates = new Map()

  while (file.length > 0) {
    const cle = file.shift()
    const entite = snapshot.get(cle)
    const debut = debutAuPlusTot(cle, parentEdges, snapshot, periodes)
    if (debut && formatDateISO(debut) !== entite.debut) {
      const maj = { ...entite, debut: formatDateISO(debut) }
      snapshot.set(cle, maj)
      updates.set(cle, maj)
    }
    ;(childEdges.get(cle) ?? []).forEach((enfant) => {
      if (!restants.has(enfant)) return
      restants.set(enfant, restants.get(enfant) - 1)
      if (restants.get(enfant) === 0) file.push(enfant)
    })
  }
  return updates
}
