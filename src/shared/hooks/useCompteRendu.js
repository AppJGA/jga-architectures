import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../core/supabase/client'
import { copiePresence, copieAJour } from '../../modules/chantier/comptes-rendus/crLogique'

// Jointures d'une présence : la fiche liée sert à tenir sa copie à jour
const SELECT_PRESENCES = `
  *,
  affaire_interlocuteurs:interlocuteur_id(
    id, categorie, categorie_label, prenom, nom, fonction, organisation, adresse, email, telephone, ordre
  ),
  lot_entreprises:lot_entreprise_id(
    id, lot_id,
    lots:lot_id(id, numero, nom),
    entreprises:entreprise_id(id, raison_sociale, email, telephone),
    interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)
  )
`

// Plusieurs écritures lancées ensemble : la première erreur est levée
function verifierTout(resultats) {
  const echec = resultats.find((r) => r.error)
  if (echec) throw echec.error
}

// Colonne inconnue : la migration 037 n'est pas encore passée sur la base.
// Les copies et la date d'émission sont alors ignorées plutôt que de bloquer
// la saisie.
function colonneAbsente(error) {
  return error?.code === 'PGRST204' || error?.code === '42703'
}

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
  const [erreurChargement, setErreurChargement] = useState(null)
  // Versions des remarques dans les autres visites de l'affaire, pour leur
  // historique. Chargées une fois : elles ne changent pas pendant la saisie.
  const [historique, setHistorique] = useState({ remarques: [], crs: [] })
  // Seul le premier chargement affiche l'indicateur : il remplace l'éditeur,
  // qui perdait sinon à chaque ajout ses filtres, ses sections repliées et la
  // position de défilement.
  const dejaCharge = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!crId) return
    if (!dejaCharge.current) setLoading(true)
    const resultats = await Promise.all([
      supabase.from('comptes_rendus').select('*, profiles:redacteur_id(id, prenom, nom)').eq('id', crId).single(),
      supabase.from('cr_sections').select('*').eq('cr_id', crId).order('ordre'),
      supabase.from('cr_sous_sections').select('*').eq('cr_id', crId).order('ordre'),
      supabase.from('cr_remarques').select('*').eq('cr_id', crId).order('ordre'),
      supabase.from('cr_presences').select(SELECT_PRESENCES).eq('cr_id', crId),
      supabase.from('profiles').select('id, prenom, nom'),
    ])
    const echec = resultats.find((r) => r.error)
    if (echec) {
      setErreurChargement(echec.error.message)
      setLoading(false)
      throw echec.error
    }
    const [
      { data: crData },
      { data: secData },
      { data: ssData },
      { data: remData },
      { data: presData },
      { data: profData },
    ] = resultats

    setErreurChargement(null)
    setCr(crData)
    setSections(buildTree(secData ?? [], ssData ?? [], remData ?? []))
    setPresences(presData ?? [])
    setProfiles(profData ?? [])
    dejaCharge.current = true
    setLoading(false)
  }, [crId])

  useEffect(() => {
    dejaCharge.current = false
    fetchAll().catch((err) => console.error(err))
  }, [fetchAll])

  useEffect(() => {
    if (!affaireId || !crId) return
    let abandon = false
    Promise.all([
      supabase.from('comptes_rendus').select('id, numero, date_reunion').eq('affaire_id', affaireId),
      supabase.from('cr_remarques')
        .select('id, cr_id, parent_id, suivi_id, numero, statut, est_clos, description')
        .eq('affaire_id', affaireId).is('parent_id', null).neq('cr_id', crId),
    ]).then(([crs, remarques]) => {
      if (abandon) return
      const erreur = crs.error ?? remarques.error
      // Sans la migration 038, pas de suivi_id : pas d'historique, sans bruit
      if (erreur) { if (!colonneAbsente(erreur)) console.error(erreur); return }
      setHistorique({ remarques: remarques.data ?? [], crs: crs.data ?? [] })
    })
    return () => { abandon = true }
  }, [affaireId, crId])

  // ── Présences : participants de l'affaire et copies à jour ───────────────────
  //
  // Ajoute les interlocuteurs et entreprises arrivés depuis, et met à jour la
  // copie des participants (colonnes `copie_*`). Rien n'est fait sur un compte
  // rendu émis : sa feuille de présence est figée, et la base le refuserait.
  const syncPresences = useCallback(async () => {
    if (!affaireId || !crId) return
    const [
      { data: crStatut, error: e0 },
      { data: interlos, error: e1 },
      { data: lotEnts, error: e2 },
      { data: existing, error: e3 },
    ] = await Promise.all([
      supabase.from('comptes_rendus').select('statut').eq('id', crId).single(),
      supabase.from('affaire_interlocuteurs').select('id').eq('affaire_id', affaireId),
      supabase.from('lot_entreprises').select('id').eq('affaire_id', affaireId),
      supabase.from('cr_presences').select(SELECT_PRESENCES).eq('cr_id', crId),
    ])
    const erreur = e0 ?? e1 ?? e2 ?? e3
    if (erreur) throw erreur
    if (crStatut?.statut === 'emis') return

    const existInterlo = new Set((existing ?? []).filter(p => p.interlocuteur_id).map(p => p.interlocuteur_id))
    const existLot     = new Set((existing ?? []).filter(p => p.lot_entreprise_id).map(p => p.lot_entreprise_id))
    const toInsert = [
      ...(interlos ?? []).filter(i => !existInterlo.has(i.id)).map(i => ({ cr_id: crId, interlocuteur_id: i.id, presence: 'na', convoque: false })),
      ...(lotEnts ?? []).filter(l => !existLot.has(l.id)).map(l => ({ cr_id: crId, lot_entreprise_id: l.id, presence: 'na', convoque: false })),
    ]
    if (toInsert.length > 0) {
      const { error } = await supabase.from('cr_presences').insert(toInsert)
      if (error) throw error
    }

    // Copies : lignes ajoutées à l'instant et fiches modifiées depuis
    const { data: aCopier, error: e4 } = toInsert.length > 0
      ? await supabase.from('cr_presences').select(SELECT_PRESENCES).eq('cr_id', crId)
      : { data: existing, error: null }
    if (e4) throw e4
    const mises = (aCopier ?? []).filter((p) => !copieAJour(p))
    const resultats = await Promise.all(mises.map((p) =>
      supabase.from('cr_presences').update(copiePresence(p)).eq('id', p.id)))
    const echec = resultats.find((r) => r.error && !colonneAbsente(r.error))
    if (echec) throw echec.error

    await fetchAll()
  }, [affaireId, crId, fetchAll])

  // ── Émission ─────────────────────────────────────────────────────────────────
  // Émis, le compte rendu est verrouillé (en base aussi, migration 037). La
  // feuille de présence est d'abord mise à jour une dernière fois.
  const emettre = useCallback(async () => {
    await syncPresences()
    let { error } = await supabase.from('comptes_rendus')
      .update({ statut: 'emis', date_emission: new Date().toISOString() }).eq('id', crId)
    if (colonneAbsente(error)) {
      ({ error } = await supabase.from('comptes_rendus').update({ statut: 'emis' }).eq('id', crId))
    }
    if (error) throw error
    await fetchAll()
  }, [crId, syncPresences, fetchAll])

  const rouvrir = useCallback(async () => {
    let { error } = await supabase.from('comptes_rendus')
      .update({ statut: 'brouillon', date_emission: null }).eq('id', crId)
    if (colonneAbsente(error)) {
      ({ error } = await supabase.from('comptes_rendus').update({ statut: 'brouillon' }).eq('id', crId))
    }
    if (error) throw error
    await fetchAll()
  }, [crId, fetchAll])

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
    verifierTout(await Promise.all(orderedIds.map((id, idx) => supabase.from('cr_sections').update({ ordre: idx }).eq('id', id))))
    await fetchAll()
  }, [fetchAll])

  const reorderSection = useCallback(async (id, dir) => {
    const sorted = [...sections].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(s => s.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    verifierTout(await Promise.all([
      supabase.from('cr_sections').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_sections').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ]))
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
    verifierTout(await Promise.all([
      supabase.from('cr_sous_sections').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_sous_sections').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ]))
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

  // Statut de plusieurs remarques d'un coup (mode sélection de l'éditeur)
  const changerStatutRemarques = useCallback(async (ids, statut, clos) => {
    if (ids.length === 0) return
    const { error } = await supabase.from('cr_remarques').update({ statut, est_clos: clos }).in('id', ids)
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
    verifierTout(await Promise.all([
      supabase.from('cr_remarques').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_remarques').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ]))
    await fetchAll()
  }, [sections, fetchAll])

  const reorderSectionRemarque = useCallback(async (sectionId, id, dir) => {
    const sec = sections.find(s => s.id === sectionId)
    if (!sec) return
    const sorted = [...(sec.directRemarques ?? [])].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(r => r.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    verifierTout(await Promise.all([
      supabase.from('cr_remarques').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_remarques').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ]))
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
    setPresences((prev) => prev.map((p) => (p.id === presenceId ? { ...p, presence } : p)))
    const { error } = await supabase.from('cr_presences').update({ presence }).eq('id', presenceId)
    if (error) {
      await fetchAll()
      throw error
    }
  }, [fetchAll])

  // Convocation et heure, modifiées sans recharger l'écran
  const updatePresence = useCallback(async (presenceId, changes) => {
    setPresences((prev) => prev.map((p) => (p.id === presenceId ? { ...p, ...changes } : p)))
    const { error } = await supabase.from('cr_presences').update(changes).eq('id', presenceId)
    if (error) {
      await fetchAll()
      throw error
    }
  }, [fetchAll])

  return {
    cr, sections, presences, profiles, loading, erreurChargement, historique,
    syncPresences, updateCr, emettre, rouvrir, updatePresence,
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque, changerStatutRemarques,
    setPresence,
    refetch: fetchAll,
  }
}
