import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

// ─── Segments du planning d'étude ─────────────────────────────────────────────
//
// Équivalent hebdomadaire de `usePlanningSegments` (planning chantier) : une
// phase peut être représentée à plusieurs périodes distinctes (ex. une phase de
// suivi qui reprend après une interruption).
//
// `phase_id` est un bigint — `planning_etude_phases.id` est une identité bigint,
// contrairement à l'id du segment lui-même qui est un uuid.

function normalizeSegment(s) {
  return {
    ...s,
    semaine_debut: Number(s.semaine_debut),
    annee_debut: Number(s.annee_debut),
    duree_semaines: Number(s.duree_semaines ?? 2),
  }
}

export function usePlanningEtudeSegments(affaireId) {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!affaireId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('planning_etude_segments')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('ordre')
    setSegments((data ?? []).map(normalizeSegment))
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const addSegment = useCallback(async (phaseId, data) => {
    const { data: newSeg, error } = await supabase
      .from('planning_etude_segments')
      .insert([{
        phase_id: phaseId,
        affaire_id: affaireId,
        nom: data.nom ?? null,
        semaine_debut: data.semaine_debut,
        annee_debut: data.annee_debut,
        duree_semaines: data.duree_semaines ?? 2,
        ordre: segments.filter((s) => s.phase_id === phaseId).length,
      }])
      .select()
      .single()
    if (!error && newSeg) setSegments((prev) => [...prev, normalizeSegment(newSeg)])
    return { data: newSeg, error }
  }, [affaireId, segments])

  const updateSegment = useCallback(async (id, changes) => {
    const { error } = await supabase
      .from('planning_etude_segments')
      .update(changes)
      .eq('id', id)
    if (!error) {
      setSegments((prev) => prev.map((s) => (s.id === id ? normalizeSegment({ ...s, ...changes }) : s)))
    }
    return { error }
  }, [])

  const deleteSegment = useCallback(async (id) => {
    const { error } = await supabase
      .from('planning_etude_segments')
      .delete()
      .eq('id', id)
    if (!error) setSegments((prev) => prev.filter((s) => s.id !== id))
    return { error }
  }, [])

  // Remplacement complet du state local (pas d'appel Supabase) — utilisé par
  // l'historique annuler/rétablir, qui restaure la collection entière d'un coup.
  const replaceSegments = useCallback((liste) => { setSegments(liste) }, [])

  // Mise à jour du state local seulement (pas d'appel Supabase) — pendant un drag
  const updateSegmentLocal = useCallback((id, changes) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? normalizeSegment({ ...s, ...changes }) : s)))
  }, [])

  const getSegmentsForPhase = useCallback((phaseId) =>
    segments
      .filter((s) => s.phase_id === phaseId)
      .sort((a, b) => (a.annee_debut - b.annee_debut) || (a.semaine_debut - b.semaine_debut)),
    [segments]
  )

  return {
    segments,
    loading,
    addSegment,
    updateSegment,
    updateSegmentLocal,
    replaceSegments,
    deleteSegment,
    getSegmentsForPhase,
    refetch: fetch,
  }
}
