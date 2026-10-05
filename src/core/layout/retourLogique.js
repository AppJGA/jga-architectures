// ─── Le retour du bandeau, d'après l'adresse ─────────────────────────────────
//
// Le bandeau du haut porte, à côté du logo, le retour vers la page qui menait
// à celle-ci. La plupart se déduisent de l'adresse ; une page aux vues
// internes (les pages d'un CR) le remplace par `useRetourPage`.
// Pur (tests/retour.test.js).

/**
 * @returns { libelle, icone, vers } ou null (accueil, connexion)
 *   icone : 'accueil' | 'portail' | 'outils' | 'tableau' | 'visites' | 'opr'
 */
export function retourParDefaut(chemin = '', recherche = '') {
  const params = new URLSearchParams(recherche)
  const morceaux = chemin.split('/').filter(Boolean)
  const [racine, id, module] = morceaux

  if (racine === 'affaires' && id) {
    if (!module) return { libelle: 'Portail d’affaires', icone: 'portail', vers: '/dashboard' }
    if (module === 'comptes-rendus' && params.has('cr')) {
      return { libelle: 'Liste des visites', icone: 'visites', vers: `/affaires/${id}/comptes-rendus` }
    }
    if (module === 'opr' && params.has('visite')) {
      return { libelle: 'Visites d’OPR', icone: 'opr', vers: `/affaires/${id}/opr` }
    }
    return { libelle: 'Tableau de bord de l’affaire', icone: 'tableau', vers: `/affaires/${id}` }
  }
  if (racine === 'tools' && id) return { libelle: 'Boîte à outils', icone: 'outils', vers: '/tools' }
  if (['dashboard', 'carnet-adresses', 'tools', 'heures', 'settings'].includes(racine)) {
    return { libelle: 'Accueil', icone: 'accueil', vers: '/home' }
  }
  return null
}
