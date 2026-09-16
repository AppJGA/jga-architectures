import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../core/supabase/client'
import { assurerLigneFinanciere, rattraperLignesManquantes } from '../../modules/chantier/ftm/ligneFinanciere'

// Une fiche de travaux modificatifs et sa ligne dans le suivi financier vont
// ensemble : la forme de la ligne se décide dans `ftm/ligneFinanciereLogique.js`.

export function useFtm(affaireId) {
  const [ftms, setFtms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const rattrapageFait = useRef(false)

  const refetch = useCallback(async () => {
    if (!affaireId) return []
    const { data, error: err } = await supabase
      .from('ftm')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('numero', { ascending: false })
    if (err) { setError(err.message); return [] }
    setFtms(data ?? [])
    setError(null)
    return data ?? []
  }, [affaireId])

  useEffect(() => {
    if (!affaireId) return
    rattrapageFait.current = false
    setLoading(true)
    refetch().finally(() => setLoading(false))
  }, [affaireId, refetch])

  // Fiches d'avant le rattachement au suivi financier, ou dont l'écriture
  // s'était arrêtée à mi-chemin : leur ligne est créée au premier affichage.
  useEffect(() => {
    if (!affaireId || loading || rattrapageFait.current) return
    if (!ftms.some(f => !f.ligne_financiere_id)) return
    rattrapageFait.current = true
    rattraperLignesManquantes(ftms, affaireId)
      .then((creees) => { if (creees > 0) refetch() })
      .catch(err => console.warn('Rattrapage des lignes financières :', err))
  }, [affaireId, loading, ftms, refetch])

  const createFtm = useCallback(async (data) => {
    const { data: num, error: numErr } = await supabase
      .rpc('next_ftm_numero', { p_affaire_id: affaireId })
    if (numErr) throw new Error(numErr.message)

    const { data: ftmRow, error: insertErr } = await supabase
      .from('ftm')
      .insert([{ ...data, affaire_id: affaireId, numero: num }])
      .select()
      .single()
    if (insertErr) throw new Error(insertErr.message)

    const ligneId = await assurerLigneFinanciere(ftmRow, affaireId)
    await refetch()
    return { ...ftmRow, ligne_financiere_id: ligneId }
  }, [affaireId, refetch])

  const updateFtm = useCallback(async (id, data) => {
    const { data: ftmRow, error: updateErr } = await supabase
      .from('ftm')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (updateErr) throw new Error(updateErr.message)

    await assurerLigneFinanciere(ftmRow, affaireId)
    await refetch()
    return ftmRow
  }, [affaireId, refetch])

  const deleteFtm = useCallback(async (id) => {
    const ftm = ftms.find(f => f.id === id)
    const { error: delErr } = await supabase.from('ftm').delete().eq('id', id)
    if (delErr) throw new Error(delErr.message)
    if (ftm?.ligne_financiere_id) {
      await supabase.from('lignes_financieres').delete().eq('id', ftm.ligne_financiere_id)
    }
    await refetch()
  }, [ftms, refetch])

  return { ftms, loading, error, createFtm, updateFtm, deleteFtm, refetch }
}
