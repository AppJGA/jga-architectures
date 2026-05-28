"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { GanttTask, Lot } from "@/lib/gantt-types"
import {
  parseDate, formatDateISO, applyLag
} from "@/lib/gantt-types"
import { supabase } from "@/lib/supabase-client"
import { GanttToolbar } from "./gantt-toolbar"
import { GanttSidebar } from "./gantt-sidebar"
import { GanttTimeline, HEADER_HEIGHT } from "./gantt-timeline"
import { TaskEditModal } from "./task-edit-modal"
import { LotsModal, type LotDraft } from "./lots-modal"
import { ExportPdfModal } from "./export-pdf-modal"

interface GanttChartProps {
  affaireId: string
  affaireNumero?: string
  affaireTitre?: string
}

// ─── Propagation en cascade avec conservation du lag ─────────────────────────
//
// Règle : debut(enfant) = fin(parent) + lag_days(enfant)
//   - lag_days est calculé une seule fois à la création du lien
//   - il est conservé à chaque propagation ultérieure
//
interface TaskUpdate {
  id: number
  debut: string
}

function propagateDependencies(
  allTasks: GanttTask[],
  changedTaskId: number,
  newDebut: string,
  newDuree: number
): TaskUpdate[] {
  const snapshot = new Map<number, GanttTask>()
  allTasks.forEach((t) => snapshot.set(t.id, { ...t }))
  snapshot.set(changedTaskId, {
    ...snapshot.get(changedTaskId)!,
    debut: newDebut,
    duree: newDuree,
  })

  const updates: TaskUpdate[] = []
  const queue: number[] = [changedTaskId]
  const visited = new Set<number>()

  while (queue.length > 0) {
    const parentId = queue.shift()!
    if (visited.has(parentId)) continue
    visited.add(parentId)

    const parent = snapshot.get(parentId)!
    // Cherche les enfants dans le snapshot (pas allTasks) pour avoir les lag_days à jour
    snapshot.forEach((child) => {
      if (child.depends_on !== parentId) return
      const lag = child.lag_days ?? 0
      const newChildDebut = formatDateISO(applyLag(parseDate(parent.debut), parent.duree, lag))

      if (newChildDebut !== child.debut) {
        snapshot.set(child.id, { ...child, debut: newChildDebut })
        updates.push({ id: child.id, debut: newChildDebut })
        queue.push(child.id)
      }
    })
  }

  return updates
}

// ──────────────────────────────────────────────────────────────────────────────

