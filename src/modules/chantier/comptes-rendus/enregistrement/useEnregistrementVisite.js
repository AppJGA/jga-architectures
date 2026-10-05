// ─── Robot de la visite : enregistrer et transcrire ──────────────────────────
//
// Réunit les briques éprouvées à l'essai (lot 0) : moteur par morceaux,
// tranches gardées sur l'appareil, reprise automatique après un écran
// verrouillé ou un changement d'app. Chaque morceau terminé part à la
// transcription dès qu'il y a du réseau ; sinon il attend, et la file
// repart au retour du réseau ou à la prochaine ouverture du CR.
//
// Les remarques saisies à la main ne passent pas par ici : le robot ne
// bloque rien pendant qu'il enregistre.

import { useState, useEffect, useRef, useCallback } from 'react'
import { enregistrementPossible, demarrerEnregistreur } from './enregistreur'
import { rangerMorceau, rangerTranche, recupererMorceaux, morceauxEnAttente, enregistrementsInterrompus } from './audioLocal'
import { DUREE_MORCEAU_MS } from './transcriptionLogique'
import { transcrireEnAttente, enregistrementsDisponibles, messageTranscription, ECHECS_MAX } from './transcription'

export function useEnregistrementVisite({ crId, affaireId, vocabulaire = [], actif = true }) {
  const [disponible, setDisponible] = useState(false)
  const [etat, setEtat] = useState('pret') // pret | enregistre | coupe
  const [debut, setDebut] = useState(null)
  const [maintenant, setMaintenant] = useState(0)
  const [niveau, setNiveau] = useState(0)
  const [attente, setAttente] = useState({ enAttente: 0, refuses: 0 })
  const [erreur, setErreur] = useState(null)
  const [version, setVersion] = useState(0)
  const moteur = useRef(null)
  const enregistrement = useRef(null) // { id, debutIso, dernierRang }
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
      for (const id of await enregistrementsInterrompus(crId).catch(() => [])) {
        await recupererMorceaux(id).catch(() => {})
      }
      if (!annule) await transcrire()
    })()
    const auRetourDuReseau = () => transcrire()
    window.addEventListener('online', auRetourDuReseau)
    return () => { annule = true; window.removeEventListener('online', auRetourDuReseau) }
  }, [actif, crId, transcrire])

  useEffect(() => {
    if (etat !== 'enregistre') return undefined
    const minuterie = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(minuterie)
  }, [etat])

  // Fermer la visite arrête l'enregistrement : le dernier morceau est gardé
  useEffect(() => () => { moteur.current?.arreter() }, [])

  const lancer = useCallback(async (reprise) => {
    if (!reprise || !enregistrement.current) {
      enregistrement.current = { id: crypto.randomUUID(), debutIso: new Date().toISOString(), dernierRang: 0 }
      setDebut(Date.now())
    }
    const enr = enregistrement.current
    const commun = { enregistrementId: enr.id, crId, affaireId, debutEnregistrement: enr.debutIso }
    setMaintenant(Date.now())
    const m = await demarrerEnregistreur({
      dureeMorceauMs: DUREE_MORCEAU_MS,
      rangDepart: enr.dernierRang + 1,
      onNiveau: setNiveau,
      onEvenement: (e) => { if (e.type === 'piste-terminee') setEtat('coupe') },
      onTranche: (t) => {
        rangerTranche({ ...t, ...commun, id: `${enr.id}:${t.rang}:${t.index}` }).catch(() => {})
      },
      onMorceau: async (brut) => {
        enr.dernierRang = Math.max(enr.dernierRang, brut.rang)
        await rangerMorceau({ ...brut, ...commun, id: crypto.randomUUID() }).catch(() => {})
        transcrire()
      },
    })
    moteur.current = m
    setEtat('enregistre')
  }, [crId, affaireId, transcrire])

  const demarrer = useCallback(async () => {
    setErreur(null)
    try {
      await lancer(false)
    } catch (err) {
      setErreur(err?.name === 'NotAllowedError'
        ? 'Micro refusé : autorisez-le pour ce site dans les réglages de l’iPad ou du navigateur.'
        : `L’enregistrement n’a pas pu démarrer : ${err?.message ?? err}`)
    }
  }, [lancer])

  const arreter = useCallback(async () => {
    await moteur.current?.arreter()
    moteur.current = null
    enregistrement.current = null
    setNiveau(0)
    setEtat('pret')
    setDebut(null)
  }, [])

  // Après une coupure (écran verrouillé, autre app), repartir seul dès que la
  // page revient : iOS l'accepte sans appui (essai du lot 0). Sinon, bouton.
  const reprendre = useCallback(async () => {
    try { await lancer(true); return true } catch { return false }
  }, [lancer])

  useEffect(() => {
    if (etat !== 'coupe') return undefined
    let tente = false
    const essayer = async () => {
      if (tente || document.visibilityState !== 'visible') return
      tente = true
      await new Promise((r) => setTimeout(r, 400))
      await reprendre()
    }
    essayer()
    document.addEventListener('visibilitychange', essayer)
    return () => document.removeEventListener('visibilitychange', essayer)
  }, [etat, reprendre])

  return {
    disponible, etat, niveau, attente, erreur, version,
    duree_s: debut ? Math.max(0, (maintenant - debut) / 1000) : 0,
    demarrer, arreter, reprendre, transcrire,
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
