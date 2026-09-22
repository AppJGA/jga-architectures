import { diffCollection, diffEstVide } from '../../../shared/planning/snapshotDiff'

export { diffEstVide }

// Colonnes réellement présentes en base. Les instantanés viennent d'un
// `select('*')`, mais on n'écrit que ce qui peut changer : inclure `created_at`
// ou un champ dérivé ferait échouer l'écriture entière.
export const COLONNES_TACHE = [
  'num_tache', 'nom', 'debut', 'duree', 'avancement',
  'lot_id', 'zone_id', 'depends_on', 'lag_days', 'ordre',
  'appro_actif', 'appro_duree', 'appro_materiau',
  'delai_apres', 'label_apres',
]

export const COLONNES_SEGMENT = [
  'tache_id', 'date_debut', 'duree_jours', 'zone_id', 'delai_appro', 'ordre',
  'nom', 'afficher_nom',
]

// Les liens de planning_dependances sont dans l'instantané : leur écart change
// quand on déplace une tâche liée, et la base les supprime avec leur tâche.
export const COLONNES_DEPENDANCE = [
  'source_tache_id', 'source_segment_id', 'cible_tache_id', 'cible_segment_id', 'lag_jours',
]

// Jalons : seule leur date entre dans l'historique (décalage du planning). Ils
// se créent, se renomment et se suppriment dans leur modale, hors historique :
// annuler ne doit ni les recréer ni les effacer, d'où les seules mises à jour.
export const COLONNES_JALON = ['date']

export function diffSnapshots(depuis, vers) {
  const jalons = depuis?.jalons && vers?.jalons
    ? diffCollection(depuis.jalons, vers.jalons, COLONNES_JALON)
    : { updates: [], deletions: [], insertions: [] }
  return {
    tasks: diffCollection(depuis?.tasks ?? [], vers?.tasks ?? [], COLONNES_TACHE),
    segments: diffCollection(depuis?.segments ?? [], vers?.segments ?? [], COLONNES_SEGMENT),
    dependances: diffCollection(depuis?.dependances ?? [], vers?.dependances ?? [], COLONNES_DEPENDANCE),
    jalons: { ...jalons, deletions: [], insertions: [] },
  }
}
