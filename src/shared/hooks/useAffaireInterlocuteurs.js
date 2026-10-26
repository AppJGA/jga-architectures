import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

import { CATEGORIE_META } from '../carnet/categoriesContact.js'
import { erreurPortable, sansPortable } from '../telephones'
import { ecrireAvecReplis } from '../repliColonnes'
export { CATEGORIE_META }

// Sans la migration 072 (lien au carnet) ou 076 (portable), la colonne
// manque : on réécrit sans elle
const colonneAbsente = (error) => /interlocuteur_id/.test(error?.message ?? '') && ['PGRST204', '42703'].includes(error?.code)
const sansLien = (champs) => { const reste = { ...champs }; delete reste.interlocuteur_id; return reste }
const REPLIS = [[colonneAbsente, sansLien], [erreurPortable, sansPortable]]

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
    const ligne = { affaire_id: affaireId, ordre: maxOrdre + 1, ...payload }
    const { error } = await ecrireAvecReplis((l) => supabase.from('affaire_interlocuteurs').insert(l), ligne, REPLIS)
    if (error) throw error
    await fetchAll()
  }, [affaireId, interlocuteurs, fetchAll])

  const updateInterlocuteur = useCallback(async (id, payload) => {
    const { error } = await ecrireAvecReplis((l) => supabase.from('affaire_interlocuteurs').update(l).eq('id', id), payload, REPLIS)
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
