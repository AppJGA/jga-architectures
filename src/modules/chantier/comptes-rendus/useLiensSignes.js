import { useState, useRef, useCallback } from 'react'
import { liensSignes } from './photosStockage'
import { liensLocaux } from './horsLigne/images'

// Un lien signé vaut une heure ; on le renouvelle un peu avant. Le garder entre
// deux rechargements évite de retélécharger les images : un nouveau lien est
// une nouvelle adresse pour le cache du navigateur.
const DUREE_LIEN = 3600
const MARGE_LIEN = 600

/** Liens temporaires d'un stockage privé, gardés en cache par chemin */
export function useLiensSignes(bucket) {
  const [liens, setLiens] = useState(() => new Map())
  const cache = useRef(new Map()) // chemin → { url, expire }

  // Sans réseau, les images emportées pour la visite prennent le relais : leur
  // adresse locale ne périme pas, elle vaut pour la session.
  const obtenirLiens = useCallback(async (chemins) => {
    const maintenant = Date.now() / 1000
    const manquants = chemins.filter(c => c && !(cache.current.get(c)?.expire > maintenant + MARGE_LIEN))
    if (manquants.length > 0) {
      let nouveaux
      try {
        nouveaux = await liensSignes(manquants, DUREE_LIEN, bucket)
      } catch (err) {
        nouveaux = await liensLocaux(manquants)
        if (nouveaux.size === 0) throw err
      }
      const locaux = nouveaux.size < manquants.length
        ? await liensLocaux(manquants.filter(c => !nouveaux.get(c)))
        : new Map()
      for (const [chemin, url] of [...nouveaux, ...locaux]) {
        cache.current.set(chemin, { url, expire: maintenant + DUREE_LIEN })
      }
      setLiens(new Map([...cache.current].map(([c, v]) => [c, v.url])))
    }
    return new Map(chemins.map(c => [c, cache.current.get(c)?.url]))
  }, [bucket])

  return { liens, obtenirLiens }
}
