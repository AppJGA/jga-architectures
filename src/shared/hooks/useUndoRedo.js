import { useState, useCallback, useRef } from 'react'

// ─── Historique annuler / rétablir ───────────────────────────────────────────
//
// Deux piles d'instantanés. `undo` et `redo` reçoivent l'état courant et le
// basculent dans la pile opposée : c'est ce qui rend la navigation symétrique
// (annuler puis rétablir puis annuler à nouveau).
//
// `beginPending` / `commitPending` servent aux gestes dont l'état est déjà
// modifié en local au moment où l'on apprend qu'ils sont terminés — un
// glissement de segment, par exemple. L'instantané est pris au mousedown, mis
// de côté, et n'entre dans l'historique que si le geste aboutit : un simple
// clic sans déplacement ne laisse donc pas d'entrée vide.

export function useUndoRedo(maxHistory = 20) {
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const pending = useRef(null)

  const empiler = (pile, snapshot) => {
    const suite = [...pile, snapshot]
    return suite.length > maxHistory ? suite.slice(suite.length - maxHistory) : suite
  }

  const saveSnapshot = useCallback((snapshot) => {
    setPast((prev) => empiler(prev, snapshot))
    // Toute action nouvelle rend le rétablissement caduc
    setFuture([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxHistory])

  const beginPending = useCallback((snapshot) => { pending.current = snapshot }, [])

  const commitPending = useCallback(() => {
    if (!pending.current) return false
    saveSnapshot(pending.current)
    pending.current = null
    return true
  }, [saveSnapshot])

  const cancelPending = useCallback(() => { pending.current = null }, [])

  // Renvoie l'instantané à restaurer, ou null. L'état courant part dans la pile
  // opposée pour que le mouvement inverse reste possible.
  const undo = useCallback((courant) => {
    if (past.length === 0) return null
    const precedent = past[past.length - 1]
    setPast((prev) => prev.slice(0, -1))
    setFuture((prev) => [courant, ...prev].slice(0, maxHistory))
    return precedent
  }, [past, maxHistory])

  const redo = useCallback((courant) => {
    if (future.length === 0) return null
    const suivant = future[0]
    setFuture((prev) => prev.slice(1))
    setPast((prev) => empiler(prev, courant))
    return suivant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [future, maxHistory])

  const reset = useCallback(() => {
    setPast([])
    setFuture([])
    pending.current = null
  }, [])

  return {
    saveSnapshot,
    beginPending,
    commitPending,
    cancelPending,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    labelUndo: past.length ? past[past.length - 1].label : null,
    labelRedo: future.length ? future[0].label : null,
    historyLength: past.length,
  }
}
