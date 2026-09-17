// ─── Nouveau segment d'une phase d'étude : où il se place ────────────────────
//
// À la suite de la phase, ou de son dernier segment s'il finit plus tard ; deux
// semaines par défaut. Même règle depuis la roue d'une barre et depuis la
// fiche de la phase.

import { addWeeks, weeksBetween } from './types'

export const DUREE_SEGMENT_ETUDE = 2

export function segmentParDefautPhase(phase, segments = []) {
  let debut = addWeeks(phase.semaine_debut, phase.annee_debut, Number(phase.duree_semaines) || 1)
  for (const seg of segments ?? []) {
    const fin = addWeeks(seg.semaine_debut, seg.annee_debut, seg.duree_semaines)
    if (weeksBetween(debut.semaine, debut.annee, fin.semaine, fin.annee) > 0) debut = fin
  }
  return {
    semaine_debut: debut.semaine,
    annee_debut: debut.annee,
    duree_semaines: DUREE_SEGMENT_ETUDE,
  }
}
