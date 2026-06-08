import { useState, useEffect } from 'react'
import { X, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Search } from 'lucide-react'
import { useAffaireInterlocuteurs, CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { supabase } from '../../../core/supabase/client'

const CATEGORIES = Object.entries(CATEGORIE_META).map(([id, m]) => ({ id, ...m }))

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

function emptyForm(defaultCat = 'moa') {
  return { categorie: defaultCat, categorie_label: '', prenom: '', nom: '', fonction: '', organisation: '', adresse: '', email: '', telephone: '' }
}

function InterloForm({ initial, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(initial ?? emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('entreprises')
        .select('id, raison_sociale, adresse, email, telephone')
        .ilike('raison_sociale', `%${search}%`)
        .limit(5)
      setSuggestions(data ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const applySuggestion = (ent) => {
    setForm(f => ({
      ...f,
      organisation: ent.raison_sociale,
      adresse: ent.adresse ?? f.adresse,
      email: ent.email ?? f.email,
      telephone: ent.telephone ?? f.telephone,
    }))
    setSearch('')
    setSuggestions([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nom?.trim() && !form.organisation?.trim()) return
    setSaving(true)
    try {
      await onSave({ ...form, categorie_label: form.categorie === 'autre' ? form.categorie_label : null })
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const needsLabel = form.categorie === 'autre'

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: '#FAFAF9', borderRadius: 2, padding: '14px 16px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Catégorie */}
        <div style={{ display: 'grid', gridTemplateColumns: needsLabel ? '1fr 1fr' : '1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Catégorie</label>
            <select value={form.categorie} onChange={e => set('categorie', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {needsLabel && (
            <div>
              <label style={LABEL}>Label personnalisé</label>
              <input value={form.categorie_label} onChange={e => set('categorie_label', e.target.value)} placeholder="Ex: AMO, Géomètre…" style={INPUT} onFocus={focusOn} onBlur={focusOff} />
            </div>
          )}
        </div>

        {/* Recherche carnet d'adresses */}
        <div style={{ position: 'relative' }}>
          <label style={LABEL}>Rechercher dans le carnet d'adresses</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9C9591' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nom de l'entreprise…"
              style={{ ...INPUT, paddingLeft: 30 }}
              onFocus={focusOn} onBlur={focusOff}
            />
          </div>
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, backgroundColor: 'white', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2, overflow: 'hidden' }}>
              {suggestions.map(s => (
                <button key={s.id} type="button" onMouseDown={() => applySuggestion(s)}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1F1B17', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(232,96,44,0.10)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {s.raison_sociale}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Identité */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Prénom</label>
            <input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Nom</label>
            <input value={form.nom} onChange={e => set('nom', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Fonction</label>
            <input value={form.fonction} onChange={e => set('fonction', e.target.value)} placeholder="Ex: Architecte, Chef de projet…" style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Organisation</label>
            <input value={form.organisation} onChange={e => set('organisation', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Téléphone</label>
            <input value={form.telephone} onChange={e => set('telephone', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Adresse</label>
            <input value={form.adresse} onChange={e => set('adresse', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
        {onDelete && (
          <button type="button" onClick={() => { if (!confirmDel) { setConfirmDel(true); return } onDelete() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 2, fontSize: 11, cursor: 'pointer',
              border: `0.5px solid ${confirmDel ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
              backgroundColor: confirmDel ? 'rgba(184,65,44,0.10)' : 'white', color: confirmDel ? '#B8412C' : '#9C9591', marginRight: 'auto' }}
          >
            <Trash2 size={12} />{confirmDel ? 'Confirmer' : 'Supprimer'}
          </button>
        )}
        <button type="button" onClick={onCancel}
          style={{ padding: '6px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}
        >Annuler</button>
        <button type="submit" disabled={saving}
          style={{ padding: '6px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

function CategorySection({ cat, items, onAdd, onEdit, onDelete, onReorder }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const meta = CATEGORIE_META[cat]

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: meta?.color ?? '#9C9591', backgroundColor: meta?.bg ?? '#FAF7F2', borderRadius: 3, padding: '3px 10px' }}>
          {meta?.label ?? cat}
        </span>
        <button onClick={() => setAddOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 3, fontSize: 11, border: `0.5px solid ${meta?.color ?? '#9C9591'}`, backgroundColor: meta?.bg ?? '#FAF7F2', color: meta?.color ?? '#9C9591', cursor: 'pointer' }}
        ><Plus size={11} /> Ajouter</button>
      </div>

      {addOpen && (
        <div style={{ marginBottom: 8 }}>
          <InterloForm
            initial={emptyForm(cat)}
            onSave={async (data) => { await onAdd(data); setAddOpen(false) }}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}

      {items.map((item, idx) => (
        <div key={item.id}>
          {editId === item.id ? (
            <div style={{ marginBottom: 6 }}>
              <InterloForm
                initial={item}
                onSave={async (data) => { await onEdit(item.id, data); setEditId(null) }}
                onCancel={() => setEditId(null)}
                onDelete={async () => { await onDelete(item.id); setEditId(null) }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>
                  {[item.prenom, item.nom].filter(Boolean).join(' ') || item.organisation || '—'}
                </p>
                {item.fonction && <p style={{ fontSize: 11, color: '#5E5854' }}>{item.fonction}{item.organisation ? ` · ${item.organisation}` : ''}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  {item.email && <a href={`mailto:${item.email}`} style={{ fontSize: 11, color: '#1B3A5C' }}>{item.email}</a>}
                  {item.telephone && <span style={{ fontSize: 11, color: '#5E5854' }}>{item.telephone}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => onReorder(item.id, 'up')} disabled={idx === 0} style={{ padding: 4, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={13} /></button>
                <button onClick={() => onReorder(item.id, 'down')} disabled={idx === items.length - 1} style={{ padding: 4, background: 'none', border: 'none', cursor: idx === items.length - 1 ? 'default' : 'pointer', color: idx === items.length - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={13} /></button>
                <button onClick={() => setEditId(item.id)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={13} /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {items.length === 0 && !addOpen && (
        <p style={{ fontSize: 12, color: '#9C9591', fontStyle: 'italic', padding: '4px 12px' }}>Aucun interlocuteur dans cette catégorie</p>
      )}
    </div>
  )
}

export function InterlocuteursModal({ affaireId, onClose }) {
  const { interlocuteurs, addInterlocuteur, updateInterlocuteur, deleteInterlocuteur, reorderInterlocuteur } = useAffaireInterlocuteurs(affaireId)

  const byCategory = CATEGORIES.reduce((acc, c) => {
    acc[c.id] = interlocuteurs.filter(i => i.categorie === c.id).sort((a, b) => a.ordre - b.ordre)
    return acc
  }, {})

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '40px 20px' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 0, padding: '28px 32px', width: '100%', maxWidth: 700, minHeight: 200 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>Interlocuteurs du projet</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        {CATEGORIES.map(cat => (
          <CategorySection
            key={cat.id}
            cat={cat.id}
            items={byCategory[cat.id] ?? []}
            onAdd={addInterlocuteur}
            onEdit={updateInterlocuteur}
            onDelete={deleteInterlocuteur}
            onReorder={reorderInterlocuteur}
          />
        ))}
      </div>
    </div>
  )
}
