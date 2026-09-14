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

  // Nouveaux écarts après le déplacement manuel d'une tâche ou d'un segment liés.
  // Les réponses sont renvoyées telles quelles, à charge de l'appelant d'en
  // vérifier les erreurs avec le reste de ses écritures.
  const updateLags = (maj) => {
    if (maj.length === 0) return []
    const parId = new Map(maj.map((m) => [m.id, m.lag_jours]))
    setDependances((prev) => prev.map((d) => (parId.has(d.id) ? { ...d, lag_jours: parId.get(d.id) } : d)))
    return maj.map((m) =>
      supabase.from('planning_dependances').update({ lag_jours: m.lag_jours }).eq('id', m.id))
  }

  return { dependances, loading, addDependance, deleteDependance, updateLags, refetch: fetch }
}
