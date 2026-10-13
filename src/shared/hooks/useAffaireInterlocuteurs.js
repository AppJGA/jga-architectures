import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

import { CATEGORIE_META } from '../carnet/categoriesContact.js'
export { CATEGORIE_META }

export function useAffaireInterlocuteurs(affaireId) {
  const [interlocuteurs, setInterlocuteurs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)
    const { data } = await supabase
      .from('affaire_interlocuteurs')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('ordre', { ascending: true })
    setInterlocuteurs(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addInterlocuteur = useCallback(async (payload) => {
    const maxOrdre = interlocuteurs.reduce((m, i) => Math.max(m, i.ordre), -1)
    const { error } = await supabase
      .from('affaire_interlocuteurs')
      .insert({ affaire_id: affaireId, ordre: maxOrdre + 1, ...payload })
    if (error) throw error
    await fetchAll()
  }, [affaireId, interlocuteurs, fetchAll])

  const updateInterlocuteur = useCallback(async (id, payload) => {
    const { error } = await supabase
      .from('affaire_interlocuteurs')
      .update(payload)
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteInterlocuteur = useCallback(async (id) => {
    const { error } = await supabase
      .from('affaire_interlocuteurs')
      .delete()
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const reorderInterlocuteur = useCallback(async (id, dir) => {
    const sorted = [...interlocuteurs].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(i => i.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    await Promise.all([
      supabase.from('affaire_interlocuteurs').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('affaire_interlocuteurs').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ])
    await fetchAll()
  }, [interlocuteurs, fetchAll])

  return {
    interlocuteurs, loading,
    addInterlocuteur, updateInterlocuteur, deleteInterlocuteur, reorderInterlocuteur,
    refetch: fetchAll,
  }
}
