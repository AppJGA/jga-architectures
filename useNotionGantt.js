/**
 * useNotionGantt.js
 * Hook React — Synchronisation bidirectionnelle Gantt ↔ Notion
 *
 * Usage :
 *   const { phases, affaires, loading, error, updatePhase, createPhase, deletePhase }
 *     = useNotionGantt({ affaireId: "xxx", serverUrl: "http://localhost:3001" });
 */

import { useState, useEffect, useRef, useCallback } from "react";

const DEFAULT_SERVER_URL = process.env.REACT_APP_GANTT_SERVER || "http://localhost:3001";

function buildWsUrl(serverUrl) {
  return serverUrl.replace(/^http/, "ws");
}

export function useNotionGantt({ affaireId = null, serverUrl = DEFAULT_SERVER_URL } = {}) {
  const [phases, setPhases]       = useState([]);
  const [affaires, setAffaires]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [connected, setConnected] = useState(false);

  const wsRef        = useRef(null);
  const reconnectRef = useRef(null);
  const affaireIdRef = useRef(affaireId);
  affaireIdRef.current = affaireId;

  // ── Merge local : met à jour les phases modifiées sans remplacer tout l'état
  const mergePhases = useCallback((updatedPhases) => {
    setPhases((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const p of updatedPhases) {
        if (!affaireIdRef.current || p.affaireIds?.includes(affaireIdRef.current)) {
          map.set(p.id, p);
        }
      }
      return Array.from(map.values()).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
    });
  }, []);

  const removePhase = useCallback((id) => {
    setPhases((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ── Chargement initial REST
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = affaireIdRef.current
        ? `${serverUrl}/phases?affaireId=${affaireIdRef.current}`
        : `${serverUrl}/phases`;

      const [phasesRes, affairesRes] = await Promise.all([
        fetch(url),
        fetch(`${serverUrl}/affaires`),
      ]);
      if (!phasesRes.ok || !affairesRes.ok)
        throw new Error("Erreur lors du chargement initial");

      const [phasesData, affairesData] = await Promise.all([
        phasesRes.json(),
        affairesRes.json(),
      ]);
      setPhases(phasesData);
      setAffaires(affairesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  // ── WebSocket — connexion avec reconnexion automatique
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(buildWsUrl(serverUrl));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectRef.retries = 0;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
          case "SNAPSHOT": {
            const filtered = affaireIdRef.current
              ? payload.phases.filter((p) => p.affaireIds?.includes(affaireIdRef.current))
              : payload.phases;
            setPhases(filtered);
            setLoading(false);
            break;
          }
          case "PHASES_UPDATED":
            mergePhases(payload.phases);
            break;
          case "PHASE_DELETED":
            removePhase(payload.id);
            break;
          default:
            console.warn("[WS] Message inconnu :", type);
        }
      } catch (err) {
        console.error("[WS] Erreur parsing :", err);
      }
    };

    ws.onerror = () => {
      setError("Connexion WebSocket perdue");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      // Backoff exponentiel : 1s, 2s, 4s, 8s … max 30s
      const delay = Math.min(30000, 1000 * 2 ** (reconnectRef.retries || 0));
      reconnectRef.retries = (reconnectRef.retries || 0) + 1;
      reconnectRef.current = setTimeout(connectWs, delay);
    };
  }, [serverUrl, mergePhases, removePhase]);

  useEffect(() => {
    loadInitialData();
    connectWs();
    return () => {
      wsRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [loadInitialData, connectWs]);

  // Rechargement si l'affaire active change
  useEffect(() => {
    loadInitialData();
  }, [affaireId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * updatePhase(id, changes)
   * Mise à jour optimiste locale + sync Notion.
   * changes peut contenir : dateDebut, dateFinPrevue, dateFinReelle,
   * validationMO, avancement, statut, ordre, observations, codePhase, type
   */
  const updatePhase = useCallback(async (id, changes) => {
    // Optimiste
    setPhases((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
    try {
      const res = await fetch(`${serverUrl}/phases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur PATCH Notion");
      }
      const confirmed = await res.json();
      setPhases((prev) => prev.map((p) => (p.id === id ? confirmed : p)));
    } catch (err) {
      setError(`Erreur sync : ${err.message}`);
      await loadInitialData(); // rollback
    }
  }, [serverUrl, loadInitialData]);

  /**
   * createPhase(data)
   * Crée une phase dans Notion et l'insère dans l'état local.
   */
  const createPhase = useCallback(async (data) => {
    try {
      const res = await fetch(`${serverUrl}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affaireId: affaireIdRef.current, ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur POST Notion");
      }
      const phase = await res.json();
      setPhases((prev) =>
        [...prev, phase].sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99))
      );
      return phase;
    } catch (err) {
      setError(`Erreur création : ${err.message}`);
      throw err;
    }
  }, [serverUrl]);

  /**
   * deletePhase(id)
   * Archive la phase dans Notion (soft delete).
   */
  const deletePhase = useCallback(async (id) => {
    setPhases((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`${serverUrl}/phases/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur DELETE Notion");
    } catch (err) {
      setError(`Erreur suppression : ${err.message}`);
      await loadInitialData();
    }
  }, [serverUrl, loadInitialData]);

  return {
    phases,       // Phase[] — triées par ordre Gantt
    affaires,     // Affaire[] — pour le sélecteur d'affaire
    loading,      // boolean
    error,        // string | null
    connected,    // boolean — état WebSocket
    updatePhase,  // (id, changes) => Promise<void>
    createPhase,  // (data) => Promise<Phase>
    deletePhase,  // (id) => Promise<void>
    reload: loadInitialData,
  };
}

// ─── Exemple d'intégration dans un composant Gantt ───────────────────────────
//
// import { useNotionGantt } from "./useNotionGantt";
//
// function GanttView({ affaireId }) {
//   const { phases, loading, connected, updatePhase } = useNotionGantt({ affaireId });
//
//   // Glisser-déposer une barre → sync Notion automatique
//   const onBarDrop = (id, newStart, newEnd) =>
//     updatePhase(id, { dateDebut: newStart, dateFinPrevue: newEnd });
//
//   // Clic jalon MO → valide la phase
//   const onValidationMO = (id, date) =>
//     updatePhase(id, { validationMO: date, statut: "Rendu" });
//
//   if (loading) return <Spinner />;
//   return (
//     <GanttChart
//       phases={phases}
//       onBarDrop={onBarDrop}
//       onValidationMO={onValidationMO}
//       connected={connected}
//     />
//   );
// }
