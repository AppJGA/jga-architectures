// ─── Jalons accrochés à une barre : ce qui est commun aux deux plannings ─────
//
// Un jalon peut être accroché au début ou à la fin d'une barre (migration 053) :
// tâche ou segment au chantier, phase ou segment à l'étude. Le calcul des dates
// est propre à chaque planning (jours ouvrés d'un côté, semaines de l'autre) :
// voir `chantier/planning/jalonsAncres.js` et `etude/planning/jalonsAncresEtude.js`.

const CLES_ANCRE = ['ancre_tache_id', 'ancre_phase_id', 'ancre_segment_id']

export function estAncre(jalon) {
  return CLES_ANCRE.some((c) => jalon?.[c] != null)
}

// Tant que la migration 053 n'est pas passée, les lignes lues par `select('*')`
// n'ont pas la colonne : accrocher échouerait côté base.
export function ancrageDisponible(jalons) {
  return (jalons ?? []).some((j) => 'ancre_bord' in j)
}

// La barre touchée en mode Accrocher : sa moitié gauche vise le début, sa
// moitié droite la fin. `rect` est celui de la barre à l'écran.
export function bordTouche(clientX, rect) {
  return clientX < rect.left + rect.width / 2 ? 'debut' : 'fin'
}
