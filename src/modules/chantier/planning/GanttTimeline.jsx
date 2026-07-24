import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Pencil, GitBranch } from 'lucide-react'
import {
  parseDate,
  formatDateISO,
  isWorkingDay,
  addWorkingDays,
  computeLag,
} from './types'

const TIMELINE_DAYS = 365
const TIMELINE_WEEKS = Math.ceil(TIMELINE_DAYS / 7)
const WEEK_WIDTH = 40
export const HEADER_HEIGHT = 64
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

function xAtDateWeekSnapped(date, dateRef) {
  return weekIndexFromRef(date, dateRef) * WEEK_WIDTH
}

// Position continue (non snappée), utilisée pour les jalons et le marqueur « aujourd'hui »
function xAtDateWeekContinuous(date, dateRef) {
  const diffDays = (date.getTime() - dateRef.getTime()) / (1000 * 3600 * 24)
  return (diffDays / 7) * WEEK_WIDTH
}

function barWidthAtWeek(duree) {
  return Math.max(1, Math.ceil(duree / 7)) * WEEK_WIDTH
}

// ── Géométrie unifiée jour / semaine ───────────────────────────────────────────

function computeGeometry(startDate, duree, dateRef, dayPositions, dayWidth, viewMode) {
  if (viewMode === 'week') {
    return { left: xAtDateWeekSnapped(startDate, dateRef), width: barWidthAtWeek(duree) }
  }
  return {
    left: xAtDate(startDate, dateRef, dayPositions),
    width: barWidthAt(startDate, duree, dateRef, dayPositions, dayWidth),
  }
}

