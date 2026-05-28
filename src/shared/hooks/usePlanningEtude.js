import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

function normalizePhase(r) {
  return {
    ...r,
    duree_semaines: Number(r.duree_semaines),
    lag_semaines: Number(r.lag_semaines ?? 0),
    importance: r.importance ?? 'moe',
    duree_arch: r.duree_arch != null ? Number(r.duree_arch) : null,
    duree_bet: r.duree_bet != null ? Number(r.duree_bet) : null,
    duree_econ: r.duree_econ != null ? Number(r.duree_econ) : null,
  }
}

export function usePlanningEtude(affaireId) {
  const [phases, setPhases] = useState([])
  const [jalons, setJalons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    if (!affaireId) return
    const [{ data: p, error: e1 }, { data: j, error: e2 }] = await Promise.all([
      supabase
        .from('planning_etude_phases')
        .select('*')
        .eq('affaire_id', affaireId)
        .order('ordre', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('planning_etude_jalons')
        .select('*')
        .eq('affaire_id', affaireId)
        .order('annee', { ascending: true })
        .order('semaine', { ascending: true }),
    ])
    if (e1 || e2) { setError((e1 ?? e2).message); return }
    setPhases((p ?? []).map(normalizePhase))
    setJalons(j ?? [])
    setError(null)
  }, [affaireId])

  useEffect(() => {
    if (!affaireId) return
    setLoading(true)
    refetch().finally(() => setLoading(false))
  }, [affaireId, refetch])

  const addPhase = useCallback(async (data) => {
    const { error: err } = await supabase
      .from('planning_etude_phases')
      .insert([{ ...data, affaire_id: affaireId }])
    if (!err) await refetch()
    return { error: err }
  }, [affaireId, refetch])

  const updatePhase = useCallback(async (id, changes) => {
    const { error: err } = await supabase
      .from('planning_etude_phases')
      .update(changes)
      .eq('id', id)
    if (!err) await refetch()
    return { error: err }
  }, [refetch])

  const deletePhase = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('planning_etude_phases')
      .delete()
      .eq('id', id)
    if (!err) await refetch()
    return { error: err }
  }, [refetch])

  const addJalon = useCallback(async (data) => {
    const { error: err } = await supabase
      .from('planning_etude_jalons')
      .insert([{ ...data, affaire_id: affaireId }])
    if (!err) await refetch()
    return { error: err }
  }, [affaireId, refetch])

  const updateJalon = useCallback(async (id, changes) => {
    const { error: err } = await supabase
      .from('planning_etude_jalons')
      .update(changes)
      .eq('id', id)
    if (!err) await refetch()
    return { error: err }
  }, [refetch])

  const deleteJalon = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('planning_etude_jalons')
      .delete()
      .eq('id', id)
    if (!err) await refetch()
    return { error: err }
  }, [refetch])

  return {
    phases, jalons, loading, error,
    addPhase, updatePhase, deletePhase,
    addJalon, updateJalon, deleteJalon,
    refetch,
  }
}
