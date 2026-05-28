import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import {
  TYPE_COLORS, TYPE_LABELS,
  getWeekStart, getCurrentWeek, addWeeks,
  computeLagSemaines,
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

const MOA_TYPES = ['validation', 'administratif', 'chantier']

function emptyForm() {
  const now = getCurrentWeek()
  return {
    nom: '',
    importance: 'moe',
    type_tache: 'etude',
    semaine_debut: now.semaine,
    annee_debut: now.annee,
    duree_semaines: 4,
    duree_arch: '',
    duree_bet: '',
    duree_econ: '',
    label_barre: '',
    depends_on: null,
    lag_semaines: 0,
  }
}

export function PhaseEtudeModal({ open, onClose, phase, phases, onSave, onDelete, mode }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    if (phase) {
      setForm({
        nom: phase.nom ?? '',
        importance: phase.importance ?? 'moe',
        type_tache: phase.type_tache ?? 'etude',
        semaine_debut: phase.semaine_debut,
        annee_debut: phase.annee_debut,
        duree_semaines: phase.duree_semaines ?? 1,
        duree_arch: phase.duree_arch ?? '',
        duree_bet: phase.duree_bet ?? '',
        duree_econ: phase.duree_econ ?? '',
        label_barre: phase.label_barre ?? '',
        depends_on: phase.depends_on ?? null,
        lag_semaines: phase.lag_semaines ?? 0,
      })
    } else {
      setForm(emptyForm())
    }
    setConfirmDelete(false)
  }, [open, phase])

  if (!open) return null

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleImportanceChange = (imp) => {
    setForm(f => ({
      ...f,
      importance: imp,
      type_tache: imp === 'moe' ? 'etude' : (f.type_tache === 'etude' ? 'validation' : f.type_tache),
      ...(imp === 'moa' ? { duree_arch: '', duree_bet: '', duree_econ: '' } : {}),
    }))
  }

  const handleDependencyChange = (val) => {
    const newDep = val === 'none' ? null : Number(val)
    if (!newDep) { set('depends_on', null); set('lag_semaines', 0); return }
    const parent = phases.find(p => p.id === newDep)
    if (!parent) { set('depends_on', newDep); return }
    const lag = computeLagSemaines(
      parent.semaine_debut, parent.annee_debut, parent.duree_semaines,
      form.semaine_debut, form.annee_debut
    )
    setForm(f => ({ ...f, depends_on: newDep, lag_semaines: Math.max(0, lag) }))
  }

  const subTotal = (Number(form.duree_arch) || 0) + (Number(form.duree_bet) || 0) + (Number(form.duree_econ) || 0)
  const subDelta = subTotal - Number(form.duree_semaines)

  const debutDate = getWeekStart(form.semaine_debut, form.annee_debut)
  const debutLabel = debutDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const finWeek = addWeeks(form.semaine_debut, form.annee_debut, form.duree_semaines)

  const lagSem = Number(form.lag_semaines ?? 0)
  const lagText = lagSem === 0
    ? 'Collée (commence la semaine suivant la fin)'
    : `${lagSem} semaine${lagSem > 1 ? 's' : ''} de battement`

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    const isMoe = form.importance === 'moe'
    const payload = {
      nom: form.nom.trim(),
      importance: form.importance,
      type_tache: isMoe ? 'etude' : form.type_tache,
      semaine_debut: Number(form.semaine_debut),
      annee_debut: Number(form.annee_debut),
      duree_semaines: Math.max(1, Number(form.duree_semaines)),
      duree_arch: isMoe && form.duree_arch !== '' ? Number(form.duree_arch) : null,
      duree_bet: isMoe && form.duree_bet !== '' ? Number(form.duree_bet) : null,
      duree_econ: isMoe && form.duree_econ !== '' ? Number(form.duree_econ) : null,
      label_barre: form.type_tache === 'administratif' ? (form.label_barre || null) : null,
      depends_on: form.depends_on ?? null,
      lag_semaines: form.depends_on ? lagSem : 0,
    }
    await onSave({ ...phase, ...payload })
    setSaving(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    await onDelete(phase.id)
    setSaving(false)
    onClose()
  }

  const otherPhases = phases.filter(p => p.id !== phase?.id)

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.14)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
            {mode === 'create' ? 'Nouvelle phase' : 'Modifier la phase'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B8F85' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Importance: MOE / MOA */}
            <div>
              <label style={LABEL}>Rôle de la phase</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { value: 'moe', title: 'MOE', subtitle: "Maîtrise d'Œuvre", desc: 'ESQ, APS, APD, PRO, DCE…', color: '#E05A1E', bg: '#FAF0EB' },
                  { value: 'moa', title: 'MOA', subtitle: "Maîtrise d'Ouvrage", desc: 'Validation, dépôt, instruction…', color: '#2563EB', bg: '#EFF6FF' },
                ].map(({ value, title, subtitle, desc, color, bg }) => {
                  const active = form.importance === value
                  return (
                    <button key={value} type="button" onClick={() => handleImportanceChange(value)}
                      style={{
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        border: `1.5px solid ${active ? color : 'rgba(0,0,0,0.1)'}`,
                        backgroundColor: active ? bg : 'white',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? color : '#1a1a1a', marginBottom: 2 }}>{title}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: active ? color : '#6b7280', marginBottom: 2 }}>{subtitle}</div>
                      <div style={{ fontSize: 10, color: '#9B8F85' }}>{desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* MOA: nature selector */}
            {form.importance === 'moa' && (
              <div>
                <label style={LABEL}>Nature</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MOA_TYPES.map(type => {
                    const color = TYPE_COLORS[type]
                    const active = form.type_tache === type
                    return (
                      <button key={type} type="button" onClick={() => set('type_tache', type)}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                          border: `1.5px solid ${active ? color : 'rgba(0,0,0,0.1)'}`,
                          backgroundColor: active ? color + '18' : 'transparent',
                          fontSize: 11, fontWeight: 500, color: active ? color : '#6b7280',
                        }}
                      >
                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: active ? color : '#d1d5db', margin: '0 auto 3px' }} />
                        {TYPE_LABELS[type].replace("Phase d'", '').replace('Période ', '').replace(' / Visa', '')}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Nom */}
            <div>
              <label style={LABEL}>Nom de la phase *</label>
              <input
                value={form.nom}
                onChange={e => set('nom', e.target.value)}
                placeholder={form.importance === 'moe' ? 'Ex: APS — Avant-Projet Sommaire' : 'Ex: Validation APS ORSAC'}
                required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E05A1E'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Temporalité */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>Semaine début (1–53)</label>
                  <input type="number" min={1} max={53}
                    value={form.semaine_debut}
                    onChange={e => set('semaine_debut', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LABEL}>Année</label>
                  <input type="number" min={2020} max={2040}
                    value={form.annee_debut}
                    onChange={e => set('annee_debut', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LABEL}>Durée (semaines)</label>
                  <input type="number" min={1}
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

            {/* Sous-durées MOE */}
            {form.importance === 'moe' && (
              <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: '#FAFAF9', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <label style={{ ...LABEL, marginBottom: 2 }}>Répartition des intervenants (optionnel)</label>
                <p style={{ fontSize: 11, color: '#9B8F85', marginBottom: 10 }}>Décomposez la durée en sous-périodes successives</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { key: 'duree_arch', label: 'Architecte', color: '#E8A200' },
                    { key: 'duree_bet',  label: 'BE',          color: '#2563EB' },
                    { key: 'duree_econ', label: 'Économiste',  color: '#639922' },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <label style={{ ...LABEL, color }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: color, marginRight: 4, verticalAlign: 'middle' }} />
                        {label}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min={0}
                          value={form[key]}
                          onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="—"
                          style={{ ...INPUT, paddingRight: 36 }}
                        />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9B8F85', pointerEvents: 'none' }}>
                          sem.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {subTotal > 0 && (
                  <p style={{ fontSize: 11, marginTop: 8, fontWeight: 500, color: subDelta > 0 ? '#DC2626' : subDelta === 0 ? '#639922' : '#9B8F85' }}>
                    {subDelta > 0
                      ? `Total dépasse la durée (${subTotal} > ${form.duree_semaines} sem.)`
                      : subDelta === 0
                        ? `✓ Durée totale couverte`
                        : `${subTotal} sem. renseignées sur ${form.duree_semaines} sem.`}
                  </p>
                )}
              </div>
            )}

            {/* Label barre (administratif MOA) */}
            {form.type_tache === 'administratif' && form.importance === 'moa' && (
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

            {/* Dépendance */}
            {otherPhases.length > 0 && (
              <div>
                <label style={LABEL}>Dépend de (chemin critique)</label>
                <select
                  value={form.depends_on ?? 'none'}
                  onChange={e => handleDependencyChange(e.target.value)}
                  style={{ ...INPUT, height: 36 }}
                >
                  <option value="none">— Aucune dépendance —</option>
                  {otherPhases.map(p => (
                    <option key={p.id} value={p.id}>
                      S{p.semaine_debut} — {p.nom}
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
                    <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 4 }}>{lagText}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, alignItems: 'center' }}>
            {mode === 'edit' && phase && (
              <button type="button" onClick={handleDelete} disabled={saving}
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
            <button type="button" onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}
            >
              Annuler
            </button>
            <button type="submit" disabled={saving || !form.nom.trim()}
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
