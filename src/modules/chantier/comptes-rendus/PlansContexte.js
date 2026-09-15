import { createContext, useContext } from 'react'

// Plans de l'affaire, pastilles du compte rendu et ouverture de l'écran de
// placement, fournis par CrDetail aux lignes de remarque.
export const PlansContexte = createContext({
  disponible: false, plans: [], versions: [], pastilles: [],
  ouvrirPlacement: () => {},
})

export function usePlansCr() {
  return useContext(PlansContexte)
}
