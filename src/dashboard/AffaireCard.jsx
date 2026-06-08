import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Calendar, BarChart2, CheckSquare, Trash2, Lock } from 'lucide-react'
import { PhaseBadge } from '../shared/components/Badge'

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

function AvatarsStack({ collaborateurs }) {
  if (!collaborateurs?.length) return null
  const visible = collaborateurs.slice(0, 4)
  const extra = collaborateurs.length - 4
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {visible.map((c, i) => {
        const initiales = (
          (c.profiles?.prenom?.[0] ?? '') +
          (c.profiles?.nom?.[0] ?? '')
        ).toUpperCase() || '?'
        return (
          <div
            key={i}
            title={`${c.profiles?.prenom ?? ''} ${c.profiles?.nom ?? ''}`.trim()}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: c.role === 'proprietaire' ? 'var(--jga-orange)' : '#9C9591',
              color: 'white', fontSize: 9, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid white',
              marginLeft: i === 0 ? 0 : -6,
              zIndex: 10 - i, position: 'relative',
            }}
          >
            {initiales}
          </div>
        )
      })}
      {extra > 0 && (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: '#FAF7F2', color: '#9C9591', fontSize: 9, fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid white', marginLeft: -6,
        }}>
          +{extra}
        </div>
      )}
    </div>
  )
}

export function AffaireCard({ affaire, onDeleteRequest, isAuthorized = true }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const topColor = TOP_COLORS[affaire.phase] ?? 'var(--jga-beige)'
  const isStudy = STUDY_PHASES.has(affaire.phase)
  const isChantier = affaire.phase === 'chantier'
  const collaborateurs = affaire.affaire_collaborateurs ?? []

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
        borderRadius: 0,
        overflow: 'hidden',
        border: isAuthorized && hovered
          ? '0.5px solid var(--jga-orange-mid)'
          : '0.5px solid rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        filter: isAuthorized ? 'none' : 'grayscale(100%)',
        opacity: isAuthorized ? 1 : 0.6,
      }}
    >
      {/* Badge lecture seule */}
      {!isAuthorized && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 20,
          background: 'rgba(0,0,0,0.6)', color: 'white',
          fontSize: 9, fontWeight: 500, padding: '2px 6px',
          borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3,
          letterSpacing: '0.04em',
        }}>
          <Lock size={8} />
          LECTURE SEULE
        </div>
      )}

      {/* Haut : photo ou trait coloré */}
      {affaire.photo_url ? (
        <div style={{ height: 90, borderRadius: 0, overflow: 'hidden', position: 'relative' }}>
          <img
            src={affaire.photo_url}
            alt={affaire.nom}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: topColor }} />
        </div>
      ) : (
        <div style={{ height: 3, backgroundColor: topColor }} />
      )}

      {/* Bouton supprimer — autorisées seulement */}
      {isAuthorized && onDeleteRequest && (
        <button
          onClick={e => { e.stopPropagation(); onDeleteRequest(affaire) }}
          title="Supprimer cette affaire"
          style={{
            position: 'absolute', top: affaire.photo_url ? 8 : 10, right: 10,
            width: 26, height: 26, borderRadius: 2,
            border: '0.5px solid rgba(220,38,38,0.3)',
            backgroundColor: 'rgba(184,65,44,0.10)', color: '#B8412C',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          <Trash2 size={12} strokeWidth={1.25} />
        </button>
      )}

      <div style={{ padding: 14 }}>
        <div style={{ marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
            {affaire.code_affaire}
          </span>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', lineHeight: 1.3, marginBottom: 3 }}>
          {affaire.nom}
        </h3>
        <p style={{ fontSize: 11, color: '#5E5854', marginBottom: 10 }}>
          {affaire.moa_nom}
        </p>

        <div style={{ marginBottom: 12 }}>
          <PhaseBadge phase={affaire.phase} />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AvatarsStack collaborateurs={collaborateurs} />
            <span style={{ fontSize: 10, color: 'var(--jga-beige)' }}>
              {date ? `Livr. ${date}` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {MODULE_ICONS.map(({ id, Icon }) => (
              <div
                key={id}
                style={{
                  width: 18, height: 18, borderRadius: 3,
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
