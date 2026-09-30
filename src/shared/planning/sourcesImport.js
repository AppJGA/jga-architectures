// ─── Quelles affaires peuvent servir de source à un import ? ─────────────────
//
// Commun aux deux plannings : seule la table qui porte les lignes change
// (`planning` au chantier, `planning_etude_phases` à l'étude).
//
// On lit `affaires` sans détour : les plannings sont réservés à l'agence
// (migration 050), et un compte agence lit la table entière. Un extérieur
// n'atteint jamais cet écran.

import { supabase } from '../../core/supabase/client'

/**
 * @param table          'planning' ou 'planning_etude_phases'
 * @param affaireExclue  l'affaire d'accueil, qui ne s'importe pas elle-même
 * @returns { data: { affaires, sources: Map<affaire_id, nombre> } } | { error }
 */
export async function listerAffairesSources(table, affaireExclue) {
  const [lignes, affaires] = await Promise.all([
    supabase.from(table).select('affaire_id').neq('affaire_id', affaireExclue),
    supabase.from('affaires').select('id, nom, code_affaire').order('code_affaire'),
  ])
  const erreur = lignes.error ?? affaires.error
  if (erreur) return { error: erreur }

  const sources = new Map()
  for (const { affaire_id } of lignes.data ?? []) {
    sources.set(affaire_id, (sources.get(affaire_id) ?? 0) + 1)
  }
  return { data: { affaires: affaires.data ?? [], sources } }
}
