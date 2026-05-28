import { ZoomIn, ZoomOut, Layers, FileDown, Plus, CalendarDays, GitBranch, Flag } from 'lucide-react'

const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_ICON = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#639922', color: 'white', border: 'none', fontWeight: 500,
}

export function GanttToolbar({
  onZoomIn, onZoomOut, onOpenLots, onExportPdf, onAddTask,
  onToggleConnections, showConnections, onOpenJalons, dayWidth,
}) {
  const canZoomOut = dayWidth > 15
  const canZoomIn = dayWidth < 100

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 16px', backgroundColor: 'white',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0,
    }} data-print="hidden">
      {/* Zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          style={{ ...BTN_ICON, opacity: canZoomOut ? 1 : 0.4, cursor: canZoomOut ? 'pointer' : 'default' }}
          onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom arrière"
        >
          <ZoomOut size={14} />
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px',
          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, backgroundColor: '#FAFAF9',
        }}>
          <CalendarDays size={11} style={{ color: '#9B8F85' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: '#9B8F85', minWidth: 30, textAlign: 'center' }}>
            {dayWidth} px/j
          </span>
        </div>
        <button
          style={{ ...BTN_ICON, opacity: canZoomIn ? 1 : 0.4, cursor: canZoomIn ? 'pointer' : 'default' }}
          onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom avant"
        >
          <ZoomIn size={14} />
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          style={{
            ...BTN_ICON,
            backgroundColor: showConnections ? 'rgba(224,90,30,0.08)' : 'white',
            borderColor: showConnections ? '#E05A1E' : 'rgba(0,0,0,0.15)',
            color: showConnections ? '#E05A1E' : '#374151',
          }}
          onClick={onToggleConnections}
          title={showConnections ? 'Masquer le chemin critique' : 'Afficher le chemin critique'}
        >
          <GitBranch size={14} />
        </button>
        <button style={BTN} onClick={onOpenJalons}>
          <Flag size={13} /> Jalons
        </button>
        <button style={BTN} onClick={onOpenLots}>
          <Layers size={13} /> Lots
        </button>
        <button style={BTN} onClick={onExportPdf}>
          <FileDown size={13} /> Export PDF
        </button>
        <button style={BTN_PRIMARY} onClick={onAddTask}>
          <Plus size={13} /> Ajouter tâche
        </button>
      </div>
    </header>
  )
}
