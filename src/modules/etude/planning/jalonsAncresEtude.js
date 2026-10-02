// ─── Jalons accrochés : semaines au planning d'étude ────────────────────────
//
// Même principe qu'au chantier (`chantier/planning/jalonsAncres.js`), à la
// semaine ISO. Une phase coupée par une fermeture finit sur sa dernière semaine
// travaillée, comme sa barre ; un segment se dessine d'un seul bloc.

import { addWeeks, computePhaseFragments } from './types'

function bornes(jalon, { phases = [], segments = [], periodes = [] }) {
  if (jalon?.ancre_segment_id != null) {
    const seg = segments.find((s) => s.id === jalon.ancre_segment_id)
    if (!seg?.semaine_debut) return null
    return {
      debut: { semaine: seg.semaine_debut, annee: seg.annee_debut },
      fin: addWeeks(seg.semaine_debut, seg.annee_debut, Math.max(1, Number(seg.duree_semaines) || 1) - 1),
    }
  }
  if (jalon?.ancre_phase_id != null) {
    const phase = phases.find((p) => p.id === jalon.ancre_phase_id)
    if (!phase?.semaine_debut) return null
    const fragments = computePhaseFragments(phase, periodes)
    const premier = fragments[0]
    const dernier = fragments[fragments.length - 1]
    return {
      debut: { semaine: premier.semaine_debut, annee: premier.annee_debut },
      fin: addWeeks(dernier.semaine_debut, dernier.annee_debut, dernier.duree_semaines - 1),
    }
  }
  return null
}

/** { semaine, annee } que l'ancre impose au jalon, ou null (libre, ou barre disparue). */
export function semaineAncre(jalon, contexte = {}) {
  const b = bornes(jalon, contexte)
  if (!b) return null
  const { semaine, annee } = jalon.ancre_bord === 'fin' ? b.fin : b.debut
  return { semaine, annee }
}

/** Jalons accrochés dont la semaine stockée n'est plus celle de leur ancre. */
export function jalonsARecalerEtude(jalons, contexte) {
  return (jalons ?? []).flatMap((j) => {
    const s = semaineAncre(j, contexte)
    return s && (s.semaine !== j.semaine || s.annee !== j.annee) ? [{ id: j.id, ...s }] : []
  })
}

export function champsAccrocheEtude(cible, bord) {
  return {
    ancre_phase_id: cible.type === 'phase' ? cible.id : null,
    ancre_segment_id: cible.type === 'segment' ? cible.id : null,
    ancre_bord: bord,
  }
}

// `ancre_bord` est gardé : détaché, le jalon reste dessiné au même endroit
export const CHAMPS_DETACHE_ETUDE = { ancre_phase_id: null, ancre_segment_id: null }
