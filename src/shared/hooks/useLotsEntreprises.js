import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

function flattenLot(lot) {
  const le = lot.lot_entreprises?.[0] ?? null
  const e = le?.entreprises ?? null
  const i = le?.interlocuteurs ?? null
  return {
    id: lot.id,
    affaire_id: lot.affaire_id,
    numero: lot.numero,
    nom: lot.nom,
    ordre: lot.ordre,
    created_at: lot.created_at,
    lot_entreprise_id: le?.id ?? null,
    montant_marche_ht: le?.montant_marche_ht ?? null,
    montant_marche_ttc: le?.montant_marche_ttc ?? null,
    date_notification: le?.date_notification ?? null,
    observations: le?.observations ?? null,
    entreprise_id: e?.id ?? null,
    raison_sociale: e?.raison_sociale ?? null,
    adresse: e?.adresse ?? null,
    code_postal: e?.code_postal ?? null,
    ville: e?.ville ?? null,
    siret: e?.siret ?? null,
    entreprise_tel: e?.telephone ?? null,
    entreprise_email: e?.email ?? null,
    interlocuteur_id: i?.id ?? null,
    prenom: i?.prenom ?? null,
    nom_contact: i?.nom ?? null,
    fonction: i?.fonction ?? null,
    interlocuteur_tel: i?.telephone ?? null,
    interlocuteur_email: i?.email ?? null,
  }
}

export function useLotsEntreprises(affaireId) {
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('lots')
      .select(`
        *,
        lot_entreprises(
          id,
          montant_marche_ht,
          montant_marche_ttc,
          date_notification,
          observations,
          entreprises(*),
          interlocuteurs(*)
        )
      `)
      .eq('affaire_id', affaireId)
      .order('ordre', { ascending: true })
      .order('numero', { ascending: true })
    if (err) setError(err)
    else setLots((data ?? []).map(flattenLot))
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const createLot = async ({ numero, nom }) => {
    const { error: err } = await supabase.from('lots').insert({
      affaire_id: affaireId,
      numero,
      nom,
      ordre: numero,
    })
    if (!err) await fetch()
    return { error: err }
  }

  const updateLot = async (lotId, { numero, nom }) => {
    const { error: err } = await supabase
      .from('lots')
      .update({ numero, nom, ordre: numero })
      .eq('id', lotId)
    if (!err) await fetch()
    return { error: err }
  }

  const deleteLot = async (lotId) => {
    const { error: err } = await supabase.from('lots').delete().eq('id', lotId)
    if (!err) await fetch()
    return { error: err }
  }

  const assignerEntreprise = async (lotId, { entreprise_id, interlocuteur_id, montant_marche_ht, montant_marche_ttc, date_notification, observations }) => {
    const lot = lots.find(l => l.id === lotId)
    if (lot?.lot_entreprise_id) {
      const { error: err } = await supabase
        .from('lot_entreprises')
        .update({ entreprise_id, interlocuteur_id, montant_marche_ht, montant_marche_ttc, date_notification, observations })
        .eq('id', lot.lot_entreprise_id)
      if (!err) await fetch()
      return { error: err }
    } else {
      const { error: err } = await supabase.from('lot_entreprises').insert({
        lot_id: lotId,
        affaire_id: affaireId,
        entreprise_id,
        interlocuteur_id,
        montant_marche_ht,
        montant_marche_ttc,
        date_notification,
        observations,
      })
      if (!err) await fetch()
      return { error: err }
    }
  }

  const retirerEntreprise = async (lotId) => {
    const lot = lots.find(l => l.id === lotId)
    if (!lot?.lot_entreprise_id) return { error: null }
    const { error: err } = await supabase
      .from('lot_entreprises')
      .delete()
      .eq('id', lot.lot_entreprise_id)
    if (!err) await fetch()
    return { error: err }
  }

  return { lots, loading, error, createLot, updateLot, deleteLot, assignerEntreprise, retirerEntreprise, refetch: fetch }
}

export function useEntreprises() {
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('entreprises')
      .select('*')
      .order('raison_sociale', { ascending: true })
    setEntreprises(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const createEntreprise = async (data) => {
    const { data: result, error } = await supabase
      .from('entreprises')
      .insert(data)
      .select()
      .single()
    if (!error) await fetch()
    return { data: result, error }
  }

  const updateEntreprise = async (id, data) => {
    const { error } = await supabase.from('entreprises').update(data).eq('id', id)
    if (!error) await fetch()
    return { error }
  }

  return { entreprises, loading, createEntreprise, updateEntreprise }
}

export function useInterlocuteurs(entrepriseId) {
  const [interlocuteurs, setInterlocuteurs] = useState([])

  const fetch = useCallback(async () => {
    if (!entrepriseId) return
    const { data } = await supabase
      .from('interlocuteurs')
      .select('*')
      .eq('entreprise_id', entrepriseId)
      .order('est_principal', { ascending: false })
    setInterlocuteurs(data ?? [])
  }, [entrepriseId])

  useEffect(() => { fetch() }, [fetch])

  const createInterlocuteur = async (data) => {
    const { data: result, error } = await supabase
      .from('interlocuteurs')
      .insert({ ...data, entreprise_id: entrepriseId })
      .select()
      .single()
    if (!error) await fetch()
    return { data: result, error }
  }

  const updateInterlocuteur = async (id, data) => {
    const { error } = await supabase.from('interlocuteurs').update(data).eq('id', id)
    if (!error) await fetch()
    return { error }
  }

  const deleteInterlocuteur = async (id) => {
    const { error } = await supabase.from('interlocuteurs').delete().eq('id', id)
    if (!error) await fetch()
    return { error }
  }

  return { interlocuteurs, createInterlocuteur, updateInterlocuteur, deleteInterlocuteur }
}
