import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from '../../../core/supabase/client'
import {
  propagateEtudeDependencies, computeLagSemaines, addWeeks, weeksBetween, getCurrentWeek,
  getNextAvailableSemaine,
} from './types'
import { computeCriticalPath } from './computeCriticalPath'
import { usePlanningEtude } from '../../../shared/hooks/usePlanningEtude'
import { usePlanningEtudeSegments } from '../../../shared/hooks/usePlanningEtudeSegments'
import { usePeriodesBloquees } from '../../../shared/hooks/usePeriodesBloquees'
import { useNotionSync, etudePhaseToNotion } from '../../../shared/hooks/useNotionSync'
import { GanttEtudeToolbar } from './GanttEtudeToolbar'
import { GanttEtudeSidebar } from './GanttEtudeSidebar'
import { GanttEtudeTimeline } from './GanttEtudeTimeline'
import { PhaseEtudeModal } from './PhaseEtudeModal'
import { JalonEtudeModal } from './JalonEtudeModal'
import { ExportEtudeModal } from './ExportEtudeModal'
import { PeriodesBloqueesModal } from '../../chantier/planning/PeriodesBloqueesModal'
import { exportPlanningEtudeExcel } from './exportPlanningEtudeExcel'
import { Toast } from '../../../shared/components/Toast'

// Bornes de zoom (largeur d'une colonne semaine, en px)
const SEM_WIDTH_MIN = 16
const SEM_WIDTH_MAX = 80

