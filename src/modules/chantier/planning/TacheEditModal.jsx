import { useState, useEffect } from 'react'
import { Trash2, Save, X } from 'lucide-react'
import { parseDate, formatDateISO, computeLag } from './types'

const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9B8F85', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1a1a1a',
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#639922', color: 'white', border: 'none', fontWeight: 500,
}
const BTN_DANGER = {
  ...BTN, color: '#DC2626', borderColor: 'rgba(220,38,38,0.3)',
}

function emptyForm(lots) {
  return {
    num_tache: '',
    nom: '',
    debut: formatDateISO(new Date()),
    duree: 5,
    avancement: 0,
    lot_id: lots.length > 0 ? lots[0].id : null,
    depends_on: null,
    lag_days: null,
    appro_actif: false,
    appro_duree: null,
    appro_materiau: null,
  }
}

export function TacheEditModal({ open, onClose, task, tasks, lots, onSave, onDelete, mode }) {
  const [form, setForm] = useState(emptyForm(lots))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        ...task,
        debut: typeof task.debut === 'string'
          ? task.debut.split('T')[0]
          : formatDateISO(parseDate(task.debut)),
      })
    } else {
      setForm(emptyForm(lots))
    }
  }, [task, open, lots])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleDependencyChange = (v) => {
    const newDependsOn = v === 'none' ? null : Number(v)
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
      parseDate(form.debut)
    )
    setForm((f) => ({ ...f, depends_on: newDependsOn, lag_days: lag }))
  }

  const handleSubmit = async (e) => {
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

  const dependencyOptions = tasks.filter((t) => t.id !== task?.id)

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>
              {mode === 'edit' ? 'Modifier la tâche' : 'Nouvelle tâche'}
            </h2>
            <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 2 }}>
              Les durées sont calculées en jours ouvrés (lun.–ven.).
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B8F85' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* N° + Nom */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
            <div>
              <label style={LABEL}>N°</label>
              <input
                value={form.num_tache ?? ''} onChange={(e) => set('num_tache', e.target.value)}
                placeholder="01" required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
            <div>
              <label style={LABEL}>Nom de la tâche</label>
              <input
                value={form.nom ?? ''} onChange={(e) => set('nom', e.target.value)}
                placeholder="Terrassement général" required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
          </div>

          {/* Début + Durée */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LABEL}>Date de début</label>
              <input type="date" value={form.debut ?? ''} onChange={(e) => set('debut', e.target.value)}
                required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
            <div>
              <label style={LABEL}>Durée (j. ouvrés)</label>
              <input type="number" min={1} value={form.duree ?? 1}
                onChange={(e) => set('duree', Math.max(1, Number(e.target.value)))}
                required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
          </div>

          {/* Lot */}
          <div>
            <label style={LABEL}>Lot</label>
            <select
              value={form.lot_id != null ? String(form.lot_id) : 'none'}
              onChange={(e) => set('lot_id', e.target.value === 'none' ? null : e.target.value)}
              style={{ ...INPUT, cursor: 'pointer' }}
              onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
            >
              <option value="none">Sans lot</option>
              {lots.map((lot) => (
                <option key={lot.id} value={String(lot.id)}>
                  {lot.num_lot} – {lot.nom}
                </option>
              ))}
            </select>
          </div>

          {/* Dépendance */}
          <div>
            <label style={LABEL}>Dépend de (chemin critique)</label>
            <select
              value={form.depends_on != null ? String(form.depends_on) : 'none'}
              onChange={(e) => handleDependencyChange(e.target.value)}
              style={{ ...INPUT, cursor: 'pointer' }}
              onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
            >
              <option value="none">Aucune dépendance</option>
              {dependencyOptions.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.num_tache} – {t.nom}
                </option>
              ))}
            </select>
          </div>

          {/* Lag */}
          {form.depends_on != null && (
            <div>
              <label style={LABEL}>Délai après fin de la tâche précédente (j. ouvrés)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number" min={-30} value={form.lag_days ?? 0}
                  onChange={(e) => set('lag_days', Number(e.target.value))}
                  style={{ ...INPUT, width: 96, fontVariantNumeric: 'tabular-nums' }}
                  onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
                <span style={{ fontSize: 11, color: '#9B8F85' }}>
                  {(form.lag_days ?? 0) === 0 && 'Collée (commence le jour même de la fin)'}
                  {(form.lag_days ?? 0) === 1 && 'Collée (commence le lendemain ouvré)'}
                  {(form.lag_days ?? 0) > 1 && `${(form.lag_days ?? 0) - 1} jour(s) de battement`}
                  {(form.lag_days ?? 0) < 0 && `Chevauchement de ${Math.abs(form.lag_days ?? 0)} jour(s)`}
                </span>
              </div>
            </div>
          )}

          {/* Avancement */}
          <div>
            <label style={LABEL}>Avancement : {form.avancement ?? 0}%</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range" min={0} max={100} step={5} value={form.avancement ?? 0}
                onChange={(e) => set('avancement', Number(e.target.value))}
                style={{ flex: 1, accentColor: '#639922' }}
              />
              <input
                type="number" min={0} max={100} value={form.avancement ?? 0}
                onChange={(e) => set('avancement', Math.max(0, Math.min(100, Number(e.target.value))))}
                style={{ ...INPUT, width: 64, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
          </div>

          {/* Approvisionnement */}
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.appro_actif ? 12 : 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={!!form.appro_actif}
                  onChange={(e) => set('appro_actif', e.target.checked)}
                  style={{ accentColor: '#E05A1E', width: 14, height: 14, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B8F85' }}>
                  Délai d'approvisionnement
                </span>
              </label>
            </div>
            {form.appro_actif && (
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={LABEL}>Durée (j. ouvrés)</label>
                  <input
                    type="number" min={1} value={form.appro_duree ?? ''}
                    onChange={(e) => set('appro_duree', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                    placeholder="10" style={INPUT}
                    onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                  />
                </div>
                <div>
                  <label style={LABEL}>Matériau / fourniture</label>
                  <input
                    value={form.appro_materiau ?? ''}
                    onChange={(e) => set('appro_materiau', e.target.value || null)}
                    placeholder="Charpente bois lamellé-collé" style={INPUT}
                    onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            {mode === 'edit' && onDelete && (
              <button type="button" style={{ ...BTN_DANGER, marginRight: 'auto' }}
                onClick={handleDelete} disabled={deleting}>
                <Trash2 size={13} />
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            )}
            <button type="button" style={BTN} onClick={onClose} disabled={saving}>
              <X size={13} /> Annuler
            </button>
            <button type="submit" style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }} disabled={saving}>
              <Save size={13} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
