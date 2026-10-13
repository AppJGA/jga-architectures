// ─── Initiales d'une personne (pastilles) ────────────────────────────────────
//
// Une lettre par partie du prénom puis du nom, à la demande de l'agence : les
// prénoms et noms composés gardent toutes leurs lettres (« Claire Avril Rat »
// → CAR, « Véronique Durafour-Soro » → VDS, « Anne-Lise Aumeunier » → ALA).
// Commun à toutes les pastilles de l'app (portail, affaire, collaborateurs,
// calendrier des rendus et son PDF). Testé (tests/gestion.test.js).

const lettres = (texte) => String(texte ?? '').split(/[\s\-‐–]+/).filter(Boolean).map((m) => m.charAt(0)).join('')

export function initialesPersonne(personne) {
  if (!personne) return ''
  const sigle = `${lettres(personne.prenom)}${lettres(personne.nom)}`.toUpperCase()
  return sigle || String(personne.email ?? '').trim().charAt(0).toUpperCase()
}
