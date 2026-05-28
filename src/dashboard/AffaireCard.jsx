import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Calendar, BarChart2, CheckSquare, Trash2 } from 'lucide-react'
import { PhaseBadge } from '../shared/components/Badge'
import { ProgressBar } from '../shared/components/ProgressBar'

const TOP_COLORS = {
  esq:      'var(--jga-orange)',
  avp:      'var(--jga-orange)',
  pro:      'var(--jga-orange)',
  dce:      'var(--jga-orange)',
  pc:       'var(--jga-orange)',
  chantier: 'var(--jga-green)',
  livree:   'var(--jga-beige)',
}

const STUDY_PHASES = new Set(['esq', 'avp', 'pro', 'dce', 'pc'])

const MODULE_ICONS = [
  { id: 'chantier', Icon: ClipboardList },
  { id: 'planning', Icon: Calendar },
  { id: 'financier', Icon: BarChart2 },
  { id: 'todo', Icon: CheckSquare },
]

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

export function AffaireCard({ affaire, onDeleteRequest }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const topColor = TOP_COLORS[affaire.phase] ?? 'var(--jga-beige)'
  const isStudy = STUDY_PHASES.has(affaire.phase)
  const isChantier = affaire.phase === 'chantier'

  const iconBg = isStudy
    ? 'var(--jga-orange-light)'
    : isChantier
      ? 'var(--jga-green-light)'
      : '#F1EFE8'

  const iconColor = isStudy
    ? 'var(--jga-orange)'
    : isChantier
      ? 'var(--jga-green)'
      : 'var(--jga-beige)'

  const date = formatDate(affaire.date_livraison)

  return (
    <div
      onClick={() => navigate(`/affaires/${affaire.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        textAlign: 'left',
        backgroundColor: 'white',
        borderRadius: 14,
        overflow: 'hidden',
        border: hovered ? '0.5px solid var(--jga-orange-mid)' : '0.5px solid rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Top color bar */}
      <div style={{ height: 3, backgroundColor: topColor }} />

      {/* Delete button */}
      {onDeleteRequest && (
        <button
          onClick={e => { e.stopPropagation(); onDeleteRequest(affaire) }}
          title="Supprimer cette affaire"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 26, height: 26, borderRadius: 7,
            border: '0.5px solid rgba(220,38,38,0.3)',
            backgroundColor: '#FEF2F2',
            color: '#DC2626',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          <Trash2 size={12} />
        </button>
      )}

      <div style={{ padding: 14 }}>
        <div style={{ marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.06em' }}>
            {affaire.code_affaire}
          </span>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.3, marginBottom: 3 }}>
          {affaire.nom}
        </h3>
        <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
          {affaire.moa_nom}
        </p>

        <div style={{ marginBottom: 8 }}>
          <PhaseBadge phase={affaire.phase} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <ProgressBar value={affaire.avancement} phase={affaire.phase} />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--jga-beige)' }}>
            {date ? `Livr. ${date}` : '—'}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {MODULE_ICONS.map(({ id, Icon }) => (
              <div
                key={id}
                style={{
                  width: 18, height: 18, borderRadius: 5,
                  backgroundColor: iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={11} style={{ color: iconColor }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
