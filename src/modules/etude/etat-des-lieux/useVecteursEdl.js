import { useEffect, useMemo, useState } from 'react'
import { chargerVecteurs, dessinerVecteurs, vecteursEnMemoire } from './vecteursEdl'

// ─── Plan vectoriel d'un étage pour la visionneuse ───────────────────────────
//
// Rend la fonction `dessinFond` de `VisionneusePlan`, ou null tant qu'il n'y a
// rien à dessiner : étage importé avant la migration 081 (pas de
// `chemin_vecteurs`), fichier en cours de lecture ou illisible. L'image de
// l'étage s'affiche alors comme avant. La fonction ne change d'identité
// qu'avec les vecteurs ou le cadrage, pas à chaque rendu : la visionneuse
// redessine à chaque changement de `dessinFond`.

export function useVecteursEdl(niveau, obtenirLiens) {
  const chemin = niveau?.chemin_vecteurs ?? null
  const [lu, setLu] = useState({ chemin: null, vecteurs: null })

  useEffect(() => {
    if (!chemin || vecteursEnMemoire(chemin)) return
    let abandon = false
    chargerVecteurs(chemin, obtenirLiens)
      .then((vecteurs) => { if (!abandon) setLu({ chemin, vecteurs }) })
      .catch((err) => console.warn('Plan vectoriel :', err))
    // Étage changé ou écran fermé avant la fin : le résultat est ignoré
    return () => { abandon = true }
  }, [chemin, obtenirLiens])

  // Résultat d'un autre étage (réponse arrivée après le changement) écarté
  const vecteurs = !chemin ? null : (vecteursEnMemoire(chemin) ?? (lu.chemin === chemin ? lu.vecteurs : null))

  // Le cadrage par ses nombres : relu de la base ou de l'appareil, c'est un
  // objet neuf à chaque fois pour le même étage
  const x0 = niveau?.cadrage?.x0
  const y1 = niveau?.cadrage?.y1
  const pxParMetre = niveau?.cadrage?.pxParMetre
  return useMemo(() => {
    if (!vecteurs || ![x0, y1, pxParMetre].every(Number.isFinite) || !(pxParMetre > 0)) return null
    const cadrage = { x0, y1, pxParMetre }
    return (ctx, t) => dessinerVecteurs(ctx, vecteurs, cadrage, t)
  }, [vecteurs, x0, y1, pxParMetre])
}
