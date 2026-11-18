import { useEffect, useMemo, useState } from 'react'
import { chargerVecteurs, dessinerVecteurs, vecteursEnMemoire } from './vecteursEdl'

// ─── Plan vectoriel d'un étage pour la visionneuse ───────────────────────────
//
// Rend `{ dessinFond, sansPleine }` pour `VisionneusePlan`.
// - `dessinFond` : null tant qu'il n'y a rien à dessiner — étage importé avant
//   la migration 081 (pas de `chemin_vecteurs`), fichier en cours de lecture
//   ou illisible ; l'aperçu de l'étage s'affiche alors comme avant. La
//   fonction ne change d'identité qu'avec les vecteurs ou le cadrage, pas à
//   chaque rendu : la visionneuse redessine à chaque changement.
// - `sansPleine` : l'étage a un fichier vectoriel qui n'a pas échoué et un
//   cadrage qui permet de le dessiner. L'image pleine (6 000 px, ~96 Mo de
//   mémoire sur l'iPad) ne sert alors à rien ; elle n'est chargée qu'en
//   repli, si le fichier ne se lit pas ou ne pourra pas se dessiner.

export function useVecteursEdl(niveau, obtenirLiens) {
  const chemin = niveau?.chemin_vecteurs ?? null
  // Gardé dans l'état même s'il est en mémoire : retiré du cache commun
  // pendant que l'écran est ouvert, le plan ne doit pas disparaître
  const [lu, setLu] = useState({ chemin: null, vecteurs: null, echec: false })
  // Une seule relance par étage : notée avec son chemin, elle repart de zéro
  // quand on change d'étage
  const [relanceLue, setRelance] = useState({ chemin: null, n: 0 })
  const relance = relanceLue.chemin === chemin ? relanceLue.n : 0

  useEffect(() => {
    if (!chemin) return undefined
    let abandon = false
    let attenteReseau = null
    // Déjà en mémoire, la promesse est déjà résolue : l'affichage n'attend pas
    // (lu au rendu), l'état suit au tour suivant
    chargerVecteurs(chemin, obtenirLiens)
      .then((vecteurs) => { if (!abandon) setLu({ chemin, vecteurs, echec: false }) })
      .catch((err) => {
        if (abandon) return
        console.warn('Plan vectoriel :', err)
        setLu({ chemin, vecteurs: null, echec: true })
        // Une seconde chance au retour du réseau (visite commencée sans
        // réseau ni copie) ; au-delà, l'image reste
        if (relance === 0) {
          attenteReseau = () => setRelance({ chemin, n: 1 })
          window.addEventListener('online', attenteReseau, { once: true })
        }
      })
    // Étage changé ou écran fermé avant la fin : le résultat est ignoré
    return () => {
      abandon = true
      if (attenteReseau) window.removeEventListener('online', attenteReseau)
    }
  }, [chemin, obtenirLiens, relance])

  // Résultat d'un autre étage (réponse arrivée après le changement) écarté
  const propre = lu.chemin === chemin ? lu : null
  const vecteurs = !chemin ? null : (propre?.vecteurs ?? vecteursEnMemoire(chemin))

  // Le cadrage par ses nombres : relu de la base ou de l'appareil, c'est un
  // objet neuf à chaque fois pour le même étage
  const x0 = niveau?.cadrage?.x0
  const y1 = niveau?.cadrage?.y1
  const pxParMetre = niveau?.cadrage?.pxParMetre
  const cadrageValide = [x0, y1, pxParMetre].every(Number.isFinite) && pxParMetre > 0
  // Vrai pendant la lecture et une fois les vecteurs dessinables ; un
  // cadrage inutilisable laisserait sinon l'écran sans vecteurs ni image
  const sansPleine = !!chemin && cadrageValide && !propre?.echec
  const dessinFond = useMemo(() => {
    if (!vecteurs || !cadrageValide) return null
    const cadrage = { x0, y1, pxParMetre }
    return (ctx, t) => dessinerVecteurs(ctx, vecteurs, cadrage, t)
  }, [vecteurs, cadrageValide, x0, y1, pxParMetre])

  return { dessinFond, sansPleine }
}
