import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

function buildTableau(lotsData, lignesData, ftmsData, tva) {
  const ftmByLfId = {}
  for (const f of ftmsData ?? []) {
    if (f.ligne_financiere_id) {
      ftmByLfId[f.ligne_financiere_id] = { ftm_id: f.id, ftm_numero: f.numero }
    }
  }

  const lots = lotsData.map(lot => {
    const le = lot.lot_entreprises?.[0] ?? null
    const marche_base_ht = le?.montant_marche_ht ?? 0

    const allLignes = lignesData
      .filter(l => l.lot_id === lot.id)
      .map(l => ({ ...l, ...(ftmByLfId[l.id] ?? {}) }))
      .sort((a, b) => a.ordre - b.ordre)

    const activeLignes = allLignes.filter(l => l.statut !== 'refuse')

    const sum = (cat) =>
      activeLignes.filter(l => l.categorie === cat).reduce((s, l) => s + (l.montant_ht ?? 0), 0)

    const total_aleas_ht       = sum('aleas')
    const total_adaptation_ht  = sum('adaptation_moe')
    const total_mo_ht          = sum('demande_mo')
    const total_supplements_ht = total_aleas_ht + total_adaptation_ht + total_mo_ht
    const total_lot_ht         = marche_base_ht + total_supplements_ht
    const delta_pct            = marche_base_ht > 0 ? (total_supplements_ht / marche_base_ht) * 100 : 0

    return {
      id: lot.id,
      numero: lot.numero,
      nom: lot.nom,
      ordre: lot.ordre,
      entreprise: le?.entreprises ?? null,
      marche_base_ht,
      marche_base_ttc: marche_base_ht * tva,
      lignes: allLignes,
      total_aleas_ht,
      total_adaptation_ht,
      total_mo_ht,
      total_supplements_ht,
      total_lot_ht,
      total_lot_ttc: total_lot_ht * tva,
      delta_pct,
    }
  })

  const sum = (key) => lots.reduce((s, l) => s + l[key], 0)
  const marches_base_ht       = sum('marche_base_ht')
  const total_aleas_ht        = sum('total_aleas_ht')
  const total_adaptation_ht   = sum('total_adaptation_ht')
  const total_mo_ht           = sum('total_mo_ht')
  const total_supplements_ht  = sum('total_supplements_ht')
  const total_general_ht      = sum('total_lot_ht')

  const totaux = {
    marches_base_ht,
    total_aleas_ht,
    total_adaptation_ht,
    total_mo_ht,
    total_supplements_ht,
    total_general_ht,
    total_general_ttc: total_general_ht * tva,
    delta_pct: marches_base_ht > 0 ? (total_supplements_ht / marches_base_ht) * 100 : 0,
    alea_budget_pct: marches_base_ht > 0 ? (total_aleas_ht / marches_base_ht) * 100 : 0,
  }

  return { lots, totaux }
}

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
