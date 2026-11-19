// ─── « Gestion de l'application » : lectures ─────────────────────────────────
//
// Les chiffres réservés (stockage détaillé, taille de la base, comptes) passent
// par les fonctions de la migration 074 ; sans elle, chacun vaut null et la
// page dit ce qui manque. Le reste se lit avec les droits ordinaires de
// l'agence. Rien ne bloque le reste si une lecture échoue.

import { supabase } from '../core/supabase/client'
import { toutesOperations } from '../modules/chantier/comptes-rendus/horsLigne/synchro'
import { BAIL_MS } from '../shared/notion/synchroNotionLogique'
import { debutLecture, resumeConsommation } from './consommationIaLogique'

const absente = (error) => error && ['PGRST202', '42883', 'PGRST205', '42P01'].includes(error.code)

async function rpc(nom) {
  const { data, error } = await supabase.rpc(nom)
  if (absente(error)) return null
  if (error) throw error
  return data
}

// Nombre de lignes d'une table, null si elle n'existe pas (migration absente)
async function compter(table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  return error ? null : count ?? 0
}

/**
 * Le stockage total (fonction de la migration 039) et la part des crédits
 * API Claude du mois déjà utilisée, pour l'alerte de l'accueil.
 */
export async function stockageTotal() {
  const fichiers = await rpc('espace_stockage_utilise').catch(() => null)
  const base = await rpc('admin_base').catch(() => null)
  const appels = await consommationIa().catch(() => null)
  const credits = Array.isArray(appels) ? resumeConsommation(appels).part : null
  return { fichiers, base, credits }
}

/**
 * Les appels à Claude et à Mistral des périodes en cours et précédentes
 * (migration 083) ; null si la table n'existe pas encore.
 */
export async function consommationIa(maintenant = new Date()) {
  const depuis = debutLecture(maintenant).toISOString()
  const { data, error } = await supabase.from('ia_consommation')
    .select('cree_le, fonction, modele, usage').gte('cree_le', depuis).order('cree_le').limit(10000)
  if (absente(error)) return null
  if (error) throw error
  return data ?? []
}

/**
 * Tout ce que montre la page.
 * @returns { migration074, stockage, base, comptes, affaires, compteurs, notionEnAttente, envoisEnAttente, consommation }
 */
export async function chargerGestion() {
  const [stockage, base, comptes, affaires, compteurs, notion, operations, consommation] = await Promise.all([
    rpc('admin_stockage'),
    rpc('admin_base'),
    rpc('admin_comptes'),
    supabase.from('affaires').select('id, code_affaire, nom').then(({ data }) => (data ?? []).map((a) => ({ id: a.id, code: a.code_affaire, nom: a.nom }))),
    Promise.all(['affaires', 'comptes_rendus', 'cr_photos', 'affaire_plans', 'pieces_ecrites', 'profiles'].map(compter))
      .then(([affaires, visites, photos, plans, pieces, comptes]) => ({ affaires, visites, photos, plans, pieces, comptes })),
    // Échéances que l'app n'a pas réussi à envoyer à Notion : sans carte,
    // et plus anciennes que le bail d'un envoi en cours
    supabase.from('notion_echeances').select('id', { count: 'exact', head: true })
      .is('page_id', null).lt('updated_at', new Date(Date.now() - BAIL_MS).toISOString())
      .then(({ count, error }) => (error ? null : count ?? 0)),
    toutesOperations(),
    consommationIa().catch(() => undefined),
  ])
  return {
    migration074: stockage !== null && base !== null && comptes !== null,
    stockage: stockage ?? [],
    base,
    comptes: comptes ?? [],
    affaires,
    compteurs,
    notionEnAttente: notion,
    envoisEnAttente: operations.length,
    // null : migration 083 absente ; undefined : lecture ratée
    consommation,
  }
}
