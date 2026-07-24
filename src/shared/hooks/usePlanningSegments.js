import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export function usePlanningSegments(affaireId) {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!affaireId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('planning_segments')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('ordre')
    setSegments(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const addSegment = async (tacheId, data) => {
    const { data: newSeg, error } = await supabase
      .from('planning_segments')
      .insert([{
        tache_id: tacheId,
        affaire_id: affaireId,
        date_debut: data.date_debut,
        duree_jours: data.duree_jours ?? 5,
        zone_id: data.zone_id ?? null,
        delai_appro: data.delai_appro ?? 0,
        ordre: segments.filter((s) => s.tache_id === tacheId).length,
      }])
      .select()
      .single()
    if (!error) setSegments((prev) => [...prev, newSeg])
    return { data: newSeg, error }
  }

  const updateSegment = async (id, changes) => {
    const { error } = await supabase
      .from('planning_segments')
      .update(changes)
      .eq('id', id)
    if (!error) setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)))
    return { error }
  }

  const deleteSegment = async (id) => {
    const { error } = await supabase
      .from('planning_segments')
      .delete()
      .eq('id', id)
    if (!error) setSegments((prev) => prev.filter((s) => s.id !== id))
    return { error }
  }

  // Mise à jour du state local uniquement (pas d'appel Supabase) — utilisé pendant le drag
  const updateSegmentLocal = (id, changes) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)))
  }

  const getSegmentsForTache = (tacheId) =>
    segments
      .filter((s) => s.tache_id === tacheId)
      .sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut))

  return {
    segments,
    loading,
    addSegment,
    updateSegment,
    updateSegmentLocal,
    deleteSegment,
    getSegmentsForTache,
    refetch: fetch,
  }
}
