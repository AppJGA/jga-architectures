import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Trash2, X, ZoomIn, ZoomOut, Calendar, Eye, Layers, Palette } from 'lucide-react'
import * as XLSX from 'xlsx-js-style'
import { parseDate, formatDateISO, computeLag, addWorkingDays } from './types'
import { propagateAllDependencies, endDateChanged, entityKey } from './propagation'
import { supabase } from '../../../core/supabase/client'
import { usePlanningZones } from '../../../shared/hooks/usePlanningZones'
import { usePlanningSegments } from '../../../shared/hooks/usePlanningSegments'
import { usePlanningDependances } from '../../../shared/hooks/usePlanningDependances'
import { usePeriodesBloquees } from '../../../shared/hooks/usePeriodesBloquees'
import { GanttToolbar } from './GanttToolbar'
import { GanttSidebar } from './GanttSidebar'
import { GanttTimeline, HEADER_HEIGHT } from './GanttTimeline'
import { TacheEditModal } from './TacheEditModal'
import { LotsColorModal } from './LotsColorModal'
import { ExportPdfModal } from './ExportPdfModal'
import { JalonModal } from './JalonModal'
import { ZonesModal } from './ZonesModal'
import { PeriodesBloqueesModal } from './PeriodesBloqueesModal'

// ─── Lignes d'affichage en groupement "Par zone" ──────────────────────────────
//
// Une tâche peut apparaître sur plusieurs lignes en mode zone : une ligne
// « principale » dans son propre groupe de zone (barre + ses segments non
// zonés/zonés-ici), et une ligne « dupliquée » (segments seulement, pas de
// barre principale) dans chaque autre zone où l'un de ses segments est placé.
//
// Note : contrairement au comportement « Par lot » (calculé directement par
// GanttSidebar/GanttTimeline à partir de `tasks`+`lots`), ce mode précalcule
// un tableau `rows` consommé tel quel par les deux composants — voir leur
// prop `rows` (`null` = comportement par lot inchangé).
function buildRowsByZone(tasks, zones, segments) {
  const rows = []

  // ── Groupe « Sans zone » en premier — tâches sans zone_id ──────────────────
  // (leurs segments zonés apparaîtront en ligne dupliquée dans leur zone respective)
  const tachesSansZone = tasks.filter((t) => t.zone_id == null)

  if (tachesSansZone.length > 0) {
    rows.push({
      type: 'header-zone',
      id: 'header-sans-zone',
      zoneId: null,
      displayName: 'Sans zone',
      couleur: '#C9C4C0',
    })
    tachesSansZone.forEach((task, idx) => {
      rows.push({
        type: 'task-row',
        id: `task-${task.id}-no-zone`,
        task,
        zoneId: null,
        lotId: task.lot_id,
        showMainBar: true,
        visibleSegmentIds: segments
          .filter((s) => s.tache_id === task.id && !s.zone_id)
          .map((s) => s.id),
        displayName: task.nom,
        numero: String(idx + 1).padStart(2, '0'),
      })
    })
  }

  // ── Un groupe par zone ──────────────────────────────────────────────────────
  zones.forEach((zone) => {
    const rowsDeZone = []
    let numeroIdx = 0

    tasks.forEach((task) => {
      const taskInZone = task.zone_id === zone.id
      const segsInZone = segments.filter((s) => s.tache_id === task.id && s.zone_id === zone.id)

      if (!taskInZone && segsInZone.length === 0) return
      numeroIdx++

      if (taskInZone) {
        // Ligne principale : barre tâche + ses segments de cette zone ou non zonés
        const segsVisibles = segments
          .filter((s) => s.tache_id === task.id && (s.zone_id === zone.id || !s.zone_id))
          .map((s) => s.id)

        rowsDeZone.push({
          type: 'task-row',
          id: `task-${task.id}-zone-${zone.id}`,
          task,
          zoneId: zone.id,
          lotId: task.lot_id,
          showMainBar: true,
          visibleSegmentIds: segsVisibles,
          displayName: task.nom,
          numero: String(numeroIdx).padStart(2, '0'),
        })
      } else {
        // Ligne dupliquée : uniquement les segments de cette tâche placés dans cette
        // zone (pas de barre principale, déjà affichée ailleurs — Sans zone ou sa
        // propre zone). Nom affiché = nom propre du 1er segment sinon nom de la tâche.
        const nomAffiche = segsInZone[0]?.nom ?? task.nom

        rowsDeZone.push({
          type: 'task-row',
          id: `task-${task.id}-seg-zone-${zone.id}`,
          task,
          zoneId: zone.id,
          lotId: task.lot_id,
          showMainBar: false,
          visibleSegmentIds: segsInZone.map((s) => s.id),
          displayName: nomAffiche,
          numero: String(numeroIdx).padStart(2, '0'),
        })
      }
    })

    if (rowsDeZone.length === 0) return

    rows.push({
      type: 'header-zone',
      id: `header-zone-${zone.id}`,
      zoneId: zone.id,
      displayName: zone.nom,
      couleur: zone.couleur,
    })
    rows.push(...rowsDeZone)
  })

  return rows
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

// ── Teinte pastel pour Excel ──────────────────────────────────────────────────
//
// xlsx-js-style ne gère pas la transparence : on simule l'opacité en mélangeant
// la couleur avec du blanc. `ratio` = part de la couleur d'origine (0 → blanc).
function pastel(hex, ratio) {
  const h = (hex || '#B8412C').replace('#', '')
  const melange = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16)
    return Math.round(255 - (255 - c) * ratio).toString(16).padStart(2, '0')
  }
  return `${melange(0)}${melange(2)}${melange(4)}`.toUpperCase()
}

// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_DAY_WIDTH = 40

// ── Bornes de zoom ──────────────────────────────────────────────────────────────
// Vue jour : `dayWidth` est un pixel/jour brut. Vues semaine/mois : `zoomLevel`
// est un facteur multiplicatif appliqué à WEEK_WIDTH_BASE/MONTH_WIDTH_BASE.
const DAY_WIDTH_MIN = 4
const DAY_WIDTH_MAX = 100
const ZOOM_LEVEL_MIN = 0.1
const ZOOM_LEVEL_MAX = 4

