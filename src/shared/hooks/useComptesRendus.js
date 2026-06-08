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

    // Auto-import des remarques non clôturées du CR précédent
    const { data: prevCR } = await supabase
      .from('comptes_rendus')
      .select('id')
      .eq('affaire_id', affaireId)
      .neq('id', cr.id)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (prevCR) {
      const [
        { data: sections },
        { data: sousSections },
        { data: remarques },
      ] = await Promise.all([
        supabase.from('cr_sections').select('*').eq('cr_id', prevCR.id).order('ordre'),
        supabase.from('cr_sous_sections').select('*').eq('cr_id', prevCR.id).order('ordre'),
        supabase.from('cr_remarques').select('*')
          .eq('cr_id', prevCR.id)
          .eq('est_clos', false)
          .is('parent_id', null),
      ])

      // Mapping sections
      const sIdMap = {}
      for (const s of sections ?? []) {
        const { data: ns } = await supabase
          .from('cr_sections')
          .insert({ cr_id: cr.id, numero_romain: s.numero_romain, titre: s.titre, ordre: s.ordre, type_section: s.type_section ?? 'general' })
          .select().single()
        if (ns) sIdMap[s.id] = ns.id
      }

      // Mapping sous-sections
      const ssIdMap = {}
      for (const ss of sousSections ?? []) {
        const newSId = sIdMap[ss.section_id]
        if (!newSId) continue
        const { data: nss } = await supabase
          .from('cr_sous_sections')
          .insert({ cr_id: cr.id, section_id: newSId, code: ss.code, titre: ss.titre, ordre: ss.ordre })
          .select().single()
        if (nss) ssIdMap[ss.id] = nss.id
      }

      // Reprise des remarques principales non clôturées
      const remIdMap = {}
      for (const r of remarques ?? []) {
        const insertPayload = {
          cr_id: cr.id,
          affaire_id: affaireId,
          lot_id: r.lot_id,
          interlocuteur_id: r.interlocuteur_id,
          date_note: r.date_note,
          pour: r.pour,
          description: r.description,
          statut: r.statut,
          date_echeance: r.date_echeance,
          est_important: r.est_important,
          est_clos: false,
          est_nouveau: true,
          ordre: r.ordre,
        }

        if (r.sous_section_id) {
          const newSsId = ssIdMap[r.sous_section_id]
          if (!newSsId) continue
          insertPayload.sous_section_id = newSsId
          if (r.section_id) insertPayload.section_id = sIdMap[r.section_id] ?? null
        } else if (r.section_id) {
          const newSecId = sIdMap[r.section_id]
          if (!newSecId) continue
          insertPayload.section_id = newSecId
        } else {
          continue
        }

        const { data: newR } = await supabase.from('cr_remarques').insert(insertPayload).select().single()
        if (newR) remIdMap[r.id] = newR.id
      }

      // Reprise des sous-remarques des remarques reprises
      const parentIds = Object.keys(remIdMap)
      if (parentIds.length > 0) {
        const { data: sousRems } = await supabase
          .from('cr_remarques')
          .select('*')
          .in('parent_id', parentIds)

        for (const sr of sousRems ?? []) {
          const newParentId = remIdMap[sr.parent_id]
          if (!newParentId) continue
          await supabase.from('cr_remarques').insert({
            cr_id: cr.id,
            parent_id: newParentId,
            affaire_id: affaireId,
            date_note: sr.date_note,
            pour: sr.pour,
            description: sr.description,
            est_clos: false,
            est_nouveau: true,
          })
        }
      }
    }

    await fetchAll()
    return cr
  }, [affaireId, nextNumero, fetchAll])

  const updateCR = useCallback(async (id, payload) => {
    const { error } = await supabase.from('comptes_rendus').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteCR = useCallback(async (id) => {
    const { error } = await supabase.from('comptes_rendus').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  return { comptesRendus, loading, createCR, updateCR, deleteCR, refetch: fetchAll }
}
