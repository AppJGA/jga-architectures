// ─── Fichier vectoriel d'un étage : chargement ───────────────────────────────
//
// Le fichier (`edl_niveaux.chemin_vecteurs`, migration 081) est lu par le
// même chemin que les images : lien signé avec du réseau, copie de
// l'appareil sans (`obtenirLiens` de `useLiensSignes`). Décodé une fois par
// chemin et gardé en mémoire pour la séance : le bureau et la visite, qui
// rouvrent souvent le même étage, ne le relisent pas.

import { decoderVecteurs } from './simplificationPlan'
import { lienLocal } from '../../chantier/comptes-rendus/horsLigne/images'

export { dessinerVecteurs, rectangleVisible, elementsVisibles } from './vecteursEdlLogique'

// Quelques Mo décodés par étage : un bâtiment entier tient, une séance d'une
// journée sur plusieurs affaires ne doit pas grossir sans fin
const GARDES_MAX = 24
const enCours = new Map() // chemin → promesse des vecteurs
const decodes = new Map() // chemin → vecteurs, pour un affichage sans attente

/** Vecteurs déjà décodés pour ce chemin, ou null. */
export const vecteursEnMemoire = (chemin) => decodes.get(chemin) ?? null

async function lireOctets(chemin, obtenirLiens) {
  const url = (await obtenirLiens([chemin])).get(chemin)
  if (!url) throw new Error('Fichier vectoriel introuvable')
  let reponse
  try {
    reponse = await fetch(url)
  } catch (err) {
    // Réseau tombé entre le lien signé et la lecture : la copie de
    // l'appareil, s'il y en a une
    const local = await lienLocal(chemin)
    if (!local) throw err
    reponse = await fetch(local)
  }
  if (!reponse.ok) throw new Error(`Fichier vectoriel : ${reponse.status}`)
  return new Uint8Array(await reponse.arrayBuffer())
}

/** Vecteurs d'un étage (`decoderVecteurs`), lus une fois par chemin. */
export function chargerVecteurs(chemin, obtenirLiens) {
  if (decodes.has(chemin)) return Promise.resolve(decodes.get(chemin))
  if (enCours.has(chemin)) return enCours.get(chemin)
  const promesse = lireOctets(chemin, obtenirLiens)
    .then((octets) => {
      const vecteurs = decoderVecteurs(octets)
      if (decodes.size >= GARDES_MAX) decodes.delete(decodes.keys().next().value)
      decodes.set(chemin, vecteurs)
      return vecteurs
    })
    // Un échec n'est pas retenu : le prochain affichage (réseau revenu,
    // copie faite entre-temps) retentera
    .finally(() => enCours.delete(chemin))
  enCours.set(chemin, promesse)
  return promesse
}
