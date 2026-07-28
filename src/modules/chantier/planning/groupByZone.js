// ─── Lignes d'affichage en groupement "Par zone" ──────────────────────────────
//
// Une tâche peut apparaître sur plusieurs lignes en mode zone : une ligne
// « principale » dans son propre groupe de zone (barre + ses segments non
// zonés/zonés-ici), et une ligne « dupliquée » (segments seulement, pas de
// barre principale) dans chaque autre zone où l'un de ses segments est placé.
//
// Note : contrairement au comportement « Par lot » (calculé directement par
// GanttSidebar/GanttTimeline à partir de `tasks`+`lots`), ce mode précalcule
// un tableau `rows` consommé tel quel par les deux composants — voir leur
// prop `rows` (`null` = comportement par lot inchangé).
export function buildRowsByZone(tasks, zones, segments) {
  const rows = []

  // ── Groupe « Sans zone » en premier — tâches sans zone_id ──────────────────
  // (leurs segments zonés apparaîtront en ligne dupliquée dans leur zone respective)
  const tachesSansZone = tasks.filter((t) => t.zone_id == null)

  if (tachesSansZone.length > 0) {
    rows.push({
      type: 'header-zone',
      id: 'header-sans-zone',
      zoneId: null,
      displayName: 'Sans zone',
      couleur: '#C9C4C0',
    })
    tachesSansZone.forEach((task, idx) => {
      rows.push({
        type: 'task-row',
        id: `task-${task.id}-no-zone`,
        task,
        zoneId: null,
        lotId: task.lot_id,
        showMainBar: true,
        visibleSegmentIds: segments
          .filter((s) => s.tache_id === task.id && !s.zone_id)
          .map((s) => s.id),
        displayName: task.nom,
        numero: String(idx + 1).padStart(2, '0'),
      })
    })
  }

  // ── Un groupe par zone ──────────────────────────────────────────────────────
  zones.forEach((zone) => {
    const rowsDeZone = []
    let numeroIdx = 0

    tasks.forEach((task) => {
      const taskInZone = task.zone_id === zone.id
      const segsInZone = segments.filter((s) => s.tache_id === task.id && s.zone_id === zone.id)

      if (!taskInZone && segsInZone.length === 0) return
      numeroIdx++

      if (taskInZone) {
        // Ligne principale : barre tâche + ses segments de cette zone ou non zonés
        const segsVisibles = segments
          .filter((s) => s.tache_id === task.id && (s.zone_id === zone.id || !s.zone_id))
          .map((s) => s.id)

        rowsDeZone.push({
          type: 'task-row',
          id: `task-${task.id}-zone-${zone.id}`,
          task,
          zoneId: zone.id,
          lotId: task.lot_id,
          showMainBar: true,
          visibleSegmentIds: segsVisibles,
          displayName: task.nom,
          numero: String(numeroIdx).padStart(2, '0'),
        })
      } else {
        // Ligne dupliquée : uniquement les segments de cette tâche placés dans cette
        // zone (pas de barre principale, déjà affichée ailleurs — Sans zone ou sa
        // propre zone). Nom affiché = nom propre du 1er segment sinon nom de la tâche.
        const nomAffiche = segsInZone[0]?.nom ?? task.nom

        rowsDeZone.push({
          type: 'task-row',
          id: `task-${task.id}-seg-zone-${zone.id}`,
          task,
          zoneId: zone.id,
          lotId: task.lot_id,
          showMainBar: false,
          visibleSegmentIds: segsInZone.map((s) => s.id),
          displayName: nomAffiche,
          numero: String(numeroIdx).padStart(2, '0'),
        })
      }
    })

    if (rowsDeZone.length === 0) return

    rows.push({
      type: 'header-zone',
      id: `header-zone-${zone.id}`,
      zoneId: zone.id,
      displayName: zone.nom,
      couleur: zone.couleur,
    })
    rows.push(...rowsDeZone)
  })

  return rows
}
