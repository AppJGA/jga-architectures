"use client"

import { useState, useEffect } from "react"
import type { GanttTask, Lot } from "@/lib/gantt-types"
import { parseDate, formatDateISO, computeLag } from "@/lib/gantt-types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2, Save, X } from "lucide-react"

interface TaskEditModalProps {
  open: boolean
  onClose: () => void
  task: GanttTask | null
  tasks: GanttTask[] // all tasks for dependency selector
  lots: Lot[]
  onSave: (task: Partial<GanttTask> & { id?: number }) => Promise<void>
  onDelete?: (taskId: number) => Promise<void>
  mode: "edit" | "create"
}

const emptyForm = (lots: Lot[]): Partial<GanttTask> => ({
  num_tache: "",
  nom: "",
  debut: formatDateISO(new Date()),
  duree: 5,
  avancement: 0,
  lot_id: lots.length > 0 ? lots[0].id : null,
  depends_on: null,
  lag_days: null,
})

export function TaskEditModal({
  open,
  onClose,
  task,
  tasks,
  lots,
  onSave,
  onDelete,
  mode,
}: TaskEditModalProps) {
  const [form, setForm] = useState<Partial<GanttTask>>(emptyForm(lots))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        ...task,
        debut: typeof task.debut === "string"
          ? task.debut.split("T")[0]
          : formatDateISO(parseDate(task.debut)),
      })
    } else {
      setForm(emptyForm(lots))
    }
  }, [task, open, lots])

  const set = (key: keyof GanttTask, value: any) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Quand on change la dépendance, recalcule le lag entre fin(parent) et début(enfant)
  const handleDependencyChange = (v: string) => {
    const newDependsOn = v === "none" ? null : Number(v)
    if (newDependsOn == null) {
      setForm((f) => ({ ...f, depends_on: null, lag_days: null }))
      return
    }
    const parentTask = tasks.find((t) => t.id === newDependsOn)
    if (!parentTask || !form.debut) {
      setForm((f) => ({ ...f, depends_on: newDependsOn }))
      return
    }
    const lag = computeLag(
      parseDate(parentTask.debut),
      parentTask.duree,
      parseDate(form.debut as string)
    )
    setForm((f) => ({ ...f, depends_on: newDependsOn, lag_days: lag }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!task?.id || !onDelete) return
    if (!confirm(`Supprimer la tâche "${task.nom}" ?`)) return
    setDeleting(true)
    try {
      await onDelete(task.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  // Tasks available as dependency (exclude self)
  const dependencyOptions = tasks.filter((t) => t.id !== task?.id)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Modifier la tâche" : "Nouvelle tâche"}
          </DialogTitle>
          <DialogDescription>
            Les durées sont calculées en jours ouvrés (lun.–ven.).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {/* N° + Nom */}
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                N°
              </Label>
              <Input
                value={form.num_tache ?? ""}
                onChange={(e) => set("num_tache", e.target.value)}
                placeholder="01"
                required
              />
            </div>
            <div className="col-span-3 flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Nom de la tâche
              </Label>
              <Input
                value={form.nom ?? ""}
                onChange={(e) => set("nom", e.target.value)}
                placeholder="Terrassement général"
                required
              />
            </div>
          </div>

          {/* Début + Durée */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Date de début
              </Label>
              <Input
                type="date"
                value={form.debut ?? ""}
                onChange={(e) => set("debut", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Durée (j. ouvrés)
              </Label>
              <Input
                type="number"
                min={1}
                value={form.duree ?? 1}
                onChange={(e) => set("duree", Math.max(1, Number(e.target.value)))}
                required
              />
            </div>
          </div>

          {/* Lot */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Lot
            </Label>
            <Select
              value={form.lot_id != null ? String(form.lot_id) : "none"}
              onValueChange={(v) => set("lot_id", v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sans lot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Sans lot</span>
                </SelectItem>
                {lots.map((lot) => (
                  <SelectItem key={lot.id} value={String(lot.id)}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: lot.couleur }}
                      />
                      {lot.num_lot} – {lot.nom}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dépendance (chemin critique) */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Dépend de (chemin critique)
            </Label>
            <Select
              value={form.depends_on != null ? String(form.depends_on) : "none"}
              onValueChange={handleDependencyChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucune dépendance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Aucune dépendance</span>
                </SelectItem>
                {dependencyOptions.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.num_tache} – {t.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lag (battement) — visible seulement si une dépendance est sélectionnée */}
          {form.depends_on != null && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Délai après fin de la tâche précédente (j. ouvrés)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={-30}
                  value={form.lag_days ?? 0}
                  onChange={(e) => set("lag_days", Number(e.target.value))}
                  className="w-24 tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  {(form.lag_days ?? 0) === 0 && "Collée (commence le jour même de la fin)"}
                  {(form.lag_days ?? 0) === 1 && "Collée (commence le lendemain ouvré)"}
                  {(form.lag_days ?? 0) > 1 && `${(form.lag_days ?? 0) - 1} jour(s) de battement`}
                  {(form.lag_days ?? 0) < 0 && `Chevauchement de ${Math.abs(form.lag_days ?? 0)} jour(s)`}
                </span>
              </div>
            </div>
          )}

          {/* Avancement */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Avancement : {form.avancement ?? 0}%
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.avancement ?? 0}
                onChange={(e) => set("avancement", Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={form.avancement ?? 0}
                onChange={(e) =>
                  set("avancement", Math.max(0, Math.min(100, Number(e.target.value))))
                }
                className="w-16 text-center tabular-nums"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            {mode === "edit" && onDelete && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {deleting ? "Suppression…" : "Supprimer"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              <X className="h-4 w-4 mr-1.5" />
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}