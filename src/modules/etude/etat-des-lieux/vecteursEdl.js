// ─── Fichier vectoriel d'un étage : chargement ───────────────────────────────
//
// Le fichier (`edl_niveaux.chemin_vecteurs`, migration 081) est lu par le
// même chemin que les images : lien signé avec du réseau, copie de
// l'appareil sans (`obtenirLiens` de `useLiensSignes`). Décodé une fois par
// chemin et gardé en mémoire pour la séance : le bureau et la visite, qui
// rouvrent souvent le même étage, ne le relisent pas.

import { decoderVecteurs } from './simplificationPlan'
import { lienLocal } from '../../chantier/comptes-rendus/horsLigne/images'
import { pointsVecteurs, cheminsAEcarter } from './vecteursEdlLogique'

export { dessinerVecteurs, rectangleVisible, elementsVisibles } from './vecteursEdlLogique'

// Mémoire plafonnée au poids décodé (`cheminsAEcarter`), pas au nombre
// d'étages : un seul étage gardé tel quel pèse plus qu'un bâtiment allégé
const enCours = new Map() // chemin → promesse des vecteurs
const decodes = new Map() // chemin → vecteurs, du moins au plus récemment servi
const poids = new Map() // chemin → points décodés, même ordre

function garder(chemin, vecteurs) {
  // Remis en fin de liste : l'étage qu'on vient de servir part le dernier
  const points = poids.get(chemin) ?? pointsVecteurs(vecteurs)
  decodes.delete(chemin)
  poids.delete(chemin)
  decodes.set(chemin, vecteurs)
  poids.set(chemin, points)
  for (const c of cheminsAEcarter(poids, chemin)) {
    decodes.delete(c)
    poids.delete(c)
  }
}

/** Vecteurs déjà décodés pour ce chemin, ou null. */
export const vecteursEnMemoire = (chemin) => decodes.get(chemin) ?? null

async function lireOctets(chemin, obtenirLiens) {
  const url = (await obtenirLiens([chemin])).get(chemin)
  if (!url) throw new Error('Fichier vectoriel introuvable')
  let reponse = null
  let erreur = null
  try {
    reponse = await fetch(url)
  } catch (err) {
    erreur = err
  }
  if (!reponse?.ok) {
    // Réseau tombé entre le lien signé et la lecture, ou réponse refusée
    // (service worker sans copie, lien périmé) : la copie de l'appareil,
    // s'il y en a une
    const local = await lienLocal(chemin)
    if (!local) throw erreur ?? new Error(`Fichier vectoriel : ${reponse?.status}`)
    reponse = await fetch(local)
    if (!reponse.ok) throw new Error(`Fichier vectoriel : ${reponse.status}`)
  }
  return new Uint8Array(await reponse.arrayBuffer())
}

/** Vecteurs d'un étage (`decoderVecteurs`), lus une fois par chemin. */
export function chargerVecteurs(chemin, obtenirLiens) {
  if (decodes.has(chemin)) {
    const vecteurs = decodes.get(chemin)
    garder(chemin, vecteurs)
    return Promise.resolve(vecteurs)
  }
  if (enCours.has(chemin)) return enCours.get(chemin)
  const promesse = lireOctets(chemin, obtenirLiens)
    .then((octets) => {
      const vecteurs = decoderVecteurs(octets)
      garder(chemin, vecteurs)
      return vecteurs
    })
    // Un échec n'est pas retenu : le prochain affichage (réseau revenu,
    // copie faite entre-temps) retentera
    .finally(() => enCours.delete(chemin))
  enCours.set(chemin, promesse)
  return promesse
}
