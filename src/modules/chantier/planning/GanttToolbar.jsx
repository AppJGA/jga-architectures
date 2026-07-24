import { useState } from 'react'
import {
  ZoomIn, ZoomOut, Plus, CalendarDays, Calendar, GitBranch, Flag, Palette, Eye, Ban,
  Download, ChevronDown, FileText, TableProperties, Layers,
} from 'lucide-react'

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
const SEPARATOR = {
  width: '0.5px', height: 20, background: '#E9E2D6', flexShrink: 0,
}

export function GanttToolbar({
  onZoomIn, onZoomOut, onResetDayWidth, onOpenLots, onExportPdf, onExportExcel, onAddTask,
  onToggleConnections, showConnections, onOpenJalons, dayWidth,
  dayWidthMin = 15, dayWidthMax = 100, zoomLevelMin = 0.5, zoomLevelMax = 2,
  colorMode, onColorModeChange, onOpenZones, zones = [],
  groupMode = 'lot', onGroupModeChange,
  viewMode, onViewModeChange, zoomLevel = 1, onZoomLevelChange,
  periodes = [], onOpenPeriodesBloquees,
}) {
  const canZoomOut = dayWidth > dayWidthMin
  const canZoomIn = dayWidth < dayWidthMax
  const [showExportMenu, setShowExportMenu] = useState(false)

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 12px', height: 44,
      borderBottom: '0.5px solid #E9E2D6', backgroundColor: 'white',
      overflowX: 'auto', flexWrap: 'nowrap', flexShrink: 0,
    }} data-print="hidden">

      {/* Actions principales */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button style={BTN_PRIMARY} onClick={onAddTask}>
          <Plus size={13} /> Ajouter tâche
        </button>
        <button
          onClick={onOpenPeriodesBloquees}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            fontSize: 12,
            border: '0.5px solid rgba(0,0,0,0.15)',
            background: periodes.length > 0 ? '#FEF2F2' : 'transparent',
            color: periodes.length > 0 ? '#B8412C' : '#5E5854',
            cursor: 'pointer',
          }}
          title="Gérer les périodes bloquées"
        >
          <Ban size={13} strokeWidth={1.25} />
          {periodes.length > 0 ? `${periodes.length} période(s)` : 'Périodes bloquées'}
        </button>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              fontSize: 12, fontWeight: 500,
              border: '0.5px solid rgba(0,0,0,0.15)',
              background: 'transparent', color: '#5E5854', cursor: 'pointer',
            }}
          >
            <Download size={13} />
            Exporter
            <ChevronDown size={11} />
          </button>

          {showExportMenu && (
            <>
              {/* Overlay pour fermer le menu */}
              <div
                onClick={() => setShowExportMenu(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'white', border: '0.5px solid #E9E2D6', zIndex: 50,
                minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}>
                <button
                  onClick={() => { setShowExportMenu(false); onExportPdf() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', fontSize: 12, border: 'none',
                    background: 'transparent', textAlign: 'left', cursor: 'pointer',
                    color: '#1F1B17',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FAF7F2' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <FileText size={13} color="#E8602C" />
                  Exporter en PDF
                </button>

                <div style={{ height: '0.5px', background: '#E9E2D6' }} />

                <button
                  onClick={() => { setShowExportMenu(false); onExportExcel() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', fontSize: 12, border: 'none',
                    background: 'transparent', textAlign: 'left', cursor: 'pointer',
                    color: '#1F1B17',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FAF7F2' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <TableProperties size={13} color="#2A8A4E" />
                  Exporter en Excel
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={SEPARATOR} />

      {/* Mode de couleur : par lot / par zone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Eye size={14} color="#9C9591" strokeWidth={1.25} />

        <span style={{
          fontSize: 11,
          color: colorMode === 'lot' ? '#1F1B17' : '#9C9591',
          fontWeight: colorMode === 'lot' ? 500 : 400,
          transition: 'color 0.2s',
          whiteSpace: 'nowrap',
        }}>
          Par lot
        </span>

        <div
          onClick={() => onColorModeChange(colorMode === 'lot' ? 'zone' : 'lot')}
          style={{
            width: 40, height: 22, borderRadius: 11,
            background: colorMode === 'zone' ? '#E8602C' : '#C9C4C0',
            position: 'relative', cursor: 'pointer',
            transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 3, left: colorMode === 'zone' ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%', background: 'white',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>

        <span style={{
          fontSize: 11,
          color: colorMode === 'zone' ? '#E8602C' : '#9C9591',
          fontWeight: colorMode === 'zone' ? 500 : 400,
          transition: 'color 0.2s',
          whiteSpace: 'nowrap',
        }}>
          Par zone
        </span>

        {colorMode === 'lot' && (
          <button style={{ ...BTN, marginLeft: 4 }} onClick={onOpenLots}>
            <Palette size={13} strokeWidth={1.25} /> Gérer les lots
          </button>
        )}
        {colorMode === 'zone' && (
          <button style={{ ...BTN, marginLeft: 4 }} onClick={onOpenZones}>
            <Palette size={13} strokeWidth={1.25} /> Gérer les zones
          </button>
        )}
      </div>

      <div style={SEPARATOR} />

      {/* Vue jour / semaine / mois + zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Zoom vue jour — masqué hors vue jour, sinon deux paires de loupes
            coexistent et celle-ci n'a aucun effet visuel (dayWidth n'est pas
            utilisé pour la géométrie en vue semaine/mois). */}
        {viewMode === 'day' && (
          <>
            <button
              style={{ ...BTN_ICON, opacity: canZoomOut ? 1 : 0.4, cursor: canZoomOut ? 'pointer' : 'default' }}
              onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom arrière"
              title="Zoom arrière (⌘ + molette)"
            >
              <ZoomOut size={14} />
            </button>
            <div
              onDoubleClick={onResetDayWidth}
              title="Double-clic pour réinitialiser"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px',
                border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2, backgroundColor: '#FAFAF9',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <CalendarDays size={11} style={{ color: '#9C9591' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: '#9C9591', minWidth: 30, textAlign: 'center', whiteSpace: 'nowrap' }}>
                {dayWidth} px/j
              </span>
            </div>
            <button
              style={{ ...BTN_ICON, opacity: canZoomIn ? 1 : 0.4, cursor: canZoomIn ? 'pointer' : 'default' }}
              onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom avant"
              title="Zoom avant (⌘ + molette)"
            >
              <ZoomIn size={14} />
            </button>
          </>
        )}

        <Calendar size={14} color="#9C9591" strokeWidth={1.25} />
        <div style={{
          display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)', overflow: 'hidden', flexShrink: 0,
        }}>
          {[
            { value: 'day', label: 'Jours' },
            { value: 'week', label: 'Semaines' },
            { value: 'month', label: 'Mois' },
          ].map((opt, idx) => (
            <button
              key={opt.value}
              onClick={() => onViewModeChange(opt.value)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                border: 'none',
                borderRight: idx < 2 ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                background: viewMode === opt.value ? '#E8602C' : 'transparent',
                color: viewMode === opt.value ? 'white' : '#5E5854',
                cursor: 'pointer',
                fontWeight: viewMode === opt.value ? 500 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Zoom vue semaine / mois */}
        {viewMode !== 'day' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 2, flexShrink: 0 }}>
            <button
              onClick={() => onZoomLevelChange((z) => Math.max(zoomLevelMin, Math.round((z - 0.1) * 100) / 100))}
              disabled={zoomLevel <= zoomLevelMin}
              title="Dézoomer (⌘ + molette)"
              style={{
                width: 28, height: 28,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: 'transparent',
                cursor: zoomLevel <= zoomLevelMin ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5E5854',
                opacity: zoomLevel <= zoomLevelMin ? 0.4 : 1,
              }}
            >
              <ZoomOut size={13} />
            </button>

            <span
              onDoubleClick={() => onZoomLevelChange(1)}
              title="Double-clic pour réinitialiser"
              style={{
                fontSize: 11, color: '#9C9591',
                minWidth: 32, textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
              }}
            >
              {Math.round(zoomLevel * 100)}%
            </span>

            <button
              onClick={() => onZoomLevelChange((z) => Math.min(zoomLevelMax, Math.round((z + 0.1) * 100) / 100))}
              disabled={zoomLevel >= zoomLevelMax}
              title="Zoomer (⌘ + molette)"
              style={{
                width: 28, height: 28,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: 'transparent',
                cursor: zoomLevel >= zoomLevelMax ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5E5854',
                opacity: zoomLevel >= zoomLevelMax ? 0.4 : 1,
              }}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        )}
      </div>

      <div style={SEPARATOR} />

      {/* Grouper par : lot / zone — indépendant de la coloration des barres */}
      {zones.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Layers size={13} color="#9C9591" strokeWidth={1.25} />
            <div style={{
              display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)', overflow: 'hidden', flexShrink: 0,
            }}>
              {[
                { value: 'lot', label: 'Par lot' },
                { value: 'zone', label: 'Par zone' },
              ].map((opt, idx) => (
                <button
                  key={opt.value}
                  onClick={() => onGroupModeChange(opt.value)}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    border: 'none',
                    borderRight: idx === 0 ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                    background: groupMode === opt.value ? '#1F1B17' : 'transparent',
                    color: groupMode === opt.value ? 'white' : '#5E5854',
                    cursor: 'pointer',
                    fontWeight: groupMode === opt.value ? 500 : 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={SEPARATOR} />
        </>
      )}

      {/* Dépendances + Jalons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
      </div>
    </header>
  )
}
