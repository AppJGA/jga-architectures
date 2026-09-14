import { weeksBetween, finEffectivePhase } from './types'

/**
 * computeCriticalPath — Méthode CPM sur les phases étude.
 *
 * Le modèle a un seul `depends_on` par phase (une dépendance directe).
 * Le CPM calcule néanmoins le chemin critique sur les séquences parallèles :
 * deux branches sans lien entre elles peuvent toutes deux être critiques
 * si leurs EF atteignent la fin de projet.
 *
 * Les dates sont exprimées en semaines depuis la première phase du planning.
 * Faire démarrer toute phase sans prédécesseur à 0 comparait deux branches
 * décalées de plusieurs mois comme si elles commençaient ensemble.
 *
 * @param {Array} phases — phases avec { id, semaine_debut, annee_debut, duree_semaines, depends_on, lag_semaines }
 * @param {Array} periodes — périodes bloquantes : elles repoussent la fin effective
 * @returns {Set} criticalIds — IDs des phases sur le chemin critique
 */
export function computeCriticalPath(phases, periodes = []) {
  // Les phases sans identifiant (venues de Notion) ne peuvent pas servir de clé
  const valides = (phases ?? []).filter(p => p?.id != null && p.semaine_debut && p.annee_debut)
  if (valides.length === 0) return new Set()

  const phaseMap = new Map(valides.map(p => [p.id, p]))

  let reference = valides[0]
  valides.forEach(p => {
    if (weeksBetween(reference.semaine_debut, reference.annee_debut, p.semaine_debut, p.annee_debut) < 0) {
      reference = p
    }
  })
  const indexDe = (semaine, annee) =>
    weeksBetween(reference.semaine_debut, reference.annee_debut, semaine, annee)

  // Position réelle de chaque phase : début et fin effective (semaines bloquées
  // déduites), l'écart des deux étant l'étendue occupée sur le calendrier.
  const DEBUT = new Map()
  const FIN = new Map()
  valides.forEach(p => {
    const fin = finEffectivePhase(p, periodes)
    DEBUT.set(p.id, indexDe(p.semaine_debut, p.annee_debut))
    FIN.set(p.id, indexDe(fin.semaine, fin.annee))
  })
  const etendue = (id) => FIN.get(id) - DEBUT.get(id)

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

  valides.forEach(p => dfs(p.id))

  // ── Forward pass : ES (Early Start) et EF (Early Finish) en semaines ────────
  const ES = new Map()
  const EF = new Map()

  for (const id of order) {
    const phase = phaseMap.get(id)
    let es = DEBUT.get(id)
    if (phase.depends_on != null && EF.has(phase.depends_on)) {
      es = EF.get(phase.depends_on) + (phase.lag_semaines ?? 0)
    }
    ES.set(id, es)
    EF.set(id, es + etendue(id))
  }

  const projectEnd = EF.size > 0 ? Math.max(...EF.values()) : 0

  // ── Carte des successeurs ───────────────────────────────────────────────────
  const successors = new Map(valides.map(p => [p.id, []]))
  valides.forEach(p => {
    if (p.depends_on != null && successors.has(p.depends_on)) {
      successors.get(p.depends_on).push(p)
    }
  })

  // ── Backward pass : LS (Late Start) et LF (Late Finish) ────────────────────
  const LS = new Map()
  const LF = new Map()

  for (const id of [...order].reverse()) {
    const succs = successors.get(id) ?? []

    const lf = succs.length === 0
      ? projectEnd
      : Math.min(...succs.map(s => (LS.get(s.id) ?? projectEnd) - (s.lag_semaines ?? 0)))

    LF.set(id, lf)
    LS.set(id, lf - etendue(id))
  }

  // ── Float = LS − ES ; chemin critique = float ≈ 0 ──────────────────────────
  const criticalIds = new Set()
  for (const phase of valides) {
    const float = (LS.get(phase.id) ?? 0) - (ES.get(phase.id) ?? 0)
    if (Math.abs(float) < 0.001) criticalIds.add(phase.id)
  }

  return criticalIds
}
