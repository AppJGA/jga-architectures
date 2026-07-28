import { useState } from 'react'
import { Pencil, GripVertical } from 'lucide-react'

function getBarColor(task, lotColor, zones, colorMode) {
  if (colorMode === 'zone') {
    if (task.zone_id) {
      const zone = zones.find((z) => z.id === task.zone_id)
      return zone?.couleur ?? '#C9C4C0'
    }
    return '#C9C4C0'
  }
  return lotColor
}

// Métriques dérivées de la hauteur de ligne. Partagées par les deux groupements
// (par lot et par zone), qui sont rendus par deux composants distincts : les
// garder ici évite qu'une des deux branches soit oubliée.
function rowMetrics(rowHeight) {
  const compact = rowHeight <= 28
  return {
    compact,
    nomFontSize: compact ? 11 : rowHeight >= 44 ? 13 : 12,
    inputHeight: compact ? 18 : 24,
    puceHeight: compact ? 12 : 16,
    numFontSize: compact ? 10 : 11,
  }
}

export function GanttSidebar({
  tasks, lots, rows = null, rowHeight, headerHeight, onEdit, onAvancementChange, zones = [], colorMode = 'lot',
  onReorderTask, dragOverTaskId = null, onDragOverTaskChange,
}) {
  const [draggedTaskId, setDraggedTaskId] = useState(null)

  if (rows) {
    return (
      <ZoneGroupedSidebar
        rows={rows} lots={lots} rowHeight={rowHeight} headerHeight={headerHeight}
        onEdit={onEdit} onAvancementChange={onAvancementChange}
      />
    )
  }

  const lotsWithTasks = lots
    .map((lot) => ({ lot, tasks: tasks.filter((t) => t.lot_id === lot.id) }))
    .filter(({ tasks }) => tasks.length > 0)

  const unassigned = tasks.filter((t) => t.lot_id == null)

  const handleTaskDragStart = (e, taskId) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.4'
  }

  const handleTaskDragEnd = (e) => {
    e.currentTarget.style.opacity = '1'
    setDraggedTaskId(null)
    onDragOverTaskChange?.(null)
  }

  const handleTaskDragOver = (e, taskId) => {
    e.preventDefault()
    if (taskId !== draggedTaskId) onDragOverTaskChange?.(taskId)
  }

  const handleTaskDrop = (e, targetTaskId) => {
    e.preventDefault()
    if (draggedTaskId && draggedTaskId !== targetTaskId) {
      onReorderTask?.(draggedTaskId, targetTaskId)
    }
    setDraggedTaskId(null)
    onDragOverTaskChange?.(null)
  }

  const dragHandlers = { draggedTaskId, dragOverTaskId, handleTaskDragStart, handleTaskDragEnd, handleTaskDragOver, handleTaskDrop }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', height: headerHeight,
        backgroundColor: 'rgba(245,242,240,0.8)',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#9C9591',
      }}>
        <span style={{ width: 20, flexShrink: 0 }} />
        <span style={{ width: 48, flexShrink: 0 }}>N°</span>
        <span style={{ flex: 1, minWidth: 0 }}>Tâche</span>
        <span style={{ width: 56, flexShrink: 0, textAlign: 'center' }}>Av. %</span>
        <span style={{ width: 24, flexShrink: 0 }} />
      </div>

      {/* Lots + tasks */}
      {lotsWithTasks.map(({ lot, tasks: lotTasks }) => (
        <div key={lot.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 12px', height: rowHeight,
            backgroundColor: `${lot.couleur}18`,
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              backgroundColor: lot.couleur,
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: lot.couleur,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {lot.num_lot} – {lot.nom}
            </span>
          </div>
          {lotTasks.map((task) => (
            <TaskRow key={task.id} task={task} lotColor={getBarColor(task, lot.couleur, zones, colorMode)} rowHeight={rowHeight}
              onEdit={onEdit} onAvancementChange={onAvancementChange} {...dragHandlers} />
          ))}
        </div>
      ))}

      {/* Unassigned tasks */}
      {unassigned.length > 0 && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 12px', height: rowHeight,
            backgroundColor: 'rgba(155,143,133,0.08)',
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9C9591' }}>
              Sans lot
            </span>
          </div>
          {unassigned.map((task) => (
            <TaskRow key={task.id} task={task} lotColor={getBarColor(task, '#94a3b8', zones, colorMode)} rowHeight={rowHeight}
              onEdit={onEdit} onAvancementChange={onAvancementChange} {...dragHandlers} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task, lotColor, rowHeight, onEdit, onAvancementChange,
  draggedTaskId, dragOverTaskId, handleTaskDragStart, handleTaskDragEnd, handleTaskDragOver, handleTaskDrop,
}) {
  const isDragOver = dragOverTaskId === task.id && draggedTaskId !== task.id

  // La ligne compacte (24 px) ne peut pas loger un champ de 24 px plus ses
  // bordures : on resserre le champ et la typographie en conséquence.
  const { compact, nomFontSize, inputHeight, puceHeight, numFontSize } = rowMetrics(rowHeight)

  return (
    <div
      className="group"
      draggable
      onDragStart={(e) => handleTaskDragStart(e, task.id)}
      onDragEnd={handleTaskDragEnd}
      onDragOver={(e) => handleTaskDragOver(e, task.id)}
      onDrop={(e) => handleTaskDrop(e, task.id)}
      style={{
        display: 'flex', alignItems: 'center', height: rowHeight,
        padding: '0 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
        borderTop: isDragOver ? '2px solid #E8602C' : '2px solid transparent',
        transition: 'background-color 0.1s, border-top 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(155,143,133,0.06)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
    >
      {/* Poignée de drag */}
      <div
        className="opacity-0 group-hover:opacity-100"
        style={{
          cursor: 'grab', padding: '0 4px', display: 'flex', alignItems: 'center',
          color: '#9C9591', flexShrink: 0, transition: 'opacity 0.15s',
        }}
      >
        <GripVertical size={12} strokeWidth={1.25} />
      </div>

      {/* Color bar + task number */}
      <div style={{ display: 'flex', width: 48, flexShrink: 0, alignItems: 'center', gap: 6 }}>
        <div style={{ width: 2, height: puceHeight, borderRadius: 2, backgroundColor: lotColor }} />
        <span style={{ fontSize: numFontSize, fontWeight: 600, color: '#9C9591', fontVariantNumeric: 'tabular-nums' }}>
          {task.num_tache}
        </span>
      </div>

      {/* Task name */}
      <button
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', fontSize: nomFontSize, color: '#1F1B17',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
        onClick={() => onEdit(task)}
        onMouseEnter={e => e.currentTarget.style.color = '#E8602C'}
        onMouseLeave={e => e.currentTarget.style.color = '#1F1B17'}
      >
        {task.nom}
        {task.appro_actif && task.appro_duree > 0 && (
          <span style={{
            fontSize: 9, color: '#9C9591', background: '#FAF7F2',
            borderRadius: 3, padding: '1px 4px', marginLeft: 4, flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>
            +{task.appro_duree}j
          </span>
        )}
      </button>

      {/* Avancement input */}
      <div style={{ width: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          type="number" min={0} max={100} value={task.avancement}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value)))
            onAvancementChange(task.id, v)
          }}
          style={{
            width: 46, height: inputHeight, borderRadius: 3, textAlign: 'center', fontSize: compact ? 10 : 11,
            border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: '#FAFAF9',
            padding: '0 4px', fontVariantNumeric: 'tabular-nums', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 2px rgba(224,90,30,0.1)' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.15)'; e.target.style.boxShadow = 'none' }}
        />
      </div>

      {/* Edit button */}
      <button
        onClick={() => onEdit(task)}
        className="opacity-0 group-hover:opacity-100"
        style={{
          width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: 3, background: 'none', border: 'none',
          cursor: 'pointer', color: '#9C9591', transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#E8602C'}
        onMouseLeave={e => e.currentTarget.style.color = '#9C9591'}
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}

// ─── Groupement "Par zone" ──────────────────────────────────────────────────────
//
// Contrairement au groupement par lot (calculé ci-dessus depuis tasks+lots), les
// lignes sont ici précalculées par le parent (une tâche peut apparaître plusieurs
// fois — une fois par zone où elle a un segment). Pas de drag & drop de
// réorganisation ici : l'ordre des lignes dans une zone reflète l'ordre par lot,
// et une tâche peut apparaître sur plusieurs lignes, ce que la réorganisation
// (au sein d'un seul lot) ne gère pas.
function ZoneGroupedSidebar({ rows, lots, rowHeight, headerHeight, onEdit, onAvancementChange }) {
  const { compact, nomFontSize, inputHeight, puceHeight, numFontSize } = rowMetrics(rowHeight)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', height: headerHeight,
        backgroundColor: 'rgba(245,242,240,0.8)',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#9C9591',
      }}>
        <span style={{ width: 48, flexShrink: 0 }}>N°</span>
        <span style={{ flex: 1, minWidth: 0 }}>Tâche</span>
        <span style={{ width: 56, flexShrink: 0, textAlign: 'center' }}>Av. %</span>
        <span style={{ width: 24, flexShrink: 0 }} />
      </div>

      {rows.map((row) => {
        if (row.type === 'header-zone') {
          return (
            <div key={row.id} style={{
              height: headerHeight,
              display: 'flex', alignItems: 'center',
              padding: '0 12px',
              background: row.couleur ? `${row.couleur}18` : '#F5F2F0',
              borderBottom: `2px solid ${row.couleur ?? '#C9C4C0'}`,
              borderLeft: `3px solid ${row.couleur ?? '#C9C4C0'}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: row.couleur ?? '#5E5854',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {row.displayName}
              </span>
            </div>
          )
        }

        const lot = lots.find((l) => l.id === row.lotId)
        const isDuplicate = row.showMainBar === false

        return (
          <div
            key={row.id}
            className="group"
            style={{
              display: 'flex', alignItems: 'center', height: rowHeight,
              padding: '0 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', gap: 6,
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(155,143,133,0.06)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
          >
            {/* Color bar + numéro */}
            <div style={{ display: 'flex', width: 48, flexShrink: 0, alignItems: 'center', gap: 6 }}>
              <div style={{ width: 2, height: puceHeight, borderRadius: 2, backgroundColor: lot?.couleur ?? '#C9C4C0' }} />
              <span style={{ fontSize: numFontSize, fontWeight: 600, color: '#9C9591', fontVariantNumeric: 'tabular-nums' }}>
                {row.numero}
              </span>
            </div>

            {/* Nom — italique sur une ligne dupliquée (segments seulement) */}
            <button
              style={{
                flex: 1, minWidth: 0, textAlign: 'left', fontSize: nomFontSize, color: '#1F1B17',
                fontStyle: isDuplicate ? 'italic' : 'normal',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
              onClick={() => onEdit(row.task)}
              onMouseEnter={e => e.currentTarget.style.color = '#E8602C'}
              onMouseLeave={e => e.currentTarget.style.color = '#1F1B17'}
            >
              {row.displayName}
            </button>

            {/* Avancement — seulement sur la ligne principale de la tâche */}
            <div style={{ width: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!isDuplicate && (
                <input
                  type="number" min={0} max={100} value={row.task.avancement}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value)))
                    onAvancementChange(row.task.id, v)
                  }}
                  style={{
                    width: 46, height: inputHeight, borderRadius: 3, textAlign: 'center', fontSize: compact ? 10 : 11,
                    border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: '#FAFAF9',
                    padding: '0 4px', fontVariantNumeric: 'tabular-nums', outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 2px rgba(224,90,30,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.15)'; e.target.style.boxShadow = 'none' }}
                />
              )}
            </div>

            {/* Lot — fine bande de couleur (le nom complet reste en tooltip) :
                la colonne est trop étroite pour un libellé lisible. */}
            <div
              title={lot?.nom ?? ''}
              style={{
                width: 4,
                height: 20,
                background: lot?.couleur ?? '#C9C4C0',
                flexShrink: 0,
                borderRadius: 1,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
