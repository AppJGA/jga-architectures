import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2 } from 'lucide-react'

const COULEURS_PRESET = [
  '#E8602C', '#2A8A4E', '#1B3A5C',
  '#B8412C', '#9C9591', '#C44A1B',
  '#5E5854', '#F8B89A', '#E9E2D6',
  '#8B5CF6', '#0891B2', '#D97706',
  '#64748B', '#0F172A', '#166534',
]

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Champ hex avec brouillon local — évite que la saisie « saute » tant que
// le texte tapé ne correspond pas encore à un hex valide (#RRGGBB).
function HexInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value)

  useEffect(() => { setDraft(value) }, [value])

  return (
    <input
      type="text" value={draft}
      onChange={(e) => {
        const v = e.target.value
        setDraft(v)
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) onCommit(v)
      }}
      placeholder="#B8412C"
      style={{
        width: 80, fontSize: 12, padding: '4px 8px', borderRadius: 2,
        border: '0.5px solid rgba(0,0,0,0.12)', fontVariantNumeric: 'tabular-nums',
      }}
    />
  )
}

function PeriodeRow({ periode, onUpdate, onDelete, onPastilleClick, autoFocus }) {
  const [label, setLabel] = useState(periode.label)
  const [dateDebut, setDateDebut] = useState(periode.date_debut)
  const [dateFin, setDateFin] = useState(periode.date_fin)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setLabel(periode.label) }, [periode.label])
  useEffect(() => { setDateDebut(periode.date_debut) }, [periode.date_debut])
  useEffect(() => { setDateFin(periode.date_fin) }, [periode.date_fin])
  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus()
  }, [autoFocus])

  const error = !label.trim()
    ? 'Le label est requis'
    : (dateDebut && dateFin && dateFin < dateDebut)
      ? 'La date de fin doit être postérieure ou égale à la date de début'
      : null

  // Persiste au blur uniquement (pas à chaque onChange) : des commits concurrents
  // par frappe pouvaient se résoudre dans le désordre et écraser une saisie plus
  // récente par une valeur plus ancienne, donnant l'impression que la date « revient »
  // toujours à la même valeur.
  const commit = () => {
    if (!label.trim() || !dateDebut || !dateFin || dateFin < dateDebut) return
    onUpdate(periode.id, { label, date_debut: dateDebut, date_fin: dateFin })
  }

  const handleLabelChange = (e) => setLabel(e.target.value)

  const handleDateDebutChange = (e) => {
    const value = e.target.value
    setDateDebut(value)
    // Si le début dépasse la fin actuelle, la fin suit pour rester valide —
    // sans ça, décaler le début d'une période nouvellement créée (où début = fin)
    // était silencieusement bloqué par la validation.
    if (dateFin && value > dateFin) setDateFin(value)
  }

  const handleDateFinChange = (e) => {
    const value = e.target.value
    setDateFin(value)
    if (dateDebut && value < dateDebut) setDateDebut(value)
  }

  const handleDelete = () => {
    if (!confirmingDelete) { setConfirmingDelete(true); return }
    onDelete(periode.id)
  }

  const bloquante = periode.est_bloquante !== false

  return (
    <div style={{ padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button" onClick={(e) => onPastilleClick(e, periode)}
          title="Changer la couleur"
          style={{
            width: 20, height: 20, borderRadius: '50%', backgroundColor: periode.couleur,
            border: '0.5px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0, flexShrink: 0,
          }}
        />

        <input
          ref={inputRef}
          value={label}
          onChange={handleLabelChange}
          onBlur={commit}
          placeholder="Ex : Congés été 2025"
          style={{
            flex: 1.4, height: 32, padding: '0 10px', borderRadius: 2, fontSize: 13,
            border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
            boxSizing: 'border-box', color: '#1F1B17', minWidth: 0,
          }}
          onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
          onBlurCapture={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
        />

        <span style={{ fontSize: 11, color: '#9C9591', flexShrink: 0 }}>Du</span>
        <input
          type="date" value={dateDebut ?? ''} onChange={handleDateDebutChange} onBlur={commit}
          style={{
            height: 32, padding: '0 8px', borderRadius: 2, fontSize: 12,
            border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, color: '#9C9591', flexShrink: 0 }}>au</span>
        <input
          type="date" value={dateFin ?? ''} min={dateDebut ?? undefined} onChange={handleDateFinChange} onBlur={commit}
          style={{
            height: 32, padding: '0 8px', borderRadius: 2, fontSize: 12,
            border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', flexShrink: 0,
          }}
        />

        {/* Bloquante (décale les tâches) ou simple repère informatif */}
        <label
          title={bloquante
            ? 'Les tâches sautent cette période'
            : 'Période affichée mais sans effet sur les dates'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
            color: '#5E5854', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <div
            onClick={() => onUpdate(periode.id, { est_bloquante: !bloquante })}
            style={{
              width: 32, height: 18, borderRadius: 9,
              background: bloquante ? '#B8412C' : '#C9C4C0',
              position: 'relative', cursor: 'pointer',
              transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 2, left: bloquante ? 16 : 2,
              width: 14, height: 14, borderRadius: '50%',
              background: 'white', transition: 'left 0.2s',
            }} />
          </div>
          {bloquante ? 'Bloquante' : 'Informative'}
        </label>

        <button
          type="button" onClick={handleDelete}
          onMouseLeave={() => setConfirmingDelete(false)}
          title={confirmingDelete ? 'Cliquer à nouveau pour confirmer' : 'Supprimer la période'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
            background: confirmingDelete ? 'rgba(184,65,44,0.10)' : 'none',
            border: confirmingDelete ? '0.5px solid rgba(220,38,38,0.3)' : 'none',
            cursor: 'pointer', color: confirmingDelete ? '#B8412C' : '#9C9591',
            padding: '5px 6px', borderRadius: 3, fontSize: 11,
          }}
        >
          <Trash2 size={13} />
          {confirmingDelete && 'Confirmer'}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 11, color: '#B8412C', marginTop: 4, paddingLeft: 28 }}>
          {error}
        </p>
      )}
    </div>
  )
}

