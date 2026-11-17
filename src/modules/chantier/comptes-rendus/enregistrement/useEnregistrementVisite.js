// ─── Robot de la visite : enregistrer et transcrire ──────────────────────────
//
// Réunit les briques éprouvées à l'essai (lot 0) : moteur par morceaux,
// tranches gardées sur l'appareil, reprise automatique après un écran
// verrouillé ou un changement d'app (désormais dans `useEnregistreur`, commun
// à l'état des lieux). Chaque morceau terminé part à la transcription dès
// qu'il y a du réseau ; sinon il attend, et la file repart au retour du
// réseau ou à la prochaine ouverture du CR.
//
// Les remarques saisies à la main ne passent pas par ici : le robot ne
// bloque rien pendant qu'il enregistre.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { enregistrementPossible } from './enregistreur'
import { recupererMorceaux, morceauxEnAttente, enregistrementsInterrompus } from './audioLocal'
import { transcrireEnAttente, enregistrementsDisponibles, messageTranscription, ECHECS_MAX } from './transcription'
import { useEnregistreur } from './useEnregistreur'
import { etatPourLeCr, enregistrementsARecuperer } from './enregistrementLogique'

export function useEnregistrementVisite({ crId, affaireId, vocabulaire = [], actif = true }) {
  const [disponible, setDisponible] = useState(false)
  const [attente, setAttente] = useState({ enAttente: 0, refuses: 0 })
  const [erreur, setErreur] = useState(null)
  const [version, setVersion] = useState(0)
  // Lu au moment d'envoyer, pas à l'affichage
  const vocabulaireCourant = useRef(vocabulaire)
  useEffect(() => { vocabulaireCourant.current = vocabulaire }, [vocabulaire])

  const recompter = useCallback(async () => {
    const liste = await morceauxEnAttente(crId).catch(() => [])
    setAttente({
      enAttente: liste.filter((m) => (m.echecs ?? 0) < ECHECS_MAX).length,
      refuses: liste.filter((m) => (m.echecs ?? 0) >= ECHECS_MAX).length,
    })
  }, [crId])

  const transcrire = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { await recompter(); return }
    const { transcrits, erreur: err } = await transcrireEnAttente(crId, {
      vocabulaire: vocabulaireCourant.current,
      surProgres: () => { recompter(); setVersion((v) => v + 1) },
    })
    setErreur(err ? messageTranscription(err) : null)
    if (transcrits > 0) setVersion((v) => v + 1)
    await recompter()
  }, [crId, recompter])

  const champs = useMemo(() => ({ crId, affaireId }), [crId, affaireId])
  const moteur = useEnregistreur({ champs, surMorceau: () => { transcrire() } })
  const { demarrer: demarrerMoteur, enregistrementCourant } = moteur
  // Appelé tel quel par un onClick : l'événement ne doit jamais partir comme
  // champs de visite sur les morceaux
  const demarrer = useCallback(() => demarrerMoteur(), [demarrerMoteur])

  // Ouverture : la table existe-t-elle ? Un enregistrement interrompu par
  // une fermeture de la page se recolle, puis la file repart.
  useEffect(() => {
    if (!actif || !crId) return undefined
    let annule = false
    ;(async () => {
      const ok = await enregistrementsDisponibles().catch(() => false)
      if (annule) return
      setDisponible(ok && enregistrementPossible())
      if (!ok) return
      const interrompus = await enregistrementsInterrompus(crId).catch(() => [])
      for (const id of enregistrementsARecuperer(interrompus, enregistrementCourant())) {
        await recupererMorceaux(id).catch(() => {})
      }
      if (!annule) await transcrire()
    })()
    const auRetourDuReseau = () => transcrire()
    window.addEventListener('online', auRetourDuReseau)
    return () => { annule = true; window.removeEventListener('online', auRetourDuReseau) }
  }, [actif, crId, transcrire, enregistrementCourant])

  return {
    disponible, etat: etatPourLeCr(moteur.etat), niveau: moteur.niveau, attente,
    erreur: moteur.erreur ?? erreur, version, duree_s: moteur.duree_s,
    demarrer, arreter: moteur.arreter, reprendre: moteur.reprendre, transcrire,
  }
}

/** La vue « Enregistrements » du bureau : agence seule, migration 057 passée. */
export function useEnregistrementsDisponibles(actif) {
  const [disponible, setDisponible] = useState(false)
  useEffect(() => {
    if (!actif) return undefined
    let annule = false
    enregistrementsDisponibles().then((ok) => { if (!annule) setDisponible(ok) }).catch(() => {})
    return () => { annule = true }
  }, [actif])
  return actif && disponible
}