export function GanttChart({ affaireId, affaireNumero = "", affaireTitre = "" }: GanttChartProps) {
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [dayWidth, setDayWidth] = useState(40)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingTask, setEditingTask] = useState<GanttTask | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskModalMode, setTaskModalMode] = useState<"edit" | "create">("edit")
  const [showLotsModal, setShowLotsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  const ROW_HEIGHT = 40

  // ── Scroll sync ──────────────────────────────────────────────────────────────
  const sidebarRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef<"sidebar" | "timeline" | null>(null)

  const syncScroll = useCallback((source: "sidebar" | "timeline", scrollTop: number) => {
    if (isScrolling.current && isScrolling.current !== source) return
    isScrolling.current = source
    if (source === "sidebar" && timelineRef.current) {
      timelineRef.current.scrollTop = scrollTop
    } else if (source === "timeline" && sidebarRef.current) {
      sidebarRef.current.scrollTop = scrollTop
    }
    requestAnimationFrame(() => { isScrolling.current = null })
  }, [])

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [{ data: resLots, error: lotsErr }, { data: resTaches, error: tachesErr }] =
      await Promise.all([
        supabase.from("lots").select("*").eq("affaire_id", affaireId).order("num_lot"),
        supabase.from("planning").select("*").eq("affaire_id", affaireId).order("id"),
      ])

    if (lotsErr || tachesErr) {
      setError(lotsErr?.message ?? tachesErr?.message ?? "Erreur de chargement")
      setIsLoading(false)
      return
    }

    setLots(resLots ?? [])
    if (resTaches) {
      setTasks(resTaches.map((t) => ({
        ...t,
        debut: typeof t.debut === "string" ? t.debut.split("T")[0] : formatDateISO(new Date(t.debut)),
        duree: Number(t.duree),
        avancement: Number(t.avancement ?? 0),
        lag_days: t.lag_days != null ? Number(t.lag_days) : 0,
      })))
    }
    setIsLoading(false)
  }, [affaireId])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  // ── Task save ────────────────────────────────────────────────────────────────
  const handleSaveTask = async (taskData: Partial<GanttTask> & { id?: number }) => {
    const payload = {
      num_tache: taskData.num_tache,
      nom: taskData.nom,
      debut: taskData.debut,
      duree: taskData.duree,
      avancement: taskData.avancement ?? 0,
      lot_id: taskData.lot_id ?? null,
      depends_on: taskData.depends_on ?? null,
      lag_days: taskData.lag_days ?? 0,
      affaire_id: affaireId,
    }
    if (taskModalMode === "create") {
      const { error } = await supabase.from("planning").insert([payload])
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from("planning").update(payload).eq("id", taskData.id!)
      if (error) throw new Error(error.message)
    }
    await fetchAllData()
  }

  // ── Task delete ───────────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId: number) => {
    const { error } = await supabase.from("planning").delete().eq("id", taskId)
    if (error) throw new Error(error.message)
    await fetchAllData()
  }

  // ── Dépendances ───────────────────────────────────────────────────────────────
  const handleDependencyCreate = useCallback(async (fromTaskId: number, toTaskId: number, lagDays: number) => {
    setTasks((prev) => prev.map((t) =>
      t.id === toTaskId ? { ...t, depends_on: fromTaskId, lag_days: lagDays } : t
    ))
    const { error } = await supabase
      .from("planning")
      .update({ depends_on: fromTaskId, lag_days: lagDays })
      .eq("id", toTaskId)
    if (error) { console.error("Dependency create failed:", error.message); await fetchAllData() }
  }, [fetchAllData])

  const handleDependencyDelete = useCallback(async (fromTaskId: number, toTaskId: number) => {
    setTasks((prev) => prev.map((t) =>
      t.id === toTaskId && t.depends_on === fromTaskId
        ? { ...t, depends_on: null, lag_days: 0 }
        : t
    ))
    const { error } = await supabase
      .from("planning")
      .update({ depends_on: null, lag_days: 0 })
      .eq("id", toTaskId)
    if (error) { console.error("Dependency delete failed:", error.message); await fetchAllData() }
  }, [fetchAllData])

  // ── Drag/resize avec propagation en cascade ───────────────────────────────────
  const handleTaskUpdate = useCallback(
    async (taskId: number, changes: { debut?: string; duree?: number }) => {
      setTasks((prevTasks) => {
        const movedTask = prevTasks.find((t) => t.id === taskId)
        if (!movedTask) return prevTasks

        const newDebut = changes.debut ?? movedTask.debut
        const newDuree = changes.duree ?? movedTask.duree
        const cascadeUpdates = propagateDependencies(prevTasks, taskId, newDebut, newDuree)

        const updatedMap = new Map<number, string>([[taskId, newDebut]])
        cascadeUpdates.forEach((u) => updatedMap.set(u.id, u.debut))

        const nextTasks = prevTasks.map((t) => {
          if (t.id === taskId) return { ...t, debut: newDebut, duree: newDuree }
          const cascadedDebut = updatedMap.get(t.id)
          if (cascadedDebut) return { ...t, debut: cascadedDebut }
          return t
        })

        persistCascadeUpdates(taskId, changes, cascadeUpdates)
        return nextTasks
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchAllData]
  )

  const persistCascadeUpdates = useCallback(async (
    taskId: number,
    changes: { debut?: string; duree?: number },
    cascadeUpdates: TaskUpdate[]
  ) => {
    const { error: mainErr } = await supabase.from("planning").update(changes).eq("id", taskId)
    if (mainErr) { console.error("Task update failed:", mainErr.message); await fetchAllData(); return }

    if (cascadeUpdates.length > 0) {
      const results = await Promise.all(
        cascadeUpdates.map((u) =>
          supabase.from("planning").update({ debut: u.debut }).eq("id", u.id)
        )
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) { console.error("Cascade update failed:", failed.error.message); await fetchAllData() }
    }
  }, [fetchAllData])

  // ── Avancement inline ────────────────────────────────────────────────────────
  const handleAvancementChange = useCallback(async (taskId: number, value: number) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, avancement: value } : t))
    await supabase.from("planning").update({ avancement: value }).eq("id", taskId)
  }, [])

  // ── Lots save ────────────────────────────────────────────────────────────────
  const handleSaveLots = async (draftLots: LotDraft[]) => {
    const newLots = draftLots.filter((l) => !l.id)
    const existingLots = draftLots.filter((l) => l.id)

    if (newLots.length > 0) {
      const { error } = await supabase.from("lots").insert(
        newLots.map((l) => ({ affaire_id: affaireId, num_lot: l.num_lot, nom: l.nom, couleur: l.couleur }))
      )
      if (error) throw new Error(error.message)
    }
    for (const l of existingLots) {
      const { error } = await supabase.from("lots")
        .update({ affaire_id: affaireId, num_lot: l.num_lot, nom: l.nom, couleur: l.couleur })
        .eq("id", l.id!)
      if (error) throw new Error(error.message)
    }
    const survivingIds = existingLots.map((l) => l.id!)
    const removedIds = lots.map((l) => l.id).filter((id) => !survivingIds.includes(id))
    if (removedIds.length > 0) await supabase.from("lots").delete().in("id", removedIds)
    await fetchAllData()
  }

  // ── Export PDF : ouvre un nouvel onglet propre sans aucun Dialog ────────────
  // window.print() sur la page courante inclut toujours les Dialogs Radix (montés
  // en portail, jamais vraiment retirés du DOM). La seule solution fiable est
  // d'ouvrir un nouvel onglet qui ne contient QUE le planning.
  const handleRequestPrint = useCallback((config: {
    selectedLotIds: number[]
    dateDebut: string
    dateFin: string
    orientation: "paysage" | "portrait"
  }) => {
    setShowExportModal(false)

    const win = window.open("", "_blank")
    if (!win) {
      alert("Autorisez les pop-ups pour exporter en PDF.")
      return
    }

    // Récupère la feuille de styles de la page courante
    const styles = Array.from(document.styleSheets)
      .map((ss) => {
        try {
          return Array.from(ss.cssRules).map((r) => r.cssText).join("\n")
        } catch { return "" }
      })
      .join("\n")

    // Clone uniquement le conteneur Gantt (sidebar + timeline)
    const ganttEl = document.getElementById("gantt-print-root")
    const ganttHtml = ganttEl ? ganttEl.outerHTML : "<p>Gantt non trouvé</p>"

    const orientation = config.orientation === "paysage" ? "landscape" : "portrait"

    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Planning – ${affaireTitre}</title>
  <style>
    @page { size: A3 ${orientation}; margin: 10mm 8mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; background: white; color: black; }
    ${styles}
    /* Masque les éléments non-print */
    [data-print="hidden"], [data-handle], [data-editbtn], [data-connection-point] { display: none !important; }
    .sticky { position: static !important; }
    .overflow-auto, .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
    h2.print-title { font-size: 14pt; font-weight: 800; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 2px solid #e4702a; }
    p.print-subtitle { font-size: 9pt; color: #666; margin: 0 0 6mm; }
  </style>
</head>
<body>
  <h2 class="print-title">${affaireTitre}</h2>
  <p class="print-subtitle">${affaireNumero} · Généré le ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>
  ${ganttHtml}
  <script>
    window.onload = () => { window.print(); window.close(); }
  </script>
</body>
</html>`)
    win.document.close()
  }, [affaireTitre, affaireNumero])

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  const handleZoomIn = () => setDayWidth((w) => Math.min(100, w + 5))
  const handleZoomOut = () => setDayWidth((w) => Math.max(15, w - 5))

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Chargement du planning…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <p className="text-destructive font-medium">Erreur de chargement</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={fetchAllData} className="text-sm text-primary underline">Réessayer</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">

      {/* En-tête visible uniquement à l'impression */}
      <div className="print-header">
        <h1>{affaireTitre}</h1>
        <p>
          {affaireNumero} · Planning généré le{" "}
          {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <div data-print="hidden">
      <GanttToolbar
        affaireId={affaireId}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onOpenLots={() => setShowLotsModal(true)}
        onExportPdf={() => setShowExportModal(true)}
        onAddTask={() => {
          setEditingTask(null)
          setTaskModalMode("create")
          setShowTaskModal(true)
        }}
        dayWidth={dayWidth}
      />
      </div>

      <div id="gantt-print-root" className="flex flex-1 overflow-hidden">
        <div
          ref={sidebarRef}
          onScroll={(e) => syncScroll("sidebar", (e.target as HTMLElement).scrollTop)}
          className="w-[320px] shrink-0 overflow-y-auto overflow-x-hidden border-r border-border bg-card"
          style={{ scrollbarWidth: "none" }}
        >
          <GanttSidebar
            tasks={tasks}
            lots={lots}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            onEdit={(t) => {
              setEditingTask(t)
              setTaskModalMode("edit")
              setShowTaskModal(true)
            }}
            onAvancementChange={handleAvancementChange}
          />
        </div>

        <div
          ref={timelineRef}
          onScroll={(e) => syncScroll("timeline", (e.target as HTMLElement).scrollTop)}
          className="flex-1 overflow-auto"
        >
          <GanttTimeline
            tasks={tasks}
            lots={lots}
            dayWidth={dayWidth}
            rowHeight={ROW_HEIGHT}
            onTaskClick={(t) => {
              setEditingTask(t)
              setTaskModalMode("edit")
              setShowTaskModal(true)
            }}
            onTaskUpdate={handleTaskUpdate}
            onDependencyCreate={handleDependencyCreate}
            onDependencyDelete={handleDependencyDelete}
          />
        </div>
      </div>

      <TaskEditModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        task={editingTask}
        tasks={tasks}
        lots={lots}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        mode={taskModalMode}
      />

      <LotsModal
        open={showLotsModal}
        onClose={() => setShowLotsModal(false)}
        lots={lots}
        affaireId={affaireId}
        onSave={handleSaveLots}
      />

      <ExportPdfModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        lots={lots}
        tasks={tasks}
        affaireNumero={affaireNumero}
        affaireTitre={affaireTitre}
        onPrint={handleRequestPrint}
      />
    </div>
  )
}