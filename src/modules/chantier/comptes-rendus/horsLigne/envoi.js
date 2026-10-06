// ─── Envoi d'une opération mise en attente ───────────────────────────────────
//
// Chaque opération porte l'identifiant décidé sur l'appareil : la rejouer
// écrit la même ligne. Un doublon (code 23505) est donc un succès — c'est le
// signe que l'envoi précédent était passé avant de perdre le réseau.

import { supabase } from '../../../../core/supabase/client'
import { BUCKET_PHOTOS } from '../photosStockage'
import { poserPastille } from '../plansStockage'
import { TYPES } from './fileLogique'
import { MAGASINS, lire, ecrire, effacer } from './baseLocale'

const DOUBLON = '23505'

function verifier(error) {
  if (error && error.code !== DOUBLON) throw error
}

// Coupure réseau : l'opération reste en file, sans compter comme un échec.
export function erreurReseau(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = String(err?.message ?? '')
  return err?.name === 'TypeError' || /fetch|network|réseau|Load failed|no-response/i.test(message)
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

export const CLE_RENUMEROTEES = 'jga.visites-renumerotees'

// Le numéro d'une visite démarrée sans réseau a été pris entre-temps : la
// visite emportée suit, et l'écran le dira (BandeauVisite)
async function noterRenumerotation(cr, numero) {
  const gardee = await lire(MAGASINS.visites, cr.id).catch(() => null)
  if (gardee?.donnees?.cr) await ecrire(MAGASINS.visites, { ...gardee, donnees: { ...gardee.donnees, cr: { ...gardee.donnees.cr, numero } } }).catch(() => {})
  try {
    const liste = JSON.parse(localStorage.getItem(CLE_RENUMEROTEES) ?? '[]')
    liste.push({ crId: cr.id, affaireId: cr.affaire_id, avant: cr.numero, apres: numero, le: Date.now() })
    localStorage.setItem(CLE_RENUMEROTEES, JSON.stringify(liste))
  } catch { /* navigation privée */ }
}

/**
 * Une visite démarrée sans réseau : la visite d'abord, puis sa reprise,
 * chaque niveau après celui qu'il référence (comme en ligne). Rejouée, elle
 * réécrit les mêmes lignes (doublons = succès). Un numéro pris entre-temps
 * par une autre visite : le suivant libre.
 */
async function envoyerCreationCr(op) {
  const { cr, reprise } = op.charge
  let numero = cr.numero
  for (let essai = 0; ; essai++) {
    const { error } = await supabase.from('comptes_rendus').insert({ ...cr, numero })
    if (!error) break
    if (error.code !== DOUBLON) throw error
    const { data: existe, error: e1 } = await supabase.from('comptes_rendus').select('id').eq('id', cr.id).maybeSingle()
    if (e1) throw e1
    if (existe) { numero = cr.numero; break } // envoi rejoué : déjà créée
    if (essai >= 4) throw new Error('Impossible d’attribuer un numéro à la visite démarrée sans réseau.')
    const { data: derniere, error: e2 } = await supabase.from('comptes_rendus')
      .select('numero').eq('affaire_id', cr.affaire_id).order('numero', { ascending: false }).limit(1).maybeSingle()
    if (e2) throw e2
    numero = (derniere?.numero ?? numero) + 1
  }
  if (numero !== cr.numero) await noterRenumerotation(cr, numero)
  for (const [table, lignes] of [
    ['cr_sections', reprise.sections], ['cr_sous_sections', reprise.sousSections],
    ['cr_remarques', reprise.remarques], ['cr_remarques', reprise.sousRemarques],
    ['cr_photos', reprise.photos], ['cr_pastilles', reprise.pastilles], ['cr_presences', reprise.presences],
  ]) {
    if (lignes?.length) verifier((await supabase.from(table).insert(lignes)).error)
  }
}

/**
 * Rejoue une opération de la file sur la base. Lève l'erreur telle quelle :
 * l'appelant décide de réessayer (réseau) ou de mettre de côté (refus).
 */
export async function envoyerOperation(op) {
  const c = op.charge
  switch (op.type) {
    case TYPES.crCreer:
      await envoyerCreationCr(op)
      return

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

    case TYPES.tacheAvancement: {
      const { error } = await supabase.from('planning').update({ avancement: c.avancement }).eq('id', c.tacheId)
      if (error) throw error
      return
    }

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
