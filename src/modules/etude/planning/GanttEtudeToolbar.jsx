import { ZoomIn, ZoomOut, FileDown, Plus, Flag, GitBranch, CalendarDays, RefreshCw } from 'lucide-react'

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
  ...BTN, backgroundColor: '#E8602C', color: 'white', border: 'none', fontWeight: 500,
}

export function GanttEtudeToolbar({
  onZoomIn, onZoomOut, onExportPdf, onAddTask,
  onOpenJalons, onToggleConnections, showConnections, semWidth,
  notionEnabled, notionConnected, onToggleNotion,
}) {
  const canZoomOut = semWidth > 16
  const canZoomIn = semWidth < 80

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 16px', backgroundColor: 'white',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0,
    }} data-print="hidden">
      {/* Zoom */}
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
          <CalendarDays size={11} style={{ color: '#9C9591' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: '#9C9591', minWidth: 36, textAlign: 'center' }}>
            {semWidth} px/sem
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
        {/* Notion sync badge */}
        {onToggleNotion && (
          <button
            onClick={onToggleNotion}
            title={notionEnabled ? 'Désactiver la sync Notion' : 'Activer la sync Notion'}
            style={{
              ...BTN,
              gap: 6,
              backgroundColor: notionEnabled ? '#F3F0FF' : 'white',
              borderColor: notionEnabled ? '#7C3AED' : 'rgba(0,0,0,0.15)',
              color: notionEnabled ? '#7C3AED' : '#374151',
            }}
          >
            <RefreshCw size={12} />
            Notion
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              backgroundColor: notionEnabled
                ? (notionConnected ? '#22C55E' : '#EF4444')
                : '#D1D5DB',
            }} />
          </button>
        )}
        <button
          onClick={onToggleConnections}
          style={{
            ...BTN,
            backgroundColor: showConnections ? 'var(--jga-orange-light)' : 'transparent',
            borderColor: showConnections ? 'var(--jga-orange-mid)' : 'rgba(0,0,0,0.15)',
            color: showConnections ? 'var(--jga-orange)' : '#5E5854',
          }}
          title={showConnections ? 'Masquer les dépendances' : 'Afficher les dépendances'}
        >
          <GitBranch size={13} />
          Dépendances
        </button>
        <button style={BTN} onClick={onOpenJalons}>
          <Flag size={13} /> Jalons
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
