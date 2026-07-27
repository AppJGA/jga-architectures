import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Pencil, GitBranch } from 'lucide-react'
import {
  parseDate,
  formatDateISO,
  isWorkingDay,
  addWorkingDays,
  workingDaysBetween,
  computeLag,
} from './types'

// Étendue minimale de la timeline, même sans tâche (la plage réelle est calculée
// depuis la dernière tâche/segment + une large marge droite — voir `dayCount`).
const TIMELINE_DAYS_MIN = 365
const TIMELINE_WEEKS_MIN = Math.ceil(TIMELINE_DAYS_MIN / 7)

// Marge toujours conservée après la dernière tâche, dans l'unité de chaque vue
const MARGIN_RIGHT = { day: 60, week: 26, month: 18 }
// Unités ajoutées à chaque extension automatique (scroll proche du bord droit)
const EXTEND_STEP = { day: 30, week: 12, month: 6 }
// Garde-fou : plafond d'extension cumulée, pour éviter un défilement sans fin
const EXTEND_MAX = { day: 3650, week: 520, month: 120 }

const WEEK_WIDTH_BASE = 40
const MONTH_WIDTH_BASE = 80
export const HEADER_HEIGHT = 84
const HEADER_ROW_YEAR = 24
const HEADER_ROW_MONTH = 24
const BAR_PAD = 4
const WEEKEND_RATIO = 0.35

// ── Fonctions géométrie variable (colonnes week-end réduites) ─────────────────

function xAtDate(date, dateRef, dayPositions) {
  const offset = Math.round((date.getTime() - dateRef.getTime()) / (1000 * 3600 * 24))
  if (offset <= 0) return 0
  if (offset >= dayPositions.length - 1) return dayPositions[dayPositions.length - 1]
  return dayPositions[offset]
}

function barWidthAt(startDate, workingDays, dateRef, dayPositions, dayWidth) {
  if (workingDays <= 0) return dayWidth * WEEKEND_RATIO
  const lastDay = addWorkingDays(startDate, workingDays - 1)
  const dayAfter = new Date(lastDay)
  dayAfter.setDate(dayAfter.getDate() + 1)
  return Math.max(
    xAtDate(dayAfter, dateRef, dayPositions) - xAtDate(startDate, dateRef, dayPositions),
    dayWidth * WEEKEND_RATIO
  )
}

// ── Périodes bloquées (congés d'entreprises) ───────────────────────────────────

function isDateInPeriodes(date, periodes) {
  return periodes.some((p) => {
    const debut = parseDate(p.date_debut)
    const fin = parseDate(p.date_fin)
    return date >= debut && date <= fin
  })
}

// Comme addWorkingDays, mais saute aussi les jours tombant dans une période bloquée
function addWorkingDaysBlocked(date, days, periodes) {
  if (days === 0) return new Date(date)
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (isWorkingDay(result) && !isDateInPeriodes(result, periodes)) added++
  }
  return result
}

// Largeur d'une barre en vue jour, en tenant compte des périodes bloquées
// (la barre s'étend visuellement pour « sauter » les congés, comme les week-ends)
function barWidthAtBlocked(startDate, workingDays, dateRef, dayPositions, dayWidth, periodes) {
  if (workingDays <= 0) return dayWidth * WEEKEND_RATIO
  const lastDay = addWorkingDaysBlocked(startDate, workingDays - 1, periodes)
  const dayAfter = new Date(lastDay)
  dayAfter.setDate(dayAfter.getDate() + 1)
  return Math.max(
    xAtDate(dayAfter, dateRef, dayPositions) - xAtDate(startDate, dateRef, dayPositions),
    dayWidth * WEEKEND_RATIO
  )
}

// ── Fonctions géométrie vue semaine ────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

// Index de semaine (snappé) depuis la date de référence (toujours un lundi)
function weekIndexFromRef(date, dateRef) {
  const diffDays = Math.floor((date.getTime() - dateRef.getTime()) / (1000 * 3600 * 24))
  return Math.floor(diffDays / 7)
}

function xAtDateWeekSnapped(date, dateRef, weekWidth) {
  return weekIndexFromRef(date, dateRef) * weekWidth
}

// Position continue (non snappée), utilisée pour les jalons et le marqueur « aujourd'hui »
function xAtDateWeekContinuous(date, dateRef, weekWidth) {
  const diffDays = (date.getTime() - dateRef.getTime()) / (1000 * 3600 * 24)
  return (diffDays / 7) * weekWidth
}

function barWidthAtWeek(duree, weekWidth) {
  return Math.max(1, Math.ceil(duree / 7)) * weekWidth
}

// ── Fonctions géométrie vue mois ───────────────────────────────────────────────

// Détermine la liste des mois à afficher (bornée par les tâches + segments, avec
// une marge droite de MARGIN_RIGHT.month mois, plus `extraMonths` si l'utilisateur
// a fait défiler jusqu'au bord droit)
function buildMonthsList(tasks, segments, extraMonths = 0) {
  let minDate = null, maxDate = null
  const items = [
    ...tasks.map((t) => ({ debut: t.debut, duree: t.duree })),
    ...segments.map((s) => ({ debut: s.date_debut, duree: s.duree_jours })),
  ]
  items.forEach(({ debut, duree }) => {
    if (!debut) return
    const start = parseDate(debut)
    const end = new Date(start)
    end.setDate(end.getDate() + (duree ?? 30))
    if (!minDate || start < minDate) minDate = start
    if (!maxDate || end > maxDate) maxDate = end
  })

  if (!minDate) {
    const now = new Date()
    minDate = new Date(now.getFullYear(), now.getMonth(), 1)
    maxDate = minDate
  }

  let cur = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1)
  const limit = new Date(
    maxDate.getFullYear(),
    maxDate.getMonth() + 1 + MARGIN_RIGHT.month + extraMonths,
    1
  )

  const months = []
  while (cur < limit) {
    months.push({
      year: cur.getFullYear(),
      month: cur.getMonth(),
      label: cur.toLocaleDateString('fr-FR', { month: 'short' }),
      labelLong: cur.toLocaleDateString('fr-FR', { month: 'long' }),
    })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return months
}

function xAtDateMonth(date, months, monthWidth) {
  const refMois = months[0]
  if (!refMois) return 0
  const totalMonths = (date.getFullYear() - refMois.year) * 12 + (date.getMonth() - refMois.month)
  const dayOfMonth = date.getDate()
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const fraction = dayOfMonth / daysInMonth
  return (totalMonths + fraction) * monthWidth
}

function barWidthAtMonth(dureeJours, monthWidth) {
  return Math.max(monthWidth * 0.1, ((dureeJours ?? 1) / 30) * monthWidth)
}

// ── Géométrie unifiée jour / semaine / mois ────────────────────────────────────
//
// geo = { viewMode, dateRef, dayPositions, dayWidth, weekWidth, monthWidth, months }
//
// Largeur minimale garantie pour qu'une barre reste visible/cliquable à fort dézoom
const MIN_BAR_WIDTH = 2

function computeGeometry(startDate, duree, geo) {
  let result
  if (geo.viewMode === 'month') {
    result = { left: xAtDateMonth(startDate, geo.months, geo.monthWidth), width: barWidthAtMonth(duree, geo.monthWidth) }
  } else if (geo.viewMode === 'week') {
    result = { left: xAtDateWeekSnapped(startDate, geo.dateRef, geo.weekWidth), width: barWidthAtWeek(duree, geo.weekWidth) }
  } else {
    result = {
      left: xAtDate(startDate, geo.dateRef, geo.dayPositions),
      width: geo.periodes && geo.periodes.length > 0
        ? barWidthAtBlocked(startDate, duree, geo.dateRef, geo.dayPositions, geo.dayWidth, geo.periodes)
        : barWidthAt(startDate, duree, geo.dateRef, geo.dayPositions, geo.dayWidth),
    }
  }
  return { ...result, width: Math.max(MIN_BAR_WIDTH, result.width) }
}

function getTaskGeometry(task, geo) {
  return computeGeometry(parseDate(task.debut), task.duree, geo)
}

// Position/largeur d'une période bloquée. En vue jour, `xAtDate` est déjà précise
// au jour près. En semaine/mois, les barres de tâches sont alignées sur des
// colonnes entières (xAtDateWeekSnapped / mois) — une période bloquée doit suivre
// la même convention, sinon elle se rend comme une bande continue plus étroite
// que sa colonne et désalignée de la grille semaine/mois sous-jacente.
function periodeGeometry(dateDebut, dateFinInclusive, geo) {
  const WEEK_MS = 7 * 24 * 3600 * 1000
  if (geo.viewMode === 'week') {
    const leftIdx = Math.floor((dateDebut.getTime() - geo.dateRef.getTime()) / WEEK_MS)
    const rightIdx = Math.ceil((dateFinInclusive.getTime() - geo.dateRef.getTime()) / WEEK_MS)
    return {
      left: leftIdx * geo.weekWidth,
      width: Math.max(geo.weekWidth, (rightIdx - leftIdx) * geo.weekWidth),
    }
  }
  if (geo.viewMode === 'month') {
    const monthIndexOf = (d) => {
      const m0 = geo.months[0]
      if (!m0) return 0
      return (d.getFullYear() - m0.year) * 12 + (d.getMonth() - m0.month)
    }
    const leftIdx = monthIndexOf(dateDebut)
    const finMonthIdx = monthIndexOf(dateFinInclusive)
    // dateFinInclusive tombant pile le 1er du mois ⇒ ce mois n'est pas couvert
    const rightIdx = dateFinInclusive.getDate() === 1 ? finMonthIdx : finMonthIdx + 1
    return {
      left: leftIdx * geo.monthWidth,
      width: Math.max(geo.monthWidth, (rightIdx - leftIdx) * geo.monthWidth),
    }
  }
  const left = xAtDate(dateDebut, geo.dateRef, geo.dayPositions)
  return { left, width: Math.max(4, xAtDate(dateFinInclusive, geo.dateRef, geo.dayPositions) - left) }
}

