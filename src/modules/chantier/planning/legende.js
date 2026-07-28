// ─── Légende des couleurs de barres ──────────────────────────────────────────
//
// Deux réglages distincts pilotent l'affichage du planning :
//   · groupMode : l'organisation des lignes (par lot ou par zone) ;
//   · colorMode : la couleur des barres (couleur du lot ou de la zone).
//
// La légende doit expliquer ce qu'on VOIT, donc les couleurs — c'est-à-dire
// `colorMode`. Le groupement, lui, s'annonce déjà tout seul : chaque en-tête de
// groupe porte son nom et sa couleur dans le tableau.
//
// D'où la règle appliquée ici : on n'énumère les couleurs que lorsqu'elles ne
// sont pas déjà expliquées par les en-têtes de groupe —
//   · colorMode 'zone'                     → liste des zones ;
//   · colorMode 'lot' et groupMode 'zone'  → liste des lots (les en-têtes
//     annoncent les zones, la couleur des barres vient d'ailleurs) ;
//   · colorMode 'lot' et groupMode 'lot'   → rien à ajouter, l'export classique
//     reste inchangé.

const GRIS_SANS_ZONE = '#C9C4C0'

// `#C9C4C0` → `C9C4C0` (Excel n'accepte pas le dièse)
export const sansDiese = (hex) => (hex ?? '').replace('#', '')

export function legendeCouleurs({
  tasks = [], lots = [], zones = [],
  colorMode = 'lot', groupMode = 'lot',
} = {}) {
  const note = groupMode === 'zone' ? 'Tâches groupées par zone' : null

  if (colorMode === 'zone') {
    const entrees = [...zones]
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
      .map((z) => ({ couleur: z.couleur ?? GRIS_SANS_ZONE, label: z.nom || 'Zone sans nom' }))

    // « Sans zone » n'a de sens que si une barre porte effectivement ce gris —
    // l'ajouter systématiquement décrirait une couleur absente de la page.
    // Une tâche rattachée à une zone supprimée retombe aussi sur ce gris
    // (cf. getBarColor), d'où la vérification de l'existence de la zone.
    const connues = new Set(zones.map((z) => z.id))
    if (tasks.some((t) => t.zone_id == null || !connues.has(t.zone_id))) {
      entrees.push({ couleur: GRIS_SANS_ZONE, label: 'Sans zone' })
    }

    return { titre: 'Zones', entrees, note }
  }

  if (groupMode === 'zone') {
    // Seuls les lots réellement portés par une tâche : un lot vide ne colore
    // aucune barre et n'a rien à faire dans la légende.
    const utilises = [...lots]
      .filter((l) => tasks.some((t) => t.lot_id === l.id))
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
      .map((l) => ({
        couleur: l.couleur ?? '#94a3b8',
        label: `${l.num_lot ?? ''} ${l.nom ?? ''}`.trim() || 'Lot sans nom',
      }))
    if (tasks.some((t) => t.lot_id == null)) {
      utilises.push({ couleur: '#94a3b8', label: 'Sans lot' })
    }
    return { titre: 'Lots', entrees: utilises, note }
  }

  return { titre: null, entrees: [], note }
}
