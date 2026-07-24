import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export function usePlanningDependances(affaireId) {
  const [dependances, setDependances] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!affaireId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('planning_dependances')
      .select('*')
      .eq('affaire_id', affaireId)
    setDependances(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const addDependance = async ({ sourceTacheId, sourceSegmentId, cibleTacheId, cibleSegmentId, lagJours }) => {
    const { data: newDep, error } = await supabase
      .from('planning_dependances')
      .insert([{
        affaire_id: affaireId,
        source_tache_id: sourceTacheId ?? null,
        source_segment_id: sourceSegmentId ?? null,
        cible_tache_id: cibleTacheId ?? null,
        cible_segment_id: cibleSegmentId ?? null,
        lag_jours: lagJours ?? 0,
      }])
      .select()
      .single()
    if (!error) setDependances((prev) => [...prev, newDep])
    return { data: newDep, error }
  }

  const deleteDependance = async (id) => {
    const { error } = await supabase
      .from('planning_dependances')
      .delete()
      .eq('id', id)
    if (!error) setDependances((prev) => prev.filter((d) => d.id !== id))
    return { error }
  }

  return { dependances, loading, addDependance, deleteDependance, refetch: fetch }
}
