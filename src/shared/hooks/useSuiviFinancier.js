import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'
import { buildTableau } from '../../modules/chantier/financier/tableauLogique'

export function useSuiviFinancier(affaireId, affaire) {
  const tva = affaire?.taux_tva ?? 1.20
  const [tableau, setTableau] = useState({ lots: [], totaux: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)

    const [{ data: lotsData, error: e1 }, { data: lignesData, error: e2 }, { data: ftmsData }] = await Promise.all([
      supabase
        .from('lots')
        .select('*, lot_entreprises(montant_marche_ht, montant_marche_ttc, entreprises(raison_sociale))')
        .eq('affaire_id', affaireId)
        .order('ordre', { ascending: true })
        .order('numero', { ascending: true }),
      supabase
        .from('lignes_financieres')
        .select('*')
        .eq('affaire_id', affaireId)
        .order('ordre', { ascending: true }),
      supabase
        .from('ftm')
        .select('id, numero, ligne_financiere_id')
        .eq('affaire_id', affaireId),
    ])

    if (e1 || e2) setError(e1 ?? e2)
    else setTableau(buildTableau(lotsData ?? [], lignesData ?? [], ftmsData ?? [], tva))
    setLoading(false)
  }, [affaireId, tva])

  useEffect(() => { fetch() }, [fetch])

  const addLigne = async (data) => {
    const { error: err } = await supabase.from('lignes_financieres').insert({ ...data, affaire_id: affaireId })
    if (!err) await fetch()
    return { error: err }
  }

  const updateLigne = async (id, data) => {
    const { error: err } = await supabase.from('lignes_financieres').update(data).eq('id', id)
    if (!err) await fetch()
    return { error: err }
  }

  const deleteLigne = async (id) => {
    const { error: err } = await supabase.from('lignes_financieres').delete().eq('id', id)
    if (!err) await fetch()
    return { error: err }
  }

  return { tableau, loading, error, addLigne, updateLigne, deleteLigne, refetch: fetch }
}
