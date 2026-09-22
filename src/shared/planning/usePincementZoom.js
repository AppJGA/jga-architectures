import { useEffect, useLayoutEffect, useRef } from 'react'
import { zoomPincement } from './pincement'

// ─── Zoom au pincement sur le volet défilant d'un planning (iPad) ────────────
//
// Deux doigts qui s'écartent zooment le planning, qui se rapprochent le
// dézooment — seulement dans le sens du temps. Sans cela, Safari zoomait la
// page entière.
//
// · Le calcul suit les événements TACTILES : sur iOS, un geste à deux doigts
//   suivi par les pointeurs finit en `pointercancel` dès que Safari le prend
//   pour un défilement.
// · Les gestes des barres, eux, suivent les pointeurs. Dès qu'un deuxième
//   doigt se pose, le geste du premier reçoit un `pointercancel` : chaque
//   geste du planning le traite déjà comme une interruption (rien n'est
//   enregistré, aucune roue ne s'ouvre). Le `pointerdown` du deuxième doigt
//   est arrêté avant d'atteindre une barre.
// · Le volet porte `touch-action: pan-x pan-y` (défilement à un doigt gardé,
//   zoom natif refusé) et l'événement `gesture*` propre à Safari est bloqué.
//
// Un événement `jga-pincement` est émis sur le volet au début du geste : la
// timeline y arrête son recadrage animé, qui se disputerait le défilement.

/**
 * @param voletRef { current } — élément défilant de la timeline
 * @param options { lire(), appliquer(valeur), min, max, pas, surZoom(valeur), actif }
 */
export function usePincementZoom(voletRef, options) {
  const optionsRef = useRef(options)
  useLayoutEffect(() => { optionsRef.current = options })

  const actif = options.actif !== false
  useEffect(() => {
    const volet = voletRef.current
    if (!volet || !actif) return

    // Pointeurs tactiles posés, et cible du premier (pour lui annuler son geste)
    const doigts = new Map()
    let geste = null   // { depart, ecartDepart, pointContenu }
    let image = null

    const surPointerDown = (e) => {
      if (e.pointerType !== 'touch') return
      doigts.set(e.pointerId, e.target)
      if (doigts.size < 2) return
      // Deuxième doigt : il ne commence rien sur une barre, et le premier
      // abandonne son geste
      e.stopPropagation()
      for (const [id, cible] of doigts) {
        if (id === e.pointerId || !cible?.isConnected) continue
        cible.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: 'touch' }))
      }
    }
    const surPointerFin = (e) => { if (e.isTrusted) doigts.delete(e.pointerId) }

    const mesure = (touches) => {
      const [a, b] = [touches[0], touches[1]]
      const rect = volet.getBoundingClientRect()
      return {
        ecart: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        milieuX: (a.clientX + b.clientX) / 2 - rect.left,
      }
    }

    const surTouchStart = (e) => {
      if (e.touches.length !== 2) return
      const o = optionsRef.current
      const { ecart, milieuX } = mesure(e.touches)
      geste = { depart: o.lire(), ecartDepart: ecart, pointContenu: volet.scrollLeft + milieuX }
      volet.dispatchEvent(new CustomEvent('jga-pincement'))
    }

    const surTouchMove = (e) => {
      if (!geste || e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      const o = optionsRef.current
      const { ecart, milieuX } = mesure(e.touches)
      const { valeur, scrollLeft } = zoomPincement({
        depart: geste.depart, ecartDepart: geste.ecartDepart, ecart,
        min: o.min, max: o.max, pas: o.pas, pointContenu: geste.pointContenu, milieuX,
      })
      if (valeur !== o.lire()) {
        o.appliquer(valeur)
        o.surZoom?.(valeur)
      }
      // Recalé une fois le planning redessiné à la nouvelle échelle
      cancelAnimationFrame(image)
      image = requestAnimationFrame(() => { volet.scrollLeft = scrollLeft })
    }

    const surTouchFin = (e) => {
      if (e.touches.length < 2) geste = null
      // Filet de sécurité : un relâchement manqué laisserait croire qu'un doigt
      // est encore posé, et le toucher suivant passerait pour un pincement
      if (e.touches.length === 0) doigts.clear()
    }
    const bloquerGeste = (e) => e.preventDefault()

    volet.addEventListener('pointerdown', surPointerDown, true)
    window.addEventListener('pointerup', surPointerFin, true)
    window.addEventListener('pointercancel', surPointerFin, true)
    volet.addEventListener('touchstart', surTouchStart, { passive: true })
    volet.addEventListener('touchmove', surTouchMove, { passive: false })
    volet.addEventListener('touchend', surTouchFin)
    volet.addEventListener('touchcancel', surTouchFin)
    volet.addEventListener('gesturestart', bloquerGeste)
    volet.addEventListener('gesturechange', bloquerGeste)
    return () => {
      cancelAnimationFrame(image)
      volet.removeEventListener('pointerdown', surPointerDown, true)
      window.removeEventListener('pointerup', surPointerFin, true)
      window.removeEventListener('pointercancel', surPointerFin, true)
      volet.removeEventListener('touchstart', surTouchStart)
      volet.removeEventListener('touchmove', surTouchMove)
      volet.removeEventListener('touchend', surTouchFin)
      volet.removeEventListener('touchcancel', surTouchFin)
      volet.removeEventListener('gesturestart', bloquerGeste)
      volet.removeEventListener('gesturechange', bloquerGeste)
    }
  }, [voletRef, actif])
}
