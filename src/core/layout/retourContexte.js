// ─── Remplacer le retour du bandeau depuis une page ──────────────────────────
//
// Une page aux vues internes (les pages d'un CR : Organisation, Présences…)
// indique au bandeau où mène le retour tant qu'elle est affichée ; sans elle,
// le bandeau le déduit de l'adresse (retourLogique.js).

import { createContext, useContext, useEffect, useRef } from 'react'

export const RetourContexte = createContext({ retour: null, definir: () => {} })

/**
 * @param retour { libelle, Icone, onClick } ou null (laisser le retour par défaut)
 */
export function useRetourPage(retour) {
  const { definir } = useContext(RetourContexte)
  // L'action la plus récente, lue au clic : pas besoin de redéclarer le retour
  // à chaque affichage
  const action = useRef(retour?.onClick)
  useEffect(() => { action.current = retour?.onClick })
  const actif = !!retour
  const libelle = retour?.libelle
  const Icone = retour?.Icone
  useEffect(() => {
    if (!actif) return undefined
    definir({ libelle, Icone, onClick: () => action.current?.() })
    return () => definir(null)
  }, [actif, libelle, Icone, definir])
}
