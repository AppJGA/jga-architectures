import { useCallback, useEffect, useState } from 'react'
import * as donnees from './edlDonnees'
import { arrondirContour } from './geometrieEdl'

const VIDE = { charge: false, indisponible: false, echec: false, etat: null, niveaux: [], pieces: [] }

const etatDepuis = (r) => ({
  charge: true, indisponible: !!r.indisponible, echec: false, etat: r.etat ?? null, niveaux: r.niveaux ?? [], pieces: r.pieces ?? [],
})

// Lecture ratée : rien d'affiché plutôt que des étages qui pourraient être
// ceux d'une autre affaire (« Remplacer les plans » effacerait leurs fichiers)
const ECHEC = { ...VIDE, charge: true, echec: true }

export function useEtatDesLieux(affaireId) {
  const [etat, setEtat] = useState(VIDE)
  const [erreur, setErreur] = useState(null)
  // Changement d'affaire sans démontage : l'état précédent est vidé dès le
  // rendu (ajustement pendant le rendu, pas dans un effet)
  const [affaireAffichee, setAffaireAffichee] = useState(affaireId)
  if (affaireAffichee !== affaireId) {
    setAffaireAffichee(affaireId)
    setEtat(VIDE)
    setErreur(null)
  }

  const recharger = useCallback(async () => {
    try {
      setEtat(etatDepuis(await donnees.chargerEtat(affaireId)))
      setErreur(null)
    } catch (err) {
      setErreur(err?.message ?? String(err))
      setEtat(ECHEC)
    }
  }, [affaireId])

  // Chargement initial : appel asynchrone (pas de setState synchrone dans
  // l'effet) et `actif` coupe la réponse d'une affaire quittée entre-temps
  useEffect(() => {
    let actif = true
    donnees.chargerEtat(affaireId).then(
      (r) => { if (actif) setEtat(etatDepuis(r)) },
      (err) => {
        if (!actif) return
        setErreur(err?.message ?? String(err))
        setEtat(ECHEC)
      },
    )
    return () => { actif = false }
  }, [affaireId])

  // Appliqué à l'écran tout de suite ; un refus recharge l'état de la base
  const modifierPiece = useCallback(async (id, champs) => {
    const propres = champs.contour ? { ...champs, contour: arrondirContour(champs.contour) } : champs
    setEtat((e) => ({ ...e, pieces: e.pieces.map((p) => (p.id === id ? { ...p, ...propres } : p)) }))
    try {
      await donnees.modifierPiece(id, propres)
    } catch (err) {
      setErreur(err?.message ?? String(err))
      recharger()
    }
  }, [recharger])

  const ajouterPiece = useCallback(async (niveauId, piece) => {
    try {
      const ordre = etat.pieces.filter((p) => p.niveau_id === niveauId).length
      const ligne = await donnees.ajouterPiece(affaireId, niveauId, piece, ordre)
      setEtat((e) => ({ ...e, pieces: [...e.pieces, ligne] }))
      return ligne
    } catch (err) {
      setErreur(err?.message ?? String(err))
      return null
    }
  }, [affaireId, etat.pieces])

  const supprimerPiece = useCallback(async (id) => {
    try {
      await donnees.supprimerPiece(id)
      setEtat((e) => ({ ...e, pieces: e.pieces.filter((p) => p.id !== id) }))
    } catch (err) {
      setErreur(err?.message ?? String(err))
    }
  }, [])

  const renommerNiveau = useCallback(async (id, nom) => {
    setEtat((e) => ({ ...e, niveaux: e.niveaux.map((n) => (n.id === id ? { ...n, nom } : n)) }))
    try {
      await donnees.renommerNiveau(id, nom)
    } catch (err) {
      setErreur(err?.message ?? String(err))
      recharger()
    }
  }, [recharger])

  return { ...etat, erreur, setErreur, recharger, modifierPiece, ajouterPiece, supprimerPiece, renommerNiveau }
}
