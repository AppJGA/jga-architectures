// ─── Couronne d'actions d'une barre de planning : où va chaque pétale ────────
//
// Les pétales se répartissent également autour de la barre, le premier à midi,
// dans le sens des aiguilles d'une montre. Les positions se calculent : ajouter
// une action ne demande pas de recaler les autres à la main.

export const RAYON_COURONNE = 94
export const TAILLE_PETALE = 64

/** Décalage (dx, dy) du centre de chaque pétale par rapport à la barre. */
export function positionsPetales(actions, rayon = RAYON_COURONNE) {
  const n = actions.length
  return actions.map((a, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    return { ...a, dx: Math.round(rayon * Math.cos(angle)), dy: Math.round(rayon * Math.sin(angle)) }
  })
}

/** Plus petit écart entre deux pétales voisins : il doit rester positif. */
export function ecartEntrePetales(n, rayon = RAYON_COURONNE, taille = TAILLE_PETALE) {
  return 2 * rayon * Math.sin(Math.PI / n) - taille
}
