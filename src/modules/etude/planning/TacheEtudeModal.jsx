import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import {
  TYPE_COLORS, TYPE_LABELS, INTERVENANTS,
  getWeekStart, getCurrentWeek, addWeeks, weeksBetween,
  parseIntervenants, serializeIntervenants, computeLagSemaines,
} from './types'

const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9B8F85', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1a1a1a',
}

const TYPES = ['etude', 'validation', 'administratif', 'chantier']

function emptyForm() {
  const now = getCurrentWeek()
  return {
    num_tache: '',
    nom: '',
    type_tache: 'etude',
    semaine_debut: now.semaine,
    annee_debut: now.annee,
    duree_semaines: 4,
    intervenants: [1],
    label_barre: '',
    avancement: 0,
    depends_on: null,
    lag_semaines: 0,
  }
}

export function TacheEtudeModal({ open, onClose, tache, taches, onSave, onDelete, mode }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    if (tache) {
      setForm({
        num_tache: tache.num_tache ?? '',
        nom: tache.nom ?? '',
        type_tache: tache.type_tache ?? 'etude',
        semaine_debut: tache.semaine_debut,
        annee_debut: tache.annee_debut,
        duree_semaines: tache.duree_semaines ?? 1,
        intervenants: tache.intervenants ?? [],
        label_barre: tache.label_barre ?? '',
        avancement: tache.avancement ?? 0,
        depends_on: tache.depends_on ?? null,
        lag_semaines: tache.lag_semaines ?? 0,
      })
    } else {
      setForm(emptyForm())
    }
    setConfirmDelete(false)
  }, [open, tache])

  if (!open) return null

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleIntervenant = (id) => {
    setForm(f => {
      const arr = f.intervenants ?? []
      return { ...f, intervenants: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
    })
  }

  const handleDependencyChange = (val) => {
    const newDep = val === 'none' ? null : Number(val)
    if (!newDep) { set('depends_on', null); set('lag_semaines', 0); return }
    const parent = taches.find(t => t.id === newDep)
    if (!parent) { set('depends_on', newDep); return }
    const lag = computeLagSemaines(
      parent.semaine_debut, parent.annee_debut, parent.duree_semaines,
      form.semaine_debut, form.annee_debut
    )
    setForm(f => ({ ...f, depends_on: newDep, lag_semaines: lag }))
  }

  const debutDate = getWeekStart(form.semaine_debut, form.annee_debut)
  const debutLabel = debutDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const finWeek = addWeeks(form.semaine_debut, form.annee_debut, form.duree_semaines)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nom.trim() || !form.num_tache.trim()) return
    setSaving(true)
    const payload = {
      num_tache: form.num_tache.trim(),
      nom: form.nom.trim(),
      type_tache: form.type_tache,
      semaine_debut: Number(form.semaine_debut),
      annee_debut: Number(form.annee_debut),
      duree_semaines: Math.max(1, Number(form.duree_semaines)),
      intervenants: serializeIntervenants(
        ['etude', 'chantier'].includes(form.type_tache) ? (form.intervenants ?? []) : []
      ),
      label_barre: form.type_tache === 'administratif' ? (form.label_barre || null) : null,
      avancement: Number(form.avancement),
      depends_on: form.depends_on ?? null,
      lag_semaines: form.depends_on ? Number(form.lag_semaines ?? 0) : 0,
    }
    await onSave({ ...tache, ...payload })
    setSaving(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    await onDelete(tache.id)
    setSaving(false)
    onClose()
  }

  const otherTaches = taches.filter(t => t.id !== tache?.id)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white', borderRadius: 16, padding: 28,
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
            {mode === 'create' ? 'Nouvelle tâche' : 'Modifier la tâche'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B8F85' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* N° + Nom */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>N°</label>
                <input
                  value={form.num_tache}
                  onChange={e => set('num_tache', e.target.value)}
                  placeholder="01"
                  required style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>Nom de la tâche *</label>
                <input
                  value={form.nom}
                  onChange={e => set('nom', e.target.value)}
                  placeholder="Ex: ESQ — Esquisse"
                  required style={INPUT}
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label style={LABEL}>Type de tâche</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                {TYPES.map(type => {
                  const color = TYPE_COLORS[type]
                  const active = form.type_tache === type
                  return (
                    <button
                      key={type} type="button"
                      onClick={() => set('type_tache', type)}
                      style={{
                        padding: '8px 6px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                        border: `1.5px solid ${active ? color : 'rgba(0,0,0,0.1)'}`,
                        backgroundColor: active ? color + '18' : 'transparent',
                        fontSize: 11, fontWeight: 500,
                        color: active ? color : '#6b7280',
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: active ? color : '#d1d5db', margin: '0 auto 4px' }} />
                      {TYPE_LABELS[type].replace("Phase d'", '').replace('Période ', '').replace(' / Visa', '')}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Semaine + Année */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>Semaine début (1-53)</label>
                  <input
                    type="number" min={1} max={53}
                    value={form.semaine_debut}
                    onChange={e => set('semaine_debut', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LABEL}>Année</label>
                  <input
                    type="number" min={2020} max={2040}
                    value={form.annee_debut}
                    onChange={e => set('annee_debut', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LABEL}>Durée (semaines)</label>
                  <input
                    type="number" min={1}
                    value={form.duree_semaines}
                    onChange={e => set('duree_semaines', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 5 }}>
                Début : S{form.semaine_debut} {form.annee_debut} — {debutLabel}
                {' · '}Fin : S{finWeek.semaine} {finWeek.annee}
              </p>
            </div>

            {/* Intervenants (etude / chantier) */}
            {(form.type_tache === 'etude' || form.type_tache === 'chantier') && (
              <div>
                <label style={LABEL}>Intervenants</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {INTERVENANTS.map(iv => {
                    const active = (form.intervenants ?? []).includes(iv.id)
                    const color = TYPE_COLORS[form.type_tache]
                    return (
                      <button
                        key={iv.id} type="button"
                        onClick={() => toggleIntervenant(iv.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11,
                          border: `1px solid ${active ? color : 'rgba(0,0,0,0.12)'}`,
                          backgroundColor: active ? color + '18' : 'white',
                          color: active ? color : '#6b7280',
                          cursor: 'pointer', fontWeight: active ? 600 : 400,
                        }}
                      >
                        {iv.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Texte barre (administratif) */}
            {form.type_tache === 'administratif' && (
              <div>
                <label style={LABEL}>Texte affiché dans la barre</label>
                <input
                  value={form.label_barre}
                  onChange={e => set('label_barre', e.target.value)}
                  placeholder="Ex: 5 MOIS INSTRUCTION PC ERP"
                  style={INPUT}
                />
              </div>
            )}

            {/* Avancement */}
            <div>
              <label style={LABEL}>Avancement ({form.avancement} %)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range" min={0} max={100} value={form.avancement}
                  onChange={e => set('avancement', Number(e.target.value))}
                  style={{ flex: 1, accentColor: TYPE_COLORS[form.type_tache] }}
                />
                <input
                  type="number" min={0} max={100} value={form.avancement}
                  onChange={e => set('avancement', Math.max(0, Math.min(100, Number(e.target.value))))}
                  style={{ ...INPUT, width: 60 }}
                />
              </div>
            </div>

            {/* Dépend de */}
            {otherTaches.length > 0 && (
              <div>
                <label style={LABEL}>Dépend de (chemin critique)</label>
                <select
                  value={form.depends_on ?? 'none'}
                  onChange={e => handleDependencyChange(e.target.value)}
                  style={{ ...INPUT, height: 36 }}
                >
                  <option value="none">— Aucune dépendance —</option>
                  {otherTaches.map(t => (
                    <option key={t.id} value={t.id}>
                      S{t.semaine_debut} — {t.num_tache} {t.nom}
                    </option>
                  ))}
                </select>
                {form.depends_on && (
                  <div style={{ marginTop: 8 }}>
                    <label style={LABEL}>Battement (semaines)</label>
                    <input
                      type="number"
                      value={form.lag_semaines ?? 0}
                      onChange={e => set('lag_semaines', Number(e.target.value))}
                      style={{ ...INPUT, width: 80 }}
                    />
                    <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 3 }}>
                      Semaines de battement après la fin de la tâche parente (0 = collée)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, alignItems: 'center' }}>
            {mode === 'edit' && tache && (
              <button
                type="button" onClick={handleDelete} disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                  border: `0.5px solid ${confirmDelete ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
                  backgroundColor: confirmDelete ? '#FEF2F2' : 'white',
                  color: confirmDelete ? '#DC2626' : '#9B8F85',
                  marginRight: 'auto',
                }}
              >
                <Trash2 size={13} />
                {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            )}
            <button
              type="button" onClick={onClose}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
              }}
            >
              Annuler
            </button>
            <button
              type="submit" disabled={saving || !form.nom.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: 'none', backgroundColor: '#639922', color: 'white', cursor: 'pointer',
                opacity: saving || !form.nom.trim() ? 0.6 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
