// ─── Différence entre deux instantanés du planning ───────────────────────────
//
// Logique pure : ce qu'il faut écrire en base pour passer de l'état `depuis` à
// l'état `vers`. Utilisée aussi bien pour annuler que pour rétablir — les deux
// sens n'ont besoin que d'inverser les arguments.

// Colonnes réellement présentes en base. Les instantanés viennent d'un
// `select('*')`, mais on n'écrit que ce qui peut changer : inclure `created_at`
// ou un champ dérivé ferait échouer l'écriture entière.
export const COLONNES_TACHE = [
  'num_tache', 'nom', 'debut', 'duree', 'avancement',
  'lot_id', 'zone_id', 'depends_on', 'lag_days', 'ordre',
  'appro_actif', 'appro_duree', 'appro_materiau',
  'delai_apres', 'label_apres',
]

export const COLONNES_SEGMENT = [
  'tache_id', 'date_debut', 'duree_jours', 'zone_id', 'delai_appro', 'ordre',
]

function extraire(objet, colonnes) {
  const sortie = {}
  for (const c of colonnes) if (c in objet) sortie[c] = objet[c]
  return sortie
}

function aChange(avant, apres, colonnes) {
  return colonnes.some((c) => (avant[c] ?? null) !== (apres[c] ?? null))
}

function diffCollection(depuis, vers, colonnes) {
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

export function diffSnapshots(depuis, vers) {
  return {
    tasks: diffCollection(depuis?.tasks ?? [], vers?.tasks ?? [], COLONNES_TACHE),
    segments: diffCollection(depuis?.segments ?? [], vers?.segments ?? [], COLONNES_SEGMENT),
  }
}

// Un instantané sans écart n'a rien à écrire : utile pour ne pas déclencher
// d'aller-retour réseau quand un geste s'est soldé par un retour à l'identique.
export function diffEstVide(diff) {
  return [diff.tasks, diff.segments].every(
    (d) => d.updates.length === 0 && d.deletions.length === 0 && d.insertions.length === 0
  )
}
