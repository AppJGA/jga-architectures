import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Pencil, GitBranch, Flag, Ban, SlidersHorizontal,
  Download, ChevronDown, FileText, TableProperties, RefreshCw,
} from 'lucide-react'

const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const SEPARATOR = {
  width: '0.5px', height: 20, background: '#E9E2D6', flexShrink: 0,
}
const MENU_ITEM = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '10px 14px', fontSize: 12, border: 'none',
  background: 'transparent', textAlign: 'left', cursor: 'pointer',
  color: '#1F1B17',
}

export function GanttEtudeToolbar({
  onAddTask, drawMode = false, onSetDrawMode,
  onOpenPeriodes, periodes = [],
  onExportPdf, onExportExcel,
  onOpenJalons, onToggleConnections, showConnections,
  showOptionsPanel, onToggleOptionsPanel,
  notionEnabled, notionConnected, onToggleNotion,
}) {
  // Dropdown rendu via portail : la toolbar a overflowX: 'auto', ce qui force
  // le rognage vertical — un menu en position absolute y serait coupé.
  const [exportMenuPos, setExportMenuPos] = useState(null)
  const [createMenuPos, setCreateMenuPos] = useState(null)
  const exportBtnRef = useRef(null)
  const createGroupRef = useRef(null)

  const nbBloquantes = periodes.filter(p => p.est_bloquante !== false).length
  const accentPeriodes = nbBloquantes > 0

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 12px', height: 44,
      borderBottom: '0.5px solid #E9E2D6', backgroundColor: 'white',
      overflowX: 'auto', flexWrap: 'nowrap', flexShrink: 0,
    }} data-print="hidden">

      {/* Création — bouton principal + choix du mode (modale ou dessin) */}
      <div ref={createGroupRef} style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
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
          {drawMode ? 'Dessiner…' : 'Nouvelle phase'}
        </button>

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

      <div style={SEPARATOR} />

      {/* Données du planning */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onOpenPeriodes}
          style={{
            ...BTN,
            backgroundColor: accentPeriodes ? '#FEF2F2' : periodes.length > 0 ? '#F5F2F0' : 'white',
            color: accentPeriodes ? '#B8412C' : '#374151',
            whiteSpace: 'nowrap',
          }}
          title={periodes.length > 0
            ? `${nbBloquantes} bloquante(s), ${periodes.length - nbBloquantes} informative(s)`
            : 'Gérer les périodes'}
        >
          <Ban size={13} />
          {periodes.length > 0 ? `${periodes.length} période(s)` : 'Périodes'}
        </button>

        <button style={{ ...BTN, whiteSpace: 'nowrap' }} onClick={onOpenJalons}>
          <Flag size={13} /> Jalons
        </button>

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
            flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          <Download size={13} />
          Exporter
          <ChevronDown size={11} />
        </button>
      </div>

      <div style={SEPARATOR} />

      {/* Dépendances */}
      <button
        onClick={onToggleConnections}
        style={{
          ...BTN,
          backgroundColor: showConnections ? 'rgba(232,96,44,0.12)' : 'white',
          borderColor: showConnections ? '#E8602C' : 'rgba(0,0,0,0.15)',
          color: showConnections ? '#E8602C' : '#5E5854',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
        title={showConnections ? 'Masquer les dépendances' : 'Afficher les dépendances'}
      >
        <GitBranch size={14} />
        Dépendances
      </button>

      {/* Sync Notion — propre au planning d'étude */}
      {onToggleNotion && (
        <>
          <div style={SEPARATOR} />
          <button
            onClick={onToggleNotion}
            title={notionEnabled ? 'Désactiver la sync Notion' : 'Activer la sync Notion'}
            style={{
              ...BTN,
              backgroundColor: notionEnabled ? '#F3F0FF' : 'white',
              borderColor: notionEnabled ? '#7C3AED' : 'rgba(0,0,0,0.15)',
              color: notionEnabled ? '#7C3AED' : '#374151',
              whiteSpace: 'nowrap', flexShrink: 0,
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
        </>
      )}

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
          flexShrink: 0, whiteSpace: 'nowrap',
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
              style={MENU_ITEM}
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
              style={MENU_ITEM}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAF7F2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Pencil size={13} color="#E8602C" />
              <div>
                <div style={{ fontWeight: 500, color: '#1F1B17' }}>Dessiner dans le planning</div>
                <div style={{ fontSize: 10, color: '#9C9591' }}>Cliquer-glisser sur les semaines</div>
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
              style={MENU_ITEM}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAF7F2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <FileText size={13} color="#E8602C" />
              Exporter en PDF
            </button>

            <div style={{ height: '0.5px', background: '#E9E2D6' }} />

            <button
              onClick={() => { setExportMenuPos(null); onExportExcel() }}
              style={MENU_ITEM}
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
