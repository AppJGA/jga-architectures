import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../core/supabase/client'
import { dateDuJour, compterPointsEnCours, preparerReprise } from '../../modules/chantier/comptes-rendus/crLogique'

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
    fetchAll().catch((err) => { console.error(err); setLoading(false) })
  }, [fetchAll])

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
    // Deux personnes créant une visite au même moment calculent le même numéro :
    // la contrainte d'unicité refuse la seconde, qui réessaie avec le suivant.
    let cr = null
    for (let essai = 0; essai < 3 && !cr; essai++) {
      const numero = await nextNumero()
      const { data, error } = await supabase
        .from('comptes_rendus')
        .insert({ affaire_id: affaireId, numero, date_reunion: dateDuJour(), statut: 'brouillon', ...payload })
        .select()
        .single()
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

        const reprise = preparerReprise({
          sections: sections ?? [], sousSections: sousSections ?? [], remarques: remarques ?? [],
          crId: cr.id, affaireId, nouvelId: () => crypto.randomUUID(),
        })
        // Chaque niveau après celui qu'il référence
        await inserer('cr_sections', reprise.sections)
        await inserer('cr_sous_sections', reprise.sousSections)
        await inserer('cr_remarques', reprise.remarques)
        await inserer('cr_remarques', reprise.sousRemarques)
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
