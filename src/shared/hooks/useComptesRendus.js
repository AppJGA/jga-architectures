import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export function useComptesRendus(affaireId) {
  const [comptesRendus, setComptesRendus] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)
    const { data } = await supabase
      .from('comptes_rendus')
      .select('*, profiles:redacteur_id(prenom, nom)')
      .eq('affaire_id', affaireId)
      .order('numero', { ascending: false })
    setComptesRendus(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextNumero = useCallback(async () => {
    const { data } = await supabase
      .from('comptes_rendus')
      .select('numero')
      .eq('affaire_id', affaireId)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data?.numero ?? 0) + 1
  }, [affaireId])

  const createCR = useCallback(async (payload = {}) => {
    const numero = await nextNumero()
    const today = new Date().toISOString().split('T')[0]
    const { data: cr, error } = await supabase
      .from('comptes_rendus')
      .insert({ affaire_id: affaireId, numero, date_reunion: today, statut: 'brouillon', ...payload })
      .select()
      .single()
    if (error) throw error
    await fetchAll()
    return cr
  }, [affaireId, nextNumero, fetchAll])

  const updateCR = useCallback(async (id, payload) => {
    const { error } = await supabase
      .from('comptes_rendus')
      .update(payload)
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteCR = useCallback(async (id) => {
    const { error } = await supabase
      .from('comptes_rendus')
      .delete()
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const duplicateCR = useCallback(async (sourceCrId) => {
    const [
      { data: src },
      { data: sections },
      { data: sousSections },
      { data: remarques },
      { data: presences },
    ] = await Promise.all([
      supabase.from('comptes_rendus').select('*').eq('id', sourceCrId).single(),
      supabase.from('cr_sections').select('*').eq('cr_id', sourceCrId).order('ordre'),
      supabase.from('cr_sous_sections').select('*').eq('cr_id', sourceCrId).order('ordre'),
      supabase.from('cr_remarques').select('*').eq('cr_id', sourceCrId).eq('est_clos', false),
      supabase.from('cr_presences').select('*').eq('cr_id', sourceCrId),
    ])

    const numero = await nextNumero()
    const today = new Date().toISOString().split('T')[0]
    const { data: newCr, error } = await supabase
      .from('comptes_rendus')
      .insert({
        affaire_id: affaireId, numero, date_reunion: today,
        date_prochaine_reunion: src.date_prochaine_reunion,
        heure_prochaine_reunion: src.heure_prochaine_reunion,
        redacteur_id: src.redacteur_id, statut: 'brouillon',
      })
      .select().single()
    if (error) throw error

    // Map old section IDs → new section IDs
    const sIdMap = {}
    for (const s of sections ?? []) {
      const { data: ns } = await supabase
        .from('cr_sections')
        .insert({ cr_id: newCr.id, numero_romain: s.numero_romain, titre: s.titre, ordre: s.ordre })
        .select().single()
      if (ns) sIdMap[s.id] = ns.id
    }

    const ssIdMap = {}
    for (const ss of sousSections ?? []) {
      const newSId = sIdMap[ss.section_id]
      if (!newSId) continue
      const { data: nss } = await supabase
        .from('cr_sous_sections')
        .insert({ cr_id: newCr.id, section_id: newSId, code: ss.code, titre: ss.titre, ordre: ss.ordre })
        .select().single()
      if (nss) ssIdMap[ss.id] = nss.id
    }

    for (const r of remarques ?? []) {
      const newSsId = ssIdMap[r.sous_section_id]
      if (!newSsId) continue
      await supabase.from('cr_remarques').insert({
        cr_id: newCr.id, sous_section_id: newSsId,
        affaire_id: affaireId,
        lot_id: r.lot_id, date_note: r.date_note, pour: r.pour,
        description: r.description, statut: r.statut,
        date_echeance: r.date_echeance, est_important: r.est_important,
        est_clos: false, est_nouveau: true, ordre: r.ordre,
      })
    }

    for (const p of presences ?? []) {
      await supabase.from('cr_presences').insert({
        cr_id: newCr.id,
        interlocuteur_id: p.interlocuteur_id,
        lot_entreprise_id: p.lot_entreprise_id,
        presence: 'na', convoque: false,
      })
    }

    await fetchAll()
    return newCr
  }, [affaireId, nextNumero, fetchAll])

  return { comptesRendus, loading, createCR, updateCR, deleteCR, duplicateCR, refetch: fetchAll }
}
