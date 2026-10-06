// ─── Archives PDF des comptes rendus émis ────────────────────────────────────

import { supabase } from '../../../core/supabase/client'
import { photosIndisponibles } from './photosStockage'
import { adresseLien } from './diffusionLogique'

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

/**
 * Enregistre un PDF : celui de l'émission (sans destinataire) ou une version
 * pour une entreprise (migration 044 pour `destinataire` / `version_pour`).
 * @returns la ligne créée
 */
export async function archiverPdf({ affaireId, crId, blob, reglages, emisLe, destinataire = null, versionPour = null }) {
  const chemin = `${affaireId}/${crId}/${crypto.randomUUID()}.pdf`
  const envoi = await supabase.storage.from(BUCKET_ARCHIVES).upload(chemin, blob, { contentType: 'application/pdf', upsert: false })
  if (envoi.error) throw envoi.error
  const { data, error } = await supabase.from('cr_archives').insert({
    affaire_id: affaireId, cr_id: crId, chemin, taille_octets: blob.size, reglages, emis_le: emisLe,
    ...(destinataire && { destinataire, version_pour: versionPour }),
  }).select().single()
  if (error) {
    await supabase.storage.from(BUCKET_ARCHIVES).remove([chemin])
    throw error
  }
  return data
}

/**
 * Retire une archive : la ligne d'abord, puis le fichier. Un fichier resté
 * sans ligne est rattrapé par « Nettoyer le stockage » ; l'inverse laisserait
 * une archive affichée qui ne s'ouvre plus. Un e-mail déjà envoyé perd son lien.
 */
export async function supprimerArchive(archive) {
  const { data, error } = await supabase.from('cr_archives').delete().eq('id', archive.id).select('id')
  if (error) throw error
  // Un refus des règles d'accès ne lève pas d'erreur : rien n'est supprimé
  if (!data?.length) throw new Error('Suppression refusée : vous ne pouvez pas modifier cette affaire.')
  const { error: erreurFichier } = await supabase.storage.from(BUCKET_ARCHIVES).remove([archive.chemin])
  if (erreurFichier) console.warn('Archive : fichier non retiré, à nettoyer', erreurFichier)
}

/**
 * Lien court et lisible vers un PDF diffusé (migration 065) : « <site>/pdf/<code> »,
 * qui mène au lien signé `url` jusqu'à `expiration`. null si la migration
 * manque ou si l'écriture échoue : l'e-mail garde alors le lien signé.
 */
export async function creerLienCourt({ chemin, url, expiration, code }) {
  const { error } = await supabase.from('liens_telechargement').insert({
    code, affaire_id: chemin.split('/')[0], chemin, url, expire_le: expiration.toISOString(),
  })
  if (error) {
    if (!photosIndisponibles(error)) console.warn('Lien court :', error)
    return null
  }
  return adresseLien(window.location.origin, code)
}

// Lien de téléchargement : 10 minutes pour l'écran, 30 jours pour un e-mail
export async function lienArchive(chemin, dureeSecondes = 600) {
  const { data, error } = await supabase.storage.from(BUCKET_ARCHIVES).createSignedUrl(chemin, dureeSecondes)
  if (error) throw error
  return data.signedUrl
}

/** E-mails préparés pour un CR, le plus récent d'abord ; null avant la migration 044 */
export async function diffusionsDuCr(crId) {
  const { data, error } = await supabase.from('cr_diffusions').select('*').eq('cr_id', crId).order('prepare_le', { ascending: false })
  if (error) {
    if (photosIndisponibles(error)) return null
    throw error
  }
  return data ?? []
}

export async function noterDiffusion(ligne) {
  const { error } = await supabase.from('cr_diffusions').insert(ligne)
  if (error) throw error
}
