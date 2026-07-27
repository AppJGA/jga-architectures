import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Pencil, GitBranch } from 'lucide-react'
import {
  getWeekStart, addWeeks, weeksBetween, getCurrentWeek, computeLagSemaines,
  getPhaseCouleur, adminGradient, darken,
  weekOfDate, computePhaseFragments, finEffectivePhase, distributeSegmentsAcrossFragments,
} from './types'

function hexToRgba(hex, alpha) {
  const h = (hex || '#B8412C').replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Style de remplissage d'une barre : rayures pour les phases administratives
// (barre principale ET segments, pour qu'ils se ressemblent), aplat sinon.
function getBarStyle(phase, couleur) {
  if (phase.type_tache === 'administratif') {
    return {
      background: adminGradient(couleur),
      border: `1px solid ${darken(couleur, 0.15)}`,
    }
  }
  return { backgroundColor: couleur }
}

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

export function GanttEtudeTimeline({
  phases, semWidth, showConnections,
  jalons = [], onJalonClick,
  onPhaseClick, onPhaseUpdate,
  onDependencyCreate, onDependencyDelete,
  criticalIds,
  refSemaine, refAnnee,
  segments = [], getSegmentsForPhase, updateSegmentLocal, onSegmentCommit,
  periodes = [],
  drawMode = false, onDrawCreate,
}) {
  // ── Reference week — reçue depuis GanttEtude (dynamique, -4 sem de marge) ─────
  const refWeek = useMemo(
    () => ({ semaine: refSemaine, annee: refAnnee }),
    [refSemaine, refAnnee]
  )

  // ── Largeur dynamique : couvre toutes les phases + 8 sem de marge à droite ────
  const totalWeeks = useMemo(() => {
    if (phases.length === 0 && segments.length === 0) return 52
    let maxEnd = 0
    phases.forEach(p => {
      // Fin effective : une phase coupée par des congés se termine plus tard
      const fin = finEffectivePhase(p, periodes)
      const end = weeksBetween(refSemaine, refAnnee, fin.semaine, fin.annee)
      if (end > maxEnd) maxEnd = end
    })
    // Les segments peuvent se prolonger au-delà de la dernière phase
    segments.forEach(s => {
      const end = weeksBetween(refSemaine, refAnnee, s.semaine_debut, s.annee_debut) + s.duree_semaines
      if (end > maxEnd) maxEnd = end
    })
    return Math.max(maxEnd + 8, 52)
  }, [phases, segments, periodes, refSemaine, refAnnee])

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
  //
  // Une phase peut être scindée en plusieurs fragments (périodes bloquantes) :
  // l'aperçu passe donc par un état React plutôt que par une mutation du DOM,
  // pour que les fragments soient recalculés pendant le geste. Le state n'est
  // touché que lorsque le décalage change de semaine — pas à chaque pixel.
  const barDragRef = useRef(null)
  const [draggingBar, setDraggingBar] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)

  const startBarDrag = useCallback((e, phase, type) => {
    if (drawMode) return   // en mode dessin, le geste crée une phase
    e.preventDefault(); e.stopPropagation()
    dragState.moved = false
    barDragRef.current = {
      type, phaseId: phase.id,
      startX: e.clientX,
      origSemaine: phase.semaine_debut,
      origAnnee: phase.annee_debut,
      origDuree: phase.duree_semaines,
      lastDelta: 0,
    }
    setDraggingBar(phase.id)
    setDragPreview(null)
    document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [drawMode])

  // Nouvelle géométrie d'une phase après un déplacement de `delta` semaines —
  // partagée par l'aperçu et l'enregistrement, pour qu'ils ne divergent jamais.
  const phaseChangesFor = useCallback((drag, delta) => {
    const { type, origSemaine, origAnnee, origDuree } = drag
    if (type === 'resize-right') {
      return { duree_semaines: Math.max(1, origDuree + delta) }
    }
    if (type === 'resize-left') {
      const shift = Math.min(delta, origDuree - 1)
      const ns = addWeeks(origSemaine, origAnnee, shift)
      return {
        semaine_debut: ns.semaine, annee_debut: ns.annee,
        duree_semaines: Math.max(1, origDuree - shift),
      }
    }
    const ns = addWeeks(origSemaine, origAnnee, delta)
    return { semaine_debut: ns.semaine, annee_debut: ns.annee }
  }, [])

  // ── Drag / resize des segments ────────────────────────────────────────────────
  // Même mécanique que les barres de phase : aperçu en manipulant le DOM pendant
  // le geste, aucune écriture avant le relâchement.
  const segDragRef = useRef(null)
  const [draggingSeg, setDraggingSeg] = useState(null)

  const startSegDrag = useCallback((e, seg, type) => {
    if (drawMode) return
    e.preventDefault(); e.stopPropagation()
    dragState.moved = false
    const origLeft = weeksBetween(refWeek.semaine, refWeek.annee, seg.semaine_debut, seg.annee_debut) * semWidth
    segDragRef.current = {
      type, segId: seg.id, startX: e.clientX,
      origSemaine: seg.semaine_debut,
      origAnnee: seg.annee_debut,
      origDuree: seg.duree_semaines,
      origLeft,
    }
    setDraggingSeg(seg.id)
    document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [refWeek, semWidth, drawMode])

  // Géométrie d'un segment après un déplacement de `delta` semaines
  const segChangesFor = useCallback((drag, delta) => {
    const { type, origSemaine, origAnnee, origDuree } = drag
    if (type === 'resize-right') {
      return { duree_semaines: Math.max(1, origDuree + delta) }
    }
    if (type === 'resize-left') {
      const shift = Math.min(delta, origDuree - 1)
      const ns = addWeeks(origSemaine, origAnnee, shift)
      return {
        semaine_debut: ns.semaine, annee_debut: ns.annee,
        duree_semaines: Math.max(1, origDuree - shift),
      }
    }
    const ns = addWeeks(origSemaine, origAnnee, delta)
    return { semaine_debut: ns.semaine, annee_debut: ns.annee }
  }, [])

  // ── Périodes (congés, fermetures…) ────────────────────────────────────────────
  // Les dates sont converties en semaines ISO : une période couvre toutes les
  // semaines qu'elle touche, même partiellement.
  const periodeBands = useMemo(() =>
    periodes.map((p) => {
      const wDebut = weekOfDate(p.date_debut)
      const wFin = weekOfDate(p.date_fin)
      if (!wDebut || !wFin) return null
      const startIdx = weeksBetween(refWeek.semaine, refWeek.annee, wDebut.semaine, wDebut.annee)
      const endIdx = weeksBetween(refWeek.semaine, refWeek.annee, wFin.semaine, wFin.annee) + 1
      if (endIdx <= 0) return null
      return {
        ...p,
        left: startIdx * semWidth,
        width: Math.max(semWidth, (endIdx - startIdx) * semWidth),
        bloquante: p.est_bloquante !== false,
      }
    }).filter(Boolean),
    [periodes, refWeek, semWidth]
  )

  // ── Dessin d'une phase par cliquer-glisser ────────────────────────────────────
  // Le planning d'étude n'a pas de groupement : la ligne survolée n'importe pas,
  // seule la plage de semaines compte.
  const [drawState, setDrawState] = useState(null)
  const containerRef = useRef(null)

  const semaineAtX = useCallback((x) => {
    const offset = Math.floor(x / semWidth)
    return addWeeks(refWeek.semaine, refWeek.annee, offset)
  }, [refWeek, semWidth])

  const handleDrawMouseDown = useCallback((e) => {
    if (!drawMode || e.button !== 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    // Ne pas démarrer un dessin sur l'en-tête collant
    if (e.clientY - rect.top < HEADER_HEIGHT) return
    e.preventDefault()
    const depart = semaineAtX(e.clientX - rect.left)
    setDrawState({ depart, courante: depart })
  }, [drawMode, semaineAtX])

  useEffect(() => {
    if (!drawState) return

    const handleMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const courante = semaineAtX(e.clientX - rect.left)
      setDrawState(prev => (prev ? { ...prev, courante } : prev))
    }

    const handleUp = () => {
      setDrawState(prev => {
        if (prev) {
          const delta = weeksBetween(
            prev.depart.semaine, prev.depart.annee,
            prev.courante.semaine, prev.courante.annee
          )
          const debut = delta >= 0 ? prev.depart : prev.courante
          onDrawCreate?.({
            semaine_debut: debut.semaine,
            annee_debut: debut.annee,
            duree_semaines: Math.max(1, Math.abs(delta) + 1),
          })
        }
        return null
      })
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [drawState, semaineAtX, onDrawCreate, weeksBetween])

  // Quitter le mode dessin annule un geste en cours
  useEffect(() => { if (!drawMode) setDrawState(null) }, [drawMode])

  // Géométrie du rectangle de prévisualisation
  const drawPreview = useMemo(() => {
    if (!drawState) return null
    const delta = weeksBetween(
      drawState.depart.semaine, drawState.depart.annee,
      drawState.courante.semaine, drawState.courante.annee
    )
    const debut = delta >= 0 ? drawState.depart : drawState.courante
    const duree = Math.abs(delta) + 1
    return {
      left: weeksBetween(refWeek.semaine, refWeek.annee, debut.semaine, debut.annee) * semWidth,
      width: duree * semWidth,
      duree,
    }
  }, [drawState, refWeek, semWidth])

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
        // Fin effective (dernier fragment) : la flèche part de la fin réelle,
        // pas de début + durée, qui ignorerait les semaines bloquées.
        const finParent = finEffectivePhase(fromPhase, periodes)
        const fromLeft = weeksBetween(refWeek.semaine, refWeek.annee, finParent.semaine, finParent.annee) * semWidth
        const fromWidth = 0
        const fragsEnfant = computePhaseFragments(p, periodes)
        const toLeft = weeksBetween(
          refWeek.semaine, refWeek.annee,
          fragsEnfant[0].semaine_debut, fragsEnfant[0].annee_debut
        ) * semWidth
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
    [phases, rowOffsets, refWeek, semWidth, periodes]
  )

  // ── Mouse handlers ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (barDragRef.current) {
      const drag = barDragRef.current
      const dx = e.clientX - drag.startX
      if (Math.abs(dx) > 4) dragState.moved = true
      const delta = Math.round(dx / semWidth)
      if (delta !== drag.lastDelta) {
        drag.lastDelta = delta
        setDragPreview({ id: drag.phaseId, ...phaseChangesFor(drag, delta) })
      }
    }
    if (segDragRef.current) {
      const drag = segDragRef.current
      const dx = e.clientX - drag.startX
      if (Math.abs(dx) > 4) dragState.moved = true
      const delta = Math.round(dx / semWidth)
      const el = document.querySelector(`[data-segid="${drag.segId}"]`)
      if (el) {
        const c = segChangesFor(drag, delta)
        if (c.semaine_debut != null) {
          const shift = weeksBetween(drag.origSemaine, drag.origAnnee, c.semaine_debut, c.annee_debut)
          el.style.left = `${drag.origLeft + shift * semWidth}px`
        }
        if (c.duree_semaines != null) el.style.width = `${c.duree_semaines * semWidth}px`
      }
    }
    if (connectingFrom && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [semWidth, connectingFrom, segChangesFor, phaseChangesFor])

  const handleMouseUp = useCallback((e) => {
    if (barDragRef.current) {
      const drag = barDragRef.current
      const { phaseId, startX, origSemaine, origAnnee, origDuree } = drag
      if (dragState.moved) {
        const delta = Math.round((e.clientX - startX) / semWidth)
        const c = phaseChangesFor(drag, delta)
        const newSem = c.semaine_debut ?? origSemaine
        const newAnn = c.annee_debut ?? origAnnee
        const newDuree = c.duree_semaines ?? origDuree
        if (newSem !== origSemaine || newAnn !== origAnnee || newDuree !== origDuree) {
          onPhaseUpdate(phaseId, { semaine_debut: newSem, annee_debut: newAnn, duree_semaines: newDuree })
        }
      }
      barDragRef.current = null
      dragState.moved = false   // reset pour que le crayon fonctionne après un drag
      setDraggingBar(null)
      setDragPreview(null)
      document.body.style.cursor = ''
    }

    if (segDragRef.current) {
      const drag = segDragRef.current
      if (dragState.moved) {
        const delta = Math.round((e.clientX - drag.startX) / semWidth)
        const changes = segChangesFor(drag, delta)
        const bouge = (changes.semaine_debut != null && changes.semaine_debut !== drag.origSemaine)
          || (changes.annee_debut != null && changes.annee_debut !== drag.origAnnee)
          || (changes.duree_semaines != null && changes.duree_semaines !== drag.origDuree)
        if (bouge) {
          updateSegmentLocal?.(drag.segId, changes)
          onSegmentCommit?.(drag.segId, changes)
        }
      }
      segDragRef.current = null
      // `dragState.moved` n'est PAS réinitialisé ici : le clic qui suit le
      // mouseup doit encore pouvoir le lire pour ne pas rouvrir la modale.
      // Le prochain début de geste le remet à false.
      setDraggingSeg(null)
      document.body.style.cursor = ''
    }

    if (connectingFrom && !hoveredPoint) setConnectingFrom(null)
  }, [semWidth, onPhaseUpdate, connectingFrom, hoveredPoint, phaseChangesFor, segChangesFor, updateSegmentLocal, onSegmentCommit])

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
            ? computeLagSemaines(fromPhase.semaine_debut, fromPhase.annee_debut, fromPhase.duree_semaines, toPhase.semaine_debut, toPhase.annee_debut, periodes)
            : 0
          onDependencyCreate(connectingFrom.phaseId, point.phaseId, lag)
        }
      }
      setConnectingFrom(null)
    }
  }, [connectingFrom, phases, onDependencyCreate, periodes])

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

        {/* Périodes — hachurées si bloquantes, fond uni si informatives */}
        {periodeBands.map((p) => {
          const couleur = p.couleur || '#B8412C'
          return (
            <div
              key={p.id}
              title={`${p.label} — période ${p.bloquante ? 'bloquante' : 'informative'}`}
              style={{
                position: 'absolute', left: p.left, width: p.width, top: 0, bottom: 0,
                background: p.bloquante
                  ? `repeating-linear-gradient(45deg, ${hexToRgba(couleur, 0.06)}, ${hexToRgba(couleur, 0.06)} 4px, ${hexToRgba(couleur, 0.12)} 4px, ${hexToRgba(couleur, 0.12)} 8px)`
                  : hexToRgba(couleur, 0.06),
                borderLeft: `${p.bloquante ? 1.5 : 1}px solid ${hexToRgba(couleur, p.bloquante ? 0.3 : 0.2)}`,
                borderRight: `${p.bloquante ? 1.5 : 1}px solid ${hexToRgba(couleur, p.bloquante ? 0.3 : 0.2)}`,
                pointerEvents: 'none', zIndex: 1,
              }}
            >
              <div style={{
                position: 'absolute', top: 4, left: 4,
                fontSize: 9, fontWeight: 500, color: hexToRgba(couleur, 0.7),
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: Math.max(p.width - 8, 0),
              }}>
                {p.label}
              </div>
            </div>
          )
        })}

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
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
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

        {/* Phase rows — la phase affichée intègre l'aperçu du geste en cours */}
        {phases.map((phase) => (
          <PhaseBarRow
            key={phase.id}
            phase={dragPreview?.id === phase.id ? { ...phase, ...dragPreview } : phase}
            periodes={periodes}
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
            segments={getSegmentsForPhase ? getSegmentsForPhase(phase.id) : []}
            draggingSegId={draggingSeg}
            onSegmentDragStart={startSegDrag}
          />
        ))}

        {/* Prévisualisation du dessin en cours */}
        {drawPreview && (
          <div style={{
            position: 'absolute',
            left: drawPreview.left, width: drawPreview.width,
            top: 4, bottom: 4,
            background: '#E8602C', opacity: 0.35,
            border: '2px solid #E8602C',
            pointerEvents: 'none', zIndex: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {drawPreview.duree > 1 && (
              <span style={{ fontSize: 10, color: 'white', fontWeight: 500 }}>
                {drawPreview.duree}S
              </span>
            )}
          </div>
        )}

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
          fontSize: 12, fontWeight: 700, padding: '10px 20px', borderRadius: 2,
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
            backgroundColor: 'white', borderRadius: 0, padding: '28px 32px',
            maxWidth: 420, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 2, backgroundColor: 'rgba(184,65,44,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <GitBranch size={18} style={{ color: '#B8412C' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Supprimer la dépendance</span>
            </div>
            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 20 }}>
              La liaison entre <strong>{deletingArrow.fromPhaseName}</strong> et <strong>{deletingArrow.toPhaseName}</strong> sera supprimée.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeletingArrow(null)} style={{ padding: '8px 16px', borderRadius: 2, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'transparent', color: '#374151' }}>
                Annuler
              </button>
              <button
                onClick={() => { onDependencyDelete(deletingArrow.fromPhaseId, deletingArrow.toPhaseId); setDeletingArrow(null) }}
                style={{ padding: '8px 16px', borderRadius: 2, fontSize: 13, fontWeight: 500, border: 'none', backgroundColor: '#B8412C', color: 'white', cursor: 'pointer' }}
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
  phase, periodes = [], rowOffset, semWidth, refSemaine, refAnnee,
  isDragging, isConnecting, connectingFromId, hoveredPoint,
  onBarDragStart, onBarClick, onConnectionPointClick, onConnectionPointHover,
  isCritical,
  segments = [], draggingSegId, onSegmentDragStart,
}) {
  const [isHovered, setIsHovered] = useState(false)

  const isMoe = phase.type_tache === 'etude'
  const rh = rowHeightOf(phase)
  const barPad = barPadOf(phase)
  const color = getPhaseCouleur(phase)
  const barStyle = getBarStyle(phase, color)
  const isAdmin = phase.type_tache === 'administratif'

  // Fragments visuels : la phase est coupée par les périodes bloquantes.
  // Recalculés à chaque rendu — un drag/resize met simplement à jour la phase.
  const fragments = useMemo(
    () => computePhaseFragments(phase, periodes),
    [phase, periodes]
  )

  // Répartition ①②③ étalée sur TOUS les fragments : une sous-durée interrompue
  // par des congés reprend sur le fragment suivant.
  const segsParFragment = useMemo(
    () => distributeSegmentsAcrossFragments(phase, fragments),
    [phase, fragments]
  )

  const premierFrag = fragments[0]
  const dernierFrag = fragments[fragments.length - 1]
  const left = weeksBetween(refSemaine, refAnnee, premierFrag.semaine_debut, premierFrag.annee_debut) * semWidth
  // Bord droit = fin EFFECTIVE (dernier fragment), pas début + durée
  const finLeft = weeksBetween(refSemaine, refAnnee, dernierFrag.semaine_debut, dernierFrag.annee_debut) * semWidth
    + dernierFrag.duree_semaines * semWidth

  const HANDLE_W = Math.max(5, Math.min(8, semWidth * 0.2))
  const connectionY = rowOffset + rh - barPad

  const isSource = connectingFromId === phase.id
  const isStartHov = hoveredPoint?.phaseId === phase.id && hoveredPoint?.side === 'start'
  const isEndHov = hoveredPoint?.phaseId === phase.id && hoveredPoint?.side === 'end'
  const showStartDot = isConnecting && connectingFromId !== phase.id
  const showEndDot = !isConnecting && isHovered

  const startPoint = { phaseId: phase.id, side: 'start', x: left, y: connectionY }
  const endPoint = { phaseId: phase.id, side: 'end', x: finLeft, y: connectionY }

  return (
    <div
      style={{ position: 'relative', height: rh, borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Barres de phase — un fragment par plage travaillée ───────────
          Les semaines couvertes par une période bloquante coupent la barre :
          la durée travaillée est conservée, la fin effective recule. */}
      {fragments.map((frag, i) => {
        const fLeft = weeksBetween(refSemaine, refAnnee, frag.semaine_debut, frag.annee_debut) * semWidth
        const fWidth = frag.duree_semaines * semWidth
        const premier = i === 0
        const dernier = i === fragments.length - 1

        return (
          <div
            key={`${phase.id}-frag-${i}`}
            data-phaseid={premier ? phase.id : undefined}
            title={fragments.length > 1
              ? `${phase.nom} — fragment ${i + 1}/${fragments.length}`
              : phase.nom}
            style={{
              position: 'absolute', left: fLeft, width: fWidth,
              top: barPad, bottom: barPad,
              ...barStyle,
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
            {/* Resize left — sur le premier fragment (début de la phase) */}
            {premier && (
              <div
                data-handle="left"
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, phase, 'resize-left') }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
              >
                <div style={{ height: 10, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
              </div>
            )}

            {/* Répartition des intervenants MOE — poursuivie d'un fragment à
                l'autre (cf. distributeSegmentsAcrossFragments) */}
            {isMoe && (segsParFragment[i] ?? []).length > 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden', pointerEvents: 'none' }}>
                {(segsParFragment[i] ?? []).map((sub, k, tous) => (
                  <div key={`${sub.num}-${k}`} style={{
                    width: sub.duree * semWidth, height: '100%', flexShrink: 0,
                    backgroundColor: `rgba(0,0,0,${sub.num === 1 ? 0.15 : sub.num === 2 ? 0.25 : 0.35})`,
                    borderRight: k < tous.length - 1 ? '1px solid rgba(255,255,255,0.6)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'white', userSelect: 'none' }}>{sub.num}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Texte des phases administratives — dans la barre, sur CHAQUE
                fragment (la barre peut être coupée par une période bloquante) */}
            {isAdmin && phase.label_barre && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', padding: '0 6px',
                overflow: 'hidden', pointerEvents: 'none',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'white',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}>
                  {phase.label_barre}
                </span>
              </div>
            )}

            {/* Crayon + resize right — sur le dernier fragment (fin de la phase) */}
            {dernier && (
              <>
                <button
                  data-editbtn="1"
                  style={{
                    position: 'absolute', zIndex: 20, right: HANDLE_W + 2, top: '50%', transform: 'translateY(-50%)',
                    width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 3, border: 'none', cursor: 'pointer',
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

                <div
                  data-handle="right"
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE_W, cursor: 'ew-resize', flexShrink: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseDown={(e) => { e.stopPropagation(); onBarDragStart(e, phase, 'resize-right') }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                >
                  <div style={{ height: 10, width: 1, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                </div>
              </>
            )}
          </div>
        )
      })}

      {/* Label à droite du dernier fragment — sauf pour les phases
          administratives, dont le texte est écrit dans la barre */}
      {!isAdmin && <div style={{
        position: 'absolute',
        left: finLeft + 4,
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
      </div>}


      {/* ── Segments supplémentaires ───────────────────────────────────────
          Même couleur que la phase, contour tireté pour les distinguer de la
          barre principale. Déplaçables et redimensionnables à la semaine. */}
      {segments.map((seg) => {
        const segLeft = weeksBetween(refSemaine, refAnnee, seg.semaine_debut, seg.annee_debut) * semWidth
        const segWidth = Math.max(seg.duree_semaines, 1) * semWidth
        const isDraggingSeg = draggingSegId === seg.id
        return (
          <div key={seg.id}>
            <div
              data-segid={seg.id}
              title={`${seg.nom ?? phase.nom} — segment · S${seg.semaine_debut} ${seg.annee_debut}, ${seg.duree_semaines} sem.`}
              style={{
                position: 'absolute',
                left: segLeft, width: segWidth,
                top: barPad, bottom: barPad,
                // Même remplissage que la barre principale (rayures si admin) —
                // seul l'outline pointillé distingue un segment d'un fragment.
                ...barStyle,
                opacity: isDraggingSeg ? 0.7 : 0.85,
                outline: '1.5px dashed rgba(255,255,255,0.5)',
                outlineOffset: -2,
                cursor: isDraggingSeg ? 'grabbing' : 'grab',
                zIndex: isDraggingSeg ? 25 : 8,
              }}
              onMouseDown={(e) => {
                if (e.target.dataset.seghandle) return
                onSegmentDragStart?.(e, seg, 'move')
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (dragState.moved) return
                onBarClick(phase)
              }}
            >
              <div
                data-seghandle="left"
                title="Redimensionner (début)"
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: HANDLE_W, cursor: 'ew-resize', zIndex: 10,
                  background: 'rgba(255,255,255,0.3)',
                }}
                onMouseDown={(e) => onSegmentDragStart?.(e, seg, 'resize-left')}
              />
              <div
                data-seghandle="right"
                title="Redimensionner (durée)"
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0,
                  width: HANDLE_W, cursor: 'ew-resize', zIndex: 10,
                  background: 'rgba(255,255,255,0.3)',
                }}
                onMouseDown={(e) => onSegmentDragStart?.(e, seg, 'resize-right')}
              />

              {/* Phase administrative : le texte s'écrit DANS la barre */}
              {isAdmin && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', padding: '0 6px',
                  overflow: 'hidden', pointerEvents: 'none',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'white',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}>
                    {seg.nom ?? phase.label_barre ?? ''}
                  </span>
                </div>
              )}
            </div>
            {!isAdmin && seg.nom && (
              <div style={{
                position: 'absolute',
                left: segLeft + segWidth + 4,
                top: barPad, bottom: barPad,
                display: 'flex', alignItems: 'center',
                whiteSpace: 'nowrap', fontSize: 10, fontStyle: 'italic',
                color: '#9C9591', pointerEvents: 'none', userSelect: 'none',
                zIndex: 10,
              }}>
                {seg.nom}
              </div>
            )}
          </div>
        )
      })}

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
          left: finLeft - DOT_R, top: rh - barPad - DOT_R,
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
