"use client"

import { useMemo, useRef, useCallback, useState, useEffect } from "react"
import { Pencil } from "lucide-react"
import type { GanttTask, Lot } from "@/lib/gantt-types"
import {
  parseDate,
  formatDateISO,
  isWorkingDay,
  calendarOffsetFromRef,
  workingDaysToCalendarDays,
  computeLag,
} from "@/lib/gantt-types"

const TIMELINE_DAYS = 180
export const HEADER_HEIGHT = 64

interface ConnectionPoint {
  taskId: number
  side: "start" | "end"
  x: number
  y: number
}

interface DependencyArrow {
  id: string
  fromTaskId: number
  toTaskId: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface GanttTimelineProps {
  tasks: GanttTask[]
  lots: Lot[]
  dayWidth: number
  rowHeight: number
  onTaskClick: (task: GanttTask) => void
  onTaskUpdate: (taskId: number, changes: { debut?: string; duree?: number }) => void
  onDependencyCreate: (fromTaskId: number, toTaskId: number, lagDays: number) => void
  onDependencyDelete: (fromTaskId: number, toTaskId: number) => void
}

function getTaskGeometry(task: GanttTask, dateRef: Date, dayWidth: number) {
  const debut = parseDate(task.debut)
  const left = calendarOffsetFromRef(dateRef, debut) * dayWidth
  const calDays = workingDaysToCalendarDays(debut, task.duree)
  const width = Math.max(calDays * dayWidth, dayWidth * 0.8)
  return { left, width }
}

export function GanttTimeline({
  tasks, lots, dayWidth, rowHeight,
  onTaskClick, onTaskUpdate, onDependencyCreate, onDependencyDelete,
}: GanttTimelineProps) {

  // ── Date référence ───────────────────────────────────────────────────────────
  const dateRef = useMemo(() => {
    if (tasks.length === 0) {
      const d = new Date(); d.setDate(d.getDate() - 7); return d
    }
    const min = new Date(Math.min(...tasks.map((t) => parseDate(t.debut).getTime())))
    min.setDate(min.getDate() - 5)
    while (min.getDay() !== 1) min.setDate(min.getDate() - 1)
    return min
  }, [tasks])

  const days = useMemo(() =>
    Array.from({ length: TIMELINE_DAYS }, (_, i) => {
      const d = new Date(dateRef); d.setDate(d.getDate() + i); return d
    }), [dateRef])

  const totalWidth = TIMELINE_DAYS * dayWidth

  const lotsWithTasks = useMemo(() =>
    lots.map((lot) => ({ lot, tasks: tasks.filter((t) => t.lot_id === lot.id) }))
        .filter(({ tasks }) => tasks.length > 0),
    [lots, tasks])

  const unassigned = useMemo(() => tasks.filter((t) => t.lot_id == null), [tasks])

  // Index de ligne (même ordre que sidebar)
  const rowIndexMap = useMemo(() => {
    const map: Record<number, number> = {}
    let idx = 0
    lotsWithTasks.forEach(({ tasks: lt }) => {
      idx++ // lot header
      lt.forEach((t) => { map[t.id] = idx++ })
    })
    if (unassigned.length > 0) {
      idx++
      unassigned.forEach((t) => { map[t.id] = idx++ })
    }
    return map
  }, [lotsWithTasks, unassigned])

  // Hauteur totale du body — nécessaire pour que le SVG ait une hauteur explicite
  const totalBodyRows = useMemo(() => {
    let n = 0
    lotsWithTasks.forEach(({ tasks: lt }) => { n += 1 + lt.length })
    if (unassigned.length > 0) n += 1 + unassigned.length
    return n
  }, [lotsWithTasks, unassigned])
  const totalBodyHeight = totalBodyRows * rowHeight

  // ── Drag barre ───────────────────────────────────────────────────────────────
  const barDragRef = useRef<{
    type: "move" | "resize-left" | "resize-right"
    taskId: number
    startX: number
    origDebut: Date
    origDuree: number
    moved: boolean
  } | null>(null)

  const [draggingBar, setDraggingBar] = useState<number | null>(null)

  const startBarDrag = useCallback((
    e: React.MouseEvent, task: GanttTask,
    type: "move" | "resize-left" | "resize-right"
  ) => {
    e.preventDefault(); e.stopPropagation()
    barDragRef.current = {
      type, taskId: task.id, startX: e.clientX,
      origDebut: parseDate(task.debut), origDuree: task.duree,
      moved: false,
    }
    setDraggingBar(task.id)
    document.body.style.cursor = type === "move" ? "grabbing" : "ew-resize"
  }, [])

  // ── Connexion chemin critique ─────────────────────────────────────────────────
  const [connectingFrom, setConnectingFrom] = useState<ConnectionPoint | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState<ConnectionPoint | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // ── Flèches permanentes ──────────────────────────────────────────────────────
  const arrows = useMemo((): DependencyArrow[] => {
    return tasks
      .filter((t) => t.depends_on != null)
      .map((t) => {
        const fromTask = tasks.find((x) => x.id === t.depends_on)
        if (!fromTask) return null
        const fromGeo = getTaskGeometry(fromTask, dateRef, dayWidth)
        const toGeo = getTaskGeometry(t, dateRef, dayWidth)
        const fromRowIdx = rowIndexMap[fromTask.id]
        const toRowIdx = rowIndexMap[t.id]
        if (fromRowIdx === undefined || toRowIdx === undefined) return null
        return {
          id: `${fromTask.id}-${t.id}`,
          fromTaskId: fromTask.id,
          toTaskId: t.id,
          fromX: fromGeo.left + fromGeo.width,
          fromY: fromRowIdx * rowHeight + rowHeight / 2,
          toX: toGeo.left,
          toY: toRowIdx * rowHeight + rowHeight / 2,
        }
      })
      .filter(Boolean) as DependencyArrow[]
  }, [tasks, rowIndexMap, dateRef, dayWidth, rowHeight])

  // ── Mouse handlers ────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (barDragRef.current) {
      const { type, taskId, startX, origDebut, origDuree } = barDragRef.current
      const dx = e.clientX - startX
      const deltaDays = Math.round(dx / dayWidth)
      if (Math.abs(dx) > 3) barDragRef.current.moved = true

      let newDebut = origDebut, newDuree = origDuree
      if (type === "move") {
        const raw = new Date(origDebut)
        raw.setDate(raw.getDate() + deltaDays)
        while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
        newDebut = raw
      } else if (type === "resize-right") {
        newDuree = Math.max(1, origDuree + deltaDays)
      } else if (type === "resize-left") {
        const shift = Math.min(deltaDays, origDuree - 1)
        const raw = new Date(origDebut)
        raw.setDate(raw.getDate() + shift)
        while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
        newDebut = raw; newDuree = Math.max(1, origDuree - deltaDays)
      }
      const el = document.querySelector(`[data-taskid="${taskId}"]`) as HTMLElement
      if (el) {
        el.style.left = `${calendarOffsetFromRef(dateRef, newDebut) * dayWidth}px`
        el.style.width = `${Math.max(workingDaysToCalendarDays(newDebut, newDuree) * dayWidth, dayWidth * 0.8)}px`
      }
    }
    if (connectingFrom && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [dayWidth, dateRef, connectingFrom])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (barDragRef.current) {
      const { type, taskId, startX, origDebut, origDuree, moved } = barDragRef.current
      if (moved) {
        const dx = e.clientX - startX
        const deltaDays = Math.round(dx / dayWidth)
        let newDebut = origDebut, newDuree = origDuree
        if (type === "move") {
          const raw = new Date(origDebut)
          raw.setDate(raw.getDate() + deltaDays)
          while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
          newDebut = raw
        } else if (type === "resize-right") {
          newDuree = Math.max(1, origDuree + deltaDays)
        } else if (type === "resize-left") {
          const shift = Math.min(deltaDays, origDuree - 1)
          const raw = new Date(origDebut)
          raw.setDate(raw.getDate() + shift)
          while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
          newDebut = raw; newDuree = Math.max(1, origDuree - deltaDays)
        }
        if (formatDateISO(newDebut) !== formatDateISO(origDebut) || newDuree !== origDuree) {
          onTaskUpdate(taskId, { debut: formatDateISO(newDebut), duree: newDuree })
        }
      }
      barDragRef.current = null
      setDraggingBar(null)
      document.body.style.cursor = ""
    }
    if (connectingFrom && !hoveredPoint) setConnectingFrom(null)
  }, [dayWidth, onTaskUpdate, connectingFrom, hoveredPoint])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setConnectingFrom(null) }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [])

  const handleConnectionPointClick = useCallback((e: React.MouseEvent, point: ConnectionPoint) => {
    e.preventDefault(); e.stopPropagation()
    if (!connectingFrom) {
      if (point.side === "end") {
        setConnectingFrom(point)
        if (svgRef.current) {
          const rect = svgRef.current.getBoundingClientRect()
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }
      }
    } else {
      if (point.side === "start" && point.taskId !== connectingFrom.taskId) {
        const exists = tasks.find((t) => t.id === point.taskId && t.depends_on === connectingFrom.taskId)
        if (!exists) {
          const fromTask = tasks.find((t) => t.id === connectingFrom.taskId)
          const toTask = tasks.find((t) => t.id === point.taskId)
          const lag = (fromTask && toTask)
            ? computeLag(parseDate(fromTask.debut), fromTask.duree, parseDate(toTask.debut))
            : 1
          onDependencyCreate(connectingFrom.taskId, point.taskId, lag)
        }
      }
      setConnectingFrom(null)
    }
  }, [connectingFrom, tasks, onDependencyCreate])

  const todayOffset = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return calendarOffsetFromRef(dateRef, today) * dayWidth
  }, [dateRef, dayWidth])

  return (
    <div
      className="relative select-none"
      style={{ width: totalWidth, minWidth: totalWidth }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm"
        style={{ height: HEADER_HEIGHT }}>
        {/* Mois */}
        <div className="relative h-7 border-b border-border/50">
          {days.map((day, i) => {
            if (day.getDate() !== 1 && i !== 0) return null
            return (
              <div key={i} className="absolute top-0 bottom-0 flex items-center pl-2"
                style={{ left: i * dayWidth }}>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {day.toLocaleDateString("fr-FR", { month: i === 0 ? "short" : "long", year: "numeric" })}
                </span>
              </div>
            )
          })}
        </div>
        {/* Jours */}
        <div className="flex h-9 items-end pb-1">
          {days.map((day, i) => {
            const isWeekend = day.getDay() === 0 || day.getDay() === 6
            const isToday = day.toDateString() === new Date().toDateString()
            return (
              <div key={i} style={{ width: dayWidth, minWidth: dayWidth }}
                className={`shrink-0 flex flex-col items-center justify-end pb-0.5 border-r border-border/30
                  ${isWeekend ? "bg-muted/40" : ""} ${isToday ? "bg-primary/10" : ""}`}>
                <span className={`text-[9px] font-medium leading-none
                  ${isWeekend ? "text-muted-foreground/40" : "text-muted-foreground"}
                  ${isToday ? "!text-primary font-bold" : ""}`}>
                  {day.toLocaleDateString("fr-FR", { weekday: "narrow" })}
                </span>
                <span className={`text-[10px] font-bold tabular-nums
                  ${isWeekend ? "text-muted-foreground/40" : "text-foreground"}
                  ${isToday ? "!text-primary" : ""}`}>
                  {day.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="relative">
        {/* Weekend shading */}
        {days.map((day, i) => {
          if (day.getDay() !== 0 && day.getDay() !== 6) return null
          return (
            <div key={i} className="absolute top-0 bottom-0 bg-muted/20 pointer-events-none"
              style={{ left: i * dayWidth, width: dayWidth }} />
          )
        })}

        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `repeating-linear-gradient(90deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent ${dayWidth}px)`,
        }} />

        {/* Lots */}
        {lotsWithTasks.map(({ lot, tasks: lotTasks }) => (
          <div key={lot.id}>
            <div className="border-b border-border/40"
              style={{ height: rowHeight, backgroundColor: `${lot.couleur}10` }} />
            {lotTasks.map((task) => (
              <TaskBarRow
                key={task.id}
                task={task} lot={lot} dateRef={dateRef}
                dayWidth={dayWidth} rowHeight={rowHeight}
                isDragging={draggingBar === task.id}
                isConnecting={!!connectingFrom}
                connectingFromId={connectingFrom?.taskId ?? null}
                hoveredPoint={hoveredPoint}
                onBarDragStart={startBarDrag}
                onBarClick={onTaskClick}
                onConnectionPointClick={handleConnectionPointClick}
                onConnectionPointHover={setHoveredPoint}
              />
            ))}
          </div>
        ))}

        {/* Sans lot */}
        {unassigned.length > 0 && (
          <div>
            <div className="border-b border-border/40 bg-muted/10" style={{ height: rowHeight }} />
            {unassigned.map((task) => (
              <TaskBarRow
                key={task.id}
                task={task} lot={null} dateRef={dateRef}
                dayWidth={dayWidth} rowHeight={rowHeight}
                isDragging={draggingBar === task.id}
                isConnecting={!!connectingFrom}
                connectingFromId={connectingFrom?.taskId ?? null}
                hoveredPoint={hoveredPoint}
                onBarDragStart={startBarDrag}
                onBarClick={onTaskClick}
                onConnectionPointClick={handleConnectionPointClick}
                onConnectionPointHover={setHoveredPoint}
              />
            ))}
          </div>
        )}

        {/* ── SVG : flèches permanentes + ligne en cours ──────────────── */}
        <svg
          ref={svgRef}
          className="absolute inset-0 z-30 pointer-events-none"
          style={{
            width: totalWidth,
            height: totalBodyHeight,
            overflow: "visible",
            color: "#e4702a",   // couleur primaire en dur — fonctionne dans les attrs SVG
          }}
        >
          <defs>
            <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="currentColor" />
            </marker>
            <marker id="dep-arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="#ef4444" />
            </marker>
            <marker id="dep-arrow-live" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="currentColor" />
            </marker>
          </defs>

          {/* Flèches permanentes — toujours visibles */}
          {arrows.map((arrow) => {
            const span = Math.abs(arrow.toX - arrow.fromX)
            const ctrl = Math.max(50, span * 0.45)
            const d = `M ${arrow.fromX} ${arrow.fromY} C ${arrow.fromX + ctrl} ${arrow.fromY}, ${arrow.toX - ctrl} ${arrow.toY}, ${arrow.toX} ${arrow.toY}`
            return (
              <g key={arrow.id}
                className="pointer-events-auto group/dep"
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm("Supprimer cette dépendance ?")) {
                    onDependencyDelete(arrow.fromTaskId, arrow.toTaskId)
                  }
                }}
              >
                {/* Zone de clic élargie invisible */}
                <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
                {/* Flèche visible en permanence */}
                <path d={d} fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  strokeOpacity="0.85"
                  markerEnd="url(#dep-arrow)"
                  style={{ pointerEvents: "none" }}
                  className="group-hover/dep:[stroke:theme(colors.red.500)] group-hover/dep:stroke-opacity-100 transition-all duration-150"
                />
                {/* Cercle au point de départ */}
                <circle cx={arrow.fromX} cy={arrow.fromY} r="3.5"
                  fill="currentColor"
                  opacity="0.85"
                  style={{ pointerEvents: "none" }}
                  className="group-hover/dep:[fill:theme(colors.red.500)] transition-colors duration-150"
                />
              </g>
            )
          })}

          {/* Ligne de connexion en cours */}
          {connectingFrom && (
            <g>
              <line
                x1={connectingFrom.x} y1={connectingFrom.y}
                x2={mousePos.x} y2={mousePos.y}
                stroke="currentColor" strokeWidth="2.5"
                strokeDasharray="7 3"
                markerEnd="url(#dep-arrow-live)"
              />
              <circle cx={connectingFrom.x} cy={connectingFrom.y} r="5"
                fill="currentColor">
                <animate attributeName="r" values="4;7;4" dur="0.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.4;1" dur="0.9s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>

        {/* Today marker */}
        <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: todayOffset }}>
          <div className="h-full w-px bg-primary opacity-60" />
          <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background shadow" />
        </div>
      </div>

      {/* Toast mode connexion */}
      {connectingFrom && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          bg-primary text-primary-foreground text-xs font-bold px-5 py-2.5 rounded-full shadow-xl
          flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Cliquez sur le point de début d'une tâche · Échap pour annuler
        </div>
      )}
    </div>
  )
}

