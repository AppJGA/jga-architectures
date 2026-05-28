"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Save } from "lucide-react"
import type { Lot } from "@/lib/gantt-types"
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

interface LotsModalProps {
  open: boolean
  onClose: () => void
  lots: Lot[]
  affaireId: string
  onSave: (lots: LotDraft[]) => Promise<void>
}

export interface LotDraft {
  id?: number
  affaire_id: string
  num_lot: string
  nom: string
  couleur: string
}

const PRESET_COLORS = [
  "#e47339", "#3b82f6", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  "#f97316", "#6366f1",
]

export function LotsModal({ open, onClose, lots, affaireId, onSave }: LotsModalProps) {
  const [draft, setDraft] = useState<LotDraft[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(
        lots.map((l) => ({
          id: l.id,
          affaire_id: l.affaire_id ?? affaireId,
          num_lot: l.num_lot,
          nom: l.nom,
          couleur: l.couleur,
        }))
      )
    }
  }, [lots, open, affaireId])

  const addLot = () => {
    const nextNum = String(draft.length + 1).padStart(2, "0")
    const colorIdx = draft.length % PRESET_COLORS.length
    setDraft([
      ...draft,
      {
        affaire_id: affaireId,
        num_lot: nextNum,
        nom: `Lot ${nextNum}`,
        couleur: PRESET_COLORS[colorIdx],
      },
    ])
  }

  const update = (index: number, key: keyof LotDraft, value: string) => {
    setDraft((d) => {
      const next = [...d]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const remove = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gestion des Lots</DialogTitle>
          <DialogDescription>
            Les couleurs des lots s'appliquent automatiquement aux tâches associées.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {draft.map((lot, index) => (
            <div
              key={lot.id ?? `new-${index}`}
              className="flex items-end gap-3 p-3 rounded-lg border border-border bg-muted/20"
            >
              {/* Color indicator */}
              <div
                className="h-10 w-10 shrink-0 rounded-lg border-2 border-border/50 cursor-pointer relative overflow-hidden shadow-sm"
                style={{ backgroundColor: lot.couleur }}
                title="Cliquer pour changer la couleur"
              >
                <input
                  type="color"
                  value={lot.couleur}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onChange={(e) => update(index, "couleur", e.target.value)}
                />
              </div>

              {/* Preset colors */}
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {/* Row: num + name */}
                <div className="flex gap-2">
                  <div className="w-14 shrink-0">
                    <Label className="text-[9px] font-bold uppercase text-muted-foreground">N°</Label>
                    <Input
                      value={lot.num_lot}
                      onChange={(e) => update(index, "num_lot", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label className="text-[9px] font-bold uppercase text-muted-foreground">Nom du lot</Label>
                    <Input
                      value={lot.nom}
                      onChange={(e) => update(index, "nom", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Color presets */}
                <div className="flex gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-4 w-4 rounded-full border-2 transition-transform hover:scale-110
                        ${lot.couleur === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => update(index, "couleur", c)}
                    />
                  ))}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addLot}
            className="w-full border-dashed py-5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un lot
          </Button>
        </div>

        <DialogFooter className="border-t pt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Enregistrement…" : "Enregistrer les lots"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}