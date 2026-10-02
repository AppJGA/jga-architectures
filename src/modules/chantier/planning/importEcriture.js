// ─── Import d'un planning de chantier : lecture de la source et écriture ─────
//
// Le calcul est dans `importPlanning.js` (pur, testé). Ici, les allers-retours
// Supabase — donc rien de testable sans base, et c'est voulu : ce fichier ne
// décide de rien, il exécute le plan.
//
// **L'ordre des insertions n'est pas négociable** : une ligne ne peut désigner
// une autre qu'une fois celle-ci créée et son nouvel identifiant connu.
//
//   zones → lots → tâches → liaisons internes → segments → dépendances → jalons
//
// Les tâches sont insérées sans `depends_on`, puis mises à jour : à l'insertion
// la tâche parente n'est pas forcément déjà écrite, et l'ordre d'un lot de
// lignes ne garantit rien.

import { supabase } from '../../../core/supabase/client'
import { ancresImportees } from './importPlanning'

/** Tout le planning d'une affaire, tel que l'import en a besoin. */
export async function chargerPlanningSource(affaireId) {
  const [taches, segments, dependances, jalons, zones, lots] = await Promise.all([
    supabase.from('planning').select('*').eq('affaire_id', affaireId).order('ordre'),
    supabase.from('planning_segments').select('*').eq('affaire_id', affaireId),
    supabase.from('planning_dependances').select('*').eq('affaire_id', affaireId),
    supabase.from('planning_jalons').select('*').eq('affaire_id', affaireId).order('date'),
    supabase.from('planning_zones').select('*').eq('affaire_id', affaireId).order('ordre'),
    supabase.from('lots').select('*').eq('affaire_id', affaireId).order('numero'),
  ])
  const erreur = [taches, segments, dependances, jalons, zones, lots].find((r) => r.error)?.error
  if (erreur) return { error: erreur }
  return {
    data: {
      taches: taches.data ?? [],
      segments: segments.data ?? [],
      dependances: dependances.data ?? [],
      jalons: jalons.data ?? [],
      zones: zones.data ?? [],
      lots: lots.data ?? [],
    },
  }
}


/**
 * Écrit le plan préparé. Renvoie `{ data: { taches, segments, dependances,
 * jalons } }` — les lignes réellement créées, pour les injecter à l'écran sans
 * tout recharger — ou `{ error }` à la première écriture qui échoue.
 */
export async function ecrireImport(affaireId, plan) {
  // 1. Zones manquantes
  const zoneParOrigine = new Map()
  const zonesACreer = plan.zones.filter((z) => z.ligne)
  if (zonesACreer.length) {
    const { data, error } = await supabase.from('planning_zones')
      .insert(zonesACreer.map((z) => ({ ...z.ligne, affaire_id: affaireId })))
      .select()
    if (error) return { error }
    zonesACreer.forEach((z, i) => zoneParOrigine.set(z.origine, data[i].id))
  }
  for (const z of plan.zones) if (z.existante) zoneParOrigine.set(z.origine, z.existante)

  // 2. Lots manquants
  const lotParOrigine = new Map()
  const lotsACreer = plan.lots.filter((l) => l.ligne)
  if (lotsACreer.length) {
    const { data, error } = await supabase.from('lots')
      .insert(lotsACreer.map((l) => ({ ...l.ligne, affaire_id: affaireId })))
      .select()
    if (error) return { error }
    lotsACreer.forEach((l, i) => lotParOrigine.set(l.origine, data[i].id))
  }
  for (const l of plan.lots) if (l.existante) lotParOrigine.set(l.origine, l.existante)

  // 3. Tâches, sans leur liaison
  const { data: taches, error: erreurTaches } = await supabase.from('planning')
    .insert(plan.taches.map((t) => ({
      ...t.ligne,
      affaire_id: affaireId,
      lot_id: lotParOrigine.get(t.lotOrigine) ?? null,
      zone_id: zoneParOrigine.get(t.zoneOrigine) ?? null,
    })))
    .select()
  if (erreurTaches) return { error: erreurTaches }
  const tacheParOrigine = new Map(plan.taches.map((t, i) => [t.origine, taches[i].id]))

  // 4. Liaisons internes, maintenant que toutes les tâches ont leur identifiant
  const liees = plan.taches.filter((t) => t.dependOrigine != null)
  for (const t of liees) {
    const { error } = await supabase.from('planning')
      .update({
        depends_on: tacheParOrigine.get(t.dependOrigine),
        lag_days: t.lag_days ?? 0,
      })
      .eq('id', tacheParOrigine.get(t.origine))
    if (error) return { error }
  }
  const tachesFinales = taches.map((t) => {
    const prepare = liees.find((l) => tacheParOrigine.get(l.origine) === t.id)
    return prepare
      ? { ...t, depends_on: tacheParOrigine.get(prepare.dependOrigine), lag_days: prepare.lag_days ?? 0 }
      : t
  })

  // 5. Segments
  let segments = []
  if (plan.segments.length) {
    const { data, error } = await supabase.from('planning_segments')
      .insert(plan.segments.map((s) => ({
        ...s.ligne,
        affaire_id: affaireId,
        tache_id: tacheParOrigine.get(s.tacheOrigine),
        zone_id: zoneParOrigine.get(s.zoneOrigine) ?? null,
      })))
      .select()
    if (error) return { error }
    segments = data
  }
  const segmentParOrigine = new Map(plan.segments.map((s, i) => [s.origine, segments[i].id]))

  // 6. Dépendances
  let dependances = []
  if (plan.dependances.length) {
    const { data, error } = await supabase.from('planning_dependances')
      .insert(plan.dependances.map((d) => ({
        affaire_id: affaireId,
        source_tache_id: d.sourceTacheOrigine != null ? tacheParOrigine.get(d.sourceTacheOrigine) : null,
        source_segment_id: d.sourceSegmentOrigine != null ? segmentParOrigine.get(d.sourceSegmentOrigine) : null,
        cible_tache_id: d.cibleTacheOrigine != null ? tacheParOrigine.get(d.cibleTacheOrigine) : null,
        cible_segment_id: d.cibleSegmentOrigine != null ? segmentParOrigine.get(d.cibleSegmentOrigine) : null,
        lag_jours: d.lag_jours ?? 0,
      })))
      .select()
    if (error) return { error }
    dependances = data
  }

  // 7. Jalons — leur `id` est `generated ALWAYS` en base : ne jamais en fournir
  // un. Ancre reportée sur la copie de sa barre ; barre non importée → libre.
  let jalons = []
  if (plan.jalons.length) {
    const { data, error } = await supabase.from('planning_jalons')
      .insert(plan.jalons.map((j) => ({
        ...j.ligne,
        ...ancresImportees(j, tacheParOrigine, segmentParOrigine),
        affaire_id: affaireId,
      })))
      .select()
    if (error) return { error }
    jalons = data
  }

  return { data: { taches: tachesFinales, segments, dependances, jalons, zones: zonesACreer.length, lots: lotsACreer.length } }
}

