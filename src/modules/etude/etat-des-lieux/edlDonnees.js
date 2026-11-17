// ─── Lectures et écritures de l'état des lieux ───────────────────────────────
//
// Tables de la migration 077, stockage privé `edl` rangé par affaire. Sans la
// migration, `chargerEtat` le dit (`indisponible`) au lieu d'échouer. Un refus
// RLS sur une modification ne rend pas d'erreur : on compte les lignes.

import { gzipSync } from 'fflate'
import { supabase } from '../../../core/supabase/client'
import { arrondirContour } from './geometrieEdl'

export const BUCKET_EDL = 'edl'
const LECTURE_SEULE = 'Lecture seule : rien n’a été modifié.'

export const edlIndisponible = (error) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /edl_\w+.*(does not exist|schema cache)/i.test(error?.message ?? '')

export async function chargerEtat(affaireId) {
  const { data: etat, error } = await supabase.from('edl_etats').select('*').eq('affaire_id', affaireId).maybeSingle()
  if (error) {
    if (edlIndisponible(error)) return { indisponible: true }
    throw error
  }
  if (!etat) return { etat: null, niveaux: [], pieces: [] }
  const [niveaux, pieces] = await Promise.all([
    supabase.from('edl_niveaux').select('*').eq('etat_id', etat.id).order('ordre'),
    supabase.from('edl_pieces').select('*').eq('affaire_id', affaireId).order('ordre'),
  ])
  if (niveaux.error) throw niveaux.error
  if (pieces.error) throw pieces.error
  return { etat, niveaux: niveaux.data ?? [], pieces: pieces.data ?? [] }
}

export async function assurerEtat(affaireId) {
  const { data, error } = await supabase.from('edl_etats').insert({ affaire_id: affaireId }).select().single()
  if (!error) return data
  if (error.code !== '23505') throw error
  const existant = await supabase.from('edl_etats').select('*').eq('affaire_id', affaireId).single()
  if (existant.error) throw existant.error
  return existant.data
}

async function envoyer(chemin, blob, contentType) {
  const { error } = await supabase.storage.from(BUCKET_EDL).upload(chemin, blob, { contentType: contentType ?? blob.type, upsert: false })
  if (error) throw error
}

async function retirer(chemins) {
  const { error } = await supabase.storage.from(BUCKET_EDL).remove(chemins.filter(Boolean))
  if (error) console.warn('État des lieux, nettoyage :', error)
}

// Le plan d'origine, compressé : l'export DXF du lot 4 repart de lui
export async function envoyerSource(affaireId, octets) {
  const chemin = `${affaireId}/edl/sources/${crypto.randomUUID()}.gz`
  await envoyer(chemin, new Blob([gzipSync(octets, { level: 6 })], { type: 'application/gzip' }), 'application/gzip')
  return chemin
}

export async function enregistrerNiveau(affaireId, etatId, n) {
  const id = crypto.randomUUID()
  const chemin = `${affaireId}/edl/${id}.${n.rendu.extension}`
  const cheminApercu = `${affaireId}/edl/${id}-apercu.${n.rendu.extension}`
  await envoyer(chemin, n.rendu.plan.blob)
  try {
    await envoyer(cheminApercu, n.rendu.apercu.blob)
  } catch (err) {
    await retirer([chemin])
    throw err
  }
  const { data, error } = await supabase.from('edl_niveaux').insert({
    id, etat_id: etatId, affaire_id: affaireId, nom: n.nom, ordre: n.ordre, format: n.format,
    source_nom: n.sourceNom ?? null, source_page: n.sourcePage ?? null, chemin_source: n.cheminSource ?? null,
    chemin, chemin_apercu: cheminApercu, largeur: n.rendu.plan.largeur, hauteur: n.rendu.plan.hauteur,
    cadrage: n.cadrage, unites_par_metre: n.unitesParMetre ?? null, echelle: n.echelle ?? null, textes: n.textes ?? [],
  }).select().single()
  if (error) {
    await retirer([chemin, cheminApercu])
    throw error
  }
  return data
}

const lignePiece = (affaireId, niveauId, p, ordre) => ({
  niveau_id: niveauId, affaire_id: affaireId, nom: p.nom ?? '', numero: p.numero ?? null,
  contour: arrondirContour(p.contour), surface_lue: p.surfaceLue ?? null, hsp_lue: p.hspLue ?? null,
  origine: p.origine, a_verifier: !!p.aVerifier, ordre,
})

export async function enregistrerPieces(affaireId, niveauId, pieces) {
  if (!pieces.length) return []
  const { data, error } = await supabase.from('edl_pieces').insert(pieces.map((p, i) => lignePiece(affaireId, niveauId, p, i))).select()
  if (error) throw error
  return data
}

export async function ajouterPiece(affaireId, niveauId, piece, ordre) {
  const { data, error } = await supabase.from('edl_pieces').insert(lignePiece(affaireId, niveauId, piece, ordre)).select().single()
  if (error) throw error
  return data
}

export async function modifierPiece(id, champs) {
  const { data, error } = await supabase.from('edl_pieces').update(champs).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

export async function supprimerPiece(id) {
  const { data, error } = await supabase.from('edl_pieces').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

export async function renommerNiveau(id, nom) {
  const { data, error } = await supabase.from('edl_niveaux').update({ nom }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

// Remplacer les plans : tout l'état des lieux part (étages et pièces par
// cascade), puis ses fichiers
export async function supprimerEtat(affaireId, niveaux) {
  const { data, error } = await supabase.from('edl_etats').delete().eq('affaire_id', affaireId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
  await retirer([...new Set(niveaux.flatMap((n) => [n.chemin, n.chemin_apercu, n.chemin_source]))])
}
