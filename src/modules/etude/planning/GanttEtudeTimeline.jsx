import { useMemo, useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react'
import { GitBranch } from 'lucide-react'
import { MenuRadial, EditionBarre, BandeauLien } from '../../../shared/planning/MenuRadial'
import { recadrerSurBarre } from '../../../shared/planning/recadrage'
import {
  getWeekStart, addWeeks, weeksBetween, getCurrentWeek, computeLagSemaines,
  getPhaseCouleur, adminGradient, rowMetrics,
  weekOfDate, computePhaseFragments, finEffectivePhase, distributeSegmentsAcrossFragments,
  creeraitUnCycle,
} from './types'
import { clePhase } from './snapshotDiffEtude'

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
    return { background: adminGradient(couleur) }
  }
  return { backgroundColor: couleur }
}

const HEADER_HEIGHT = 56

const dragState = { moved: false }

// Libellé court d'une phase pour le disque central du menu radial : le premier
// mot de son nom (« ESQ », « APS », « Dépôt »), le planning d'étude n'ayant pas
// de numéros de tâche.
function libelleCourt(nom) {
  return String(nom ?? '').trim().split(/[\s–—-]+/)[0].slice(0, 7) || '—'
}

// Hauteur et marges dérivées de la prop `rowHeight` (cf. rowMetrics dans
// types.js) — plus aucune constante figée ici.

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
  segments = [], getSegmentsForPhase, updateSegmentLocal, onSegmentCommit, onSegmentDragBegin,
  periodes = [],
  drawMode = false, onDrawCreate,
  rowHeight = 44,
  onPhaseDuplicate, onPhaseDelete, onSelectionChange, scrollRef = null,
}) {
  const metrics = rowMetrics(rowHeight)
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
      offsets[clePhase(p)] = y
      y += rowHeight
    }
    return offsets
  }, [phases, rowHeight])

  const totalBodyHeight = useMemo(() =>
    phases.length * rowHeight,
    [phases, rowHeight]
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

  // ── Menu radial ───────────────────────────────────────────────────────────────
  // { phaseId, mode: 'menu' | 'move' | 'resize' | 'lien' } — toucher une barre
  // ouvre le menu ; Déplacer et Allonger passent en mode édition, Lier attend
  // la phase suivante.
  const [selection, setSelection] = useState(null)
  // En mode dessin, le geste crée une phase : aucune sélection n'y survit
  const selectionPhase = selection && !drawMode ? phases.find((p) => p.id === selection.phaseId) ?? null : null

  useEffect(() => { onSelectionChange?.(selectionPhase?.id ?? null) }, [selectionPhase?.id, onSelectionChange])

  // À la souris, une barre se glisse directement. Au doigt, seulement en mode
  // Déplacer ou Allonger de cette phase : ailleurs le geste reste un toucher,
  // qui ouvre le menu radial.
  const startBarDrag = useCallback((e, phase, type) => {
    if (drawMode) return   // en mode dessin, le geste crée une phase
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    // Une phase Notion n'a pas d'id : sans le test sur `selection`, undefined
    // === undefined la ferait passer pour la phase sélectionnée
    const enEdition = selection != null && phase.id != null && selection.phaseId === phase.id
      && (selection.mode === 'move' || selection.mode === 'resize')
    dragState.moved = false
    barDragRef.current = {
      type, phaseId: phase.id, phase,
      startX: e.clientX, startY: e.clientY,
      origSemaine: phase.semaine_debut,
      origAnnee: phase.annee_debut,
      origDuree: phase.duree_semaines,
      // Phase venue de Notion, absente de la base : il n'y a rien à enregistrer
      glissable: phase.id != null && (e.pointerType === 'mouse' || enEdition),
      pointerType: e.pointerType,
      moved: false,
      lastDelta: 0,
    }
    setDraggingBar(clePhase(phase))
    setDragPreview(null)
    if (e.pointerType === 'mouse') document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [drawMode, selection])

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
    // `updateSegmentLocal` est appelé juste avant le commit, au relâchement :
    // l'instantané doit donc être pris ici, avant que l'état ne bouge.
    onSegmentDragBegin?.(type === 'move'
      ? 'Déplacement d’un segment'
      : 'Redimensionnement d’un segment')
    document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize'
  }, [refWeek, semWidth, drawMode, onSegmentDragBegin])

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
  }, [drawState, semaineAtX, onDrawCreate])

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

  // ── Liaisons ──────────────────────────────────────────────────────────────────
  const [hoveredArrowId, setHoveredArrowId] = useState(null)
  const [deletingArrow, setDeletingArrow] = useState(null)
  const svgRef = useRef(null)

  // Phases telles qu'affichées : l'aperçu du geste en cours y est intégré, pour
  // que les flèches suivent la barre pendant qu'on la glisse.
  const phasesAffichees = useMemo(
    () => (dragPreview ? phases.map((p) => (p.id === dragPreview.id ? { ...p, ...dragPreview } : p)) : phases),
    [phases, dragPreview]
  )

  const arrows = useMemo(() =>
    phasesAffichees
      .filter(p => p.depends_on != null)
      .map(p => {
        const fromPhase = phasesAffichees.find(x => x.id === p.depends_on)
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
        const fromY = fromOffset + rowHeight - metrics.barPad
        const toY = toOffset + rowHeight - metrics.barPad
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
    [phasesAffichees, rowOffsets, refWeek, semWidth, periodes, rowHeight, metrics.barPad]
  )

  // ── Lier, recadrer, toucher ───────────────────────────────────────────────────

  // Le planning d'étude n'a qu'un prédécesseur par phase : lier la cible le
  // remplace. Une boucle est refusée.
  const creerLien = useCallback((sourceId, cibleId) => {
    if (sourceId == null || cibleId == null || sourceId === cibleId) return
    if (creeraitUnCycle(phases, cibleId, sourceId)) return
    const cible = phases.find((p) => p.id === cibleId)
    if (!cible || cible.depends_on === sourceId) return
    const source = phases.find((p) => p.id === sourceId)
    const lag = source
      ? computeLagSemaines(source.semaine_debut, source.annee_debut, source.duree_semaines, cible.semaine_debut, cible.annee_debut, periodes)
      : 0
    onDependencyCreate(sourceId, cibleId, lag)
  }, [phases, periodes, onDependencyCreate])

  // Recadrage « caméra » sur la barre touchée (cf. recadrerSurBarre)
  const camera = useRef(null)
  useEffect(() => () => { if (camera.current) cancelAnimationFrame(camera.current) }, [])

  // Toucher (ou clic sans glisser) une barre de phase
  const toucherPhase = useCallback((phase) => {
    if (selection?.mode === 'lien') {
      creerLien(selection.phaseId, phase.id)
      setSelection(null)
      return
    }
    // Phase venue de Notion : rien à déplacer ni lier, ses réglages seulement
    if (phase.id == null) { onPhaseClick(phase); return }
    setSelection({ phaseId: phase.id, mode: 'menu' })
    recadrerSurBarre(scrollRef, `[data-phaseid="${phase.id}"]`, camera)
  }, [selection, creerLien, scrollRef, onPhaseClick])

  // Grandes poignées du mode Déplacer / Allonger
  const poigneeDown = useCallback((e, type) => {
    if (selectionPhase) startBarDrag(e, selectionPhase, type)
  }, [selectionPhase, startBarDrag])

  // En mode Lier, toucher un segment lie sa phase
  const toucherSegment = useCallback((phase) => {
    if (selection?.mode !== 'lien') return false
    creerLien(selection.phaseId, phase.id)
    setSelection(null)
    return true
  }, [selection, creerLien])

  const actionMenu = useCallback((action) => {
    const phase = selectionPhase
    if (!phase) { setSelection(null); return }
    if (action === 'move' || action === 'resize') { setSelection({ phaseId: phase.id, mode: action }); return }
    if (action === 'dep') { setSelection({ phaseId: phase.id, mode: 'lien' }); return }
    setSelection(null)
    if (action === 'params') onPhaseClick(phase)
    else if (action === 'dup') onPhaseDuplicate?.(phase)
    else if (action === 'del') onPhaseDelete?.(phase)
  }, [selectionPhase, onPhaseClick, onPhaseDuplicate, onPhaseDelete])

  // Le calque de fermeture du menu ne couvre que les lignes : un clic plus bas
  // (planning court) ou sur l'en-tête doit aussi le refermer. Les clics sur une
  // barre sont ignorés : c'est le clic qui vient d'ouvrir le menu.
  useEffect(() => {
    const volet = scrollRef?.current
    if (selection?.mode !== 'menu' || !volet) return
    const fermer = (e) => {
      if (e.target.closest?.('[role="menu"], [data-phasebarre]')) return
      setSelection(null)
    }
    volet.addEventListener('click', fermer)
    return () => volet.removeEventListener('click', fermer)
  }, [selection?.mode, scrollRef])

  // ── Glisser une barre de phase ────────────────────────────────────────────────
  // Écouté sur la fenêtre : sortir du planning (sous la dernière ligne, sur la
  // barre de défilement) ne doit pas valider le geste. Le geste compte comme un
  // déplacement dès qu'il change de semaine : à fort dézoom, une semaine fait
  // moins que le seuil en pixels.
  useLayoutEffect(() => {
    if (draggingBar == null) return

    const handleMove = (e) => {
      const drag = barDragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const delta = Math.round(dx / semWidth)
      const seuil = drag.pointerType === 'mouse' ? 4 : 8
      if (Math.abs(dx) > seuil || Math.abs(e.clientY - drag.startY) > seuil || (drag.glissable && delta !== 0)) {
        drag.moved = true
        dragState.moved = true
      }
      if (!drag.glissable || delta === drag.lastDelta) return
      drag.lastDelta = delta
      setDragPreview({ id: drag.phaseId, type: drag.type, ...phaseChangesFor(drag, delta) })
    }

    const handleUp = (e) => {
      const drag = barDragRef.current
      barDragRef.current = null
      setDraggingBar(null)
      setDragPreview(null)
      document.body.style.cursor = ''
      if (!drag) return
      if (!drag.moved) {
        if (e.type !== 'pointercancel') toucherPhase(drag.phase)
        return
      }
      if (!drag.glissable || e.type === 'pointercancel') return
      const delta = Math.round((e.clientX - drag.startX) / semWidth)
      if (delta === 0) return
      const c = phaseChangesFor(drag, delta)
      const newSem = c.semaine_debut ?? drag.origSemaine
      const newAnn = c.annee_debut ?? drag.origAnnee
      const newDuree = c.duree_semaines ?? drag.origDuree
      if (newSem !== drag.origSemaine || newAnn !== drag.origAnnee || newDuree !== drag.origDuree) {
        onPhaseUpdate(drag.phaseId, { semaine_debut: newSem, annee_debut: newAnn, duree_semaines: newDuree })
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [draggingBar, semWidth, phaseChangesFor, onPhaseUpdate, toucherPhase])

  // ── Segments (souris) ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (!segDragRef.current) return
    const drag = segDragRef.current
    const dx = e.clientX - drag.startX
    const delta = Math.round(dx / semWidth)
    if (Math.abs(dx) > 4 || delta !== 0) dragState.moved = true
    const el = document.querySelector(`[data-segid="${drag.segId}"]`)
    if (el) {
      const c = segChangesFor(drag, delta)
      if (c.semaine_debut != null) {
        const shift = weeksBetween(drag.origSemaine, drag.origAnnee, c.semaine_debut, c.annee_debut)
        el.style.left = `${drag.origLeft + shift * semWidth}px`
      }
      if (c.duree_semaines != null) el.style.width = `${c.duree_semaines * semWidth}px`
    }
  }, [semWidth, segChangesFor])

  const handleMouseUp = useCallback((e) => {
    if (!segDragRef.current) return
    const drag = segDragRef.current
    const delta = Math.round((e.clientX - drag.startX) / semWidth)
    const changes = segChangesFor(drag, delta)
    const bouge = (changes.semaine_debut != null && changes.semaine_debut !== drag.origSemaine)
      || (changes.annee_debut != null && changes.annee_debut !== drag.origAnnee)
      || (changes.duree_semaines != null && changes.duree_semaines !== drag.origDuree)
    if (bouge) {
      dragState.moved = true
      updateSegmentLocal?.(drag.segId, changes)
      onSegmentCommit?.(drag.segId, changes)
    } else {
      // L'aperçu a déplacé l'élément directement dans le DOM. Sans geste
      // abouti, l'état ne change pas et React ne le remettrait pas en place.
      const el = document.querySelector(`[data-segid="${drag.segId}"]`)
      if (el) {
        el.style.left = `${drag.origLeft}px`
        el.style.width = `${Math.max(drag.origDuree, 1) * semWidth}px`
      }
    }
    segDragRef.current = null
    // `dragState.moved` n'est PAS réinitialisé ici : le clic qui suit le
    // mouseup doit encore pouvoir le lire pour ne pas rouvrir la modale.
    // Le prochain début de geste le remet à false.
    setDraggingSeg(null)
    document.body.style.cursor = ''
  }, [semWidth, segChangesFor, updateSegmentLocal, onSegmentCommit])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setSelection(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

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
            key={clePhase(phase)}
            phase={dragPreview && dragPreview.id === phase.id ? { ...phase, ...dragPreview } : phase}
            periodes={periodes}
            rowHeight={rowHeight}
            semWidth={semWidth}
            refSemaine={refWeek.semaine}
            refAnnee={refWeek.annee}
            isDragging={draggingBar === clePhase(phase) && !!dragPreview}
            enEdition={selectionPhase != null && selectionPhase.id === phase.id && ['move', 'resize'].includes(selection?.mode)}
            modeLien={selectionPhase != null && selection?.mode === 'lien'}
            onBarDragStart={startBarDrag}
            onBarClick={onPhaseClick}
            onSegmentTap={toucherSegment}
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

        </svg>

        {/* ── Menu radial et modes d'édition d'une barre ─────────────────── */}
        {selectionPhase && rowOffsets[clePhase(selectionPhase)] !== undefined && (() => {
          const affichee = dragPreview && dragPreview.id === selectionPhase.id
            ? { ...selectionPhase, ...dragPreview } : selectionPhase
          // Une phase coupée par des congés est mise en avant fragment par fragment
          const fragments = computePhaseFragments(affichee, periodes).map((f) => ({
            left: weeksBetween(refWeek.semaine, refWeek.annee, f.semaine_debut, f.annee_debut) * semWidth,
            width: f.duree_semaines * semWidth,
          }))
          const dernier = fragments[fragments.length - 1]
          const barre = {
            left: fragments[0].left, width: dernier.left + dernier.width - fragments[0].left,
            haut: rowOffsets[clePhase(selectionPhase)], hauteurLigne: rowHeight, barPad: metrics.barPad,
            fond: getBarStyle(selectionPhase, getPhaseCouleur(selectionPhase)), fragments,
          }
          if (selection.mode === 'menu') {
            return (
              <MenuRadial
                barre={barre}
                objet="phase"
                numero={libelleCourt(selectionPhase.nom)}
                duree={`${selectionPhase.duree_semaines} sem.`}
                onAction={actionMenu}
                onFermer={() => setSelection(null)}
              />
            )
          }
          if (selection.mode === 'move' || selection.mode === 'resize') {
            // Écart du geste en cours, en semaines
            let ecart = 0
            if (dragPreview && dragPreview.id === selectionPhase.id) {
              ecart = dragPreview.type === 'move'
                ? weeksBetween(selectionPhase.semaine_debut, selectionPhase.annee_debut, affichee.semaine_debut, affichee.annee_debut)
                : affichee.duree_semaines - selectionPhase.duree_semaines
            }
            return (
              <EditionBarre
                barre={barre}
                objet="phase"
                mode={selection.mode}
                ecart={ecart === 0 ? '±0 sem.' : `${ecart > 0 ? '+' : ''}${ecart} sem.`}
                onPoigneeDown={poigneeDown}
                onTerminer={() => setSelection(null)}
              />
            )
          }
          return null
        })()}
      </div>

      {selectionPhase && selection?.mode === 'lien' && <BandeauLien objet="phase" onAnnuler={() => setSelection(null)} />}

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
  phase, periodes = [], semWidth, refSemaine, refAnnee, rowHeight = 44,
  isDragging, enEdition = false, modeLien = false,
  onBarDragStart, onBarClick, onSegmentTap,
  isCritical,
  segments = [], draggingSegId, onSegmentDragStart,
}) {
  const isMoe = phase.type_tache === 'etude'
  const { barPad: barPadBase, fontSize } = rowMetrics(rowHeight)
  // Barre en cours d'édition (Déplacer / Allonger) : légèrement agrandie et
  // soulevée, comme dans la maquette
  const barPad = enEdition ? Math.max(0, barPadBase - 2) : barPadBase
  const rh = rowHeight
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

  const dernierFrag = fragments[fragments.length - 1]
  // Bord droit = fin EFFECTIVE (dernier fragment), pas début + durée
  const finLeft = weeksBetween(refSemaine, refAnnee, dernierFrag.semaine_debut, dernierFrag.annee_debut) * semWidth
    + dernierFrag.duree_semaines * semWidth

  const HANDLE_W = Math.max(5, Math.min(8, semWidth * 0.2))
  // Une phase venue de Notion n'est pas en base : elle ne se glisse ni ne s'étire
  const modifiable = phase.id != null

  return (
    <div style={{ position: 'relative', height: rh, borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
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
            data-phasebarre="1"
            title={fragments.length > 1
              ? `${phase.nom} — fragment ${i + 1}/${fragments.length}`
              : phase.nom}
            style={{
              position: 'absolute', left: fLeft, width: fWidth,
              top: barPad, bottom: barPad,
              ...barStyle,
              borderRadius: 0,
              display: 'flex', alignItems: 'center', overflow: 'visible',
              boxShadow: enEdition || isDragging
                ? '0 4px 14px rgba(0,0,0,0.25)'
                : isCritical
                  ? '0 0 0 2px #B8412C, 0 1px 3px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.15)',
              zIndex: enEdition ? 36 : isDragging ? 30 : 10,
              cursor: modeLien ? 'crosshair' : 'pointer',
              // Le doigt glisse la barre (en édition) au lieu de faire défiler
              touchAction: 'none',
            }}
            onPointerDown={(e) => {
              if (e.target.dataset.handle) return
              onBarDragStart(e, phase, 'move')
            }}
          >
            {/* Resize left — sur le premier fragment (début de la phase) */}
            {premier && (
              <div
                data-handle="left"
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE_W, cursor: modifiable ? 'ew-resize' : 'default', flexShrink: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                // Poignées fines, pour la souris : au doigt, Allonger du menu radial
                onPointerDown={(e) => { if (e.pointerType !== 'mouse') return; e.stopPropagation(); onBarDragStart(e, phase, 'resize-left') }}
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

            {/* Resize right — sur le dernier fragment (fin de la phase) */}
            {dernier && (
              <>
                <div
                  data-handle="right"
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE_W, cursor: modifiable ? 'ew-resize' : 'default', flexShrink: 0, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onPointerDown={(e) => { if (e.pointerType !== 'mouse') return; e.stopPropagation(); onBarDragStart(e, phase, 'resize-right') }}
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
        fontSize,
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
                if (onSegmentTap?.(phase)) return
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

    </div>
  )
}
