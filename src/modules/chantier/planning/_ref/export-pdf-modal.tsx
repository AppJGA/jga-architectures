"use client"

import { useState, useMemo, useEffect } from "react"
import { FileDown, Printer, X, Check } from "lucide-react"
import type { GanttTask, Lot } from "@/lib/gantt-types"
import { parseDate, formatDateISO, addWorkingDays } from "@/lib/gantt-types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface ExportPdfModalProps {
  open: boolean
  onClose: () => void
  onPrint: (config: { selectedLotIds: number[]; dateDebut: string; dateFin: string; orientation: 'paysage' | 'portrait' }) => void
  lots: Lot[]
  tasks: GanttTask[]
  affaireNumero: string
  affaireTitre: string
}

export function ExportPdfModal({
  open, onClose, onPrint, lots, tasks, affaireNumero, affaireTitre,
}: ExportPdfModalProps) {

  // ── Sélection des lots ───────────────────────────────────────────────────────
  const [selectedLotIds, setSelectedLotIds] = useState<Set<number>>(
    () => new Set(lots.map((l) => l.id))
  )

  // ── Période ──────────────────────────────────────────────────────────────────
  const computedStart = useMemo(() => {
    const dates = tasks.map((t) => parseDate(t.debut).getTime())
    if (dates.length === 0) return formatDateISO(new Date())
    return formatDateISO(new Date(Math.min(...dates)))
  }, [tasks])

  const computedEnd = useMemo(() => {
    const ends = tasks.map((t) => {
      const d = parseDate(t.debut)
      return addWorkingDays(d, t.duree).getTime()
    })
    if (ends.length === 0) {
      const d = new Date(); d.setMonth(d.getMonth() + 3); return formatDateISO(d)
    }
    return formatDateISO(new Date(Math.max(...ends)))
  }, [tasks])

  const [dateDebut, setDateDebut] = useState(computedStart)
  const [dateFin, setDateFin] = useState(computedEnd)

  // Resynchronise les dates ET la sélection des lots à chaque ouverture
  useEffect(() => {
    if (!open) return
    setDateDebut(computedStart)
    setDateFin(computedEnd)
    setSelectedLotIds(new Set(lots.map((l) => l.id)))
  }, [open, computedStart, computedEnd, lots])

  // ── Orientation ──────────────────────────────────────────────────────────────
  const [orientation, setOrientation] = useState<"paysage" | "portrait">("paysage")

  // ── Toggle lot ───────────────────────────────────────────────────────────────
  const toggleLot = (id: number) => {
    setSelectedLotIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedLotIds(
      selectedLotIds.size === lots.length
        ? new Set()
        : new Set(lots.map((l) => l.id))
    )
  }

  // ── Résumé des tâches concernées ─────────────────────────────────────────────
  const filteredTaskCount = useMemo(() => {
    const start = parseDate(dateDebut).getTime()
    const end = parseDate(dateFin).getTime()
    return tasks.filter((t) => {
      if (!selectedLotIds.has(t.lot_id!)) return false
      const tStart = parseDate(t.debut).getTime()
      const tEnd = addWorkingDays(parseDate(t.debut), t.duree).getTime()
      return tStart <= end && tEnd >= start
    }).length
  }, [tasks, selectedLotIds, dateDebut, dateFin])

  // ── Lancement de l'impression ────────────────────────────────────────────────
  const handlePrint = () => {
    onPrint({
      selectedLotIds: Array.from(selectedLotIds),
      dateDebut,
      dateFin,
      orientation,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            Export PDF du planning
          </DialogTitle>
          <DialogDescription>
            Définissez les lots et la période à inclure dans l'export.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">

          {/* ── Sélection des lots ──────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Lots à inclure
              </Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[10px] text-primary hover:underline font-medium"
              >
                {selectedLotIds.size === lots.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {lots.map((lot) => {
                const isSelected = selectedLotIds.has(lot.id)
                const lotTaskCount = tasks.filter((t) => t.lot_id === lot.id).length
                return (
                  <button
                    key={lot.id}
                    type="button"
                    onClick={() => toggleLot(lot.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all
                      ${isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-muted/20 opacity-50"}`}
                  >
                    {/* Couleur */}
                    <div className="h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: lot.couleur }} />
                    {/* Nom */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {lot.num_lot} – {lot.nom}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({lotTaskCount} tâche{lotTaskCount > 1 ? "s" : ""})
                      </span>
                    </div>
                    {/* Checkbox visuelle */}
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0
                      ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                      {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Période ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Période
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Du</Label>
                <Input type="date" value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Au</Label>
                <Input type="date" value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Orientation ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Orientation
            </Label>
            <div className="flex gap-2">
              {(["paysage", "portrait"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrientation(o)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all
                    ${orientation === o
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {/* Icône page */}
                  <div className={`border-2 border-current rounded-sm shrink-0
                    ${o === "paysage" ? "w-6 h-4" : "w-4 h-6"}`} />
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Résumé ──────────────────────────────────────────────── */}
          <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredTaskCount}</span> tâche
            {filteredTaskCount > 1 ? "s" : ""} sur{" "}
            <span className="font-semibold text-foreground">{selectedLotIds.size}</span>{" "}
            lot{selectedLotIds.size > 1 ? "s" : ""} · période sélectionnée
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" />
            Annuler
          </Button>
          <Button
            onClick={handlePrint}
            disabled={selectedLotIds.size === 0 || !dateDebut || !dateFin}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimer / Exporter PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}