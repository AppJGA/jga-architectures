import { createContext, useContext } from 'react'

// Plans de l'affaire, pastilles du compte rendu et ouverture de l'écran de
// placement, fournis par CrDetail aux lignes de remarque et au bouton
// « Plans » du mode Visite.
export const PlansContexte = createContext({
  disponible: false, plans: [], versions: [], pastilles: [],
  liens: new Map(), obtenirLiens: async () => new Map(), remarques: [],
  ouvrirPlacement: () => {},
})

export function usePlansCr() {
  return useContext(PlansContexte)
}
