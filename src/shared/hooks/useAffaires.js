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
  'photo_url',
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

  const refetch = useCallback(async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return

    // 1. Toutes les affaires
    const { data: allAffaires, error: affairesError } = await supabase
      .from('affaires')
      .select('*')
      .order('created_at', { ascending: false })

    if (affairesError) { setError(affairesError.message); return }

    if (!allAffaires?.length) {
      setAffaires([]); setError(null); return
    }

    const affaireIds = allAffaires.map(a => a.id)

    // 2. Collaborateurs (sans jointure profiles pour éviter le 406)
    const { data: collabData } = await supabase
      .from('affaire_collaborateurs')
      .select('affaire_id, user_id, role')
      .in('affaire_id', affaireIds)

    // 3. IDs des affaires où l'utilisateur est autorisé
    const authorizedIds = new Set(
      (collabData ?? [])
        .filter(c => c.user_id === user.id)
        .map(c => c.affaire_id)
    )

    // 4. Profils chargés séparément
    const userIds = [...new Set((collabData ?? []).map(c => c.user_id))]
    let profilesMap = {}
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, prenom, nom')
        .in('id', userIds)
      profilesMap = Object.fromEntries(
        (profilesData ?? []).map(p => [p.id, p])
      )
    }

    // 5. Enrichissement + flag isAuthorized
    const enriched = allAffaires.map(a => ({
      ...a,
      isAuthorized: authorizedIds.has(a.id),
      affaire_collaborateurs: (collabData ?? [])
        .filter(c => c.affaire_id === a.id)
        .map(c => ({
          ...c,
          profiles: profilesMap[c.user_id] ?? { prenom: '?', nom: '?' },
        })),
    }))

    setAffaires(enriched)
    setError(null)
  }, [])

  useEffect(() => {
    refetch().finally(() => setLoading(false))
  }, [refetch])

  const createAffaire = async (formData) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Non authentifié')

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
        { onConflict: 'affaire_id,user_id' }
      )
    if (collabError) {
      console.error('Assignation proprio échouée:', collabError.message)
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
    const affaire = affaires.find(a => a.id === id)
    if (affaire?.photo_url) {
      try {
        const parts = affaire.photo_url.split('/affaires-photos/')
        if (parts.length > 1) {
          await supabase.storage.from('affaires-photos').remove([parts[1].split('?')[0]])
        }
      } catch (e) {
        console.warn('Suppression photo storage:', e)
      }
    }
    const { error } = await supabase.from('affaires').delete().eq('id', id)
    if (error) throw error
    await refetch()
  }

  return {
    affaires: affaires.filter(a => a.isAuthorized),
    affairesNonAutorisees: affaires.filter(a => !a.isAuthorized),
    loading, error,
    refetch, createAffaire, updateAffaire, deleteAffaire,
  }
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
