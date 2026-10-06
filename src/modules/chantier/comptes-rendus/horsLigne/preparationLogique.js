// ─── « Préparer pour le chantier » : logique pure ────────────────────────────
//
// Les pages à parcourir pour qu'une affaire reste utilisable sans réseau, et
// ce que dit le bandeau de la dernière préparation. Testé
// (tests/hors-ligne.test.js).

/**
 * Les pages qu'une visite sans réseau peut demander. La visite (mode Visite)
 * est l'étape qui compte : elle emporte remarques, photos et plans.
 * @param crId visite en cours, sinon la dernière ; null s'il n'y en a pas
 */
export function etapesPreparation(affaireId, crId) {
  const base = `/affaires/${affaireId}`
  return [
    { cle: 'visites', libelle: 'Liste des visites', chemin: `${base}/comptes-rendus` },
    ...(crId ? [{ cle: 'visite', libelle: 'Visite, photos et plans', chemin: `${base}/comptes-rendus?cr=${crId}&visite=1`, visite: true }] : []),
    { cle: 'lots', libelle: 'Lots et entreprises', chemin: `${base}/lots-entreprises` },
    { cle: 'planning', libelle: 'Planning chantier', chemin: `${base}/planning-chantier` },
    { cle: 'cctp', libelle: 'Pièces écrites', chemin: `${base}/pieces-ecrites`, cctp: true },
  ]
}

// Au-delà, mieux vaut refaire la préparation avant de partir
export const FRAICHEUR_MS = 24 * 3600 * 1000

/**
 * Ce que dit le bandeau.
 * @param preparation { le, numero, echecs: [libellé] } ou null
 * @returns { etat: 'jamais' | 'pret' | 'ancien' | 'incomplet', libelle }
 */
export function etatPreparation(preparation, maintenant = Date.now()) {
  if (!preparation?.le) return { etat: 'jamais', libelle: 'Pas encore préparée pour le chantier' }
  const quand = libelleMoment(new Date(preparation.le), new Date(maintenant))
  const visite = preparation.numero != null ? ` · visite n°${String(preparation.numero).padStart(2, '0')}` : ''
  if (preparation.echecs?.length) {
    return { etat: 'incomplet', libelle: `Préparée ${quand}, sauf : ${preparation.echecs.join(', ')}` }
  }
  if (maintenant - preparation.le > FRAICHEUR_MS) {
    return { etat: 'ancien', libelle: `Préparée ${quand}${visite} — à mettre à jour avant de partir` }
  }
  return { etat: 'pret', libelle: `Prête pour le chantier · préparée ${quand}${visite}` }
}

function libelleMoment(date, maintenant) {
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
  const jour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const ecart = Math.round((jour(maintenant) - jour(date)) / 86_400_000)
  if (ecart === 0) return `aujourd’hui à ${heure}`
  if (ecart === 1) return `hier à ${heure}`
  return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${heure}`
}

/**
 * Une page est chargée quand plus rien ne part depuis un moment : le nombre
 * de requêtes de la page n'a pas bougé depuis `calme` ms (et au moins
 * `minimum` ms depuis son ouverture).
 */
export function pageCalme({ requetes, depuisChangement, depuisOuverture }, { calme = 2500, minimum = 2500 } = {}) {
  return requetes > 0 && depuisChangement >= calme && depuisOuverture >= minimum
}
