import { useState } from 'react'
import {
  ZoomIn, ZoomOut, Layers, Plus, CalendarDays, GitBranch, Flag, Palette, Eye,
  Download, ChevronDown, FileText, TableProperties,
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

export function GanttToolbar({
  onZoomIn, onZoomOut, onOpenLots, onExportPdf, onExportExcel, onAddTask,
  onToggleConnections, showConnections, onOpenJalons, dayWidth,
  colorMode, onColorModeChange, onOpenZones,
  viewMode, onViewModeChange, zoomLevel = 1, onZoomLevelChange,
}) {
  const canZoomOut = dayWidth > 15
  const canZoomIn = dayWidth < 100
  const [showExportMenu, setShowExportMenu] = useState(false)

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

        {/* Mode d'affichage : jours / semaines / mois */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, marginLeft: 4,
          border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, overflow: 'hidden',
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
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Zoom vue semaine / mois */}
        {viewMode !== 'day' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
            <button
              onClick={() => onZoomLevelChange((z) => Math.max(0.5, z - 0.25))}
              disabled={zoomLevel <= 0.5}
              title="Dézoomer"
              style={{
                width: 28, height: 28,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: 'transparent',
                cursor: zoomLevel <= 0.5 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5E5854',
                opacity: zoomLevel <= 0.5 ? 0.4 : 1,
              }}
            >
              <ZoomOut size={13} />
            </button>

            <span style={{
              fontSize: 11, color: '#9C9591',
              minWidth: 32, textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {Math.round(zoomLevel * 100)}%
            </span>

            <button
              onClick={() => onZoomLevelChange((z) => Math.min(2, z + 0.25))}
              disabled={zoomLevel >= 2}
              title="Zoomer"
              style={{
                width: 28, height: 28,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: 'transparent',
                cursor: zoomLevel >= 2 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5E5854',
                opacity: zoomLevel >= 2 ? 0.4 : 1,
              }}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={14} color="#9C9591" strokeWidth={1.25} />

          <span style={{
            fontSize: 11,
            color: colorMode === 'lot' ? '#1F1B17' : '#9C9591',
            fontWeight: colorMode === 'lot' ? 500 : 400,
            transition: 'color 0.2s',
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
          }}>
            Par zone
          </span>

          {colorMode === 'zone' && (
            <button
              onClick={onOpenZones}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                fontSize: 12,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: 'transparent', color: '#5E5854', cursor: 'pointer',
                marginLeft: 4,
              }}
            >
              <Palette size={13} strokeWidth={1.25} />
              Gérer les zones
            </button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
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
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
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
        <button style={BTN_PRIMARY} onClick={onAddTask}>
          <Plus size={13} /> Ajouter tâche
        </button>
      </div>
    </header>
  )
}
