// ─── Différence entre deux instantanés ───────────────────────────────────────
//
// Logique commune aux plannings chantier et étude : ce qu'il faut écrire en
// base pour passer d'un état à un autre. Utilisée dans les deux sens — annuler
// et rétablir n'ont besoin que d'inverser les arguments.
//
// Les listes de colonnes, elles, sont propres à chaque module : voir
// `chantier/planning/snapshotDiff.js` et `etude/planning/snapshotDiffEtude.js`.

function extraire(objet, colonnes) {
  const sortie = {}
  for (const c of colonnes) if (c in objet) sortie[c] = objet[c]
  return sortie
}

function aChange(avant, apres, colonnes) {
  return colonnes.some((c) => (avant[c] ?? null) !== (apres[c] ?? null))
}

export function diffCollection(depuis, vers, colonnes) {
  const parId = (liste) => new Map(liste.map((e) => [e.id, e]))
  const avant = parId(depuis)
  const apres = parId(vers)

  // Présentes des deux côtés mais différentes → mise à jour
  const updates = vers
    .filter((e) => avant.has(e.id) && aChange(avant.get(e.id), e, colonnes))
    .map((e) => ({ id: e.id, changes: extraire(e, colonnes) }))

  // Présentes seulement dans l'état de départ → à supprimer
  const deletions = depuis.filter((e) => !apres.has(e.id)).map((e) => e.id)

  // Présentes seulement dans l'état d'arrivée → à recréer, identifiant compris
  // pour que les liens qui les visent (segments, dépendances) restent valides.
  const insertions = vers
    .filter((e) => !avant.has(e.id))
    .map((e) => ({ id: e.id, affaire_id: e.affaire_id, ...extraire(e, colonnes) }))

  return { updates, deletions, insertions }
}

// Un instantané sans écart n'a rien à écrire : utile pour ne pas déclencher
// d'aller-retour réseau quand un geste s'est soldé par un retour à l'identique.
export function diffEstVide(diff) {
  return Object.values(diff).every(
    (d) => d.updates.length === 0 && d.deletions.length === 0 && d.insertions.length === 0
  )
}
