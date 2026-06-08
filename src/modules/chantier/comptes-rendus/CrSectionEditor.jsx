import { useState } from 'react'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, ChevronRight, X,
  GripVertical, MessageSquarePlus, ToggleLeft, ToggleRight, MessageSquare,
  Check, RotateCcw,
} from 'lucide-react'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'

// ─── Utilitaires ──────────────────────────────────────────────────────────────

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
function nextRoman(sections) {
  const nums = sections.map(s => ROMAN.indexOf(s.numero_romain)).filter(n => n > 0)
  const max = nums.length ? Math.max(...nums) : 0
  return ROMAN[max + 1] ?? String(max + 1)
}

const STATUT_SUGGESTIONS = ['À faire', 'Fait', 'Pour mémoire', 'À prévoir', 'En cours', 'Urgent', 'Annulé']

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

// ─── Formulaire de remarque ────────────────────────────────────────────────────
// Évolution 1: 'general' → aucune attribution, 'interlocuteurs' → sélect combiné

function RemarqueForm({ initial, crDate, suggestions, lots, interlocuteurs, sectionType, onSave, onCancel, onDelete }) {
  const today = crDate ?? new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(() => ({
    date_note: today, pour: '', description: '',
    statut: 'En cours', date_echeance: '',
    est_important: false, est_clos: false, est_nouveau: false,
    lot_id: '', interlocuteur_id: '',
    ...(initial ? {
      date_note:        initial.date_note ?? today,
      pour:             initial.pour ?? '',
      description:      initial.description ?? '',
      statut:           initial.statut ?? 'En cours',
      date_echeance:    initial.date_echeance ?? '',
      est_important:    !!initial.est_important,
      est_clos:         !!initial.est_clos,
      est_nouveau:      !!initial.est_nouveau,
      lot_id:           initial.lot_id ?? '',
      interlocuteur_id: initial.interlocuteur_id ?? '',
    } : {}),
  }))
  const [saving, setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Valeur combinée lots + interlocuteurs (sections 'interlocuteurs' uniquement)
  const destinataireVal = form.lot_id
    ? `lot:${form.lot_id}`
    : form.interlocuteur_id
    ? `interlo:${form.interlocuteur_id}`
    : ''

  const setDestinataire = (val) => {
    if (!val) {
      setForm(f => ({ ...f, lot_id: '', interlocuteur_id: '' }))
    } else if (val.startsWith('lot:')) {
      setForm(f => ({ ...f, lot_id: val.slice(4), interlocuteur_id: '' }))
    } else {
      setForm(f => ({ ...f, interlocuteur_id: val.slice(8), lot_id: '' }))
    }
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
        lot_id:           sectionType === 'general' ? null : (form.lot_id || null),
        interlocuteur_id: sectionType === 'general' ? null : (form.interlocuteur_id || null),
      })
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#FAFAF9', borderRadius: 2, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Destinataire combiné (sections interlocuteurs uniquement) */}
        {sectionType === 'interlocuteurs' && (
          <div>
            <label style={{ ...LABEL, color: '#1B3A5C' }}>Destinataire</label>
            <select
              value={destinataireVal}
              onChange={e => setDestinataire(e.target.value)}
              style={{ ...INPUT, cursor: 'pointer' }}
              onFocus={focusOn} onBlur={focusOff}
            >
              <option value="">— Aucun destinataire —</option>
              {(lots ?? []).length > 0 && (
                <optgroup label="Lots / Entreprises">
                  {lots.map(l => (
                    <option key={l.id} value={`lot:${l.id}`}>
                      {l.numero ? `Lot ${l.numero} — ` : ''}{l.nom}
                    </option>
                  ))}
                </optgroup>
              )}
              {(interlocuteurs ?? []).length > 0 && (
                <optgroup label="Interlocuteurs">
                  {interlocuteurs.map(i => {
                    const meta = CATEGORIE_META[i.categorie]
                    const name = [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '—'
                    return (
                      <option key={i.id} value={`interlo:${i.id}`}>
                        [{meta?.label ?? i.categorie}] {name}{i.organisation ? ` — ${i.organisation}` : ''}
                      </option>
                    )
                  })}
                </optgroup>
              )}
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
// Évolution 1: masqué pour les sections 'general'

function AttrBadge({ rem, lots, interlocuteurs, sectionType }) {
  if (sectionType === 'general') return null
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

// ─── Sous-remarque (fil de suivi) ─────────────────────────────────────────────
// Évolution 4

function SousRemarqueRow({ sr, onDelete, onToggleClos }) {
  const fmtD = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—'
  return (
    <div className="sous-remarque-row" style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', alignItems: 'flex-start' }}>
      {sr.est_nouveau && <span style={{ color: '#E8602C', fontSize: 10, flexShrink: 0, marginTop: 2 }}>▶</span>}
      <span style={{ color: '#9C9591', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 40, flexShrink: 0, marginTop: 1 }}>
        {fmtD(sr.date_note)}
      </span>
      {sr.pour && (
        <span style={{ color: '#E8602C', fontSize: 11, fontWeight: 500, minWidth: 28, flexShrink: 0, marginTop: 1 }}>{sr.pour}</span>
      )}
      <span style={{ flex: 1, fontSize: 12, textDecoration: sr.est_clos ? 'line-through' : 'none', color: sr.est_clos ? '#9CA3AF' : '#374151' }}>
        {sr.description}
      </span>
      <div className="sous-remarque-actions" style={{ display: 'flex', gap: 3, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
        <button onClick={() => onToggleClos(sr.id, !sr.est_clos)} title={sr.est_clos ? 'Rouvrir' : 'Clôturer'} data-compact
          style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: sr.est_clos ? '#2A8A4E' : '#9C9591' }}>
          {sr.est_clos ? <RotateCcw size={11} /> : <Check size={11} />}
        </button>
        <button onClick={() => onDelete(sr.id)} data-compact
          style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

function SousRemarqueForm({ crDate, onSave, onCancel }) {
  const today = crDate ?? new Date().toISOString().split('T')[0]
  const [date, setDate]               = useState(today)
  const [pour, setPour]               = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)

  return (
    <div style={{ marginLeft: 24, marginTop: 4, borderLeft: '2px solid #E9E2D6', paddingLeft: 12, paddingBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ ...INPUT, width: 140, height: 30, fontSize: 11 }} onFocus={focusOn} onBlur={focusOff} />
        <input value={pour} onChange={e => setPour(e.target.value)} placeholder="Pour…"
          style={{ ...INPUT, width: 70, height: 30, fontSize: 11 }} onFocus={focusOn} onBlur={focusOff} />
        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Suivi…" autoFocus rows={2}
          style={{ flex: 1, minWidth: 180, padding: '5px 8px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)', outline: 'none', boxSizing: 'border-box', color: '#1F1B17', resize: 'vertical', minHeight: 50 }}
          onFocus={focusOn} onBlur={focusOff}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '3px 10px', borderRadius: 2, fontSize: 11, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}>
          Annuler
        </button>
        <button type="button"
          onClick={async () => {
            if (!description.trim()) return
            setSaving(true)
            try {
              await onSave({ date_note: date || null, pour: pour || null, description: description.trim(), est_nouveau: true, est_clos: false, est_important: false })
            } catch (err) { console.error(err) }
            setSaving(false)
          }}
          disabled={saving || !description.trim()}
          style={{ padding: '3px 12px', borderRadius: 2, fontSize: 11, fontWeight: 500, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer', opacity: (saving || !description.trim()) ? 0.6 : 1 }}
        >{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  )
}

// ─── Affichage d'une remarque ──────────────────────────────────────────────────
// Évolution 4: sous_remarques + bouton "+ Suivi"

function RemarqueRow({ rem, idx, total, crDate, suggestions, lots, interlocuteurs, sectionType, onEdit, onDelete, onReorder, onAddSousRemarque, noReorder, hidden }) {
  const [editOpen, setEditOpen]       = useState(false)
  const [addingSuivi, setAddingSuivi] = useState(false)
  const fmtD = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

  let descStyle = { fontSize: 13, color: '#1F1B17', lineHeight: 1.5 }
  if (rem.est_clos) descStyle = { ...descStyle, textDecoration: 'line-through', color: '#9CA3AF' }
  if (rem.est_important) descStyle = { ...descStyle, fontWeight: 500, color: '#E8602C' }

  const sousSousRems = rem.sous_remarques ?? []

  if (editOpen) return (
    <div style={{ marginBottom: 4 }}>
      <RemarqueForm
        initial={{ ...rem }}
        crDate={crDate}
        suggestions={suggestions}
        lots={lots}
        interlocuteurs={interlocuteurs}
        sectionType={sectionType}
        onSave={async (data) => { await onEdit(rem.id, data); setEditOpen(false) }}
        onCancel={() => setEditOpen(false)}
        onDelete={async () => { await onDelete(rem.id); setEditOpen(false) }}
      />
      {sousSousRems.length > 0 && (
        <div style={{ marginLeft: 24, borderLeft: '2px solid #E9E2D6', paddingLeft: 12, marginBottom: 4 }}>
          {sousSousRems.map(sr => (
            <SousRemarqueRow key={sr.id} sr={sr}
              onDelete={onDelete}
              onToggleClos={async (id, clos) => await onEdit(id, { est_clos: clos })}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: hidden ? 'none' : 'block', marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 10px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.06)' }}>
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
            <AttrBadge rem={rem} lots={lots} interlocuteurs={interlocuteurs} sectionType={sectionType} />
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
          {!noReorder && (
            <>
              <button onClick={() => onReorder(rem.id, 'up')} disabled={idx === 0} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={12} /></button>
              <button onClick={() => onReorder(rem.id, 'down')} disabled={idx === total - 1} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: idx === total - 1 ? 'default' : 'pointer', color: idx === total - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={12} /></button>
            </>
          )}
          <button onClick={() => setEditOpen(true)} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={12} /></button>
          {onAddSousRemarque && (
            <button onClick={() => setAddingSuivi(a => !a)} data-compact
              style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: addingSuivi ? '#E8602C' : '#9C9591' }}
              title="Ajouter un suivi"
            >
              <MessageSquare size={11} />+ Suivi
            </button>
          )}
        </div>
      </div>

      {/* Sous-remarques existantes */}
      {sousSousRems.length > 0 && (
        <div style={{ marginLeft: 24, borderLeft: '2px solid #E9E2D6', paddingLeft: 12, marginTop: 2 }}>
          {sousSousRems.map(sr => (
            <SousRemarqueRow key={sr.id} sr={sr}
              onDelete={onDelete}
              onToggleClos={async (id, clos) => await onEdit(id, { est_clos: clos })}
            />
          ))}
        </div>
      )}

      {/* Formulaire d'ajout de suivi */}
      {addingSuivi && (
        <SousRemarqueForm
          crDate={crDate}
          onSave={async (data) => {
            await onAddSousRemarque(rem.id, data)
            setAddingSuivi(false)
          }}
          onCancel={() => setAddingSuivi(false)}
        />
      )}
    </div>
  )
}

// ─── Sous-section ──────────────────────────────────────────────────────────────

function SousSectionBlock({ ss, sectionId, ssIdx, ssTotal, crDate, suggestions, lots, interlocuteurs, sectionType, ops, filterFn }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [addRem, setAddRem]         = useState(false)
  const [editSs, setEditSs]         = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [ssCode, setSsCode]         = useState(ss.code)
  const [ssTitre, setSsTitre]       = useState(ss.titre)

  return (
    <div style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 6 }}>
        <button onClick={() => setCollapsed(c => !c)} data-compact style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9C9591', flexShrink: 0 }}>
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
          <button onClick={() => ops.reorderSousSection(sectionId, ss.id, 'up')} disabled={ssIdx === 0} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: ssIdx === 0 ? 'default' : 'pointer', color: ssIdx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={12} /></button>
          <button onClick={() => ops.reorderSousSection(sectionId, ss.id, 'down')} disabled={ssIdx === ssTotal - 1} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: ssIdx === ssTotal - 1 ? 'default' : 'pointer', color: ssIdx === ssTotal - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={12} /></button>
          <button onClick={() => { setSsCode(ss.code); setSsTitre(ss.titre); setEditSs(!editSs) }} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={12} /></button>
          <button onClick={async () => { if (!confirmDel) { setConfirmDel(true); return } await ops.deleteSousSection(ss.id) }} data-compact
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
              onSave={async (data) => {
                // Inclure section_id pour faciliter la navigation
                await ops.addRemarque(ss.id, { ...data, section_id: sectionId })
                setAddRem(false)
              }}
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
              onAddSousRemarque={ops.addSousRemarque}
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

// ─── Vue groupée par destinataire (sections interlocuteurs) ───────────────────
// Évolution 3: tri par interlocuteur puis par date

function InterlocuteursGroupedView({ section, crDate, suggestions, lots, interlocuteurs, ops, filterFn }) {
  const allRems = [
    ...(section.directRemarques ?? []),
    ...(section.sousSections ?? []).flatMap(ss => ss.remarques ?? []),
  ]
  const visible = allRems.filter(filterFn)

  const sortByDate = (arr) =>
    [...arr].sort((a, b) => {
      const d1 = a.date_note ? new Date(a.date_note) : new Date(0)
      const d2 = b.date_note ? new Date(b.date_note) : new Date(0)
      if (d1 - d2 !== 0) return d1 - d2
      return new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
    })

  const sansDestinataire = sortByDate(visible.filter(r => !r.lot_id && !r.interlocuteur_id))

  const sortedLots = [...(lots ?? [])].sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999))
  const lotGroups = sortedLots
    .map(l => ({
      key: `lot:${l.id}`,
      label: l.numero ? `LOT ${l.numero} — ${l.nom.toUpperCase()}` : l.nom.toUpperCase(),
      remarques: sortByDate(visible.filter(r => r.lot_id === l.id)),
    }))
    .filter(g => g.remarques.length > 0)

  const interloGroups = (interlocuteurs ?? [])
    .map(i => {
      const meta = CATEGORIE_META[i.categorie]
      const name = [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '—'
      return {
        key: `interlo:${i.id}`,
        label: `${name.toUpperCase()}${i.organisation ? ` — ${i.organisation.toUpperCase()}` : ''} (${(meta?.label ?? i.categorie).toUpperCase()})`,
        remarques: sortByDate(visible.filter(r => r.interlocuteur_id === i.id)),
      }
    })
    .filter(g => g.remarques.length > 0)

  const groups = [
    ...(sansDestinataire.length > 0 ? [{ key: 'none', label: 'SANS DESTINATAIRE', remarques: sansDestinataire }] : []),
    ...lotGroups,
    ...interloGroups,
  ]

  if (groups.length === 0) {
    return <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', padding: '4px 0 4px 4px' }}>Aucune remarque</p>
  }

  return (
    <div>
      {groups.map(g => (
        <div key={g.key} style={{ marginBottom: 14 }}>
          <div style={{ backgroundColor: '#E9E2D6', padding: '4px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5E5854', marginBottom: 6 }}>
            {g.label}
          </div>
          {g.remarques.map((rem, i) => (
            <RemarqueRow
              key={rem.id}
              rem={rem}
              idx={i}
              total={g.remarques.length}
              crDate={crDate}
              suggestions={suggestions}
              lots={lots}
              interlocuteurs={interlocuteurs ?? []}
              sectionType="interlocuteurs"
              onEdit={ops.updateRemarque}
              onDelete={ops.deleteRemarque}
              onReorder={() => {}}
              noReorder
              onAddSousRemarque={ops.addSousRemarque}
              hidden={false}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────
// Évolution 2: remarques directes + bouton dédié
// Évolution 3: vue groupée pour sections 'interlocuteurs'

function SectionBlock({ section, sIdx, sTotal, crDate, suggestions, lots, interlocuteurs, ops, filterFn, onDragStart, onDragOver, onDrop, onDragEnd, isDragging }) {
  const [open, setOpen]               = useState(true)
  const [addSs, setAddSs]             = useState(false)
  const [addDirectRem, setAddDirectRem] = useState(false)
  const [newSsCode, setNewSsCode]     = useState('')
  const [newSsTitre, setNewSsTitre]   = useState('')
  const [editTitle, setEditTitle]     = useState(false)
  const [editRomain, setEditRomain]   = useState(section.numero_romain)
  const [editTitre, setEditTitre]     = useState(section.titre)
  const [confirmDel, setConfirmDel]   = useState(false)

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
      {/* En-tête de section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', backgroundColor: '#FFF8F5', borderBottom: open ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
        <div
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
          onDragEnd={onDragEnd}
          style={{ cursor: 'grab', padding: '0 2px', color: '#C9C4C0', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          title="Glisser pour réordonner"
        >
          <GripVertical size={14} />
        </div>

        <button onClick={() => setOpen(o => !o)} data-compact style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#E8602C', flexShrink: 0 }}>
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

        {/* Toggle type de section */}
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
          <button onClick={() => { setEditRomain(section.numero_romain); setEditTitre(section.titre); setEditTitle(!editTitle) }} data-compact style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={13} /></button>
          <button onClick={async () => { if (!confirmDel) { setConfirmDel(true); return } await ops.deleteSection(section.id) }} data-compact
            style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: confirmDel ? '#B8412C' : '#9C9591' }}><Trash2 size={13} /></button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '12px 16px' }}>
          {sectionType === 'interlocuteurs' ? (
            // Évolution 3: vue groupée par destinataire
            <InterlocuteursGroupedView
              section={section}
              crDate={crDate}
              suggestions={suggestions}
              lots={lots}
              interlocuteurs={interlocuteurs}
              ops={ops}
              filterFn={filterFn}
            />
          ) : (
            // Vue normale avec sous-sections + remarques directes
            <>
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

              {/* Évolution 2: remarques directes de section */}
              {(section.directRemarques ?? []).length > 0 && (
                <div style={{ marginTop: section.sousSections.length > 0 ? 10 : 0 }}>
                  {section.sousSections.length > 0 && (
                    <p style={{ fontSize: 10, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 6, borderBottom: '0.5px solid rgba(0,0,0,0.06)', paddingBottom: 4 }}>
                      Remarques directes
                    </p>
                  )}
                  {section.directRemarques.map((rem, i) => (
                    <RemarqueRow
                      key={rem.id}
                      rem={rem}
                      idx={i}
                      total={section.directRemarques.length}
                      crDate={crDate}
                      suggestions={suggestions}
                      lots={lots}
                      interlocuteurs={interlocuteurs}
                      sectionType={sectionType}
                      onEdit={ops.updateRemarque}
                      onDelete={ops.deleteRemarque}
                      onReorder={(id, dir) => ops.reorderSectionRemarque(section.id, id, dir)}
                      onAddSousRemarque={ops.addSousRemarque}
                      hidden={!filterFn(rem)}
                    />
                  ))}
                </div>
              )}

              {/* Formulaire remarque directe */}
              {addDirectRem && (
                <RemarqueForm
                  crDate={crDate}
                  suggestions={suggestions}
                  lots={lots}
                  interlocuteurs={interlocuteurs}
                  sectionType={sectionType}
                  onSave={async (data) => { await ops.addSectionRemarque(section.id, data); setAddDirectRem(false) }}
                  onCancel={() => setAddDirectRem(false)}
                />
              )}
            </>
          )}

          {/* Ajout sous-section + remarque directe */}
          {addSs ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', backgroundColor: '#FAFAF9', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <input value={newSsCode} onChange={e => setNewSsCode(e.target.value)} placeholder="1-1" style={{ ...INPUT, width: 70, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
                <input value={newSsTitre} onChange={e => setNewSsTitre(e.target.value)} placeholder="Titre de la sous-section" style={{ ...INPUT, flex: 1, height: 30, fontSize: 12 }} onFocus={focusOn} onBlur={focusOff} />
                <button type="button" onClick={async () => {
                  if (!newSsTitre.trim()) return
                  await ops.addSousSection(section.id, { code: newSsCode || String(section.sousSections.length + 1), titre: newSsTitre })
                  setNewSsCode(''); setNewSsTitre(''); setAddSs(false)
                }} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer' }}>OK</button>
                <button type="button" onClick={() => setAddSs(false)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><X size={14} /></button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={() => { setAddSs(true); setAddDirectRem(false) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 2, fontSize: 11, border: '0.5px dashed rgba(0,0,0,0.2)', backgroundColor: 'transparent', color: '#5E5854', cursor: 'pointer' }}>
                <Plus size={11} /> Sous-section
              </button>
              {sectionType !== 'interlocuteurs' && !addDirectRem && (
                <button onClick={() => { setAddDirectRem(true); setAddSs(false) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 2, fontSize: 11, border: '0.5px dashed rgba(0,0,0,0.2)', backgroundColor: 'transparent', color: '#5E5854', cursor: 'pointer' }}>
                  <Plus size={11} /> Remarque directe
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Barre de filtre ──────────────────────────────────────────────────────────

function FilterBar({ filter, setFilter, lots, interlocuteurs }) {
  const hasLots     = lots?.length > 0
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
// Évolution 2: sous-section optionnelle ("Directement dans la section")

function NewRemarqueModal({ sections, crDate, suggestions, lots, interlocuteurs, ops, onClose }) {
  const [secId, setSecId] = useState(sections[0]?.id ?? '')
  const sec     = sections.find(s => s.id === secId)
  const sousSecs = sec?.sousSections ?? []
  const [ssId, setSsId] = useState('')  // vide = directement dans la section

  const handleSecChange = (id) => {
    setSecId(id)
    setSsId('')
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
          <button onClick={onClose} data-compact style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
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
          <div style={{ flex: 1 }}>
            <label style={LABEL}>
              Sous-section{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#C9C4C0', fontSize: 10 }}>(optionnel)</span>
            </label>
            <select value={ssId} onChange={e => setSsId(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
              <option value="">— Directement dans la section —</option>
              {sousSecs.map(ss => (
                <option key={ss.id} value={ss.id}>{ss.code} — {ss.titre}</option>
              ))}
            </select>
          </div>
        </div>

        <RemarqueForm
          crDate={crDate}
          suggestions={suggestions}
          lots={lots}
          interlocuteurs={interlocuteurs}
          sectionType={sec?.type_section ?? 'general'}
          onSave={async (data) => {
            if (ssId) {
              await ops.addRemarque(ssId, { ...data, section_id: secId })
            } else {
              await ops.addSectionRemarque(secId, data)
            }
            onClose()
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function CrSectionEditor({ sections, crDate, interlocuteurs, lotEntreprises, ops }) {
  const [addSec, setAddSec]             = useState(false)
  const [newSec, setNewSec]             = useState({ numero_romain: '', titre: '' })
  const [filter, setFilter]             = useState({ type: 'all', lotId: '', interloId: '' })
  const [globalAddOpen, setGlobalAddOpen] = useState(false)
  const [dragId, setDragId]             = useState(null)
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

      {/* Zone de drop fin de liste */}
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

      {/* Modal nouvelle remarque */}
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
