import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { parseDate, formatDateISO, applyLag, computeLag, addWorkingDays } from './types'
import { supabase } from '../../../core/supabase/client'
import { usePlanningZones } from '../../../shared/hooks/usePlanningZones'
import { usePlanningSegments } from '../../../shared/hooks/usePlanningSegments'
import { GanttToolbar } from './GanttToolbar'
import { GanttSidebar } from './GanttSidebar'
import { GanttTimeline, HEADER_HEIGHT } from './GanttTimeline'
import { TacheEditModal } from './TacheEditModal'
import { LotsColorModal } from './LotsColorModal'
import { ExportPdfModal } from './ExportPdfModal'
import { JalonModal } from './JalonModal'
import { ZonesModal } from './ZonesModal'

// ─── Propagation en cascade avec conservation du lag ─────────────────────────
//
// Règle : debut(enfant) = fin(parent) + lag_days(enfant)
//   - lag_days est calculé une seule fois à la création du lien
//   - il est conservé à chaque propagation ultérieure
//
function propagateDependencies(allTasks, changedTaskId, newDebut, newDuree) {
  const snapshot = new Map()
  allTasks.forEach((t) => snapshot.set(t.id, { ...t }))
  snapshot.set(changedTaskId, {
    ...snapshot.get(changedTaskId),
    debut: newDebut,
    duree: newDuree,
  })

  const updates = []
  const queue = [changedTaskId]
  const visited = new Set()

  while (queue.length > 0) {
    const parentId = queue.shift()
    if (visited.has(parentId)) continue
    visited.add(parentId)

    const parent = snapshot.get(parentId)
    snapshot.forEach((child) => {
      if (child.depends_on !== parentId) return
      const lag = child.lag_days ?? 0
      const newChildDebut = formatDateISO(applyLag(parseDate(parent.debut), parent.duree, lag))

      if (newChildDebut !== child.debut) {
        snapshot.set(child.id, { ...child, debut: newChildDebut })
        updates.push({ id: child.id, debut: newChildDebut })
        queue.push(child.id)
      }
    })
  }

  return updates
}

// ─── Prochaine date disponible (pour la création d'une nouvelle tâche) ────────
//
// Lendemain ouvré de la fin de la tâche qui se termine le plus tard.
//
function getNextAvailableDate(tasks) {
  if (!tasks || tasks.length === 0) return new Date()

  let maxEnd = null
  tasks.forEach((task) => {
    if (!task.debut) return
    const fin = addWorkingDays(parseDate(task.debut), (task.duree ?? 1) - 1)
    if (!maxEnd || fin > maxEnd) maxEnd = fin
  })

  if (!maxEnd) return new Date()
  return addWorkingDays(maxEnd, 1)
}

// ──────────────────────────────────────────────────────────────────────────────

