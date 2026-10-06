import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { affichagePresence } from './crLogique'
import { useCr } from './CrContexte'
import { MentionConvocation, CompteurConvoquesAbsents, FOND_ABSENT } from './MentionConvocation'
import { convocationDe, convoquesDabord, estConvoqueAbsent, convoquesAbsents } from './convocationLogique'

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

// ─── Presence pills ───────────────────────────────────────────────────────────

function PresencePills({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PRESENCE_OPTIONS.map(opt => {
        const active = value === opt.id
        // En lecture seule, seul le statut retenu reste affiché
        if (disabled && !active) return null
        return (
          <button
            key={opt.id}
            disabled={disabled}
            onClick={() => onChange(active ? 'na' : opt.id)}
            title={opt.title}
            style={{
              width: 28, height: 28, borderRadius: '50%', fontSize: 11, fontWeight: 600,
              border: active ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
              backgroundColor: active ? opt.bg : 'white',
              color: active ? opt.color : '#9C9591',
              cursor: disabled ? 'default' : 'pointer', transition: 'all 0.12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Lignes ───────────────────────────────────────────────────────────────────
// Affichées depuis la copie du participant : une fiche supprimée depuis reste
// visible dans les comptes rendus où elle figurait.

function InterloRow({ presence, convocation, absent, onPresence }) {
  const { lectureSeule } = useCr()
  const i = affichagePresence(presence)
  const meta = CATEGORIE_META[i.categorie]
  const catLabel = i.categorieLabel || meta?.label || i.categorie

  return (
    <tr style={absent ? { background: FOND_ABSENT } : undefined}>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: meta?.color ?? '#9C9591', backgroundColor: meta?.bg ?? '#FAF7F2', borderRadius: 3, padding: '2px 8px', whiteSpace: 'nowrap' }}>
          {catLabel}
        </span>
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17', marginBottom: 1 }}>
          {i.nom || '—'}
        </p>
        {i.fonction && <p style={{ fontSize: 11, color: '#5E5854' }}>{i.fonction}</p>}
        {i.organisation && <p style={{ fontSize: 11, color: '#5E5854' }}>{i.organisation}</p>}
        <MentionConvocation convocation={convocation} absent={absent} petite />
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        {i.email && <a href={`mailto:${i.email}`} style={{ display: 'block', fontSize: 11, color: '#1B3A5C', textDecoration: 'none' }}>{i.email}</a>}
        {i.telephone && <span style={{ fontSize: 11, color: '#5E5854' }}>{i.telephone}</span>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
        <PresencePills value={presence.presence} disabled={lectureSeule} onChange={val => onPresence(presence.id, val)} />
      </td>
    </tr>
  )
}

function LotRow({ presence, convocation, absent, onPresence }) {
  const { lectureSeule } = useCr()
  const e = affichagePresence(presence)

  return (
    <tr style={absent ? { background: FOND_ABSENT } : undefined}>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>
          {e.lotNom ? `Lot ${e.lotNumeroAffiche ?? ''} — ${e.lotNom}` : '—'}
        </p>
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17', marginBottom: 1 }}>{e.entreprise ?? '—'}</p>
        {e.contact && <p style={{ fontSize: 11, color: '#5E5854' }}>{e.contact}</p>}
        <MentionConvocation convocation={convocation} absent={absent} petite />
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        {e.email && <a href={`mailto:${e.email}`} style={{ display: 'block', fontSize: 11, color: '#1B3A5C', textDecoration: 'none' }}>{e.email}</a>}
        {e.telephone && <span style={{ fontSize: 11, color: '#5E5854' }}>{e.telephone}</span>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
        <PresencePills value={presence.presence} disabled={lectureSeule} onChange={val => onPresence(presence.id, val)} />
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
      <div style={{ backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', overflowX: 'auto' }}>
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

// Les écritures sont optimistes (le hook met l'écran à jour tout de suite) ;
// un échec est signalé dans le bandeau du compte rendu.
// Les convocations à la prochaine réunion se règlent dans la page « Prochaine
// visite » : ici, on ne pointe que la réunion du jour.
export function CrPresences({ presences, setPresence, convocations = new Map() }) {
  const { signalerErreur } = useCr()

  const handlePresence = (presenceId, val) => {
    setPresence(presenceId, val).catch(signalerErreur)
  }

  // Les convoqués au CR précédent en tête : ce sont ceux qu'on attend
  const interloPresences = convoquesDabord(presences
    .filter(p => affichagePresence(p).type === 'interlocuteur')
    .sort((a, b) => affichagePresence(a).ordre - affichagePresence(b).ordre), convocations)

  const lotPresences = convoquesDabord(presences
    .filter(p => affichagePresence(p).type === 'entreprise')
    .sort((a, b) => (affichagePresence(a).lotNumero ?? 99) - (affichagePresence(b).lotNumero ?? 99)), convocations)

  return (
    <div>
      <CompteurConvoquesAbsents nombre={convoquesAbsents(presences, convocations).length} />

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
        headers={['Rôle', 'Contact', 'Email & Tél', 'Présence']}
        rows={interloPresences.map(p => (
          <InterloRow key={p.id} presence={p} convocation={convocationDe(p, convocations)} absent={estConvoqueAbsent(p, convocations)} onPresence={handlePresence} />
        ))}
      />

      <PresenceTable
        title="Entreprises"
        headers={['Lot', 'Entreprise', 'Email & Tél', 'Présence']}
        rows={lotPresences.map(p => (
          <LotRow key={p.id} presence={p} convocation={convocationDe(p, convocations)} absent={estConvoqueAbsent(p, convocations)} onPresence={handlePresence} />
        ))}
      />

      {interloPresences.length === 0 && lotPresences.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9C9591', fontSize: 13 }}>
          <p style={{ marginBottom: 6 }}>Aucun interlocuteur configuré.</p>
          <p style={{ fontSize: 12 }}>Ajoutez-les avec le bouton « Interlocuteurs » de la liste des visites.</p>
        </div>
      )}
    </div>
  )
}
