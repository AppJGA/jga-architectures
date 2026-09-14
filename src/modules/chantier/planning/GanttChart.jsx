import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Trash2, X, ZoomIn, ZoomOut, Calendar, Eye, Layers, Palette } from 'lucide-react'
import { parseDate, formatDateISO, addWorkingDays } from './types'
import {
  propagateAllDependencies, endDateChanged, entityKey, reconcilierLienHistorique, lagsDependancesCible,
  propagerDepuisRacines, skipBlockedPeriods,
} from './propagation'
import { buildRowsByZone } from './groupByZone'
import { exporterPlanningChantierExcel } from './exportPlanningChantierExcel'
import { trierZones } from '../../../shared/hooks/ordreZones'
import { useUndoRedo } from '../../../shared/hooks/useUndoRedo'
import { diffSnapshots, diffEstVide } from './snapshotDiff'
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

// Densité déduite de la hauteur de ligne active dans l'éditeur
function densityFromRowHeight(rowHeight) {
  if (rowHeight <= 28) return 'compact'
  if (rowHeight >= 44) return 'confort'
  return 'normal'
}

// Densité des lignes du Gantt
const ROW_HEIGHT_OPTIONS = [
  { label: 'Compact', value: 24 },
  { label: 'Normal', value: 36 },
  { label: 'Confort', value: 48 },
]
const ROW_HEIGHT_DEFAUT = 36

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

  const [undoError, setUndoError] = useState(null)
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

  const { zones: zonesBrutes, createZone, updateZone, deleteZone, reorderZones } = usePlanningZones(affaireId)

  // Ordre d'affichage des zones : `ordre` fait foi partout — lignes groupées,
  // couleurs, légende et exports — pour que l'écran et le papier concordent.
  const zones = useMemo(() => trierZones(zonesBrutes), [zonesBrutes])
  const {
    segments, addSegment, updateSegment, updateSegmentLocal, deleteSegment, getSegmentsForTache,
    replaceSegments, refetch: refetchSegments,
  } = usePlanningSegments(affaireId)
  const {
    dependances, addDependance, deleteDependance, updateLags, replaceDependances, refetch: refetchDependances,
  } = usePlanningDependances(affaireId)

  // ── Historique annuler / rétablir ───────────────────────────────────────────
  const historique = useUndoRedo(20)
  const {
    saveSnapshot, beginPending, commitPending, cancelPending, retirerDernier,
    undo, redo, reset: resetHistorique, canUndo, canRedo,
  } = historique

  // Copie de surface : les propriétés d'une tâche sont toutes primitives.
  // Les liens de planning_dependances en font partie : leur écart change quand
  // on déplace une tâche liée, et la base les supprime avec leur tâche.
  const takeSnapshot = useCallback((label = '') => ({
    tasks: tasks.map((t) => ({ ...t })),
    segments: segments.map((sg) => ({ ...sg })),
    dependances: dependances.map((d) => ({ ...d })),
    label,
  }), [tasks, segments, dependances])
  const {
    periodes, addPeriode, updatePeriode, deletePeriode,
  } = usePeriodesBloquees(affaireId)

  // Message d'échec d'une écriture, affiché au-dessus de la barre d'outils
  const [erreurEcriture, setErreurEcriture] = useState(null)
  // Écritures en cours : on n'annule pas pendant ce temps, sinon les écritures
  // de l'annulation et celles du geste se croisent sur les mêmes lignes.
  const ecrituresEnCours = useRef(0)

  const [rowHeight, setRowHeight] = useState(() => {
    const saved = parseInt(localStorage.getItem(`planning-row-height-${affaireId}`), 10)
    return ROW_HEIGHT_OPTIONS.some((o) => o.value === saved) ? saved : ROW_HEIGHT_DEFAUT
  })

  useEffect(() => {
    localStorage.setItem(`planning-row-height-${affaireId}`, String(rowHeight))
  }, [rowHeight, affaireId])

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

  // ── Hauteur de la barre de défilement horizontale de la timeline ───────────────
  // La sidebar n'en a pas : sans cette marge, en bas de défilement ses dernières
  // lignes restaient décalées de la hauteur de la barre (Windows, ou macOS réglé
  // pour toujours afficher les barres).
  const [margeDefilement, setMargeDefilement] = useState(0)
  useEffect(() => {
    const el = timelineRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setMargeDefilement(el.offsetHeight - el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [isLoading, error])

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
  //
  // L'écran de chargement n'apparaît qu'au premier chargement d'une affaire :
  // il démonte tout l'arbre (modales ouvertes, défilement vertical remis en haut).
  const dejaCharge = useRef(false)
  const affaireCourante = useRef(affaireId)

  const fetchAllData = useCallback(async () => {
    if (!dejaCharge.current) setIsLoading(true)
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

    // Réponse d'une affaire qu'on a quittée entre-temps : on l'ignore
    if (affaireCourante.current !== affaireId) return

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
    dejaCharge.current = true
    setIsLoading(false)
  }, [affaireId])

  useEffect(() => {
    affaireCourante.current = affaireId
    dejaCharge.current = false
    fetchAllData()
  }, [affaireId, fetchAllData])

  // Recharge tout ce qu'une écriture ratée a pu laisser faux en local
  const rechargerTout = useCallback(async () => {
    await Promise.all([fetchAllData(), refetchSegments(), refetchDependances()])
  }, [fetchAllData, refetchSegments, refetchDependances])

  const signalerEchec = useCallback(async (contexte, message) => {
    console.error(`${contexte} —`, message)
    setErreurEcriture(`${contexte} : ${message}`)
    await rechargerTout()
  }, [rechargerTout])

  // L'état entier est rechargé quand on change d'affaire : l'historique
  // précédent ne s'applique plus à rien.
  useEffect(() => { resetHistorique() }, [affaireId, resetHistorique])

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
    ecrituresEnCours.current++
    try {
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
        await signalerEchec('Enregistrement impossible', failed.error.message)
        return false
      }
      return true
    } finally {
      ecrituresEnCours.current--
    }
  }, [updateSegment, signalerEchec])

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
    const ancienneTache = taskModalMode === 'create' ? null : tasks.find((t) => t.id === taskData.id)
    // Une tâche ne démarre ni un week-end ni pendant une fermeture
    payload.debut = formatDateISO(skipBlockedPeriods(parseDate(payload.debut), periodes))
    // Un écart saisi replace la tâche ; un début modifié ou un nouveau parent
    // recalcule l'écart — en création comme en modification.
    const parent = tasks.find((t) => t.id === payload.depends_on)
    Object.assign(payload, reconcilierLienHistorique(
      ancienneTache, { ...payload, lag_propose: taskData.lag_propose }, parent, periodes
    ))
    // Tâche changée de lot : elle passe en fin du nouveau lot
    const finDeLot = (lotId) => Math.max(-1, ...tasks.filter((t) => t.lot_id === lotId && t.id !== taskData.id)
      .map((t) => t.ordre ?? 0)) + 1
    if (ancienneTache && ancienneTache.lot_id !== payload.lot_id) payload.ordre = finDeLot(payload.lot_id)
    // Instantané pris seulement si l'enregistrement modifie réellement la tâche :
    // valider la modale sans rien changer ne doit pas consommer une étape
    // d'historique, sinon le Ctrl+Z suivant paraîtrait sans effet.
    const modifie = taskModalMode === 'create' || !ancienneTache
      || Object.keys(payload).some((c) => (ancienneTache[c] ?? null) !== (payload[c] ?? null))
    if (modifie) {
      saveSnapshot(takeSnapshot(
        taskModalMode === 'create' ? 'Nouvelle tâche' : `Modification « ${taskData.nom} »`
      ))
    }

    if (taskModalMode === 'create') {
      // Ajoute la tâche à la fin de son lot (après la plus grande valeur
      // d'`ordre`, un simple comptage pouvant reprendre une valeur existante)
      const { error } = await supabase.from('planning').insert([{ ...payload, ordre: finDeLot(payload.lot_id) }])
      if (error) {
        retirerDernier()
        throw new Error(error.message)
      }
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
        ...(payload.debut !== ancienne?.debut
          ? updateLags(lagsDependancesCible({
              type: 'task', id: taskData.id, debut: payload.debut, tasks, segments, dependances, periodes,
            }))
          : []),
      ])
      if (!ok) {
        if (modifie) retirerDernier()
        throw new Error('Échec de l’enregistrement de la tâche')
      }
    }
    if (taskData.lot_id) setLastUsedLotId(taskData.lot_id)
    await fetchAllData()
  }

  // ── Task delete ────────────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    saveSnapshot(takeSnapshot(`Suppression « ${tasks.find((t) => t.id === taskId)?.nom ?? ''} »`))
    const { error } = await supabase.from('planning').delete().eq('id', taskId)
    if (error) {
      retirerDernier()
      await signalerEchec('Suppression impossible', error.message)
      return false
    }
    // La base supprime en cascade les segments et les liens de la tâche, mais
    // ni le state local ni `fetchAllData` ne le voient : on les recharge.
    const segmentsSupprimes = segments.filter((sg) => sg.tache_id === taskId).map((sg) => sg.id)
    replaceSegments(segments.filter((sg) => sg.tache_id !== taskId))
    replaceDependances(dependances.filter((d) => d.source_tache_id !== taskId && d.cible_tache_id !== taskId
      && !segmentsSupprimes.includes(d.source_segment_id) && !segmentsSupprimes.includes(d.cible_segment_id)))
    await fetchAllData()
    return true
  }

  const handleConfirmDeleteTask = async () => {
    if (!deletingTask) return
    const ok = await handleDeleteTask(deletingTask.id)
    setDeletingTask(null)
    if (ok) handleCloseTaskModal()
  }

  // ── Dépendances ────────────────────────────────────────────────────────────────
  // Chaque action sur un lien a sa propre étape d'historique : sans elle, le
  // Ctrl+Z suivant la défaisait en même temps que l'action précédente.
  const handleDependencyCreate = useCallback(async (fromTaskId, toTaskId, lagDays) => {
    saveSnapshot(takeSnapshot('Nouveau lien'))
    setTasks((prev) => prev.map((t) =>
      t.id === toTaskId ? { ...t, depends_on: fromTaskId, lag_days: lagDays } : t
    ))
    const { error } = await supabase
      .from('planning')
      .update({ depends_on: fromTaskId, lag_days: lagDays })
      .eq('id', toTaskId)
    if (error) { retirerDernier(); await signalerEchec('Création du lien impossible', error.message) }
  }, [saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  const handleDependencyDelete = useCallback(async (fromTaskId, toTaskId) => {
    saveSnapshot(takeSnapshot('Suppression d’un lien'))
    setTasks((prev) => prev.map((t) =>
      t.id === toTaskId && t.depends_on === fromTaskId
        ? { ...t, depends_on: null, lag_days: 0 }
        : t
    ))
    const { error } = await supabase
      .from('planning')
      .update({ depends_on: null, lag_days: 0 })
      .eq('id', toTaskId)
    if (error) { retirerDernier(); await signalerEchec('Suppression du lien impossible', error.message) }
  }, [saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  const handleLienEtenduCreate = useCallback(async (lien) => {
    saveSnapshot(takeSnapshot('Nouveau lien'))
    const { error } = await addDependance(lien)
    if (error) { retirerDernier(); await signalerEchec('Création du lien impossible', error.message) }
  }, [addDependance, saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  const handleLienEtenduDelete = useCallback(async (id) => {
    saveSnapshot(takeSnapshot('Suppression d’un lien'))
    const { error } = await deleteDependance(id)
    if (error) { retirerDernier(); await signalerEchec('Suppression du lien impossible', error.message) }
  }, [deleteDependance, saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  // ── Drag/resize avec propagation en cascade ────────────────────────────────────
  const handleTaskUpdate = useCallback(async (taskId, changes) => {
    const movedTask = tasks.find((t) => t.id === taskId)
    if (!movedTask) return

    // L'état local n'a pas encore bougé : le glissement est tenu par la timeline
    // jusqu'au relâchement, l'instantané pris ici est donc bien celui d'avant.
    saveSnapshot(takeSnapshot(
      changes.duree != null && changes.debut == null
        ? `Redimensionnement « ${movedTask.nom} »`
        : `Déplacement « ${movedTask.nom} »`
    ))

    const newDebut = changes.debut ?? movedTask.debut
    const newDuree = changes.duree ?? movedTask.duree

    // Tâche déplacée à la main : ses liens entrants prennent l'écart
    // correspondant à sa nouvelle position, sinon elle reviendrait à l'ancienne
    // au prochain décalage de son prédécesseur.
    let finalChanges = changes
    let lagsEntrants = []
    if (changes.debut && changes.debut !== movedTask.debut) {
      const parentTask = tasks.find((t) => t.id === movedTask.depends_on)
      if (parentTask) {
        const { lag_days } = reconcilierLienHistorique(movedTask, { ...movedTask, debut: newDebut }, parentTask, periodes)
        finalChanges = { ...changes, lag_days }
      }
      lagsEntrants = lagsDependancesCible({
        type: 'task', id: taskId, debut: newDebut, tasks, segments, dependances, periodes,
      })
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
      ...updateLags(lagsEntrants),
    ])
  }, [tasks, segments, dependances, periodes, applyCascadeLocally, persistCascade, updateLags, saveSnapshot, takeSnapshot])

  // ── Déplacement / redimensionnement d'un segment, avec propagation ─────────────
  // `changes` : { date_debut?, duree_jours? } — un déplacement ne change que la
  // date, un resize peut changer les deux.
  // Le glissement d'un segment modifie l'état local à chaque frame (cf.
  // updateSegmentLocal) : l'instantané doit être pris au mousedown. Il n'entre
  // dans l'historique qu'ici, une fois le geste abouti — un simple clic sur un
  // segment ne laisse donc pas d'entrée vide.
  const handleSegmentDragBegin = useCallback((label) => {
    beginPending(takeSnapshot(label))
  }, [beginPending, takeSnapshot])

  // `avant` : dates du segment au début du geste. L'état local a déjà suivi
  // la souris, le comparer à `seg` ne détecterait jamais de déplacement.
  const enregistrerSegment = useCallback(async (seg, changes, avant) => {
    const segmentId = seg.id
    const newDebut = changes.date_debut ?? seg.date_debut
    const newDuree = changes.duree_jours ?? seg.duree_jours

    const cascades = propagateAllDependencies({
      tasks, segments, dependances, periodes,
      changedType: 'segment', changedId: segmentId,
      newDebut, newDuree,
    })

    applyCascadeLocally(cascades)

    return persistCascade(cascades, [
      updateSegment(segmentId, changes),
      ...(changes.date_debut && changes.date_debut !== (avant?.date_debut ?? seg.date_debut)
        ? updateLags(lagsDependancesCible({
            type: 'segment', id: segmentId, debut: newDebut, tasks, segments, dependances, periodes,
          }))
        : []),
    ])
  }, [tasks, segments, dependances, periodes, updateSegment, updateLags, applyCascadeLocally, persistCascade])

  const handleSegmentCommit = useCallback(async (segmentId, changes, avant) => {
    const seg = segments.find((s) => s.id === segmentId)
    if (!seg) return
    commitPending()
    await enregistrerSegment(seg, changes, avant)
  }, [segments, commitPending, enregistrerSegment])

  // ── Segments modifiés depuis la modale de tâche ────────────────────────────────
  // Mêmes règles que sur la timeline : une étape d'historique, et une date ou
  // une durée modifiées décalent les suivantes et mettent à jour les écarts.
  const handleSegmentAjout = useCallback(async (tacheId, data) => {
    saveSnapshot(takeSnapshot('Nouveau segment'))
    const { error } = await addSegment(tacheId, {
      ...data, date_debut: formatDateISO(skipBlockedPeriods(parseDate(data.date_debut), periodes)),
    })
    if (error) { retirerDernier(); await signalerEchec('Ajout du segment impossible', error.message) }
  }, [addSegment, periodes, saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  const handleSegmentModif = useCallback(async (segmentId, changes) => {
    const seg = segments.find((s) => s.id === segmentId)
    if (!seg) return
    const aChange = Object.keys(changes).some((c) => (seg[c] ?? null) !== (changes[c] ?? null))
    if (!aChange) return
    saveSnapshot(takeSnapshot('Modification d’un segment'))
    if (changes.date_debut != null || changes.duree_jours != null) {
      const corriges = changes.date_debut != null
        ? { ...changes, date_debut: formatDateISO(skipBlockedPeriods(parseDate(changes.date_debut), periodes)) }
        : changes
      if (!await enregistrerSegment(seg, corriges)) retirerDernier()
      return
    }
    const { error } = await updateSegment(segmentId, changes)
    if (error) { retirerDernier(); await signalerEchec('Modification du segment impossible', error.message) }
  }, [segments, periodes, enregistrerSegment, updateSegment, saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  const handleSegmentSuppression = useCallback(async (segmentId) => {
    saveSnapshot(takeSnapshot('Suppression d’un segment'))
    const { error } = await deleteSegment(segmentId)
    if (error) { retirerDernier(); await signalerEchec('Suppression du segment impossible', error.message); return }
    // Liens supprimés en cascade par la base
    replaceDependances(dependances.filter((d) => d.source_segment_id !== segmentId && d.cible_segment_id !== segmentId))
  }, [deleteSegment, dependances, replaceDependances, saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

  // ── Zones ─────────────────────────────────────────────────────────────────────
  // La base remet `zone_id` à null sur les tâches et segments de la zone
  // supprimée ; sans le faire aussi en local, ils disparaissaient du groupement
  // par zone et un enregistrement suivant échouait sur la clé étrangère.
  const handleZoneSuppression = useCallback(async (id) => {
    const resultat = await deleteZone(id)
    if (resultat?.error) return resultat
    setTasks((prev) => prev.map((t) => (t.zone_id === id ? { ...t, zone_id: null } : t)))
    replaceSegments(segments.map((sg) => (sg.zone_id === id ? { ...sg, zone_id: null } : sg)))
    return resultat
  }, [deleteZone, segments, replaceSegments])

  // ── Périodes ──────────────────────────────────────────────────────────────────
  // Une fermeture ajoutée, modifiée ou supprimée allonge ou raccourcit les
  // barres qu'elle traverse : les tâches liées sont recalées dans la foulée.
  const recalerApresPeriodes = useCallback(async (nouvellesPeriodes, label) => {
    const cascades = propagerDepuisRacines({ tasks, segments, dependances, periodes: nouvellesPeriodes })
    if (cascades.size === 0) return
    saveSnapshot(takeSnapshot(label))
    applyCascadeLocally(cascades)
    if (!await persistCascade(cascades)) retirerDernier()
  }, [tasks, segments, dependances, applyCascadeLocally, persistCascade, saveSnapshot, takeSnapshot, retirerDernier])

  const handlePeriodeAjout = useCallback(async (data) => {
    const resultat = await addPeriode(data)
    if (!resultat.error && resultat.data) await recalerApresPeriodes([...periodes, resultat.data], 'Nouvelle période')
    return resultat
  }, [addPeriode, periodes, recalerApresPeriodes])

  const handlePeriodeModif = useCallback(async (id, changes) => {
    const resultat = await updatePeriode(id, changes)
    if (!resultat.error) {
      await recalerApresPeriodes(periodes.map((p) => (p.id === id ? { ...p, ...changes } : p)), 'Modification d’une période')
    }
    return resultat
  }, [updatePeriode, periodes, recalerApresPeriodes])

  const handlePeriodeSuppression = useCallback(async (id) => {
    const resultat = await deletePeriode(id)
    if (!resultat.error) await recalerApresPeriodes(periodes.filter((p) => p.id !== id), 'Suppression d’une période')
    return resultat
  }, [deletePeriode, periodes, recalerApresPeriodes])

  // ── Avancement inline ─────────────────────────────────────────────────────────
  // Appelé une fois la saisie terminée (sortie du champ ou Entrée), pas à
  // chaque frappe : une seule étape d'historique et une seule écriture.
  const handleAvancementChange = useCallback(async (taskId, value) => {
    const avancement = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
    const tache = tasks.find((t) => t.id === taskId)
    if (!tache || tache.avancement === avancement) return
    saveSnapshot(takeSnapshot('Avancement'))
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, avancement } : t))
    const { error } = await supabase.from('planning').update({ avancement }).eq('id', taskId)
    if (error) { retirerDernier(); await signalerEchec('Avancement non enregistré', error.message) }
  }, [tasks, saveSnapshot, takeSnapshot, retirerDernier, signalerEchec])

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

    saveSnapshot(takeSnapshot('Réorganisation des tâches'))

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
    if (failed?.error) await signalerEchec('Réorganisation impossible', failed.error.message)
  }, [tasks, signalerEchec, saveSnapshot, takeSnapshot])

  // ── Application d'un instantané ─────────────────────────────────────────────
  //
  // On écrit le strict nécessaire : les lignes modifiées, celles créées depuis
  // l'instantané (à supprimer) et celles supprimées depuis (à recréer avec leur
  // identifiant, pour que segments et dépendances continuent de les viser).
  const appliquerSnapshot = useCallback(async (depuis, vers) => {
    const diff = diffSnapshots(depuis, vers)
    if (diffEstVide(diff)) return true

    // Affichage immédiat, écriture ensuite — même principe que la propagation.
    setTasks(vers.tasks)
    replaceSegments(vers.segments)
    if (vers.dependances) replaceDependances(vers.dependances)
    ecrituresEnCours.current++

    // Les segments partent en premier : une tâche ne peut être supprimée tant
    // qu'un segment la référence, et un segment ne peut être recréé avant sa
    // tâche. L'ordre inverse est appliqué de chaque côté.
    const resultats = await Promise.all([
      ...diff.dependances.deletions.map((id) =>
        supabase.from('planning_dependances').delete().eq('id', id)),
      ...diff.segments.deletions.map((id) =>
        supabase.from('planning_segments').delete().eq('id', id)),
      ...diff.tasks.insertions.length
        ? [supabase.from('planning').insert(
            diff.tasks.insertions.map((t) => ({ ...t, affaire_id: t.affaire_id ?? affaireId })))]
        : [],
    ])

    const resultats2 = await Promise.all([
      ...diff.tasks.updates.map((u) =>
        supabase.from('planning').update(u.changes).eq('id', u.id)),
      ...diff.segments.updates.map((u) =>
        supabase.from('planning_segments').update(u.changes).eq('id', u.id)),
      ...diff.segments.insertions.length
        ? [supabase.from('planning_segments').insert(
            diff.segments.insertions.map((sg) => ({ ...sg, affaire_id: sg.affaire_id ?? affaireId })))]
        : [],
      ...diff.tasks.deletions.map((id) =>
        supabase.from('planning').delete().eq('id', id)),
      ...diff.dependances.updates.map((u) =>
        supabase.from('planning_dependances').update(u.changes).eq('id', u.id)),
    ])

    // Les liens en dernier : leurs tâches et segments doivent exister
    const resultats3 = diff.dependances.insertions.length
      ? [await supabase.from('planning_dependances').insert(
          diff.dependances.insertions.map((d) => ({ ...d, affaire_id: d.affaire_id ?? affaireId })))]
      : []
    ecrituresEnCours.current--

    const echec = [...resultats, ...resultats2, ...resultats3].find((r) => r?.error)
    if (echec?.error) {
      console.error('Historique : échec de persistance —', echec.error.message)
      setUndoError(echec.error.message)
      await rechargerTout()
      return false
    }
    return true
  }, [affaireId, replaceSegments, replaceDependances, rechargerTout])

  const handleUndo = useCallback(async () => {
    if (ecrituresEnCours.current > 0) return
    const courant = takeSnapshot()
    const precedent = undo(courant)
    if (!precedent) return
    await appliquerSnapshot(courant, precedent)
  }, [undo, takeSnapshot, appliquerSnapshot])

  const handleRedo = useCallback(async () => {
    if (ecrituresEnCours.current > 0) return
    const courant = takeSnapshot()
    const suivant = redo(courant)
    if (!suivant) return
    await appliquerSnapshot(courant, suivant)
  }, [redo, takeSnapshot, appliquerSnapshot])

  // ── Raccourcis clavier ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ni pendant une saisie, ni quand une modale est ouverte : le geste y a
      // un autre sens (annuler la frappe, pas la dernière action du planning).
      const tag = document.activeElement?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (document.activeElement?.isContentEditable) return
      if (e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return
      if (!e.ctrlKey && !e.metaKey) return

      const versLeFutur = (e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y'
      e.preventDefault()
      if (versLeFutur) { if (canRedo) handleRedo() }
      else if (canUndo) handleUndo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canUndo, canRedo, handleUndo, handleRedo])

  // ── Lots save (couleurs uniquement) ──────────────────────────────────────────
  const handleSaveLots = async (colorDrafts) => {
    const resultats = await Promise.all(
      colorDrafts.map((d) =>
        supabase.from('lots').update({ couleur: d.couleur }).eq('id', d.id)
      )
    )
    await fetchAllData()
    // Levée pour que la modale reste ouverte et affiche l'échec
    const echec = resultats.find((r) => r.error)
    if (echec) throw new Error(echec.error.message)
  }

  // ── Export Excel ──────────────────────────────────────────────────────────────
  // Depuis la barre d'outils : le planning tel qu'affiché. Depuis la modale
  // d'export : période, vue, couleurs et groupement choisis dans la modale.
  const handleExportExcel = (options = {}) => {
    exporterPlanningChantierExcel({
      tasks: sortedTasks, lots, zones, segments, jalons, periodes, affaire,
      viewMode, colorMode, groupMode,
      density: densityFromRowHeight(rowHeight),
      ...(options?.nativeEvent ? {} : options),
    })
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
        {erreurEcriture && (
          <div style={{
            padding: '6px 12px', fontSize: 12, color: '#B8412C',
            background: 'rgba(184,65,44,0.08)', borderBottom: '0.5px solid rgba(184,65,44,0.2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>{erreurEcriture}. Le planning a été rechargé.</span>
            <button
              onClick={() => setErreurEcriture(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C', textDecoration: 'underline' }}
            >
              Fermer
            </button>
          </div>
        )}
        {undoError && (
          <div style={{
            padding: '6px 12px', fontSize: 12, color: '#B8412C',
            background: 'rgba(184,65,44,0.08)', borderBottom: '0.5px solid rgba(184,65,44,0.2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>Annulation impossible — {undoError}. Le planning a été rechargé.</span>
            <button
              onClick={() => setUndoError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C', textDecoration: 'underline' }}
            >
              Fermer
            </button>
          </div>
        )}
        <GanttToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          labelUndo={historique.labelUndo}
          labelRedo={historique.labelRedo}
          onAddTask={() => {
            // Les valeurs d'un dessin précédent ne doivent pas préremplir la création
            setCreateDefaults(null)
            handleOpenTaskModal(null, 'create', formatDateISO(getNextAvailableDate(tasks)))
          }}
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
            rowHeight={rowHeight}
            headerHeight={HEADER_HEIGHT}
            onEdit={(t) => handleOpenTaskModal(t, 'edit')}
            onAvancementChange={handleAvancementChange}
            onReorderTask={handleReorderTask}
            zones={zones}
            colorMode={colorMode}
            dragOverTaskId={dragOverTaskId}
            onDragOverTaskChange={setDragOverTaskId}
          />
          <div style={{ height: margeDefilement }} />
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
            rowHeight={rowHeight}
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
            onSegmentDragBegin={handleSegmentDragBegin}
            onSegmentDragCancel={cancelPending}
            dependances={dependances}
            onSegmentDependencyCreate={handleLienEtenduCreate}
            onSegmentDependencyDelete={handleLienEtenduDelete}
            periodes={periodes}
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

            {/* ── Hauteur des lignes ── */}
            <div style={{ marginBottom: 24 }}>
              <p style={{
                fontSize: 10, fontWeight: 500, color: '#9C9591',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
              }}>
                Hauteur des lignes
              </p>
              <div style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                {ROW_HEIGHT_OPTIONS.map((opt, idx) => (
                  <button
                    key={opt.value}
                    onClick={() => setRowHeight(opt.value)}
                    style={{
                      flex: 1, padding: '7px 0', fontSize: 11, border: 'none',
                      borderRight: idx < ROW_HEIGHT_OPTIONS.length - 1 ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                      background: rowHeight === opt.value ? '#1F1B17' : 'transparent',
                      color: rowHeight === opt.value ? 'white' : '#5E5854',
                      cursor: 'pointer',
                      fontWeight: rowHeight === opt.value ? 500 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: '0.5px', background: '#E9E2D6', marginBottom: 24 }} />

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
        // Relue dans `tasks` : la modale n'est pas bloquante, la tâche peut
        // bouger (glissement, propagation) pendant qu'elle est ouverte.
        task={editingTask ? (tasks.find((t) => t.id === editingTask.id) ?? editingTask) : null}
        tasks={tasks}
        dependances={dependances}
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
        addSegment={handleSegmentAjout}
        updateSegment={handleSegmentModif}
        deleteSegment={handleSegmentSuppression}
        periodes={periodes}
      />

      <ZonesModal
        open={showZonesModal}
        onClose={() => setShowZonesModal(false)}
        zones={zones}
        createZone={createZone}
        updateZone={updateZone}
        reorderZones={reorderZones}
        deleteZone={handleZoneSuppression}
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
        tasks={sortedTasks}
        jalons={jalons}
        affaire={affaire}
        zones={zones}
        colorMode={colorMode}
        viewMode={viewMode}
        groupMode={groupMode}
        rowHeight={rowHeight}
        onExportExcel={handleExportExcel}
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
        addPeriode={handlePeriodeAjout}
        updatePeriode={handlePeriodeModif}
        deletePeriode={handlePeriodeSuppression}
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
