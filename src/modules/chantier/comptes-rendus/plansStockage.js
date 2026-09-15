// ─── Plans et pastilles : échanges avec Supabase ─────────────────────────────

import { supabase } from '../../../core/supabase/client'
import { photosIndisponibles } from './photosStockage'
import { indiceSuivant, versionCourante, versionsInutilisees } from './plansLogique'

export const BUCKET_PLANS = 'cr-plans'

/** Plans de l'affaire et toutes leurs versions ; null avant la migration 041 */
export async function plansDeLAffaire(affaireId) {
  const plans = await supabase.from('affaire_plans').select('*').eq('affaire_id', affaireId).order('ordre').order('created_at')
  if (plans.error) {
    if (photosIndisponibles(plans.error)) return null
    throw plans.error
  }
  const ids = (plans.data ?? []).map((p) => p.id)
  if (ids.length === 0) return { plans: [], versions: [] }
  const versions = await supabase.from('affaire_plan_versions').select('*').in('plan_id', ids)
  if (versions.error) throw versions.error
  return { plans: plans.data, versions: versions.data ?? [] }
}

export async function pastillesDuCr(crId) {
  const { data, error } = await supabase.from('cr_pastilles').select('*').eq('cr_id', crId)
  if (error) {
    if (photosIndisponibles(error)) return []
    throw error
  }
  return data ?? []
}

async function envoyerFichiersPlan(affaireId, { plan, apercu, extension }) {
  const id = crypto.randomUUID()
  const chemin = `${affaireId}/${id}.${extension}`
  const chemin_apercu = `${affaireId}/${id}-apercu.${extension}`
  const stockage = supabase.storage.from(BUCKET_PLANS)
  const options = (blob) => ({ contentType: blob.type, cacheControl: '31536000', upsert: false })
  const envoi = await stockage.upload(chemin, plan.blob, options(plan.blob))
  if (envoi.error) throw envoi.error
  const envoiApercu = await stockage.upload(chemin_apercu, apercu.blob, options(apercu.blob))
  if (envoiApercu.error) {
    await stockage.remove([chemin])
    throw envoiApercu.error
  }
  return {
    chemin, chemin_apercu, largeur: plan.largeur, hauteur: plan.hauteur,
    poids_octets: plan.blob.size + apercu.blob.size,
  }
}

async function retirerFichiers(versions) {
  const chemins = versions.flatMap((v) => [v.chemin, v.chemin_apercu]).filter(Boolean)
  if (chemins.length === 0) return
  const { error } = await supabase.storage.from(BUCKET_PLANS).remove(chemins)
  if (error) console.warn('Nettoyage des plans :', error)
}

/** Nouveau plan, version A */
export async function importerPlan(affaireId, { nom, ordre, rendu, sourceNom, sourcePage }) {
  const fichiers = await envoyerFichiersPlan(affaireId, rendu)
  const { data: plan, error } = await supabase.from('affaire_plans')
    .insert({ affaire_id: affaireId, nom, ordre }).select().single()
  if (error) {
    await retirerFichiers([fichiers])
    throw error
  }
  const { error: errVersion } = await supabase.from('affaire_plan_versions').insert({
    plan_id: plan.id, indice: 'A', source_nom: sourceNom ?? null, source_page: sourcePage ?? null, ...fichiers,
  })
  if (errVersion) {
    await supabase.from('affaire_plans').delete().eq('id', plan.id)
    await retirerFichiers([fichiers])
    throw errVersion
  }
  return plan
}

/**
 * Nouvelle version d'un plan. La base la reporte sur les pastilles des
 * brouillons ; les versions que plus rien n'affiche sont ensuite effacées.
 */
export async function nouvelleVersionPlan(affaireId, plan, versions, { rendu, sourceNom, sourcePage }) {
  const precedente = versionCourante(versions, plan.id)
  const fichiers = await envoyerFichiersPlan(affaireId, rendu)
  const { data: version, error } = await supabase.from('affaire_plan_versions').insert({
    plan_id: plan.id, indice: indiceSuivant(precedente?.indice), source_nom: sourceNom ?? null, source_page: sourcePage ?? null, ...fichiers,
  }).select().single()
  if (error) {
    await retirerFichiers([fichiers])
    throw error
  }

  const { data: pastilles, error: errPastilles } = await supabase.from('cr_pastilles').select('version_id').eq('plan_id', plan.id)
  if (errPastilles) { console.warn('Versions de plan :', errPastilles); return version }
  const inutiles = versionsInutilisees(versions, pastilles, plan.id, version.id)
  if (inutiles.length > 0) {
    const { error: errSuppression } = await supabase.from('affaire_plan_versions').delete().in('id', inutiles.map((v) => v.id))
    if (errSuppression) console.warn('Versions de plan :', errSuppression)
    else await retirerFichiers(inutiles)
  }
  return version
}

export async function renommerPlan(planId, nom) {
  const { error } = await supabase.from('affaire_plans').update({ nom }).eq('id', planId)
  if (error) throw error
}

// Refusé par la base si un compte rendu émis affiche le plan
export async function supprimerPlan(plan, versions) {
  const { error } = await supabase.from('affaire_plans').delete().eq('id', plan.id)
  if (error) throw error
  await retirerFichiers(versions.filter((v) => v.plan_id === plan.id))
}

export async function poserPastille(ligne) {
  const { error } = await supabase.from('cr_pastilles').upsert(ligne, { onConflict: 'remarque_id' })
  if (error) throw error
}

export async function retirerPastille(remarqueId) {
  const { error } = await supabase.from('cr_pastilles').delete().eq('remarque_id', remarqueId)
  if (error) throw error
}
