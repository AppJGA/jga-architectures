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
  const [[affaires, collaborateurs], jalonsChantier, jalonsEtude, profils] = await Promise.all([
    affairesEtCollaborateurs(),
    // Toutes les colonnes : ancres (053) et `fixe_direction` (070) peuvent manquer
    supabase.from('planning_jalons').select('*'),
    supabase.from('planning_etude_jalons').select('*'),
    // Les initiales de l'équipe ; `est_associe` (067) pour en retirer les associés
    supabase.from('profiles').select('*').eq('type_compte', 'agence'),
  ])
  return {
    affaires: verifier(affaires), collaborateurs: verifier(collaborateurs),
    jalonsChantier: verifier(jalonsChantier), jalonsEtude: verifier(jalonsEtude), profils: verifier(profils),
  }
}

// ─── Jalons posés depuis le calendrier (migration 070) ───────────────────────
//
// Ils vont dans le planning de l'affaire, d'étude (à la semaine) ou de
// chantier (au jour), où l'équipe les retrouve. Les associés y écrivent même
// sans être collaborateurs de l'affaire : la 070 leur ouvre les jalons, et
// seulement eux.

const TABLE_JALONS = { etude: 'planning_etude_jalons', chantier: 'planning_jalons' }

// Sans la migration 070, pas de colonne `fixe_direction` : le jalon part sans
const colonneAbsente = (error) => /fixe_direction/.test(error?.message ?? '') && ['PGRST204', '42703'].includes(error?.code)

async function ecrireJalon(requete, champs) {
  let reponse = await requete(champs)
  if (colonneAbsente(reponse.error)) {
    const sans = { ...champs }
    delete sans.fixe_direction
    reponse = await requete(sans)
  }
  if (reponse.error) throw reponse.error
  return reponse.data
}

/** `champs` : { libelle, couleur, date } — à l'étude, la semaine de la date. */
const champsJalon = (origine, { libelle, couleur, date, semaineAnnee }) => ({
  label: libelle, couleur,
  ...(origine === 'etude' ? { semaine: semaineAnnee.semaine, annee: semaineAnnee.annee } : { date }),
})

export async function creerJalon(affaireId, origine, valeurs) {
  return ecrireJalon(
    (champs) => supabase.from(TABLE_JALONS[origine]).insert(champs).select().single(),
    { affaire_id: affaireId, ordre: 0, fixe_direction: true, ...champsJalon(origine, valeurs) },
  )
}

/** Un jalon accroché à une barre garde sa date : elle suit la barre. */
export async function modifierJalon(evenement, valeurs) {
  const champs = champsJalon(evenement.origine, valeurs)
  if (evenement.ancre) { delete champs.date; delete champs.semaine; delete champs.annee }
  return ecrireJalon(
    (c) => supabase.from(TABLE_JALONS[evenement.origine]).update(c).eq('id', evenement.jalonId).select().single(),
    champs,
  )
}

// Une suppression refusée par les règles ne rend pas d'erreur : elle ne touche
// aucune ligne. On compte les lignes pour ne pas laisser croire qu'elle a eu lieu.
export async function supprimerJalon(evenement) {
  const { data, error } = await supabase.from(TABLE_JALONS[evenement.origine]).delete().eq('id', evenement.jalonId).select('id')
  if (error) throw error
  if (!data?.length) throw Object.assign(new Error('Aucun jalon supprimé'), { code: 'PGRST116' })
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
