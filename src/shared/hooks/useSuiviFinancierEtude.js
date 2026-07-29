import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

// Rang par défaut des cinq phases de référence, quand `ordre` n'a jamais été
// renseigné (lignes créées avant la migration 036).
const PHASE_ORDER = { esq: 0, avp: 1, pro: 2, dce: 3, chantier: 4 }

const rangDe = (e) => e.ordre ?? PHASE_ORDER[e.phase] ?? 99

export function useSuiviFinancierEtude(affaireId, affaire) {
  const [suiviParPhase, setSuiviParPhase] = useState([])
  const [estimationsLots, setEstimationsLots] = useState([])
  const [lotsExistants, setLotsExistants] = useState([])
  const [marchesLots, setMarchesLots] = useState([])
  const [loading, setLoading] = useState(true)

  const enveloppeInitiale = affaire?.enveloppe_ttc ?? null

  const fetchAll = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)

    const [
      { data: suiviData },
      { data: estData },
      { data: lotsData },
      { data: marchesData },
    ] = await Promise.all([
      supabase
        .from('suivi_financier_etude')
        .select('*')
        .eq('affaire_id', affaireId),
      supabase
        .from('estimations_lots')
        .select('*, lots(id, numero, nom)')
        .eq('affaire_id', affaireId)
        .order('numero_lot', { ascending: true }),
      supabase
        .from('lots')
        .select('id, numero, nom')
        .eq('affaire_id', affaireId)
        .order('numero', { ascending: true }),
      supabase
        .from('lot_entreprises')
        .select('lot_id, montant_marche_ht, montant_marche_ttc')
        .eq('affaire_id', affaireId),
    ])

    setSuiviParPhase((suiviData ?? []).sort((a, b) => rangDe(a) - rangDe(b)))
    setEstimationsLots(estData ?? [])
    setLotsExistants(lotsData ?? [])
    setMarchesLots(marchesData ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const upsertPhase = useCallback(async (payload) => {
    const { error } = await supabase
      .from('suivi_financier_etude')
      .upsert({ affaire_id: affaireId, ...payload }, { onConflict: 'affaire_id,phase' })
    if (error) throw error
    await fetchAll()
  }, [affaireId, fetchAll])

  const deletePhase = useCallback(async (phase) => {
    const { error } = await supabase
      .from('suivi_financier_etude')
      .delete()
      .eq('affaire_id', affaireId)
      .eq('phase', phase)
    if (error) throw error
    await fetchAll()
  }, [affaireId, fetchAll])

  // Nom libre d'une phase. Une phase encore vide n'a pas de ligne en base : le
  // renommage la crée, avec le seul `nom_custom` — `estRenseignee` continue de
  // la considérer comme non renseignée.
  const renommerPhase = useCallback(async (code, nom, ordre = null) => {
    const { error } = await supabase
      .from('suivi_financier_etude')
      .upsert(
        { affaire_id: affaireId, phase: code, nom_custom: nom || null, ...(ordre != null ? { ordre } : {}) },
        { onConflict: 'affaire_id,phase' }
      )
    if (error) throw error
    await fetchAll()
  }, [affaireId, fetchAll])

  const ajouterPhase = useCallback(async (code, nom, ordre) => {
    const { error } = await supabase
      .from('suivi_financier_etude')
      .insert({ affaire_id: affaireId, phase: code, nom_custom: nom, ordre })
    if (error) throw error
    await fetchAll()
  }, [affaireId, fetchAll])

  // Une seule écriture par phase, puis un seul rechargement — un upsert par
  // ligne suivi de son propre fetch multiplierait les allers-retours.
  const reordonnerPhases = useCallback(async (codesOrdonnes) => {
    const { error } = await supabase
      .from('suivi_financier_etude')
      .upsert(
        codesOrdonnes.map((code, i) => ({ affaire_id: affaireId, phase: code, ordre: i })),
        { onConflict: 'affaire_id,phase' }
      )
    if (error) throw error
    await fetchAll()
  }, [affaireId, fetchAll])

  const upsertEstimation = useCallback(async (payload) => {
    if (payload.id) {
      const { id, ...rest } = payload
      const { error } = await supabase
        .from('estimations_lots')
        .update(rest)
        .eq('id', id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('estimations_lots')
        .insert({ affaire_id: affaireId, ...payload })
      if (error) throw error
    }
    await fetchAll()
  }, [affaireId, fetchAll])

  const deleteEstimation = useCallback(async (id) => {
    const { error } = await supabase.from('estimations_lots').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  return {
    enveloppeInitiale,
    suiviParPhase, estimationsLots, lotsExistants, marchesLots, loading,
    upsertPhase, deletePhase, upsertEstimation, deleteEstimation,
    renommerPhase, ajouterPhase, reordonnerPhases,
    refetch: fetchAll,
  }
}
