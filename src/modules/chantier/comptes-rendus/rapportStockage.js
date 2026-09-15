// ─── Archives PDF des comptes rendus émis ────────────────────────────────────

import { supabase } from '../../../core/supabase/client'
import { photosIndisponibles } from './photosStockage'

export const BUCKET_ARCHIVES = 'cr-archives'

/** Archives d'un CR, la plus récente d'abord ; null avant la migration 043 */
export async function archivesDuCr(crId) {
  const { data, error } = await supabase.from('cr_archives').select('*').eq('cr_id', crId).order('emis_le', { ascending: false })
  if (error) {
    if (photosIndisponibles(error)) return null
    throw error
  }
  return data ?? []
}

export async function archiverPdf({ affaireId, crId, blob, reglages, emisLe }) {
  const chemin = `${affaireId}/${crId}/${crypto.randomUUID()}.pdf`
  const envoi = await supabase.storage.from(BUCKET_ARCHIVES).upload(chemin, blob, { contentType: 'application/pdf', upsert: false })
  if (envoi.error) throw envoi.error
  const { error } = await supabase.from('cr_archives').insert({
    affaire_id: affaireId, cr_id: crId, chemin, taille_octets: blob.size, reglages, emis_le: emisLe,
  })
  if (error) {
    await supabase.storage.from(BUCKET_ARCHIVES).remove([chemin])
    throw error
  }
}

export async function lienArchive(chemin) {
  const { data, error } = await supabase.storage.from(BUCKET_ARCHIVES).createSignedUrl(chemin, 600)
  if (error) throw error
  return data.signedUrl
}
