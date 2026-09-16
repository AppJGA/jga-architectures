// ─── Envoi d'une opération mise en attente ───────────────────────────────────
//
// Chaque opération porte l'identifiant décidé sur l'appareil : la rejouer
// écrit la même ligne. Un doublon (code 23505) est donc un succès — c'est le
// signe que l'envoi précédent était passé avant de perdre le réseau.

import { supabase } from '../../../../core/supabase/client'
import { BUCKET_PHOTOS } from '../photosStockage'
import { poserPastille } from '../plansStockage'
import { TYPES } from './fileLogique'
import { MAGASINS, lire, effacer } from './baseLocale'

const DOUBLON = '23505'

function verifier(error) {
  if (error && error.code !== DOUBLON) throw error
}

// Coupure réseau : l'opération reste en file, sans compter comme un échec.
export function erreurReseau(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = String(err?.message ?? '')
  return err?.name === 'TypeError' || /fetch|network|réseau|Load failed/i.test(message)
}

async function envoyerPhotoEnAttente(op) {
  const { photo, remarqueId, ordre, cleFichier, affaireId } = op.charge
  const fichier = await lire(MAGASINS.fichiers, cleFichier)
  if (!fichier) throw new Error('La photo n’est plus dans la mémoire de l’appareil.')

  const stockage = supabase.storage.from(BUCKET_PHOTOS)
  const options = (blob) => ({ contentType: blob.type, cacheControl: '31536000', upsert: true })
  const envoi = await stockage.upload(photo.chemin, fichier.photo, options(fichier.photo))
  if (envoi.error) throw envoi.error
  const envoiMini = await stockage.upload(photo.chemin_miniature, fichier.miniature, options(fichier.miniature))
  if (envoiMini.error) throw envoiMini.error

  const { error } = await supabase.from('cr_photos').insert({
    ...photo, affaire_id: affaireId, cr_id: op.crId, remarque_id: remarqueId, ordre,
  })
  verifier(error)
  await effacer(MAGASINS.fichiers, cleFichier).catch(() => {})
}

/**
 * Rejoue une opération de la file sur la base. Lève l'erreur telle quelle :
 * l'appelant décide de réessayer (réseau) ou de mettre de côté (refus).
 */
export async function envoyerOperation(op) {
  const c = op.charge
  switch (op.type) {
    case TYPES.sectionCreer:
      verifier((await supabase.from('cr_sections').insert({ ...c.section, cr_id: op.crId })).error)
      return

    case TYPES.remarqueCreer:
      verifier((await supabase.from('cr_remarques').insert({
        id: c.id, cr_id: op.crId, affaire_id: c.affaireId,
        section_id: c.sectionId, sous_section_id: c.sousSectionId ?? null, ordre: c.ordre,
        ...c.champs,
      })).error)
      return

    case TYPES.remarqueModifier: {
      const { error } = await supabase.from('cr_remarques').update(c.champs).eq('id', c.id)
      if (error) throw error
      return
    }

    case TYPES.suiviCreer:
      verifier((await supabase.from('cr_remarques').insert({
        id: c.id, cr_id: op.crId, parent_id: c.parentId, affaire_id: c.affaireId, ...c.champs,
      })).error)
      return

    case TYPES.presenceDefinir: {
      const { error } = await supabase.from('cr_presences').update({ presence: c.presence }).eq('id', c.presenceId)
      if (error) throw error
      return
    }

    case TYPES.photoAjouter:
      await envoyerPhotoEnAttente(op)
      return

    case TYPES.pastillePoser:
      await poserPastille({
        affaire_id: c.affaireId, cr_id: op.crId, remarque_id: c.remarqueId,
        plan_id: c.planId, version_id: c.versionId, x: c.x, y: c.y,
      })
      return

    default:
      throw new Error(`Opération inconnue : ${op.type}`)
  }
}
