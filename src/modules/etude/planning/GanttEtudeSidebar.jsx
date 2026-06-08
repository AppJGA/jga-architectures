import { useState, useCallback } from 'react'
import { Pencil, GripVertical } from 'lucide-react'
import { TYPE_COLORS } from './types'

export const HEADER_HEIGHT = 56
const ROW_HEIGHT = 44

export function GanttEtudeSidebar({ phases, onEdit, criticalIds, onReorder }) {
  const [draggedId, setDraggedId]   = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  const handleDragStart = useCallback((e, phaseId) => {
    setDraggedId(phaseId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
  }, [])

  const handleDragOver = useCallback((e, phaseId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (phaseId !== draggedId) setDragOverId(phaseId)
  }, [draggedId])

  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return
    const next = [...phases]
    const fromIdx = next.findIndex(p => p.id === draggedId)
    const toIdx   = next.findIndex(p => p.id === targetId)
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onReorder(next.map((p, i) => ({ ...p, ordre: i })))
    setDraggedId(null)
    setDragOverId(null)
  }, [draggedId, phases, onReorder])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px 0 32px', height: HEADER_HEIGHT,
        backgroundColor: 'rgba(245,242,240,0.95)',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        backdropFilter: 'blur(4px)',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#9C9591',
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>Phase</span>
        <span style={{ width: 24, flexShrink: 0 }} />
      </div>

      {phases.map(phase => (
        <PhaseRow
          key={phase.id}
          phase={phase}
          onEdit={onEdit}
          isCritical={criticalIds?.has(phase.id) ?? false}
          isDragging={draggedId === phase.id}
          isDragOver={dragOverId === phase.id}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ))}
    </div>
  )
}

function PhaseRow({
  phase, onEdit, isCritical,
  isDragging, isDragOver,
  onDragStart, onDragEnd, onDragOver, onDrop,
}) {
  const [hovered, setHovered] = useState(false)
  const color = TYPE_COLORS[phase.type_tache] ?? '#9C9591'

  const nameStyle = {
    etude:         { fontSize: 12, fontWeight: 600, color: hovered ? '#E8602C' : '#1F1B17', fontStyle: 'normal', marginLeft: 0 },
    validation:    { fontSize: 11, fontWeight: 400, color: hovered ? '#E8602C' : '#4b5563', fontStyle: 'normal', marginLeft: 8 },
    administratif: { fontSize: 11, fontWeight: 400, color: hovered ? '#E8602C' : '#92400E', fontStyle: 'italic', marginLeft: 0 },
    chantier:      { fontSize: 12, fontWeight: 500, color: hovered ? '#E8602C' : '#1e40af', fontStyle: 'normal', marginLeft: 0 },
  }[phase.type_tache] ?? { fontSize: 12, fontWeight: 400, color: '#1F1B17', fontStyle: 'normal', marginLeft: 0 }

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, phase.id)}
      onDragEnd={onDragEnd}
      onDragOver={e => onDragOver(e, phase.id)}
      onDrop={e => onDrop(e, phase.id)}
      style={{
        display: 'flex', alignItems: 'center', height: ROW_HEIGHT,
        paddingRight: 12,
        borderBottom: '0.5px solid rgba(0,0,0,0.06)',
        borderTop: isDragOver ? '2px solid var(--jga-orange)' : '2px solid transparent',
        backgroundColor: isDragging
          ? 'rgba(224,90,30,0.06)'
          : hovered ? 'rgba(155,143,133,0.06)' : 'transparent',
        opacity: isDragging ? 0.5 : 1,
        transition: 'background-color 0.1s, border-top 0.08s',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Poignée de drag */}
      <div style={{
        width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, cursor: 'grab',
        color: hovered ? '#C5BEB9' : 'transparent',
        transition: 'color 0.15s',
      }}>
        <GripVertical size={14} />
      </div>

      {/* Point chemin critique */}
      {isCritical && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          backgroundColor: '#B8412C', marginRight: 5,
        }} />
      )}

      {/* Point type */}
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
          fontSize: nameStyle.fontSize,
          fontWeight: nameStyle.fontWeight,
          color: nameStyle.color,
          fontStyle: nameStyle.fontStyle,
          marginLeft: nameStyle.marginLeft,
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
          justifyContent: 'center', borderRadius: 3, background: 'none', border: 'none',
          cursor: 'pointer', color: hovered ? '#E8602C' : '#9C9591',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s, color 0.12s',
        }}
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}
