// ─── Jalons accrochés : dates au planning chantier ──────────────────────────
//
// La date d'un jalon accroché reste stockée (exports, page de l'affaire, import
// la lisent telle quelle) ; elle se recale sur son ancre chaque fois que la
// barre bouge. La fin est celle que dessine la barre : dernier jour ouvré,
// fermetures bloquantes comprises.

import { dernierJourTache, formatDateISO, parseDate } from './types'

// Bornes de la barre visée : un segment prime sur sa tâche
function barreAncre(jalon, { tasks = [], segments = [] }) {
  if (jalon?.ancre_segment_id != null) {
    const seg = segments.find((s) => s.id === jalon.ancre_segment_id)
    return seg ? { debut: seg.date_debut, duree: seg.duree_jours } : null
  }
  if (jalon?.ancre_tache_id != null) {
    const tache = tasks.find((t) => t.id === jalon.ancre_tache_id)
    return tache ? { debut: tache.debut, duree: tache.duree } : null
  }
  return null
}

/** Date 'YYYY-MM-DD' que l'ancre impose au jalon, ou null (libre, ou barre disparue). */
export function dateAncre(jalon, { tasks = [], segments = [], periodes = [] } = {}) {
  const barre = barreAncre(jalon, { tasks, segments })
  if (!barre?.debut) return null
  return jalon.ancre_bord === 'fin'
    ? formatDateISO(dernierJourTache(barre.debut, barre.duree, periodes))
    : formatDateISO(parseDate(barre.debut))
}

/** Jalons accrochés dont la date stockée n'est plus celle de leur ancre. */
export function jalonsARecaler(jalons, contexte) {
  return (jalons ?? []).flatMap((j) => {
    const date = dateAncre(j, contexte)
    return date && date !== j.date ? [{ id: j.id, date }] : []
  })
}

export function champsAccroche(cible, bord) {
  return {
    ancre_tache_id: cible.type === 'task' ? cible.id : null,
    ancre_segment_id: cible.type === 'segment' ? cible.id : null,
    ancre_bord: bord,
  }
}

// `ancre_bord` est gardé : un jalon détaché de la fin d'une barre reste dessiné
// au bord droit de son jour, il ne saute pas d'une colonne.
export const CHAMPS_DETACHE = { ancre_tache_id: null, ancre_segment_id: null }