// ── Création de tâche par cliquer-glisser ──────────────────────────────────────

// Inverse de xAtDate/xAtDateWeekSnapped/xAtDateMonth : convertit une position en
// pixels (dans le référentiel du contenu de la timeline, pas de la fenêtre) en
// date, selon le mode de vue actif.
function dateForX(x, geo) {
  if (geo.viewMode === 'month') {
    const idx = Math.floor(x / geo.monthWidth)
    const m0 = geo.months[0]
    if (!m0) return new Date(geo.dateRef)
    return new Date(m0.year, m0.month + idx, 1)
  }
  if (geo.viewMode === 'week') {
    const idx = Math.floor(x / geo.weekWidth)
    const d = new Date(geo.dateRef)
    d.setDate(d.getDate() + idx * 7)
    return d
  }
  // Vue jour : recherche dans dayPositions (paliers cumulés, colonnes week-end réduites)
  const { dayPositions, dateRef } = geo
  let idx = 0
  while (idx < dayPositions.length - 1 && dayPositions[idx + 1] <= x) idx++
  const d = new Date(dateRef)
  d.setDate(d.getDate() + idx)
  return d
}

// Retrouve le lot/zone et le haut de ligne (en px) sous un Y donné, pour amorcer
// un dessin de tâche. Un clic sur un header (lot ou zone) ou hors de toute ligne
// ne démarre rien (retourne null).
function findDrawContext(y, { rows, lotsWithTasks, unassigned, rowHeight }) {
  if (y < 0) return null

  if (rows) {
    let cumY = 0
    for (const row of rows) {
      const h = row.type === 'header-zone' ? HEADER_HEIGHT : rowHeight
      if (y < cumY + h) {
        if (row.type !== 'task-row') return null
        return { lotId: row.lotId, zoneId: row.zoneId, rowTop: cumY }
      }
      cumY += h
    }
    return null
  }

  let cumY = 0
  for (const { lot, tasks: lotTasks } of lotsWithTasks) {
    if (y < cumY + rowHeight) return null // header du lot
    cumY += rowHeight
    if (y < cumY + lotTasks.length * rowHeight) {
      return { lotId: lot.id, zoneId: null, rowTop: cumY + Math.floor((y - cumY) / rowHeight) * rowHeight }
    }
    cumY += lotTasks.length * rowHeight
  }
  if (unassigned.length > 0) {
    if (y < cumY + rowHeight) return null // header "Sans lot"
    cumY += rowHeight
    if (y < cumY + unassigned.length * rowHeight) {
      return { lotId: null, zoneId: null, rowTop: cumY + Math.floor((y - cumY) / rowHeight) * rowHeight }
    }
  }
  return null
}

// ── Résolution générique tâche / segment (points de connexion, flèches) ───────

function sameEndpoint(a, b) {
  if (!a || !b || a.type !== b.type) return false
  return a.type === 'segment' ? a.segmentId === b.segmentId : a.taskId === b.taskId
}

function getEntityDateDuree(point, tasks, segments) {
  if (point.type === 'segment') {
    const seg = segments.find((s) => s.id === point.segmentId)
    return seg ? { debut: seg.date_debut, duree: seg.duree_jours } : null
  }
  const t = tasks.find((x) => x.id === point.taskId)
  return t ? { debut: t.debut, duree: t.duree } : null
}

// `rowIndexMap` est indexé par clés composites `task:<id>` / `segment:<id>` — en
// mode "par lot" un segment partage la ligne de sa tâche parente, en mode "par
// zone" une tâche et ses segments peuvent être répartis sur des lignes distinctes.
function rowKey(type, id) { return `${type}:${id}` }

// Géométrie + ligne d'une entité tâche/segment identifiée par (tacheId, segmentId)
function resolveEntityGeometry(tacheId, segmentId, tasks, segments, rowIndexMap, geo) {
  if (segmentId != null) {
    const seg = segments.find((s) => s.id === segmentId)
    if (!seg) return null
    const segGeo = computeGeometry(parseDate(seg.date_debut), seg.duree_jours, geo)
    const rowIdx = rowIndexMap[rowKey('segment', segmentId)]
    if (rowIdx === undefined) return null
    return { left: segGeo.left, width: segGeo.width, rowIdx }
  }
  const task = tasks.find((t) => t.id === tacheId)
  if (!task) return null
  const tGeo = getTaskGeometry(task, geo)
  const rowIdx = rowIndexMap[rowKey('task', tacheId)]
  if (rowIdx === undefined) return null
  return { left: tGeo.left, width: tGeo.width, rowIdx }
}

function taskLabel(taskId, tasks) {
  const t = tasks.find((x) => x.id === taskId)
  return t ? `${t.num_tache} – ${t.nom}` : '?'
}

function segmentLabel(segmentId, tasks, segments) {
  const seg = segments.find((s) => s.id === segmentId)
  if (!seg) return '?'
  const t = tasks.find((x) => x.id === seg.tache_id)
  return t ? `${t.num_tache} – ${t.nom} (segment)` : 'Segment'
}

// Décale une date de N jours ; en vue jour uniquement, on évite les week-ends
// (les vues semaine/mois traitent déjà les durées en jours calendaires simples)
function applyDeltaDays(origDate, deltaDays, viewMode) {
  const raw = new Date(origDate)
  raw.setDate(raw.getDate() + deltaDays)
  if (viewMode === 'day') {
    while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
  }
  return raw
}

// Recalcule la durée d'un resize par la poignée gauche pour que la date de fin
// (dernier jour ouvré) reste fixe, même si le décalage traverse un week-end.
// `origDuree - deltaDays` mélangeait un delta calendaire (pxToDays) avec une
// durée en jours ouvrés, ce qui faisait dériver la fin dès qu'un week-end
// était traversé — la barre semblait s'étendre des deux côtés.
function resizeLeftDuree(origDebut, origDuree, newDebut, minDuree) {
  const origLastDay = addWorkingDays(origDebut, origDuree - 1)
  return Math.max(minDuree, workingDaysBetween(newDebut, origLastDay) + 1)
}

// Aligne une date sur l'unité de la vue active après un drag (lundi en semaine, 1er du mois en mois)
function snapToView(date, viewMode) {
  if (viewMode === 'week') {
    const d = new Date(date)
    const day = d.getDay()
    if (day !== 1) {
      const diff = day === 0 ? -6 : 1 - day
      d.setDate(d.getDate() + diff)
    }
    return d
  }
  if (viewMode === 'month') {
    const d = new Date(date)
    if (d.getDate() > 15) {
      d.setMonth(d.getMonth() + 1, 1)
    } else {
      d.setDate(1)
    }
    return d
  }
  return date
}

