import { useState } from 'react'
import {
  Plus, GitBranch, Flag, Ban, SlidersHorizontal,
  Download, ChevronDown, FileText, TableProperties,
} from 'lucide-react'

const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#2A8A4E', color: 'white', border: 'none', fontWeight: 500,
}
const SEPARATOR = {
  width: '0.5px', height: 20, background: '#E9E2D6', flexShrink: 0,
}

export function GanttToolbar({
  onAddTask, onOpenPeriodesBloquees, onExportPdf, onExportExcel, periodes = [],
  onToggleConnections, showConnections, onOpenJalons,
  showOptionsPanel, onToggleOptionsPanel,
}) {
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

      <div style={SEPARATOR} />

      {/* Options d'affichage — ouvre/ferme le panneau latéral */}
      <button
        onClick={onToggleOptionsPanel}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', fontSize: 12,
          border: '0.5px solid rgba(0,0,0,0.15)',
          background: showOptionsPanel ? '#1F1B17' : 'transparent',
          color: showOptionsPanel ? 'white' : '#5E5854',
          cursor: 'pointer',
          marginLeft: 'auto',
          flexShrink: 0,
        }}
      >
        <SlidersHorizontal size={13} strokeWidth={1.25} />
        Affichage
      </button>
    </header>
  )
}
