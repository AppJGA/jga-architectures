// Période couverte par l'export PDF du planning d'étude.
//
// Hors du composant pour être testée : c'est elle qui décide quelles phases et
// quels segments figurent sur la page.

import { addWeeks, weeksBetween, getCurrentWeek, finEffectivePhase } from './types'

// Fin exclusive d'un élément : fin effective pour une phase (semaines bloquées
// déduites, comme à l'écran), début + durée pour un segment, qui n'est pas
// découpé par les périodes.
const finPhase = (t, periodes) => finEffectivePhase(t, periodes)
const finSegment = (sg) => addWeeks(sg.semaine_debut, sg.annee_debut, Math.max(1, Number(sg.duree_semaines) || 1))

/**
 * Période proposée par défaut : une semaine de marge avant le premier début et
 * après la dernière fin, segments compris.
 */
export function calculerPeriodeExport(taches = [], segments = [], periodes = []) {
  const elements = [
    ...taches.filter((t) => t?.semaine_debut && t?.annee_debut)
      .map((t) => ({ debut: { semaine: t.semaine_debut, annee: t.annee_debut }, fin: finPhase(t, periodes) })),
    ...segments.filter((sg) => sg?.semaine_debut && sg?.annee_debut)
      .map((sg) => ({ debut: { semaine: sg.semaine_debut, annee: sg.annee_debut }, fin: finSegment(sg) })),
  ]

  if (elements.length === 0) {
    const cw = getCurrentWeek()
    const end = addWeeks(cw.semaine, cw.annee, 12)
    return { semDebut: cw.semaine, anneeDebut: cw.annee, semFin: end.semaine, anneeFin: end.annee }
  }

  let min = elements[0].debut
  let max = elements[0].fin
  elements.forEach(({ debut, fin }) => {
    if (weeksBetween(debut.semaine, debut.annee, min.semaine, min.annee) > 0) min = debut
    if (weeksBetween(max.semaine, max.annee, fin.semaine, fin.annee) > 0) max = fin
  })
  const start = addWeeks(min.semaine, min.annee, -1)
  const fin = addWeeks(max.semaine, max.annee, 1)
  return { semDebut: start.semaine, anneeDebut: start.annee, semFin: fin.semaine, anneeFin: fin.annee }
}

// Un élément figure sur l'export s'il recoupe la période, bornes incluses
function recoupe(debut, finExclusive, periodeDebut, periodeFin) {
  return weeksBetween(debut.semaine, debut.annee, periodeFin.semaine, periodeFin.annee) >= 0
    && weeksBetween(periodeDebut.semaine, periodeDebut.annee, finExclusive.semaine, finExclusive.annee) > 0
}

export function phasesDansPeriode(taches = [], periodes = [], periodeDebut, periodeFin) {
  return taches.filter((t) => recoupe(
    { semaine: t.semaine_debut, annee: t.annee_debut }, finPhase(t, periodes), periodeDebut, periodeFin
  ))
}

export function segmentsDansPeriode(segments = [], periodeDebut, periodeFin) {
  return segments.filter((sg) => recoupe(
    { semaine: sg.semaine_debut, annee: sg.annee_debut }, finSegment(sg), periodeDebut, periodeFin
  ))
}
