import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

const AFFAIRE_FIELDS = [
  'code_affaire', 'nom', 'phase', 'avancement',
  'moa_nom', 'moa_adresse', 'moa_telephone', 'moa_email',
  'projet_adresse', 'projet_commune', 'projet_code_postal',
  'cadastre_section', 'cadastre_parcelle', 'cadastre_superficie', 'terrain_statut',
  'viab_voirie', 'viab_electricite', 'viab_gaz',
  'viab_assainissement', 'viab_eaux_pluviales', 'viab_courants_faibles',
  'doc_cadastre', 'doc_geometre', 'doc_etude_sol', 'doc_servitudes',
  'enveloppe_ttc', 'montant_travaux_ttc', 'honoraires_ttc',
  'surface_plancher', 'surface_habitable', 'surface_terrain', 'cos_autorise',
  'taux_tva', 'seuil_aleas_pct',
  'date_esq', 'date_avp', 'date_pro', 'date_dce',
  'date_depot_pc', 'date_obtention_pc', 'date_demarrage_travaux', 'date_livraison',
  'programme_imperatifs', 'programme_interdits', 'programme_prestations', 'notes',
]

function buildPayload(formData) {
  const payload = {}
  AFFAIRE_FIELDS.forEach(f => {
    if (formData[f] !== undefined) payload[f] = formData[f]
  })
  return payload
}

export function useAffaires() {
  const [affaires, setAffaires] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFiltered, setIsFiltered] = useState(true)

  const refetch = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return

    const { data: collab, error: collabError } = await supabase
      .from('affaire_collaborateurs')
      .select('affaire_id')
      .eq('user_id', user.id)

    if (!collabError && collab && collab.length > 0) {
      const ids = collab.map(c => c.affaire_id)
      const { data, error: err } = await supabase
        .from('affaires')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false })
      if (!err) { setAffaires(data ?? []); setIsFiltered(true); setError(null) }
      return
    }

    // Fallback: silent degraded mode — no collaborateur rows yet
    const { data, error: err } = await supabase
      .from('affaires')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else { setAffaires(data ?? []); setIsFiltered(false); setError(null) }
  }, [])

  useEffect(() => {
    refetch().finally(() => setLoading(false))
  }, [refetch])

  const createAffaire = async (formData) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: newAffaire, error: affaireError } = await supabase
      .from('affaires')
      .insert([buildPayload(formData)])
      .select()
      .single()
    if (affaireError) throw affaireError
    const { error: collabError } = await supabase
      .from('affaire_collaborateurs')
      .upsert(
        [{ affaire_id: newAffaire.id, user_id: user.id, role: 'proprietaire' }],
        { onConflict: 'affaire_id,user_id', ignoreDuplicates: true }
      )
    if (collabError) {
      console.warn('Assignation propriétaire échouée:', collabError.message)
    }
    await refetch()
    return newAffaire
  }

  const updateAffaire = async (id, formData) => {
    const { data: { user } } = await supabase.auth.getUser()
    // Ensure current user is assigned before attempting the RLS-protected update
    await supabase
      .from('affaire_collaborateurs')
      .upsert(
        [{ affaire_id: id, user_id: user.id, role: 'proprietaire' }],
        { onConflict: 'affaire_id,user_id' }
      )
    const { error } = await supabase
      .from('affaires')
      .update(buildPayload(formData))
      .eq('id', id)
    if (error) throw error
    await refetch()
  }

  const deleteAffaire = async (id) => {
    const { error } = await supabase
      .from('affaires')
      .delete()
      .eq('id', id)
    if (error) throw error
    await refetch()
  }

  return { affaires, loading, error, isFiltered, refetch, createAffaire, updateAffaire, deleteAffaire }
}

export function useAffaire(id) {
  const [affaire, setAffaire] = useState(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('affaires').select('*').eq('id', id).single()
    if (data) setAffaire(data)
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    refetch().finally(() => setLoading(false))
  }, [id, refetch])

  const updateAffaire = useCallback(async (data) => {
    const { error } = await supabase.from('affaires').update(data).eq('id', id)
    if (!error) await refetch()
    return { error }
  }, [id, refetch])

  return { affaire, loading, updateAffaire, refetch }
}
