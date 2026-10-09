// ─── Gestion d'agence : lectures et écritures ───────────────────────────────
//
// Les outils lisent ce que toute l'agence lit déjà (plannings, to-do list) :
// rien n'est recopié, le calendrier et le suivi sont donc toujours à jour.
// Supabase ne lève pas d'exception : chaque erreur est relancée ici.

import { supabase } from '../core/supabase/client'

function verifier({ data, error }) {
  if (error) throw error
  return data ?? []
}

const absente = (error) => error?.code === 'PGRST205' || error?.code === '42P01'

const affairesEtCollaborateurs = () => Promise.all([
  supabase.from('affaires').select('id, code_affaire, nom, phase').order('code_affaire'),
  supabase.from('affaire_collaborateurs').select('affaire_id, user_id, role'),
])

export async function chargerCalendrier() {
  const [[affaires, collaborateurs], jalonsChantier, jalonsEtude] = await Promise.all([
    affairesEtCollaborateurs(),
    supabase.from('planning_jalons').select('id, affaire_id, label, date, couleur'),
    supabase.from('planning_etude_jalons').select('id, affaire_id, label, semaine, annee, couleur'),
  ])
  return {
    affaires: verifier(affaires), collaborateurs: verifier(collaborateurs),
    jalonsChantier: verifier(jalonsChantier), jalonsEtude: verifier(jalonsEtude),
  }
}

/** @returns { disponible (migration 066 passée), affaires, collaborateurs, taches, profils } */
export async function chargerTaches() {
  const [[affaires, collaborateurs], taches, profils] = await Promise.all([
    affairesEtCollaborateurs(),
    supabase.from('todo_elements').select('*').eq('type', 'tache').is('fait_le', null),
    supabase.from('profiles').select('*').eq('type_compte', 'agence'),
  ])
  if (absente(taches.error)) return { disponible: false, affaires: [], collaborateurs: [], taches: [], profils: [] }
  return {
    disponible: true, affaires: verifier(affaires), collaborateurs: verifier(collaborateurs),
    taches: verifier(taches), profils: verifier(profils),
  }
}

export async function listerComptesAgence() {
  return verifier(await supabase.from('profiles').select('*').eq('type_compte', 'agence').order('nom'))
}

/** Seul un associé désigne ou retire un associé (migration 067, fonction en base). */
export async function designerAssocie(compte, valeur) {
  const { error } = await supabase.rpc('designer_associe', { compte, valeur })
  if (error) throw error
}
