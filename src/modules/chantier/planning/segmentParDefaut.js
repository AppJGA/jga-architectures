// ─── Nouveau segment d'une tâche : où il se place ────────────────────────────
//
// Un segment ajouté d'un geste (roue d'une barre, ou bouton de la fiche de
// tâche) se pose à la suite de ce qui existe : le lendemain ouvré de la fin de
// la tâche, ou de son dernier segment s'il finit plus tard. Même durée que la
// tâche, même zone. Les fermetures bloquantes sont sautées, comme partout.

import { addWorkingDaysBlocked, dernierJourTache, formatDateISO, parseDate } from './types'

export function segmentParDefautTache(tache, segments = [], periodes = []) {
  const lendemainOuvre = (debut, duree) =>
    addWorkingDaysBlocked(dernierJourTache(debut, duree ?? 5, periodes), 1, periodes)

  let debut = lendemainOuvre(tache.debut, tache.duree)
  for (const seg of segments ?? []) {
    if (!seg?.date_debut) continue
    const apres = lendemainOuvre(seg.date_debut, seg.duree_jours)
    if (apres > debut) debut = apres
  }

  return {
    date_debut: formatDateISO(parseDate(debut)),
    duree_jours: Number(tache.duree) || 5,
    zone_id: tache.zone_id ?? null,
  }
}
