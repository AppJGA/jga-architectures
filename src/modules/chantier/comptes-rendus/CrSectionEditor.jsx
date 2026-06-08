import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, ChevronRight, X, GripVertical, MessageSquarePlus, ToggleLeft, ToggleRight } from 'lucide-react'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'

// ─── Utilitaires ──────────────────────────────────────────────────────────────

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
function nextRoman(sections) {
  const nums = sections.map(s => ROMAN.indexOf(s.numero_romain)).filter(n => n > 0)
  const max = nums.length ? Math.max(...nums) : 0
  return ROMAN[max + 1] ?? String(max + 1)
}

const STATUT_SUGGESTIONS = ['À faire', 'Fait', 'Pour mémoire', 'À prévoir', 'En cours', 'Urgent', 'Annulé']

const ATTR_OPTS = [
  { id: 'general',       label: 'Générale',      color: '#9C9591', bg: '#FAF7F2', border: '#9C9591' },
  { id: 'lot',           label: 'Lot',            color: '#2A8A4E', bg: 'rgba(42,138,78,0.12)', border: '#2A8A4E' },
  { id: 'interlocuteur', label: 'Interlocuteur',  color: '#E8602C', bg: 'rgba(232,96,44,0.10)', border: '#E8602C' },
]

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 3,
}
const INPUT = {
  width: '100%', height: 34, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}
function focusOn(e)  { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.07)' }
function focusOff(e) { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }

function getAttrMode(initial) {
  if (initial?.interlocuteur_id) return 'interlocuteur'
  if (initial?.lot_id) return 'lot'
  return 'general'
}

// ─── Formulaire de remarque ────────────────────────────────────────────────────