export function GanttEtude({ affaireId, affaireNumero = '', affaireTitre = '', affaire = {} }) {
  const { phases: hookPhases, jalons, loading, error, addPhase, updatePhase, deletePhase, refetch } = usePlanningEtude(affaireId)

  // ── Segments (une phase peut réapparaître à d'autres périodes) ────────────────
  const {
    segments, addSegment, updateSegment, updateSegmentLocal, deleteSegment, getSegmentsForPhase,
  } = usePlanningEtudeSegments(affaireId)

  // ── Périodes (congés, fermetures…) — mêmes hook et modale que le chantier ─────
  const { periodes, addPeriode, updatePeriode, deletePeriode } = usePeriodesBloquees(affaireId)

  // ── Notion sync ───────────────────────────────────────────────────────────────
  const notionSync     = useNotionSync(affaireId)
  const notionIdMapRef = useRef(new Map())   // supabase phase.id → notion page id
  const [notionToast, setNotionToast] = useState(false)

  // ── Local optimistic state (fusionne Supabase + Notion) ───────────────────────
  const [phases, setPhases] = useState([])

  useEffect(() => {
    if (notionSync.notionEnabled && notionSync.notionPhases.length > 0) {
      // Construire la map supabase id → notion id
      const map = new Map()
      notionSync.notionPhases.forEach(np => {
        const match = hookPhases.find(p =>
          (np._codePhase && p.nom?.toLowerCase().includes(np._codePhase.toLowerCase())) ||
          p.ordre === np.ordre
        )
        if (match && np.notion_id) map.set(match.id, np.notion_id)
      })
      notionIdMapRef.current = map

      // Ajouter uniquement les phases Notion sans équivalent en Supabase
      const unmatched = notionSync.notionPhases.filter(np =>
        !hookPhases.some(p =>
          (np._codePhase && p.nom?.toLowerCase().includes(np._codePhase.toLowerCase())) ||
          p.ordre === np.ordre
        )
      )
      setPhases([...hookPhases, ...unmatched])
    } else {
      setPhases(hookPhases)
    }
  }, [hookPhases, notionSync.notionEnabled, notionSync.notionPhases])

  // Toast quand une mise à jour Notion arrive via WS
  useEffect(() => {
    if (!notionSync.lastUpdateAt) return
    setNotionToast(true)
  }, [notionSync.lastUpdateAt])

  // ── CPM (chemin critique, recalculé après chaque changement de phases) ────────
  const criticalIds = useMemo(() => computeCriticalPath(phases), [phases])

  // ── Phases triées par ordre — passées aux deux sous-composants ────────────────
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [phases]
  )

  // ── Semaine de référence — recalculée dynamiquement avec -4 sem de marge ──────
  const refDate = useMemo(() => {
    if (phases.length === 0) {
      const cw = getCurrentWeek()
      return addWeeks(cw.semaine, cw.annee, -4)
    }
    let minSemaine = phases[0].semaine_debut
    let minAnnee   = phases[0].annee_debut
    phases.forEach(p => {
      if (p.annee_debut < minAnnee ||
        (p.annee_debut === minAnnee && p.semaine_debut < minSemaine)) {
        minSemaine = p.semaine_debut
        minAnnee   = p.annee_debut
      }
    })
    return addWeeks(minSemaine, minAnnee, -4)
  }, [phases])

  // Semaine proposée à la création : la première libre après la dernière phase,
  // périodes bloquantes déduites.
  const prochaineSemaine = useMemo(
    () => getNextAvailableSemaine(phases, periodes),
    [phases, periodes]
  )

  const [semWidth, setSemWidth] = useState(40)
  const [showConnections, setShowConnections] = useState(true)
  const [editingPhase, setEditingPhase] = useState(null)
  const [showPhaseModal, setShowPhaseModal] = useState(false)
  const [phaseModalMode, setPhaseModalMode] = useState('edit')
  const [showJalonsModal, setShowJalonsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showPeriodesModal, setShowPeriodesModal] = useState(false)
  const [showOptionsPanel, setShowOptionsPanel] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [createDefaults, setCreateDefaults] = useState(null)

  const handleNewPhase = useCallback(() => {
    setCreateDefaults(null)
    setEditingPhase(null)
    setPhaseModalMode('create')
    setShowPhaseModal(true)
  }, [])

  // Fin du geste de dessin : ouvre la modale de création pré-remplie. `drawMode`
  // reste actif pour enchaîner plusieurs créations (comme le planning chantier).
  const handleDrawCreate = useCallback((plage) => {
    setCreateDefaults(plage)
    setEditingPhase(null)
    setPhaseModalMode('create')
    setShowPhaseModal(true)
  }, [])

  // Échap quitte le mode dessin
  useEffect(() => {
    if (!drawMode) return
    const handleKey = (e) => { if (e.key === 'Escape') setDrawMode(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drawMode])

  // ── Scroll sync ───────────────────────────────────────────────────────────────
  const sidebarRef = useRef(null)
  const timelineRef = useRef(null)
  const isScrolling = useRef(null)

  const syncScroll = useCallback((source, scrollTop) => {
    if (isScrolling.current && isScrolling.current !== source) return
    isScrolling.current = source
    if (source === 'sidebar' && timelineRef.current) timelineRef.current.scrollTop = scrollTop
    else if (source === 'timeline' && sidebarRef.current) sidebarRef.current.scrollTop = scrollTop
    requestAnimationFrame(() => { isScrolling.current = null })
  }, [])

  // Centrer la vue sur la semaine courante à chaque changement de refDate/zoom
  useEffect(() => {
    if (!timelineRef.current || phases.length === 0) return
    const cw = getCurrentWeek()
    const currentX = weeksBetween(refDate.semaine, refDate.annee, cw.semaine, cw.annee) * semWidth
    timelineRef.current.scrollLeft = Math.max(0, currentX - 8 * semWidth)
  }, [refDate.semaine, refDate.annee, semWidth])

  // ── Phase CRUD ─────────────────────────────────────────────────────────────────
  const handleSavePhase = useCallback(async (data) => {
    if (phaseModalMode === 'create') {
      await addPhase(data)
    } else {
      const { id, ...changes } = data
      await updatePhase(id ?? editingPhase?.id, changes)
    }
  }, [phaseModalMode, addPhase, updatePhase, editingPhase])

  const handleDeletePhase = useCallback(async (id) => {
    await deletePhase(id)
  }, [deletePhase])

  // ── Réordonnancement par drag & drop ─────────────────────────────────────────
  const handleReorder = useCallback(async (reorderedPhases) => {
    setPhases(reorderedPhases)
    try {
      await Promise.all(
        reorderedPhases.map(p =>
          supabase.from('planning_etude_phases').update({ ordre: p.ordre }).eq('id', p.id)
        )
      )
    } catch {
      await refetch()
    }
  }, [refetch])

  // ── Persist en arrière-plan (découplé du state updater) ──────────────────────
  const persistUpdates = useCallback(async (phaseId, changes, cascades) => {
    try {
      await supabase.from('planning_etude_phases').update(changes).eq('id', phaseId)
      if (cascades.length > 0) {
        await Promise.all(cascades.map(c =>
          supabase.from('planning_etude_phases')
            .update({ semaine_debut: c.semaine_debut, annee_debut: c.annee_debut })
            .eq('id', c.id)
        ))
      }
    } catch {
      await refetch()
    }
  }, [refetch])

  // ── Drag/resize avec cascade optimiste ────────────────────────────────────────
  const handlePhaseUpdate = useCallback((phaseId, changes) => {
    // Variables capturées depuis l'updater pour les effets de bord
    let capturedChanges  = changes
    let capturedCascades = []
    let capturedPhase    = null

    setPhases(prev => {
      const phase = prev.find(p => p.id === phaseId)
      if (!phase) return prev

      const newSem   = changes.semaine_debut  ?? phase.semaine_debut
      const newAnn   = changes.annee_debut    ?? phase.annee_debut
      const newDuree = changes.duree_semaines ?? phase.duree_semaines

      // Recalcul du lag quand l'enfant est déplacé manuellement
      let finalChanges = { ...changes }
      if (phase.depends_on && (changes.semaine_debut != null || changes.annee_debut != null)) {
        const parent = prev.find(p => p.id === phase.depends_on)
        if (parent) {
          finalChanges = {
            ...finalChanges,
            lag_semaines: computeLagSemaines(
              parent.semaine_debut, parent.annee_debut, parent.duree_semaines,
              newSem, newAnn, periodes
            ),
          }
        }
      }

      const cascades   = propagateEtudeDependencies(prev, phaseId, newSem, newAnn, newDuree, periodes)
      const cascadeMap = new Map(cascades.map(u => [u.id, u]))

      const next = prev.map(p => {
        if (p.id === phaseId) return { ...p, ...finalChanges }
        const c = cascadeMap.get(p.id)
        return c ? { ...p, semaine_debut: c.semaine_debut, annee_debut: c.annee_debut } : p
      })

      // Capture pour les effets hors updater
      capturedChanges  = finalChanges
      capturedCascades = cascades
      capturedPhase    = next.find(p => p.id === phaseId) ?? null
      return next
    })

    // Effets de bord APRÈS le state update — jamais dans l'updater
    persistUpdates(phaseId, capturedChanges, capturedCascades)

    const notionId = notionIdMapRef.current.get(phaseId)
    if (notionId && capturedPhase) {
      notionSync.pushToNotion(notionId, capturedPhase)
    }
  }, [persistUpdates, notionSync.pushToNotion, periodes])

  // ── Commit d'un segment après drag/resize dans la timeline ────────────────────
  const handleSegmentCommit = useCallback(async (segmentId, changes) => {
    await updateSegment(segmentId, changes)
  }, [updateSegment])

  // ── Export Excel ──────────────────────────────────────────────────────────────
  const handleExportExcel = useCallback(() => {
    exportPlanningEtudeExcel({
      phases: sortedPhases, segments, jalons, periodes, affaire,
      refSemaine: refDate.semaine, refAnnee: refDate.annee,
    })
  }, [sortedPhases, segments, jalons, periodes, affaire, refDate])

  // ── Dependencies ──────────────────────────────────────────────────────────────
  const handleDependencyCreate = useCallback(async (fromPhaseId, toPhaseId, lagSemaines) => {
    await supabase.from('planning_etude_phases')
      .update({ depends_on: fromPhaseId, lag_semaines: lagSemaines })
      .eq('id', toPhaseId)
    await refetch()
  }, [refetch])

  const handleDependencyDelete = useCallback(async (fromPhaseId, toPhaseId) => {
    await supabase.from('planning_etude_phases')
      .update({ depends_on: null, lag_semaines: 0 })
      .eq('id', toPhaseId)
    await refetch()
  }, [refetch])

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 52px)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF9' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #E8602C', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#9C9591' }}>Chargement du planning…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 52px)', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <p style={{ fontWeight: 500, color: '#B8412C', marginBottom: 6 }}>Erreur de chargement</p>
          <p style={{ fontSize: 13, color: '#9C9591', marginBottom: 12 }}>{error}</p>
          <button onClick={refetch} style={{ fontSize: 13, color: '#E8602C', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden', backgroundColor: '#FAFAF9' }}>
      <div data-print="hidden">
        <GanttEtudeToolbar
          onAddTask={handleNewPhase}
          drawMode={drawMode}
          onSetDrawMode={setDrawMode}
          onOpenPeriodes={() => setShowPeriodesModal(true)}
          periodes={periodes}
          onExportPdf={() => setShowExportModal(true)}
          onExportExcel={handleExportExcel}
          onOpenJalons={() => setShowJalonsModal(true)}
          onToggleConnections={() => setShowConnections(v => !v)}
          showConnections={showConnections}
          showOptionsPanel={showOptionsPanel}
          onToggleOptionsPanel={() => setShowOptionsPanel(v => !v)}
          notionEnabled={notionSync.notionEnabled}
          notionConnected={notionSync.notionConnected}
          onToggleNotion={notionSync.toggleNotion}
        />
      </div>

      <div id="gantt-etude-print-root" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <div
          ref={sidebarRef}
          onScroll={e => syncScroll('sidebar', e.target.scrollTop)}
          style={{
            width: 300, flexShrink: 0,
            overflowY: 'auto', overflowX: 'hidden',
            borderRight: '0.5px solid rgba(0,0,0,0.08)', backgroundColor: 'white',
            scrollbarWidth: 'none',
          }}
        >
          <GanttEtudeSidebar
            phases={sortedPhases}
            onEdit={p => { setEditingPhase(p); setPhaseModalMode('edit'); setShowPhaseModal(true) }}
            criticalIds={criticalIds}
            onReorder={handleReorder}
          />
        </div>

        {/* Timeline */}
        <div
          ref={timelineRef}
          onScroll={e => syncScroll('timeline', e.target.scrollTop)}
          style={{ flex: 1, overflow: 'auto' }}
        >
          <GanttEtudeTimeline
            phases={sortedPhases}
            semWidth={semWidth}
            showConnections={showConnections}
            jalons={jalons}
            onJalonClick={() => setShowJalonsModal(true)}
            onPhaseClick={p => { setEditingPhase(p); setPhaseModalMode('edit'); setShowPhaseModal(true) }}
            onPhaseUpdate={handlePhaseUpdate}
            onDependencyCreate={handleDependencyCreate}
            onDependencyDelete={handleDependencyDelete}
            criticalIds={criticalIds}
            refSemaine={refDate.semaine}
            refAnnee={refDate.annee}
            segments={segments}
            getSegmentsForPhase={getSegmentsForPhase}
            updateSegmentLocal={updateSegmentLocal}
            onSegmentCommit={handleSegmentCommit}
            periodes={periodes}
            drawMode={drawMode}
            onDrawCreate={handleDrawCreate}
          />
        </div>

        {/* ── Panneau latéral d'options ─────────────────────────────────────
            Glisse depuis la droite par-dessus la timeline, comme le planning
            chantier. Le planning d'étude n'a qu'une granularité (la semaine) :
            le panneau ne contient donc que le zoom. */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 280,
          backgroundColor: 'white',
          borderLeft: '0.5px solid #E9E2D6',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
          zIndex: 60,
          transform: showOptionsPanel ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '0.5px solid #E9E2D6', flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>
              Options d'affichage
            </span>
            <button
              onClick={() => setShowOptionsPanel(false)}
              style={{
                width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C9591',
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <p style={{
              fontSize: 10, fontWeight: 500, color: '#9C9591',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
            }}>
              Zoom
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setSemWidth(w => Math.max(SEM_WIDTH_MIN, w - 4))}
                style={{
                  width: 28, height: 28, border: '0.5px solid rgba(0,0,0,0.15)',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <ZoomOut size={13} />
              </button>

              <div
                style={{ flex: 1, height: 4, background: '#E9E2D6', borderRadius: 2, position: 'relative', cursor: 'pointer' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  setSemWidth(Math.round(SEM_WIDTH_MIN + ratio * (SEM_WIDTH_MAX - SEM_WIDTH_MIN)))
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: `${(semWidth - SEM_WIDTH_MIN) / (SEM_WIDTH_MAX - SEM_WIDTH_MIN) * 100}%`,
                  top: '50%', transform: 'translate(-50%, -50%)',
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#E8602C', border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>

              <button
                onClick={() => setSemWidth(w => Math.min(SEM_WIDTH_MAX, w + 4))}
                style={{
                  width: 28, height: 28, border: '0.5px solid rgba(0,0,0,0.15)',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <ZoomIn size={13} />
              </button>

              <span
                onDoubleClick={() => setSemWidth(40)}
                title="Double-clic pour réinitialiser"
                style={{
                  fontSize: 10, color: '#9C9591', minWidth: 44, textAlign: 'center',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {semWidth} px/s
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Légende ── */}
      <div data-print="hidden" style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16,
        padding: '7px 20px',
        borderTop: '0.5px solid rgba(0,0,0,0.08)',
        backgroundColor: 'white', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: '#9C9591',
          letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 4,
        }}>
          Légende
        </span>
        {[
          { color: '#E8A200', label: 'Phase MOE (ESQ, APS, APD…)' },
          { color: '#2A8A4E', label: 'Validation / Visa' },
          { color: '#D97706', label: 'Période administrative', dashed: true },
          { color: '#1B3A5C', label: 'Phase chantier' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 24, height: 10, borderRadius: 3,
              backgroundColor: item.dashed ? 'transparent' : item.color,
              border: item.dashed ? `1.5px dashed ${item.color}` : 'none',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: '#5E5854' }}>{item.label}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderLeft: '0.5px solid rgba(0,0,0,0.1)', paddingLeft: 12, marginLeft: 4,
        }}>
          {[
            { num: '1', label: 'Architecte' },
            { num: '2', label: 'BET' },
            { num: '3', label: 'Économiste' },
          ].map(item => (
            <div key={item.num} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 16, height: 16, borderRadius: 3,
                backgroundColor: 'rgba(232,162,0,0.18)', color: '#B07C00',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {item.num}
              </span>
              <span style={{ fontSize: 11, color: '#5E5854' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <PhaseEtudeModal
        open={showPhaseModal}
        onClose={() => { setShowPhaseModal(false); setCreateDefaults(null) }}
        phase={editingPhase}
        phases={phases}
        onSave={handleSavePhase}
        onDelete={handleDeletePhase}
        mode={phaseModalMode}
        defaultSemaine={prochaineSemaine}
        createDefaults={createDefaults}
        getSegmentsForPhase={getSegmentsForPhase}
        addSegment={addSegment}
        updateSegment={updateSegment}
        deleteSegment={deleteSegment}
      />

      <JalonEtudeModal
        open={showJalonsModal}
        onClose={() => setShowJalonsModal(false)}
        jalons={jalons}
        affaireId={affaireId}
        onRefetch={refetch}
      />

      <ExportEtudeModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        taches={phases}
        jalons={jalons}
        affaire={affaire}
        segments={segments}
        periodes={periodes}
      />

      <PeriodesBloqueesModal
        open={showPeriodesModal}
        onClose={() => setShowPeriodesModal(false)}
        periodes={periodes}
        addPeriode={addPeriode}
        updatePeriode={updatePeriode}
        deletePeriode={deletePeriode}
      />

      {notionToast && (
        <Toast
          message="↔ Notion synchronisé"
          duration={2000}
          onDone={() => setNotionToast(false)}
        />
      )}
    </div>
  )
}
