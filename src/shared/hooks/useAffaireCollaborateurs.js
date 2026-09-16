import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export function useAffaireCollaborateurs(affaireId) {
  const [collaborateurs, setCollaborateurs] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)

    // 1. User courant
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setCurrentUserId(user.id)

    // 2. Collaborateurs de l'affaire
    const { data: collabData, error: collabErr } = await supabase
      .from('affaire_collaborateurs')
      .select('affaire_id, user_id, role')
      .eq('affaire_id', affaireId)

    if (collabErr) {
      console.error('Erreur collab:', collabErr)
      setLoading(false)
      return
    }

    // 3. Profils séparément pour éviter le 406
    const userIds = (collabData ?? []).map(c => c.user_id)
    let profilesMap = {}
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, prenom, nom, email, type_compte')
        .in('id', userIds)
      profilesMap = Object.fromEntries(
        (profilesData ?? []).map(p => [p.id, p])
      )
    }

    const enriched = (collabData ?? []).map(c => ({
      ...c,
      profiles: profilesMap[c.user_id] ?? { prenom: '?', nom: '?' },
    }))

    setCollaborateurs(enriched)
    setLoading(false)
  }, [affaireId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Droits calculés depuis les données chargées
  const isProprietaire = !!currentUserId && collaborateurs.some(
    c => c.user_id === currentUserId && c.role === 'proprietaire'
  )
  const isCollaborateur = !!currentUserId && collaborateurs.some(
    c => c.user_id === currentUserId && c.role === 'collaborateur'
  )
  // Un intervenant extérieur consulte : il ne modifie rien de l'affaire
  // (migration 050 ; ses propres remarques viendront avec le lot 3).
  const estExterieur = !!currentUserId && collaborateurs.some(
    c => c.user_id === currentUserId && c.role === 'exterieur'
  )
  const hasAnyCollab = collaborateurs.length > 0
  // Si aucun collab défini → accès libre (évite le blocage au démarrage)
  const canEdit = estExterieur ? false : (hasAnyCollab ? (isProprietaire || isCollaborateur) : true)

  const addCollaborateur = useCallback(async (userId, role = 'collaborateur') => {
    const { error } = await supabase
      .from('affaire_collaborateurs')
      .upsert(
        [{ affaire_id: affaireId, user_id: userId, role, added_by: currentUserId }],
        { onConflict: 'affaire_id,user_id' }
      )
    if (error) { console.error('Ajout collaborateur:', error); throw error }
    await fetchData()
  }, [affaireId, currentUserId, fetchData])

  const removeCollaborateur = useCallback(async (userId) => {
    if (userId === currentUserId && isProprietaire) return // garde : pas d'auto-retrait proprio
    const { error } = await supabase
      .from('affaire_collaborateurs')
      .delete()
      .eq('affaire_id', affaireId)
      .eq('user_id', userId)
    if (error) console.error('Suppression collaborateur:', error)
    await fetchData()
  }, [affaireId, currentUserId, isProprietaire, fetchData])

  // Conservé pour CollaborateursSection (recherche par email dans AffaireFormModal)
  const searchProfiles = useCallback(async (emailQuery) => {
    if (!emailQuery || emailQuery.length < 3) return []
    const alreadyIn = collaborateurs.map(c => c.user_id)
    let q = supabase.from('profiles').select('id, prenom, nom, email, type_compte').ilike('email', `%${emailQuery}%`).limit(6)
    if (alreadyIn.length > 0) q = q.not('id', 'in', `(${alreadyIn.join(',')})`)
    const { data } = await q
    return data ?? []
  }, [collaborateurs])

  return {
    collaborateurs, loading, currentUserId,
    isProprietaire, isCollaborateur, estExterieur, canEdit,
    addCollaborateur, removeCollaborateur, searchProfiles,
    refetch: fetchData,
  }
}
