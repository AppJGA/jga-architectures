import { useState } from 'react'
import { X, Flag, Pencil, Check, Trash2, Plus } from 'lucide-react'
import { supabase } from '../../../core/supabase/client'
import { getWeekStart } from './types'

const JALONS_SUGGERES = [
  "Validation ESQ",
  "Validation APS",
  "Validation APD",
  "Dépôt PC",
  "Obtention PC",
  "Démarrage chantier",
  "Mise hors d'eau / hors d'air",
  "Réception des travaux",
  "Livraison",
]

const COLORS_PRESET = [
  '#8B5CF6', '#E8602C', '#2A8A4E', '#1B3A5C',
  '#B8412C', '#D97706', '#0891B2', '#DB2777',
]

const LABEL_STYLE = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 34, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

function fmtSemaine(sem, annee) {
  if (!sem || !annee) return ''
  try {
    const d = getWeekStart(Number(sem), Number(annee))
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '' }
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {COLORS_PRESET.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          style={{
            width: 20, height: 20, borderRadius: '50%', backgroundColor: c,
            border: 'none', cursor: 'pointer', flexShrink: 0,
            outline: value === c ? `2.5px solid ${c}` : 'none', outlineOffset: 2,
          }}
        />
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 24, height: 24, borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0 }}
        title="Couleur personnalisée"
      />
    </div>
  )
}

