// ─── Import d'un planning d'étude : lecture de la source et écriture ─────────
//
// Pendant de `chantier/planning/importEcriture.js`, en plus simple : pas de
// lots, pas de zones, pas de table de dépendances. Le calcul est dans
// `importPlanningEtude.js` (pur, testé).
//
// Ordre imposé : phases → liaisons internes → segments → jalons.

import { supabase } from '../../../core/supabase/client'
import { ancresImporteesEtude } from './importPlanningEtude'

export async function chargerPlanningEtudeSource(affaireId) {
  const [phases, segments, jalons] = await Promise.all([
    supabase.from('planning_etude_phases').select('*').eq('affaire_id', affaireId).order('ordre'),
    supabase.from('planning_etude_segments').select('*').eq('affaire_id', affaireId),
    supabase.from('planning_etude_jalons').select('*').eq('affaire_id', affaireId).order('annee').order('semaine'),
  ])
  const erreur = [phases, segments, jalons].find((r) => r.error)?.error
  if (erreur) return { error: erreur }
  return {
    data: {
      phases: phases.data ?? [],
      segments: segments.data ?? [],
      jalons: jalons.data ?? [],
    },
  }
}


export async function ecrireImportEtude(affaireId, plan) {
  // 1. Phases, sans leur liaison : la phase parente n'est pas forcément écrite
  const { data: phases, error: erreurPhases } = await supabase.from('planning_etude_phases')
    .insert(plan.phases.map((p) => ({ ...p.ligne, affaire_id: affaireId })))
    .select()
  if (erreurPhases) return { error: erreurPhases }
  const phaseParOrigine = new Map(plan.phases.map((p, i) => [p.origine, phases[i].id]))

  // 2. Liaisons internes
  const liees = plan.phases.filter((p) => p.dependOrigine != null)
  for (const p of liees) {
    const { error } = await supabase.from('planning_etude_phases')
      .update({
        depends_on: phaseParOrigine.get(p.dependOrigine),
        lag_semaines: p.lag_semaines ?? 0,
      })
      .eq('id', phaseParOrigine.get(p.origine))
    if (error) return { error }
  }
  const phasesFinales = phases.map((f) => {
    const prepare = liees.find((l) => phaseParOrigine.get(l.origine) === f.id)
    return prepare
      ? { ...f, depends_on: phaseParOrigine.get(prepare.dependOrigine), lag_semaines: prepare.lag_semaines ?? 0 }
      : f
  })

  // 3. Segments
  let segments = []
  if (plan.segments.length) {
    const { data, error } = await supabase.from('planning_etude_segments')
      .insert(plan.segments.map((s) => ({
        ...s.ligne,
        affaire_id: affaireId,
        phase_id: phaseParOrigine.get(s.phaseOrigine),
      })))
      .select()
    if (error) return { error }
    segments = data
  }
  const segmentParOrigine = new Map(plan.segments.map((s, i) => [s.origine, segments[i]?.id]))

  // 4. Jalons — `id` `generated ALWAYS` : ne jamais en fournir un. Ancre
  // reportée sur la copie de sa barre ; barre non importée → jalon libre.
  let jalons = []
  if (plan.jalons.length) {
    const { data, error } = await supabase.from('planning_etude_jalons')
      .insert(plan.jalons.map((j) => ({
        ...j.ligne,
        ...ancresImporteesEtude(j, phaseParOrigine, segmentParOrigine),
        affaire_id: affaireId,
      })))
      .select()
    if (error) return { error }
    jalons = data
  }

  return { data: { phases: phasesFinales, segments, jalons } }
}