export function GanttChart({ affaireId, affaireNumero = '', affaireTitre = '', affaire = {} }) {
  const [tasks, setTasks] = useState([])
  const [lots, setLots] = useState([])
  const [dayWidth, setDayWidth] = useState(40)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [jalons, setJalons] = useState([])

  const [editingTask, setEditingTask] = useState(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskModalMode, setTaskModalMode] = useState('edit')
  const [showLotsModal, setShowLotsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showJalonsModal, setShowJalonsModal] = useState(false)
  const [showZonesModal, setShowZonesModal] = useState(false)
  const [showConnections, setShowConnections] = useState(true)
  const [newTaskDebut, setNewTaskDebut] = useState(null)

  const [colorMode, setColorMode] = useState(
    () => localStorage.getItem(`planning-color-mode-${affaireId}`) ?? 'lot'
  )
  useEffect(() => {
    localStorage.setItem(`planning-color-mode-${affaireId}`, colorMode)
  }, [colorMode, affaireId])

  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem(`planning-view-mode-${affaireId}`) ?? 'day'
  )
  useEffect(() => {
    localStorage.setItem(`planning-view-mode-${affaireId}`, viewMode)
  }, [viewMode, affaireId])

  const [zoomLevel, setZoomLevel] = useState(
    () => parseFloat(localStorage.getItem(`planning-zoom-${affaireId}`) ?? '1')
  )
  useEffect(() => {
    localStorage.setItem(`planning-zoom-${affaireId}`, zoomLevel.toString())
  }, [zoomLevel, affaireId])

  const { zones, createZone, updateZone, deleteZone } = usePlanningZones(affaireId)
  const {
    segments, addSegment, updateSegment, updateSegmentLocal, deleteSegment, getSegmentsForTache,
  } = usePlanningSegments(affaireId)

  const ROW_HEIGHT = 40

  // ── Scroll sync ───────────────────────────────────────────────────────────────
  const sidebarRef = useRef(null)
  const timelineRef = useRef(null)
  const isScrolling = useRef(null)

  const syncScroll = useCallback((source, scrollTop) => {
    if (isScrolling.current && isScrolling.current !== source) return
    isScrolling.current = source
    if (source === 'sidebar' && timelineRef.current) {
      timelineRef.current.scrollTop = scrollTop
    } else if (source === 'timeline' && sidebarRef.current) {
      sidebarRef.current.scrollTop = scrollTop
    }
    requestAnimationFrame(() => { isScrolling.current = null })
  }, [])

  // ── Data fetching ──────────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [
      { data: resLots, error: lotsErr },
      { data: resTaches, error: tachesErr },
      { data: resJalons },
    ] = await Promise.all([
      supabase.from('lots').select('id, numero, nom, couleur, affaire_id').eq('affaire_id', affaireId).order('numero'),
      supabase.from('planning').select('*').eq('affaire_id', affaireId).order('id'),
      supabase.from('planning_jalons').select('*').eq('affaire_id', affaireId).order('date'),
    ])

    if (lotsErr || tachesErr) {
      setError(lotsErr?.message ?? tachesErr?.message ?? 'Erreur de chargement')
      setIsLoading(false)
      return
    }

    setLots((resLots ?? []).map((l) => ({
      ...l,
      num_lot: String(l.numero ?? '').padStart(2, '0'),
      couleur: l.couleur ?? '#E8602C',
    })))

    if (resTaches) {
      setTasks(resTaches.map((t) => ({
        ...t,
        debut: typeof t.debut === 'string' ? t.debut.split('T')[0] : formatDateISO(new Date(t.debut)),
        duree: Number(t.duree),
        avancement: Number(t.avancement ?? 0),
        lag_days: t.lag_days != null ? Number(t.lag_days) : 0,
      })))
    }
    setJalons(resJalons ?? [])
    setIsLoading(false)
  }, [affaireId])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  // ── Task save ─────────────────────────────────────────────────────────────────
  const handleSaveTask = async (taskData) => {
    const payload = {
      num_tache: taskData.num_tache,
      nom: taskData.nom,
      debut: taskData.debut,
      duree: taskData.duree,
      avancement: taskData.avancement ?? 0,
      lot_id: taskData.lot_id ?? null,
      zone_id: taskData.zone_id ?? null,
      depends_on: taskData.depends_on ?? null,
      lag_days: taskData.lag_days ?? 0,
      affaire_id: affaireId,
      appro_actif: taskData.appro_actif ?? false,
      appro_duree: taskData.appro_actif ? (taskData.appro_duree ?? null) : null,
      appro_materiau: taskData.appro_actif ? (taskData.appro_materiau ?? null) : null,
    }
    if (taskModalMode === 'create') {
      const { error } = await supabase.from('planning').insert([payload])
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('planning').update(payload).eq('id', taskData.id)
      if (error) throw new Error(error.message)

      // Propager le chemin critique si la date/durée a changé depuis la modale
      const cascadeUpdates = propagateDependencies(tasks, taskData.id, payload.debut, payload.duree)
      if (cascadeUpdates.length > 0) {
        await Promise.all(
          cascadeUpdates.map((u) => supabase.from('planning').update({ debut: u.debut }).eq('id', u.id))
        )
      }
    }
    await fetchAllData()
  }

  // ── Task delete ────────────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from('planning').delete().eq('id', taskId)
    if (error) throw new Error(error.message)
    await fetchAllData()
  }

  // ── Dépendances ────────────────────────────────────────────────────────────────
  const handleDependencyCreate = useCallback(async (fromTaskId, toTaskId, lagDays) => {
    setTasks((prev) => prev.map((t) =>
      t.id === toTaskId ? { ...t, depends_on: fromTaskId, lag_days: lagDays } : t
    ))
    const { error } = await supabase
      .from('planning')
      .update({ depends_on: fromTaskId, lag_days: lagDays })
      .eq('id', toTaskId)
    if (error) { console.error('Dependency create failed:', error.message); await fetchAllData() }
  }, [fetchAllData])

  const handleDependencyDelete = useCallback(async (fromTaskId, toTaskId) => {
    setTasks((prev) => prev.map((t) =>
      t.id === toTaskId && t.depends_on === fromTaskId
        ? { ...t, depends_on: null, lag_days: 0 }
        : t
    ))
    const { error } = await supabase
      .from('planning')
      .update({ depends_on: null, lag_days: 0 })
      .eq('id', toTaskId)
    if (error) { console.error('Dependency delete failed:', error.message); await fetchAllData() }
  }, [fetchAllData])

  // ── Drag/resize avec propagation en cascade ────────────────────────────────────
  const handleTaskUpdate = useCallback(async (taskId, changes) => {
    setTasks((prevTasks) => {
      const movedTask = prevTasks.find((t) => t.id === taskId)
      if (!movedTask) return prevTasks

      const newDebut = changes.debut ?? movedTask.debut
      const newDuree = changes.duree ?? movedTask.duree

      // Si la tâche déplacée est un enfant (a une dépendance) et que son début change,
      // recalculer le lag depuis la position actuelle de sa parente et le persister.
      let finalChanges = changes
      if (movedTask.depends_on && changes.debut) {
        const parentTask = prevTasks.find((t) => t.id === movedTask.depends_on)
        if (parentTask) {
          const newLag = computeLag(parseDate(parentTask.debut), parentTask.duree, parseDate(newDebut))
          finalChanges = { ...changes, lag_days: newLag }
        }
      }

      const cascadeUpdates = propagateDependencies(prevTasks, taskId, newDebut, newDuree)

      const updatedMap = new Map([[taskId, newDebut]])
      cascadeUpdates.forEach((u) => updatedMap.set(u.id, u.debut))

      const nextTasks = prevTasks.map((t) => {
        if (t.id === taskId) return { ...t, debut: newDebut, duree: newDuree, lag_days: finalChanges.lag_days ?? t.lag_days }
        const cascadedDebut = updatedMap.get(t.id)
        if (cascadedDebut) return { ...t, debut: cascadedDebut }
        return t
      })

      persistCascadeUpdates(taskId, finalChanges, cascadeUpdates)
      return nextTasks
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAllData])

  const persistCascadeUpdates = useCallback(async (taskId, changes, cascadeUpdates) => {
    const { error: mainErr } = await supabase.from('planning').update(changes).eq('id', taskId)
    if (mainErr) { console.error('Task update failed:', mainErr.message); await fetchAllData(); return }

    if (cascadeUpdates.length > 0) {
      const results = await Promise.all(
        cascadeUpdates.map((u) =>
          supabase.from('planning').update({ debut: u.debut }).eq('id', u.id)
        )
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) { console.error('Cascade update failed:', failed.error.message); await fetchAllData() }
    }
  }, [fetchAllData])

  // ── Avancement inline ─────────────────────────────────────────────────────────
  const handleAvancementChange = useCallback(async (taskId, value) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, avancement: value } : t))
    await supabase.from('planning').update({ avancement: value }).eq('id', taskId)
  }, [])

  // ── Lots save (couleurs uniquement) ──────────────────────────────────────────
  const handleSaveLots = async (colorDrafts) => {
    await Promise.all(
      colorDrafts.map((d) =>
        supabase.from('lots').update({ couleur: d.couleur }).eq('id', d.id)
      )
    )
    await fetchAllData()
  }

  // ── Export Excel ──────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    const rows = [[
      'Lot', 'N°', 'Tâche', 'Date début', 'Durée (j)', 'Date fin',
      'Avancement (%)', 'Zone', 'Dépend de', 'Statut',
    ]]

    const sorted = [...tasks].sort((a, b) => {
      const lotA = lots.find((l) => l.id === a.lot_id)?.numero ?? 0
      const lotB = lots.find((l) => l.id === b.lot_id)?.numero ?? 0
      if (lotA !== lotB) return lotA - lotB
      return (a.num_tache ?? '').localeCompare(b.num_tache ?? '')
    })

    sorted.forEach((task) => {
      const lot = lots.find((l) => l.id === task.lot_id)
      const zone = zones.find((z) => z.id === task.zone_id)
      const dependDe = tasks.find((t) => t.id === task.depends_on)
      const fin = addWorkingDays(parseDate(task.debut), task.duree ?? 0)
      const statut = task.avancement >= 100 ? 'Terminé' : task.avancement > 0 ? 'En cours' : 'À venir'

      rows.push([
        lot?.nom ?? '',
        task.num_tache ?? '',
        task.nom ?? '',
        task.debut ?? '',
        task.duree ?? 0,
        formatDateISO(fin),
        task.avancement ?? 0,
        zone?.nom ?? '',
        dependDe?.nom ?? '',
        statut,
      ])

      const segs = getSegmentsForTache ? getSegmentsForTache(task.id) : []
      segs.forEach((seg, idx) => {
        const segZone = zones.find((z) => z.id === seg.zone_id)
        const segFin = addWorkingDays(parseDate(seg.date_debut), seg.duree_jours ?? 0)
        rows.push([
          '',
          `${task.num_tache ?? ''}.${idx + 1}`,
          `↳ ${task.nom} (segment)`,
          seg.date_debut,
          seg.duree_jours,
          formatDateISO(segFin),
          '',
          segZone?.nom ?? '',
          '',
          '',
        ])
      })
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 20 }, // Lot
      { wch: 8 },  // N°
      { wch: 35 }, // Tâche
      { wch: 12 }, // Date début
      { wch: 10 }, // Durée
      { wch: 12 }, // Date fin
      { wch: 14 }, // Avancement
      { wch: 15 }, // Zone
      { wch: 20 }, // Dépend de
      { wch: 12 }, // Statut
    ]

    const jalonsRows = [['Jalon', 'Date', 'Couleur']]
    jalons.forEach((j) => {
      jalonsRows.push([j.label ?? '', j.date ?? '', j.couleur ?? ''])
    })
    const wsJalons = XLSX.utils.aoa_to_sheet(jalonsRows)
    wsJalons['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }]

    XLSX.utils.book_append_sheet(wb, ws, 'Planning')
    XLSX.utils.book_append_sheet(wb, wsJalons, 'Jalons')

    const nomAffaire = affaire?.nom ?? affaire?.code_affaire ?? 'planning'
    const date = formatDateISO(new Date())

    XLSX.writeFile(wb, `Planning_${nomAffaire}_${date}.xlsx`)
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────────
  const handleZoomIn = () => setDayWidth((w) => Math.min(100, w + 5))
  const handleZoomOut = () => setDayWidth((w) => Math.max(15, w - 5))

  // ── Render ────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{
        display: 'flex', height: 'calc(100vh - 52px)',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FAFAF9',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid #E8602C', borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite',
          }} />
          <span style={{ fontSize: 13, color: '#9C9591' }}>Chargement du planning…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', height: 'calc(100vh - 52px)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 360, textAlign: 'center' }}>
          <p style={{ fontWeight: 500, color: '#B8412C' }}>Erreur de chargement</p>
          <p style={{ fontSize: 13, color: '#9C9591' }}>{error}</p>
          <button onClick={fetchAllData} style={{ fontSize: 13, color: '#E8602C', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 52px)', overflow: 'hidden',
      backgroundColor: '#FAFAF9',
    }}>
      <div data-print="hidden">
        <GanttToolbar
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onOpenLots={() => setShowLotsModal(true)}
          onExportPdf={() => setShowExportModal(true)}
          onExportExcel={handleExportExcel}
          onAddTask={() => {
            setEditingTask(null)
            setTaskModalMode('create')
            setNewTaskDebut(formatDateISO(getNextAvailableDate(tasks)))
            setShowTaskModal(true)
          }}
          onToggleConnections={() => setShowConnections((v) => !v)}
          showConnections={showConnections}
          onOpenJalons={() => setShowJalonsModal(true)}
          dayWidth={dayWidth}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          onOpenZones={() => setShowZonesModal(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          zoomLevel={zoomLevel}
          onZoomLevelChange={setZoomLevel}
        />
      </div>

      <div id="gantt-print-root" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div
          ref={sidebarRef}
          onScroll={(e) => syncScroll('sidebar', e.target.scrollTop)}
          style={{
            width: 320, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
            borderRight: '0.5px solid rgba(0,0,0,0.08)', backgroundColor: 'white',
            scrollbarWidth: 'none',
          }}
        >
          <GanttSidebar
            tasks={tasks}
            lots={lots}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            onEdit={(t) => {
              setEditingTask(t)
              setTaskModalMode('edit')
              setShowTaskModal(true)
            }}
            onAvancementChange={handleAvancementChange}
            zones={zones}
            colorMode={colorMode}
          />
        </div>

        <div
          ref={timelineRef}
          onScroll={(e) => syncScroll('timeline', e.target.scrollTop)}
          style={{ flex: 1, overflow: 'auto' }}
        >
          <GanttTimeline
            tasks={tasks}
            lots={lots}
            dayWidth={dayWidth}
            rowHeight={ROW_HEIGHT}
            showConnections={showConnections}
            jalons={jalons}
            onJalonClick={() => setShowJalonsModal(true)}
            onTaskClick={(t) => {
              setEditingTask(t)
              setTaskModalMode('edit')
              setShowTaskModal(true)
            }}
            onTaskUpdate={handleTaskUpdate}
            onDependencyCreate={handleDependencyCreate}
            onDependencyDelete={handleDependencyDelete}
            zones={zones}
            colorMode={colorMode}
            viewMode={viewMode}
            zoomLevel={zoomLevel}
            getSegmentsForTache={getSegmentsForTache}
            segments={segments}
            updateSegment={updateSegment}
            updateSegmentLocal={updateSegmentLocal}
          />
        </div>
      </div>

      <div data-print="hidden" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
        padding: '8px 16px', backgroundColor: 'white',
        borderTop: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0,
      }}>
        {colorMode === 'lot'
          ? lots.map((lot) => (
              <div key={lot.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#5E5854' }}>
                <div style={{ width: 16, height: 10, background: lot.couleur }} />
                {lot.num_lot} – {lot.nom}
              </div>
            ))
          : [
              ...zones.map((zone) => (
                <div key={zone.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#5E5854' }}>
                  <div style={{ width: 16, height: 10, background: zone.couleur }} />
                  {zone.nom}
                </div>
              )),
              <div key="no-zone" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9C9591' }}>
                <div style={{ width: 16, height: 10, background: '#C9C4C0' }} />
                Sans zone
              </div>,
            ]}
      </div>

      <TacheEditModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        task={editingTask}
        tasks={tasks}
        lots={lots}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        mode={taskModalMode}
        zones={zones}
        colorMode={colorMode}
        defaultDebut={newTaskDebut}
        getSegmentsForTache={getSegmentsForTache}
        addSegment={addSegment}
        updateSegment={updateSegment}
        deleteSegment={deleteSegment}
      />

      <ZonesModal
        open={showZonesModal}
        onClose={() => setShowZonesModal(false)}
        zones={zones}
        createZone={createZone}
        updateZone={updateZone}
        deleteZone={deleteZone}
      />

      <LotsColorModal
        open={showLotsModal}
        onClose={() => setShowLotsModal(false)}
        lots={lots}
        onSave={handleSaveLots}
      />

      <ExportPdfModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        lots={lots}
        tasks={tasks}
        jalons={jalons}
        affaire={affaire}
        zones={zones}
        colorMode={colorMode}
        viewMode={viewMode}
      />

      <JalonModal
        open={showJalonsModal}
        onClose={() => setShowJalonsModal(false)}
        jalons={jalons}
        affaireId={affaireId}
        onRefetch={fetchAllData}
      />
    </div>
  )
}