function getBarColor(task, lot, zones, colorMode) {
  if (colorMode === 'zone') {
    if (task.zone_id) {
      const zone = zones.find((z) => z.id === task.zone_id)
      return zone?.couleur ?? '#C9C4C0'
    }
    return '#C9C4C0'
  }
  return lot?.couleur ?? '#94a3b8'
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#B8412C').replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function GanttTimeline({
  tasks, lots, rows = null, dayWidth, rowHeight, showConnections,
  jalons = [], onJalonClick,
  onTaskClick, onTaskUpdate, onDependencyCreate, onDependencyDelete,
  zones = [], colorMode = 'lot', viewMode = 'day', zoomLevel = 1,
  getSegmentsForTache, segments = [], updateSegmentLocal, onSegmentDateCommit,
  dependances = [], onSegmentDependencyCreate, onSegmentDependencyDelete,
  periodes = [], getNextWorkingDay, dragOverTaskId = null,
  drawMode = false, onDrawCreate, scrollRef = null,
}) {
  const weekWidth = WEEK_WIDTH_BASE * zoomLevel
  const monthWidth = MONTH_WIDTH_BASE * zoomLevel
  // ── Date référence ────────────────────────────────────────────────────────────
  const dateRef = useMemo(() => {
    if (tasks.length === 0) {
      const d = new Date(); d.setDate(d.getDate() - 7); return d
    }
    // Tenir compte des extensions d'appro (à gauche de la barre)
    const minDate = tasks.reduce((min, t) => {
      let d = parseDate(t.debut)
      if (t.appro_actif && t.appro_duree) d = addWorkingDays(d, -t.appro_duree)
      return d < min ? d : min
    }, new Date(8640000000000000))
    minDate.setDate(minDate.getDate() - 5)
    while (minDate.getDay() !== 1) minDate.setDate(minDate.getDate() - 1)
    return minDate
  }, [tasks])

  // ── Étendue de la timeline ────────────────────────────────────────────────────
  //
  // La plage n'est pas figée : elle est recalculée dès qu'une tâche ou un segment
  // est ajouté/déplacé, et conserve toujours une large marge après la dernière
  // date occupée (MARGIN_RIGHT). `extraUnitsRight` s'y ajoute quand l'utilisateur
  // défile jusqu'au bord droit.
  const [extraUnitsRight, setExtraUnitsRight] = useState(0)

  useEffect(() => { setExtraUnitsRight(0) }, [viewMode])

  // Date de fin la plus tardive parmi les tâches et les segments
  const maxEndDate = useMemo(() => {
    let maxEnd = new Date()
    tasks.forEach((task) => {
      if (!task.debut) return
      const end = addWorkingDays(parseDate(task.debut), task.duree ?? 0)
      if (end > maxEnd) maxEnd = new Date(end)
    })
    segments.forEach((seg) => {
      if (!seg.date_debut) return
      const end = parseDate(seg.date_debut)
      end.setDate(end.getDate() + (seg.duree_jours ?? 0))
      if (end > maxEnd) maxEnd = new Date(end)
    })
    return maxEnd
  }, [tasks, segments])

  const dayCount = useMemo(() => {
    const end = new Date(maxEndDate)
    end.setDate(end.getDate() + MARGIN_RIGHT.day)
    const n = Math.ceil((end.getTime() - dateRef.getTime()) / 86400000)
    return Math.max(TIMELINE_DAYS_MIN, n) + (viewMode === 'day' ? extraUnitsRight : 0)
  }, [maxEndDate, dateRef, viewMode, extraUnitsRight])

  const weekCount = useMemo(() => {
    const end = new Date(maxEndDate)
    end.setDate(end.getDate() + MARGIN_RIGHT.week * 7)
    const n = Math.ceil((end.getTime() - dateRef.getTime()) / (7 * 86400000))
    return Math.max(TIMELINE_WEEKS_MIN, n) + (viewMode === 'week' ? extraUnitsRight : 0)
  }, [maxEndDate, dateRef, viewMode, extraUnitsRight])

  // ── Positions X précalculées pour chaque jour (colonnes variables) ────────────
  const dayPositions = useMemo(() => {
    const pos = new Array(dayCount + 1)
    pos[0] = 0
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(dateRef)
      d.setDate(d.getDate() + i)
      const isWE = d.getDay() === 0 || d.getDay() === 6
      pos[i + 1] = pos[i] + (isWE ? dayWidth * WEEKEND_RATIO : dayWidth)
    }
    return pos
  }, [dateRef, dayWidth, dayCount])

  // ── Semaines précalculées (vue semaine) ───────────────────────────────────────
  const weeks = useMemo(() =>
    Array.from({ length: weekCount }, (_, i) => {
      const d = new Date(dateRef); d.setDate(d.getDate() + i * 7); return d
    }), [dateRef, weekCount])

  const yearSegments = useMemo(() => {
    const segs = []
    weeks.forEach((weekStart, i) => {
      const year = weekStart.getFullYear()
      const last = segs[segs.length - 1]
      if (last && last.year === year) {
        last.width += weekWidth
      } else {
        segs.push({ year, x: i * weekWidth, width: weekWidth })
      }
    })
    return segs
  }, [weeks, weekWidth])

  // Groupement des semaines par mois (3e ligne du header en vue semaine)
  const monthGroups = useMemo(() => {
    const groups = []
    weeks.forEach((weekStart, i) => {
      const label = weekStart.toLocaleDateString('fr-FR', { month: 'long' })
      const year = weekStart.getFullYear()
      const last = groups[groups.length - 1]
      if (last && last.label === label && last.year === year) {
        last.width += weekWidth
      } else {
        groups.push({ label, year, x: i * weekWidth, width: weekWidth })
      }
    })
    return groups
  }, [weeks, weekWidth])

  const currentWeekIndex = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return weekIndexFromRef(today, dateRef)
  }, [dateRef])

  // ── Mois précalculés (vue mois) ────────────────────────────────────────────────
  const months = useMemo(
    () => buildMonthsList(tasks, segments, viewMode === 'month' ? extraUnitsRight : 0),
    [tasks, segments, viewMode, extraUnitsRight]
  )

  const monthYearSegments = useMemo(() => {
    const segs = []
    months.forEach((m, i) => {
      const last = segs[segs.length - 1]
      if (last && last.year === m.year) {
        last.width += monthWidth
      } else {
        segs.push({ year: m.year, x: i * monthWidth, width: monthWidth })
      }
    })
    return segs
  }, [months, monthWidth])

  const currentMonthIndex = useMemo(() => {
    const today = new Date()
    return months.findIndex((m) => m.year === today.getFullYear() && m.month === today.getMonth())
  }, [months])

  const totalWidth = viewMode === 'month'
    ? months.length * monthWidth
    : viewMode === 'week'
      ? weekCount * weekWidth
      : dayPositions[dayCount]

  const days = useMemo(() =>
    Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(dateRef); d.setDate(d.getDate() + i); return d
    }), [dateRef, dayCount])

  // ── Extension automatique à l'approche du bord droit ──────────────────────────
  // Le conteneur scrollable appartient au parent (GanttChart) et nous est passé
  // via `scrollRef` ; on s'y branche pour étendre la plage de quelques unités dès
  // que la fin du contenu est à moins de 3 colonnes.
  const handleScroll = useCallback(() => {
    const el = scrollRef?.current
    if (!el) return
    const distFromEnd = el.scrollWidth - el.scrollLeft - el.clientWidth
    const colW = viewMode === 'day' ? dayWidth : viewMode === 'week' ? weekWidth : monthWidth
    if (distFromEnd >= colW * 3) return
    setExtraUnitsRight((prev) =>
      prev >= EXTEND_MAX[viewMode] ? prev : prev + EXTEND_STEP[viewMode]
    )
  }, [scrollRef, viewMode, dayWidth, weekWidth, monthWidth])

  useEffect(() => {
    const el = scrollRef?.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [scrollRef, handleScroll])

  // Contexte géométrique unifié, passé à computeGeometry/getTaskGeometry
  const geo = useMemo(() => ({
    viewMode, dateRef, dayPositions, dayWidth, weekWidth, monthWidth, months, periodes,
  }), [viewMode, dateRef, dayPositions, dayWidth, weekWidth, monthWidth, months, periodes])

  // ── Séparations de mois (trait épais) ─────────────────────────────────────────
  //
  // Une seule liste de positions X, partagée par le header et la grille de fond :
  // les deux traits sont ainsi garantis au même pixel. Auparavant le header les
  // dessinait en `border-right` (bord DROIT de la colonne de début de mois) alors
  // que la grille les positionnait en absolu sur le bord GAUCHE de cette même
  // colonne — d'où un décalage d'une colonne entière entre les deux.
  const monthStartPositions = useMemo(() => {
    const positions = []
    if (viewMode === 'month') {
      months.forEach((_, i) => { if (i > 0) positions.push(i * monthWidth) })
    } else if (viewMode === 'week') {
      weeks.forEach((weekStart, i) => {
        if (i > 0 && weekStart.getMonth() !== weeks[i - 1].getMonth()) {
          positions.push(i * weekWidth)
        }
      })
    } else {
      days.forEach((day, i) => {
        if (i > 0 && day.getDate() === 1) positions.push(dayPositions[i])
      })
    }
    return positions
  }, [viewMode, months, monthWidth, weeks, weekWidth, days, dayPositions])

  const lotsWithTasks = useMemo(() =>
    lots.map((lot) => ({ lot, tasks: tasks.filter((t) => t.lot_id === lot.id) }))
        .filter(({ tasks }) => tasks.length > 0),
    [lots, tasks])

  const unassigned = useMemo(() => tasks.filter((t) => t.lot_id == null), [tasks])

  // Index de ligne par lot (même ordre que sidebar), clés composites task:<id> /
  // segment:<id> — un segment partage la ligne de sa tâche parente en mode lot.
  const rowIndexMapLot = useMemo(() => {
    const map = {}
    let idx = 0
    lotsWithTasks.forEach(({ tasks: lt }) => {
      idx++
      lt.forEach((t) => {
        map[rowKey('task', t.id)] = idx
        segments.filter((s) => s.tache_id === t.id).forEach((s) => { map[rowKey('segment', s.id)] = idx })
        idx++
      })
    })
    if (unassigned.length > 0) {
      idx++
      unassigned.forEach((t) => {
        map[rowKey('task', t.id)] = idx
        segments.filter((s) => s.tache_id === t.id).forEach((s) => { map[rowKey('segment', s.id)] = idx })
        idx++
      })
    }
    return map
  }, [lotsWithTasks, unassigned, segments])

  const totalBodyRowsLot = useMemo(() => {
    let n = 0
    lotsWithTasks.forEach(({ tasks: lt }) => { n += 1 + lt.length })
    if (unassigned.length > 0) n += 1 + unassigned.length
    return n
  }, [lotsWithTasks, unassigned])

  // ── Mode "par zone" : lignes précalculées par le parent (prop `rows`) ─────────
  // Hauteur variable par ligne (header de zone = HEADER_HEIGHT, ligne tâche = rowHeight).
  const rowOffsetsZone = useMemo(() => {
    if (!rows) return null
    const offsets = new Array(rows.length)
    let y = 0
    rows.forEach((r, i) => {
      offsets[i] = y
      y += r.type === 'header-zone' ? HEADER_HEIGHT : rowHeight
    })
    return offsets
  }, [rows, rowHeight])

  const rowIndexMapZone = useMemo(() => {
    if (!rows) return null
    const map = {}
    rows.forEach((r, idx) => {
      if (r.type !== 'task-row') return
      if (r.showMainBar !== false) map[rowKey('task', r.task.id)] = idx
      r.visibleSegmentIds.forEach((segId) => { map[rowKey('segment', segId)] = idx })
    })
    return map
  }, [rows])

  const rowIndexMap = rows ? rowIndexMapZone : rowIndexMapLot

  // Position Y (haut de ligne) d'un index de ligne, quel que soit le mode
  const rowY = useCallback(
    (idx) => (rows ? rowOffsetsZone[idx] : idx * rowHeight),
    [rows, rowOffsetsZone, rowHeight]
  )

  const totalBodyHeight = rows
    ? (rows.length > 0
        ? rowOffsetsZone[rows.length - 1] + (rows[rows.length - 1].type === 'header-zone' ? HEADER_HEIGHT : rowHeight)
        : 0)
    : totalBodyRowsLot * rowHeight

  // ── Drag barre ────────────────────────────────────────────────────────────────
  const barDragRef = useRef(null)
  const [draggingBar, setDraggingBar] = useState(null)

  // Largeur journalière moyenne pondérée (pour conversion px → deltaDays en vue jour)
  const avgDayWidth = dayWidth * (5 + 2 * WEEKEND_RATIO) / 7

  // Conversion px → jours, quel que soit le mode d'affichage
  const pxToDays = useCallback((dx) => {
    if (viewMode === 'month') return Math.round((dx / monthWidth) * 30)
    if (viewMode === 'week') return Math.round((dx / weekWidth) * 7)
    return Math.round(dx / avgDayWidth)
  }, [viewMode, weekWidth, monthWidth, avgDayWidth])

  const startBarDrag = useCallback((e, task, type) => {
    if (drawMode) return
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    barDragRef.current = {
      type, taskId: task.id, startX: e.clientX,
      origDebut: parseDate(task.debut), origDuree: task.duree,
      moved: false,
    }
    setDraggingBar(task.id)
    document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [drawMode])

  // ── Drag segment ──────────────────────────────────────────────────────────────
  const [draggingSegment, setDraggingSegment] = useState(null)
  // { segmentId, tacheId, startX, originalDateDebut }
  const segmentDragRef = useRef({ moved: false })

  const handleSegmentMouseDown = useCallback((e, segment) => {
    if (drawMode) return
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    segmentDragRef.current = { moved: false }
    setDraggingSegment({
      segmentId: segment.id,
      tacheId: segment.tache_id,
      startX: e.clientX,
      originalDateDebut: segment.date_debut,
    })
  }, [drawMode])

  useEffect(() => {
    if (!draggingSegment) return

    const handleMouseMove = (e) => {
      const dx = e.clientX - draggingSegment.startX
      if (Math.abs(dx) > 3) segmentDragRef.current.moved = true

      const deltaDays = pxToDays(dx)
      if (deltaDays === 0) return

      const original = parseDate(draggingSegment.originalDateDebut)
      const newDate = new Date(original)
      newDate.setDate(newDate.getDate() + deltaDays)

      updateSegmentLocal?.(draggingSegment.segmentId, { date_debut: formatDateISO(newDate) })
    }

    const handleMouseUp = async () => {
      const seg = segments.find((s) => s.id === draggingSegment.segmentId)
      if (seg) {
        let finalDate = snapToView(parseDate(seg.date_debut), viewMode)
        if (getNextWorkingDay) finalDate = getNextWorkingDay(finalDate)
        const snapped = formatDateISO(finalDate)
        if (snapped !== seg.date_debut) updateSegmentLocal?.(draggingSegment.segmentId, { date_debut: snapped })
        await onSegmentDateCommit?.(draggingSegment.segmentId, snapped)
      }
      setDraggingSegment(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingSegment, segments, viewMode, pxToDays, updateSegmentLocal, onSegmentDateCommit, getNextWorkingDay])

  // ── Connexion chemin critique ──────────────────────────────────────────────────
  const [connectingFrom, setConnectingFrom] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredArrowId, setHoveredArrowId] = useState(null)
  const [deletingArrow, setDeletingArrow] = useState(null)
  const svgRef = useRef(null)

  // ── Création de tâche par cliquer-glisser ──────────────────────────────────────
  // { startDate, currentDate, lotId, zoneId, rowTop } — état local, propre au geste
  // en cours ; seul le résultat final (au mouseup) remonte au parent via onDrawCreate.
  const [drawState, setDrawState] = useState(null)
  const containerRef = useRef(null)

  // Un changement de mode (activation/désactivation) doit annuler tout geste ou
  // toute connexion de dépendance en cours, pour éviter des états ambigus.
  useEffect(() => {
    if (drawMode) setConnectingFrom(null)
    else setDrawState(null)
  }, [drawMode])

  const handleDrawMouseDown = useCallback((e) => {
    if (!drawMode || e.button !== 0) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top - HEADER_HEIGHT

    const ctx = findDrawContext(y, { rows, lotsWithTasks, unassigned, rowHeight })
    if (!ctx) return // clic sur un header ou hors de toute ligne
    e.preventDefault()

    const startDate = formatDateISO(dateForX(x, geo))
    setDrawState({ startDate, currentDate: startDate, lotId: ctx.lotId, zoneId: ctx.zoneId, rowTop: ctx.rowTop })
  }, [drawMode, rows, lotsWithTasks, unassigned, rowHeight, geo])

  useEffect(() => {
    if (!drawState) return

    const handleMouseMove = (e) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const currentDate = formatDateISO(dateForX(x, geo))
      setDrawState((prev) => (prev ? { ...prev, currentDate } : prev))
    }

    const handleMouseUp = () => {
      setDrawState((prev) => {
        if (prev) {
          const d1 = parseDate(prev.startDate)
          const d2 = parseDate(prev.currentDate)
          const debutDate = d1 <= d2 ? d1 : d2
          const finDate = d1 <= d2 ? d2 : d1
          let duree = workingDaysBetween(debutDate, finDate) + (isWorkingDay(debutDate) ? 1 : 0)
          if (duree < 1) duree = 1
          const finalDebut = getNextWorkingDay ? getNextWorkingDay(debutDate) : debutDate
          onDrawCreate?.({
            debut: formatDateISO(finalDebut),
            duree,
            lot_id: prev.lotId,
            zone_id: prev.zoneId,
          })
        }
        return null
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [drawState, geo, getNextWorkingDay, onDrawCreate])

  // ── Flèches permanentes ───────────────────────────────────────────────────────
  // Deux sources : les dépendances tâche→tâche historiques (`depends_on`/`lag_days`)
  // et les dépendances étendues (`planning_dependances`), qui peuvent impliquer des segments.
  const arrows = useMemo(() => {
    const legacy = tasks
      .filter((t) => t.depends_on != null)
      .map((t) => {
        const fromTask = tasks.find((x) => x.id === t.depends_on)
        if (!fromTask) return null
        const fromGeo = getTaskGeometry(fromTask, geo)
        const toGeo = getTaskGeometry(t, geo)
        const fromRowIdx = rowIndexMap[rowKey('task', fromTask.id)]
        const toRowIdx = rowIndexMap[rowKey('task', t.id)]
        if (fromRowIdx === undefined || toRowIdx === undefined) return null
        return {
          id: `task-${fromTask.id}-${t.id}`,
          kind: 'legacy',
          fromTaskId: fromTask.id,
          toTaskId: t.id,
          fromLabel: `${fromTask.num_tache} – ${fromTask.nom}`,
          toLabel: `${t.num_tache} – ${t.nom}`,
          fromX: fromGeo.left + fromGeo.width,
          fromY: rowY(fromRowIdx) + (rowHeight - BAR_PAD),
          toX: toGeo.left,
          toY: rowY(toRowIdx) + (rowHeight - BAR_PAD),
        }
      })
      .filter(Boolean)

    const extended = dependances
      .map((dep) => {
        const from = resolveEntityGeometry(dep.source_tache_id, dep.source_segment_id, tasks, segments, rowIndexMap, geo)
        const to = resolveEntityGeometry(dep.cible_tache_id, dep.cible_segment_id, tasks, segments, rowIndexMap, geo)
        if (!from || !to) return null
        return {
          id: `dep-${dep.id}`,
          kind: 'dependance',
          dependanceId: dep.id,
          fromLabel: dep.source_segment_id
            ? segmentLabel(dep.source_segment_id, tasks, segments)
            : taskLabel(dep.source_tache_id, tasks),
          toLabel: dep.cible_segment_id
            ? segmentLabel(dep.cible_segment_id, tasks, segments)
            : taskLabel(dep.cible_tache_id, tasks),
          fromX: from.left + from.width,
          fromY: rowY(from.rowIdx) + (rowHeight - BAR_PAD),
          toX: to.left,
          toY: rowY(to.rowIdx) + (rowHeight - BAR_PAD),
        }
      })
      .filter(Boolean)

    return [...legacy, ...extended]
  }, [tasks, segments, dependances, rowIndexMap, rowHeight, geo, rowY])

  // ── Mouse handlers ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (barDragRef.current) {
      const { type, taskId, startX, origDebut, origDuree } = barDragRef.current
      const dx = e.clientX - startX
      const deltaDays = pxToDays(dx)
      if (Math.abs(dx) > 3) barDragRef.current.moved = true

      const minDuree = viewMode === 'month' ? 5 : 1
      let newDebut = origDebut, newDuree = origDuree
      if (type === 'move') {
        newDebut = applyDeltaDays(origDebut, deltaDays, viewMode)
      } else if (type === 'resize-right') {
        newDuree = Math.max(minDuree, origDuree + deltaDays)
      } else if (type === 'resize-left') {
        const shift = Math.min(deltaDays, origDuree - minDuree)
        newDebut = applyDeltaDays(origDebut, shift, viewMode)
        newDuree = viewMode === 'day'
          ? resizeLeftDuree(origDebut, origDuree, newDebut, minDuree)
          : Math.max(minDuree, origDuree - deltaDays)
      }
      const el = document.querySelector(`[data-taskid="${taskId}"]`)
      if (el) {
        const previewGeo = computeGeometry(newDebut, newDuree, geo)
        el.style.left = `${previewGeo.left}px`
        el.style.width = `${previewGeo.width}px`
      }
    }
    if (connectingFrom && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [pxToDays, viewMode, geo, connectingFrom])

  const handleMouseUp = useCallback((e) => {
    if (barDragRef.current) {
      const { type, taskId, startX, origDebut, origDuree, moved } = barDragRef.current
      if (moved) {
        const dx = e.clientX - startX
        const deltaDays = pxToDays(dx)
        const minDuree = viewMode === 'month' ? 5 : 1
        let newDebut = origDebut, newDuree = origDuree
        if (type === 'move') {
          newDebut = snapToView(applyDeltaDays(origDebut, deltaDays, viewMode), viewMode)
          if (getNextWorkingDay) newDebut = getNextWorkingDay(newDebut)
        } else if (type === 'resize-right') {
          newDuree = Math.max(minDuree, origDuree + deltaDays)
        } else if (type === 'resize-left') {
          const shift = Math.min(deltaDays, origDuree - minDuree)
          newDebut = applyDeltaDays(origDebut, shift, viewMode)
          if (getNextWorkingDay) newDebut = getNextWorkingDay(newDebut)
          newDuree = viewMode === 'day'
            ? resizeLeftDuree(origDebut, origDuree, newDebut, minDuree)
            : Math.max(minDuree, origDuree - deltaDays)
        }
        if (formatDateISO(newDebut) !== formatDateISO(origDebut) || newDuree !== origDuree) {
          onTaskUpdate(taskId, { debut: formatDateISO(newDebut), duree: newDuree })
        }
      }
      barDragRef.current = null
      setDraggingBar(null)
      document.body.style.cursor = ''
    }
    if (connectingFrom && !hoveredPoint) setConnectingFrom(null)
  }, [pxToDays, viewMode, onTaskUpdate, connectingFrom, hoveredPoint, getNextWorkingDay])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setConnectingFrom(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const handleConnectionPointClick = useCallback((e, point) => {
    e.preventDefault(); e.stopPropagation()
    if (!connectingFrom) {
      if (point.side === 'end') {
        setConnectingFrom(point)
        if (svgRef.current) {
          const rect = svgRef.current.getBoundingClientRect()
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }
      }
    } else {
      if (point.side === 'start' && !sameEndpoint(connectingFrom, point)) {
        const fromInfo = getEntityDateDuree(connectingFrom, tasks, segments)
        const toInfo = getEntityDateDuree(point, tasks, segments)
        const lag = (fromInfo && toInfo)
          ? computeLag(parseDate(fromInfo.debut), fromInfo.duree, parseDate(toInfo.debut))
          : 1

        if (connectingFrom.type === 'task' && point.type === 'task') {
          const exists = tasks.find((t) => t.id === point.taskId && t.depends_on === connectingFrom.taskId)
          if (!exists) onDependencyCreate(connectingFrom.taskId, point.taskId, lag)
        } else {
          onSegmentDependencyCreate?.({
            sourceTacheId: connectingFrom.type === 'task' ? connectingFrom.taskId : null,
            sourceSegmentId: connectingFrom.type === 'segment' ? connectingFrom.segmentId : null,
            cibleTacheId: point.type === 'task' ? point.taskId : null,
            cibleSegmentId: point.type === 'segment' ? point.segmentId : null,
            lagJours: lag,
          })
        }
      }
      setConnectingFrom(null)
    }
  }, [connectingFrom, tasks, segments, onDependencyCreate, onSegmentDependencyCreate])

  // Position d'une date, quel que soit le mode d'affichage (jour / semaine / mois)
  const getX = useCallback((date) => {
    if (viewMode === 'month') return xAtDateMonth(date, months, monthWidth)
    if (viewMode === 'week') return xAtDateWeekContinuous(date, dateRef, weekWidth)
    return xAtDate(date, dateRef, dayPositions)
  }, [viewMode, dateRef, dayPositions, weekWidth, monthWidth, months])

  const todayOffset = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return getX(today)
  }, [getX])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', userSelect: 'none', width: totalWidth, minWidth: totalWidth,
        cursor: drawMode ? 'crosshair' : 'default',
      }}
      onMouseDown={handleDrawMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, height: HEADER_HEIGHT,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        backgroundColor: 'rgba(245,242,240,0.95)',
        backdropFilter: 'blur(4px)',
      }}>
        {viewMode === 'month' ? (
          <>
            {/* Années */}
            <div style={{ position: 'relative', height: HEADER_ROW_YEAR, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              {monthYearSegments.map((seg) => (
                <div key={seg.year} style={{
                  position: 'absolute', top: 0, bottom: 0, left: seg.x, width: seg.width,
                  display: 'flex', alignItems: 'center', paddingLeft: 8,
                  backgroundColor: '#F5F2F0',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#E8602C',
                  }}>
                    {seg.year}
                  </span>
                </div>
              ))}
            </div>
            {/* Mois */}
            <div style={{ display: 'flex', height: 36, alignItems: 'center' }}>
              {months.map((m, i) => {
                const isCurrentMonth = i === currentMonthIndex
                return (
                  <div key={i} style={{
                    width: monthWidth, minWidth: monthWidth, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    // Le trait épais de séparation des mois est dessiné en overlay
                    // (monthStartPositions), commun au header et à la grille.
                    borderRight: '0.5px solid rgba(0,0,0,0.08)',
                    backgroundColor: isCurrentMonth ? '#FAF0EB' : 'transparent',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: isCurrentMonth ? 700 : 600,
                      textTransform: 'capitalize',
                      color: isCurrentMonth ? '#E8602C' : '#1F1B17',
                    }}>
                      {m.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        ) : viewMode === 'week' ? (
          <>
            {/* Années */}
            <div style={{ position: 'relative', height: HEADER_ROW_YEAR, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              {yearSegments.map((seg) => (
                <div key={seg.year} style={{
                  position: 'absolute', top: 0, bottom: 0, left: seg.x, width: seg.width,
                  display: 'flex', alignItems: 'center', paddingLeft: 8,
                  backgroundColor: '#F5F2F0',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#E8602C',
                  }}>
                    {seg.year}
                  </span>
                </div>
              ))}
            </div>
            {/* Mois */}
            <div style={{ position: 'relative', height: HEADER_ROW_MONTH, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              {monthGroups.map((g, i) => (
                <div key={`${g.year}-${g.label}-${i}`} style={{
                  position: 'absolute', top: 0, bottom: 0, left: g.x, width: g.width,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#FAF7F2', border: '0.5px solid #E9E2D6',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, textTransform: 'capitalize', color: '#1F1B17',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px',
                  }}>
                    {g.label}
                  </span>
                </div>
              ))}
            </div>
            {/* Semaines */}
            <div style={{ display: 'flex', height: 36, alignItems: 'center' }}>
              {weeks.map((weekStart, i) => {
                const isCurrentWeek = i === currentWeekIndex
                return (
                  <div key={i} style={{
                    width: weekWidth, minWidth: weekWidth, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: '0.5px solid rgba(0,0,0,0.08)',
                    backgroundColor: isCurrentWeek ? '#FAF0EB' : 'transparent',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: isCurrentWeek ? 700 : 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: isCurrentWeek ? '#E8602C' : '#1F1B17',
                    }}>
                      S{getISOWeek(weekStart)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {/* Mois */}
            <div style={{ position: 'relative', height: 28, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              {days.map((day, i) => {
                if (day.getDate() !== 1 && i !== 0) return null
                return (
                  <div key={i} style={{
                    position: 'absolute', top: 0, bottom: 0, left: dayPositions[i],
                    display: 'flex', alignItems: 'center', paddingLeft: 8,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color: '#E8602C',
                    }}>
                      {day.toLocaleDateString('fr-FR', { month: i === 0 ? 'short' : 'long', year: 'numeric' })}
                    </span>
                  </div>
                )
              })}
            </div>
            {/* Jours */}
            <div style={{ display: 'flex', height: 36, alignItems: 'flex-end', paddingBottom: 4 }}>
              {days.map((day, i) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isToday = day.toDateString() === new Date().toDateString()
                const colWidth = isWeekend ? dayWidth * WEEKEND_RATIO : dayWidth
                const isMonday = day.getDay() === 1
                const borderRight = isMonday
                  ? '0.5px solid rgba(0,0,0,0.15)'
                  : '0.5px solid rgba(0,0,0,0.08)'
                return (
                  <div key={i} style={{
                    width: colWidth, minWidth: colWidth, flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                    paddingBottom: 2, borderRight,
                    backgroundColor: isToday ? 'rgba(224,90,30,0.1)' : isWeekend ? 'rgba(0,0,0,0.05)' : 'transparent',
                  }}>
                    {colWidth >= 14 && (
                      <span style={{
                        fontSize: 9, fontWeight: isToday ? 700 : 500, lineHeight: 1,
                        color: isToday ? '#E8602C' : isWeekend ? 'rgba(155,143,133,0.5)' : '#9C9591',
                      }}>
                        {day.toLocaleDateString('fr-FR', { weekday: 'narrow' })}
                      </span>
                    )}
                    {colWidth >= 10 && (
                      <span style={{
                        fontSize: colWidth < 18 ? 8 : 10,
                        fontWeight: isToday ? 700 : 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: isToday ? '#E8602C' : isWeekend ? 'rgba(155,143,133,0.5)' : '#1F1B17',
                      }}>
                        {day.getDate()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
        {/* Séparations de mois — mêmes positions X que la grille du body */}
        {monthStartPositions.map((x, i) => (
          <div key={`ms-h-${i}`} style={{
            position: 'absolute', left: x - 1, top: 0, bottom: 0,
            width: 2, backgroundColor: 'rgba(0,0,0,0.25)',
            pointerEvents: 'none', zIndex: 4,
          }} />
        ))}

        {/* Indicateurs jalons dans le header */}
        {jalons.map(jalon => {
          const x = getX(parseDate(jalon.date))
          return (
            <div key={jalon.id} style={{
              position: 'absolute', left: x - 1, top: 0, bottom: 0,
              width: 2.5, backgroundColor: jalon.couleur, opacity: 0.5,
              pointerEvents: 'none', zIndex: 5,
            }} />
          )
        })}
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        {viewMode === 'month' ? (
          /* Month grid lines (chaque colonne est déjà un mois — le trait épais de
             séparation vient de monthStartPositions ci-dessus) */
          months.map((m, i) => (
            <div key={`gl-${i}`} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: i * monthWidth, width: 0.5,
              backgroundColor: 'rgba(0,0,0,0.08)',
              pointerEvents: 'none',
            }} />
          ))
        ) : viewMode === 'week' ? (
          /* Week grid lines */
          weeks.map((weekStart, i) => (
            <div key={`gl-${i}`} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: i * weekWidth, width: 0.5,
              backgroundColor: 'rgba(0,0,0,0.08)',
              pointerEvents: 'none',
            }} />
          ))
        ) : (
          <>
            {/* Weekend shading */}
            {days.map((day, i) => {
              if (day.getDay() !== 0 && day.getDay() !== 6) return null
              const colWidth = dayPositions[i + 1] - dayPositions[i]
              return (
                <div key={i} style={{
                  position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none',
                  left: dayPositions[i], width: colWidth,
                  backgroundColor: 'rgba(0,0,0,0.03)',
                }} />
              )
            })}

            {/* Day grid lines (le trait épais de début de mois vient de
                monthStartPositions, partagé avec le header) */}
            {days.map((day, i) => {
              const isMonday = day.getDay() === 1
              return (
                <div key={`gl-${i}`} style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: dayPositions[i],
                  width: 0.5,
                  backgroundColor: isMonday ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)',
                  pointerEvents: 'none',
                }} />
              )
            })}
          </>
        )}

        {/* Séparations de mois — mêmes positions X que le header (rendues après la
            grille fine pour ne pas être recouvertes par elle) */}
        {monthStartPositions.map((x, i) => (
          <div key={`ms-b-${i}`} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: x - 1, width: 2,
            backgroundColor: 'rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }} />
        ))}

        {/* Périodes bloquées — zones hachurées */}
        {periodes.map((periode) => {
          const dateDebut = parseDate(periode.date_debut)
          const dateFinInclusive = parseDate(periode.date_fin)
          dateFinInclusive.setDate(dateFinInclusive.getDate() + 1)
          const { left, width } = periodeGeometry(dateDebut, dateFinInclusive, geo)
          const couleur = periode.couleur || '#B8412C'
          return (
            <div
              key={periode.id}
              title={`${periode.label} — période bloquée`}
              style={{
                position: 'absolute', left, width, top: 0, bottom: 0,
                background: `repeating-linear-gradient(45deg, ${hexToRgba(couleur, 0.06)}, ${hexToRgba(couleur, 0.06)} 4px, ${hexToRgba(couleur, 0.12)} 4px, ${hexToRgba(couleur, 0.12)} 8px)`,
                borderLeft: `1.5px solid ${hexToRgba(couleur, 0.3)}`,
                borderRight: `1.5px solid ${hexToRgba(couleur, 0.3)}`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              <div style={{
                position: 'absolute', top: 4, left: 4,
                fontSize: 9, fontWeight: 500, color: hexToRgba(couleur, 0.7),
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: Math.max(width - 8, 0),
                pointerEvents: 'none',
              }}>
                {periode.label}
              </div>
            </div>
          )
        })}

        {/* Prévisualisation du dessin en cours (création de tâche) */}
        {drawState && (() => {
          const d1 = parseDate(drawState.startDate)
          const d2 = parseDate(drawState.currentDate)
          const startDate = d1 <= d2 ? d1 : d2
          const endDate = d1 <= d2 ? d2 : d1

          const endInclusive = new Date(endDate)
          if (viewMode === 'day') endInclusive.setDate(endInclusive.getDate() + 1)
          else if (viewMode === 'week') endInclusive.setDate(endInclusive.getDate() + 7)
          else endInclusive.setMonth(endInclusive.getMonth() + 1)

          const left = getX(startDate)
          const width = Math.max(8, getX(endInclusive) - left)
          const lot = lots.find((l) => l.id === drawState.lotId)
          const zone = zones.find((z) => z.id === drawState.zoneId)
          const couleur = zone?.couleur ?? lot?.couleur ?? '#E8602C'
          const dureeAffichee = Math.max(1, workingDaysBetween(startDate, endDate) + (isWorkingDay(startDate) ? 1 : 0))

          return (
            <div style={{
              position: 'absolute', left, width,
              top: drawState.rowTop + BAR_PAD, height: rowHeight - BAR_PAD * 2,
              background: couleur, opacity: 0.35,
              border: `2px solid ${couleur}`,
              pointerEvents: 'none', zIndex: 35,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {width > 40 && (
                <span style={{ fontSize: 10, fontWeight: 500, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                  {dureeAffichee}j
                </span>
              )}
            </div>
          )
        })()}

        {/* Jalons — lignes verticales */}
        {jalons.map(jalon => {
          const x = getX(parseDate(jalon.date))
          return (
            <div
              key={jalon.id}
              style={{
                position: 'absolute', left: x, top: 0, bottom: 0,
                width: 2.5, backgroundColor: jalon.couleur, opacity: 0.85,
                zIndex: 15, pointerEvents: 'auto', cursor: 'pointer',
              }}
              title={`${jalon.label} — ${new Date(jalon.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`}
              onClick={(e) => { e.stopPropagation(); onJalonClick?.(jalon) }}
            >
              <div style={{
                position: 'absolute', top: 4, left: 5,
                backgroundColor: jalon.couleur, color: 'white',
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                whiteSpace: 'nowrap', letterSpacing: '0.02em',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)', userSelect: 'none',
              }}>
                {jalon.label}
              </div>
              <div style={{
                position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderTop: `7px solid ${jalon.couleur}`, opacity: 0.85,
              }} />
            </div>
          )
        })}

        {rows ? (
          /* ── Mode "par zone" : lignes précalculées par le parent ────────────── */
          rows.map((row) => {
            if (row.type === 'header-zone') {
              return (
                <div key={row.id} style={{
                  height: HEADER_HEIGHT,
                  backgroundColor: row.couleur ? `${row.couleur}10` : '#F5F2F0',
                  borderBottom: `2px solid ${row.couleur ?? '#C9C4C0'}`,
                }} />
              )
            }
            const rowLot = lots.find((l) => l.id === row.lotId) ?? null
            return (
              <TaskBarRow
                key={row.id}
                task={row.task} lot={rowLot}
                barColor={getBarColor(row.task, rowLot, zones, colorMode)}
                rowHeight={rowHeight} geo={geo}
                dragOverTaskId={dragOverTaskId} drawMode={drawMode}
                segments={getSegmentsForTache ? getSegmentsForTache(row.task.id) : []}
                visibleSegmentIds={row.visibleSegmentIds}
                showMainBar={row.showMainBar !== false}
                zones={zones}
                isDragging={draggingBar === row.task.id}
                draggingSegmentId={draggingSegment?.segmentId ?? null}
                onSegmentDragStart={handleSegmentMouseDown}
                segmentDragMovedRef={segmentDragRef}
                isConnecting={!!connectingFrom}
                connectingFrom={connectingFrom}
                hoveredPoint={hoveredPoint}
                onBarDragStart={startBarDrag}
                onBarClick={onTaskClick}
                onConnectionPointClick={handleConnectionPointClick}
                onConnectionPointHover={setHoveredPoint}
              />
            )
          })
        ) : (
          <>
            {/* Lots */}
            {lotsWithTasks.map(({ lot, tasks: lotTasks }) => (
              <div key={lot.id}>
                <div style={{
                  borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                  height: rowHeight,
                  backgroundColor: `${lot.couleur}10`,
                }} />
                {lotTasks.map((task) => (
                  <TaskBarRow
                    key={task.id}
                    task={task} lot={lot}
                    barColor={getBarColor(task, lot, zones, colorMode)}
                    rowHeight={rowHeight} geo={geo}
                    dragOverTaskId={dragOverTaskId} drawMode={drawMode}
                    segments={getSegmentsForTache ? getSegmentsForTache(task.id) : []}
                    zones={zones}
                    isDragging={draggingBar === task.id}
                    draggingSegmentId={draggingSegment?.segmentId ?? null}
                    onSegmentDragStart={handleSegmentMouseDown}
                    segmentDragMovedRef={segmentDragRef}
                    isConnecting={!!connectingFrom}
                    connectingFrom={connectingFrom}
                    hoveredPoint={hoveredPoint}
                    onBarDragStart={startBarDrag}
                    onBarClick={onTaskClick}
                    onConnectionPointClick={handleConnectionPointClick}
                    onConnectionPointHover={setHoveredPoint}
                  />
                ))}
              </div>
            ))}

            {/* Sans lot */}
            {unassigned.length > 0 && (
              <div>
                <div style={{
                  borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                  height: rowHeight,
                  backgroundColor: 'rgba(155,143,133,0.06)',
                }} />
                {unassigned.map((task) => (
                  <TaskBarRow
                    key={task.id}
                    task={task} lot={null}
                    barColor={getBarColor(task, null, zones, colorMode)}
                    rowHeight={rowHeight} geo={geo}
                    dragOverTaskId={dragOverTaskId} drawMode={drawMode}
                    segments={getSegmentsForTache ? getSegmentsForTache(task.id) : []}
                    zones={zones}
                    isDragging={draggingBar === task.id}
                    draggingSegmentId={draggingSegment?.segmentId ?? null}
                    onSegmentDragStart={handleSegmentMouseDown}
                    segmentDragMovedRef={segmentDragRef}
                    isConnecting={!!connectingFrom}
                    connectingFrom={connectingFrom}
                    hoveredPoint={hoveredPoint}
                    onBarDragStart={startBarDrag}
                    onBarClick={onTaskClick}
                    onConnectionPointClick={handleConnectionPointClick}
                    onConnectionPointHover={setHoveredPoint}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SVG : flèches permanentes + ligne en cours ───────────────────── */}
        <svg
          ref={svgRef}
          style={{
            position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none',
            width: totalWidth, height: totalBodyHeight, overflow: 'visible',
            color: '#e4702a',
          }}
        >
          <defs>
            <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="currentColor" />
            </marker>
            <marker id="dep-arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="#B8412C" />
            </marker>
            <marker id="dep-arrow-live" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="currentColor" />
            </marker>
          </defs>

          {/* Flèches permanentes */}
          {showConnections && arrows.map((arrow) => {
            const isHovered = hoveredArrowId === arrow.id
            const span = Math.abs(arrow.toX - arrow.fromX)
            const ctrl = Math.max(50, span * 0.45)
            const d = `M ${arrow.fromX} ${arrow.fromY} C ${arrow.fromX + ctrl} ${arrow.fromY}, ${arrow.toX - ctrl} ${arrow.toY}, ${arrow.toX} ${arrow.toY}`
            return (
              <g key={arrow.id}
                style={{ cursor: isHovered ? 'pointer' : 'default', pointerEvents: 'auto' }}
                onMouseEnter={() => setHoveredArrowId(arrow.id)}
                onMouseLeave={() => setHoveredArrowId(null)}
                onClick={(e) => {
                  if (drawMode) return
                  e.stopPropagation()
                  setDeletingArrow({
                    kind: arrow.kind,
                    fromTaskId: arrow.fromTaskId,
                    toTaskId: arrow.toTaskId,
                    dependanceId: arrow.dependanceId,
                    fromLabel: arrow.fromLabel,
                    toLabel: arrow.toLabel,
                  })
                }}
              >
                <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
                <path d={d} fill="none"
                  stroke={isHovered ? '#B8412C' : 'currentColor'}
                  strokeWidth={isHovered ? 2.5 : 2}
                  strokeDasharray={isHovered ? 'none' : '6 3'}
                  strokeOpacity={isHovered ? 1 : 0.85}
                  markerEnd={isHovered ? 'url(#dep-arrow-red)' : 'url(#dep-arrow)'}
                  style={{ pointerEvents: 'none', transition: 'stroke 0.12s, stroke-width 0.12s, stroke-opacity 0.12s' }}
                />
                <circle cx={arrow.fromX} cy={arrow.fromY}
                  r={isHovered ? 5 : 3.5}
                  fill={isHovered ? '#B8412C' : 'currentColor'}
                  opacity={isHovered ? 1 : 0.85}
                  style={{ pointerEvents: 'none', transition: 'fill 0.12s, r 0.12s' }}
                />
              </g>
            )
          })}

          {/* Ligne de connexion en cours */}
          {connectingFrom && (
            <g>
              <line
                x1={connectingFrom.x} y1={connectingFrom.y}
                x2={mousePos.x} y2={mousePos.y}
                stroke="currentColor" strokeWidth="2.5"
                strokeDasharray="7 3"
                markerEnd="url(#dep-arrow-live)"
              />
              <circle cx={connectingFrom.x} cy={connectingFrom.y} r="5"
                fill="currentColor">
                <animate attributeName="r" values="4;7;4" dur="0.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.4;1" dur="0.9s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>

        {/* Today marker */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, zIndex: 20,
          left: todayOffset, pointerEvents: 'none',
        }}>
          <div style={{ height: '100%', width: 1, backgroundColor: '#E8602C', opacity: 0.6 }} />
          <div style={{
            position: 'absolute', top: -4, left: -6,
            width: 12, height: 12, borderRadius: '50%',
            backgroundColor: '#E8602C', border: '2px solid white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }} />
        </div>
      </div>

      {/* Toast mode connexion */}
      {connectingFrom && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, backgroundColor: '#E8602C', color: 'white',
          fontSize: 12, fontWeight: 700, padding: '10px 20px', borderRadius: 2,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'white', display: 'inline-block' }} />
          Cliquez sur le point de début d'une tâche · Échap pour annuler
        </div>
      )}

      {/* Toast mode dessin */}
      {drawMode && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, backgroundColor: '#1F1B17', color: 'white',
          fontSize: 12, fontWeight: 700, padding: '10px 20px', borderRadius: 2,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#E8602C', display: 'inline-block' }} />
          Cliquez-glissez sur une ligne pour créer une tâche · Échap pour quitter
        </div>
      )}

      {/* Modale confirmation suppression dépendance */}
      {deletingArrow && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: 0, padding: '28px 32px',
            maxWidth: 420, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 2, backgroundColor: 'rgba(184,65,44,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <GitBranch size={18} style={{ color: '#B8412C' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>
                Supprimer la dépendance
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 20 }}>
              La liaison entre{' '}
              <strong style={{ color: '#1F1B17' }}>{deletingArrow.fromLabel}</strong>
              {' '}et{' '}
              <strong style={{ color: '#1F1B17' }}>{deletingArrow.toLabel}</strong>
              {' '}sera supprimée. Les dates ne seront pas modifiées.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingArrow(null)}
                style={{
                  padding: '8px 16px', borderRadius: 2, fontSize: 13, cursor: 'pointer',
                  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'transparent', color: '#374151',
                }}>
                Annuler
              </button>
              <button
                onClick={() => {
                  if (deletingArrow.kind === 'dependance') {
                    onSegmentDependencyDelete?.(deletingArrow.dependanceId)
                  } else {
                    onDependencyDelete(deletingArrow.fromTaskId, deletingArrow.toTaskId)
                  }
                  setDeletingArrow(null)
                }}
                style={{
                  padding: '8px 16px', borderRadius: 2, fontSize: 13, fontWeight: 500,
                  border: 'none', backgroundColor: '#B8412C', color: 'white', cursor: 'pointer',
                }}>
                Supprimer la liaison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TaskBarRow ───────────────────────────────────────────────────────────────

function TaskBarRow({
  task, lot, geo, rowHeight, barColor,
  segments = [], zones = [], dragOverTaskId = null, drawMode = false,
  visibleSegmentIds = null, showMainBar = true,
  isDragging, isConnecting, connectingFrom, hoveredPoint,
  draggingSegmentId, onSegmentDragStart, segmentDragMovedRef,
  onBarDragStart, onBarClick, onConnectionPointClick, onConnectionPointHover,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const color = barColor ?? lot?.couleur ?? '#94a3b8'
  const debut = parseDate(task.debut)
  const { left, width } = computeGeometry(debut, task.duree, geo)
  const unitWidth = geo.viewMode === 'month' ? geo.monthWidth : geo.viewMode === 'week' ? geo.weekWidth : geo.dayWidth
  const HANDLE_W = Math.max(6, Math.min(10, unitWidth * 0.25))
  const connectionPointSize = geo.viewMode === 'day' ? 8 : 10
  const DOT_R = connectionPointSize / 2
  const BAR_BOTTOM = rowHeight - BAR_PAD

  // À fort dézoom, les labels à droite des barres se chevauchent — on les masque.
  // Seuils proportionnés à l'échelle propre à chaque vue (dayWidth / weekWidth / monthWidth).
  const showLabel = geo.viewMode === 'month' ? geo.monthWidth >= 32
    : geo.viewMode === 'week' ? geo.weekWidth >= 16
      : geo.dayWidth >= 10

  const isOwnSource = sameEndpoint(connectingFrom, { type: 'task', taskId: task.id })
  const isSource = isOwnSource
  const isStartHovered = hoveredPoint?.type === 'task' && hoveredPoint?.taskId === task.id && hoveredPoint?.side === 'start'
  const isEndHovered = hoveredPoint?.type === 'task' && hoveredPoint?.taskId === task.id && hoveredPoint?.side === 'end'

  const startPoint = { type: 'task', taskId: task.id, side: 'start', x: left, y: BAR_BOTTOM }
  const endPoint = { type: 'task', taskId: task.id, side: 'end', x: left + width, y: BAR_BOTTOM }

  const PENCIL_SIZE = Math.min(14, rowHeight * 0.35)

  const showStartDot = isConnecting && !isOwnSource ? true : isHovered
  const showEndDot = isConnecting ? false : isHovered

  const barTitle = task.appro_actif && task.appro_duree
    ? `${task.nom} · Délai d'appro : ${task.appro_duree}j${task.appro_materiau ? ` (${task.appro_materiau})` : ''}`
    : task.nom

  return (
    <div
      style={{
        position: 'relative', height: rowHeight, borderBottom: '0.5px solid rgba(0,0,0,0.05)',
        borderTop: dragOverTaskId === task.id ? '2px solid #E8602C' : '2px solid transparent',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Barre principale ─────────────────────────────────────── */}
      {showMainBar && <div
        data-taskid={task.id}
        title={barTitle}
        style={{
          position: 'absolute', left, width,
          top: BAR_PAD, bottom: BAR_PAD,
          backgroundColor: color, borderRadius: 0,
          display: 'flex', alignItems: 'center', overflow: 'hidden',
          boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.15)',
          zIndex: isDragging ? 30 : 10,
          opacity: isDragging ? 0.9 : 1,
          cursor: drawMode ? 'crosshair' : isConnecting && !isSource ? 'crosshair' : 'grab',
          outline: isDragging ? '2px solid rgba(255,255,255,0.3)' : 'none',
        }}
        onMouseDown={(e) => {
          if (drawMode) return
          if (e.target.dataset.handle) return
          if (e.target.dataset.editbtn) return
          if (isConnecting) return
          onBarDragStart(e, task, 'move')
        }}
      >
        {/* Resize gauche */}
        <div
          data-handle="left"
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 0,
          }}
          onMouseDown={(e) => { if (drawMode || e.button !== 0) return; e.stopPropagation(); onBarDragStart(e, task, 'resize-left') }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
        >
          <div style={{ height: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        </div>

        {/* Avancement */}
        {task.avancement > 0 && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            width: `${task.avancement}%`, backgroundColor: 'rgba(0,0,0,0.22)',
          }} />
        )}

        {/* Bouton crayon */}
        <button
          data-editbtn="1"
          style={{
            position: 'absolute', zIndex: 20,
            right: HANDLE_W + 3, top: '50%', transform: 'translateY(-50%)',
            width: PENCIL_SIZE + 6, height: PENCIL_SIZE + 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3, border: 'none', cursor: 'pointer',
            backgroundColor: 'rgba(0,0,0,0.3)', color: 'white',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.15s, background-color 0.1s',
            flexShrink: 0,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.5)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.3)'}
          onClick={(e) => {
            e.stopPropagation()
            if (!barDragRef_click.moved) onBarClick(task)
          }}
          title="Modifier la tâche"
        >
          <Pencil style={{ width: PENCIL_SIZE, height: PENCIL_SIZE }} strokeWidth={2.5} />
        </button>

        {/* Resize droite */}
        <div
          data-handle="right"
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 0,
          }}
          onMouseDown={(e) => { if (drawMode || e.button !== 0) return; e.stopPropagation(); onBarDragStart(e, task, 'resize-right') }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
        >
          <div style={{ height: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        </div>
      </div>}

      {/* Label à droite de la barre */}
      {showMainBar && showLabel && <div style={{
        position: 'absolute',
        left: left + width + 4,
        top: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        fontSize: 11,
        fontWeight: 500,
        color: '#1F1B17',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 10,
      }}>
        {task.nom}
        {task.avancement > 0 && task.avancement < 100 && (
          <span style={{ marginLeft: 4, fontSize: 10, color: '#9C9591' }}>
            {task.avancement}%
          </span>
        )}
      </div>}

      {/* ── Extension d'approvisionnement ────────────────────────── */}
      {showMainBar && task.appro_actif && task.appro_duree > 0 && (
        <ApproBar
          task={task} color={color} geo={geo}
          rowHeight={rowHeight} taskLeft={left} taskWidth={width}
        />
      )}

      {/* ── Segments supplémentaires ────────────────────────────────── */}
      {segments
        .filter((seg) => !visibleSegmentIds || visibleSegmentIds.includes(seg.id))
        .map((seg) => {
        const segGeo = computeGeometry(parseDate(seg.date_debut), seg.duree_jours, geo)
        const segColor = seg.zone_id
          ? zones.find((z) => z.id === seg.zone_id)?.couleur ?? color
          : color
        const isDraggingThis = draggingSegmentId === seg.id

        const segIsOwnSource = sameEndpoint(connectingFrom, { type: 'segment', segmentId: seg.id })
        const segStartHovered = hoveredPoint?.type === 'segment' && hoveredPoint?.segmentId === seg.id && hoveredPoint?.side === 'start'
        const segEndHovered = hoveredPoint?.type === 'segment' && hoveredPoint?.segmentId === seg.id && hoveredPoint?.side === 'end'
        const segStartPoint = { type: 'segment', segmentId: seg.id, tacheId: seg.tache_id, side: 'start', x: segGeo.left, y: BAR_BOTTOM }
        const segEndPoint = { type: 'segment', segmentId: seg.id, tacheId: seg.tache_id, side: 'end', x: segGeo.left + segGeo.width, y: BAR_BOTTOM }
        const segShowStartDot = isConnecting && !segIsOwnSource ? true : isHovered
        const segShowEndDot = isConnecting ? false : isHovered

        return (
          <div key={seg.id}>
            <div
              title={`${task.nom} — segment`}
              style={{
                position: 'absolute',
                left: segGeo.left, width: segGeo.width,
                top: BAR_PAD, bottom: BAR_PAD,
                backgroundColor: segColor,
                opacity: isDraggingThis ? 0.7 : 0.85,
                outline: '1.5px dashed rgba(255,255,255,0.5)',
                outlineOffset: -2,
                cursor: isDraggingThis ? 'grabbing' : 'grab',
                zIndex: isDraggingThis ? 25 : 8,
              }}
              onMouseDown={(e) => onSegmentDragStart(e, seg)}
              onClick={(e) => {
                e.stopPropagation()
                if (segmentDragMovedRef?.current?.moved) return
                onBarClick(task)
              }}
            />
            {seg.afficher_nom && showLabel && (
              <div style={{
                position: 'absolute',
                left: segGeo.left + segGeo.width + 4,
                top: BAR_PAD, bottom: BAR_PAD,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
                fontSize: 11,
                fontWeight: 500,
                color: '#1F1B17',
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 10,
              }}>
                {seg.nom ?? task.nom}
              </div>
            )}

            {/* Points de connexion du segment */}
            <div
              style={{
                position: 'absolute', zIndex: 40,
                left: segGeo.left - DOT_R, top: BAR_BOTTOM - DOT_R,
                width: DOT_R * 2, height: DOT_R * 2,
                borderRadius: '50%', border: '2px solid white', cursor: 'crosshair',
                backgroundColor: segStartHovered ? '#E8602C' : segColor,
                transform: segStartHovered ? 'scale(1.5)' : 'scale(1)',
                boxShadow: segStartHovered ? '0 0 0 3px rgba(224,90,30,0.35)' : '0 1px 4px rgba(0,0,0,0.4)',
                opacity: segShowStartDot ? 1 : 0,
                transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s, background-color 0.15s',
                pointerEvents: segShowStartDot ? 'auto' : 'none',
              }}
              onClick={(e) => onConnectionPointClick(e, segStartPoint)}
              onMouseEnter={() => onConnectionPointHover(segStartPoint)}
              onMouseLeave={() => onConnectionPointHover(null)}
            />
            <div
              style={{
                position: 'absolute', zIndex: 40,
                left: segGeo.left + segGeo.width - DOT_R, top: BAR_BOTTOM - DOT_R,
                width: DOT_R * 2, height: DOT_R * 2,
                borderRadius: '50%', border: '2px solid white', cursor: 'crosshair',
                backgroundColor: segIsOwnSource || segEndHovered ? '#E8602C' : segColor,
                transform: segEndHovered || segIsOwnSource ? 'scale(1.5)' : 'scale(1)',
                boxShadow: (segEndHovered || segIsOwnSource) ? '0 0 0 3px rgba(224,90,30,0.35)' : '0 1px 4px rgba(0,0,0,0.4)',
                opacity: segShowEndDot ? 1 : 0,
                transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s, background-color 0.15s',
                pointerEvents: segShowEndDot ? 'auto' : 'none',
              }}
              onClick={(e) => onConnectionPointClick(e, segEndPoint)}
              onMouseEnter={() => onConnectionPointHover(segEndPoint)}
              onMouseLeave={() => onConnectionPointHover(null)}
            />
          </div>
        )
      })}

      {showMainBar && (
        <>
          {/* ── Point START ──────────────────────────────────────────── */}
          <div
            style={{
              position: 'absolute', zIndex: 40,
              left: left - DOT_R, top: BAR_BOTTOM - DOT_R,
              width: DOT_R * 2, height: DOT_R * 2,
              borderRadius: '50%', border: '2px solid white', cursor: 'crosshair',
              backgroundColor: isStartHovered ? '#E8602C' : color,
              transform: isStartHovered ? 'scale(1.5)' : 'scale(1)',
              boxShadow: isStartHovered ? '0 0 0 3px rgba(224,90,30,0.35)' : '0 1px 4px rgba(0,0,0,0.4)',
              opacity: showStartDot ? 1 : 0,
              transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s, background-color 0.15s',
              pointerEvents: showStartDot ? 'auto' : 'none',
            }}
            onClick={(e) => onConnectionPointClick(e, startPoint)}
            onMouseEnter={() => onConnectionPointHover(startPoint)}
            onMouseLeave={() => onConnectionPointHover(null)}
          />

          {/* ── Point END ────────────────────────────────────────────── */}
          <div
            style={{
              position: 'absolute', zIndex: 40,
              left: left + width - DOT_R, top: BAR_BOTTOM - DOT_R,
              width: DOT_R * 2, height: DOT_R * 2,
              borderRadius: '50%', border: '2px solid white', cursor: 'crosshair',
              backgroundColor: isSource || isEndHovered ? '#E8602C' : color,
              transform: isEndHovered || isSource ? 'scale(1.5)' : 'scale(1)',
              boxShadow: (isEndHovered || isSource) ? '0 0 0 3px rgba(224,90,30,0.35)' : '0 1px 4px rgba(0,0,0,0.4)',
              opacity: showEndDot ? 1 : 0,
              transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s, background-color 0.15s',
              pointerEvents: showEndDot ? 'auto' : 'none',
            }}
            onClick={(e) => onConnectionPointClick(e, endPoint)}
            onMouseEnter={() => onConnectionPointHover(endPoint)}
            onMouseLeave={() => onConnectionPointHover(null)}
          />
        </>
      )}
    </div>
  )
}

// ─── ApproBar ─────────────────────────────────────────────────────────────────

function ApproBar({ task, color, geo }) {
  const taskStartDate = parseDate(task.debut)
  const approStartDate = addWorkingDays(taskStartDate, -task.appro_duree)
  const { left: approLeft, width: approWidth } = computeGeometry(approStartDate, task.appro_duree, geo)
  const label = task.appro_materiau
    ? `Appro. – ${task.appro_materiau}`
    : `Délai appro. – ${task.appro_duree}j`

  return (
    <div style={{
      position: 'absolute',
      left: approLeft, width: Math.max(approWidth, 4),
      top: BAR_PAD, bottom: BAR_PAD,
      backgroundColor: color, opacity: 0.28,
      borderRadius: 0,
      border: `1.5px dashed ${color}`, borderRight: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
      overflow: 'hidden',
      pointerEvents: 'none', userSelect: 'none',
      zIndex: 5,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        color: color,
        filter: 'brightness(0.4)',
      }}>
        {label}
      </span>
    </div>
  )
}

// Ref partagée pour détecter si un drag a eu lieu (évite onClick après drag)
const barDragRef_click = { moved: false }
