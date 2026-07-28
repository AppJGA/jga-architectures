import { diffCollection, diffEstVide } from '../../../shared/planning/snapshotDiff'

export { diffEstVide }

// Colonnes de `planning_etude_phases` après les migrations 011/033 :
// `num_tache`, `intervenants` et `avancement` ont été supprimées, `importance`,
// les trois durées MOE et `couleur_custom` ajoutées.
export const COLONNES_PHASE = [
  'nom', 'type_tache', 'semaine_debut', 'annee_debut', 'duree_semaines',
  'label_barre', 'importance', 'duree_arch', 'duree_bet', 'duree_econ',
  'couleur_custom', 'depends_on', 'lag_semaines', 'ordre',
]

export const COLONNES_SEGMENT_ETUDE = [
  'phase_id', 'nom', 'semaine_debut', 'annee_debut', 'duree_semaines', 'ordre',
]

// Les phases venues de Notion n'existent pas en base : elles n'ont pas d'`id`
// et ne doivent jamais entrer dans un instantané, sous peine de provoquer une
// insertion sans identifiant.
export const estPhasePersistee = (p) => p?.id != null

export function diffSnapshotsEtude(depuis, vers) {
  const phases = (s) => (s?.phases ?? []).filter(estPhasePersistee)
  return {
    phases: diffCollection(phases(depuis), phases(vers), COLONNES_PHASE),
    segments: diffCollection(depuis?.segments ?? [], vers?.segments ?? [], COLONNES_SEGMENT_ETUDE),
  }
}
