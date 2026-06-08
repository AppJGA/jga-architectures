import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

function buildTree(sections, sousSections, remarques) {
  // Séparer remarques principales (sans parent) des sous-remarques
  const principales = remarques.filter(r => !r.parent_id)
  const sousRems    = remarques.filter(r => !!r.parent_id)

  const sousRemsByParent = {}
  for (const sr of sousRems) {
    if (!sousRemsByParent[sr.parent_id]) sousRemsByParent[sr.parent_id] = []
    sousRemsByParent[sr.parent_id].push(sr)
  }

  const withSousRems = (remList) =>
    remList.sort((a, b) => a.ordre - b.ordre).map(r => ({
      ...r,
      sous_remarques: (sousRemsByParent[r.id] ?? [])
        .sort((a, b) => new Date(a.date_note || '1970') - new Date(b.date_note || '1970')),
    }))

  // Grouper par sous-section ou par section directe
  const subRemBySSId  = {}
  const dirRemBySecId = {}
  for (const r of principales) {
    if (r.sous_section_id) {
      if (!subRemBySSId[r.sous_section_id]) subRemBySSId[r.sous_section_id] = []
      subRemBySSId[r.sous_section_id].push(r)
    } else if (r.section_id) {
      if (!dirRemBySecId[r.section_id]) dirRemBySecId[r.section_id] = []
      dirRemBySecId[r.section_id].push(r)
    }
  }

  const ssMap = {}
  for (const ss of sousSections) {
    if (!ssMap[ss.section_id]) ssMap[ss.section_id] = []
    ssMap[ss.section_id].push({
      ...ss,
      remarques: withSousRems(subRemBySSId[ss.id] ?? []),
    })
  }

  return sections
    .sort((a, b) => a.ordre - b.ordre)
    .map(s => ({
      ...s,
      sousSections:    (ssMap[s.id] ?? []).sort((a, b) => a.ordre - b.ordre),
      directRemarques: withSousRems(dirRemBySecId[s.id] ?? []),
    }))
}