function getTaskGeometry(task, dateRef, dayPositions, dayWidth, viewMode) {
  return computeGeometry(parseDate(task.debut), task.duree, dateRef, dayPositions, dayWidth, viewMode)
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

export function GanttTimeline({
  tasks, lots, dayWidth, rowHeight, showConnections,
  jalons = [], onJalonClick,
  onTaskClick, onTaskUpdate, onDependencyCreate, onDependencyDelete,
  zones = [], colorMode = 'lot', viewMode = 'day',
  getSegmentsForTache,
}) {
  const interactive = viewMode === 'day'
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

  // ── Positions X précalculées pour chaque jour (colonnes variables) ────────────
  const dayPositions = useMemo(() => {
    const pos = new Array(TIMELINE_DAYS + 1)
    pos[0] = 0
    for (let i = 0; i < TIMELINE_DAYS; i++) {
      const d = new Date(dateRef)
      d.setDate(d.getDate() + i)
      const isWE = d.getDay() === 0 || d.getDay() === 6
      pos[i + 1] = pos[i] + (isWE ? dayWidth * WEEKEND_RATIO : dayWidth)
    }
    return pos
  }, [dateRef, dayWidth])

  // ── Semaines précalculées (vue semaine) ───────────────────────────────────────
  const weeks = useMemo(() =>
    Array.from({ length: TIMELINE_WEEKS }, (_, i) => {
      const d = new Date(dateRef); d.setDate(d.getDate() + i * 7); return d
    }), [dateRef])

  const yearSegments = useMemo(() => {
    const segments = []
    weeks.forEach((weekStart, i) => {
      const year = weekStart.getFullYear()
      const last = segments[segments.length - 1]
      if (last && last.year === year) {
        last.width += WEEK_WIDTH
      } else {
        segments.push({ year, x: i * WEEK_WIDTH, width: WEEK_WIDTH })
      }
    })
    return segments
  }, [weeks])

  const currentWeekIndex = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return weekIndexFromRef(today, dateRef)
  }, [dateRef])

  const totalWidth = viewMode === 'week' ? TIMELINE_WEEKS * WEEK_WIDTH : dayPositions[TIMELINE_DAYS]

  const days = useMemo(() =>
    Array.from({ length: TIMELINE_DAYS }, (_, i) => {
      const d = new Date(dateRef); d.setDate(d.getDate() + i); return d
    }), [dateRef])

  const lotsWithTasks = useMemo(() =>
    lots.map((lot) => ({ lot, tasks: tasks.filter((t) => t.lot_id === lot.id) }))
        .filter(({ tasks }) => tasks.length > 0),
    [lots, tasks])

  const unassigned = useMemo(() => tasks.filter((t) => t.lot_id == null), [tasks])

  // Index de ligne (même ordre que sidebar)
  const rowIndexMap = useMemo(() => {
    const map = {}
    let idx = 0
    lotsWithTasks.forEach(({ tasks: lt }) => {
      idx++
      lt.forEach((t) => { map[t.id] = idx++ })
    })
    if (unassigned.length > 0) {
      idx++
      unassigned.forEach((t) => { map[t.id] = idx++ })
    }
    return map
  }, [lotsWithTasks, unassigned])

  const totalBodyRows = useMemo(() => {
    let n = 0
    lotsWithTasks.forEach(({ tasks: lt }) => { n += 1 + lt.length })
    if (unassigned.length > 0) n += 1 + unassigned.length
    return n
  }, [lotsWithTasks, unassigned])
  const totalBodyHeight = totalBodyRows * rowHeight

  // ── Drag barre ────────────────────────────────────────────────────────────────
  const barDragRef = useRef(null)
  const [draggingBar, setDraggingBar] = useState(null)

  // Largeur journalière moyenne pondérée (pour conversion px → deltaDays)
  const avgDayWidth = dayWidth * (5 + 2 * WEEKEND_RATIO) / 7

  const startBarDrag = useCallback((e, task, type) => {
    e.preventDefault(); e.stopPropagation()
    barDragRef.current = {
      type, taskId: task.id, startX: e.clientX,
      origDebut: parseDate(task.debut), origDuree: task.duree,
      moved: false,
    }
    setDraggingBar(task.id)
    document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [])

  // ── Connexion chemin critique ──────────────────────────────────────────────────
  const [connectingFrom, setConnectingFrom] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredArrowId, setHoveredArrowId] = useState(null)
  const [deletingArrow, setDeletingArrow] = useState(null)
  const svgRef = useRef(null)

  // ── Flèches permanentes ───────────────────────────────────────────────────────
  const arrows = useMemo(() => {
    return tasks
      .filter((t) => t.depends_on != null)
      .map((t) => {
        const fromTask = tasks.find((x) => x.id === t.depends_on)
        if (!fromTask) return null
        const fromGeo = getTaskGeometry(fromTask, dateRef, dayPositions, dayWidth, viewMode)
        const toGeo = getTaskGeometry(t, dateRef, dayPositions, dayWidth, viewMode)
        const fromRowIdx = rowIndexMap[fromTask.id]
        const toRowIdx = rowIndexMap[t.id]
        if (fromRowIdx === undefined || toRowIdx === undefined) return null
        return {
          id: `${fromTask.id}-${t.id}`,
          fromTaskId: fromTask.id,
          toTaskId: t.id,
          fromTaskName: `${fromTask.num_tache} – ${fromTask.nom}`,
          toTaskName: `${t.num_tache} – ${t.nom}`,
          fromX: fromGeo.left + fromGeo.width,
          fromY: fromRowIdx * rowHeight + (rowHeight - BAR_PAD),
          toX: toGeo.left,
          toY: toRowIdx * rowHeight + (rowHeight - BAR_PAD),
        }
      })
      .filter(Boolean)
  }, [tasks, rowIndexMap, dateRef, dayPositions, dayWidth, rowHeight, viewMode])

  // ── Mouse handlers ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (barDragRef.current) {
      const { type, taskId, startX, origDebut, origDuree } = barDragRef.current
      const dx = e.clientX - startX
      const deltaDays = Math.round(dx / avgDayWidth)
      if (Math.abs(dx) > 3) barDragRef.current.moved = true

      let newDebut = origDebut, newDuree = origDuree
      if (type === 'move') {
        const raw = new Date(origDebut)
        raw.setDate(raw.getDate() + deltaDays)
        while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
        newDebut = raw
      } else if (type === 'resize-right') {
        newDuree = Math.max(1, origDuree + deltaDays)
      } else if (type === 'resize-left') {
        const shift = Math.min(deltaDays, origDuree - 1)
        const raw = new Date(origDebut)
        raw.setDate(raw.getDate() + shift)
        while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
        newDebut = raw; newDuree = Math.max(1, origDuree - deltaDays)
      }
      const el = document.querySelector(`[data-taskid="${taskId}"]`)
      if (el) {
        el.style.left = `${xAtDate(newDebut, dateRef, dayPositions)}px`
        el.style.width = `${barWidthAt(newDebut, newDuree, dateRef, dayPositions, dayWidth)}px`
      }
    }
    if (connectingFrom && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [avgDayWidth, dateRef, dayPositions, dayWidth, connectingFrom])

  const handleMouseUp = useCallback((e) => {
    if (barDragRef.current) {
      const { type, taskId, startX, origDebut, origDuree, moved } = barDragRef.current
      if (moved) {
        const dx = e.clientX - startX
        const deltaDays = Math.round(dx / avgDayWidth)
        let newDebut = origDebut, newDuree = origDuree
        if (type === 'move') {
          const raw = new Date(origDebut)
          raw.setDate(raw.getDate() + deltaDays)
          while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
          newDebut = raw
        } else if (type === 'resize-right') {
          newDuree = Math.max(1, origDuree + deltaDays)
        } else if (type === 'resize-left') {
          const shift = Math.min(deltaDays, origDuree - 1)
          const raw = new Date(origDebut)
          raw.setDate(raw.getDate() + shift)
          while (!isWorkingDay(raw)) raw.setDate(raw.getDate() + 1)
          newDebut = raw; newDuree = Math.max(1, origDuree - deltaDays)
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
  }, [avgDayWidth, onTaskUpdate, connectingFrom, hoveredPoint])

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
      if (point.side === 'start' && point.taskId !== connectingFrom.taskId) {
        const exists = tasks.find((t) => t.id === point.taskId && t.depends_on === connectingFrom.taskId)
        if (!exists) {
          const fromTask = tasks.find((t) => t.id === connectingFrom.taskId)
          const toTask = tasks.find((t) => t.id === point.taskId)
          const lag = (fromTask && toTask)
            ? computeLag(parseDate(fromTask.debut), fromTask.duree, parseDate(toTask.debut))
            : 1
          onDependencyCreate(connectingFrom.taskId, point.taskId, lag)
        }
      }
      setConnectingFrom(null)
    }
  }, [connectingFrom, tasks, onDependencyCreate])

  // Position d'une date, quel que soit le mode d'affichage (jour ou semaine)
  const getX = useCallback((date) => {
    if (viewMode === 'week') return xAtDateWeekContinuous(date, dateRef)
    return xAtDate(date, dateRef, dayPositions)
  }, [viewMode, dateRef, dayPositions])

  const todayOffset = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return getX(today)
  }, [getX])

  return (
    <div
      style={{ position: 'relative', userSelect: 'none', width: totalWidth, minWidth: totalWidth }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, height: HEADER_HEIGHT,
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        backgroundColor: 'rgba(245,242,240,0.95)',
        backdropFilter: 'blur(4px)',
      }}>
        {viewMode === 'week' ? (
          <>
            {/* Années */}
            <div style={{ position: 'relative', height: 28, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
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
            {/* Semaines */}
            <div style={{ display: 'flex', height: 36, alignItems: 'center' }}>
              {weeks.map((weekStart, i) => {
                const isCurrentWeek = i === currentWeekIndex
                return (
                  <div key={i} style={{
                    width: WEEK_WIDTH, minWidth: WEEK_WIDTH, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: '1px solid rgba(0,0,0,0.12)',
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
                const isMonthStart = day.getDate() === 1
                const borderRight = isMonthStart
                  ? '1px solid rgba(0,0,0,0.4)'
                  : isMonday
                    ? '1px solid rgba(0,0,0,0.25)'
                    : '1px solid rgba(0,0,0,0.12)'
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
        {viewMode === 'week' ? (
          /* Week grid lines (emphase au changement d'année) */
          weeks.map((weekStart, i) => (
            <div key={`gl-${i}`} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: i * WEEK_WIDTH, width: 1,
              backgroundColor: (i === 0 || weekStart.getFullYear() !== weeks[i - 1].getFullYear())
                ? 'rgba(0,0,0,0.4)'
                : 'rgba(0,0,0,0.12)',
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

            {/* Day grid lines */}
            {days.map((day, i) => {
              const isMonday = day.getDay() === 1
              const isMonthStart = day.getDate() === 1
              return (
                <div key={`gl-${i}`} style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: dayPositions[i], width: 1,
                  backgroundColor: isMonthStart
                    ? 'rgba(0,0,0,0.4)'
                    : isMonday
                      ? 'rgba(0,0,0,0.25)'
                      : 'rgba(0,0,0,0.12)',
                  pointerEvents: 'none',
                }} />
              )
            })}
          </>
        )}

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
                task={task} lot={lot} dateRef={dateRef}
                barColor={getBarColor(task, lot, zones, colorMode)}
                dayWidth={dayWidth} dayPositions={dayPositions} rowHeight={rowHeight}
                viewMode={viewMode} interactive={interactive}
                segments={getSegmentsForTache ? getSegmentsForTache(task.id) : []}
                zones={zones}
                isDragging={draggingBar === task.id}
                isConnecting={!!connectingFrom}
                connectingFromId={connectingFrom?.taskId ?? null}
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
                task={task} lot={null} dateRef={dateRef}
                barColor={getBarColor(task, null, zones, colorMode)}
                dayWidth={dayWidth} dayPositions={dayPositions} rowHeight={rowHeight}
                viewMode={viewMode} interactive={interactive}
                segments={getSegmentsForTache ? getSegmentsForTache(task.id) : []}
                zones={zones}
                isDragging={draggingBar === task.id}
                isConnecting={!!connectingFrom}
                connectingFromId={connectingFrom?.taskId ?? null}
                hoveredPoint={hoveredPoint}
                onBarDragStart={startBarDrag}
                onBarClick={onTaskClick}
                onConnectionPointClick={handleConnectionPointClick}
                onConnectionPointHover={setHoveredPoint}
              />
            ))}
          </div>
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
                  e.stopPropagation()
                  setDeletingArrow({
                    fromTaskId: arrow.fromTaskId,
                    toTaskId: arrow.toTaskId,
                    fromTaskName: arrow.fromTaskName,
                    toTaskName: arrow.toTaskName,
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

      {/* Modale confirmation suppression dépendance */}
      {deletingArrow && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDeletingArrow(null)}>
          <div style={{
            backgroundColor: 'white', borderRadius: 0, padding: '28px 32px',
            maxWidth: 420, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
          }} onClick={e => e.stopPropagation()}>
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
              <strong style={{ color: '#1F1B17' }}>{deletingArrow.fromTaskName}</strong>
              {' '}et{' '}
              <strong style={{ color: '#1F1B17' }}>{deletingArrow.toTaskName}</strong>
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
                  onDependencyDelete(deletingArrow.fromTaskId, deletingArrow.toTaskId)
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
  task, lot, dateRef, dayWidth, dayPositions, rowHeight, barColor,
  viewMode = 'day', interactive = true, segments = [], zones = [],
  isDragging, isConnecting, connectingFromId, hoveredPoint,
  onBarDragStart, onBarClick, onConnectionPointClick, onConnectionPointHover,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const color = barColor ?? lot?.couleur ?? '#94a3b8'
  const debut = parseDate(task.debut)
  const { left, width } = computeGeometry(debut, task.duree, dateRef, dayPositions, dayWidth, viewMode)
  const HANDLE_W = Math.max(6, Math.min(10, dayWidth * 0.25))
  const DOT_R = 6
  const BAR_BOTTOM = rowHeight - BAR_PAD

  const isSource = connectingFromId === task.id
  const isStartHovered = hoveredPoint?.taskId === task.id && hoveredPoint?.side === 'start'
  const isEndHovered = hoveredPoint?.taskId === task.id && hoveredPoint?.side === 'end'

  const startPoint = { taskId: task.id, side: 'start', x: left, y: BAR_BOTTOM }
  const endPoint = { taskId: task.id, side: 'end', x: left + width, y: BAR_BOTTOM }

  const PENCIL_SIZE = Math.min(14, rowHeight * 0.35)

  const showStartDot = isConnecting && connectingFromId !== task.id ? true : isHovered
  const showEndDot = isConnecting ? false : isHovered

  const barTitle = task.appro_actif && task.appro_duree
    ? `${task.nom} · Délai d'appro : ${task.appro_duree}j${task.appro_materiau ? ` (${task.appro_materiau})` : ''}`
    : task.nom

  return (
    <div
      style={{ position: 'relative', height: rowHeight, borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Barre principale ─────────────────────────────────────── */}
      <div
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
          cursor: !interactive ? 'default' : (isConnecting && !isSource ? 'crosshair' : 'grab'),
          outline: isDragging ? '2px solid rgba(255,255,255,0.3)' : 'none',
        }}
        onMouseDown={(e) => {
          if (!interactive) return
          if (e.target.dataset.handle) return
          if (e.target.dataset.editbtn) return
          if (isConnecting) return
          onBarDragStart(e, task, 'move')
        }}
      >
        {/* Resize gauche */}
        {interactive && (
          <div
            data-handle="left"
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 0,
            }}
            onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, task, 'resize-left') }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
          >
            <div style={{ height: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
          </div>
        )}

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
        {interactive && (
          <div
            data-handle="right"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 0,
            }}
            onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, task, 'resize-right') }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
          >
            <div style={{ height: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
          </div>
        )}
      </div>

      {/* Label à droite de la barre */}
      <div style={{
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
      </div>

      {/* ── Extension d'approvisionnement ────────────────────────── */}
      {task.appro_actif && task.appro_duree > 0 && (
        <ApproBar
          task={task} color={color} dateRef={dateRef}
          dayPositions={dayPositions} dayWidth={dayWidth} viewMode={viewMode}
          rowHeight={rowHeight} taskLeft={left} taskWidth={width}
        />
      )}

      {/* ── Segments supplémentaires ────────────────────────────────── */}
      {segments.map((seg) => {
        const segGeo = computeGeometry(
          parseDate(seg.date_debut), seg.duree_jours, dateRef, dayPositions, dayWidth, viewMode
        )
        const segColor = seg.zone_id
          ? zones.find((z) => z.id === seg.zone_id)?.couleur ?? color
          : color
        return (
          <div
            key={seg.id}
            title={`${task.nom} — segment`}
            style={{
              position: 'absolute',
              left: segGeo.left, width: segGeo.width,
              top: BAR_PAD, bottom: BAR_PAD,
              backgroundColor: segColor,
              opacity: 0.85,
              outline: '1.5px dashed rgba(255,255,255,0.5)',
              outlineOffset: -2,
              cursor: 'pointer',
              zIndex: 8,
            }}
            onClick={(e) => { e.stopPropagation(); onBarClick(task) }}
          />
        )
      })}

      {interactive && (
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

function ApproBar({ task, color, dateRef, dayPositions, dayWidth, viewMode = 'day' }) {
  const taskStartDate = parseDate(task.debut)
  const approStartDate = addWorkingDays(taskStartDate, -task.appro_duree)
  const { left: approLeft, width: approWidth } = computeGeometry(
    approStartDate, task.appro_duree, dateRef, dayPositions, dayWidth, viewMode
  )
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
