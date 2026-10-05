// ─── Le geste de glisser une remarque ────────────────────────────────────────
//
// Événements pointeur, comme les plannings : la souris et le doigt suivent le
// même chemin. Le geste part d'une poignée (`touch-action: none`) : sur
// l'iPad, le reste de la carte continue de faire défiler la liste. La cible
// se lit sous le doigt (`data-cible-depot`) ; un `pointercancel` (pincement,
// défilement repris par Safari) annule tout, rien n'est enregistré.

import { useState, useEffect, useRef, useCallback } from 'react'
import { depotUtile } from './glisserLogique'

const cibleSous = (x, y) => document.elementFromPoint(x, y)?.closest('[data-cible-depot]')?.dataset.cibleDepot ?? null

export function useGlisserRemarque({ onDeposer }) {
  const [geste, setGeste] = useState(null) // { rem, pointeur, x, y, cible }
  const deposer = useRef(onDeposer)
  useEffect(() => { deposer.current = onDeposer }, [onDeposer])

  const demarrer = useCallback((e, rem) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Pas de sélection de texte ni de défilement pendant le geste
    e.preventDefault()
    e.stopPropagation()
    setGeste({ rem, pointeur: e.pointerId, x: e.clientX, y: e.clientY, cible: null })
  }, [])

  const enCours = geste !== null
  const pointeur = geste?.pointeur
  const rem = geste?.rem

  useEffect(() => {
    if (!enCours) return undefined
    const bouger = (e) => {
      if (e.pointerId !== pointeur) return
      e.preventDefault()
      const cible = cibleSous(e.clientX, e.clientY)
      setGeste((g) => (g ? { ...g, x: e.clientX, y: e.clientY, cible } : g))
    }
    const lacher = (e) => {
      if (e.pointerId !== pointeur) return
      const cible = cibleSous(e.clientX, e.clientY)
      setGeste(null)
      if (depotUtile(rem, cible)) deposer.current?.(rem, cible)
    }
    const annuler = (e) => { if (!e.pointerId || e.pointerId === pointeur) setGeste(null) }
    const echap = (e) => { if (e.key === 'Escape') setGeste(null) }
    window.addEventListener('pointermove', bouger, { passive: false })
    window.addEventListener('pointerup', lacher)
    window.addEventListener('pointercancel', annuler)
    window.addEventListener('keydown', echap)
    return () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', lacher)
      window.removeEventListener('pointercancel', annuler)
      window.removeEventListener('keydown', echap)
    }
  }, [enCours, pointeur, rem])

  return { geste, demarrer }
}
