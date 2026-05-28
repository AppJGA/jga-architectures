import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

function origineToCategorie(origine) {
  return { moe: 'adaptation_moe', mo: 'demande_mo', aleas: 'aleas' }[origine] ?? 'adaptation_moe'
}

function decisionToStatut(decision) {
  return { accepte: 'avenant_signe', renonce: 'refuse', en_attente: 'en_attente' }[decision ?? 'en_attente'] ?? 'en_attente'
}

function buildLfPayload(ftmRow, affaireId) {
  const ref = `FTM-${String(ftmRow.numero).padStart(3, '0')}`
  return {
    affaire_id: affaireId,
    lot_id: ftmRow.lot_id ?? null,
    categorie: origineToCategorie(ftmRow.origine),
    intitule: (ftmRow.description ?? ref).slice(0, 200),
    montant_ht: ftmRow.montant_travaux_ht ?? 0,
    statut: decisionToStatut(ftmRow.decision),
    reference: ref,
  }
}

export function useFtm(affaireId) {
  const [ftms, setFtms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    if (!affaireId) return
    const { data, error: err } = await supabase
      .from('ftm')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('numero', { ascending: false })
    if (err) setError(err.message)
    else { setFtms(data ?? []); setError(null) }
  }, [affaireId])

  useEffect(() => {
    if (!affaireId) return
    setLoading(true)
    refetch().finally(() => setLoading(false))
  }, [affaireId, refetch])

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

    const { data: lfRow, error: lfErr } = await supabase
      .from('lignes_financieres')
      .insert([{ ...buildLfPayload(ftmRow, affaireId), ftm_id: ftmRow.id }])
      .select()
      .single()
    if (lfErr) throw new Error(lfErr.message)

    await supabase.from('ftm').update({ ligne_financiere_id: lfRow.id }).eq('id', ftmRow.id)
    await refetch()
    return { ...ftmRow, ligne_financiere_id: lfRow.id }
  }, [affaireId, refetch])

  const updateFtm = useCallback(async (id, data) => {
    const { data: ftmRow, error: updateErr } = await supabase
      .from('ftm')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (updateErr) throw new Error(updateErr.message)

    const lfPayload = buildLfPayload(ftmRow, affaireId)
    if (ftmRow.ligne_financiere_id) {
      await supabase.from('lignes_financieres').update(lfPayload).eq('id', ftmRow.ligne_financiere_id)
    } else {
      const { data: lfRow } = await supabase
        .from('lignes_financieres')
        .insert([{ ...lfPayload, ftm_id: id }])
        .select()
        .single()
      if (lfRow) {
        await supabase.from('ftm').update({ ligne_financiere_id: lfRow.id }).eq('id', id)
      }
    }

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
