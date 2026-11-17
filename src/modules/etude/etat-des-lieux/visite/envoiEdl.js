// ─── Envoi d'un geste de la visite ───────────────────────────────────────────
//
// Chaque opération porte les identifiants décidés sur l'appareil : la rejouer
// écrit la même ligne. Un doublon (23505) est donc un succès — l'envoi
// précédent était passé avant de perdre le réseau. Une suppression qui ne
// trouve rien est aussi un succès (déjà faite). Une modification qui ne touche
// aucune ligne est un refus (droits, ou ligne disparue) : compté par la synchro.

import { supabase } from '../../../../core/supabase/client'
import { BUCKET_EDL } from '../edlConstantes'
import { TYPES_EDL } from './fileEdlLogique'
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
  verifier((await supabase.from(table).insert(ligne)).error)
}

// Fichiers d'abord (upsert : un envoi rejoué les réécrit), ligne ensuite,
// copie de l'appareil effacée en dernier. Plus de copie sur l'appareil : soit
// l'envoi précédent est allé jusqu'au bout (la ligne existe, succès), soit
// la photo est perdue — refus, comme les CR (horsLigne/envoi.js), jamais une
// ligne sans fichier. Un point qui n'existe plus (supprimé depuis) : refus
// avant tout envoi, sans fichier orphelin ni ligne orpheline.
async function envoyerPhoto(photo) {
  const fichier = await lire(MAGASINS_EDL.fichiers, photo.id)
  if (!fichier) {
    const { data, error } = await supabase.from('edl_photos').select('id').eq('id', photo.id).maybeSingle()
    if (error) throw error
    if (data) return
    throw new Error('La photo n’est plus dans la mémoire de l’appareil.')
  }
  const { data: point, error: erreurPoint } = await supabase.from('edl_points').select('id').eq('id', photo.point_id).maybeSingle()
  if (erreurPoint) throw erreurPoint
  if (!point) throw new Error('Le point de cette photo n’existe plus : photo non envoyée.')
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
      for (const photo of c.photos ?? []) await inserer('edl_photos', photo)
      return
    case TYPES_EDL.pointModifier:
      await modifier('edl_points', c.id, c.champs)
      return
    case TYPES_EDL.pointSupprimer: {
      // Les fichiers des photos restent : « Annuler » rend le point intact ;
      // « Nettoyer le stockage » les reprend s'il n'est pas rendu (079)
      const { error } = await supabase.from('edl_points').delete().eq('id', c.id)
      if (error) throw error
      return
    }
    case TYPES_EDL.photoAjouter:
      await envoyerPhoto(c.photo)
      return
    default:
      throw new Error(`Opération inconnue : ${op.type}`)
  }
}
