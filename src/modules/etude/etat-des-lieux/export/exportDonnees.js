// ─── Lectures de l'export de l'état des lieux ────────────────────────────────
//
// Tout ce que la fenêtre d'export doit avoir, relu à son ouverture plutôt que
// repris de l'écran : une analyse a pu valider ou ajouter des éléments depuis
// le chargement du module, et l'export doit partir de l'état de la base.
// Les lectures existantes sont réutilisées telles quelles :
//   - étages et pièces en `select('*')` (`chargerEtat`) : `unites_par_metre`,
//     `chemin_vecteurs`, fiches et marques de l'analyse quand la base les a ;
//   - points, photos et entrées dans les pièces (`lireToutEdl`, paginé) ;
//   - éléments relevés (`lireEtatAnalyse`, migration 082 ; sans elle, aucun
//     élément : seuls les points typés partent).
// Rien n'est écrit : un compte en lecture seule exporte aussi.

import { chargerEtat } from '../edlDonnees'
import { lireToutEdl } from '../visite/visiteDonnees'
import { lireEtatAnalyse } from '../analyse/analyseDonnees'
import { chargerVecteurs } from '../vecteursEdl'
import { superposerAnalyse } from './exportFenetreLogique'

// Un grand bâtiment fait plusieurs pages de points : plus large que la visite
const DELAI_EXPORT_MS = 20000

/**
 * @returns { indisponible } sans la migration 077, sinon
 *   { etat, niveaux, pieces, points, photos, entrees, elements, analyseIndisponible }
 */
export async function lireDonneesExport(affaireId) {
  const options = { delaiMs: DELAI_EXPORT_MS }
  const [base, visite, analyse] = await Promise.all([
    chargerEtat(affaireId),
    lireToutEdl(affaireId, options),
    lireEtatAnalyse(affaireId, options),
  ])
  if (base.indisponible) return { indisponible: true }
  // Sans la 079 (visite), ni points ni photos : l'export garde les pièces
  const v = visite.indisponible ? {} : visite.donnees
  return {
    indisponible: false,
    etat: base.etat,
    niveaux: base.niveaux,
    // `chargerEtat` peut venir de la mémoire du service worker : fiche,
    // marque « à valider », HSP lue et date d'analyse sont pris dans la
    // lecture fraîche de l'analyse
    pieces: superposerAnalyse(base.pieces, analyse.pieces),
    points: v.points ?? [],
    photos: v.photos ?? [],
    entrees: v.entrees ?? [],
    elements: analyse.elements ?? [],
    analyseIndisponible: !!analyse.indisponible,
  }
}

/**
 * Plan existant allégé d'un étage (vecteurs décodés, en mètres) pour le DXF
 * « avec plan » et le rapport ; null si l'étage n'a pas de fichier vectoriel
 * (import d'avant la migration 081). Lu une fois par chemin (`chargerVecteurs`).
 */
export function chargerPlanNiveau(niveau, obtenirLiens) {
  if (!niveau?.chemin_vecteurs) return Promise.resolve(null)
  return chargerVecteurs(niveau.chemin_vecteurs, obtenirLiens)
}