export function useCompteRendu(crId, affaireId) {
  const [cr, setCr]           = useState(null)
  const [sections, setSections] = useState([])
  const [presences, setPresences] = useState([])
  const [profiles, setProfiles]   = useState([])
  const [loading, setLoading]     = useState(true)

  const fetchAll = useCallback(async () => {
    if (!crId) return
    setLoading(true)
    const [
      { data: crData },
      { data: secData },
      { data: ssData },
      { data: remData },
      { data: presData },
      { data: profData },
    ] = await Promise.all([
      supabase.from('comptes_rendus').select('*, profiles:redacteur_id(id, prenom, nom)').eq('id', crId).single(),
      supabase.from('cr_sections').select('*').eq('cr_id', crId).order('ordre'),
      supabase.from('cr_sous_sections').select('*').eq('cr_id', crId).order('ordre'),
      supabase.from('cr_remarques').select('*').eq('cr_id', crId).order('ordre'),
      supabase.from('cr_presences').select(`
        *,
        affaire_interlocuteurs:interlocuteur_id(
          id, categorie, categorie_label, prenom, nom, fonction, organisation, email, telephone, ordre
        ),
        lot_entreprises:lot_entreprise_id(
          id, lot_id,
          lots:lot_id(id, numero, nom),
          entreprises:entreprise_id(id, raison_sociale),
          interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)
        )
      `).eq('cr_id', crId),
      supabase.from('profiles').select('id, prenom, nom'),
    ])

    setCr(crData)
    setSections(buildTree(secData ?? [], ssData ?? [], remData ?? []))
    setPresences(presData ?? [])
    setProfiles(profData ?? [])
    setLoading(false)
  }, [crId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Sync presences depuis les contacts de l'affaire ──────────────────────────
  const syncPresences = useCallback(async () => {
    if (!affaireId || !crId) return
    const [
      { data: interlos },
      { data: lotEnts },
      { data: existing },
    ] = await Promise.all([
      supabase.from('affaire_interlocuteurs').select('id').eq('affaire_id', affaireId),
      supabase.from('lot_entreprises').select('id').eq('affaire_id', affaireId),
      supabase.from('cr_presences').select('interlocuteur_id, lot_entreprise_id').eq('cr_id', crId),
    ])
    const existInterlo = new Set((existing ?? []).filter(p => p.interlocuteur_id).map(p => p.interlocuteur_id))
    const existLot     = new Set((existing ?? []).filter(p => p.lot_entreprise_id).map(p => p.lot_entreprise_id))
    const toInsert = [
      ...(interlos ?? []).filter(i => !existInterlo.has(i.id)).map(i => ({ cr_id: crId, interlocuteur_id: i.id, presence: 'na', convoque: false })),
      ...(lotEnts ?? []).filter(l => !existLot.has(l.id)).map(l => ({ cr_id: crId, lot_entreprise_id: l.id, presence: 'na', convoque: false })),
    ]
    if (toInsert.length > 0) await supabase.from('cr_presences').insert(toInsert)
    await fetchAll()
  }, [affaireId, crId, fetchAll])

  // ── CR metadata ──────────────────────────────────────────────────────────────
  const updateCr = useCallback(async (payload) => {
    const { error } = await supabase.from('comptes_rendus').update(payload).eq('id', crId)
    if (error) throw error
    await fetchAll()
  }, [crId, fetchAll])

  // ── Sections ─────────────────────────────────────────────────────────────────
  const addSection = useCallback(async (payload) => {
    const maxOrdre = sections.reduce((m, s) => Math.max(m, s.ordre), -1)
    const { error } = await supabase.from('cr_sections').insert({ cr_id: crId, ordre: maxOrdre + 1, ...payload })
    if (error) throw error
    await fetchAll()
  }, [crId, sections, fetchAll])

  const updateSection = useCallback(async (id, payload) => {
    const { error } = await supabase.from('cr_sections').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteSection = useCallback(async (id) => {
    const { error } = await supabase.from('cr_sections').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const reorderSectionsByIds = useCallback(async (orderedIds) => {
    await Promise.all(orderedIds.map((id, idx) => supabase.from('cr_sections').update({ ordre: idx }).eq('id', id)))
    await fetchAll()
  }, [fetchAll])

  const reorderSection = useCallback(async (id, dir) => {
    const sorted = [...sections].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(s => s.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    await Promise.all([
      supabase.from('cr_sections').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_sections').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ])
    await fetchAll()
  }, [sections, fetchAll])

  // ── Sous-sections ────────────────────────────────────────────────────────────
  const addSousSection = useCallback(async (sectionId, payload) => {
    const sec = sections.find(s => s.id === sectionId)
    const maxOrdre = (sec?.sousSections ?? []).reduce((m, ss) => Math.max(m, ss.ordre), -1)
    const { error } = await supabase.from('cr_sous_sections').insert({ cr_id: crId, section_id: sectionId, ordre: maxOrdre + 1, ...payload })
    if (error) throw error
    await fetchAll()
  }, [crId, sections, fetchAll])

  const updateSousSection = useCallback(async (id, payload) => {
    const { error } = await supabase.from('cr_sous_sections').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteSousSection = useCallback(async (id) => {
    const { error } = await supabase.from('cr_sous_sections').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const reorderSousSection = useCallback(async (sectionId, id, dir) => {
    const sec = sections.find(s => s.id === sectionId)
    if (!sec) return
    const sorted = [...sec.sousSections].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(ss => ss.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    await Promise.all([
      supabase.from('cr_sous_sections').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_sous_sections').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ])
    await fetchAll()
  }, [sections, fetchAll])

  // ── Remarques ─────────────────────────────────────────────────────────────────
  const addRemarque = useCallback(async (sousSectionId, payload) => {
    const sec = sections.find(s => s.sousSections?.some(ss => ss.id === sousSectionId))
    const ss  = sec?.sousSections?.find(ss => ss.id === sousSectionId)
    const maxOrdre = (ss?.remarques ?? []).reduce((m, r) => Math.max(m, r.ordre), -1)
    const { error } = await supabase.from('cr_remarques').insert({
      cr_id: crId, sous_section_id: sousSectionId,
      affaire_id: affaireId, ordre: maxOrdre + 1, ...payload,
    })
    if (error) throw error
    await fetchAll()
  }, [crId, affaireId, sections, fetchAll])

  // Remarque directement dans une section (sans sous-section)
  const addSectionRemarque = useCallback(async (sectionId, payload) => {
    const sec = sections.find(s => s.id === sectionId)
    const maxOrdre = (sec?.directRemarques ?? []).reduce((m, r) => Math.max(m, r.ordre), -1)
    const { error } = await supabase.from('cr_remarques').insert({
      cr_id: crId, section_id: sectionId, sous_section_id: null,
      affaire_id: affaireId, ordre: maxOrdre + 1, ...payload,
    })
    if (error) throw error
    await fetchAll()
  }, [crId, affaireId, sections, fetchAll])

  const updateRemarque = useCallback(async (id, payload) => {
    const { error } = await supabase.from('cr_remarques').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteRemarque = useCallback(async (id) => {
    const { error } = await supabase.from('cr_remarques').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const reorderRemarque = useCallback(async (sousSectionId, id, dir) => {
    let allRems = []
    for (const s of sections) {
      const ss = s.sousSections?.find(ss => ss.id === sousSectionId)
      if (ss) { allRems = [...ss.remarques]; break }
    }
    const sorted = [...allRems].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(r => r.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    await Promise.all([
      supabase.from('cr_remarques').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_remarques').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ])
    await fetchAll()
  }, [sections, fetchAll])

  const reorderSectionRemarque = useCallback(async (sectionId, id, dir) => {
    const sec = sections.find(s => s.id === sectionId)
    if (!sec) return
    const sorted = [...(sec.directRemarques ?? [])].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(r => r.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    await Promise.all([
      supabase.from('cr_remarques').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_remarques').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ])
    await fetchAll()
  }, [sections, fetchAll])

  // Sous-remarque (fil de suivi)
  const addSousRemarque = useCallback(async (parentId, payload) => {
    const { error } = await supabase.from('cr_remarques').insert({
      cr_id: crId, parent_id: parentId, affaire_id: affaireId, ...payload,
    })
    if (error) throw error
    await fetchAll()
  }, [crId, affaireId, fetchAll])

  // ── Présences ────────────────────────────────────────────────────────────────
  const setPresence = useCallback(async (presenceId, presence) => {
    const { error } = await supabase.from('cr_presences').update({ presence }).eq('id', presenceId)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const setConvoque = useCallback(async (presenceId, convoque, heure_convocation = null) => {
    const { error } = await supabase.from('cr_presences').update({ convoque, heure_convocation }).eq('id', presenceId)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  return {
    cr, sections, presences, profiles, loading,
    syncPresences, updateCr,
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque,
    setPresence, setConvoque,
    refetch: fetchAll,
  }
}
