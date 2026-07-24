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
      placeholder="#E8602C"
      style={{
        width: 80, fontSize: 12, padding: '4px 8px', borderRadius: 2,
        border: '0.5px solid rgba(0,0,0,0.12)', fontVariantNumeric: 'tabular-nums',
      }}
    />
  )
}

function ZoneRow({ zone, onUpdate, onDelete, onPastilleClick, autoFocus }) {
  const [nom, setNom] = useState(zone.nom)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setNom(zone.nom) }, [zone.nom])

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus()
  }, [autoFocus])

  const commitNom = (value) => {
    if (value !== zone.nom) onUpdate(zone.id, { nom: value })
  }

  const handleNomChange = (e) => {
    const value = e.target.value
    setNom(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => commitNom(value), 500)
  }

  const handleDelete = () => {
    if (!confirmingDelete) { setConfirmingDelete(true); return }
    onDelete(zone.id)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
    }}>
      <button
        type="button" onClick={(e) => onPastilleClick(e, zone)}
        title="Changer la couleur"
        style={{
          width: 22, height: 22, borderRadius: '50%', backgroundColor: zone.couleur,
          border: '0.5px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0, flexShrink: 0,
        }}
      />

      <input
        ref={inputRef}
        value={nom}
        onChange={handleNomChange}
        onBlur={(e) => { clearTimeout(debounceRef.current); commitNom(e.target.value) }}
        placeholder="Nom de la zone"
        style={{
          flex: 1, height: 32, padding: '0 10px', borderRadius: 2, fontSize: 13,
          border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
          boxSizing: 'border-box', color: '#1F1B17', minWidth: 0,
        }}
        onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
        onBlurCapture={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
      />

      <button
        type="button" onClick={handleDelete}
        onMouseLeave={() => setConfirmingDelete(false)}
        title={confirmingDelete ? 'Cliquer à nouveau pour confirmer' : 'Supprimer la zone'}
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
  )
}

export function ZonesModal({ open, onClose, zones, createZone, updateZone, deleteZone }) {
  const [focusNewId, setFocusNewId] = useState(null)
  const [pickerState, setPickerState] = useState(null)

  useEffect(() => { if (!open) setPickerState(null) }, [open])

  if (!open) return null

  const handleAdd = async () => {
    const { data } = await createZone('', '#9C9591')
    if (data) setFocusNewId(data.id)
  }

  const handlePastilleClick = (e, zone) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPickerState({ zoneId: zone.id, x: rect.left, y: rect.bottom + 8 })
  }

  const pickerZone = pickerState ? zones.find((z) => z.id === pickerState.zoneId) : null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 0, padding: 28,
        width: '100%', maxWidth: 500, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>Zones de couleur</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 16, flexShrink: 0 }}>
          Définissez des zones pour colorier les tâches indépendamment des lots
        </p>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {zones.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9C9591', textAlign: 'center', padding: '24px 0' }}>
              Aucune zone — ajoutez-en une ci-dessous.
            </p>
          ) : (
            zones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                onUpdate={updateZone}
                onDelete={deleteZone}
                onPastilleClick={handlePastilleClick}
                autoFocus={zone.id === focusNewId}
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
            <Plus size={13} /> Nouvelle zone
          </button>
        </div>
      </div>

      {pickerState && pickerZone && createPortal(
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
                  onClick={() => { updateZone(pickerState.zoneId, { couleur }); setPickerState(null) }}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: couleur, cursor: 'pointer',
                    border: pickerZone.couleur.toLowerCase() === couleur.toLowerCase()
                      ? '2px solid #1F1B17' : '2px solid transparent',
                  }}
                />
              ))}
            </div>

            {/* Input couleur libre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={pickerZone.couleur ?? '#9C9591'}
                onChange={(e) => updateZone(pickerState.zoneId, { couleur: e.target.value })}
                style={{ width: 32, height: 32, border: 'none', padding: 0, cursor: 'pointer' }}
              />
              <HexInput
                value={pickerZone.couleur ?? '#9C9591'}
                onCommit={(couleur) => updateZone(pickerState.zoneId, { couleur })}
              />
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
