import { supabase } from '../../core/supabase/client'

export async function getRapports(affaireId) {
  return supabase
    .from('rapports_chantier')
    .select('*, reserves(*)')
    .eq('affaire_id', affaireId)
    .order('date_visite', { ascending: false })
}

export async function createRapport(data) {
  return supabase.from('rapports_chantier').insert(data).select().single()
}

export async function getReservesOuvertes(affaireId) {
  return supabase
    .from('reserves')
    .select('*, rapports_chantier(date_visite)')
    .eq('affaire_id', affaireId)
    .neq('statut', 'levee')
    .order('created_at', { ascending: false })
}

export async function createReserve(data) {
  return supabase.from('reserves').insert(data).select().single()
}

export async function updateReserveStatut(id, statut) {
  return supabase.from('reserves').update({ statut }).eq('id', id)
}
