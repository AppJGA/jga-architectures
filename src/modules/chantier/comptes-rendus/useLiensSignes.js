import { useState, useRef, useCallback } from 'react'
import { liensSignes } from './photosStockage'

// Un lien signé vaut une heure ; on le renouvelle un peu avant. Le garder entre
// deux rechargements évite de retélécharger les images : un nouveau lien est
// une nouvelle adresse pour le cache du navigateur.
const DUREE_LIEN = 3600
const MARGE_LIEN = 600

/** Liens temporaires d'un stockage privé, gardés en cache par chemin */
export function useLiensSignes(bucket) {
  const [liens, setLiens] = useState(() => new Map())
  const cache = useRef(new Map()) // chemin → { url, expire }

  const obtenirLiens = useCallback(async (chemins) => {
    const maintenant = Date.now() / 1000
    const manquants = chemins.filter(c => c && !(cache.current.get(c)?.expire > maintenant + MARGE_LIEN))
    if (manquants.length > 0) {
      const nouveaux = await liensSignes(manquants, DUREE_LIEN, bucket)
      for (const [chemin, url] of nouveaux) cache.current.set(chemin, { url, expire: maintenant + DUREE_LIEN })
      setLiens(new Map([...cache.current].map(([c, v]) => [c, v.url])))
    }
    return new Map(chemins.map(c => [c, cache.current.get(c)?.url]))
  }, [bucket])

  return { liens, obtenirLiens }
}
