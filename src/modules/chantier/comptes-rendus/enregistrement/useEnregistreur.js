// ─── Moteur d'enregistrement d'une visite, côté écran ────────────────────────
//
// Commun au robot des comptes rendus et à la visite de l'état des lieux : un
// enregistrement (identifiant, début) fait de morceaux rangés sur l'appareil
// seconde par seconde, avec pause, reprise et coupure à la demande. Ce qui
// arrive au micro (sourdine, coupure, échec) décide seul de l'état
// (`etatApresEvenement`, testé) : l'écran ne devine rien.
//
// `champs` est recopié sur chaque tranche et chaque morceau : c'est ce qui
// relie l'audio à sa visite ({ crId, affaireId } ou { edlVisiteId, affaireId }).

import { useState, useEffect, useRef, useCallback } from 'react'
import { enregistrementPossible, demarrerEnregistreur } from './enregistreur'
import { rangerMorceau, rangerTranche } from './audioLocal'
import { DUREE_MORCEAU_MS } from './transcriptionLogique'
import { etatApresEvenement, messageDemarrage, minuterieActive } from './enregistrementLogique'

export function useEnregistreur({ champs = {}, surMorceau, surEtat } = {}) {
  const [etat, setEtat] = useState('pret') // pret | enregistre | muet | coupe | echec | pause
  const [debut, setDebut] = useState(null)
  const [maintenant, setMaintenant] = useState(0)
  const [niveau, setNiveau] = useState(0)
  const [erreur, setErreur] = useState(null)
  const etatCourant = useRef('pret')
  const moteur = useRef(null)
  // Le moteur dont les signaux comptent encore : ceux d'un moteur fermé par
  // une pause ou une reprise ne doivent plus changer l'état
  const jeton = useRef(null)
  const enregistrement = useRef(null) // { id, debutIso, dernierRang, champs }
  const rappels = useRef({ champs, surMorceau, surEtat })
  useEffect(() => { rappels.current = { champs, surMorceau, surEtat } })

  const changerEtat = useCallback((nouveau) => {
    const ancien = etatCourant.current
    if (nouveau === ancien) return
    etatCourant.current = nouveau
    setEtat(nouveau)
    rappels.current.surEtat?.(nouveau, ancien)
  }, [])

  useEffect(() => {
    if (!minuterieActive(etat)) return undefined
    const minuterie = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(minuterie)
  }, [etat])

  // Fermer l'écran arrête l'enregistrement : le dernier morceau est gardé, et
  // un moteur encore en train de s'ouvrir se referme aussitôt (jeton nul)
  useEffect(() => () => {
    jeton.current = null
    etatCourant.current = 'pret'
    moteur.current?.arreter()
  }, [])

  const lancer = useCallback(async (reprise, enPlus = {}) => {
    // Une reprise sans enregistrement (arrêté entre-temps) ne doit pas en
    // ouvrir un nouveau, privé des champs de sa visite
    if (reprise && !enregistrement.current) return
    if (!reprise) {
      enregistrement.current = {
        id: crypto.randomUUID(), debutIso: new Date().toISOString(), dernierRang: 0,
        champs: { ...rappels.current.champs, ...enPlus },
      }
      setDebut(Date.now())
    }
    const enr = enregistrement.current
    const commun = { ...enr.champs, enregistrementId: enr.id, debutEnregistrement: enr.debutIso }
    const ceMoteur = {}
    jeton.current = ceMoteur
    setMaintenant(Date.now())
    const m = await demarrerEnregistreur({
      dureeMorceauMs: DUREE_MORCEAU_MS,
      rangDepart: enr.dernierRang + 1,
      onNiveau: setNiveau,
      onEvenement: (e) => {
        if (jeton.current !== ceMoteur) return
        changerEtat(etatApresEvenement(etatCourant.current, e.type))
      },
      onTranche: (t) => {
        rangerTranche({ ...t, ...commun, id: `${enr.id}:${t.rang}:${t.index}` }).catch(() => {})
      },
      onMorceau: async (brut) => {
        enr.dernierRang = Math.max(enr.dernierRang, brut.rang)
        const morceau = { ...brut, ...commun, id: crypto.randomUUID() }
        await rangerMorceau(morceau).catch(() => {})
        rappels.current.surMorceau?.(morceau)
      },
    })
    // Arrêté pendant que le micro s'ouvrait : rien ne doit tourner derrière
    if (jeton.current !== ceMoteur) { m.arreter(); return }
    moteur.current = m
    changerEtat('enregistre')
  }, [changerEtat])

  const demarrer = useCallback(async (enPlus) => {
    setErreur(null)
    try {
      await lancer(false, enPlus)
      return true
    } catch (err) {
      setErreur(messageDemarrage(err))
      return false
    }
  }, [lancer])

  // Pause voulue : le micro est rendu ; la reprise ouvre un nouveau moteur
  // dans le même enregistrement (les rangs continuent)
  const pause = useCallback(async () => {
    if (!['enregistre', 'muet'].includes(etatCourant.current)) return
    const m = moteur.current
    moteur.current = null
    jeton.current = null
    changerEtat('pause')
    setNiveau(0)
    await m?.arreter()
  }, [changerEtat])

  const reprendre = useCallback(async () => {
    // Arrêté (« Terminer », écran fermé) : plus rien à reprendre
    if (etatCourant.current === 'pret') return false
    setErreur(null)
    const ancien = moteur.current
    moteur.current = null
    jeton.current = null
    await ancien?.arreter()
    if (etatCourant.current === 'pret') return false
    try {
      await lancer(true)
      return true
    } catch (err) {
      setErreur(messageDemarrage(err))
      return false
    }
  }, [lancer])

  const arreter = useCallback(async () => {
    const m = moteur.current
    moteur.current = null
    jeton.current = null
    changerEtat('pret')
    await m?.arreter()
    enregistrement.current = null
    setNiveau(0)
    setDebut(null)
  }, [changerEtat])

  const couper = useCallback(() => moteur.current?.couper() ?? Promise.resolve(false), [])

  // Lu au moment de recoller des tranches orphelines : jamais celles-ci
  const enregistrementCourant = useCallback(() => enregistrement.current?.id ?? null, [])

  // Après une coupure (écran verrouillé, autre app), repartir seul dès que la
  // page revient : iOS l'accepte sans appui (essai du lot 0). Sinon, bouton.
  // Annulé si l'état change ou si l'écran se ferme pendant l'attente : sinon
  // « Terminer » dans ces 400 ms rouvrait un micro après la fin de la visite.
  useEffect(() => {
    if (etat !== 'coupe') return undefined
    let tente = false
    let annule = false
    const essayer = async () => {
      if (annule || tente || document.visibilityState !== 'visible') return
      tente = true
      await new Promise((r) => setTimeout(r, 400))
      if (annule) return
      await reprendre()
    }
    essayer()
    document.addEventListener('visibilitychange', essayer)
    return () => {
      annule = true
      document.removeEventListener('visibilitychange', essayer)
    }
  }, [etat, reprendre])

  return {
    possible: enregistrementPossible(), etat, niveau, erreur,
    duree_s: debut ? Math.max(0, (maintenant - debut) / 1000) : 0,
    demarrer, pause, reprendre, arreter, couper, enregistrementCourant,
  }
}
