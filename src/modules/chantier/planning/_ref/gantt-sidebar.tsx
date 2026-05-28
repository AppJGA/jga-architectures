"use client"

import { Pencil } from "lucide-react"
import type { GanttTask, Lot } from "@/lib/gantt-types"

interface GanttSidebarProps {
  tasks: GanttTask[]
  lots: Lot[]
  rowHeight: number
  headerHeight: number
  onEdit: (task: GanttTask) => void
  onAvancementChange: (taskId: number, value: number) => void
}

export function GanttSidebar({
  tasks,
  lots,
  rowHeight,
  headerHeight,
  onEdit,
  onAvancementChange,
}: GanttSidebarProps) {
  const getLot = (lotId: number | null) =>
    lotId != null ? lots.find((l) => l.id === lotId) : undefined

  // Group tasks by lot (same order as timeline)
  const lotsWithTasks = lots
    .map((lot) => ({ lot, tasks: tasks.filter((t) => t.lot_id === lot.id) }))
    .filter(({ tasks }) => tasks.length > 0)

  const unassigned = tasks.filter((t) => t.lot_id == null)

  return (
    <div className="flex flex-col">
      {/* Header — same height as timeline header */}
      <div
        className="sticky top-0 z-10 flex items-center border-b border-border bg-secondary/80 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0"
        style={{ height: headerHeight }}
      >
        <span className="w-12 shrink-0">N°</span>
        <span className="flex-1 min-w-0">Tâche</span>
        <span className="w-14 shrink-0 text-center">Av. %</span>
        <span className="w-6 shrink-0" />
      </div>

      {/* Lots + tasks */}
      {lotsWithTasks.map(({ lot, tasks: lotTasks }) => (
        <div key={lot.id}>
          {/* Lot header row */}
          <div
            className="flex items-center gap-2 border-b border-border px-3"
            style={{ height: rowHeight, backgroundColor: `${lot.couleur}18` }}
          >
            <div
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: lot.couleur }}
            />
            <span
              className="text-xs font-bold uppercase tracking-wide truncate"
              style={{ color: lot.couleur }}
            >
              {lot.num_lot} – {lot.nom}
            </span>
          </div>

          {/* Task rows */}
          {lotTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              lotColor={lot.couleur}
              rowHeight={rowHeight}
              onEdit={onEdit}
              onAvancementChange={onAvancementChange}
            />
          ))}
        </div>
      ))}

      {/* Unassigned tasks */}
      {unassigned.length > 0 && (
        <div>
          <div
            className="flex items-center gap-2 border-b border-border px-3 bg-muted/30"
            style={{ height: rowHeight }}
          >
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground truncate">
              Sans lot
            </span>
          </div>
          {unassigned.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              lotColor="#94a3b8"
              rowHeight={rowHeight}
              onEdit={onEdit}
              onAvancementChange={onAvancementChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  lotColor,
  rowHeight,
  onEdit,
  onAvancementChange,
}: {
  task: GanttTask
  lotColor: string
  rowHeight: number
  onEdit: (task: GanttTask) => void
  onAvancementChange: (taskId: number, value: number) => void
}) {
  return (
    <div
      className="group flex items-center border-b border-border/60 px-3 transition-colors hover:bg-muted/30"
      style={{ height: rowHeight }}
    >
      {/* Lot color bar + task number */}
      <div className="flex w-12 shrink-0 items-center gap-1.5">
        <div className="h-4 w-0.5 rounded-full" style={{ backgroundColor: lotColor }} />
        <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
          {task.num_tache}
        </span>
      </div>

      {/* Task name */}
      <button
        className="flex-1 min-w-0 text-left text-sm text-foreground truncate hover:text-primary transition-colors"
        onClick={() => onEdit(task)}
      >
        {task.nom}
      </button>

      {/* Avancement input */}
      <div className="flex w-14 shrink-0 items-center justify-center">
        <input
          type="number"
          min={0}
          max={100}
          value={task.avancement}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value)))
            onAvancementChange(task.id, v)
          }}
          className="h-6 w-12 rounded border border-border bg-background px-1 text-center text-xs tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Edit button */}
      <button
        onClick={() => onEdit(task)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  )
}