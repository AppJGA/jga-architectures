// ─── Remplacer le retour du bandeau depuis une page ──────────────────────────
//
// Une page aux vues internes (les pages d'un CR : Organisation, Présences…)
// indique au bandeau où mène le retour tant qu'elle est affichée ; sans elle,
// le bandeau le déduit de l'adresse (retourLogique.js).

import { createContext, useContext, useEffect, useRef } from 'react'

export const RetourContexte = createContext({ retour: null, definir: () => {}, titre: null, definirTitre: () => {} })

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

/**
 * Titre de la page dans le bandeau du haut, à la place du retour. Une affaire
 * y met son code et son nom ; le retour descend alors sous ce titre, dans la
 * barre de l'affaire (`RetourCourant`) — on cherche la flèche sous le titre,
 * pas au-dessus.
 * @param titre { code, nom, detail, couleur } ou null
 */
export function useTitreBandeau(titre) {
  const { definirTitre } = useContext(RetourContexte)
  const actif = !!titre
  const code = titre?.code ?? null
  const nom = titre?.nom ?? null
  const detail = titre?.detail ?? null
  const couleur = titre?.couleur ?? null
  useEffect(() => {
    if (!actif || !definirTitre) return undefined
    definirTitre({ code, nom, detail, couleur })
    return () => definirTitre(null)
  }, [actif, code, nom, detail, couleur, definirTitre])
}
