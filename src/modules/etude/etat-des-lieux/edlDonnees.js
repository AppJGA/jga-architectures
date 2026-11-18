// ─── Lectures et écritures de l'état des lieux ───────────────────────────────
//
// Tables de la migration 077, stockage privé `edl` rangé par affaire. Sans la
// migration, `chargerEtat` le dit (`indisponible`) au lieu d'échouer. Un refus
// RLS sur une modification ne rend pas d'erreur : on compte les lignes.

import { gzipSync } from 'fflate'
import { supabase } from '../../../core/supabase/client'
import { arrondirContour } from './geometrieEdl'
import { ecrireAvecReplis } from '../../../shared/repliColonnes'
import { BUCKET_EDL, edlIndisponible, colonnesVecteursManquantes } from './edlConstantes'

export { BUCKET_EDL, edlIndisponible }
const LECTURE_SEULE = 'Lecture seule : rien n’a été modifié.'

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

// `cree` : l'import qui l'a créé le retire s'il échoue (annulerImport)
export async function assurerEtat(affaireId) {
  const { data, error } = await supabase.from('edl_etats').insert({ affaire_id: affaireId }).select().single()
  if (!error) return { etat: data, cree: true }
  if (error.code !== '23505') throw error
  const existant = await supabase.from('edl_etats').select('*').eq('affaire_id', affaireId).single()
  if (existant.error) throw existant.error
  return { etat: existant.data, cree: false }
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

// L'étage allégé (`encoderVecteurs`, déjà compressé) : c'est lui que l'écran
// redessine à chaque vue, net à tous les zooms (migration 081)
export async function envoyerVecteurs(affaireId, octets) {
  const chemin = `${affaireId}/edl/vecteurs/${crypto.randomUUID()}.json.gz`
  await envoyer(chemin, new Blob([octets], { type: 'application/gzip' }), 'application/gzip')
  return chemin
}

function sansColonnesVecteurs(ligne) {
  const reste = { ...ligne }
  delete reste.chemin_vecteurs
  delete reste.calques
  return reste
}

// Sans la migration 081, la ligne est réécrite sans `chemin_vecteurs` ni
// `calques` et le fichier vectoriel déjà envoyé est retiré : l'étage
// s'affiche par son image, comme avant. La ligne rendue n'a alors pas de
// clé `chemin_vecteurs`, ce que l'import lit pour ne plus en envoyer.
// `sansVecteurs` : absence déjà constatée, la ligne part d'emblée sans elles.
export async function enregistrerNiveau(affaireId, etatId, n, { sansVecteurs: dejaSans = false } = {}) {
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
  const complete = {
    id, etat_id: etatId, affaire_id: affaireId, nom: n.nom, ordre: n.ordre, format: n.format,
    source_nom: n.sourceNom ?? null, source_page: n.sourcePage ?? null, chemin_source: n.cheminSource ?? null,
    chemin, chemin_apercu: cheminApercu, largeur: n.rendu.plan.largeur, hauteur: n.rendu.plan.hauteur,
    cadrage: n.cadrage, unites_par_metre: n.unitesParMetre ?? null, echelle: n.echelle ?? null, textes: n.textes ?? [],
    chemin_vecteurs: n.cheminVecteurs ?? null, calques: n.calques ?? null,
  }
  const ligne = dejaSans ? sansColonnesVecteurs(complete) : complete
  let sansVecteurs = dejaSans
  const { data, error } = await ecrireAvecReplis(
    (l) => supabase.from('edl_niveaux').insert(l).select().single(),
    ligne,
    [[colonnesVecteursManquantes, (l) => { sansVecteurs = true; return sansColonnesVecteurs(l) }]],
  )
  if (error) {
    await retirer([chemin, cheminApercu])
    throw error
  }
  if (sansVecteurs && n.cheminVecteurs) await retirer([n.cheminVecteurs])
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

// Relecture du découpage d'un étage (migration 078). Sans la colonne, la
// relecture s'affiche mais ne survit pas à la fermeture : on le dit.
export async function enregistrerRelecture(niveauId, relecture) {
  const { data, error } = await supabase.from('edl_niveaux').update({ relecture }).eq('id', niveauId).select('id')
  if (error) {
    if (error.code === 'PGRST204' || error.code === '42703' || /relecture/i.test(error.message ?? '')) {
      throw new Error('La relecture n’est pas gardée : la migration 078 doit être passée dans Supabase.')
    }
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

// Un import interrompu retire ce qu'il a déjà enregistré : sinon « Importer »,
// relancé, recréait ces étages en double. Les fichiers ne partent qu'une fois
// les lignes retirées (un refus RLS ne rend pas d'erreur : on compte), pour
// ne jamais laisser un étage sans son image.
export async function annulerImport({ niveauIds, chemins, etatCreeId }) {
  if (niveauIds.length) {
    const { data, error } = await supabase.from('edl_niveaux').delete().in('id', niveauIds).select('id')
    if (error) throw error
    if ((data?.length ?? 0) < niveauIds.length) throw new Error(LECTURE_SEULE)
  }
  if (etatCreeId) {
    const reste = await supabase.from('edl_niveaux').select('id').eq('etat_id', etatCreeId).limit(1)
    if (reste.error) throw reste.error
    if (!reste.data?.length) {
      const { error } = await supabase.from('edl_etats').delete().eq('id', etatCreeId).select('id')
      if (error) throw error
    }
  }
  await retirer(chemins)
}

// Remplacer les plans : tout l'état des lieux part (étages et pièces par
// cascade), puis ses fichiers
// Tout l'état des lieux, visites comprises (cascade : points, photos,
// journal). Les chemins des photos sont lus avant : après, plus rien ne les
// désigne ; un fichier resté malgré tout est rattrapé par « Nettoyer le stockage ».
export async function supprimerEtat(affaireId, niveaux) {
  const { data: photos } = await supabase.from('edl_photos').select('chemin, chemin_miniature').eq('affaire_id', affaireId)
  const { data, error } = await supabase.from('edl_etats').delete().eq('affaire_id', affaireId).select('id')
  if (error) {
    // Base sans la 080 : le déclencheur de la 079 refuse encore après une visite
    if (error.code === 'P0001' && /visite/i.test(error.message ?? '')) {
      throw new Error('Une visite a déjà eu lieu : pour remplacer les plans, la migration 080 doit d’abord être passée dans Supabase.')
    }
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
  await retirer([...new Set([
    ...niveaux.flatMap((n) => [n.chemin, n.chemin_apercu, n.chemin_source, n.chemin_vecteurs]),
    ...(photos ?? []).flatMap((p) => [p.chemin, p.chemin_miniature]),
  ])])
}
