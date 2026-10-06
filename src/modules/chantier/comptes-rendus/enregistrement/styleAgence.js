// ─── Guide de rédaction et exemples : lecture et écriture ────────────────────
//
// La forme se décide dans `styleAgenceLogique.js`. Ici, la base : le guide de
// l'agence (`agence_reglages`, migration 059) et les remarques des CR émis.
// Rien de ceci ne doit empêcher une analyse : un échec rend le guide de départ
// et aucun exemple.

import { supabase } from '../../../../core/supabase/client'
import { CLE_GUIDE, guideEffectif, choisirExemples } from './styleAgenceLogique'

/**
 * @returns { texte (null si l'agence n'a rien enregistré), disponible (la
 *   migration 059 est passée), modifieLe }
 */
export async function lireGuideAgence() {
  const { data, error } = await supabase.from('agence_reglages')
    .select('valeur, modifie_le').eq('cle', CLE_GUIDE).maybeSingle()
  if (error) return { texte: null, disponible: false, modifieLe: null }
  return { texte: data?.valeur ?? null, disponible: true, modifieLe: data?.modifie_le ?? null }
}

/** Un texte vide revient au guide de départ (la ligne est retirée). */
export async function enregistrerGuideAgence(texte) {
  const valeur = String(texte ?? '').trim()
  const { error } = valeur
    ? await supabase.from('agence_reglages').upsert({ cle: CLE_GUIDE, valeur }, { onConflict: 'cle' })
    : await supabase.from('agence_reglages').delete().eq('cle', CLE_GUIDE)
  if (error) throw error
}

// Assez pour trouver 40 exemples après tri, sans lire toute l'histoire
const REMARQUES_LUES = 800

async function chargerExemples({ affaireId, crId, lots }) {
  const [{ data: remarques, error }, { data: exterieurs }] = await Promise.all([
    supabase.from('cr_remarques')
      .select('description, lot_id, interlocuteur_id, copie_destinataire, suivi_id, created_by, cr_id, affaire_id, a_valider, lots(nom), comptes_rendus!inner(statut, affaire_id)')
      .eq('comptes_rendus.statut', 'emis')
      .order('created_at', { ascending: false })
      .limit(REMARQUES_LUES),
    supabase.from('profiles').select('id').eq('type_compte', 'exterieur'),
  ])
  if (error) {
    console.warn('Exemples de rédaction :', error.message)
    return []
  }
  return choisirExemples({
    affaireId, crId, lots,
    auteursExterieurs: (exterieurs ?? []).map((p) => p.id),
    remarques: (remarques ?? []).map((r) => ({ ...r, lot_nom: r.lots?.nom ?? null, cr_affaire_id: r.comptes_rendus?.affaire_id ?? r.affaire_id })),
  })
}

/** Guide et exemples pour une analyse. */
export async function styleAgencePour({ affaireId, crId, lots = [] }) {
  const [guide, exemples] = await Promise.all([
    lireGuideAgence().then((g) => guideEffectif(g.texte)).catch(() => guideEffectif(null)),
    chargerExemples({ affaireId, crId, lots }).catch(() => []),
  ])
  return { guide, exemples }
}
