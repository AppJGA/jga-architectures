// ─── Légende des couleurs de barres ──────────────────────────────────────────
//
// La légende des exports (PDF et Excel) reprend celle qu'on voit sous le
// planning à l'écran (`GanttChart.jsx`), pour qu'on retrouve sur papier ce
// qu'on connaît :
//   · couleur par lot  → tous les lots, « num – nom » ;
//   · couleur par zone → toutes les zones dans leur ordre, puis « Sans zone ».
// Le groupement (par lot ou par zone) ne change pas la liste : il ne fait
// qu'ajouter une note.

import { trierZones } from '../../../shared/hooks/ordreZones'

const GRIS_SANS_ZONE = '#C9C4C0'

// `#C9C4C0` → `C9C4C0` (Excel n'accepte pas le dièse)
export const sansDiese = (hex) => (hex ?? '').replace('#', '')

export function legendeCouleurs({
  lots = [], zones = [],
  colorMode = 'lot', groupMode = 'lot',
} = {}) {
  const note = groupMode === 'zone' ? 'Tâches groupées par zone' : null

  if (colorMode === 'zone') {
    const entrees = trierZones(zones)
      .map((z) => ({ couleur: z.couleur ?? GRIS_SANS_ZONE, label: z.nom || 'Zone sans nom' }))
    entrees.push({ couleur: GRIS_SANS_ZONE, label: 'Sans zone' })
    return { titre: 'Zones', entrees, note }
  }

  const entrees = [...lots]
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map((l) => ({
      couleur: l.couleur ?? '#94a3b8',
      label: [l.num_lot, l.nom].filter(Boolean).join(' – ') || 'Lot sans nom',
    }))
  return { titre: entrees.length ? 'Lots' : null, entrees, note }
}
