import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export function usePlanningZones(affaireId) {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!affaireId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('planning_zones')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('ordre')
    setZones(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const createZone = async (nom, couleur) => {
    const { data, error } = await supabase
      .from('planning_zones')
      .insert([{ affaire_id: affaireId, nom, couleur, ordre: zones.length }])
      .select()
      .single()
    if (!error) setZones((prev) => [...prev, data])
    return { data, error }
  }

  const updateZone = async (id, changes) => {
    const { error } = await supabase
      .from('planning_zones')
      .update(changes)
      .eq('id', id)
    if (!error) setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...changes } : z)))
    return { error }
  }

  const deleteZone = async (id) => {
    const { error } = await supabase
      .from('planning_zones')
      .delete()
      .eq('id', id)
    if (!error) setZones((prev) => prev.filter((z) => z.id !== id))
    return { error }
  }

  return { zones, loading, createZone, updateZone, deleteZone, refetch: fetch }
}
