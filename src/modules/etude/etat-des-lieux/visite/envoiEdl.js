// ─── Envoi d'un geste de la visite ───────────────────────────────────────────
//
// Chaque opération porte les identifiants décidés sur l'appareil : la rejouer
// écrit la même ligne. Un doublon (23505) est donc un succès — l'envoi
// précédent était passé avant de perdre le réseau. Une suppression qui ne
// trouve rien est aussi un succès (déjà faite). Une modification qui ne touche
// aucune ligne est un refus (droits, ou ligne disparue) : compté par la synchro.

import { supabase } from '../../../../core/supabase/client'
import { BUCKET_EDL } from '../edlConstantes'
import { TYPES_EDL, insererSansPieceDisparue } from './fileEdlLogique'
import { MAGASINS_EDL, lire, effacer } from './baseEdl'

const DOUBLON = '23505'

function verifier(error) {
  if (error && error.code !== DOUBLON) throw error
}

async function modifier(table, id, champs) {
  const { data, error } = await supabase.from(table).update(champs).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('La base n’a rien modifié (ligne absente ou droits insuffisants).')
}

// Une ligne à la fois : un doublon dans un envoi groupé ferait croire que
// toutes les lignes sont passées
async function inserer(table, ligne) {
  verifier(await insererSansPieceDisparue(table, ligne, async (l) => (await supabase.from(table).insert(l)).error))
}

// Lectures de décision : alias `synchro_id` (exclu du cache du service worker,
// vite.config.js), sinon une réponse périmée déciderait d'un envoi.
async function existe(table, id) {
  const { data, error } = await supabase.from(table).select('synchro_id:id, id').eq('id', id).maybeSingle()
  if (error) throw error
  return Boolean(data?.id)
}

async function fichierEnStockage(chemin) {
  const i = chemin.lastIndexOf('/')
  const { data, error } = await supabase.storage.from(BUCKET_EDL).list(chemin.slice(0, i), { search: chemin.slice(i + 1), limit: 5 })
  if (error) throw error
  return (data ?? []).some((f) => f.name === chemin.slice(i + 1))
}

// Fichiers d'abord (upsert : un envoi rejoué les réécrit), ligne ensuite,
// copie de l'appareil effacée en dernier. Plus de copie sur l'appareil : soit
// l'envoi précédent est allé jusqu'au bout (la ligne existe, succès), soit
// la photo est perdue — refus, comme les CR (horsLigne/envoi.js), jamais une
// ligne sans fichier. Un point qui n'existe plus (supprimé depuis) : refus
// avant tout envoi, sans fichier orphelin ni ligne orpheline.
// `restauration` : le point vient d'être rendu par « Annuler », sa ligne photo
// est partie en cascade ; sans copie sur l'appareil, le fichier déjà en
// stockage suffit pour la reposer.
async function envoyerPhoto(photo, { restauration = false } = {}) {
  const fichier = await lire(MAGASINS_EDL.fichiers, photo.id)
  if (!fichier) {
    if (await existe('edl_photos', photo.id)) return
    if (restauration && await fichierEnStockage(photo.chemin) && await fichierEnStockage(photo.chemin_miniature)) {
      await inserer('edl_photos', photo)
      return
    }
    throw new Error('La photo n’est plus dans la mémoire de l’appareil.')
  }
  if (!(await existe('edl_points', photo.point_id))) throw new Error('Le point de cette photo n’existe plus : photo non envoyée.')
  const stockage = supabase.storage.from(BUCKET_EDL)
  for (const [chemin, blob] of [[photo.chemin, fichier.photo], [photo.chemin_miniature, fichier.miniature]]) {
    const { error } = await stockage.upload(chemin, blob, { contentType: blob.type, cacheControl: '31536000', upsert: true })
    if (error) throw error
  }
  await inserer('edl_photos', photo)
  await effacer(MAGASINS_EDL.fichiers, photo.id).catch(() => {})
}

export async function envoyerOperationEdl(op) {
  const c = op.charge
  switch (op.type) {
    case TYPES_EDL.visiteCreer:
      await inserer('edl_visites', c.visite)
      return
    case TYPES_EDL.visiteTerminer:
      await modifier('edl_visites', c.id, { fin: c.fin })
      return
    case TYPES_EDL.evenement:
      await inserer('edl_evenements', c.evenement)
      return
    case TYPES_EDL.pointPoser:
      // Le point d'abord (un « Annuler » de suppression le rend), puis ses photos
      await inserer('edl_points', c.point)
      for (const photo of c.photos ?? []) await envoyerPhoto(photo, { restauration: true })
      return
    case TYPES_EDL.pointModifier:
      await modifier('edl_points', c.id, c.champs)
      return
    case TYPES_EDL.pointSupprimer: {
      // Les fichiers des photos restent : « Annuler » rend le point intact ;
      // « Nettoyer le stockage » les reprend s'il n'est pas rendu (079)
      // Un refus RLS ne rend pas d'erreur : on compte les lignes ; rien de
      // touché et la ligne existe encore = refus, absente = déjà supprimé
      const { data, error } = await supabase.from('edl_points').delete().eq('id', c.id).select('id')
      if (error) throw error
      if (!data?.length && await existe('edl_points', c.id)) throw new Error('La base n’a pas supprimé le point (droits insuffisants).')
      return
    }
    case TYPES_EDL.photoAjouter:
      await envoyerPhoto(c.photo)
      return
    default:
      throw new Error(`Opération inconnue : ${op.type}`)
  }
}