function JalonRow({ jalon, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ label: jalon.label, semaine: jalon.semaine, annee: jalon.annee, couleur: jalon.couleur })
  const [confirming, setConfirming] = useState(false)

  const handleSave = async () => {
    if (!draft.label.trim() || !draft.semaine || !draft.annee) return
    await onUpdate(jalon.id, { label: draft.label.trim(), semaine: Number(draft.semaine), annee: Number(draft.annee), couleur: draft.couleur })
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return }
    await onDelete(jalon.id)
  }

  if (editing) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px auto auto', gap: 8, alignItems: 'end', padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <div>
          <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            list="jalon-etude-suggeres" style={INPUT} autoFocus
            onFocus={e => { e.target.style.borderColor = '#8B5CF6'; e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
          />
        </div>
        <input type="number" min={1} max={53} placeholder="Sem." value={draft.semaine}
          onChange={e => setDraft(d => ({ ...d, semaine: e.target.value }))}
          style={{ ...INPUT }}
        />
        <input type="number" min={2020} max={2040} placeholder="Année" value={draft.annee}
          onChange={e => setDraft(d => ({ ...d, annee: e.target.value }))}
          style={{ ...INPUT }}
        />
        <ColorPicker value={draft.couleur} onChange={c => setDraft(d => ({ ...d, couleur: c }))} />
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={handleSave} style={{ width: 28, height: 28, borderRadius: 3, border: 'none', cursor: 'pointer', backgroundColor: '#2A8A4E', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={13} />
          </button>
          <button type="button" onClick={() => setEditing(false)} style={{ width: 28, height: 28, borderRadius: 3, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#5E5854', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: jalon.couleur, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1F1B17', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {jalon.label}
      </span>
      <span style={{ fontSize: 11, color: '#9C9591', flexShrink: 0 }}>
        S{jalon.semaine} {jalon.annee} · {fmtSemaine(jalon.semaine, jalon.annee)}
      </span>
      <button type="button" onClick={() => { setEditing(true); setConfirming(false) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4, borderRadius: 3, display: 'flex' }}
        onMouseEnter={e => e.currentTarget.style.color = '#E8602C'}
        onMouseLeave={e => e.currentTarget.style.color = '#9C9591'}
      >
        <Pencil size={13} />
      </button>
      <button type="button" onClick={handleDelete}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: confirming ? 'rgba(184,65,44,0.10)' : 'none',
          border: confirming ? '0.5px solid rgba(220,38,38,0.3)' : 'none',
          cursor: 'pointer', color: confirming ? '#B8412C' : '#9C9591',
          padding: '3px 6px', borderRadius: 3, fontSize: 11,
        }}
        onMouseEnter={e => !confirming && (e.currentTarget.style.color = '#B8412C')}
        onMouseLeave={e => !confirming && (e.currentTarget.style.color = '#9C9591')}
      >
        <Trash2 size={12} />
        {confirming && 'Confirmer'}
      </button>
    </div>
  )
}

export function JalonEtudeModal({ open, onClose, jalons, affaireId, onRefetch }) {
  const [newLabel, setNewLabel] = useState('')
  const [newSemaine, setNewSemaine] = useState('')
  const [newAnnee, setNewAnnee] = useState(new Date().getFullYear())
  const [newCouleur, setNewCouleur] = useState('#8B5CF6')
  const [saving, setSaving] = useState(false)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newLabel.trim() || !newSemaine || !newAnnee) return
    setSaving(true)
    const { error } = await supabase.from('planning_etude_jalons').insert([{
      affaire_id: affaireId,
      label: newLabel.trim(),
      semaine: Number(newSemaine),
      annee: Number(newAnnee),
      couleur: newCouleur,
    }])
    if (!error) {
      setNewLabel(''); setNewSemaine(''); setNewCouleur('#8B5CF6')
      await onRefetch()
    }
    setSaving(false)
  }

  const handleUpdate = async (id, changes) => {
    await supabase.from('planning_etude_jalons').update(changes).eq('id', id)
    await onRefetch()
  }

  const handleDelete = async (id) => {
    await supabase.from('planning_etude_jalons').delete().eq('id', id)
    await onRefetch()
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 0, padding: 28, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 2, backgroundColor: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flag size={16} style={{ color: '#8B5CF6' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>Jalons du planning d'étude</h2>
              <p style={{ fontSize: 11, color: '#9C9591', marginTop: 1 }}>Dates clés en semaines ISO</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {jalons.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C9591', textAlign: 'center', padding: '24px 0' }}>
              Aucun jalon — ajoutez des dates clés ci-dessous.
            </p>
          ) : (
            jalons.map(j => (
              <JalonRow key={j.id} jalon={j} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))
          )}
        </div>

        <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16, flexShrink: 0 }}>
          <p style={LABEL_STYLE}>Ajouter un jalon</p>
          <form onSubmit={handleCreate}>
            <datalist id="jalon-etude-suggeres">
              {JALONS_SUGGERES.map(s => <option key={s} value={s} />)}
            </datalist>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px auto auto', gap: 8, alignItems: 'flex-end' }}>
              <div>
                <label style={LABEL_STYLE}>Label</label>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  list="jalon-etude-suggeres" placeholder="Ex: Dépôt PC" required style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#8B5CF6'; e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Semaine</label>
                <input type="number" min={1} max={53} value={newSemaine} onChange={e => setNewSemaine(e.target.value)} required style={INPUT} placeholder="23" />
              </div>
              <div>
                <label style={LABEL_STYLE}>Année</label>
                <input type="number" min={2020} max={2040} value={newAnnee} onChange={e => setNewAnnee(e.target.value)} required style={INPUT} />
              </div>
              <div>
                <label style={LABEL_STYLE}>Couleur</label>
                <ColorPicker value={newCouleur} onChange={setNewCouleur} />
              </div>
              <button type="submit" disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px', height: 34, borderRadius: 2, fontSize: 12, cursor: saving ? 'default' : 'pointer', border: 'none', backgroundColor: '#2A8A4E', color: 'white', fontWeight: 500, opacity: saving ? 0.7 : 1, flexShrink: 0 }}
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>
            {newSemaine && newAnnee && (
              <p style={{ fontSize: 11, color: '#9C9591', marginTop: 5 }}>
                S{newSemaine} {newAnnee} → {fmtSemaine(newSemaine, newAnnee)}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