function RemarqueForm({ initial, crDate, suggestions, lots, interlocuteurs, sectionType, onSave, onCancel, onDelete }) {
  const today = crDate ?? new Date().toISOString().split('T')[0]
  const defaultAttribution = sectionType === 'interlocuteurs' ? 'interlocuteur' : 'general'
  const [form, setForm] = useState(initial ?? {
    date_note: today, pour: '', description: '',
    statut: 'En cours', date_echeance: '',
    est_important: false, est_clos: false, est_nouveau: false,
    attribution: defaultAttribution, lot_id: '', interlocuteur_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useState(() => {
    if (initial) set('attribution', getAttrMode(initial))
  })

  const setAttribution = (mode) => {
    setForm(f => ({ ...f, attribution: mode, lot_id: '', interlocuteur_id: '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.description?.trim()) return
    setSaving(true)
    try {
      await onSave({
        date_note:        form.date_note || null,
        pour:             form.pour || null,
        description:      form.description,
        statut:           form.statut || null,
        date_echeance:    form.date_echeance || null,
        est_important:    !!form.est_important,
        est_clos:         !!form.est_clos,
        est_nouveau:      !!form.est_nouveau,
        lot_id:           form.attribution === 'lot'           ? (form.lot_id || null)           : null,
        interlocuteur_id: form.attribution === 'interlocuteur' ? (form.interlocuteur_id || null) : null,
      })
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#FAFAF9', borderRadius: 2, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Destinataire proéminent pour sections interlocuteurs */}
        {sectionType === 'interlocuteurs' && interlocuteurs?.length > 0 && (
          <div>
            <label style={{ ...LABEL, color: '#E8602C' }}>Destinataire</label>
            <select
              value={form.interlocuteur_id ?? ''} onChange={e => { set('interlocuteur_id', e.target.value); set('attribution', 'interlocuteur') }}
              style={{ ...INPUT, cursor: 'pointer', borderColor: '#E8602C' }} onFocus={focusOn} onBlur={focusOff}
            >
              <option value="">— Sélectionner un destinataire —</option>
              {interlocuteurs.map(i => {
                const meta = CATEGORIE_META[i.categorie]
                const name = [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '—'
                return (
                  <option key={i.id} value={i.id}>
                    [{meta?.label ?? i.categorie}] {name}{i.organisation ? ` — ${i.organisation}` : ''}
                  </option>
                )
              })}
            </select>
          </div>
        )}

        {/* Date + Pour */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Date</label>
            <input type="date" value={form.date_note ?? ''} onChange={e => set('date_note', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Pour (initiales)</label>
            <input
              value={form.pour ?? ''} onChange={e => set('pour', e.target.value)}
              list="pour-suggestions" placeholder="Ex: SAR, JAC…"
              style={INPUT} onFocus={focusOn} onBlur={focusOff}
            />
            <datalist id="pour-suggestions">
              {(suggestions ?? []).map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        {/* Description */}
        <div>
          <label style={LABEL}>Description *</label>
          <textarea
            value={form.description ?? ''} onChange={e => set('description', e.target.value)}
            placeholder="Remarque, observation, action à mener…"
            required rows={3}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 2, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none', boxSizing: 'border-box', color: '#1F1B17', resize: 'vertical', minHeight: 72 }}
            onFocus={focusOn} onBlur={focusOff}
          />
        </div>

        {/* Statut + Échéance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
          <div>
            <label style={LABEL}>Statut</label>
            <input
              value={form.statut ?? ''} onChange={e => set('statut', e.target.value)}
              list="statut-suggestions" placeholder="En cours, À faire…"
              style={INPUT} onFocus={focusOn} onBlur={focusOff}
            />
            <datalist id="statut-suggestions">
              {STATUT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label style={LABEL}>Pour le</label>
            <input type="date" value={form.date_echeance ?? ''} onChange={e => set('date_echeance', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>

        {/* Attribution — masquée si section type interlocuteurs */}
        {sectionType !== 'interlocuteurs' && (
          <div>
            <label style={LABEL}>Attribution (optionnel)</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: (form.attribution === 'lot' || form.attribution === 'interlocuteur') ? 8 : 0 }}>
              {ATTR_OPTS.map(opt => {
                const active = form.attribution === opt.id
                return (
                  <button key={opt.id} type="button" onClick={() => setAttribution(opt.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
                      border: `0.5px solid ${active ? opt.border : 'rgba(0,0,0,0.12)'}`,
                      backgroundColor: active ? opt.bg : '#FAFAF9',
                      color: active ? opt.color : '#5E5854',
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {form.attribution === 'lot' && lots?.length > 0 && (
              <select value={form.lot_id ?? ''} onChange={e => set('lot_id', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
                <option value="">— Sélectionner un lot —</option>
                {lots.map(l => (
                  <option key={l.id} value={l.id}>{l.numero ? `Lot ${l.numero} — ` : ''}{l.nom}</option>
                ))}
              </select>
            )}

            {form.attribution === 'interlocuteur' && interlocuteurs?.length > 0 && (
              <select value={form.interlocuteur_id ?? ''} onChange={e => set('interlocuteur_id', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
                <option value="">— Sélectionner un interlocuteur —</option>
                {interlocuteurs.map(i => {
                  const meta = CATEGORIE_META[i.categorie]
                  const name = [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '—'
                  return (
                    <option key={i.id} value={i.id}>
                      [{meta?.label ?? i.categorie}] {name}{i.organisation ? ` — ${i.organisation}` : ''}
                    </option>
                  )
                })}
              </select>
            )}
          </div>
        )}

        {/* Options */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { key: 'est_nouveau',   label: '▶ Nouveau' },
            { key: 'est_important', label: 'Important (gras)' },
            { key: 'est_clos',      label: 'Clôturé (barré)' },
          ].map(opt => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={!!form[opt.key]} onChange={e => set(opt.key, e.target.checked)} style={{ cursor: 'pointer', accentColor: '#E8602C' }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
        {onDelete && (
          <button type="button" onClick={() => { if (!confirmDel) { setConfirmDel(true); return } onDelete() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 2, fontSize: 11, cursor: 'pointer',
              border: `0.5px solid ${confirmDel ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
              backgroundColor: confirmDel ? 'rgba(184,65,44,0.10)' : 'white', color: confirmDel ? '#B8412C' : '#9C9591', marginRight: 'auto' }}
          ><Trash2 size={12} />{confirmDel ? 'Confirmer' : 'Supprimer'}</button>
        )}
        <button type="button" onClick={onCancel} style={{ padding: '5px 10px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}>Annuler</button>
        <button type="submit" disabled={saving || !form.description?.trim()}
          style={{ padding: '5px 12px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer', opacity: (saving || !form.description?.trim()) ? 0.6 : 1 }}
        >{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

// ─── Badge d'attribution ──────────────────────────────────────────────────────

function AttrBadge({ rem, lots, interlocuteurs }) {
  if (rem.lot_id) {
    const lot = (lots ?? []).find(l => l.id === rem.lot_id)
    if (!lot) return null
    return (
      <span style={{ fontSize: 10, background: 'rgba(42,138,78,0.12)', color: '#2A8A4E', borderRadius: 3, padding: '1px 6px', marginLeft: 6, whiteSpace: 'nowrap' }}>
        {lot.numero ? `Lot ${lot.numero}` : lot.nom}
      </span>
    )
  }
  if (rem.interlocuteur_id) {
    const i = (interlocuteurs ?? []).find(x => x.id === rem.interlocuteur_id)
    if (!i) return null
    const name = [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '—'
    return (
      <span style={{ fontSize: 10, background: 'rgba(232,96,44,0.10)', color: '#993C1D', borderRadius: 3, padding: '1px 6px', marginLeft: 6, whiteSpace: 'nowrap' }}>
        {name}
      </span>
    )
  }
  return null
}

// ─── Affichage d'une remarque ──────────────────────────────────────────────────

function RemarqueRow({ rem, idx, total, crDate, suggestions, lots, interlocuteurs, sectionType, onEdit, onDelete, onReorder, hidden }) {
  const [editOpen, setEditOpen] = useState(false)
  const fmtD = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

  let descStyle = { fontSize: 13, color: '#1F1B17', lineHeight: 1.5 }
  if (rem.est_clos) descStyle = { ...descStyle, textDecoration: 'line-through', color: '#9CA3AF' }
  if (rem.est_important) descStyle = { ...descStyle, fontWeight: 500, color: '#E8602C' }

  if (editOpen) return (
    <RemarqueForm
      initial={{ ...rem, attribution: getAttrMode(rem) }}
      crDate={crDate}
      suggestions={suggestions}
      lots={lots}
      interlocuteurs={interlocuteurs}
      sectionType={sectionType}
      onSave={async (data) => { await onEdit(rem.id, data); setEditOpen(false) }}
      onCancel={() => setEditOpen(false)}
      onDelete={async () => { await onDelete(rem.id); setEditOpen(false) }}
    />
  )

  return (
    <div style={{ display: hidden ? 'none' : 'flex', gap: 8, padding: '8px 10px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.06)', marginBottom: 4 }}>
      <div style={{ flexShrink: 0, width: 100, paddingTop: 2 }}>
        <p style={{ fontSize: 11, color: '#5E5854' }}>
          {rem.est_nouveau && <span style={{ color: '#E8602C', marginRight: 2 }}>▶</span>}
          {fmtD(rem.date_note) ?? '—'}
        </p>
        {rem.pour && <p style={{ fontSize: 10, color: '#E8602C', fontWeight: 500, marginTop: 2 }}>{rem.pour}</p>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
          <p style={{ ...descStyle, margin: 0 }}>{rem.description}</p>
          <AttrBadge rem={rem} lots={lots} interlocuteurs={interlocuteurs} />
        </div>
        {rem.date_echeance && (
          <p style={{ fontSize: 11, color: '#5E5854', marginTop: 3 }}>Pour le {fmtD(rem.date_echeance)}</p>
        )}
      </div>

      {rem.statut && (
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <span style={{ fontSize: 10, color: '#5E5854', backgroundColor: '#FAF7F2', borderRadius: 3, padding: '2px 6px' }}>{rem.statut}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'flex-start' }}>
        <button onClick={() => onReorder(rem.id, 'up')} disabled={idx === 0} style={{ padding: 3, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={12} /></button>
        <button onClick={() => onReorder(rem.id, 'down')} disabled={idx === total - 1} style={{ padding: 3, background: 'none', border: 'none', cursor: idx === total - 1 ? 'default' : 'pointer', color: idx === total - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={12} /></button>
        <button onClick={() => setEditOpen(true)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={12} /></button>
      </div>
    </div>
  )
}

// ─── Sous-section ──────────────────────────────────────────────────────────────

function SousSectionBlock({ ss, sectionId, ssIdx, ssTotal, crDate, suggestions, lots, interlocuteurs, sectionType, ops, filterFn }) {
  const [collapsed, setCollapsed] = useState(false)
  const [addRem, setAddRem] = useState(false)
  const [editSs, setEditSs] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [ssCode, setSsCode] = useState(ss.code)
  const [ssTitre, setSsTitre] = useState(ss.titre)

  return (
    <div style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 6 }}>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9C9591', flexShrink: 0 }}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        {editSs ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <input value={ssCode} onChange={e => setSsCode(e.target.value)} style={{ ...INPUT, width: 70, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
            <input value={ssTitre} onChange={e => setSsTitre(e.target.value)} style={{ ...INPUT, flex: 1, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
            <button type="button" onClick={async () => {
              await ops.updateSousSection(ss.id, { code: ssCode, titre: ssTitre })
              setEditSs(false)
            }} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
            <button type="button" onClick={() => setEditSs(false)} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', flex: 1 }}>
            <span style={{ color: '#5E5854' }}>{ss.code}</span> — {ss.titre}
          </span>
        )}

        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button onClick={() => ops.reorderSousSection(sectionId, ss.id, 'up')} disabled={ssIdx === 0} style={{ padding: 3, background: 'none', border: 'none', cursor: ssIdx === 0 ? 'default' : 'pointer', color: ssIdx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={12} /></button>
          <button onClick={() => ops.reorderSousSection(sectionId, ss.id, 'down')} disabled={ssIdx === ssTotal - 1} style={{ padding: 3, background: 'none', border: 'none', cursor: ssIdx === ssTotal - 1 ? 'default' : 'pointer', color: ssIdx === ssTotal - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={12} /></button>
          <button onClick={() => { setSsCode(ss.code); setSsTitre(ss.titre); setEditSs(!editSs) }} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={12} /></button>
          <button onClick={async () => { if (!confirmDel) { setConfirmDel(true); return } await ops.deleteSousSection(ss.id) }}
            style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: confirmDel ? '#B8412C' : '#9C9591' }}>
            <Trash2 size={12} />
          </button>
          <button onClick={() => setAddRem(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 3, fontSize: 11, border: '0.5px solid #2A8A4E', backgroundColor: 'rgba(42,138,78,0.12)', color: '#2A8A4E', cursor: 'pointer', marginLeft: 4 }}>
            <Plus size={10} /> Remarque
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ paddingLeft: 4 }}>
          {addRem && (
            <RemarqueForm
              crDate={crDate}
              suggestions={suggestions}
              lots={lots}
              interlocuteurs={interlocuteurs}
              sectionType={sectionType}
              onSave={async (data) => { await ops.addRemarque(ss.id, data); setAddRem(false) }}
              onCancel={() => setAddRem(false)}
            />
          )}
          {ss.remarques.map((rem, i) => (
            <RemarqueRow
              key={rem.id}
              rem={rem}
              idx={i}
              total={ss.remarques.length}
              crDate={crDate}
              suggestions={suggestions}
              lots={lots}
              interlocuteurs={interlocuteurs}
              sectionType={sectionType}
              onEdit={ops.updateRemarque}
              onDelete={ops.deleteRemarque}
              onReorder={(id, dir) => ops.reorderRemarque(ss.id, id, dir)}
              hidden={!filterFn(rem)}
            />
          ))}
          {ss.remarques.length === 0 && !addRem && (
            <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', padding: '4px 0 4px 4px' }}>Aucune remarque</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

function SectionBlock({ section, sIdx, sTotal, crDate, suggestions, lots, interlocuteurs, ops, filterFn, onDragStart, onDragOver, onDrop, onDragEnd, isDragging }) {
  const [open, setOpen] = useState(true)
  const [addSs, setAddSs] = useState(false)
  const [newSsCode, setNewSsCode] = useState('')
  const [newSsTitre, setNewSsTitre] = useState('')
  const [editTitle, setEditTitle] = useState(false)
  const [editRomain, setEditRomain] = useState(section.numero_romain)
  const [editTitre, setEditTitre] = useState(section.titre)
  const [confirmDel, setConfirmDel] = useState(false)

  const sectionType = section.type_section ?? 'general'

  const toggleType = async () => {
    const next = sectionType === 'interlocuteurs' ? 'general' : 'interlocuteurs'
    await ops.updateSection(section.id, { type_section: next })
  }

  return (
    <div
      style={{ marginBottom: 12, backgroundColor: 'white', borderRadius: 0, border: `0.5px solid ${isDragging ? '#E8602C' : 'rgba(0,0,0,0.08)'}`, overflow: 'hidden', opacity: isDragging ? 0.55 : 1, transition: 'opacity 0.15s, border-color 0.15s' }}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDrop={e => { e.preventDefault(); onDrop() }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', backgroundColor: '#FFF8F5', borderBottom: open ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
        {/* Grip handle */}
        <div
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
          onDragEnd={onDragEnd}
          style={{ cursor: 'grab', padding: '0 2px', color: '#C9C4C0', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          title="Glisser pour réordonner"
        >
          <GripVertical size={14} />
        </div>

        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#E8602C', flexShrink: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#E8602C', backgroundColor: 'rgba(232,96,44,0.10)', borderRadius: 3, padding: '2px 8px', flexShrink: 0 }}>
          {section.numero_romain}
        </span>
        {editTitle ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <input value={editTitre} onChange={e => setEditTitre(e.target.value)} style={{ ...INPUT, flex: 1, height: 30, fontSize: 12, fontWeight: 500 }} onFocus={focusOn} onBlur={focusOff} />
            <input value={editRomain} onChange={e => setEditRomain(e.target.value)} style={{ ...INPUT, width: 60, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
            <button type="button" onClick={async () => {
              await ops.updateSection(section.id, { titre: editTitre, numero_romain: editRomain })
              setEditTitle(false)
            }} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
            <button onClick={() => setEditTitle(false)} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', flex: 1, textTransform: 'uppercase' }}>{section.titre}</span>
        )}

        {/* Type de section toggle */}
        <button
          onClick={toggleType}
          title={sectionType === 'interlocuteurs' ? 'Section interlocuteurs — cliquer pour passer en général' : 'Section générale — cliquer pour passer en interlocuteurs'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 3, fontSize: 10, border: 'none', cursor: 'pointer',
            backgroundColor: sectionType === 'interlocuteurs' ? 'rgba(27,58,92,0.10)' : 'transparent',
            color: sectionType === 'interlocuteurs' ? '#1B3A5C' : '#C9C4C0',
            flexShrink: 0,
          }}
        >
          {sectionType === 'interlocuteurs'
            ? <><ToggleRight size={13} /> Interlocuteurs</>
            : <><ToggleLeft size={13} /> Général</>
          }
        </button>

        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={() => { setEditRomain(section.numero_romain); setEditTitre(section.titre); setEditTitle(!editTitle) }} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={13} /></button>
          <button onClick={async () => { if (!confirmDel) { setConfirmDel(true); return } await ops.deleteSection(section.id) }}
            style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: confirmDel ? '#B8412C' : '#9C9591' }}><Trash2 size={13} /></button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '12px 16px' }}>
          {section.sousSections.map((ss, si) => (
            <SousSectionBlock
              key={ss.id}
              ss={ss}
              sectionId={section.id}
              ssIdx={si}
              ssTotal={section.sousSections.length}
              crDate={crDate}
              suggestions={suggestions}
              lots={lots}
              interlocuteurs={interlocuteurs}
              sectionType={sectionType}
              ops={ops}
              filterFn={filterFn}
            />
          ))}

          {addSs ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', backgroundColor: '#FAFAF9', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <input value={newSsCode} onChange={e => setNewSsCode(e.target.value)} placeholder="1-1" style={{ ...INPUT, width: 70, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
                <input value={newSsTitre} onChange={e => setNewSsTitre(e.target.value)} placeholder="Titre de la sous-section" style={{ ...INPUT, flex: 1, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
                <button type="button" onClick={async () => {
                  if (!newSsTitre.trim()) return
                  await ops.addSousSection(section.id, { code: newSsCode || String(section.sousSections.length + 1), titre: newSsTitre })
                  setNewSsCode('')
                  setNewSsTitre('')
                  setAddSs(false)
                }} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
                <button type="button" onClick={() => setAddSs(false)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><X size={14} /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddSs(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '5px 10px', borderRadius: 2, fontSize: 11, border: '0.5px dashed rgba(0,0,0,0.2)', backgroundColor: 'transparent', color: '#5E5854', cursor: 'pointer' }}>
              <Plus size={11} /> Sous-section
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Barre de filtre ──────────────────────────────────────────────────────────

function FilterBar({ filter, setFilter, lots, interlocuteurs }) {
  const hasLots = lots?.length > 0
  const hasInterlos = interlocuteurs?.length > 0

  const pill = (type, label, active) => (
    <button
      key={type}
      onClick={() => setFilter({ type, lotId: '', interloId: '' })}
      style={{
        padding: '4px 12px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
        border: `0.5px solid ${active ? '#E8602C' : 'rgba(0,0,0,0.12)'}`,
        backgroundColor: active ? 'rgba(232,96,44,0.10)' : 'white',
        color: active ? '#E8602C' : '#5E5854',
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </button>
  )

  const SELECT = {
    height: 28, padding: '0 8px', borderRadius: 2, fontSize: 12,
    border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white',
    outline: 'none', color: '#1F1B17', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {pill('all', 'Toutes', filter.type === 'all')}
      {pill('general', 'Générales', filter.type === 'general')}

      {hasLots && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {pill('lot', 'Par lot', filter.type === 'lot')}
          {filter.type === 'lot' && (
            <select value={filter.lotId} onChange={e => setFilter(f => ({ ...f, lotId: e.target.value }))} style={SELECT}>
              <option value="">Tous</option>
              {lots.map(l => (
                <option key={l.id} value={l.id}>{l.numero ? `Lot ${l.numero}` : l.nom}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {hasInterlos && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {pill('interlocuteur', 'Par interlocuteur', filter.type === 'interlocuteur')}
          {filter.type === 'interlocuteur' && (
            <select value={filter.interloId} onChange={e => setFilter(f => ({ ...f, interloId: e.target.value }))} style={SELECT}>
              <option value="">Tous</option>
              {interlocuteurs.map(i => (
                <option key={i.id} value={i.id}>
                  {[i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal nouvelle remarque globale ──────────────────────────────────────────

function NewRemarqueModal({ sections, crDate, suggestions, lots, interlocuteurs, ops, onClose }) {
  const [secId, setSecId] = useState(sections[0]?.id ?? '')
  const sec = sections.find(s => s.id === secId)
  const sousSecs = sec?.sousSections ?? []
  const [ssId, setSsId] = useState(sousSecs[0]?.id ?? '')

  const handleSecChange = (id) => {
    setSecId(id)
    const found = sections.find(s => s.id === id)
    setSsId(found?.sousSections[0]?.id ?? '')
  }

  if (sections.length === 0) return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 0, padding: '28px 32px', maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 13, color: '#5E5854', marginBottom: 16 }}>Aucune section disponible. Ajoutez d'abord une section avant d'ajouter une remarque.</p>
        <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}>Fermer</button>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '40px 20px' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 0, padding: '24px 28px', width: '100%', maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>Nouvelle remarque</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={LABEL}>Section</label>
            <select value={secId} onChange={e => handleSecChange(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.numero_romain} — {s.titre}</option>
              ))}
            </select>
          </div>
          {sousSecs.length > 0 && (
            <div style={{ flex: 1 }}>
              <label style={LABEL}>Sous-section</label>
              <select value={ssId} onChange={e => setSsId(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
                {sousSecs.map(ss => (
                  <option key={ss.id} value={ss.id}>{ss.code} — {ss.titre}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {ssId ? (
          <RemarqueForm
            crDate={crDate}
            suggestions={suggestions}
            lots={lots}
            interlocuteurs={interlocuteurs}
            sectionType={sec?.type_section ?? 'general'}
            onSave={async (data) => { await ops.addRemarque(ssId, data); onClose() }}
            onCancel={onClose}
          />
        ) : (
          <p style={{ fontSize: 13, color: '#9C9591', fontStyle: 'italic' }}>
            {sec && sec.sousSections.length === 0
              ? 'Cette section n\'a pas encore de sous-section. Ajoutez-en une dans l\'éditeur.'
              : 'Sélectionnez une section et une sous-section.'
            }
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function CrSectionEditor({ sections, crDate, interlocuteurs, lotEntreprises, ops }) {
  const [addSec, setAddSec] = useState(false)
  const [newSec, setNewSec] = useState({ numero_romain: '', titre: '' })
  const [filter, setFilter] = useState({ type: 'all', lotId: '', interloId: '' })
  const [globalAddOpen, setGlobalAddOpen] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dropBeforeId, setDropBeforeId] = useState(null)

  const lots = (lotEntreprises ?? []).map(le => le.lots).filter(Boolean)

  const suggestions = [
    ...(interlocuteurs ?? []).map(i => {
      const parts = [i.prenom, i.nom].filter(Boolean)
      return parts.length > 0 ? parts.map(p => p[0]).join('').toUpperCase() : null
    }).filter(Boolean),
    ...(lotEntreprises ?? []).map(le =>
      le.entreprises?.raison_sociale?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
    ).filter(Boolean),
  ].filter((v, i, a) => v && a.indexOf(v) === i)

  const filterFn = (rem) => {
    if (filter.type === 'all') return true
    if (filter.type === 'general') return !rem.lot_id && !rem.interlocuteur_id
    if (filter.type === 'lot') return filter.lotId ? rem.lot_id === filter.lotId : !!rem.lot_id
    if (filter.type === 'interlocuteur') return filter.interloId ? rem.interlocuteur_id === filter.interloId : !!rem.interlocuteur_id
    return true
  }

  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) {
      setDragId(null); setDropBeforeId(null); return
    }
    const sorted = [...sections].sort((a, b) => a.ordre - b.ordre)
    const fromIdx = sorted.findIndex(s => s.id === dragId)
    const newOrder = [...sorted]
    const [moved] = newOrder.splice(fromIdx, 1)
    if (targetId === '_end') {
      newOrder.push(moved)
    } else {
      const toIdx = newOrder.findIndex(s => s.id === targetId)
      newOrder.splice(toIdx, 0, moved)
    }
    ops.reorderSectionsByIds(newOrder.map(s => s.id))
    setDragId(null)
    setDropBeforeId(null)
  }

  const openAddSec = () => {
    setNewSec({ numero_romain: nextRoman(sections), titre: '' })
    setAddSec(true)
  }

  return (
    <div>
      {/* Barre supérieure : nouvelle remarque + filtres */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#FAF7F2', paddingBottom: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <FilterBar filter={filter} setFilter={setFilter} lots={lots} interlocuteurs={interlocuteurs ?? []} />
          <button
            onClick={() => setGlobalAddOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500,
              border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <MessageSquarePlus size={13} /> Nouvelle remarque
          </button>
        </div>
      </div>

      {/* Sections */}
      {sections.map((sec) => (
        <div key={sec.id}>
          {dropBeforeId === sec.id && dragId !== sec.id && (
            <div style={{ height: 3, backgroundColor: '#E8602C', borderRadius: 2, margin: '-2px 0 6px', pointerEvents: 'none' }} />
          )}
          <SectionBlock
            section={sec}
            sIdx={sections.indexOf(sec)}
            sTotal={sections.length}
            crDate={crDate}
            suggestions={suggestions}
            lots={lots}
            interlocuteurs={interlocuteurs ?? []}
            ops={ops}
            filterFn={filterFn}
            isDragging={dragId === sec.id}
            onDragStart={() => setDragId(sec.id)}
            onDragOver={() => { if (dragId && dragId !== sec.id) setDropBeforeId(sec.id) }}
            onDrop={() => handleDrop(sec.id)}
            onDragEnd={() => { setDragId(null); setDropBeforeId(null) }}
          />
        </div>
      ))}

      {/* Zone de drop en fin de liste */}
      <div
        onDragOver={e => { e.preventDefault(); if (dragId) setDropBeforeId('_end') }}
        onDrop={e => { e.preventDefault(); handleDrop('_end') }}
        style={{ minHeight: 16 }}
      >
        {dropBeforeId === '_end' && (
          <div style={{ height: 3, backgroundColor: '#E8602C', borderRadius: 2, marginBottom: 6, pointerEvents: 'none' }} />
        )}
      </div>

      {/* Ajouter une section */}
      {addSec ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 8 }}>
          <input
            value={newSec.numero_romain}
            onChange={e => setNewSec(s => ({ ...s, numero_romain: e.target.value }))}
            placeholder="N° romain"
            style={{ ...INPUT, width: 80, height: 32, fontSize: 12 }}
            onFocus={focusOn} onBlur={focusOff}
          />
          <input
            value={newSec.titre}
            onChange={e => setNewSec(s => ({ ...s, titre: e.target.value }))}
            placeholder="Titre de la section"
            style={{ ...INPUT, flex: 1, height: 32, fontSize: 12 }}
            onFocus={focusOn} onBlur={focusOff}
            autoFocus
            onKeyDown={async e => {
              if (e.key === 'Enter' && newSec.titre.trim()) {
                await ops.addSection({ numero_romain: newSec.numero_romain, titre: newSec.titre, type_section: 'general' })
                setAddSec(false)
              }
            }}
          />
          <button type="button" onClick={async () => {
            if (!newSec.numero_romain.trim() || !newSec.titre.trim()) return
            await ops.addSection({ numero_romain: newSec.numero_romain, titre: newSec.titre, type_section: 'general' })
            setAddSec(false)
          }} style={{ padding: '4px 12px', borderRadius: 2, fontSize: 12, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
          <button type="button" onClick={() => setAddSec(false)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><X size={14} /></button>
        </div>
      ) : (
        <button
          onClick={openAddSec}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 2, fontSize: 12, border: '0.5px dashed rgba(0,0,0,0.2)', backgroundColor: 'transparent', color: '#5E5854', cursor: 'pointer' }}
        >
          <Plus size={13} /> Ajouter une section
        </button>
      )}

      {/* Modal nouvelle remarque globale */}
      {globalAddOpen && (
        <NewRemarqueModal
          sections={sections}
          crDate={crDate}
          suggestions={suggestions}
          lots={lots}
          interlocuteurs={interlocuteurs ?? []}
          ops={ops}
          onClose={() => setGlobalAddOpen(false)}
        />
      )}
    </div>
  )
}
