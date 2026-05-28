import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export function useAffaireCollaborateurs(affaireId) {
  const [collaborateurs, setCollaborateurs] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!affaireId) return
    const { data } = await supabase
      .from('affaire_collaborateurs')
      .select('*, profiles(id, prenom, nom, email)')
      .eq('affaire_id', affaireId)
      .order('created_at', { ascending: true })
    setCollaborateurs(data ?? [])
  }, [affaireId])

  useEffect(() => {
    if (!affaireId) return
    refetch().finally(() => setLoading(false))
  }, [affaireId, refetch])

  const addCollaborateur = useCallback(async (userId) => {
    const { data: authData } = await supabase.auth.getUser()
    const currentUser = authData?.user
    const { error } = await supabase.from('affaire_collaborateurs').insert({
      affaire_id: affaireId,
      user_id: userId,
      role: 'collaborateur',
      added_by: currentUser?.id,
    })
    if (!error) await refetch()
    return { error }
  }, [affaireId, refetch])

  const removeCollaborateur = useCallback(async (userId) => {
    const { error } = await supabase
      .from('affaire_collaborateurs')
      .delete()
      .eq('affaire_id', affaireId)
      .eq('user_id', userId)
    if (!error) await refetch()
    return { error }
  }, [affaireId, refetch])

  const searchProfiles = useCallback(async (emailQuery) => {
    if (!emailQuery || emailQuery.length < 3) return []
    const alreadyIn = collaborateurs.map(c => c.user_id)
    let q = supabase.from('profiles').select('*').ilike('email', `%${emailQuery}%`).limit(6)
    if (alreadyIn.length > 0) q = q.not('id', 'in', `(${alreadyIn.join(',')})`)
    const { data } = await q
    return data ?? []
  }, [collaborateurs])

  return { collaborateurs, loading, refetch, addCollaborateur, removeCollaborateur, searchProfiles }
}
