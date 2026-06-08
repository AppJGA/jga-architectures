import { useState } from 'react'
import { X, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Zap } from 'lucide-react'
import { useCrTemplate } from '../../../shared/hooks/useCrTemplate'

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}
function focusOn(e)  { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.07)' }
function focusOff(e) { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }

function SectionRow({ tmpl, idx, total, onEdit, onDelete, onReorder }) {
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#E8602C', backgroundColor: 'rgba(232,96,44,0.10)', borderRadius: 3, padding: '2px 7px' }}>{tmpl.numero_romain}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{tmpl.titre}</span>
        </div>
        {(tmpl.sous_sections ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(tmpl.sous_sections ?? []).map((ss, i) => (
              <span key={i} style={{ fontSize: 10, color: '#5E5854', backgroundColor: '#FAF7F2', borderRadius: 3, padding: '2px 6px' }}>
                {ss.code} — {ss.titre}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
        <button onClick={() => onReorder(tmpl.id, 'up')} disabled={idx === 0} style={{ padding: 4, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={13} /></button>
        <button onClick={() => onReorder(tmpl.id, 'down')} disabled={idx === total - 1} style={{ padding: 4, background: 'none', border: 'none', cursor: idx === total - 1 ? 'default' : 'pointer', color: idx === total - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={13} /></button>
        <button onClick={() => onEdit(tmpl)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={13} /></button>
        <button
          onClick={() => { if (!confirmDel) { setConfirmDel(true); return } onDelete(tmpl.id) }}
          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: confirmDel ? '#B8412C' : '#9C9591' }}
        ><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

function SectionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? { numero_romain: '', titre: '', sous_sections: [] })
  const [ssInput, setSsInput] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addSs = () => {
    const parts = ssInput.split('—').map(s => s.trim())
    if (!parts[0]) return
    const code = parts.length > 1 ? parts[0] : String(form.sous_sections.length + 1)
    const titre = parts.length > 1 ? parts[1] : parts[0]
    setForm(f => ({ ...f, sous_sections: [...f.sous_sections, { code, titre }] }))
    setSsInput('')
  }

  const removeSs = (i) => setForm(f => ({ ...f, sous_sections: f.sous_sections.filter((_, idx) => idx !== i) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.numero_romain.trim() || !form.titre.trim()) return
    setSaving(true)
    try { await onSave(form) } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#FAFAF9', borderRadius: 2, padding: '14px 16px', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>N° romain</label>
            <input value={form.numero_romain} onChange={e => set('numero_romain', e.target.value)} placeholder="I, II…" style={INPUT} onFocus={focusOn} onBlur={focusOff} required />
          </div>
          <div>
            <label style={LABEL}>Titre</label>
            <input value={form.titre} onChange={e => set('titre', e.target.value)} placeholder="Titre de la section…" style={INPUT} onFocus={focusOn} onBlur={focusOff} required />
          </div>
        </div>

        <div>
          <label style={LABEL}>Sous-sections</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={ssInput}
              onChange={e => setSsInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSs())}
              placeholder="1-1 — Titre de sous-section"
              style={{ ...INPUT, flex: 1 }}
              onFocus={focusOn} onBlur={focusOff}
            />
            <button type="button" onClick={addSs} style={{ padding: '0 12px', borderRadius: 2, fontSize: 12, border: '0.5px solid #E8602C', backgroundColor: 'rgba(232,96,44,0.10)', color: '#E8602C', cursor: 'pointer', flexShrink: 0 }}>
              <Plus size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {form.sous_sections.map((ss, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', backgroundColor: 'white', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <span style={{ fontSize: 10, color: '#E8602C', fontWeight: 500 }}>{ss.code}</span>
                <span style={{ fontSize: 12, flex: 1 }}>{ss.titre}</span>
                <button type="button" onClick={() => removeSs(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 2 }}><X size={11} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onCancel} style={{ padding: '6px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}>Annuler</button>
        <button type="submit" disabled={saving} style={{ padding: '6px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

export function TemplateModal({ affaireId, crId, lots, interlocuteurs, onClose, onApplied }) {
  const { templates, loading, initDefaults, addTemplate, updateTemplate, deleteTemplate, reorderTemplate, applyTemplate } = useCrTemplate(affaireId)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [applying, setApplying] = useState(false)

  const handleApply = async () => {
    if (!crId) return
    setApplying(true)
    try {
      await applyTemplate(crId, lots, interlocuteurs)
      onApplied?.()
      onClose()
    } catch (err) { console.error(err) }
    setApplying(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '40px 20px' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 0, padding: '28px 32px', width: '100%', maxWidth: 600 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>Templates de sections</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        {!loading && templates.length === 0 && !addOpen && (
          <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#5E5854', marginBottom: 10 }}>Aucun template configuré</p>
            <button onClick={initDefaults} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 2, fontSize: 12, border: '0.5px solid #2A8A4E', backgroundColor: 'rgba(42,138,78,0.12)', color: '#2A8A4E', cursor: 'pointer' }}>
              <Zap size={13} /> Charger le template JGA par défaut
            </button>
          </div>
        )}

        {templates.sort((a, b) => a.ordre - b.ordre).map((tmpl, idx) => (
          editItem?.id === tmpl.id ? (
            <SectionForm
              key={tmpl.id}
              initial={editItem}
              onSave={async (data) => { await updateTemplate(tmpl.id, data); setEditItem(null) }}
              onCancel={() => setEditItem(null)}
            />
          ) : (
            <SectionRow
              key={tmpl.id}
              tmpl={tmpl}
              idx={idx}
              total={templates.length}
              onEdit={setEditItem}
              onDelete={deleteTemplate}
              onReorder={reorderTemplate}
            />
          )
        ))}

        {addOpen && (
          <SectionForm
            onSave={async (data) => { await addTemplate(data); setAddOpen(false) }}
            onCancel={() => setAddOpen(false)}
          />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          <button
            onClick={() => setAddOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}
          >
            <Plus size={13} /> Ajouter une section
          </button>

          {crId && (
            <button
              onClick={handleApply}
              disabled={applying}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer', opacity: applying ? 0.6 : 1 }}
            >
              <Zap size={13} />{applying ? 'Application…' : 'Appliquer au CR'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
