import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'

const PRESET_COLORS = [
  '#e47339', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#639922',
]

const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9B8F85', marginBottom: 4,
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#639922', color: 'white', border: 'none', fontWeight: 500,
}

export function LotsColorModal({ open, onClose, lots, onSave }) {
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(lots.map((l) => ({ id: l.id, couleur: l.couleur })))
    }
  }, [lots, open])

  const updateColor = (id, couleur) => {
    setDraft((d) => d.map((l) => l.id === id ? { ...l, couleur } : l))
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

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 520, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>
            Couleurs des lots du planning
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B8F85' }}>
            <X size={18} />
          </button>
        </div>

        {/* Info message */}
        <div style={{
          backgroundColor: '#F5F2F0', borderRadius: 8, padding: '8px 12px',
          marginBottom: 16, flexShrink: 0,
        }}>
          <p style={{ fontSize: 11, color: '#9B8F85' }}>
            Les lots sont gérés dans le module <strong>Entreprises & Lots</strong>.
            Vous pouvez personnaliser ici leur couleur d'affichage.
          </p>
        </div>

        {/* Lots list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
          {lots.map((lot) => {
            const d = draft.find((x) => x.id === lot.id)
            const couleur = d?.couleur ?? lot.couleur
            return (
              <div key={lot.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.08)',
                backgroundColor: '#FAFAF9',
              }}>
                {/* Color picker */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  backgroundColor: couleur, border: '0.5px solid rgba(0,0,0,0.12)',
                  position: 'relative', overflow: 'hidden', cursor: 'pointer',
                }} title="Cliquer pour changer la couleur">
                  <input
                    type="color" value={couleur}
                    onChange={(e) => updateColor(lot.id, e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                  />
                </div>

                {/* Lot info (read-only) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>
                    <span style={{ color: couleur, fontWeight: 700 }}>{lot.num_lot}</span>
                    {' '}– {lot.nom}
                  </p>
                  {/* Color presets */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c} type="button"
                        onClick={() => updateColor(lot.id, c)}
                        style={{
                          width: 16, height: 16, borderRadius: '50%',
                          backgroundColor: c, border: couleur === c ? '2px solid #1a1a1a' : '2px solid transparent',
                          cursor: 'pointer', transition: 'transform 0.1s',
                          transform: couleur === c ? 'scale(1.2)' : 'scale(1)',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {lots.length === 0 && (
            <p style={{ fontSize: 12, color: '#9B8F85', textAlign: 'center', padding: '24px 0' }}>
              Aucun lot — configurez d'abord les lots dans Entreprises & Lots
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0, marginTop: 16,
        }}>
          <button style={BTN} onClick={onClose} disabled={saving}>Annuler</button>
          <button style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            <Save size={13} />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
