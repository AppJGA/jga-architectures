import { ZoomIn, ZoomOut, Layers, FileDown, Plus, CalendarDays, GitBranch, Flag, Palette } from 'lucide-react'

const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_ICON = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#2A8A4E', color: 'white', border: 'none', fontWeight: 500,
}

export function GanttToolbar({
  onZoomIn, onZoomOut, onOpenLots, onExportPdf, onAddTask,
  onToggleConnections, showConnections, onOpenJalons, dayWidth,
  colorMode, onColorModeChange, onOpenZones,
  viewMode, onViewModeChange,
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
          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2, backgroundColor: '#FAFAF9',
        }}>
          <CalendarDays size={11} style={{ color: '#9C9591' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: '#9C9591', minWidth: 30, textAlign: 'center' }}>
            {dayWidth} px/j
          </span>
        </div>
        <button
          style={{ ...BTN_ICON, opacity: canZoomIn ? 1 : 0.4, cursor: canZoomIn ? 'pointer' : 'default' }}
          onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom avant"
        >
          <ZoomIn size={14} />
        </button>

        {/* Mode d'affichage : jours / semaines */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, marginLeft: 4,
          border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, overflow: 'hidden',
        }}>
          {[
            { value: 'day', label: 'Jours' },
            { value: 'week', label: 'Semaines' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewModeChange(opt.value)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                border: 'none',
                borderRight: opt.value === 'day' ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                background: viewMode === opt.value ? '#E8602C' : 'transparent',
                color: viewMode === opt.value ? 'white' : '#5E5854',
                cursor: 'pointer',
                fontWeight: viewMode === opt.value ? 500 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          style={{
            ...BTN,
            backgroundColor: showConnections ? 'rgba(232,96,44,0.12)' : 'white',
            borderColor: showConnections ? '#E8602C' : 'rgba(0,0,0,0.15)',
            color: showConnections ? '#E8602C' : '#5E5854',
          }}
          onClick={onToggleConnections}
        >
          <GitBranch size={14} />
          Dépendances
        </button>
        <button style={BTN} onClick={onOpenJalons}>
          <Flag size={13} /> Jalons
        </button>
        <button style={BTN} onClick={onOpenLots}>
          <Layers size={13} /> Lots
        </button>

        {/* Mode de couleur : par lot / par zone */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, overflow: 'hidden',
        }}>
          {[
            { value: 'lot', label: 'Par lot' },
            { value: 'zone', label: 'Par zone' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onColorModeChange(opt.value)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                border: 'none',
                borderRight: opt.value === 'lot' ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                background: colorMode === opt.value ? '#E8602C' : 'transparent',
                color: colorMode === opt.value ? 'white' : '#5E5854',
                cursor: 'pointer',
                fontWeight: colorMode === opt.value ? 500 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {colorMode === 'zone' && (
          <button style={BTN} onClick={onOpenZones}>
            <Palette size={13} /> Gérer les zones
          </button>
        )}
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
