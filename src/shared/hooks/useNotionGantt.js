/**
 * useNotionGantt.js — adapté pour Vite (import.meta.env) depuis le fichier fourni.
 * Ajouts par rapport à l'original : prop `enabled`, état `lastUpdateAt`.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const DEFAULT_SERVER = import.meta.env.VITE_GANTT_SERVER ?? 'http://localhost:3001'

function buildWsUrl(url) {
  return url.replace(/^http/, 'ws')
}

export function useNotionGantt({
  affaireId = null,
  serverUrl = DEFAULT_SERVER,
  enabled = true,
} = {}) {
  const [phases, setPhases]           = useState([])
  const [affaires, setAffaires]       = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [connected, setConnected]     = useState(false)
  const [lastUpdateAt, setLastUpdateAt] = useState(null)

  const wsRef        = useRef(null)
  const reconnectRef = useRef(null)
  const affaireIdRef = useRef(affaireId)
  affaireIdRef.current = affaireId

  // ── Merge partiel : met à jour uniquement les phases modifiées ────────────────
  const mergePhases = useCallback((updatedPhases) => {
    setPhases(prev => {
      const map = new Map(prev.map(p => [p.id, p]))
      for (const p of updatedPhases) {
        if (!affaireIdRef.current || p.affaireIds?.includes(affaireIdRef.current)) {
          map.set(p.id, p)
        }
      }
      return Array.from(map.values()).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99))
    })
    setLastUpdateAt(Date.now())
  }, [])

  const removePhase = useCallback((id) => {
    setPhases(prev => prev.filter(p => p.id !== id))
  }, [])

  // ── Chargement initial REST ───────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    if (!enabled) return
    try {
      setLoading(true)
      setError(null)
      const url = affaireIdRef.current
        ? `${serverUrl}/phases?affaireId=${affaireIdRef.current}`
        : `${serverUrl}/phases`
      const [phasesRes, affairesRes] = await Promise.all([
        fetch(url),
        fetch(`${serverUrl}/affaires`),
      ])
      if (!phasesRes.ok || !affairesRes.ok) throw new Error('Erreur chargement initial')
      const [phasesData, affairesData] = await Promise.all([
        phasesRes.json(),
        affairesRes.json(),
      ])
      setPhases(phasesData)
      setAffaires(affairesData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [serverUrl, enabled])

  // ── WebSocket avec reconnexion exponentielle ──────────────────────────────────
  const connectWs = useCallback(() => {
    if (!enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    let ws
    try { ws = new WebSocket(buildWsUrl(serverUrl)) }
    catch { setConnected(false); return }

    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setError(null)
      reconnectRef.retries = 0
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }
    }

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data)
        switch (type) {
          case 'SNAPSHOT': {
            const filtered = affaireIdRef.current
              ? payload.phases.filter(p => p.affaireIds?.includes(affaireIdRef.current))
              : payload.phases
            setPhases(filtered)
            setLoading(false)
            break
          }
          case 'PHASES_UPDATED':
            mergePhases(payload.phases)
            break
          case 'PHASE_DELETED':
            removePhase(payload.id)
            break
          default: break
        }
      } catch { /* ignore malformed messages */ }
    }

    ws.onerror = () => { setError('Connexion WebSocket perdue'); setConnected(false) }

    ws.onclose = () => {
      setConnected(false)
      if (!enabled) return
      const delay = Math.min(30000, 1000 * 2 ** (reconnectRef.retries || 0))
      reconnectRef.retries = (reconnectRef.retries || 0) + 1
      reconnectRef.current = setTimeout(connectWs, delay)
    }
  }, [serverUrl, enabled, mergePhases, removePhase])

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close()
      setConnected(false)
      setPhases([])
      return
    }
    loadInitialData()
    connectWs()
    return () => {
      wsRef.current?.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [enabled, loadInitialData, connectWs])

  // Recharger si affaireId change
  useEffect(() => {
    if (enabled) loadInitialData()
  }, [affaireId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const updatePhase = useCallback(async (id, changes) => {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p))
    try {
      const res = await fetch(`${serverUrl}/phases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur PATCH')
      const confirmed = await res.json()
      setPhases(prev => prev.map(p => p.id === id ? confirmed : p))
    } catch (err) {
      console.warn('[useNotionGantt] updatePhase:', err.message)
      await loadInitialData()
    }
  }, [serverUrl, loadInitialData])

  const createPhase = useCallback(async (data) => {
    try {
      const res = await fetch(`${serverUrl}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affaireId: affaireIdRef.current, ...data }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur POST')
      const phase = await res.json()
      setPhases(prev => [...prev, phase].sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)))
      return phase
    } catch (err) {
      console.warn('[useNotionGantt] createPhase:', err.message)
      throw err
    }
  }, [serverUrl])

  const deletePhase = useCallback(async (id) => {
    setPhases(prev => prev.filter(p => p.id !== id))
    try {
      const res = await fetch(`${serverUrl}/phases/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur DELETE')
    } catch (err) {
      console.warn('[useNotionGantt] deletePhase:', err.message)
      await loadInitialData()
    }
  }, [serverUrl, loadInitialData])

  return {
    phases, affaires, loading, error, connected, lastUpdateAt,
    updatePhase, createPhase, deletePhase,
    reload: loadInitialData,
  }
}
