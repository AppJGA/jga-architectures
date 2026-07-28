// ─── Ordre d'affichage des zones ─────────────────────────────────────────────
//
// Logique pure, séparée du hook pour être vérifiable hors React.

// `ordre` fait foi ; à égalité — zones créées avant l'existence de la colonne,
// ou numéros dupliqués après une suppression — on départage par date de
// création, pour que l'ordre reste stable d'un chargement à l'autre plutôt que
// de dépendre de ce que renvoie Postgres.
export function trierZones(liste) {
  return [...liste].sort((a, b) => {
    const oa = a.ordre ?? 0
    const ob = b.ordre ?? 0
    if (oa !== ob) return oa - ob
    return new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
  })
}

// Deux zones partageant le même `ordre` rendent le tri ambigu : leur position
// relative peut changer d'un chargement à l'autre. On ne renumérote qu'en
// présence d'une telle ambiguïté — un simple trou dans la numérotation
// (0, 1, 3 après une suppression) trie parfaitement et ne justifie pas
// d'écrire en base à chaque ouverture du planning.
export function ordresAmbigus(zones) {
  const vus = new Set()
  return zones.some((z) => {
    const o = z.ordre ?? null
    if (o === null || vus.has(o)) return true
    vus.add(o)
    return false
  })
}

// Nouvel ordre après un glisser-déposer : la zone déplacée prend la place de
// la cible. Vers le bas elle se pose après elle, vers le haut avant — c'est la
// lecture naturelle du trait d'insertion affiché pendant le glissement.
export function reordonner(zones, draggedId, targetId) {
  if (draggedId == null || draggedId === targetId) return null
  const liste = [...zones]
  const from = liste.findIndex((z) => z.id === draggedId)
  const to = liste.findIndex((z) => z.id === targetId)
  if (from === -1 || to === -1) return null
  const [deplacee] = liste.splice(from, 1)
  liste.splice(to, 0, deplacee)
  return liste
}
