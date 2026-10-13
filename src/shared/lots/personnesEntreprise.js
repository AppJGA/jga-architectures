// Personnes d'une entreprise proposées pour un lot : la principale en tête,
// puis l'ordre alphabétique (sans accents ni majuscules), pour qu'un menu
// long reste lisible.
const cle = (p) => `${p.nom ?? ''} ${p.prenom ?? ''}`.trim().toLowerCase()

export function ordonnerPersonnes(personnes) {
  return [...(personnes ?? [])].sort((a, b) => {
    if (!!a.est_principal !== !!b.est_principal) return a.est_principal ? -1 : 1
    return cle(a).localeCompare(cle(b), 'fr', { sensitivity: 'base' })
  })
}

export function libellePersonne(p) {
  const nom = [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'
  return p.fonction ? `${nom} · ${p.fonction}` : nom
}
