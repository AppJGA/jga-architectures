import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Pencil, GitBranch } from 'lucide-react'
import {
  TYPE_COLORS, getWeekStart, addWeeks, weeksBetween, getCurrentWeek, computeLagSemaines,
} from './types'

const HEADER_HEIGHT = 56
const DOT_R = 6

const dragState = { moved: false }

function rowHeightOf() { return 44 }
function barPadOf() { return 4 }

function isFirstWeekOfMonth(semaine, annee) {
  const date = getWeekStart(semaine, annee)
  const prevWeek = new Date(date)
  prevWeek.setDate(prevWeek.getDate() - 7)
  return prevWeek.getMonth() !== date.getMonth()
}

function getPhaseX(phase, refSemaine, refAnnee, semWidth) {
  const left = weeksBetween(refSemaine, refAnnee, phase.semaine_debut, phase.annee_debut) * semWidth
  const width = phase.duree_semaines * semWidth
  return { left, width }
}

export function GanttEtudeTimeline({
  phases, semWidth, showConnections,
  jalons = [], onJalonClick,
  onPhaseClick, onPhaseUpdate,
  onDependencyCreate, onDependencyDelete,
  criticalIds,
  refSemaine, refAnnee,
}) {
  // ── Reference week — reçue depuis GanttEtude (dynamique, -4 sem de marge) ─────
  const refWeek = useMemo(
    () => ({ semaine: refSemaine, annee: refAnnee }),
    [refSemaine, refAnnee]
  )

  // ── Largeur dynamique : couvre toutes les phases + 8 sem de marge à droite ────
  const totalWeeks = useMemo(() => {
    if (phases.length === 0) return 52
    let maxEnd = 0
    phases.forEach(p => {
      const end = weeksBetween(refSemaine, refAnnee, p.semaine_debut, p.annee_debut) + p.duree_semaines
      if (end > maxEnd) maxEnd = end
    })
    return Math.max(maxEnd + 8, 52)
  }, [phases, refSemaine, refAnnee])

  const weeks = useMemo(() =>
    Array.from({ length: totalWeeks }, (_, i) => addWeeks(refWeek.semaine, refWeek.annee, i)),
    [totalWeeks, refWeek]
  )

  const totalWidth = totalWeeks * semWidth

  const rowOffsets = useMemo(() => {
    const offsets = {}
    let y = 0
    for (const p of phases) {
      offsets[p.id] = y
      y += rowHeightOf(p)
    }
    return offsets
  }, [phases])

  const totalBodyHeight = useMemo(() =>
    phases.reduce((sum, p) => sum + rowHeightOf(p), 0),
    [phases]
  )

  const weekIndex = useCallback((sem, ann) =>
    weeksBetween(refWeek.semaine, refWeek.annee, sem, ann),
    [refWeek]
  )

  // ── Current week ──────────────────────────────────────────────────────────────
  const currentWeek = useMemo(() => getCurrentWeek(), [])
  const currentWeekLeft = useMemo(() =>
    weekIndex(currentWeek.semaine, currentWeek.annee) * semWidth,
    [currentWeek, weekIndex, semWidth]
  )

  // ── Month header labels ────────────────────────────────────────────────────────
  const monthLabels = useMemo(() => {
    const labels = []
    let lastKey = ''
    weeks.forEach((w, i) => {
      const d = getWeekStart(w.semaine, w.annee)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (key !== lastKey) {
        labels.push({ i, label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) })
        lastKey = key
      }
    })
    return labels
  }, [weeks])

  // ── Jalon positions ───────────────────────────────────────────────────────────
  const jalonPositions = useMemo(() =>
    jalons.map(j => ({ ...j, left: weekIndex(j.semaine, j.annee) * semWidth })),
    [jalons, weekIndex, semWidth]
  )

  // ── Drag ──────────────────────────────────────────────────────────────────────
  const barDragRef = useRef(null)
  const [draggingBar, setDraggingBar] = useState(null)

  const startBarDrag = useCallback((e, phase, type) => {
    e.preventDefault(); e.stopPropagation()
    dragState.moved = false
    const { left: origLeft } = getPhaseX(phase, refWeek.semaine, refWeek.annee, semWidth)
    barDragRef.current = {
      type, phaseId: phase.id,
      startX: e.clientX,
      origSemaine: phase.semaine_debut,
      origAnnee: phase.annee_debut,
      origDuree: phase.duree_semaines,
      origLeft,
    }
    setDraggingBar(phase.id)
    document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [refWeek, semWidth])

  // ── Connections ───────────────────────────────────────────────────────────────
  const [connectingFrom, setConnectingFrom] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [hoveredArrowId, setHoveredArrowId] = useState(null)
  const [deletingArrow, setDeletingArrow] = useState(null)
  const svgRef = useRef(null)

  const arrows = useMemo(() =>
    phases
      .filter(p => p.depends_on != null)
      .map(p => {
        const fromPhase = phases.find(x => x.id === p.depends_on)
        if (!fromPhase) return null
        const fromOffset = rowOffsets[fromPhase.id]
        const toOffset = rowOffsets[p.id]
        if (fromOffset === undefined || toOffset === undefined) return null
        const { left: fromLeft, width: fromWidth } = getPhaseX(fromPhase, refWeek.semaine, refWeek.annee, semWidth)
        const { left: toLeft } = getPhaseX(p, refWeek.semaine, refWeek.annee, semWidth)
        const fromY = fromOffset + rowHeightOf(fromPhase) - barPadOf(fromPhase)
        const toY = toOffset + rowHeightOf(p) - barPadOf(p)
        return {
          id: `${fromPhase.id}-${p.id}`,
          fromPhaseId: fromPhase.id, toPhaseId: p.id,
          fromPhaseName: fromPhase.nom,
          toPhaseName: p.nom,
          fromX: fromLeft + fromWidth,
          fromY,
          toX: toLeft,
          toY,
        }
      })
      .filter(Boolean),
    [phases, rowOffsets, refWeek, semWidth]
  )

  // ── Mouse handlers ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (barDragRef.current) {
      const { type, phaseId, startX, origDuree, origLeft } = barDragRef.current
      const dx = e.clientX - startX
      if (Math.abs(dx) > 4) dragState.moved = true
      const delta = Math.round(dx / semWidth)
      const el = document.querySelector(`[data-phaseid="${phaseId}"]`)
      if (!el) return
      if (type === 'move') {
        el.style.left = `${origLeft + delta * semWidth}px`
      } else if (type === 'resize-right') {
        el.style.width = `${Math.max(semWidth, (origDuree + delta) * semWidth)}px`
      } else if (type === 'resize-left') {
        const shift = Math.min(delta, origDuree - 1)
        el.style.left = `${origLeft + shift * semWidth}px`
        el.style.width = `${Math.max(semWidth, (origDuree - delta) * semWidth)}px`
      }
    }
    if (connectingFrom && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [semWidth, connectingFrom])

  const handleMouseUp = useCallback((e) => {
    if (barDragRef.current) {
      const { type, phaseId, startX, origSemaine, origAnnee, origDuree } = barDragRef.current
      if (dragState.moved) {
        const dx = e.clientX - startX
        const delta = Math.round(dx / semWidth)
        let newSem = origSemaine, newAnn = origAnnee, newDuree = origDuree
        if (type === 'move') {
          const ns = addWeeks(origSemaine, origAnnee, delta)
          newSem = ns.semaine; newAnn = ns.annee
        } else if (type === 'resize-right') {
          newDuree = Math.max(1, origDuree + delta)
        } else if (type === 'resize-left') {
          const shift = Math.min(delta, origDuree - 1)
          const ns = addWeeks(origSemaine, origAnnee, shift)
          newSem = ns.semaine; newAnn = ns.annee
          newDuree = Math.max(1, origDuree - delta)
        }
        if (newSem !== origSemaine || newAnn !== origAnnee || newDuree !== origDuree) {
          onPhaseUpdate(phaseId, { semaine_debut: newSem, annee_debut: newAnn, duree_semaines: newDuree })
        }
      }
      barDragRef.current = null
      dragState.moved = false   // reset pour que le crayon fonctionne après un drag
      setDraggingBar(null)
      document.body.style.cursor = ''
    }
    if (connectingFrom && !hoveredPoint) setConnectingFrom(null)
  }, [semWidth, onPhaseUpdate, connectingFrom, hoveredPoint])

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
      if (point.side === 'start' && point.phaseId !== connectingFrom.phaseId) {
        const exists = phases.find(p => p.id === point.phaseId && p.depends_on === connectingFrom.phaseId)
        if (!exists) {
          const fromPhase = phases.find(p => p.id === connectingFrom.phaseId)
          const toPhase = phases.find(p => p.id === point.phaseId)
          const lag = (fromPhase && toPhase)
            ? computeLagSemaines(fromPhase.semaine_debut, fromPhase.annee_debut, fromPhase.duree_semaines, toPhase.semaine_debut, toPhase.annee_debut)
            : 0
          onDependencyCreate(connectingFrom.phaseId, point.phaseId, lag)
        }
      }
      setConnectingFrom(null)
    }
  }, [connectingFrom, phases, onDependencyCreate])

  return (
    <div
      style={{ position: 'relative', userSelect: 'none', width: totalWidth, minWidth: totalWidth }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, height: HEADER_HEIGHT,
        borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        backgroundColor: 'rgba(245,242,240,0.95)',
        backdropFilter: 'blur(4px)',
      }}>
        {/* Row 1: months */}
        <div style={{ position: 'relative', height: 28, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          {monthLabels.map(({ i, label }) => (
            <div key={i} style={{
              position: 'absolute', top: 0, bottom: 0, left: i * semWidth,
              display: 'flex', alignItems: 'center', paddingLeft: 8,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: '#E8602C',
              }}>
                {label}
              </span>
            </div>
          ))}
          {jalonPositions.map(j => (
            j.left >= 0 && j.left < totalWidth ? (
              <div key={j.id} style={{
                position: 'absolute', left: j.left, top: 0, bottom: 0,
                width: 2, backgroundColor: j.couleur, opacity: 0.35, pointerEvents: 'none',
              }} />
            ) : null
          ))}
        </div>
        {/* Row 2: week numbers */}
        <div style={{ display: 'flex', height: 28, alignItems: 'center' }}>
          {weeks.map((w, i) => {
            const isCurrent = w.semaine === currentWeek.semaine && w.annee === currentWeek.annee
            const isMonthStart = isFirstWeekOfMonth(w.semaine, w.annee)
            return (
              <div key={i} style={{
                width: semWidth, minWidth: semWidth, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRight: isMonthStart ? '1px solid rgba(0,0,0,0.35)' : '1px solid rgba(0,0,0,0.15)',
                backgroundColor: isCurrent ? 'rgba(232,96,44,0.12)' : 'transparent',
                height: '100%',
              }}>
                {semWidth >= 18 && (
                  <span style={{
                    fontSize: 9, fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? '#E8602C' : '#9C9591',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    S{w.semaine}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        {/* Current week column highlight */}
        {currentWeekLeft >= 0 && currentWeekLeft < totalWidth && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: currentWeekLeft, width: semWidth,
            backgroundColor: 'rgba(224,90,30,0.04)', pointerEvents: 'none',
          }} />
        )}

        {/* Week grid lines */}
        {weeks.map((w, i) => {
          const isMonthStart = isFirstWeekOfMonth(w.semaine, w.annee)
          return (
            <div key={i} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: i * semWidth, width: 1,
              backgroundColor: isMonthStart ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)',
              pointerEvents: 'none',
            }} />
          )
        })}

        {/* Current week marker */}
        {currentWeekLeft >= 0 && currentWeekLeft < totalWidth && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, zIndex: 20,
            left: currentWeekLeft, width: 2,
            backgroundColor: '#E8602C', opacity: 0.5, pointerEvents: 'none',
          }} />
        )}

        {/* Jalons */}
        {jalonPositions.map(j => (
          j.left >= 0 && j.left < totalWidth ? (
            <div
              key={j.id}
              style={{
                position: 'absolute', left: j.left, top: 0, bottom: 0,
                width: 2.5, backgroundColor: j.couleur, opacity: 0.85,
                zIndex: 15, pointerEvents: 'auto', cursor: 'pointer',
              }}
              title={`${j.label} — S${j.semaine} ${j.annee}`}
              onClick={(e) => { e.stopPropagation(); onJalonClick?.(j) }}
            >
              <div style={{
                position: 'absolute', top: 4, left: 5,
                backgroundColor: j.couleur, color: 'white',
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                userSelect: 'none',
              }}>
                {j.label}
              </div>
              <div style={{
                position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderTop: `7px solid ${j.couleur}`, opacity: 0.85,
              }} />
            </div>
          ) : null
        ))}

        {/* Phase rows */}
        {phases.map((phase) => (
          <PhaseBarRow
            key={phase.id}
            phase={phase}
            rowOffset={rowOffsets[phase.id] ?? 0}
            semWidth={semWidth}
            refSemaine={refWeek.semaine}
            refAnnee={refWeek.annee}
            isDragging={draggingBar === phase.id}
            isConnecting={!!connectingFrom}
            connectingFromId={connectingFrom?.phaseId ?? null}
            hoveredPoint={hoveredPoint}
            onBarDragStart={startBarDrag}
            onBarClick={onPhaseClick}
            onConnectionPointClick={handleConnectionPointClick}
            onConnectionPointHover={setHoveredPoint}
            isCritical={criticalIds?.has(phase.id) ?? false}
          />
        ))}

        {/* SVG: dependency arrows */}
        <svg
          ref={svgRef}
          style={{
            position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none',
            width: totalWidth, height: Math.max(totalBodyHeight, 1), overflow: 'visible',
            color: '#e4702a',
          }}
        >
          <defs>
            <marker id="dep-arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="currentColor" />
            </marker>
            <marker id="dep-arr-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="#B8412C" />
            </marker>
            <marker id="dep-arr-live" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="currentColor" />
            </marker>
          </defs>

          {showConnections && arrows.map(arrow => {
            const isHov = hoveredArrowId === arrow.id
            const ctrl = Math.max(40, Math.abs(arrow.toX - arrow.fromX) * 0.4)
            const d = `M ${arrow.fromX} ${arrow.fromY} C ${arrow.fromX + ctrl} ${arrow.fromY}, ${arrow.toX - ctrl} ${arrow.toY}, ${arrow.toX} ${arrow.toY}`
            return (
              <g key={arrow.id}
                style={{ cursor: isHov ? 'pointer' : 'default', pointerEvents: 'auto' }}
                onMouseEnter={() => setHoveredArrowId(arrow.id)}
                onMouseLeave={() => setHoveredArrowId(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  setDeletingArrow({ fromPhaseId: arrow.fromPhaseId, toPhaseId: arrow.toPhaseId, fromPhaseName: arrow.fromPhaseName, toPhaseName: arrow.toPhaseName })
                }}
              >
                <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
                <path d={d} fill="none"
                  stroke={isHov ? '#B8412C' : 'currentColor'}
                  strokeWidth={isHov ? 2.5 : 2}
                  strokeDasharray={isHov ? 'none' : '6 3'}
                  strokeOpacity={isHov ? 1 : 0.85}
                  markerEnd={isHov ? 'url(#dep-arr-red)' : 'url(#dep-arr)'}
                  style={{ pointerEvents: 'none' }}
                />
                <circle cx={arrow.fromX} cy={arrow.fromY}
                  r={isHov ? 5 : 3.5}
                  fill={isHov ? '#B8412C' : 'currentColor'}
                  opacity={isHov ? 1 : 0.85}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            )
          })}

          {connectingFrom && (
            <g>
              <line
                x1={connectingFrom.x} y1={connectingFrom.y}
                x2={mousePos.x} y2={mousePos.y}
                stroke="currentColor" strokeWidth="2.5" strokeDasharray="7 3"
                markerEnd="url(#dep-arr-live)"
              />
              <circle cx={connectingFrom.x} cy={connectingFrom.y} r="5" fill="currentColor">
                <animate attributeName="r" values="4;7;4" dur="0.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.4;1" dur="0.9s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>
      </div>

      {/* Toast connexion */}
      {connectingFrom && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, backgroundColor: '#E8602C', color: 'white',
          fontSize: 12, fontWeight: 700, padding: '10px 20px', borderRadius: 999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'white', display: 'inline-block' }} />
          Cliquez sur le point de début d'une phase · Échap pour annuler
        </div>
      )}

      {/* Modal suppression dépendance */}
      {deletingArrow && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDeletingArrow(null)}>
          <div style={{
            backgroundColor: 'white', borderRadius: 16, padding: '28px 32px',
            maxWidth: 420, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(184,65,44,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <GitBranch size={18} style={{ color: '#B8412C' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Supprimer la dépendance</span>
            </div>
            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 20 }}>
              La liaison entre <strong>{deletingArrow.fromPhaseName}</strong> et <strong>{deletingArrow.toPhaseName}</strong> sera supprimée.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeletingArrow(null)} style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'transparent', color: '#374151' }}>
                Annuler
              </button>
              <button
                onClick={() => { onDependencyDelete(deletingArrow.fromPhaseId, deletingArrow.toPhaseId); setDeletingArrow(null) }}
                style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, border: 'none', backgroundColor: '#B8412C', color: 'white', cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PhaseBarRow ───────────────────────────────────────────────────────────────

