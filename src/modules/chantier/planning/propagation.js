// ─── Propagation en cascade des chemins critiques ─────────────────────────────
//
// Règle : debut(enfant) = max sur TOUS ses parents de (finEffective(parent) + lag)
//
//   - finEffective = dernier jour ouvré de la tâche + son `delai_apres` (séchage,
//     livraison…) : une tâche qui sèche 3 jours ne libère ses suivantes qu'après ;
//
//   - le lag est calculé une seule fois à la création du lien, puis conservé ;
//   - un enfant est contraint par TOUS ses parents, pas seulement par celui d'où
//     vient la propagation — c'est ce qui rend corrects les cas de convergence
//     (A→C, B→C) et de diamant (A→B→D, A→C→D) : l'enfant se cale sur la
//     contrainte la plus tardive, et ne recule que si TOUTES ses contraintes
//     reculent ;
//   - la date obtenue est repoussée hors des week-ends et des périodes bloquées.
//
// Deux graphes de dépendances sont fusionnés :
//   - historique : `planning.depends_on` / `planning.lag_days` (tâche → tâche)
//   - étendu : table `planning_dependances` (tâche/segment → tâche/segment)
//
// La fonction est pure : elle ne lit aucun state et n'écrit rien. Elle renvoie
// la liste des entités à décaler, à charge de l'appelant de l'appliquer au state
// puis de la persister.

import { parseDate, formatDateISO, addWorkingDays, applyLag } from './types'

// Garde-fou contre les dépendances cycliques (A→B→A) : au-delà, on s'arrête en
// signalant plutôt que de boucler indéfiniment.
const MAX_PROPAGATION_STEPS = 5000

export function entityKey(type, id) { return `${type}:${id}` }

// ── Périodes bloquées ─────────────────────────────────────────────────────────

function isDateBloquee(date, periodes) {
  return periodes.some((p) => {
    if (!p.date_debut || !p.date_fin) return false
    return date >= parseDate(p.date_debut) && date <= parseDate(p.date_fin)
  })
}

// Première date ouvrée à partir de `date`, hors week-end et hors période bloquée
export function skipBlockedPeriods(date, periodes = []) {
  const d = new Date(date)
  let guard = 0
  while (d.getDay() === 0 || d.getDay() === 6 || isDateBloquee(d, periodes)) {
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

/**
 * Calcule toutes les entités à décaler après le déplacement/redimensionnement
 * d'une tâche ou d'un segment.
 *
 * @returns Map<cléEntité, { type, id, debut }> — les descendantes à mettre à
 *          jour ; l'entité modifiée elle-même n'y figure jamais.
 */
export function propagateAllDependencies({
  tasks, segments, dependances,
  changedType, changedId, newDebut, newDuree, newDelaiApres,
  periodes = [],
}) {
  // Snapshot mutable des dates de toutes les entités
  const snapshot = new Map()
  tasks.forEach((t) => snapshot.set(entityKey('task', t.id), {
    type: 'task', id: t.id, debut: t.debut, duree: t.duree, delaiApres: t.delai_apres ?? 0,
  }))
  segments.forEach((s) => snapshot.set(entityKey('segment', s.id), {
    type: 'segment', id: s.id, debut: s.date_debut, duree: s.duree_jours, delaiApres: 0,
  }))

  const changedKey = entityKey(changedType, changedId)
  const changed = snapshot.get(changedKey)
  if (!changed) return new Map()
  snapshot.set(changedKey, {
    ...changed,
    debut: newDebut,
    duree: newDuree,
    delaiApres: newDelaiApres ?? changed.delaiApres,
  })

  const parentEdges = buildParentEdges(tasks, dependances)
  const childEdges = buildChildEdges(parentEdges)

  // Début au plus tôt d'une entité, contraint par l'ensemble de ses parents.
  // Le délai après la fin du parent s'ajoute au lag : applyLag part du dernier
  // jour ouvré du parent, on lui ajoute donc (delai_apres + lag) jours ouvrés.
  const earliestStart = (key) => {
    let best = null
    ;(parentEdges.get(key) ?? []).forEach(({ parentKey, lag }) => {
      const parent = snapshot.get(parentKey)
      if (!parent?.debut) return
      const duree = Math.max(1, Number(parent.duree) || 1)
      const decalage = lag + (Number(parent.delaiApres) || 0)
      const start = skipBlockedPeriods(applyLag(parseDate(parent.debut), duree, decalage), periodes)
      if (!best || start > best) best = start
    })
    return best
  }

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
 * Fin effective d'une tâche : dernier jour ouvré + délai après (séchage…).
 * C'est cette date que voient les tâches dépendantes.
 *
 * @param entite { debut, duree, delai_apres }
 */
export function finEffective({ debut, duree, delai_apres }) {
  const lastDay = addWorkingDays(parseDate(debut), Math.max(1, Number(duree) || 1) - 1)
  const delai = Number(delai_apres) || 0
  return delai > 0 ? addWorkingDays(lastDay, delai) : lastDay
}

/**
 * La fin effective d'une tâche change-t-elle ?
 *
 * Un redimensionnement par la poignée gauche recule la date de début et
 * augmente la durée d'autant : la fin ne bouge pas, donc aucune dépendance
 * n'est affectée et toute propagation serait un faux positif.
 *
 * @param avant { debut, duree, delai_apres }
 * @param apres { debut, duree, delai_apres }
 */
export function endDateChanged(avant, apres) {
  return finEffective(avant).getTime() !== finEffective(apres).getTime()
}