export function PeriodesBloqueesModal({ open, onClose, periodes, addPeriode, updatePeriode, deletePeriode }) {
  const [focusNewId, setFocusNewId] = useState(null)
  const [pickerState, setPickerState] = useState(null)

  useEffect(() => { if (!open) setPickerState(null) }, [open])

  if (!open) return null

  const handleAdd = async () => {
    const today = todayISO()
    const { data } = await addPeriode({ label: '', date_debut: today, date_fin: today, couleur: '#B8412C' })
    if (data) setFocusNewId(data.id)
  }

  const handlePastilleClick = (e, periode) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPickerState({ periodeId: periode.id, x: rect.left, y: rect.bottom + 8 })
  }

  const pickerPeriode = pickerState ? periodes.find((p) => p.id === pickerState.periodeId) : null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 0, padding: 28,
        width: '100%', maxWidth: 700, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>Périodes</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 16, flexShrink: 0 }}>
          Congés, ponts, fermetures, repères de chantier. Une période <strong>bloquante</strong> est sautée par les tâches ; une période <strong>informative</strong> est seulement affichée.
        </p>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {periodes.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9C9591', textAlign: 'center', padding: '24px 0' }}>
              Aucune période — ajoutez-en une ci-dessous.
            </p>
          ) : (
            periodes.map((periode) => (
              <PeriodeRow
                key={periode.id}
                periode={periode}
                onUpdate={updatePeriode}
                onDelete={deletePeriode}
                onPastilleClick={handlePastilleClick}
                autoFocus={periode.id === focusNewId}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16, flexShrink: 0 }}>
          <button
            type="button" onClick={handleAdd}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
              border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
            }}
          >
            <Plus size={13} /> Ajouter une période
          </button>
        </div>
      </div>

      {pickerState && pickerPeriode && createPortal(
        <>
          <div
            onClick={() => setPickerState(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          />
          <div style={{
            position: 'fixed', left: pickerState.x, top: pickerState.y, zIndex: 1001,
            background: 'white', border: '0.5px solid #E9E2D6', borderRadius: 2,
            padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            {/* Grille preset 5×3 */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 24px)', gap: 6, marginBottom: 10,
            }}>
              {COULEURS_PRESET.map((couleur) => (
                <div
                  key={couleur}
                  onClick={() => { updatePeriode(pickerState.periodeId, { couleur }); setPickerState(null) }}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: couleur, cursor: 'pointer',
                    border: pickerPeriode.couleur.toLowerCase() === couleur.toLowerCase()
                      ? '2px solid #1F1B17' : '2px solid transparent',
                  }}
                />
              ))}
            </div>

            {/* Input couleur libre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={pickerPeriode.couleur ?? '#B8412C'}
                onChange={(e) => updatePeriode(pickerState.periodeId, { couleur: e.target.value })}
                style={{ width: 32, height: 32, border: 'none', padding: 0, cursor: 'pointer' }}
              />
              <HexInput
                value={pickerPeriode.couleur ?? '#B8412C'}
                onCommit={(couleur) => updatePeriode(pickerState.periodeId, { couleur })}
              />
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
