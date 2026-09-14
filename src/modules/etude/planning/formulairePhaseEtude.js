// Traduction du formulaire de la modale de phase en écriture.
//
// Hors du composant pour être testée : c'est ici que se décide ce que la modale
// renvoie, donc ce qu'elle peut écraser.

import { normaliserSemaine } from './types'

export function construirePayloadPhase(form) {
  const isMoe = form.type_tache === 'etude'
  const debut = normaliserSemaine(form.semaine_debut, form.annee_debut)
  const sousDuree = (v) => (isMoe && v !== '' && v != null ? Number(v) : null)
  return {
    nom:            (form.nom ?? '').trim(),
    type_tache:     form.type_tache,
    // importance : uniquement 'moe'/'moa' tant que la migration 013 n'est pas appliquée
    importance:     isMoe ? 'moe' : 'moa',
    semaine_debut:  debut.semaine,
    annee_debut:    debut.annee,
    duree_semaines: Math.max(1, Number(form.duree_semaines) || 1),
    duree_arch:     sousDuree(form.duree_arch),
    duree_bet:      sousDuree(form.duree_bet),
    duree_econ:     sousDuree(form.duree_econ),
    label_barre:    form.type_tache === 'administratif' ? (form.label_barre || null) : null,
    couleur_custom: form.couleur_custom || null,
    depends_on:     form.depends_on ?? null,
    lag_semaines:   form.depends_on ? Number(form.lag_semaines ?? 0) : 0,
  }
}

/**
 * Champs réellement modifiés dans la modale, comparés à ses valeurs d'ouverture.
 *
 * La modale est flottante : la phase peut être glissée, liée ou réordonnée
 * pendant qu'elle est ouverte. Renvoyer tout le formulaire rétablirait les
 * valeurs d'ouverture et annulerait ces modifications.
 *
 * Battement : avec un nouveau prédécesseur, il n'est envoyé que s'il diffère de
 * celui que la modale a proposé au choix du parent — c'est alors une saisie,
 * qui replace la phase. Sinon il est recalculé depuis la position de la phase.
 *
 * @param battementPropose battement proposé au dernier choix de parent (ou null)
 */
export function champsModifiesPhase(ouverture, courant, battementPropose = null) {
  const changes = {}
  Object.keys(courant).forEach((cle) => {
    if (cle === 'lag_semaines') return
    if ((ouverture[cle] ?? null) !== (courant[cle] ?? null)) changes[cle] = courant[cle]
  })

  const lienChange = (ouverture.depends_on ?? null) !== (courant.depends_on ?? null)
  if (lienChange) {
    if (courant.depends_on == null) changes.lag_semaines = 0
    else if (battementPropose != null && courant.lag_semaines !== battementPropose) {
      changes.lag_semaines = courant.lag_semaines
    }
  } else if (ouverture.lag_semaines !== courant.lag_semaines) {
    changes.lag_semaines = courant.lag_semaines
  }
  return changes
}
