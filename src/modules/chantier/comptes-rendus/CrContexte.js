import { createContext, useContext } from 'react'

// Partagé par tous les écrans d'un compte rendu, pour ne pas faire descendre
// ces deux valeurs à travers chaque niveau de sections et de remarques.
//
// - lectureSeule : compte rendu émis, ou affaire consultée sans droit de
//   modification. Les actions d'édition sont alors masquées.
// - signalerErreur : affiche l'échec d'un enregistrement dans le bandeau du
//   compte rendu, au lieu de le laisser dans la console.
export const CrContexte = createContext({
  lectureSeule: false,
  signalerErreur: () => {},
})

export function useCr() {
  return useContext(CrContexte)
}
