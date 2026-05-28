import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { TYPE_COLORS } from './types'

export const HEADER_HEIGHT = 56

const MOE_HEIGHT = 44
const MOA_HEIGHT = 32

export function GanttEtudeSidebar({ phases, onEdit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', height: HEADER_HEIGHT,
        backgroundColor: 'rgba(245,242,240,0.95)',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        backdropFilter: 'blur(4px)',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#9B8F85',
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>Phase</span>
        <span style={{ width: 24, flexShrink: 0 }} />
      </div>

      {phases.map(phase => (
        <PhaseRow
          key={phase.id}
          phase={phase}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

function PhaseRow({ phase, onEdit }) {
  const [hovered, setHovered] = useState(false)
  const isMoe = phase.importance !== 'moa'
  const rowHeight = isMoe ? MOE_HEIGHT : MOA_HEIGHT
  const color = TYPE_COLORS[phase.type_tache] ?? '#9B8F85'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', height: rowHeight,
        paddingLeft: isMoe ? 12 : 24, paddingRight: 12,
        borderBottom: '0.5px solid rgba(0,0,0,0.06)',
        backgroundColor: hovered ? 'rgba(155,143,133,0.06)' : 'transparent',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Type indicator dot */}
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        backgroundColor: color, marginRight: 8,
      }} />

      {/* Nom */}
      <button
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: 0,
        }}
        onClick={() => onEdit(phase)}
      >
        <span style={{
          display: 'block',
          fontSize: isMoe ? 12 : 11,
          fontWeight: isMoe ? 600 : 400,
          color: hovered ? '#E05A1E' : (isMoe ? '#1a1a1a' : '#4b5563'),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.12s',
        }}>
          {phase.nom}
        </span>
      </button>

      {/* Crayon */}
      <button
        onClick={() => onEdit(phase)}
        style={{
          width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: hovered ? '#E05A1E' : '#9B8F85',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s, color 0.12s',
        }}
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}
