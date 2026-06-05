import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import {
  getWeekStart, getCurrentWeek, addWeeks,
  computeLagSemaines,
} from './types'

const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

const TYPE_OPTIONS = [
  { type: 'etude',         label: 'MOE',          sublabel: 'ESQ, APS, APD, PRO, DCE…',       couleur: '#E8A200', fondClair: '#FFF8E7' },
  { type: 'validation',    label: 'MOA',           sublabel: 'Visas, validations, approbations', couleur: '#2A8A4E', fondClair: 'rgba(42,138,78,0.12)' },
  { type: 'administratif', label: 'Administratif', sublabel: 'Instruction PC, recours, dépôt…', couleur: '#D97706', fondClair: '#FEF3C7' },
  { type: 'chantier',      label: 'Chantier',      sublabel: 'DET, travaux, OPR, réception',    couleur: '#1B3A5C', fondClair: 'rgba(27,58,92,0.10)' },
]

const TYPE_PLACEHOLDERS = {
  etude:         'Ex: APS — Avant-Projet Sommaire',
  validation:    'Ex: Validation APS ORSAC',
  administratif: "Ex: Instruction Permis de Construire",
  chantier:      "Ex: DET — Direction de l'exécution des travaux",
}

export function typeToImportance(type) {
  return { etude: 'moe', validation: 'moa', administratif: 'admin', chantier: 'chantier' }[type] ?? 'moa'
}

function emptyForm() {
  const now = getCurrentWeek()
  return {
    nom: '',
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
        nom:           phase.nom ?? '',
        type_tache:    phase.type_tache ?? 'etude',
        semaine_debut: phase.semaine_debut,
        annee_debut:   phase.annee_debut,
        duree_semaines: phase.duree_semaines ?? 1,
        duree_arch:    phase.duree_arch ?? '',
        duree_bet:     phase.duree_bet  ?? '',
        duree_econ:    phase.duree_econ ?? '',
        label_barre:   phase.label_barre ?? '',
        depends_on:    phase.depends_on ?? null,
        lag_semaines:  phase.lag_semaines ?? 0,
      })
    } else {
      setForm(emptyForm())
    }
    setConfirmDelete(false)
  }, [open, phase])

  if (!open) return null

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleTypeChange = (type) => {
    setForm(f => ({
      ...f,
      type_tache: type,
      // Réinitialiser les sous-durées si on quitte MOE
      duree_arch: type === 'etude' ? f.duree_arch : '',
      duree_bet:  type === 'etude' ? f.duree_bet  : '',
      duree_econ: type === 'etude' ? f.duree_econ : '',
      // Réinitialiser label_barre si on quitte administratif
      label_barre: type === 'administratif' ? f.label_barre : '',
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
    const isMoe = form.type_tache === 'etude'
    // importance : uniquement 'moe'/'moa' tant que la migration 013 n'est pas appliquée
    const importance = isMoe ? 'moe' : 'moa'
    const payload = {
      nom:            form.nom.trim(),
      type_tache:     form.type_tache,
      importance,
      semaine_debut:  Number(form.semaine_debut),
      annee_debut:    Number(form.annee_debut),
      duree_semaines: Math.max(1, Number(form.duree_semaines)),
      duree_arch:  isMoe && form.duree_arch !== '' ? Number(form.duree_arch) : null,
      duree_bet:   isMoe && form.duree_bet  !== '' ? Number(form.duree_bet)  : null,
      duree_econ:  isMoe && form.duree_econ !== '' ? Number(form.duree_econ) : null,
      label_barre: form.type_tache === 'administratif' ? (form.label_barre || null) : null,
      depends_on:  form.depends_on ?? null,
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
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
            {mode === 'create' ? 'Nouvelle phase' : 'Modifier la phase'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 4 boutons de type */}
            <div>
              <label style={LABEL}>Type de phase</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {TYPE_OPTIONS.map(opt => {
                  const isSelected = form.type_tache === opt.type
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => handleTypeChange(opt.type)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: isSelected
                          ? `1.5px solid ${opt.couleur}`
                          : '0.5px solid rgba(0,0,0,0.12)',
                        backgroundColor: isSelected ? opt.fondClair : '#FAFAF9',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? opt.couleur : '#1F1B17', marginBottom: 2 }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#9C9591', lineHeight: 1.3 }}>
                        {opt.sublabel}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Nom */}
            <div>
              <label style={LABEL}>Nom de la phase *</label>
              <input
                value={form.nom}
                onChange={e => set('nom', e.target.value)}
                placeholder={TYPE_PLACEHOLDERS[form.type_tache]}
                required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
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
              <p style={{ fontSize: 11, color: '#9C9591', marginTop: 5 }}>
                Début : S{form.semaine_debut} {form.annee_debut} — {debutLabel}
                {' · '}Fin : S{finWeek.semaine} {finWeek.annee}
              </p>
            </div>

            {/* Sous-durées — MOE (etude) uniquement */}
            {form.type_tache === 'etude' && (
              <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: '#FAFAF9', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <label style={{ ...LABEL, marginBottom: 2 }}>Répartition des intervenants (optionnel)</label>
                <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 10 }}>Décomposez la durée en sous-périodes successives</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { key: 'duree_arch', label: '① Architecte', color: '#E8A200' },
                    { key: 'duree_bet',  label: '② BET',        color: '#1B3A5C' },
                    { key: 'duree_econ', label: '③ Économiste', color: '#2A8A4E' },
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
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9C9591', pointerEvents: 'none' }}>
                          sem.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {subTotal > 0 && (
                  <p style={{ fontSize: 11, marginTop: 8, fontWeight: 500, color: subDelta > 0 ? '#B8412C' : subDelta === 0 ? '#2A8A4E' : '#9C9591' }}>
                    {subDelta > 0
                      ? `Total dépasse la durée (${subTotal} > ${form.duree_semaines} sem.)`
                      : subDelta === 0
                        ? `✓ Durée totale couverte`
                        : `${subTotal} sem. renseignées sur ${form.duree_semaines} sem.`}
                  </p>
                )}
              </div>
            )}

            {/* Label barre — administratif uniquement */}
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
                    <p style={{ fontSize: 11, color: '#9C9591', marginTop: 4 }}>{lagText}</p>
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
                  backgroundColor: confirmDelete ? 'rgba(184,65,44,0.10)' : 'white',
                  color: confirmDelete ? '#B8412C' : '#9C9591',
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
                border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer',
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
