import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../../../core/supabase/client'
import { propagateEtudeDependencies, computeLagSemaines } from './types'
import { usePlanningEtude } from '../../../shared/hooks/usePlanningEtude'
import { GanttEtudeToolbar } from './GanttEtudeToolbar'
import { GanttEtudeSidebar } from './GanttEtudeSidebar'
import { GanttEtudeTimeline } from './GanttEtudeTimeline'
import { PhaseEtudeModal } from './PhaseEtudeModal'
import { JalonEtudeModal } from './JalonEtudeModal'
import { ExportEtudeModal } from './ExportEtudeModal'

export function GanttEtude({ affaireId, affaireNumero = '', affaireTitre = '' }) {
  const { phases: hookPhases, jalons, loading, error, addPhase, updatePhase, deletePhase, refetch } = usePlanningEtude(affaireId)

  // Local optimistic state
  const [phases, setPhases] = useState([])
  useEffect(() => setPhases(hookPhases), [hookPhases])

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

  // ── Cascade persist (fire-and-forget) ────────────────────────────────────────
  const persistCascadeUpdates = useCallback(async (primaryId, primaryChanges, cascadeUpdates) => {
    try {
      await supabase.from('planning_etude_phases').update(primaryChanges).eq('id', primaryId)
      if (cascadeUpdates.length > 0) {
        await Promise.all(cascadeUpdates.map(u =>
          supabase.from('planning_etude_phases')
            .update({ semaine_debut: u.semaine_debut, annee_debut: u.annee_debut })
            .eq('id', u.id)
        ))
      }
    } catch {
      await refetch()
    }
  }, [refetch])

  // ── Drag/resize with optimistic cascade ───────────────────────────────────────
  const handlePhaseUpdate = useCallback((phaseId, changes) => {
    setPhases(prev => {
      const phase = prev.find(p => p.id === phaseId)
      if (!phase) return prev

      const newSem = changes.semaine_debut ?? phase.semaine_debut
      const newAnn = changes.annee_debut ?? phase.annee_debut
      const newDuree = changes.duree_semaines ?? phase.duree_semaines

      // Recalculate lag when child is moved
      let finalChanges = { ...changes }
      if (phase.depends_on && (changes.semaine_debut != null || changes.annee_debut != null)) {
        const parent = prev.find(p => p.id === phase.depends_on)
        if (parent) {
          const newLag = computeLagSemaines(
            parent.semaine_debut, parent.annee_debut, parent.duree_semaines,
            newSem, newAnn
          )
          finalChanges = { ...finalChanges, lag_semaines: newLag }
        }
      }

      const cascadeUpdates = propagateEtudeDependencies(prev, phaseId, newSem, newAnn, newDuree)
      const cascadeMap = new Map(cascadeUpdates.map(u => [u.id, u]))

      const nextPhases = prev.map(p => {
        if (p.id === phaseId) return { ...p, ...finalChanges }
        if (cascadeMap.has(p.id)) return { ...p, ...cascadeMap.get(p.id) }
        return p
      })

      persistCascadeUpdates(phaseId, finalChanges, cascadeUpdates)
      return nextPhases
    })
  }, [persistCascadeUpdates])

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

  // ── Export PDF ────────────────────────────────────────────────────────────────
  const handleRequestPrint = useCallback(() => {
    setShowExportModal(false)
    const win = window.open('', '_blank')
    if (!win) { alert('Autorisez les pop-ups pour exporter en PDF.'); return }

    const styles = Array.from(document.styleSheets).map(ss => {
      try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n') } catch { return '' }
    }).join('\n')

    const ganttEl = document.getElementById('gantt-etude-print-root')
    const ganttHtml = ganttEl ? ganttEl.outerHTML : '<p>Planning non trouvé</p>'

    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Planning étude – ${affaireTitre}</title>
  <style>
    @page { size: A3 landscape; margin: 10mm 8mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { margin: 0; font-family: sans-serif; background: white; }
    ${styles}
    [data-print="hidden"] { display: none !important; }
    h2.print-title { font-size: 14pt; font-weight: 800; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 2px solid #E05A1E; }
    p.print-subtitle { font-size: 9pt; color: #666; margin: 0 0 6mm; }
  </style>
</head>
<body>
  <h2 class="print-title">Planning d'étude – ${affaireTitre}</h2>
  <p class="print-subtitle">${affaireNumero} · ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  ${ganttHtml}
  <script>window.onload = () => { window.print(); window.close(); }<\/script>
</body>
</html>`)
    win.document.close()
  }, [affaireTitre, affaireNumero])

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 52px)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF9' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #E05A1E', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#9B8F85' }}>Chargement du planning…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 52px)', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <p style={{ fontWeight: 500, color: '#DC2626', marginBottom: 6 }}>Erreur de chargement</p>
          <p style={{ fontSize: 13, color: '#9B8F85', marginBottom: 12 }}>{error}</p>
          <button onClick={refetch} style={{ fontSize: 13, color: '#E05A1E', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
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
            phases={phases}
            onEdit={p => { setEditingPhase(p); setPhaseModalMode('edit'); setShowPhaseModal(true) }}
          />
        </div>

        {/* Timeline */}
        <div
          ref={timelineRef}
          onScroll={e => syncScroll('timeline', e.target.scrollTop)}
          style={{ flex: 1, overflow: 'auto' }}
        >
          <GanttEtudeTimeline
            phases={phases}
            semWidth={semWidth}
            showConnections={showConnections}
            jalons={jalons}
            onJalonClick={() => setShowJalonsModal(true)}
            onPhaseClick={p => { setEditingPhase(p); setPhaseModalMode('edit'); setShowPhaseModal(true) }}
            onPhaseUpdate={handlePhaseUpdate}
            onDependencyCreate={handleDependencyCreate}
            onDependencyDelete={handleDependencyDelete}
          />
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
        affaireNumero={affaireNumero}
        affaireTitre={affaireTitre}
        onPrint={handleRequestPrint}
      />
    </div>
  )
}