// ─── TaskBarRow ───────────────────────────────────────────────────────────────

interface TaskBarRowProps {
  task: GanttTask
  lot: Lot | null
  dateRef: Date
  dayWidth: number
  rowHeight: number
  isDragging: boolean
  isConnecting: boolean
  connectingFromId: number | null
  hoveredPoint: ConnectionPoint | null
  onBarDragStart: (e: React.MouseEvent, task: GanttTask, type: "move" | "resize-left" | "resize-right") => void
  onBarClick: (task: GanttTask) => void
  onConnectionPointClick: (e: React.MouseEvent, point: ConnectionPoint) => void
  onConnectionPointHover: (point: ConnectionPoint | null) => void
}

function TaskBarRow({
  task, lot, dateRef, dayWidth, rowHeight,
  isDragging, isConnecting, connectingFromId, hoveredPoint,
  onBarDragStart, onBarClick, onConnectionPointClick, onConnectionPointHover,
}: TaskBarRowProps) {
  const color = lot?.couleur ?? "#94a3b8"
  const debut = parseDate(task.debut)
  const left = calendarOffsetFromRef(dateRef, debut) * dayWidth
  const calDays = workingDaysToCalendarDays(debut, task.duree)
  const width = Math.max(calDays * dayWidth, dayWidth * 0.8)
  const HANDLE_W = Math.max(6, Math.min(10, dayWidth * 0.25))
  const BAR_PAD = 4
  const DOT_R = 6
  const centerY = rowHeight / 2

  const isSource = connectingFromId === task.id
  const isStartHovered = hoveredPoint?.taskId === task.id && hoveredPoint?.side === "start"
  const isEndHovered = hoveredPoint?.taskId === task.id && hoveredPoint?.side === "end"

  const startPoint: ConnectionPoint = { taskId: task.id, side: "start", x: left, y: centerY }
  const endPoint: ConnectionPoint = { taskId: task.id, side: "end", x: left + width, y: centerY }

  // Icône crayon SVG inline (pas de dépendance externe dans la barre)
  const PENCIL_SIZE = Math.min(14, rowHeight * 0.35)

  return (
    <div className="relative group border-b border-border/30" style={{ height: rowHeight }}>

      {/* ── Barre principale ─────────────────────────────────────── */}
      <div
        data-taskid={task.id}
        className={`absolute flex items-center rounded shadow-sm overflow-hidden
          ${isDragging ? "shadow-xl ring-2 ring-white/30 z-30 opacity-90" : "hover:shadow-md z-10"}
          ${isConnecting && !isSource ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        style={{ left, width, top: BAR_PAD, bottom: BAR_PAD, backgroundColor: color }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).dataset.handle) return
          if ((e.target as HTMLElement).dataset.editbtn) return
          if (isConnecting) return
          onBarDragStart(e, task, "move")
        }}
      >
        {/* Resize gauche */}
        <div data-handle="left"
          className="absolute left-0 top-0 bottom-0 cursor-ew-resize hover:bg-black/20 rounded-l flex items-center justify-center shrink-0"
          style={{ width: HANDLE_W }}
          onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, task, "resize-left") }}>
          <div className="h-3 w-px bg-white/40 pointer-events-none" />
        </div>

        {/* Avancement */}
        {task.avancement > 0 && (
          <div className="absolute inset-0 pointer-events-none"
            style={{ width: `${task.avancement}%`, backgroundColor: "rgba(0,0,0,0.22)" }} />
        )}

        {/* Label */}
        <span className="relative z-10 text-[11px] font-semibold text-white truncate drop-shadow pointer-events-none flex-1 min-w-0"
          style={{ paddingLeft: HANDLE_W + 6, paddingRight: HANDLE_W + PENCIL_SIZE + 10 }}>
          {task.num_tache} – {task.nom}
          {task.avancement > 0 && <span className="ml-1.5 opacity-75">{task.avancement}%</span>}
        </span>

        {/* ── Bouton crayon (edit) — au survol uniquement ──────────── */}
        <button
          data-editbtn="1"
          className="absolute z-20 flex items-center justify-center rounded
            bg-black/30 hover:bg-black/50 text-white
            opacity-0 group-hover:opacity-100 transition-opacity duration-150
            shrink-0"
          style={{
            right: HANDLE_W + 3,
            top: "50%",
            transform: "translateY(-50%)",
            width: PENCIL_SIZE + 6,
            height: PENCIL_SIZE + 6,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (!barDragRef_click.moved) onBarClick(task)
          }}
          title="Modifier la tâche"
        >
          <Pencil style={{ width: PENCIL_SIZE, height: PENCIL_SIZE }} strokeWidth={2.5} />
        </button>

        {/* Resize droite */}
        <div data-handle="right"
          className="absolute right-0 top-0 bottom-0 cursor-ew-resize hover:bg-black/20 rounded-r flex items-center justify-center shrink-0"
          style={{ width: HANDLE_W }}
          onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, task, "resize-right") }}>
          <div className="h-3 w-px bg-white/40 pointer-events-none" />
        </div>
      </div>

      {/* ── Point START ─────────────────────────────────────────── */}
      <div
        className={`absolute z-40 rounded-full border-2 transition-all duration-150
          ${isConnecting && connectingFromId !== task.id
            ? "opacity-100 cursor-crosshair"
            : "opacity-0 group-hover:opacity-100 cursor-crosshair"}`}
        style={{
          left: left - DOT_R,
          top: centerY - DOT_R,
          width: DOT_R * 2, height: DOT_R * 2,
          backgroundColor: isStartHovered ? "hsl(var(--primary))" : color,
          borderColor: isStartHovered ? "white" : "white",
          transform: isStartHovered ? "scale(1.5)" : "scale(1)",
          boxShadow: isStartHovered ? "0 0 0 3px hsl(var(--primary) / 0.35)" : "0 1px 4px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => onConnectionPointClick(e, startPoint)}
        onMouseEnter={() => onConnectionPointHover(startPoint)}
        onMouseLeave={() => onConnectionPointHover(null)}
      />

      {/* ── Point END ───────────────────────────────────────────── */}
      <div
        className={`absolute z-40 rounded-full border-2 transition-all duration-150
          ${isConnecting
            ? "opacity-0 pointer-events-none"
            : "opacity-0 group-hover:opacity-100 cursor-crosshair"}`}
        style={{
          left: left + width - DOT_R,
          top: centerY - DOT_R,
          width: DOT_R * 2, height: DOT_R * 2,
          backgroundColor: isSource || isEndHovered ? "hsl(var(--primary))" : color,
          borderColor: "white",
          transform: isEndHovered || isSource ? "scale(1.5)" : "scale(1)",
          boxShadow: (isEndHovered || isSource) ? "0 0 0 3px hsl(var(--primary) / 0.35)" : "0 1px 4px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => onConnectionPointClick(e, endPoint)}
        onMouseEnter={() => onConnectionPointHover(endPoint)}
        onMouseLeave={() => onConnectionPointHover(null)}
      />
    </div>
  )
}

// Ref partagée pour détecter si un drag a eu lieu (évite onClick après drag)
const barDragRef_click = { moved: false }