function PhaseBarRow({
  phase, rowOffset, semWidth, refSemaine, refAnnee,
  isDragging, isConnecting, connectingFromId, hoveredPoint,
  onBarDragStart, onBarClick, onConnectionPointClick, onConnectionPointHover,
  isCritical,
}) {
  const [isHovered, setIsHovered] = useState(false)

  const isMoe = phase.type_tache === 'etude'
  const rh = rowHeightOf(phase)
  const barPad = barPadOf(phase)
  const color = TYPE_COLORS[phase.type_tache] ?? '#9C9591'
  const isAdmin = phase.type_tache === 'administratif'

  const { left, width } = getPhaseX(phase, refSemaine, refAnnee, semWidth)
  const HANDLE_W = Math.max(5, Math.min(8, semWidth * 0.2))
  const connectionY = rowOffset + rh - barPad

  const isSource = connectingFromId === phase.id
  const isStartHov = hoveredPoint?.phaseId === phase.id && hoveredPoint?.side === 'start'
  const isEndHov = hoveredPoint?.phaseId === phase.id && hoveredPoint?.side === 'end'
  const showStartDot = isConnecting && connectingFromId !== phase.id
  const showEndDot = !isConnecting && isHovered

  const startPoint = { phaseId: phase.id, side: 'start', x: left, y: connectionY }
  const endPoint = { phaseId: phase.id, side: 'end', x: left + width, y: connectionY }

  return (
    <div
      style={{ position: 'relative', height: rh, borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Phase bar ──────────────────────────────────────────────────── */}
      <div
        data-phaseid={phase.id}
        title={phase.nom}
        style={{
          position: 'absolute', left, width,
          top: barPad, bottom: barPad,
          backgroundColor: color,
          backgroundImage: isAdmin
            ? `repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.18) 8px, rgba(255,255,255,0.18) 16px)`
            : 'none',
          borderRadius: 0,
          display: 'flex', alignItems: 'center', overflow: 'visible',
          boxShadow: isDragging
            ? '0 8px 24px rgba(0,0,0,0.2)'
            : isCritical
              ? '0 0 0 2px #B8412C, 0 1px 3px rgba(0,0,0,0.15)'
              : '0 1px 3px rgba(0,0,0,0.15)',
          zIndex: isDragging ? 30 : 10,
          opacity: isDragging ? 0.9 : 1,
          cursor: isConnecting && !isSource ? 'crosshair' : 'grab',
        }}
        onMouseDown={(e) => {
          if (e.target.dataset.handle || e.target.dataset.editbtn || isConnecting) return
          onBarDragStart(e, phase, 'move')
        }}
      >

        {/* Resize left */}
        <div
          data-handle="left"
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, phase, 'resize-left') }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
        >
          <div style={{ height: 10, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        </div>

        {/* Segments intervenants MOE — largeurs en px, non-interactifs */}
        {isMoe && (phase.duree_arch > 0 || phase.duree_bet > 0 || phase.duree_econ > 0) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden', pointerEvents: 'none' }}>
            {phase.duree_arch > 0 && (
              <div style={{
                width: phase.duree_arch * semWidth, height: '100%', flexShrink: 0,
                backgroundColor: 'rgba(0,0,0,0.15)',
                borderRight: '1px solid rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'white', userSelect: 'none' }}>1</span>
              </div>
            )}
            {phase.duree_bet > 0 && (
              <div style={{
                width: phase.duree_bet * semWidth, height: '100%', flexShrink: 0,
                backgroundColor: 'rgba(0,0,0,0.25)',
                borderRight: '1px solid rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'white', userSelect: 'none' }}>2</span>
              </div>
            )}
            {phase.duree_econ > 0 && (
              <div style={{
                width: phase.duree_econ * semWidth, height: '100%', flexShrink: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'white', userSelect: 'none' }}>3</span>
              </div>
            )}
          </div>
        )}

        {/* Edit pencil */}
        <button
          data-editbtn="1"
          style={{
            position: 'absolute', zIndex: 20, right: HANDLE_W + 2, top: '50%', transform: 'translateY(-50%)',
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, border: 'none', cursor: 'pointer',
            backgroundColor: 'rgba(0,0,0,0.3)', color: 'white',
            opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
          onMouseDown={e => e.stopPropagation()}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.5)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.3)'}
          onClick={(e) => { e.stopPropagation(); onBarClick(phase) }}
          title="Modifier"
        >
          <Pencil size={11} strokeWidth={2.5} />
        </button>

        {/* Resize right */}
        <div
          data-handle="right"
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, phase, 'resize-right') }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
        >
          <div style={{ height: 10, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        </div>
      </div>

      {/* Label à droite de la barre */}
      <div style={{
        position: 'absolute',
        left: left + width + 4,
        top: barPad,
        bottom: barPad,
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        fontSize: 11,
        fontWeight: isMoe ? 600 : 400,
        color: '#1F1B17',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 10,
      }}>
        {phase.nom}
      </div>

      {/* ── Connection dot START ───────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', zIndex: 40,
          left: left - DOT_R, top: rh - barPad - DOT_R,
          width: DOT_R * 2, height: DOT_R * 2,
          borderRadius: '50%', border: '2px solid white', cursor: 'crosshair',
          backgroundColor: isStartHov ? '#E8602C' : color,
          transform: isStartHov ? 'scale(1.5)' : 'scale(1)',
          boxShadow: isStartHov ? '0 0 0 3px rgba(224,90,30,0.35)' : '0 1px 4px rgba(0,0,0,0.4)',
          opacity: showStartDot || isStartHov ? 1 : 0,
          transition: 'transform 0.15s, opacity 0.15s, background-color 0.15s',
          pointerEvents: showStartDot ? 'auto' : 'none',
        }}
        onClick={(e) => onConnectionPointClick(e, startPoint)}
        onMouseEnter={() => onConnectionPointHover(startPoint)}
        onMouseLeave={() => onConnectionPointHover(null)}
      />

      {/* ── Connection dot END ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', zIndex: 40,
          left: left + width - DOT_R, top: rh - barPad - DOT_R,
          width: DOT_R * 2, height: DOT_R * 2,
          borderRadius: '50%', border: '2px solid white', cursor: 'crosshair',
          backgroundColor: isSource || isEndHov ? '#E8602C' : color,
          transform: isEndHov || isSource ? 'scale(1.5)' : 'scale(1)',
          boxShadow: (isEndHov || isSource) ? '0 0 0 3px rgba(224,90,30,0.35)' : '0 1px 4px rgba(0,0,0,0.4)',
          opacity: showEndDot || isSource || isEndHov ? 1 : 0,
          transition: 'transform 0.15s, opacity 0.15s, background-color 0.15s',
          pointerEvents: showEndDot ? 'auto' : 'none',
        }}
        onClick={(e) => onConnectionPointClick(e, endPoint)}
        onMouseEnter={() => onConnectionPointHover(endPoint)}
        onMouseLeave={() => onConnectionPointHover(null)}
      />
    </div>
  )
}
