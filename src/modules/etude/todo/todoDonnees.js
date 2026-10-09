// ─── To-do list : lectures et écritures (migration 066) ─────────────────────
//
// Ce que l'écran affiche se calcule dans `todoLogique.js`. Chaque écriture
// rend la ligne enregistrée : l'écran la pose telle quelle, sans tout relire.
// Supabase ne lève pas d'exception : chaque erreur est relancée ici.

import { supabase } from '../../../core/supabase/client'

const absente = (error) => error?.code === 'PGRST205' || error?.code === '42P01'

function verifier({ data, error }) {
  if (error) throw error
  return data
}

/** @returns { disponible (migration 066 passée), modele, elements } */
export async function chargerTodo(affaireId) {
  const [modele, elements] = await Promise.all([
    supabase.from('todo_modele').select('*').order('ordre'),
    supabase.from('todo_elements').select('*').eq('affaire_id', affaireId),
  ])
  if (absente(modele.error) || absente(elements.error)) return { disponible: false, modele: [], elements: [] }
  return { disponible: true, modele: verifier(modele) ?? [], elements: verifier(elements) ?? [] }
}

/** Les comptes de l'agence : noms de « Fait par », personnes chargées à défaut de collaborateurs. */
export async function chargerProfilsAgence() {
  return verifier(await supabase.from('profiles').select('id, prenom, nom, type_compte').eq('type_compte', 'agence')) ?? []
}

/**
 * Coche, note ou « sans objet » d'un article. Un article type n'a de ligne
 * dans l'affaire qu'une fois touché : créée ici au premier geste, sur la clé
 * (affaire, article type) ; seules les colonnes envoyées changent.
 */
export async function enregistrerArticle(affaireId, article, champs) {
  if (article.source === 'modele') {
    return verifier(await supabase.from('todo_elements')
      .upsert({ affaire_id: affaireId, type: 'modele', modele_id: article.modeleId, liste: article.liste, groupe: article.groupe, ...champs }, { onConflict: 'affaire_id,modele_id' })
      .select().single())
  }
  return modifierElement(article.elementId, champs)
}

export async function modifierElement(id, champs) {
  return verifier(await supabase.from('todo_elements').update(champs).eq('id', id).select().single())
}

export async function supprimerElement(id) {
  verifier(await supabase.from('todo_elements').delete().eq('id', id))
}

/** Article propre à l'affaire. */
export async function ajouterArticle(affaireId, { liste, groupe, texte, ordre }) {
  return verifier(await supabase.from('todo_elements')
    .insert({ affaire_id: affaireId, type: 'article', liste, groupe, texte, ordre })
    .select().single())
}

export async function ajouterTache(affaireId, { texte, responsable_id = null, echeance = null }) {
  return verifier(await supabase.from('todo_elements')
    .insert({ affaire_id: affaireId, type: 'tache', texte, responsable_id, echeance })
    .select().single())
}

/** « Recommencer la vérification » du contenu des plans : les coches partent, notes et « sans objet » restent. */
export async function recommencerPlans(affaireId) {
  verifier(await supabase.from('todo_elements')
    .update({ fait_le: null, fait_par: null })
    .eq('affaire_id', affaireId).eq('liste', 'plans'))
}

// ─── Liste type de l'agence ──────────────────────────────────────────────────

export async function ajouterAuModele({ liste, groupe, texte, ordre }) {
  return verifier(await supabase.from('todo_modele').insert({ liste, groupe, texte, ordre }).select().single())
}

/** Renommer (`texte`) ou retirer (`supprime_le`) : une ligne de la liste type ne s'efface jamais. */
export async function modifierModele(id, champs) {
  return verifier(await supabase.from('todo_modele').update(champs).eq('id', id).select().single())
}

/** Nouvel ordre d'un groupe : `changements` = [{ id, ordre }], seulement les lignes qui bougent. */
export async function reordonnerModele(changements) {
  await Promise.all(changements.map(({ id, ordre }) => modifierModele(id, { ordre })))
}
