import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Pencil, GitBranch, Flag, Ban, SlidersHorizontal,
  Download, ChevronDown, FileText, TableProperties,
} from 'lucide-react'

const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const SEPARATOR = {
  width: '0.5px', height: 20, background: '#E9E2D6', flexShrink: 0,
}

export function GanttToolbar({
  onAddTask, onOpenPeriodesBloquees, onExportPdf, onExportExcel, periodes = [],
  onToggleConnections, showConnections, onOpenJalons,
  showOptionsPanel, onToggleOptionsPanel,
  drawMode = false, onSetDrawMode,
}) {
  // Dropdowns rendus via portail (document.body) : la toolbar a overflowX: 'auto',
  // ce qui force implicitement overflowY à cliper (règle CSS : dès qu'un axe
  // overflow n'est pas 'visible', l'autre, s'il l'était, devient 'auto') — un
  // dropdown positionné en absolute à l'intérieur se retrouvait donc rogné/caché
  // dès qu'il dépassait les 44px de hauteur de la toolbar.
  const [createMenuPos, setCreateMenuPos] = useState(null)
  const [exportMenuPos, setExportMenuPos] = useState(null)
  const createGroupRef = useRef(null)
  const exportBtnRef = useRef(null)

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 12px', height: 44,
      borderBottom: '0.5px solid #E9E2D6', backgroundColor: 'white',
      overflowX: 'auto', flexWrap: 'nowrap', flexShrink: 0,
    }} data-print="hidden">

      {/* Actions principales */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div ref={createGroupRef} style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
          {/* Bouton principal — hors mode dessin : ouvre la modale. En mode
              dessin : le reclic désactive le mode (le dessin se fait dans
              la timeline, ce bouton ne sert alors qu'à en sortir). */}
          <button
            onClick={() => { if (drawMode) onSetDrawMode(false); else onAddTask() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              fontSize: 12, fontWeight: 500, border: 'none',
              background: drawMode ? '#E8602C' : '#2A8A4E', color: 'white', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {drawMode ? <Pencil size={13} /> : <Plus size={13} />}
            {drawMode ? 'Dessiner…' : 'Nouvelle tâche'}
          </button>

          {/* Flèche pour choisir le mode de création */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (createMenuPos) { setCreateMenuPos(null); return }
              const rect = createGroupRef.current.getBoundingClientRect()
              setCreateMenuPos({ top: rect.bottom + 4, left: rect.left })
            }}
            style={{
              width: 26, border: 'none',
              borderLeft: '0.5px solid rgba(255,255,255,0.25)',
              background: drawMode ? '#C44A1B' : '#1F6B3A', color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <ChevronDown size={11} />
          </button>
        </div>
        {/* Périodes — accent rouge seulement si au moins une période bloque
            réellement les tâches ; gris si toutes sont informatives. */}
        {(() => {
          const nbBloquantes = periodes.filter((p) => p.est_bloquante !== false).length
          const accent = nbBloquantes > 0
          return (
            <button
              onClick={onOpenPeriodesBloquees}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                fontSize: 12,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: accent ? '#FEF2F2' : periodes.length > 0 ? '#F5F2F0' : 'transparent',
                color: accent ? '#B8412C' : '#5E5854',
                cursor: 'pointer',
              }}
              title={periodes.length > 0
                ? `${nbBloquantes} bloquante(s), ${periodes.length - nbBloquantes} informative(s)`
                : 'Gérer les périodes'}
            >
              <Ban size={13} strokeWidth={1.25} />
              {periodes.length > 0 ? `${periodes.length} période(s)` : 'Périodes'}
            </button>
          )
        })()}

        <button
          ref={exportBtnRef}
          onClick={() => {
            if (exportMenuPos) { setExportMenuPos(null); return }
            const rect = exportBtnRef.current.getBoundingClientRect()
            setExportMenuPos({ top: rect.bottom + 4, left: rect.left })
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            fontSize: 12, fontWeight: 500,
            border: '0.5px solid rgba(0,0,0,0.15)',
            background: 'transparent', color: '#5E5854', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Download size={13} />
          Exporter
          <ChevronDown size={11} />
        </button>
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

      {createMenuPos && createPortal(
        <>
          <div
            onClick={() => setCreateMenuPos(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
          />
          <div style={{
            position: 'fixed', top: createMenuPos.top, left: createMenuPos.left,
            background: 'white', border: '0.5px solid #E9E2D6', zIndex: 999,
            minWidth: 210, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            <button
              onClick={() => { onSetDrawMode(false); setCreateMenuPos(null); onAddTask() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', fontSize: 12, border: 'none',
                background: 'transparent', textAlign: 'left', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAF7F2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Plus size={13} color="#1F1B17" />
              <div>
                <div style={{ fontWeight: 500, color: '#1F1B17' }}>Via la modale</div>
                <div style={{ fontSize: 10, color: '#9C9591' }}>Remplir le formulaire</div>
              </div>
            </button>

            <div style={{ height: '0.5px', background: '#E9E2D6' }} />

            <button
              onClick={() => { onSetDrawMode(true); setCreateMenuPos(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', fontSize: 12, border: 'none',
                background: 'transparent', textAlign: 'left', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAF7F2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Pencil size={13} color="#E8602C" />
              <div>
                <div style={{ fontWeight: 500, color: '#1F1B17' }}>Dessiner dans le planning</div>
                <div style={{ fontSize: 10, color: '#9C9591' }}>Cliquer-glisser sur une ligne</div>
              </div>
            </button>
          </div>
        </>,
        document.body
      )}

      {exportMenuPos && createPortal(
        <>
          <div
            onClick={() => setExportMenuPos(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
          />
          <div style={{
            position: 'fixed', top: exportMenuPos.top, left: exportMenuPos.left,
            background: 'white', border: '0.5px solid #E9E2D6', zIndex: 999,
            minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            <button
              onClick={() => { setExportMenuPos(null); onExportPdf() }}
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
              onClick={() => { setExportMenuPos(null); onExportExcel() }}
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
        </>,
        document.body
      )}
    </header>
  )
}
