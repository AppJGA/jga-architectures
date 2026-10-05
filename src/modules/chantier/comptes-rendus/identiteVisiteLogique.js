// ─── Numéro, date et rédacteur d'une visite ──────────────────────────────────
//
// Se modifient par le crayon du tableau de bord de la visite. La base refuse
// deux visites au même numéro dans une affaire (unique(affaire_id, numero)) ;
// on le dit avant d'envoyer, avec la visite qui le porte déjà.
// Pur (tests/identite-visite.test.js).

const dateCourte = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

/** Message d'erreur, ou null si le numéro convient. */
export function erreurNumero(saisie, autresVisites = [], crId = null) {
  const n = Number(saisie)
  if (String(saisie ?? '').trim() === '' || !Number.isInteger(n) || n < 1) return 'Le numéro doit être un nombre entier, 1 ou plus.'
  const prise = autresVisites.find((v) => v.id !== crId && Number(v.numero) === n)
  if (!prise) return null
  const le = dateCourte(prise.date_reunion)
  return `Le numéro ${n} est déjà attribué${le ? ` à la visite du ${le}` : ' à une autre visite'}.`
}

/**
 * Rédacteurs possibles : ceux qui peuvent écrire dans l'affaire. Une affaire
 * qui a des collaborateurs se limite à eux (propriétaire, collaborateur) ; un
 * intervenant extérieur n'écrit que ses observations, il ne rédige pas le CR.
 * Une affaire sans collaborateur est ouverte à toute l'agence
 * (`useAffaireCollaborateurs`). Le rédacteur déjà choisi reste affiché, signalé,
 * s'il n'a plus accès : le retirer en silence changerait le CR sans le dire.
 */
export function redacteursPossibles(profils = [], collaborateurs = [], redacteurActuel = null) {
  const membres = collaborateurs.filter((c) => c.role === 'proprietaire' || c.role === 'collaborateur').map((c) => c.user_id)
  const autorises = membres.length > 0
    ? profils.filter((p) => membres.includes(p.id) && p.type_compte !== 'exterieur')
    : profils.filter((p) => p.type_compte === 'agence')
  const tries = [...autorises].sort((a, b) => nomProfil(a).localeCompare(nomProfil(b), 'fr'))
  const liste = tries.map((p) => ({ id: p.id, libelle: nomProfil(p), sansAcces: false }))
  if (redacteurActuel && !liste.some((r) => r.id === redacteurActuel)) {
    const p = profils.find((x) => x.id === redacteurActuel)
    liste.push({ id: redacteurActuel, libelle: p ? nomProfil(p) : 'Rédacteur inconnu', sansAcces: true })
  }
  return liste
}

export function nomProfil(p) {
  return [p?.prenom, p?.nom].filter(Boolean).join(' ') || p?.email || '—'
}
