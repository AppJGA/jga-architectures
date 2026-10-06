import { useEffect, useState } from 'react'

// Réseau présent ou non, et date lisible de la dernière synchronisation

export function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    return () => {
      window.removeEventListener('online', maj)
      window.removeEventListener('offline', maj)
    }
  }, [])
  return enLigne
}

export function libelleSynchro(date, maintenant = new Date()) {
  if (!date) return null
  const memeJour = date.toDateString() === maintenant.toDateString()
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
  return memeJour
    ? `aujourd’hui à ${heure}`
    : `le ${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${heure}`
}
