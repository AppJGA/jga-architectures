"use client"

import Link from "next/link"
import {
  ArrowLeft,
  Briefcase,
  ZoomIn,
  ZoomOut,
  Layers,
  FileDown,
  Plus,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface GanttToolbarProps {
  affaireId: string
  onZoomIn: () => void
  onZoomOut: () => void
  onOpenLots: () => void
  onExportPdf: () => void
  onAddTask: () => void
  dayWidth: number
}

export function GanttToolbar({
  affaireId,
  onZoomIn,
  onZoomOut,
  onOpenLots,
  onExportPdf,
  onAddTask,
  dayWidth,
}: GanttToolbarProps) {
  const canZoomOut = dayWidth > 15
  const canZoomIn = dayWidth < 100

  return (
    <header className="flex flex-col border-b border-border bg-card print:hidden">
      {/* Top nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link href={`/affaire/${affaireId}`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Tableau de bord</span>
          </Link>
        </Button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Briefcase className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">
            JGA PLANNING PRO
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2">
        {/* Zoom controls */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onZoomOut}
            disabled={!canZoomOut}
            className="h-8 w-8 p-0"
            aria-label="Zoom arrière"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 rounded border border-border bg-background px-2 h-8">
            <CalendarDays className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium tabular-nums text-muted-foreground w-8 text-center">
              {dayWidth}px
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onZoomIn}
            disabled={!canZoomIn}
            className="h-8 w-8 p-0"
            aria-label="Zoom avant"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenLots} className="gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Lots</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onExportPdf} className="gap-2">
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Button size="sm" onClick={onAddTask} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ajouter tâche</span>
          </Button>
        </div>
      </div>
    </header>
  )
}