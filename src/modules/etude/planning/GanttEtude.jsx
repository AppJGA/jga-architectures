import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { supabase } from '../../../core/supabase/client'
import { propagateEtudeDependencies, computeLagSemaines, addWeeks, weeksBetween, getCurrentWeek } from './types'
import { computeCriticalPath } from './computeCriticalPath'
import { usePlanningEtude } from '../../../shared/hooks/usePlanningEtude'
import { useNotionSync, etudePhaseToNotion } from '../../../shared/hooks/useNotionSync'
import { GanttEtudeToolbar } from './GanttEtudeToolbar'
import { GanttEtudeSidebar } from './GanttEtudeSidebar'
import { GanttEtudeTimeline } from './GanttEtudeTimeline'
import { PhaseEtudeModal } from './PhaseEtudeModal'
import { JalonEtudeModal } from './JalonEtudeModal'
import { ExportEtudeModal } from './ExportEtudeModal'
import { Toast } from '../../../shared/components/Toast'

export function GanttEtude({ affaireId, affaireNumero = '', affaireTitre = '', affaire = {} }) {
  const { phases: hookPhases, jalons, loading, error, addPhase, updatePhase, deletePhase, refetch } = usePlanningEtude(affaireId)

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

  const [semWidth, setSemWidth] = useState(40)
  const [showConnections, setShowConnections] = useState(true)
  const [editingPhase, setEditingPhase] = useState(null)
  const [showPhaseModal, setShowPhaseModal] = useState(false)
  const [phaseModalMode, setPhaseModalMode] = useState('edit')
  const [showJalonsModal, setShowJalonsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

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
              newSem, newAnn
            ),
          }
        }
      }

      const cascades   = propagateEtudeDependencies(prev, phaseId, newSem, newAnn, newDuree)
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
  }, [persistUpdates, notionSync.pushToNotion])

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
          onZoomIn={() => setSemWidth(w => Math.min(80, w + 4))}
          onZoomOut={() => setSemWidth(w => Math.max(16, w - 4))}
          onExportPdf={() => setShowExportModal(true)}
          onAddTask={() => { setEditingPhase(null); setPhaseModalMode('create'); setShowPhaseModal(true) }}
          onOpenJalons={() => setShowJalonsModal(true)}
          onToggleConnections={() => setShowConnections(v => !v)}
          showConnections={showConnections}
          semWidth={semWidth}
          notionEnabled={notionSync.notionEnabled}
          notionConnected={notionSync.notionConnected}
          onToggleNotion={notionSync.toggleNotion}
        />
      </div>

      <div id="gantt-etude-print-root" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
          />
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
        onClose={() => setShowPhaseModal(false)}
        phase={editingPhase}
        phases={phases}
        onSave={handleSavePhase}
        onDelete={handleDeletePhase}
        mode={phaseModalMode}
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
