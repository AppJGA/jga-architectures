import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, ChevronRight, X } from 'lucide-react'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'

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

function RemarqueForm({ initial, crDate, suggestions, lots, interlocuteurs, onSave, onCancel, onDelete }) {
  const today = crDate ?? new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(initial ?? {
    date_note: today, pour: '', description: '',
    statut: 'En cours', date_echeance: '',
    est_important: false, est_clos: false, est_nouveau: false,
    attribution: 'general', lot_id: '', interlocuteur_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Detect attribution from initial values
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
        date_note:       form.date_note || null,
        pour:            form.pour || null,
        description:     form.description,
        statut:          form.statut || null,
        date_echeance:   form.date_echeance || null,
        est_important:   !!form.est_important,
        est_clos:        !!form.est_clos,
        est_nouveau:     !!form.est_nouveau,
        lot_id:          form.attribution === 'lot'           ? (form.lot_id || null)           : null,
        interlocuteur_id: form.attribution === 'interlocuteur' ? (form.interlocuteur_id || null) : null,
      })
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#FAFAF9', borderRadius: 2, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

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

        {/* Attribution */}
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
            <select
              value={form.lot_id ?? ''} onChange={e => set('lot_id', e.target.value)}
              style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}
            >
              <option value="">— Sélectionner un lot —</option>
              {lots.map(l => (
                <option key={l.id} value={l.id}>
                  {l.numero ? `Lot ${l.numero} — ` : ''}{l.nom}
                </option>
              ))}
            </select>
          )}

          {form.attribution === 'interlocuteur' && interlocuteurs?.length > 0 && (
            <select
              value={form.interlocuteur_id ?? ''} onChange={e => set('interlocuteur_id', e.target.value)}
              style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}
            >
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

function RemarqueRow({ rem, idx, total, crDate, suggestions, lots, interlocuteurs, onEdit, onDelete, onReorder, hidden }) {
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
      onSave={async (data) => { await onEdit(rem.id, data); setEditOpen(false) }}
      onCancel={() => setEditOpen(false)}
      onDelete={async () => { await onDelete(rem.id); setEditOpen(false) }}
    />
  )

  return (
    <div style={{ display: hidden ? 'none' : 'flex', gap: 8, padding: '8px 10px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.06)', marginBottom: 4 }}>
      {/* Date + pour */}
      <div style={{ flexShrink: 0, width: 100, paddingTop: 2 }}>
        <p style={{ fontSize: 11, color: '#5E5854' }}>
          {rem.est_nouveau && <span style={{ color: '#E8602C', marginRight: 2 }}>▶</span>}
          {fmtD(rem.date_note) ?? '—'}
        </p>
        {rem.pour && <p style={{ fontSize: 10, color: '#E8602C', fontWeight: 500, marginTop: 2 }}>{rem.pour}</p>}
      </div>

      {/* Description + badge attribution */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
          <p style={{ ...descStyle, margin: 0 }}>{rem.description}</p>
          <AttrBadge rem={rem} lots={lots} interlocuteurs={interlocuteurs} />
        </div>
        {rem.date_echeance && (
          <p style={{ fontSize: 11, color: '#5E5854', marginTop: 3 }}>Pour le {fmtD(rem.date_echeance)}</p>
        )}
      </div>

      {/* Statut */}
      {rem.statut && (
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <span style={{ fontSize: 10, color: '#5E5854', backgroundColor: '#FAF7F2', borderRadius: 3, padding: '2px 6px' }}>{rem.statut}</span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'flex-start' }}>
        <button onClick={() => onReorder(rem.id, 'up')} disabled={idx === 0} style={{ padding: 3, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={12} /></button>
        <button onClick={() => onReorder(rem.id, 'down')} disabled={idx === total - 1} style={{ padding: 3, background: 'none', border: 'none', cursor: idx === total - 1 ? 'default' : 'pointer', color: idx === total - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={12} /></button>
        <button onClick={() => setEditOpen(true)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={12} /></button>
      </div>
    </div>
  )
}

// ─── Sous-section ──────────────────────────────────────────────────────────────

function SousSectionBlock({ ss, sectionId, ssIdx, ssTotal, crDate, suggestions, lots, interlocuteurs, ops, filterFn }) {
  const [collapsed, setCollapsed] = useState(false)
  const [addRem, setAddRem] = useState(false)
  const [editSs, setEditSs] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 6 }}>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9C9591', flexShrink: 0 }}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        {editSs ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <input defaultValue={ss.code} id={`ss-code-${ss.id}`} style={{ ...INPUT, width: 70, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
            <input defaultValue={ss.titre} id={`ss-titre-${ss.id}`} style={{ ...INPUT, flex: 1, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
            <button type="button" onClick={async () => {
              await ops.updateSousSection(ss.id, {
                code: document.getElementById(`ss-code-${ss.id}`).value,
                titre: document.getElementById(`ss-titre-${ss.id}`).value,
              })
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
          <button onClick={() => setEditSs(!editSs)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={12} /></button>
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

function SectionBlock({ section, sIdx, sTotal, crDate, suggestions, lots, interlocuteurs, ops, filterFn }) {
  const [open, setOpen] = useState(true)
  const [addSs, setAddSs] = useState(false)
  const [editTitle, setEditTitle] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div style={{ marginBottom: 12, backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', backgroundColor: '#FFF8F5', borderBottom: open ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#E8602C', flexShrink: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#E8602C', backgroundColor: 'rgba(232,96,44,0.10)', borderRadius: 3, padding: '2px 8px', flexShrink: 0 }}>
          {section.numero_romain}
        </span>
        {editTitle ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <input defaultValue={section.titre} id={`sec-titre-${section.id}`} style={{ ...INPUT, flex: 1, height: 30, fontSize: 12, fontWeight: 500 }} onFocus={focusOn} onBlur={focusOff} />
            <input defaultValue={section.numero_romain} id={`sec-romain-${section.id}`} style={{ ...INPUT, width: 60, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
            <button type="button" onClick={async () => {
              await ops.updateSection(section.id, {
                titre: document.getElementById(`sec-titre-${section.id}`).value,
                numero_romain: document.getElementById(`sec-romain-${section.id}`).value,
              })
              setEditTitle(false)
            }} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
            <button onClick={() => setEditTitle(false)} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', flex: 1, textTransform: 'uppercase' }}>{section.titre}</span>
        )}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={() => ops.reorderSection(section.id, 'up')} disabled={sIdx === 0} style={{ padding: 3, background: 'none', border: 'none', cursor: sIdx === 0 ? 'default' : 'pointer', color: sIdx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={13} /></button>
          <button onClick={() => ops.reorderSection(section.id, 'down')} disabled={sIdx === sTotal - 1} style={{ padding: 3, background: 'none', border: 'none', cursor: sIdx === sTotal - 1 ? 'default' : 'pointer', color: sIdx === sTotal - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={13} /></button>
          <button onClick={() => setEditTitle(!editTitle)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={13} /></button>
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
              ops={ops}
              filterFn={filterFn}
            />
          ))}

          {addSs ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', backgroundColor: '#FAFAF9', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <input id={`new-ss-code-${section.id}`} placeholder="1-1" style={{ ...INPUT, width: 70, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
                <input id={`new-ss-titre-${section.id}`} placeholder="Titre de la sous-section" style={{ ...INPUT, flex: 1, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
                <button type="button" onClick={async () => {
                  const code = document.getElementById(`new-ss-code-${section.id}`).value
                  const titre = document.getElementById(`new-ss-titre-${section.id}`).value
                  if (!titre.trim()) return
                  await ops.addSousSection(section.id, { code: code || String(section.sousSections.length + 1), titre })
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
      {pill('all', 'Toutes', filter.type === 'all')}
      {pill('general', 'Générales', filter.type === 'general')}

      {hasLots && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {pill('lot', 'Par lot', filter.type === 'lot')}
          {filter.type === 'lot' && (
            <select
              value={filter.lotId} onChange={e => setFilter(f => ({ ...f, lotId: e.target.value }))}
              style={SELECT}
            >
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
            <select
              value={filter.interloId} onChange={e => setFilter(f => ({ ...f, interloId: e.target.value }))}
              style={SELECT}
            >
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

// ─── Export principal ─────────────────────────────────────────────────────────

export function CrSectionEditor({ sections, crDate, interlocuteurs, lotEntreprises, ops }) {
  const [addSec, setAddSec] = useState(false)
  const [filter, setFilter] = useState({ type: 'all', lotId: '', interloId: '' })

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

  return (
    <div>
      <FilterBar filter={filter} setFilter={setFilter} lots={lots} interlocuteurs={interlocuteurs ?? []} />

      {sections.map((sec, i) => (
        <SectionBlock
          key={sec.id}
          section={sec}
          sIdx={i}
          sTotal={sections.length}
          crDate={crDate}
          suggestions={suggestions}
          lots={lots}
          interlocuteurs={interlocuteurs ?? []}
          ops={ops}
          filterFn={filterFn}
        />
      ))}

      {addSec ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 8 }}>
          <input id="new-sec-romain" placeholder="N° romain" style={{ ...INPUT, width: 80, height: 32, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
          <input id="new-sec-titre" placeholder="Titre de la section" style={{ ...INPUT, flex: 1, height: 32, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
          <button type="button" onClick={async () => {
            const numero_romain = document.getElementById('new-sec-romain').value
            const titre = document.getElementById('new-sec-titre').value
            if (!numero_romain.trim() || !titre.trim()) return
            await ops.addSection({ numero_romain, titre })
            setAddSec(false)
          }} style={{ padding: '4px 12px', borderRadius: 2, fontSize: 12, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
          <button type="button" onClick={() => setAddSec(false)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><X size={14} /></button>
        </div>
      ) : (
        <button
          onClick={() => setAddSec(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 2, fontSize: 12, border: '0.5px dashed rgba(0,0,0,0.2)', backgroundColor: 'transparent', color: '#5E5854', cursor: 'pointer' }}
        >
          <Plus size={13} /> Ajouter une section
        </button>
      )}
    </div>
  )
}
