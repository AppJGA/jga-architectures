import { supabase } from '../../../core/supabase/client'

export async function getComptesRendus(affaireId) {
  return supabase
    .from('comptes_rendus')
    .select('*, reserves(*)')
    .eq('affaire_id', affaireId)
    .order('date_visite', { ascending: false })
}

export async function createCompteRendu(data) {
  return supabase.from('comptes_rendus').insert(data).select().single()
}

export async function getReservesOuvertes(affaireId) {
  return supabase
    .from('reserves')
    .select('*, comptes_rendus(date_visite)')
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
