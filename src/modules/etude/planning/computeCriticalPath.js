/**
 * computeCriticalPath — Méthode CPM sur les phases étude.
 *
 * Le modèle a un seul `depends_on` par phase (une dépendance directe).
 * Le CPM calcule néanmoins le chemin critique sur les séquences parallèles :
 * deux branches sans lien entre elles peuvent toutes deux être critiques
 * si leurs EF atteignent la fin de projet.
 *
 * @param {Array} phases — phases avec { id, duree_semaines, depends_on, lag_semaines }
 * @returns {Set} criticalIds — IDs des phases sur le chemin critique
 */
export function computeCriticalPath(phases) {
  if (phases.length === 0) return new Set()

  const phaseMap = new Map(phases.map(p => [p.id, p]))

  // ── Tri topologique (DFS post-order) ────────────────────────────────────────
  const visited  = new Set()
  const inStack  = new Set()
  const order    = []

  function dfs(id) {
    if (inStack.has(id)) return  // cycle — on ignore
    if (visited.has(id)) return
    inStack.add(id)
    const phase = phaseMap.get(id)
    if (phase?.depends_on != null && phaseMap.has(phase.depends_on)) {
      dfs(phase.depends_on)
    }
    inStack.delete(id)
    visited.add(id)
    order.push(id)
  }

  phases.forEach(p => dfs(p.id))

  // ── Forward pass : ES (Early Start) et EF (Early Finish) en semaines ────────
  const ES = new Map()
  const EF = new Map()

  for (const id of order) {
    const phase = phaseMap.get(id)
    let es = 0
    if (phase.depends_on != null && EF.has(phase.depends_on)) {
      es = EF.get(phase.depends_on) + (phase.lag_semaines ?? 0)
    }
    ES.set(id, es)
    EF.set(id, es + (phase.duree_semaines ?? 1))
  }

  const projectEnd = EF.size > 0 ? Math.max(...EF.values()) : 0

  // ── Carte des successeurs ───────────────────────────────────────────────────
  const successors = new Map(phases.map(p => [p.id, []]))
  phases.forEach(p => {
    if (p.depends_on != null && successors.has(p.depends_on)) {
      successors.get(p.depends_on).push(p)
    }
  })

  // ── Backward pass : LS (Late Start) et LF (Late Finish) ────────────────────
  const LS = new Map()
  const LF = new Map()

  for (const id of [...order].reverse()) {
    const phase = phaseMap.get(id)
    const succs = successors.get(id) ?? []

    const lf = succs.length === 0
      ? projectEnd
      : Math.min(...succs.map(s => (LS.get(s.id) ?? projectEnd) - (s.lag_semaines ?? 0)))

    LF.set(id, lf)
    LS.set(id, lf - (phase.duree_semaines ?? 1))
  }

  // ── Float = LS − ES ; chemin critique = float ≈ 0 ──────────────────────────
  const criticalIds = new Set()
  for (const phase of phases) {
    const float = (LS.get(phase.id) ?? 0) - (ES.get(phase.id) ?? 0)
    if (Math.abs(float) < 0.001) criticalIds.add(phase.id)
  }

  return criticalIds
}
