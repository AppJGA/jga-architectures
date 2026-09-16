import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../core/supabase/client'
import { copiePresence, copieAJour } from '../../modules/chantier/comptes-rendus/crLogique'
import { avancementParLot, instantaneAvancement } from '../../modules/chantier/comptes-rendus/avancementLogique'
import {
  photosDuCr, envoyerPhoto, nettoyerFichiers, BUCKET_PHOTOS,
} from '../../modules/chantier/comptes-rendus/photosStockage'
import { pastillesDuCr, retirerPastille } from '../../modules/chantier/comptes-rendus/plansStockage'
import { creerFtmDepuis } from '../../modules/chantier/ftm/creerDepuis'
import { useLiensSignes } from '../../modules/chantier/comptes-rendus/useLiensSignes'
import { useHorsLigne } from '../../modules/chantier/comptes-rendus/horsLigne/useHorsLigne'
import { TYPES, creerOperation, appliquerOperation, etatAvecFile } from '../../modules/chantier/comptes-rendus/horsLigne/fileLogique'
import { envoyerOperation, erreurReseau } from '../../modules/chantier/comptes-rendus/horsLigne/envoi'
import { MAGASINS, ecrire as ecrireLocal } from '../../modules/chantier/comptes-rendus/horsLigne/baseLocale'
import { cheminsPhoto } from '../../modules/chantier/comptes-rendus/photosLogique'

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
  const [photos, setPhotos] = useState([])
  const [pastilles, setPastilles] = useState([])
  const [zones, setZones] = useState([])
  const [ftms, setFtms] = useState([])
  // Planning chantier : l'avancement du CR en est la lecture, jamais une saisie
  // parallèle. Le module planning peut ne pas être renseigné : liste vide.
  const [planning, setPlanning] = useState({ taches: [], lots: [], periodes: [] })
  const { liens, obtenirLiens } = useLiensSignes(BUCKET_PHOTOS)
  // Seul le premier chargement affiche l'indicateur : il remplace l'éditeur,
  // qui perdait sinon à chaque ajout ses filtres, ses sections repliées et la
  // position de défilement.
  const dejaCharge = useRef(false)

  const horsLigne = useHorsLigne(crId)
  const { enfiler: enfilerOperation } = horsLigne

  // Une modification de visite s'affiche tout de suite, puis part — ou attend
  // dans la file si le réseau manque. L'identifiant des lignes créées est
  // décidé ici : la file peut être rejouée sans rien dupliquer.
  const appliquerLocalement = useCallback((op) => {
    switch (op.type) {
      case TYPES.presenceDefinir:
        setPresences(prev => appliquerOperation({ presences: prev }, op).presences)
        break
      case TYPES.photoAjouter:
        setPhotos(prev => appliquerOperation({ photos: prev }, op).photos)
        break
      case TYPES.pastillePoser:
        setPastilles(prev => appliquerOperation({ pastilles: prev }, op).pastilles)
        break
      default:
        setSections(prev => appliquerOperation({ sections: prev }, op).sections)
    }
  }, [])

  const chargerEnLigne = useCallback(async () => {
    if (!crId) return null
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
      // Coupure réseau : l'appelant tentera la visite gardée sur l'appareil
      if (!erreurReseau(echec.error)) setErreurChargement(echec.error.message)
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
    const vide = (r) => (r.error ? [] : r.data ?? [])
    const [photosCr, pastillesCr, zonesAffaire, ftmsAffaire, taches, lotsAffaire, periodes] = await Promise.all([
      photosDuCr(crId), pastillesDuCr(crId),
      // Zones du planning (migration 047) : absentes, le choix ne s'affiche pas
      supabase.from('planning_zones').select('id, nom, couleur, ordre').eq('affaire_id', affaireId).order('ordre').then(r => (r.error ? [] : r.data ?? [])),
      // Fiches de travaux nées d'une remarque (migration 048)
      supabase.from('ftm').select('id, numero, decision, source_type, source_suivi_id').eq('affaire_id', affaireId).then(r => (r.error ? [] : r.data ?? [])),
      supabase.from('planning').select('id, lot_id, num_tache, nom, debut, duree, avancement, ordre').eq('affaire_id', affaireId).order('ordre').then(vide),
      supabase.from('lots').select('id, numero, nom, couleur').eq('affaire_id', affaireId).order('numero').then(vide),
      supabase.from('periodes_bloquees').select('date_debut, date_fin, est_bloquante').eq('affaire_id', affaireId).then(vide),
    ])
    await obtenirLiens(photosCr.map(p => p.chemin_miniature)).catch(() => {})

    setErreurChargement(null)
    setCr(crData)
    setSections(buildTree(secData ?? [], ssData ?? [], remData ?? []))
    setPresences(presData ?? [])
    setProfiles(profData ?? [])
    setPhotos(photosCr)
    setPastilles(pastillesCr)
    setZones(zonesAffaire)
    setFtms(ftmsAffaire)
    setPlanning({ taches, lots: lotsAffaire, periodes })
    dejaCharge.current = true
    setLoading(false)
    return {
      cr: crData, sections: buildTree(secData ?? [], ssData ?? [], remData ?? []),
      presences: presData ?? [], profiles: profData ?? [], photos: photosCr, pastilles: pastillesCr,
      zones: zonesAffaire, ftms: ftmsAffaire, planning: { taches, lots: lotsAffaire, periodes },
    }
  }, [crId, affaireId, obtenirLiens])

  // Ce que l'écran montre quand la visite s'ouvre sans réseau : l'instantané
  // emporté, rejoué avec les modifications encore en file.
  const chargerHorsLigne = useCallback(async () => {
    const emporte = await horsLigne.instantane()
    if (!emporte) return false
    const ops = await horsLigne.relireFile()
    const etat = etatAvecFile(emporte, ops)
    setCr(etat.cr)
    setSections(etat.sections ?? [])
    setPresences(etat.presences ?? [])
    setProfiles(etat.profiles ?? [])
    setPhotos(etat.photos ?? [])
    setPastilles(etat.pastilles ?? [])
    setZones(etat.zones ?? [])
    setFtms(etat.ftms ?? [])
    setPlanning(etat.planning ?? { taches: [], lots: [], periodes: [] })
    setErreurChargement(null)
    dejaCharge.current = true
    setLoading(false)
    return true
  }, [horsLigne])

  // Les données fraîches deviennent l'instantané de la prochaine visite, et
  // les modifications encore en file restent visibles par-dessus.
  const fetchAll = useCallback(async () => {
    if (!crId) return
    try {
      const charge = await chargerEnLigne()
      if (!charge) return
      const ops = await horsLigne.relireFile()
      await horsLigne.preparer(charge).catch(() => {})
      if (ops.length > 0) {
        const etat = etatAvecFile(charge, ops)
        setSections(etat.sections)
        setPresences(etat.presences)
        setPhotos(etat.photos)
        setPastilles(etat.pastilles)
      }
    } catch (err) {
      if (!erreurReseau(err)) throw err
      const repris = await chargerHorsLigne()
      if (!repris) throw err
    }
  }, [crId, chargerEnLigne, chargerHorsLigne, horsLigne])

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
  // L'avancement des lots est recopié dans le CR au moment de l'émission : le
  // planning continuera d'avancer, le compte rendu doit garder les chiffres du
  // jour de la visite (migration 049).
  const emettre = useCallback(async (dateEmission = new Date().toISOString()) => {
    await syncPresences()
    const lignes = avancementParLot(planning.taches, planning.lots, {
      date: cr?.date_reunion, periodes: planning.periodes,
    })
    const avancement = lignes.length > 0 ? instantaneAvancement(lignes) : null
    let { error } = await supabase.from('comptes_rendus')
      .update({ statut: 'emis', date_emission: dateEmission, avancement_lots: avancement }).eq('id', crId)
    if (colonneAbsente(error)) {
      ({ error } = await supabase.from('comptes_rendus').update({ statut: 'emis', date_emission: dateEmission }).eq('id', crId))
    }
    if (colonneAbsente(error)) {
      ({ error } = await supabase.from('comptes_rendus').update({ statut: 'emis' }).eq('id', crId))
    }
    if (error) throw error
    await fetchAll()
  }, [crId, syncPresences, fetchAll, planning, cr?.date_reunion])

  // Pointage d'une tâche depuis le compte rendu : c'est bien le planning qui
  // est écrit, il n'y a pas de second avancement.
  const modifierAvancementTache = useCallback(async (tacheId, valeur) => {
    const pourcent = Math.max(0, Math.min(100, Math.round(Number(valeur) || 0)))
    const { error } = await supabase.from('planning').update({ avancement: pourcent }).eq('id', tacheId)
    if (error) throw error
    setPlanning(p => ({ ...p, taches: p.taches.map(t => (t.id === tacheId ? { ...t, avancement: pourcent } : t)) }))
  }, [])

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
  /**
   * Écriture de visite : appliquée à l'écran, puis envoyée — ou rangée dans la
   * file si le réseau manque. Une erreur de la base remonte à l'appelant après
   * avoir remis l'écran d'aplomb.
   */
  const executerOperation = useCallback(async (type, charge) => {
    const op = creerOperation(type, charge, { crId })
    appliquerLocalement(op)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enfilerOperation(op)
      return op
    }
    try {
      await envoyerOperation(op)
      await fetchAll()
    } catch (err) {
      if (erreurReseau(err)) {
        await enfilerOperation(op)
        return op
      }
      await fetchAll().catch(() => {})
      throw err
    }
    return op
  }, [crId, appliquerLocalement, enfilerOperation, fetchAll])

  const addSection = useCallback(async (payload) => {
    const maxOrdre = sections.reduce((m, s) => Math.max(m, s.ordre), -1)
    const section = { id: crypto.randomUUID(), ordre: maxOrdre + 1, ...payload }
    await executerOperation(TYPES.sectionCreer, { section })
    return section.id
  }, [sections, executerOperation])

  const updateSection = useCallback(async (id, payload) => {
    const { error } = await supabase.from('cr_sections').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  // Supprimer une remarque, une sous-section ou une section emporte ses photos
  // en cascade : leurs fichiers sont ensuite effacés s'ils ne servent plus.
  const photosDesRemarques = useCallback((ids) => {
    const cibles = new Set(ids)
    return photos.filter(p => cibles.has(p.remarque_id))
  }, [photos])

  const deleteSection = useCallback(async (id) => {
    const sec = sections.find(s => s.id === id)
    const ids = [
      ...(sec?.directRemarques ?? []),
      ...(sec?.sousSections ?? []).flatMap(ss => ss.remarques ?? []),
    ].map(r => r.id)
    const emportees = photosDesRemarques(ids)
    const { error } = await supabase.from('cr_sections').delete().eq('id', id)
    if (error) throw error
    await nettoyerFichiers(emportees)
    await fetchAll()
  }, [sections, photosDesRemarques, fetchAll])

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
    const ss = sections.flatMap(s => s.sousSections ?? []).find(x => x.id === id)
    const emportees = photosDesRemarques((ss?.remarques ?? []).map(r => r.id))
    const { error } = await supabase.from('cr_sous_sections').delete().eq('id', id)
    if (error) throw error
    await nettoyerFichiers(emportees)
    await fetchAll()
  }, [sections, photosDesRemarques, fetchAll])

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
    const { section_id: sectionDuPayload, ...champs } = payload
    const id = crypto.randomUUID()
    await executerOperation(TYPES.remarqueCreer, {
      id, affaireId, sectionId: sectionDuPayload ?? sec?.id ?? null, sousSectionId,
      ordre: maxOrdre + 1, champs,
    })
    return id
  }, [affaireId, sections, executerOperation])

  // Remarque directement dans une section (sans sous-section)
  const addSectionRemarque = useCallback(async (sectionId, payload) => {
    const sec = sections.find(s => s.id === sectionId)
    const maxOrdre = (sec?.directRemarques ?? []).reduce((m, r) => Math.max(m, r.ordre), -1)
    const id = crypto.randomUUID()
    await executerOperation(TYPES.remarqueCreer, {
      id, affaireId, sectionId, sousSectionId: null, ordre: maxOrdre + 1, champs: payload,
    })
    return id
  }, [affaireId, sections, executerOperation])

  const updateRemarque = useCallback(async (id, payload) => {
    await executerOperation(TYPES.remarqueModifier, { id, champs: payload })
  }, [executerOperation])

  // Statut de plusieurs remarques d'un coup (mode sélection de l'éditeur)
  const changerStatutRemarques = useCallback(async (ids, statut, clos) => {
    if (ids.length === 0) return
    const { error } = await supabase.from('cr_remarques').update({ statut, est_clos: clos }).in('id', ids)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteRemarque = useCallback(async (id) => {
    const emportees = photosDesRemarques([id])
    const { error } = await supabase.from('cr_remarques').delete().eq('id', id)
    if (error) throw error
    await nettoyerFichiers(emportees)
    await fetchAll()
  }, [photosDesRemarques, fetchAll])

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
    await executerOperation(TYPES.suiviCreer, {
      id: crypto.randomUUID(), parentId, affaireId, champs: payload,
    })
  }, [affaireId, executerOperation])

  // ── Présences ────────────────────────────────────────────────────────────────
  const setPresence = useCallback(async (presenceId, presence) => {
    await executerOperation(TYPES.presenceDefinir, { presenceId, presence })
  }, [executerOperation])

  // Convocation et heure, modifiées sans recharger l'écran
  const updatePresence = useCallback(async (presenceId, changes) => {
    setPresences((prev) => prev.map((p) => (p.id === presenceId ? { ...p, ...changes } : p)))
    const { error } = await supabase.from('cr_presences').update(changes).eq('id', presenceId)
    if (error) {
      await fetchAll()
      throw error
    }
  }, [fetchAll])

  // ── Photos ───────────────────────────────────────────────────────────────────
  // Compressées avant d'arriver ici (compressionPhoto.js)
  /**
   * Une photo passe toujours par la mémoire de l'appareil avant de partir :
   * hors ligne elle y attend, en ligne elle en repart aussitôt. Un même chemin
   * de fichier sert des deux côtés, l'envoi peut donc être rejoué.
   */
  const ajouterPhotos = useCallback(async (remarqueId, compressions) => {
    const dejaLa = photos.filter(p => p.remarque_id === remarqueId)
    let ordre = dejaLa.reduce((m, p) => Math.max(m, p.ordre ?? 0), -1) + 1
    for (const compression of compressions) {
      const id = crypto.randomUUID()
      const chemins = cheminsPhoto(affaireId, id, compression.extension)
      const photo = {
        id, ...chemins,
        largeur: compression.photo.largeur, hauteur: compression.photo.hauteur,
        poids_octets: compression.photo.blob.size + compression.miniature.blob.size,
      }
      await ecrireLocal(MAGASINS.fichiers, { id, photo: compression.photo.blob, miniature: compression.miniature.blob })
      // La miniature est aussi rangée sous son chemin : l'écran l'affiche
      // depuis l'appareil tant que le fichier n'est pas parti.
      await ecrireLocal(MAGASINS.fichiers, { id: chemins.chemin_miniature, image: compression.miniature.blob, octets: compression.miniature.blob.size })
      await executerOperation(TYPES.photoAjouter, {
        affaireId, remarqueId, ordre: ordre++, cleFichier: id, photo,
      })
    }
  }, [photos, affaireId, executerOperation])

  // Photo annotée : nouveau fichier, l'ancien reste pour les visites qui le
  // montrent encore (compte rendu émis, par exemple)
  const remplacerPhoto = useCallback(async (photo, compression) => {
    const fichier = await envoyerPhoto(affaireId, compression)
    const { error } = await supabase.from('cr_photos').update({
      chemin: fichier.chemin, chemin_miniature: fichier.chemin_miniature,
      largeur: fichier.largeur, hauteur: fichier.hauteur, poids_octets: fichier.poids_octets,
    }).eq('id', photo.id)
    if (error) {
      await nettoyerFichiers([fichier])
      throw error
    }
    await nettoyerFichiers([photo])
    await fetchAll()
  }, [affaireId, fetchAll])

  const modifierLegendePhoto = useCallback(async (photoId, legende) => {
    const { error } = await supabase.from('cr_photos').update({ legende: legende || null }).eq('id', photoId)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const supprimerPhoto = useCallback(async (photo) => {
    const { error } = await supabase.from('cr_photos').delete().eq('id', photo.id)
    if (error) throw error
    await nettoyerFichiers([photo])
    await fetchAll()
  }, [fetchAll])

  // ── Pastilles sur plan ───────────────────────────────────────────────────────
  // Une par remarque : la poser à nouveau la déplace
  const placerPastille = useCallback(async (remarqueId, { planId, versionId, x, y }) => {
    await executerOperation(TYPES.pastillePoser, {
      id: crypto.randomUUID(), affaireId, remarqueId, planId, versionId, x, y,
    })
  }, [affaireId, executerOperation])

  const enleverPastille = useCallback(async (remarqueId) => {
    await retirerPastille(remarqueId)
    await fetchAll()
  }, [fetchAll])

  // Fiche de travaux modificatifs créée depuis une remarque
  const creerFtmPourRemarque = useCallback(async (remarque) => {
    const fiche = await creerFtmDepuis({ affaireId, type: 'remarque', element: remarque, contexte: cr })
    await fetchAll()
    return fiche
  }, [affaireId, cr, fetchAll])

  // Lien de la photo entière (visionneuse, PDF)
  const liensPhotos = useCallback((chemins) => obtenirLiens(chemins), [obtenirLiens])

  return {
    photos, liens, ajouterPhotos, remplacerPhoto, modifierLegendePhoto, supprimerPhoto, liensPhotos,
    pastilles, placerPastille, enleverPastille, zones, ftms, creerFtmPourRemarque,
    planning, modifierAvancementTache, horsLigne,
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
