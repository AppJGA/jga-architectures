import { useEffect, useState } from 'react'
import { resumeParVisite } from './fileLogique'
import { toutesOperations, visitesEmportees, envoyerTout, envoiEnCours, EVENEMENT_FILE } from './synchro'

// ─── Ce qui attend sur l'appareil, pour toute l'app ──────────────────────────

/** Les modifications en attente, visite par visite, relues à chaque changement */
export function useFileGlobale() {
  const [lignes, setLignes] = useState([])
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => {
    let abandon = false
    const relire = async () => {
      const [ops, visites] = await Promise.all([toutesOperations(), visitesEmportees()])
      if (abandon) return
      setLignes(resumeParVisite(ops, visites))
      setEnvoi(envoiEnCours())
    }
    relire()
    window.addEventListener(EVENEMENT_FILE, relire)
    window.addEventListener('online', relire)
    return () => {
      abandon = true
      window.removeEventListener(EVENEMENT_FILE, relire)
      window.removeEventListener('online', relire)
    }
  }, [])
  return { lignes, envoiEnCours: envoi }
}

/**
 * Fait partir la file sans attendre qu'on rouvre la visite : à l'ouverture
 * de l'app, au retour du réseau, quand l'app revient au premier plan, et
 * toutes les minutes tant qu'il reste quelque chose. Monté une fois (AppShell),
 * jamais dans le cadre caché de la préparation.
 */
export function useMoteurSynchro() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.top !== window) return undefined
    const lancer = () => {
      if (navigator.onLine === false) return
      envoyerTout().catch((err) => console.warn('Envoi des modifications :', err))
    }
    const auPremierPlan = () => { if (document.visibilityState === 'visible') lancer() }
    lancer()
    window.addEventListener('online', lancer)
    document.addEventListener('visibilitychange', auPremierPlan)
    const minuterie = setInterval(lancer, 60_000)
    return () => {
      window.removeEventListener('online', lancer)
      document.removeEventListener('visibilitychange', auPremierPlan)
      clearInterval(minuterie)
    }
  }, [])
}
