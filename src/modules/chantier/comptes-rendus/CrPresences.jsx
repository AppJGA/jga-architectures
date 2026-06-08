import { useState, useEffect } from 'react'
import { supabase } from '../../../core/supabase/client'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'

const PRESENCE_OPTIONS = [
  { id: 'p', label: 'P', title: 'Présent',  bg: '#2A8A4E', color: 'white' },
  { id: 'r', label: 'R', title: 'Retard',   bg: '#E8602C', color: 'white' },
  { id: 'a', label: 'A', title: 'Absent',   bg: '#B8412C', color: 'white' },
  { id: 'e', label: 'E', title: 'Excusé',   bg: '#5E5854', color: 'white' },
]

const LEGEND_ITEMS = [
  { code: 'P', label: 'Présent',  bg: 'rgba(42,138,78,0.12)', color: '#2A8A4E' },
  { code: 'R', label: 'Retard',   bg: '#FEF3C7', color: '#92400E' },
  { code: 'A', label: 'Absent',   bg: 'rgba(184,65,44,0.10)', color: '#B8412C' },
  { code: 'E', label: 'Excusé',   bg: '#F1EFE8', color: '#5E5854' },
]

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 2, cursor: 'pointer',
        background: value ? '#2A8A4E' : 'rgba(0,0,0,0.15)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

// ─── Presence pills ───────────────────────────────────────────────────────────

