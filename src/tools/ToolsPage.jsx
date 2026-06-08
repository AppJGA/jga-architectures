import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileType, Bot, Clock } from 'lucide-react'
import { tools } from './manifest'

const ICON_MAP = { FileType, Bot, Clock }

function ToolCard({ tool, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = ICON_MAP[tool.icon]

  const active = tool.enabled && hovered

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => tool.enabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
        padding: '20px 14px',
        borderRadius: 0,
        border: active ? '0.5px solid var(--jga-orange)' : '0.5px solid rgba(0,0,0,0.08)',
        backgroundColor: active ? 'var(--jga-orange-light)' : 'white',
        opacity: tool.enabled ? 1 : 0.55,
        cursor: tool.enabled ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Icon bubble */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 0,
          backgroundColor: active ? 'var(--jga-orange)' : 'var(--jga-orange-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background-color 0.15s ease',
        }}
      >
        {Icon && (
          <Icon
            size={24}
            strokeWidth={1.25}
            style={{ color: active ? 'white' : 'var(--jga-orange)', transition: 'color 0.15s ease' }}
          />
        )}
      </div>

      <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>{tool.label}</p>

      <p style={{ fontSize: 11, color: 'var(--jga-beige)', lineHeight: 1.4 }}>
        {tool.description}
      </p>

      {!tool.enabled && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            backgroundColor: '#F1EFE8',
            color: '#5F5E5A',
            borderRadius: 3,
            padding: '2px 8px',
          }}
        >
          Bientôt
        </span>
      )}
    </button>
  )
}

export function ToolsPage() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", marginBottom: 6 }}>
          Boîte à outils
        </h1>
        <p style={{ fontSize: 13, color: '#5E5854' }}>
          Outils transversaux pour l'ensemble des affaires
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        {tools.map(tool => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onClick={() => tool.enabled && navigate(`/tools/${tool.path}`)}
          />
        ))}
      </div>
    </div>
  )
}
