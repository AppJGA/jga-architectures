// ─── Photos : échanges avec le stockage Supabase ─────────────────────────────

import { supabase } from '../../../core/supabase/client'
import { cheminsPhoto, fichiersAEffacer, paquets } from './photosLogique'

export const BUCKET_PHOTOS = 'cr-photos'

// Table ou fonction inconnue : la migration 039 n'est pas encore passée
export function photosIndisponibles(error) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code)
}

/**
 * Envoie une photo compressée et sa miniature. Si la miniature échoue, la
 * photo déjà envoyée est retirée : pas de fichier orphelin.
 * @returns ligne partielle de cr_photos (id, chemins, dimensions, poids)
 */
export async function envoyerPhoto(affaireId, { photo, miniature, extension }) {
  const id = crypto.randomUUID()
  const chemins = cheminsPhoto(affaireId, id, extension)
  const options = (blob) => ({ contentType: blob.type, cacheControl: '31536000', upsert: false })
  const stockage = supabase.storage.from(BUCKET_PHOTOS)

  const envoi = await stockage.upload(chemins.chemin, photo.blob, options(photo.blob))
  if (envoi.error) throw envoi.error
  const envoiMini = await stockage.upload(chemins.chemin_miniature, miniature.blob, options(miniature.blob))
  if (envoiMini.error) {
    await stockage.remove([chemins.chemin])
    throw envoiMini.error
  }
  return {
    id, ...chemins,
    largeur: photo.largeur, hauteur: photo.hauteur,
    poids_octets: photo.blob.size + miniature.blob.size,
  }
}

/**
 * Efface du stockage les fichiers des photos supprimées que plus aucune ligne
 * ne désigne (une photo reprise est partagée entre plusieurs visites). Un échec
 * ici ne laisse qu'un fichier inutile : il est signalé en console, sans bloquer.
 */
export async function nettoyerFichiers(photosSupprimees) {
  const chemins = [...new Set((photosSupprimees ?? []).map((p) => p.chemin).filter(Boolean))]
  if (chemins.length === 0) return
  const { data, error } = await supabase.from('cr_photos').select('chemin').in('chemin', chemins)
  if (error) { console.warn('Nettoyage des photos :', error); return }
  const fichiers = fichiersAEffacer(photosSupprimees, (data ?? []).map((l) => l.chemin))
  if (fichiers.length === 0) return
  const { error: errSuppression } = await supabase.storage.from(BUCKET_PHOTOS).remove(fichiers)
  if (errSuppression) console.warn('Nettoyage des photos :', errSuppression)
}

// Liens temporaires (le stockage est privé), par chemin
export async function liensSignes(chemins, dureeSecondes = 3600, bucket = BUCKET_PHOTOS) {
  const uniques = [...new Set(chemins.filter(Boolean))]
  if (uniques.length === 0) return new Map()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(uniques, dureeSecondes)
  if (error) throw error
  return new Map((data ?? []).filter((l) => l.signedUrl).map((l) => [l.path, l.signedUrl]))
}

// Photos d'un compte rendu (vide avant la migration 039)
export async function photosDuCr(crId) {
  const { data, error } = await supabase.from('cr_photos').select('*').eq('cr_id', crId).order('ordre').order('created_at')
  if (error) {
    if (photosIndisponibles(error)) return []
    throw error
  }
  return data ?? []
}

export async function espaceUtilise() {
  const { data, error } = await supabase.rpc('espace_stockage_utilise')
  if (error) {
    if (photosIndisponibles(error)) return null
    throw error
  }
  return Number(data) || 0
}

// Photos d'une affaire entière, avant sa suppression (vide avant la migration 039)
export async function photosDeLAffaire(affaireId) {
  const { data, error } = await supabase.from('cr_photos').select('chemin, chemin_miniature').eq('affaire_id', affaireId)
  if (error) {
    if (photosIndisponibles(error)) return []
    throw error
  }
  return data ?? []
}

/**
 * Fichiers qu'aucun compte rendu ni plan n'utilise : [{ bucket, chemin, taille }].
 * Avant la migration 041, seules les photos sont cherchées ; avant la 040,
 * null.
 */
export async function fichiersOrphelins() {
  const { data, error } = await supabase.rpc('fichiers_orphelins')
  if (!error) return data ?? []
  if (!photosIndisponibles(error)) throw error
  const ancien = await supabase.rpc('cr_photos_orphelines')
  if (ancien.error) {
    if (photosIndisponibles(ancien.error)) return null
    throw ancien.error
  }
  return (ancien.data ?? []).map((f) => ({ bucket: BUCKET_PHOTOS, ...f }))
}

export async function supprimerFichiers(fichiers) {
  const parBucket = new Map()
  for (const f of fichiers) parBucket.set(f.bucket, [...(parBucket.get(f.bucket) ?? []), f.chemin])
  for (const [bucket, chemins] of parBucket) {
    for (const paquet of paquets(chemins)) {
      const { error } = await supabase.storage.from(bucket).remove(paquet)
      if (error) throw error
    }
  }
}