function PresencePills({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PRESENCE_OPTIONS.map(opt => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => onChange(active ? 'na' : opt.id)}
            title={opt.title}
            style={{
              width: 28, height: 28, borderRadius: '50%', fontSize: 11, fontWeight: 600,
              border: active ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
              backgroundColor: active ? opt.bg : 'white',
              color: active ? opt.color : '#9C9591',
              cursor: 'pointer', transition: 'all 0.12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Convoqué cell — toujours visible, jamais de saut ────────────────────────

function ConvoqueCell({ presence, onUpdate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28 }}>
      <Toggle
        value={presence.convoque}
        onChange={val => onUpdate(presence.id, { convoque: val })}
      />
      <input
        type="time"
        value={presence.heure_convocation ?? '09:00'}
        disabled={!presence.convoque}
        onChange={e => onUpdate(presence.id, { heure_convocation: e.target.value })}
        style={{
          fontSize: 11, width: 70,
          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 3,
          padding: '2px 6px', outline: 'none',
          color: presence.convoque ? '#1F1B17' : '#9C9591',
          background: presence.convoque ? 'white' : '#FAF7F2',
          cursor: presence.convoque ? 'text' : 'not-allowed',
          opacity: presence.convoque ? 1 : 0.5,
          transition: 'all 0.2s',
        }}
      />
    </div>
  )
}

// ─── Lignes ───────────────────────────────────────────────────────────────────

function InterloRow({ presence, onPresence, onUpdate }) {
  const i = presence.affaire_interlocuteurs
  if (!i) return null
  const meta = CATEGORIE_META[i.categorie]
  const catLabel = i.categorie_label || meta?.label || i.categorie

  return (
    <tr>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: meta?.color ?? '#9C9591', backgroundColor: meta?.bg ?? '#FAF7F2', borderRadius: 3, padding: '2px 8px', whiteSpace: 'nowrap' }}>
          {catLabel}
        </span>
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17', marginBottom: 1 }}>
          {[i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '—'}
        </p>
        {i.fonction && <p style={{ fontSize: 11, color: '#5E5854' }}>{i.fonction}</p>}
        {i.organisation && <p style={{ fontSize: 11, color: '#5E5854' }}>{i.organisation}</p>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        {i.email && <a href={`mailto:${i.email}`} style={{ display: 'block', fontSize: 11, color: '#1B3A5C', textDecoration: 'none' }}>{i.email}</a>}
        {i.telephone && <span style={{ fontSize: 11, color: '#5E5854' }}>{i.telephone}</span>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
        <PresencePills value={presence.presence} onChange={val => onPresence(presence.id, val)} />
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
        <ConvoqueCell presence={presence} onUpdate={onUpdate} />
      </td>
    </tr>
  )
}

function LotRow({ presence, onPresence, onUpdate }) {
  const le = presence.lot_entreprises
  if (!le) return null
  const lot = le.lots
  const ent = le.entreprises
  const contact = le.interlocuteurs

  return (
    <tr>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>
          {lot ? `Lot ${lot.numero ?? ''} — ${lot.nom}` : '—'}
        </p>
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17', marginBottom: 1 }}>{ent?.raison_sociale ?? '—'}</p>
        {contact && <p style={{ fontSize: 11, color: '#5E5854' }}>{[contact.prenom, contact.nom].filter(Boolean).join(' ')}</p>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        {contact?.email && <a href={`mailto:${contact.email}`} style={{ display: 'block', fontSize: 11, color: '#1B3A5C', textDecoration: 'none' }}>{contact.email}</a>}
        {contact?.telephone && <span style={{ fontSize: 11, color: '#5E5854' }}>{contact.telephone}</span>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
        <PresencePills value={presence.presence} onChange={val => onPresence(presence.id, val)} />
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
        <ConvoqueCell presence={presence} onUpdate={onUpdate} />
      </td>
    </tr>
  )
}

// ─── Table de présences ───────────────────────────────────────────────────────

const TABLE_TH = { padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '0.5px solid rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }

function PresenceTable({ title, headers, rows }) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 10 }}>{title}</h3>
      <div style={{ backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAF9' }}>
              {headers.map(h => <th key={h} style={TABLE_TH}>{h}</th>)}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function CrPresences({ presences: presencesProp, setPresence, setConvoque }) {
  // Local copy pour mises à jour optimistes (évite le re-render global + saut de layout)
  const [presences, setPresences] = useState(presencesProp)

  useEffect(() => { setPresences(presencesProp) }, [presencesProp])

  // Optimistic update : local first, persist sans refetch
  const updatePresence = async (id, changes) => {
    setPresences(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p))
    await supabase.from('cr_presences').update(changes).eq('id', id)
  }

  const handlePresence = (presenceId, val) => {
    setPresences(prev => prev.map(p => p.id === presenceId ? { ...p, presence: val } : p))
    setPresence(presenceId, val)
  }

  const interloPresences = presences
    .filter(p => p.affaire_interlocuteurs)
    .sort((a, b) => (a.affaire_interlocuteurs?.ordre ?? 99) - (b.affaire_interlocuteurs?.ordre ?? 99))

  const lotPresences = presences
    .filter(p => p.lot_entreprises)
    .sort((a, b) => (a.lot_entreprises?.lots?.numero ?? 99) - (b.lot_entreprises?.lots?.numero ?? 99))

  return (
    <div>
      {/* Légende */}
      {(interloPresences.length > 0 || lotPresences.length > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
          padding: '8px 14px', background: '#FAF7F2', borderRadius: 2, fontSize: 11, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Légende :
          </span>
          {LEGEND_ITEMS.map(item => (
            <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', background: item.bg, color: item.color,
                fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.code}
              </span>
              <span style={{ color: '#5E5854' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <PresenceTable
        title="Interlocuteurs projet"
        headers={['Rôle', 'Contact', 'Email & Tél', 'Présence', 'Convoqué']}
        rows={interloPresences.map(p => (
          <InterloRow key={p.id} presence={p} onPresence={handlePresence} onUpdate={updatePresence} />
        ))}
      />

      <PresenceTable
        title="Entreprises"
        headers={['Lot', 'Entreprise', 'Email & Tél', 'Présence', 'Convoqué']}
        rows={lotPresences.map(p => (
          <LotRow key={p.id} presence={p} onPresence={handlePresence} onUpdate={updatePresence} />
        ))}
      />

      {interloPresences.length === 0 && lotPresences.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9C9591', fontSize: 13 }}>
          <p style={{ marginBottom: 6 }}>Aucun interlocuteur configuré.</p>
          <p style={{ fontSize: 12 }}>Ajoutez des interlocuteurs via "Gérer les interlocuteurs" dans la liste des visites.</p>
        </div>
      )}
    </div>
  )
}
