// ─── Images emportées pour la visite ─────────────────────────────────────────
//
// Les photos et les plans sont dans un stockage privé : leur adresse est un
// lien signé, qui change à chaque chargement. Le cache du navigateur ne peut
// donc rien pour eux. Les images de la visite sont recopiées telles quelles
// dans la mémoire de l'appareil, et relues par leur chemin.

import { MAGASINS, lire, ecrire, disponible } from './baseLocale'

// Budget volontairement large pour les plans (une planche pèse quelques Mo),
// mais fini : au-delà, la visite s'ouvre sans les dernières images plutôt que
// de saturer l'iPad.
export const BUDGET_OCTETS = 60 * 1024 * 1024

const urls = new Map() // chemin → object URL, le temps de la session

/** Recopie les images dans la mémoire de l'appareil. Rend le nombre gardé. */
export async function garderImages(chemins, obtenirLiens, budget = BUDGET_OCTETS) {
  if (!disponible()) return { gardees: 0, octets: 0 }
  const utiles = [...new Set((chemins ?? []).filter(Boolean))]
  if (utiles.length === 0) return { gardees: 0, octets: 0 }

  const liens = await obtenirLiens(utiles)
  let octets = 0
  let gardees = 0
  for (const chemin of utiles) {
    if (octets >= budget) break
    const deja = await lire(MAGASINS.fichiers, chemin).catch(() => null)
    if (deja) { octets += deja.octets ?? 0; gardees++; continue }
    const url = liens.get(chemin)
    if (!url) continue
    try {
      const reponse = await fetch(url)
      if (!reponse.ok) continue
      const blob = await reponse.blob()
      if (octets + blob.size > budget) break
      await ecrire(MAGASINS.fichiers, { id: chemin, image: blob, octets: blob.size })
      octets += blob.size
      gardees++
    } catch {
      // Image manquante ou réseau coupé en cours de route : les suivantes
      // restent tentées, la visite s'ouvrira avec ce qui a pu être gardé.
    }
  }
  return { gardees, octets }
}

/** Adresse locale d'une image emportée, ou undefined si elle n'y est pas. */
export async function lienLocal(chemin) {
  if (!chemin) return undefined
  if (urls.has(chemin)) return urls.get(chemin)
  const fichier = await lire(MAGASINS.fichiers, chemin).catch(() => null)
  const blob = fichier?.image ?? fichier?.miniature
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urls.set(chemin, url)
  return url
}

/** Adresses locales de plusieurs images, par chemin. */
export async function liensLocaux(chemins) {
  const paires = await Promise.all([...new Set((chemins ?? []).filter(Boolean))]
    .map(async (c) => [c, await lienLocal(c)]))
  return new Map(paires.filter(([, url]) => url))
}