export function GanttChart({ affaireId, affaireNumero = '', affaireTitre = '', affaire = {} }) {
  const [tasks, setTasks] = useState([])
  const [lots, setLots] = useState([])
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH)
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
  const [showPeriodesModal, setShowPeriodesModal] = useState(false)
  const [showConnections, setShowConnections] = useState(true)
  const [newTaskDebut, setNewTaskDebut] = useState(null)
  const [lastUsedLotId, setLastUsedLotId] = useState(null)
  const [deletingTask, setDeletingTask] = useState(null)
  const [dragOverTaskId, setDragOverTaskId] = useState(null)
  const [showOptionsPanel, setShowOptionsPanel] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [createDefaults, setCreateDefaults] = useState(null)
  const savedScrollRef = useRef(0)

  const [colorMode, setColorMode] = useState(
    () => localStorage.getItem(`planning-color-mode-${affaireId}`) ?? 'lot'
  )
  useEffect(() => {
    localStorage.setItem(`planning-color-mode-${affaireId}`, colorMode)
  }, [colorMode, affaireId])

  const [groupMode, setGroupMode] = useState(
    () => localStorage.getItem(`planning-group-mode-${affaireId}`) ?? 'lot'
  )
  useEffect(() => {
    localStorage.setItem(`planning-group-mode-${affaireId}`, groupMode)
  }, [groupMode, affaireId])

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
  const { dependances, addDependance, deleteDependance } = usePlanningDependances(affaireId)
  const {
    periodes, addPeriode, updatePeriode, deletePeriode, getNextWorkingDay, addWorkingDaysWithBlocked,
  } = usePeriodesBloquees(affaireId)

  const ROW_HEIGHT = 40

  // ── Ordre d'affichage (lot puis `ordre` au sein du lot) ─────────────────────────
  // La sidebar et la timeline doivent itérer les tâches dans le même ordre pour
  // que leurs lignes restent alignées ; `tasks` brut (ordre de fetch) reste utilisé
  // pour les opérations CRUD (find/filter/update).
  const sortedTasks = useMemo(() => {
    const lotOrder = lots.map((l) => l.id)
    return [...tasks].sort((a, b) => {
      const lotA = lotOrder.indexOf(a.lot_id)
      const lotB = lotOrder.indexOf(b.lot_id)
      if (lotA !== lotB) return lotA - lotB
      return (a.ordre ?? 0) - (b.ordre ?? 0)
    })
  }, [tasks, lots])

  // ── Lignes d'affichage en mode "Par zone" (null en mode "Par lot", auquel cas
  // GanttSidebar/GanttTimeline conservent leur regroupement par lot habituel) ────
  const rows = useMemo(
    () => (groupMode === 'zone' ? buildRowsByZone(sortedTasks, zones, segments) : null),
    [groupMode, sortedTasks, zones, segments]
  )

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

  // ── Zoom molette (⌘/Ctrl + molette), centré sur le curseur ─────────────────────
  // En vue jour, la géométrie dépend de `dayWidth` ; en vue semaine/mois, de `zoomLevel`.
  const [showZoomToast, setShowZoomToast] = useState(false)
  const zoomToastTimer = useRef(null)

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return

    const handleWheel = (e) => {
      if (!e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()

      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const scrollRatio = el.scrollWidth > 0 ? (el.scrollLeft + cursorX) / el.scrollWidth : 0
      const delta = e.deltaY > 0 ? -1 : 1

      if (viewMode === 'day') {
        setDayWidth((w) => Math.min(DAY_WIDTH_MAX, Math.max(DAY_WIDTH_MIN, w + delta * 3)))
      } else {
        setZoomLevel((z) => Math.min(ZOOM_LEVEL_MAX, Math.max(ZOOM_LEVEL_MIN, Math.round((z + delta * 0.15) * 100) / 100)))
      }

      requestAnimationFrame(() => {
        if (timelineRef.current) {
          const newScrollLeft = scrollRatio * timelineRef.current.scrollWidth - cursorX
          timelineRef.current.scrollLeft = Math.max(0, newScrollLeft)
        }
      })

      setShowZoomToast(true)
      clearTimeout(zoomToastTimer.current)
      zoomToastTimer.current = setTimeout(() => setShowZoomToast(false), 1500)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  // `isLoading`/`error` : le composant retourne un spinner/écran d'erreur (sans le
  // div scrollable) tant que ces états sont actifs, donc `timelineRef.current` vaut
  // encore `null` lors du premier passage de cet effet — sans ces dépendances, il ne
  // se relance jamais une fois le vrai DOM monté et le listener n'est jamais attaché.
  }, [viewMode, isLoading, error])

  useEffect(() => () => clearTimeout(zoomToastTimer.current), [])

  // ── Pan (clic molette + glisser) ────────────────────────────────────────────────
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, scrollLeft: 0 })

  const handleTimelineMouseDown = useCallback((e) => {
    if (e.button !== 1) return
    e.preventDefault()
    if (!timelineRef.current) return
    panStartRef.current = { x: e.clientX, scrollLeft: timelineRef.current.scrollLeft }
    setIsPanning(true)
  }, [])

  useEffect(() => {
    if (!isPanning) return

    const handleMouseMove = (e) => {
      if (!timelineRef.current) return
      const dx = e.clientX - panStartRef.current.x
      timelineRef.current.scrollLeft = panStartRef.current.scrollLeft - dx
    }
    const handleMouseUp = (e) => {
      if (e.button !== 1) return
      setIsPanning(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning])

  // ── Mode dessin (créer une tâche par cliquer-glisser) — quitter avec Échap ─────
  useEffect(() => {
    if (!drawMode) return
    const handleKey = (e) => { if (e.key === 'Escape') setDrawMode(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drawMode])

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

  // ── Application et persistance d'une cascade ───────────────────────────────────
  //
  // `cascades` est une Map<cléEntité, { type, id, debut }> : une seule entrée par
  // entité, donc jamais deux écritures concurrentes sur la même ligne.

  // Mise à jour optimiste du state — appliquée AVANT toute écriture Supabase, en
  // un seul setTasks pour ne pas afficher d'état intermédiaire.
  const applyCascadeLocally = useCallback((cascades, ownChanges) => {
    setTasks((prev) => prev.map((t) => {
      const own = ownChanges?.[t.id]
      const cascade = cascades.get(entityKey('task', t.id))
      if (!own && !cascade) return t
      return { ...t, ...(own ?? {}), ...(cascade ? { debut: cascade.debut } : {}) }
    }))
    cascades.forEach((u) => {
      if (u.type === 'segment') updateSegmentLocal(u.id, { date_debut: u.debut })
    })
  }, [updateSegmentLocal])

  // Persistance : toutes les lignes en parallèle (lignes distinctes, pas de race)
  const persistCascade = useCallback(async (cascades, ownWrites = []) => {
    const results = await Promise.all([
      ...ownWrites,
      ...[...cascades.values()].map((u) =>
        u.type === 'segment'
          ? updateSegment(u.id, { date_debut: u.debut })
          : supabase.from('planning').update({ debut: u.debut }).eq('id', u.id)
      ),
    ])
    const failed = results.find((r) => r?.error)
    if (failed?.error) {
      console.error('Propagation : échec de persistance —', failed.error.message)
      await fetchAllData()
      return false
    }
    return true
  }, [updateSegment, fetchAllData])

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
      // Délai avant : la modale n'a plus de case « activer », une durée > 0 suffit.
      // `appro_actif` reste la colonne qui pilote l'affichage de la barre.
      appro_actif: (taskData.appro_duree ?? 0) > 0,
      appro_duree: (taskData.appro_duree ?? 0) > 0 ? taskData.appro_duree : null,
      appro_materiau: (taskData.appro_duree ?? 0) > 0 ? (taskData.appro_materiau ?? null) : null,
      // Délai après
      delai_apres: taskData.delai_apres ?? 0,
      label_apres: (taskData.delai_apres ?? 0) > 0 ? (taskData.label_apres ?? null) : null,
    }
    if (taskModalMode === 'create') {
      // Ajoute la tâche à la fin de son lot (même convention que le num_tache auto-incrémenté)
      const ordre = tasks.filter((t) => t.lot_id === payload.lot_id).length
      const { error } = await supabase.from('planning').insert([{ ...payload, ordre }])
      if (error) throw new Error(error.message)
    } else {
      // Même propagation que le drag : calculée en local depuis l'état courant
      // AVANT toute écriture, puis persistée avec la tâche dans le même lot
      // d'appels parallèles. Une modification qui ne déplace pas la fin de la
      // tâche (renommage, avancement…) ne déclenche aucune cascade.
      const ancienne = tasks.find((t) => t.id === taskData.id)
      const cascades = (ancienne && endDateChanged(ancienne, payload))
        ? propagateAllDependencies({
            tasks, segments, dependances, periodes,
            changedType: 'task', changedId: taskData.id,
            newDebut: payload.debut, newDuree: payload.duree,
          })
        : new Map()

      applyCascadeLocally(cascades, {
        [taskData.id]: { debut: payload.debut, duree: payload.duree, delai_apres: payload.delai_apres },
      })

      const ok = await persistCascade(cascades, [
        supabase.from('planning').update(payload).eq('id', taskData.id),
      ])
      if (!ok) throw new Error('Échec de l’enregistrement de la tâche')
    }
    if (taskData.lot_id) setLastUsedLotId(taskData.lot_id)
    await fetchAllData()
  }

  // ── Task delete ────────────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from('planning').delete().eq('id', taskId)
    if (error) throw new Error(error.message)
    await fetchAllData()
  }

  const handleConfirmDeleteTask = async () => {
    if (!deletingTask) return
    await handleDeleteTask(deletingTask.id)
    setDeletingTask(null)
    handleCloseTaskModal()
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
    const movedTask = tasks.find((t) => t.id === taskId)
    if (!movedTask) return

    const newDebut = changes.debut ?? movedTask.debut
    const newDuree = changes.duree ?? movedTask.duree

    // Si la tâche déplacée est un enfant (a une dépendance) et que son début change,
    // recalculer le lag depuis la position actuelle de sa parente et le persister.
    let finalChanges = changes
    if (movedTask.depends_on && changes.debut) {
      const parentTask = tasks.find((t) => t.id === movedTask.depends_on)
      if (parentTask) {
        const newLag = computeLag(parseDate(parentTask.debut), parentTask.duree, parseDate(newDebut))
        finalChanges = { ...changes, lag_days: newLag }
      }
    }

    // Scénario resize gauche : le début recule et la durée augmente d'autant, donc
    // la date de fin ne bouge pas — aucune dépendance n'est affectée.
    const cascades = endDateChanged(movedTask, { ...movedTask, debut: newDebut, duree: newDuree })
      ? propagateAllDependencies({
          tasks, segments, dependances, periodes,
          changedType: 'task', changedId: taskId, newDebut, newDuree,
        })
      : new Map()

    applyCascadeLocally(cascades, {
      [taskId]: { debut: newDebut, duree: newDuree, ...(finalChanges.lag_days != null ? { lag_days: finalChanges.lag_days } : {}) },
    })

    await persistCascade(cascades, [
      supabase.from('planning').update(finalChanges).eq('id', taskId),
    ])
  }, [tasks, segments, dependances, periodes, applyCascadeLocally, persistCascade])

  // ── Déplacement / redimensionnement d'un segment, avec propagation ─────────────
  // `changes` : { date_debut?, duree_jours? } — un déplacement ne change que la
  // date, un resize peut changer les deux.
  const handleSegmentCommit = useCallback(async (segmentId, changes) => {
    const seg = segments.find((s) => s.id === segmentId)
    if (!seg) return

    const newDebut = changes.date_debut ?? seg.date_debut
    const newDuree = changes.duree_jours ?? seg.duree_jours

    const cascades = propagateAllDependencies({
      tasks, segments, dependances, periodes,
      changedType: 'segment', changedId: segmentId,
      newDebut, newDuree,
    })

    applyCascadeLocally(cascades)

    await persistCascade(cascades, [
      updateSegment(segmentId, changes),
    ])
  }, [tasks, segments, dependances, periodes, updateSegment, applyCascadeLocally, persistCascade])

  // ── Avancement inline ─────────────────────────────────────────────────────────
  const handleAvancementChange = useCallback(async (taskId, value) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, avancement: value } : t))
    await supabase.from('planning').update({ avancement: value }).eq('id', taskId)
  }, [])

  // ── Réorganisation des tâches par drag & drop (au sein d'un même lot) ──────────
  const handleReorderTask = useCallback(async (draggedTaskId, targetTaskId) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return

    const dragged = tasks.find((t) => t.id === draggedTaskId)
    const target = tasks.find((t) => t.id === targetTaskId)
    if (!dragged || !target || dragged.lot_id !== target.lot_id) return

    const lotTasks = tasks
      .filter((t) => t.lot_id === dragged.lot_id)
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))

    const dragIdx = lotTasks.findIndex((t) => t.id === draggedTaskId)
    const targetIdx = lotTasks.findIndex((t) => t.id === targetTaskId)
    if (dragIdx === -1 || targetIdx === -1) return

    const reordered = [...lotTasks]
    const [removed] = reordered.splice(dragIdx, 1)
    reordered.splice(targetIdx, 0, removed)

    // Réassigne l'ordre et renumérote les tâches ("01", "02", ...)
    const updates = reordered.map((t, i) => ({
      id: t.id,
      ordre: i,
      num_tache: String(i + 1).padStart(2, '0'),
    }))

    setTasks((prev) => prev.map((t) => {
      const u = updates.find((x) => x.id === t.id)
      return u ? { ...t, ...u } : t
    }))

    const results = await Promise.all(
      updates.map((u) =>
        supabase.from('planning').update({ ordre: u.ordre, num_tache: u.num_tache }).eq('id', u.id)
      )
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) { console.error('Reorder failed:', failed.error.message); await fetchAllData() }
  }, [tasks, fetchAllData])

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
    // ── 1. Déterminer la plage de dates et les unités de temps (jour/semaine/mois) ──
    let minDate = null
    let maxDate = null

    tasks.forEach((task) => {
      if (!task.debut) return
      const debut = parseDate(task.debut)
      if (!minDate || debut < minDate) minDate = new Date(debut)
      const fin = addWorkingDaysWithBlocked
        ? addWorkingDaysWithBlocked(debut, task.duree ?? 0)
        : addWorkingDays(debut, task.duree ?? 0)
      if (!maxDate || fin > maxDate) maxDate = new Date(fin)
    })

    if (!minDate || !maxDate) return

    minDate.setDate(minDate.getDate() - 3)
    maxDate.setDate(maxDate.getDate() + 5)

    const timeUnits = []
    if (viewMode === 'day') {
      const cur = new Date(minDate)
      while (cur <= maxDate) {
        timeUnits.push(new Date(cur))
        cur.setDate(cur.getDate() + 1)
      }
    } else if (viewMode === 'week') {
      const cur = new Date(minDate)
      const day = cur.getDay()
      cur.setDate(cur.getDate() - (day === 0 ? 6 : day - 1))
      while (cur <= maxDate) {
        timeUnits.push(new Date(cur))
        cur.setDate(cur.getDate() + 7)
      }
    } else {
      const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
      while (cur <= maxDate) {
        timeUnits.push(new Date(cur))
        cur.setMonth(cur.getMonth() + 1)
      }
    }

    // ── 2. Construire la feuille cellule par cellule ──
    const ws = {}
    const merges = []
    let rowIdx = 0
    const FIXED_COLS = 3 // N°, Tâche, Av.%
    // Teintes de la légende (les cellules, elles, prennent la couleur de chaque période)
    const BLOQUANTE_FILL = pastel('#B8412C', 0.22)
    const INFORMATIVE_FILL = pastel('#B8412C', 0.08)

    const setCell = (col, row, value, style) => {
      const addr = XLSX.utils.encode_cell({ c: col, r: row })
      ws[addr] = { v: value, s: style ?? {} }
      if (typeof value === 'string') ws[addr].t = 's'
      else if (typeof value === 'number') ws[addr].t = 'n'
    }

    const styleHeader = {
      font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F1B17' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        right: { style: 'thin', color: { rgb: 'E9E2D6' } },
        bottom: { style: 'thin', color: { rgb: 'E9E2D6' } },
      },
    }

    const styleMonthHeader = (isCurrentMonth) => ({
      font: { bold: true, sz: 9, color: { rgb: isCurrentMonth ? 'E8602C' : '1F1B17' } },
      fill: { fgColor: { rgb: isCurrentMonth ? 'FAF0EB' : 'F5F2F0' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        right: { style: 'medium', color: { rgb: 'C9C4C0' } },
        bottom: { style: 'thin', color: { rgb: 'E9E2D6' } },
      },
    })

    const styleLotHeader = (couleur) => {
      const hex = couleur?.replace('#', '') ?? 'E8602C'
      return {
        font: { bold: true, sz: 9, color: { rgb: hex } },
        fill: { fgColor: { rgb: 'FAF7F2' } },
        border: { bottom: { style: 'thin', color: { rgb: hex } } },
      }
    }

    const styleSidebar = (bold) => ({
      font: { bold: bold ?? false, sz: 9, color: { rgb: '1F1B17' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { vertical: 'center' },
      border: {
        right: { style: 'medium', color: { rgb: 'E9E2D6' } },
        bottom: { style: 'thin', color: { rgb: 'F5F2F0' } },
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // ── Headers selon viewMode ──
    if (viewMode === 'day') {
      const monthGroups = []
      timeUnits.forEach((d) => {
        const key = `${d.getFullYear()}-${d.getMonth()}`
        const last = monthGroups[monthGroups.length - 1]
        if (last && last.key === key) {
          last.count++
        } else {
          monthGroups.push({
            key,
            label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
            count: 1,
            month: d.getMonth(),
            year: d.getFullYear(),
          })
        }
      })

      setCell(0, 0, '', styleHeader)
      setCell(1, 0, '', styleHeader)
      setCell(2, 0, '', styleHeader)
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } })

      let colOff = FIXED_COLS
      monthGroups.forEach((mg) => {
        const isCur = mg.month === today.getMonth() && mg.year === today.getFullYear()
        setCell(colOff, 0, mg.label.charAt(0).toUpperCase() + mg.label.slice(1), styleMonthHeader(isCur))
        if (mg.count > 1) merges.push({ s: { r: 0, c: colOff }, e: { r: 0, c: colOff + mg.count - 1 } })
        colOff += mg.count
      })
      rowIdx = 1

      setCell(0, rowIdx, 'N°', styleHeader)
      setCell(1, rowIdx, 'Tâche', styleHeader)
      setCell(2, rowIdx, 'Av.%', styleHeader)

      timeUnits.forEach((d, i) => {
        const isWE = d.getDay() === 0 || d.getDay() === 6
        const isTod = d.getTime() === today.getTime()
        const isMonthStart = d.getDate() === 1
        setCell(FIXED_COLS + i, rowIdx, d.getDate(), {
          font: {
            bold: isTod, sz: 8,
            color: { rgb: isTod ? 'E8602C' : isWE ? '9C9591' : '5E5854' },
          },
          fill: { fgColor: { rgb: isTod ? 'FAF0EB' : isWE ? 'F0EDE8' : 'FAFAF9' } },
          alignment: { horizontal: 'center' },
          border: {
            right: {
              style: isMonthStart ? 'medium' : 'thin',
              color: { rgb: isMonthStart ? 'C9C4C0' : 'F0EDE8' },
            },
            bottom: { style: 'thin', color: { rgb: 'E9E2D6' } },
          },
        })
      })
      rowIdx = 2
    } else if (viewMode === 'week') {
      setCell(0, 0, '', styleHeader)
      setCell(1, 0, '', styleHeader)
      setCell(2, 0, '', styleHeader)
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } })

      const monthGroups = []
      timeUnits.forEach((monday) => {
        const m = monday.getMonth()
        const y = monday.getFullYear()
        const key = `${y}-${m}`
        const last = monthGroups[monthGroups.length - 1]
        if (last && last.key === key) {
          last.count++
        } else {
          monthGroups.push({
            key, count: 1,
            label: monday.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
            month: m, year: y,
          })
        }
      })

      let colOff = FIXED_COLS
      monthGroups.forEach((mg) => {
        const isCur = mg.month === today.getMonth() && mg.year === today.getFullYear()
        setCell(colOff, 0, mg.label.charAt(0).toUpperCase() + mg.label.slice(1), styleMonthHeader(isCur))
        if (mg.count > 1) merges.push({ s: { r: 0, c: colOff }, e: { r: 0, c: colOff + mg.count - 1 } })
        colOff += mg.count
      })

      setCell(0, 1, 'N°', styleHeader)
      setCell(1, 1, 'Tâche', styleHeader)
      setCell(2, 1, 'Av.%', styleHeader)

      timeUnits.forEach((monday, i) => {
        const d = new Date(monday)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
        const w1 = new Date(d.getFullYear(), 0, 4)
        const wNum = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)

        const isMonthStart = i > 0 && monday.getMonth() !== timeUnits[i - 1].getMonth()
        const isCurWeek = monday <= today && today < new Date(monday.getTime() + 7 * 24 * 3600 * 1000)

        setCell(FIXED_COLS + i, 1, `S${wNum}`, {
          font: { bold: isCurWeek, sz: 8, color: { rgb: isCurWeek ? 'E8602C' : '5E5854' } },
          fill: { fgColor: { rgb: isCurWeek ? 'FAF0EB' : 'FAFAF9' } },
          alignment: { horizontal: 'center' },
          border: {
            right: {
              style: isMonthStart ? 'medium' : 'thin',
              color: { rgb: isMonthStart ? 'C9C4C0' : 'F0EDE8' },
            },
            bottom: { style: 'thin', color: { rgb: 'E9E2D6' } },
          },
        })
      })
      rowIdx = 2
    } else {
      setCell(0, 0, 'N°', styleHeader)
      setCell(1, 0, 'Tâche', styleHeader)
      setCell(2, 0, 'Av.%', styleHeader)

      timeUnits.forEach((d, i) => {
        const isCur = d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
        const label = d.toLocaleDateString('fr-FR', { month: 'short' })
        setCell(FIXED_COLS + i, 0, label.charAt(0).toUpperCase() + label.slice(1), styleMonthHeader(isCur))
      })
      rowIdx = 1
    }

    // ── Lignes de données, groupées par lot ──
    const tasksByLot = {}
    const lotOrder = []
    tasks.forEach((task) => {
      const lotId = task.lot_id ?? '__no_lot__'
      if (!tasksByLot[lotId]) {
        tasksByLot[lotId] = []
        lotOrder.push(lotId)
      }
      tasksByLot[lotId].push(task)
    })

    // Une unité de temps chevauche-t-elle [début, fin[ ? (fin exclusive, jours ouvrés
    // hors périodes bloquées comme dans la timeline)
    const overlaps = (unit, debut, fin) => {
      if (viewMode === 'day') {
        const d = new Date(unit); d.setHours(0, 0, 0, 0)
        const s = new Date(debut); s.setHours(0, 0, 0, 0)
        const e = new Date(fin); e.setHours(0, 0, 0, 0)
        return d >= s && d < e
      }
      if (viewMode === 'week') {
        const wEnd = new Date(unit)
        wEnd.setDate(wEnd.getDate() + 7)
        return unit < fin && wEnd > debut
      }
      const mEnd = new Date(unit.getFullYear(), unit.getMonth() + 1, 1)
      return unit < fin && mEnd > debut
    }

    const isInTask = (unit, task) => {
      if (!task.debut) return false
      const debut = parseDate(task.debut)
      const fin = addWorkingDaysWithBlocked
        ? addWorkingDaysWithBlocked(debut, task.duree ?? 0)
        : addWorkingDays(debut, task.duree ?? 0)
      return overlaps(unit, debut, fin)
    }

    const isInSegment = (unit, seg) => {
      if (!seg.date_debut) return false
      const debut = parseDate(seg.date_debut)
      const fin = addWorkingDaysWithBlocked
        ? addWorkingDaysWithBlocked(debut, seg.duree_jours ?? 0)
        : addWorkingDays(debut, seg.duree_jours ?? 0)
      return overlaps(unit, debut, fin)
    }

    // date_fin est incluse dans la période ; overlaps() attend une borne de fin
    // exclusive (comme pour les tâches/segments), d'où le +1 jour.
    const isInPeriode = (unit, periode) => {
      if (!periode.date_debut || !periode.date_fin) return false
      const debut = parseDate(periode.date_debut)
      const finExclusive = parseDate(periode.date_fin)
      finExclusive.setDate(finExclusive.getDate() + 1)
      return overlaps(unit, debut, finExclusive)
    }

    // En mode zone, une tâche sans zone (ou dont la zone a été supprimée) sort en
    // gris — pas dans la couleur de son lot, qui ferait lire une zone inexistante.
    const getTaskColor = (task) => {
      if (colorMode === 'zone') {
        if (!task.zone_id) return '#C9C4C0'
        return zones.find((z) => z.id === task.zone_id)?.couleur ?? '#C9C4C0'
      }
      return lots.find((l) => l.id === task.lot_id)?.couleur ?? '#C9C4C0'
    }

    const getSegColor = (seg, task) => {
      if (seg.zone_id) {
        return zones.find((z) => z.id === seg.zone_id)?.couleur ?? getTaskColor(task)
      }
      return getTaskColor(task)
    }

    lotOrder.forEach((lotId) => {
      const lot = lots.find((l) => l.id === lotId)
      const lotTasks = tasksByLot[lotId]
      const lotColor = lot?.couleur ?? '#E8602C'
      const lotHex = lotColor.replace('#', '')

      setCell(0, rowIdx, '', styleLotHeader(lotColor))
      setCell(1, rowIdx,
        `${lot?.numero ? String(lot.numero).padStart(2, '0') : ''} – ${lot?.nom ?? 'Sans lot'}`.trim(),
        { ...styleLotHeader(lotColor), font: { bold: true, sz: 9, color: { rgb: lotHex } } }
      )
      setCell(2, rowIdx, '', styleLotHeader(lotColor))

      timeUnits.forEach((_, i) => {
        setCell(FIXED_COLS + i, rowIdx, '', {
          fill: { fgColor: { rgb: 'FAF7F2' } },
          border: {
            right: { style: 'thin', color: { rgb: 'F0EDE8' } },
            bottom: { style: 'medium', color: { rgb: lotHex } },
          },
        })
      })
      rowIdx++

      lotTasks
        .sort((a, b) => (a.num_tache ?? '').localeCompare(b.num_tache ?? ''))
        .forEach((task) => {
          const taskColor = getTaskColor(task)
          const taskHex = taskColor.replace('#', '')
          const segs = getSegmentsForTache ? getSegmentsForTache(task.id) : []

          setCell(0, rowIdx, task.num_tache ?? '', styleSidebar(false))
          setCell(1, rowIdx, task.nom ?? '', styleSidebar(false))
          setCell(2, rowIdx, task.avancement ?? 0, { ...styleSidebar(false), alignment: { horizontal: 'center' } })

          timeUnits.forEach((unit, i) => {
            const inMain = isInTask(unit, task)
            const inSeg = segs.find((s) => isInSegment(unit, s))
            const active = inMain || inSeg
            // En cas de chevauchement, la période bloquante prime sur l'informative
            const couvrantes = periodes.filter((p) => isInPeriode(unit, p))
            const periode = couvrantes.find((p) => p.est_bloquante !== false) ?? couvrantes[0] ?? null
            const isBlocked = !!periode

            let fillHex = 'FFFFFF'

            if (active) {
              fillHex = inSeg ? getSegColor(inSeg, task).replace('#', '') : taskHex
            } else if (periode) {
              // Teinte dérivée de la couleur de la période : plus soutenue si
              // elle est bloquante, très pâle si elle est informative.
              fillHex = pastel(periode.couleur, periode.est_bloquante !== false ? 0.22 : 0.08)
            } else if (viewMode === 'day') {
              const d = new Date(unit)
              if (d.getDay() === 0 || d.getDay() === 6) fillHex = 'F0EDE8'
            }

            const isMonthStart = viewMode === 'day'
              ? unit.getDate() === 1
              : viewMode === 'week'
                ? (i > 0 && unit.getMonth() !== timeUnits[i - 1]?.getMonth())
                : false

            const borderRight = {
              style: isMonthStart ? 'medium' : 'thin',
              color: { rgb: isMonthStart ? 'C9C4C0' : isBlocked && !active ? 'F0C0B0' : 'F0EDE8' },
            }

            setCell(FIXED_COLS + i, rowIdx, '', {
              fill: { fgColor: { rgb: fillHex } },
              border: {
                right: borderRight,
                bottom: { style: 'thin', color: { rgb: 'F5F2F0' } },
              },
            })
          })

          rowIdx++
        })
    })

    // ── Jalons ──
    if (jalons && jalons.length > 0) {
      setCell(0, rowIdx, '', {})
      setCell(1, rowIdx, 'JALONS', { font: { bold: true, sz: 9 } })
      rowIdx++

      jalons.forEach((jalon) => {
        setCell(0, rowIdx, '', styleSidebar())
        setCell(1, rowIdx, jalon.label ?? '', styleSidebar(true))
        setCell(2, rowIdx, '', styleSidebar())

        const jalonDate = jalon.date ? parseDate(jalon.date) : null

        timeUnits.forEach((unit, i) => {
          let isJalon = false
          if (jalonDate) {
            if (viewMode === 'day') {
              isJalon = unit.toDateString() === jalonDate.toDateString()
            } else if (viewMode === 'week') {
              const wEnd = new Date(unit)
              wEnd.setDate(wEnd.getDate() + 7)
              isJalon = jalonDate >= unit && jalonDate < wEnd
            } else {
              isJalon = unit.getMonth() === jalonDate.getMonth() && unit.getFullYear() === jalonDate.getFullYear()
            }
          }

          const jHex = jalon.couleur?.replace('#', '') ?? 'E8602C'

          setCell(FIXED_COLS + i, rowIdx, isJalon ? '▼' : '', {
            fill: { fgColor: { rgb: isJalon ? jHex : 'FFFFFF' } },
            font: { color: { rgb: 'FFFFFF' }, sz: 8 },
            alignment: { horizontal: 'center' },
            border: { right: { style: 'thin', color: { rgb: 'F0EDE8' } } },
          })
        })
        rowIdx++
      })
    }

    // ── Légende ──
    rowIdx += 2
    const legendItems = [
      { color: 'E8602C', label: 'Tâche (couleur du lot/zone)' },
      { color: BLOQUANTE_FILL, label: 'Période bloquante' },
      { color: INFORMATIVE_FILL, label: 'Période informative' },
      { color: 'F0EDE8', label: 'Week-end' },
    ]
    legendItems.forEach((item, i) => {
      setCell(FIXED_COLS + i * 2, rowIdx, '', {
        fill: { fgColor: { rgb: item.color } },
        border: { right: { style: 'thin', color: { rgb: 'E9E2D6' } } },
      })
      setCell(FIXED_COLS + i * 2 + 1, rowIdx, item.label, {
        font: { sz: 8, color: { rgb: '5E5854' } },
        alignment: { vertical: 'center' },
      })
    })
    rowIdx++

    // ── Finaliser la feuille ──
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rowIdx - 1, c: Math.max(FIXED_COLS + timeUnits.length - 1, FIXED_COLS + legendItems.length * 2 - 1) },
    })
    ws['!merges'] = merges

    const colWidths = [{ wch: 6 }, { wch: 22 }, { wch: 5 }]
    timeUnits.forEach(() => {
      colWidths.push({ wch: viewMode === 'day' ? 3.5 : viewMode === 'week' ? 6 : 10 })
    })
    ws['!cols'] = colWidths
    ws['!rows'] = Array(rowIdx).fill({ hpt: 16 })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Planning')

    const nomAffaire = affaire?.nom ?? affaire?.code_affaire ?? 'planning'
    const date = formatDateISO(new Date())

    XLSX.writeFile(wb, `Planning_${nomAffaire}_${date}.xlsx`)
  }

  // ── Zoom (panneau d'options) — un seul contrôle +/- dont l'effet dépend de la
  // vue active : dayWidth en vue jour, zoomLevel en vue semaine/mois ────────────
  const handleZoomOut = () => {
    if (viewMode === 'day') setDayWidth((w) => Math.max(DAY_WIDTH_MIN, w - 2))
    else setZoomLevel((z) => Math.max(ZOOM_LEVEL_MIN, Math.round((z - 0.1) * 100) / 100))
  }
  const handleZoomIn = () => {
    if (viewMode === 'day') setDayWidth((w) => Math.min(DAY_WIDTH_MAX, w + 2))
    else setZoomLevel((z) => Math.min(ZOOM_LEVEL_MAX, Math.round((z + 0.1) * 100) / 100))
  }
  const handleResetZoom = () => {
    if (viewMode === 'day') setDayWidth(DEFAULT_DAY_WIDTH)
    else setZoomLevel(1)
  }
  const handleZoomSeek = (ratio) => {
    const clamped = Math.max(0, Math.min(1, ratio))
    if (viewMode === 'day') {
      setDayWidth(Math.round(DAY_WIDTH_MIN + clamped * (DAY_WIDTH_MAX - DAY_WIDTH_MIN)))
    } else {
      setZoomLevel(Math.round((ZOOM_LEVEL_MIN + clamped * (ZOOM_LEVEL_MAX - ZOOM_LEVEL_MIN)) * 100) / 100)
    }
  }

  // ── Ouverture/fermeture de la modale tâche — préserve le scroll horizontal ─────
  const handleOpenTaskModal = useCallback((task, mode, defaultDebutOverride) => {
    if (timelineRef.current) savedScrollRef.current = timelineRef.current.scrollLeft
    setEditingTask(task)
    setTaskModalMode(mode)
    if (defaultDebutOverride !== undefined) setNewTaskDebut(defaultDebutOverride)
    setShowTaskModal(true)
  }, [])

  const handleCloseTaskModal = useCallback(() => {
    setShowTaskModal(false)
    setEditingTask(null)
    setCreateDefaults(null)
    requestAnimationFrame(() => {
      if (timelineRef.current) timelineRef.current.scrollLeft = savedScrollRef.current
    })
  }, [])

  // Appelé par GanttTimeline une fois le geste de dessin terminé (mouseup) —
  // ouvre la modale de création pré-remplie ; drawMode reste actif pour
  // enchaîner plusieurs créations.
  const handleDrawCreate = useCallback((payload) => {
    setCreateDefaults(payload)
    handleOpenTaskModal(null, 'create', payload.debut)
  }, [handleOpenTaskModal])

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
          onAddTask={() => handleOpenTaskModal(null, 'create', formatDateISO(getNextAvailableDate(tasks)))}
          onOpenPeriodesBloquees={() => setShowPeriodesModal(true)}
          periodes={periodes}
          onExportPdf={() => setShowExportModal(true)}
          onExportExcel={handleExportExcel}
          onToggleConnections={() => setShowConnections((v) => !v)}
          showConnections={showConnections}
          onOpenJalons={() => setShowJalonsModal(true)}
          drawMode={drawMode}
          onSetDrawMode={setDrawMode}
          showOptionsPanel={showOptionsPanel}
          onToggleOptionsPanel={() => setShowOptionsPanel((v) => !v)}
        />
      </div>

      <div id="gantt-print-root" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
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
            tasks={sortedTasks}
            lots={lots}
            rows={rows}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            onEdit={(t) => handleOpenTaskModal(t, 'edit')}
            onAvancementChange={handleAvancementChange}
            onReorderTask={handleReorderTask}
            zones={zones}
            colorMode={colorMode}
            dragOverTaskId={dragOverTaskId}
            onDragOverTaskChange={setDragOverTaskId}
          />
        </div>

        <div
          ref={timelineRef}
          onScroll={(e) => syncScroll('timeline', e.target.scrollTop)}
          onMouseDown={handleTimelineMouseDown}
          style={{
            flex: 1, overflow: 'auto',
            cursor: drawMode ? 'crosshair' : isPanning ? 'grabbing' : 'default',
            userSelect: isPanning ? 'none' : 'auto',
          }}
        >
          <GanttTimeline
            tasks={sortedTasks}
            lots={lots}
            rows={rows}
            scrollRef={timelineRef}
            dayWidth={dayWidth}
            drawMode={drawMode}
            onDrawCreate={handleDrawCreate}
            rowHeight={ROW_HEIGHT}
            showConnections={showConnections}
            jalons={jalons}
            onJalonClick={() => setShowJalonsModal(true)}
            onTaskClick={(t) => handleOpenTaskModal(t, 'edit')}
            onTaskUpdate={handleTaskUpdate}
            onDependencyCreate={handleDependencyCreate}
            onDependencyDelete={handleDependencyDelete}
            zones={zones}
            colorMode={colorMode}
            viewMode={viewMode}
            zoomLevel={zoomLevel}
            getSegmentsForTache={getSegmentsForTache}
            segments={segments}
            updateSegmentLocal={updateSegmentLocal}
            onSegmentCommit={handleSegmentCommit}
            dependances={dependances}
            onSegmentDependencyCreate={addDependance}
            onSegmentDependencyDelete={deleteDependance}
            periodes={periodes}
            getNextWorkingDay={getNextWorkingDay}
            dragOverTaskId={dragOverTaskId}
          />
        </div>

        {/* Indicateur de zoom molette — apparaît brièvement puis disparaît */}
        {showZoomToast && (
          <div style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(31,27,23,0.85)', color: 'white',
            padding: '6px 12px', fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
            pointerEvents: 'none', zIndex: 50,
            transition: 'opacity 0.3s',
          }}>
            {viewMode === 'day' ? `${dayWidth} px/j` : `${Math.round(zoomLevel * 100)}%`}
          </div>
        )}

        {/* Panneau latéral d'options — glisse depuis la droite par-dessus la
            timeline (le conteneur #gantt-print-root est déjà position: relative) */}
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
          {/* En-tête du panneau */}
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

          {/* Contenu scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

            {/* ── Granularité ── */}
            <div style={{ marginBottom: 24 }}>
              <p style={{
                fontSize: 10, fontWeight: 500, color: '#9C9591',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
              }}>
                Granularité
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Calendar size={13} color="#9C9591" strokeWidth={1.25} />
                <div style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)', overflow: 'hidden', flex: 1 }}>
                  {[
                    { value: 'day', label: 'Jours' },
                    { value: 'week', label: 'Semaines' },
                    { value: 'month', label: 'Mois' },
                  ].map((opt, idx) => (
                    <button
                      key={opt.value}
                      onClick={() => setViewMode(opt.value)}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 12,
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
              </div>

              {/* Zoom */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleZoomOut}
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
                    handleZoomSeek((e.clientX - rect.left) / rect.width)
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    left: viewMode === 'day'
                      ? `${(dayWidth - DAY_WIDTH_MIN) / (DAY_WIDTH_MAX - DAY_WIDTH_MIN) * 100}%`
                      : `${(zoomLevel - ZOOM_LEVEL_MIN) / (ZOOM_LEVEL_MAX - ZOOM_LEVEL_MIN) * 100}%`,
                    top: '50%', transform: 'translate(-50%, -50%)',
                    width: 14, height: 14, borderRadius: '50%',
                    background: '#E8602C', border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>

                <button
                  onClick={handleZoomIn}
                  style={{
                    width: 28, height: 28, border: '0.5px solid rgba(0,0,0,0.15)',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <ZoomIn size={13} />
                </button>

                <span
                  onDoubleClick={handleResetZoom}
                  title="Double-clic pour réinitialiser"
                  style={{
                    fontSize: 10, color: '#9C9591', minWidth: 32, textAlign: 'center',
                    cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {viewMode === 'day' ? `${dayWidth}px` : `${Math.round(zoomLevel * 100)}%`}
                </span>
              </div>
            </div>

            <div style={{ height: '0.5px', background: '#E9E2D6', marginBottom: 24 }} />

            {/* ── Couleurs des barres ── */}
            <div style={{ marginBottom: 24 }}>
              <p style={{
                fontSize: 10, fontWeight: 500, color: '#9C9591',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
              }}>
                Couleurs des barres
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Eye size={14} color="#9C9591" strokeWidth={1.25} />
                <span style={{
                  fontSize: 12,
                  color: colorMode === 'lot' ? '#1F1B17' : '#9C9591',
                  fontWeight: colorMode === 'lot' ? 500 : 400,
                }}>
                  Par lot
                </span>

                <div
                  onClick={() => setColorMode(colorMode === 'lot' ? 'zone' : 'lot')}
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
                  fontSize: 12,
                  color: colorMode === 'zone' ? '#E8602C' : '#9C9591',
                  fontWeight: colorMode === 'zone' ? 500 : 400,
                }}>
                  Par zone
                </span>
              </div>

              {colorMode === 'lot' && (
                <button
                  onClick={() => { setShowLotsModal(true); setShowOptionsPanel(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '8px 12px', fontSize: 12,
                    border: '0.5px solid rgba(0,0,0,0.12)',
                    background: '#FAFAF9', cursor: 'pointer', color: '#5E5854',
                  }}
                >
                  <Palette size={13} strokeWidth={1.25} />
                  Gérer les couleurs des lots
                </button>
              )}
              {colorMode === 'zone' && (
                <button
                  onClick={() => { setShowZonesModal(true); setShowOptionsPanel(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '8px 12px', fontSize: 12,
                    border: '0.5px solid rgba(0,0,0,0.12)',
                    background: '#FAFAF9', cursor: 'pointer', color: '#5E5854',
                  }}
                >
                  <Palette size={13} strokeWidth={1.25} />
                  Gérer les zones
                </button>
              )}
            </div>

            {zones.length > 0 && (
              <>
                <div style={{ height: '0.5px', background: '#E9E2D6', marginBottom: 24 }} />

                {/* ── Groupement des tâches ── */}
                <div style={{ marginBottom: 24 }}>
                  <p style={{
                    fontSize: 10, fontWeight: 500, color: '#9C9591',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                  }}>
                    Groupement des tâches
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={13} color="#9C9591" strokeWidth={1.25} />
                    <div style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)', overflow: 'hidden', flex: 1 }}>
                      {[
                        { value: 'lot', label: 'Par lot' },
                        { value: 'zone', label: 'Par zone' },
                      ].map((opt, idx) => (
                        <button
                          key={opt.value}
                          onClick={() => setGroupMode(opt.value)}
                          style={{
                            flex: 1, padding: '7px 0', fontSize: 12,
                            border: 'none',
                            borderRight: idx === 0 ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                            background: groupMode === opt.value ? '#1F1B17' : 'transparent',
                            color: groupMode === opt.value ? 'white' : '#5E5854',
                            cursor: 'pointer',
                            fontWeight: groupMode === opt.value ? 500 : 400,
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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
        onClose={handleCloseTaskModal}
        task={editingTask}
        tasks={tasks}
        lots={lots}
        onSave={handleSaveTask}
        onRequestDelete={(t) => setDeletingTask(t)}
        mode={taskModalMode}
        zones={zones}
        colorMode={colorMode}
        defaultDebut={newTaskDebut}
        lastUsedLotId={lastUsedLotId}
        createDefaults={createDefaults}
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
        segments={segments}
        dependances={dependances}
        periodes={periodes}
      />

      <JalonModal
        open={showJalonsModal}
        onClose={() => setShowJalonsModal(false)}
        jalons={jalons}
        affaireId={affaireId}
        onRefetch={fetchAllData}
      />

      <PeriodesBloqueesModal
        open={showPeriodesModal}
        onClose={() => setShowPeriodesModal(false)}
        periodes={periodes}
        addPeriode={addPeriode}
        updatePeriode={updatePeriode}
        deletePeriode={deletePeriode}
      />

      {/* Modale confirmation suppression tâche */}
      {deletingTask && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: 0, padding: '28px 32px',
            maxWidth: 420, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 2, backgroundColor: '#FEF2F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Trash2 size={18} style={{ color: '#B8412C' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>
                Supprimer la tâche
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 20 }}>
              La tâche{' '}
              <strong style={{ color: '#1F1B17' }}>
                {deletingTask.num_tache} – {deletingTask.nom}
              </strong>
              {' '}va être supprimée. Cette action est irréversible. Les segments et dépendances
              associés seront aussi supprimés.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingTask(null)}
                style={{
                  padding: '8px 16px', borderRadius: 2, fontSize: 13, cursor: 'pointer',
                  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'transparent', color: '#374151',
                }}>
                Annuler
              </button>
              <button
                onClick={handleConfirmDeleteTask}
                style={{
                  padding: '8px 16px', borderRadius: 2, fontSize: 13, fontWeight: 500,
                  border: 'none', backgroundColor: '#B8412C', color: 'white', cursor: 'pointer',
                }}>
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
