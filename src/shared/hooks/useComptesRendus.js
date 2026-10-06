import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../../core/supabase/client'
import { dateDuJour, compterPointsEnCours, preparerReprise } from '../../modules/chantier/comptes-rendus/crLogique'
import { photosDuCr, nettoyerFichiers } from '../../modules/chantier/comptes-rendus/photosStockage'
import { pastillesDuCr, plansDeLAffaire } from '../../modules/chantier/comptes-rendus/plansStockage'
import { versionCourante } from '../../modules/chantier/comptes-rendus/plansLogique'
import { erreurReseau } from '../../modules/chantier/comptes-rendus/horsLigne/envoi'
import { creationHorsLigne, numeroHorsLigne } from '../../modules/chantier/comptes-rendus/horsLigne/creationLogique'
import { visitesEnAttente, etatVisiteEmportee, garderVisiteCreee, EVENEMENT_FILE } from '../../modules/chantier/comptes-rendus/horsLigne/synchro'

// Insère des lignes et fait remonter l'échec : Supabase ne lève pas d'exception
async function inserer(table, lignes) {
  if (lignes.length === 0) return
  const { error } = await supabase.from(table).insert(lignes)
  if (error) throw error
}

export function useComptesRendus(affaireId) {
  const [comptesRendus, setComptesRendus] = useState([])
  const [loading, setLoading] = useState(true)
  // L'indicateur de chargement ne s'affiche qu'au premier chargement : ensuite
  // la liste reste visible pendant qu'elle se met à jour.
  const dejaCharge = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!affaireId) return
    if (!dejaCharge.current) setLoading(true)
    // Les remarques non closes sont comptées par CR en une seule requête, plutôt
    // qu'un compte par ligne : la liste affiche « points en cours » sur chaque CR.
    const [{ data, error }, { data: remarques }] = await Promise.all([
      supabase
        .from('comptes_rendus')
        .select('*, profiles:redacteur_id(prenom, nom)')
        .eq('affaire_id', affaireId)
        .order('numero', { ascending: false }),
      supabase
        .from('cr_remarques')
        .select('cr_id, statut, est_clos, parent_id')
        .eq('affaire_id', affaireId)
        .eq('est_clos', false),
    ])
    if (error) throw error

    const parCr = new Map()
    for (const r of remarques ?? []) {
      const liste = parCr.get(r.cr_id) ?? []
      liste.push(r)
      parCr.set(r.cr_id, liste)
    }

    setComptesRendus((data ?? []).map(cr => ({ ...cr, pointsEnCours: compterPointsEnCours(parCr.get(cr.id)) })))
    dejaCharge.current = true
    setLoading(false)
  }, [affaireId])

  useEffect(() => {
    dejaCharge.current = false
    fetchAll().catch((err) => { if (!erreurReseau(err)) console.error(err); setLoading(false) })
  }, [fetchAll])

  // Visites démarrées sans réseau, pas encore envoyées : elles figurent dans
  // la liste (sinon « Démarrer » en créerait une seconde)
  const [enAttente, setEnAttente] = useState([])
  useEffect(() => {
    if (!affaireId) return undefined
    let abandon = false
    const relire = () => visitesEnAttente(affaireId).then((v) => { if (!abandon) setEnAttente(v) }).catch(() => {})
    relire()
    window.addEventListener(EVENEMENT_FILE, relire)
    return () => { abandon = true; window.removeEventListener(EVENEMENT_FILE, relire) }
  }, [affaireId])
  // Une visite envoyée entre-temps : la liste se relit (numéro définitif)
  const nbEnAttente = enAttente.length
  const precedentEnAttente = useRef(nbEnAttente)
  useEffect(() => {
    if (nbEnAttente < precedentEnAttente.current && navigator.onLine !== false) fetchAll().catch(() => {})
    precedentEnAttente.current = nbEnAttente
  }, [nbEnAttente, fetchAll])
  const liste = useMemo(() => {
    const connus = new Set(comptesRendus.map((c) => c.id))
    return [...comptesRendus, ...enAttente.filter((c) => !connus.has(c.id))].sort((a, b) => b.numero - a.numero)
  }, [comptesRendus, enAttente])

  // Sans réseau : la visite est créée sur l'appareil, en reprenant la
  // précédente emportée (creationLogique.js), et partira avec la file
  const creerHorsLigne = useCallback(async () => {
    const derniere = liste[0] ?? null
    const precedente = derniere ? await etatVisiteEmportee(derniere.id) : null
    if (derniere && !precedente) {
      throw new Error(`Sans réseau, la nouvelle visite reprend la visite n°${String(derniere.numero).padStart(2, '0')}, qui n’est pas gardée sur cet appareil. Avant de partir, utilisez « Préparer pour le chantier » sur la page de l’affaire.`)
    }
    const creation = creationHorsLigne({
      affaireId, precedente, numero: numeroHorsLigne(liste), date: dateDuJour(), nouvelId: () => crypto.randomUUID(),
    })
    await garderVisiteCreee(creation)
    return { ...creation.cr, horsLigne: true }
  }, [affaireId, liste])

  const nextNumero = useCallback(async () => {
    const { data, error } = await supabase
      .from('comptes_rendus')
      .select('numero')
      .eq('affaire_id', affaireId)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return (data?.numero ?? 0) + 1
  }, [affaireId])

  const createCR = useCallback(async (payload = {}) => {
    if (navigator.onLine === false) return creerHorsLigne()
    // Deux personnes créant une visite au même moment calculent le même numéro :
    // la contrainte d'unicité refuse la seconde, qui réessaie avec le suivant.
    let cr = null
    for (let essai = 0; essai < 3 && !cr; essai++) {
      let numero
      try { numero = await nextNumero() } catch (err) {
        // Réseau trop faible pour répondre : comme sans réseau
        if (erreurReseau(err)) return creerHorsLigne()
        throw err
      }
      const { data, error } = await supabase
        .from('comptes_rendus')
        .insert({ affaire_id: affaireId, numero, date_reunion: dateDuJour(), statut: 'brouillon', ...payload })
        .select()
        .single()
      if (error && erreurReseau(error)) return creerHorsLigne()
      if (error && error.code !== '23505') throw error
      cr = data
    }
    if (!cr) throw new Error('Impossible d’attribuer un numéro à la visite, réessayez.')

    // Reprise de la visite précédente
    const { data: prevCR, error: errPrev } = await supabase
      .from('comptes_rendus')
      .select('id')
      .eq('affaire_id', affaireId)
      .neq('id', cr.id)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (errPrev) throw errPrev

    if (prevCR) {
      try {
        const [
          { data: sections, error: e1 },
          { data: sousSections, error: e2 },
          { data: remarques, error: e3 },
        ] = await Promise.all([
          supabase.from('cr_sections').select('*').eq('cr_id', prevCR.id).order('ordre'),
          supabase.from('cr_sous_sections').select('*').eq('cr_id', prevCR.id).order('ordre'),
          supabase.from('cr_remarques').select('*').eq('cr_id', prevCR.id),
        ])
        const erreurLecture = e1 ?? e2 ?? e3
        if (erreurLecture) throw erreurLecture
        const [photos, pastilles, plans] = await Promise.all([
          photosDuCr(prevCR.id), pastillesDuCr(prevCR.id), plansDeLAffaire(affaireId),
        ])
        // Les pastilles reprises passent sur la dernière version de leur plan
        const versionsCourantes = new Map((plans?.plans ?? []).map(p => [p.id, versionCourante(plans.versions, p.id)?.id]))

        const reprise = preparerReprise({
          sections: sections ?? [], sousSections: sousSections ?? [], remarques: remarques ?? [], photos, pastilles, versionsCourantes,
          crId: cr.id, affaireId, nouvelId: () => crypto.randomUUID(),
        })
        // Chaque niveau après celui qu'il référence
        await inserer('cr_sections', reprise.sections)
        await inserer('cr_sous_sections', reprise.sousSections)
        await inserer('cr_remarques', reprise.remarques)
        await inserer('cr_remarques', reprise.sousRemarques)
        await inserer('cr_photos', reprise.photos)
        await inserer('cr_pastilles', reprise.pastilles)
      } catch (err) {
        // Une visite à moitié reprise serait trompeuse : on la retire entière
        // (les lignes déjà insérées partent en cascade) et on prévient.
        await supabase.from('comptes_rendus').delete().eq('id', cr.id)
        await fetchAll()
        throw new Error(`La reprise de la visite précédente a échoué : ${err.message}`, { cause: err })
      }
    }

    await fetchAll()
    return cr
  }, [affaireId, nextNumero, fetchAll, creerHorsLigne])

  const updateCR = useCallback(async (id, payload) => {
    const { error } = await supabase.from('comptes_rendus').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteCR = useCallback(async (id) => {
    const photos = await photosDuCr(id)
    const { error } = await supabase.from('comptes_rendus').delete().eq('id', id)
    if (error) throw error
    await nettoyerFichiers(photos)
    await fetchAll()
  }, [fetchAll])

  return { comptesRendus: liste, loading, createCR, updateCR, deleteCR, refetch: fetchAll }
}
