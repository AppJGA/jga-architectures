import { Pencil } from 'lucide-react'

export function GanttSidebar({ tasks, lots, rowHeight, headerHeight, onEdit, onAvancementChange }) {
  const lotsWithTasks = lots
    .map((lot) => ({ lot, tasks: tasks.filter((t) => t.lot_id === lot.id) }))
    .filter(({ tasks }) => tasks.length > 0)

  const unassigned = tasks.filter((t) => t.lot_id == null)

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
            <TaskRow key={task.id} task={task} lotColor={lot.couleur} rowHeight={rowHeight}
              onEdit={onEdit} onAvancementChange={onAvancementChange} />
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
            <TaskRow key={task.id} task={task} lotColor="#94a3b8" rowHeight={rowHeight}
              onEdit={onEdit} onAvancementChange={onAvancementChange} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, lotColor, rowHeight, onEdit, onAvancementChange }) {
  return (
    <div
      className="group"
      style={{
        display: 'flex', alignItems: 'center', height: rowHeight,
        padding: '0 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(155,143,133,0.06)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
    >
      {/* Color bar + task number */}
      <div style={{ display: 'flex', width: 48, flexShrink: 0, alignItems: 'center', gap: 6 }}>
        <div style={{ width: 2, height: 16, borderRadius: 999, backgroundColor: lotColor }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#9C9591', fontVariantNumeric: 'tabular-nums' }}>
          {task.num_tache}
        </span>
      </div>

      {/* Task name */}
      <button
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12, color: '#1F1B17',
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
            borderRadius: 4, padding: '1px 4px', marginLeft: 4, flexShrink: 0,
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
            width: 46, height: 24, borderRadius: 6, textAlign: 'center', fontSize: 11,
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
          justifyContent: 'center', borderRadius: 6, background: 'none', border: 'none',
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
