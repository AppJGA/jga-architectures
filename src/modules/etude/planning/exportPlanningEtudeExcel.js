// Import par défaut (et non `* as`) : xlsx-js-style est un module CommonJS dont
// l'espace de noms ESM n'expose pas `utils` hors bundler — l'import par défaut
// renvoie `module.exports` dans les deux cas.
import XLSX from 'xlsx-js-style'
import { TYPE_COLORS, getWeekStart, addWeeks, weeksBetween, getCurrentWeek, weekOfDate } from './types'

// ─── Export Excel du planning d'étude ─────────────────────────────────────────
//
// Transposition hebdomadaire de l'export chantier : une colonne par semaine ISO,
// une ligne par phase, avec ses segments, les jalons et les périodes.
//
// Conventions de bordures reprises du planning chantier : tout en noir, fines
// par défaut, épaisses pour les séparateurs (mois, sidebar/timeline), tiretées
// entre les lignes de phases.

const FIXED_COLS = 2 // Phase, Durée

const B_THIN = { style: 'thin', color: { rgb: '000000' } }
const B_THICK = { style: 'medium', color: { rgb: '000000' } }
const B_DASH = { style: 'dashed', color: { rgb: '000000' } }

const borderThin = { top: B_THIN, bottom: B_THIN, left: B_THIN, right: B_THIN }

const borderHeader = (leftThick, rightThick) => ({
  top: B_THICK, bottom: B_THICK,
  left: leftThick ? B_THICK : B_THIN,
  right: rightThick ? B_THICK : B_THIN,
})

const borderRow = (leftThick, rightThick) => ({
  top: B_DASH, bottom: B_DASH,
  left: leftThick ? B_THICK : B_THIN,
  right: rightThick ? B_THICK : B_THIN,
})

// xlsx ne gère pas la transparence : on simule l'opacité en mélangeant avec du blanc
function pastel(hex, ratio) {
  const h = (hex || '#9C9591').replace('#', '')
  const melange = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16)
    return Math.round(255 - (255 - c) * ratio).toString(16).padStart(2, '0')
  }
  return `${melange(0)}${melange(2)}${melange(4)}`.toUpperCase()
}

function isFirstWeekOfMonth(semaine, annee) {
  const date = getWeekStart(semaine, annee)
  const prev = new Date(date)
  prev.setDate(prev.getDate() - 7)
  return prev.getMonth() !== date.getMonth()
}

// Étendue : de la semaine de référence à la dernière semaine occupée + marge
function buildWeeks(phases, segments, periodes, refSemaine, refAnnee) {
  let maxEnd = 12
  const pousse = (sem, ann, duree) => {
    const fin = weeksBetween(refSemaine, refAnnee, sem, ann) + duree
    if (fin > maxEnd) maxEnd = fin
  }
  phases.forEach((p) => pousse(p.semaine_debut, p.annee_debut, p.duree_semaines))
  segments.forEach((s) => pousse(s.semaine_debut, s.annee_debut, s.duree_semaines))
  periodes.forEach((p) => {
    const w = weekOfDate(p.date_fin)
    if (w) pousse(w.semaine, w.annee, 1)
  })
  return Array.from({ length: maxEnd + 2 }, (_, i) => addWeeks(refSemaine, refAnnee, i))
}

export function exportPlanningEtudeExcel({
  phases = [], segments = [], jalons = [], periodes = [], affaire = {},
  refSemaine, refAnnee,
}) {
  const weeks = buildWeeks(phases, segments, periodes, refSemaine, refAnnee)
  const cw = getCurrentWeek()

  const ws = {}
  const merges = []
  let rowIdx = 0

  const setCell = (col, row, value, style) => {
    const addr = XLSX.utils.encode_cell({ c: col, r: row })
    ws[addr] = { v: value, s: style ?? {} }
    if (typeof value === 'string') ws[addr].t = 's'
    else if (typeof value === 'number') ws[addr].t = 'n'
  }

  const styleHeader = (col) => ({
    font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F1B17' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderHeader(false, col === FIXED_COLS - 1),
  })

  // ── Ligne 0 : mois (groupes fusionnés) ──
  setCell(0, 0, '', styleHeader(0))
  setCell(1, 0, '', styleHeader(1))
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: FIXED_COLS - 1 } })

  const moisGroupes = []
  weeks.forEach((w) => {
    const d = getWeekStart(w.semaine, w.annee)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = moisGroupes[moisGroupes.length - 1]
    if (last && last.key === key) last.count++
    else moisGroupes.push({
      key, count: 1,
      label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      month: d.getMonth(), year: d.getFullYear(),
    })
  })

  const today = new Date()
  let colOff = FIXED_COLS
  moisGroupes.forEach((mg) => {
    const isCur = mg.month === today.getMonth() && mg.year === today.getFullYear()
    setCell(colOff, 0, mg.label.charAt(0).toUpperCase() + mg.label.slice(1), {
      font: { bold: true, sz: 9, color: { rgb: isCur ? 'E8602C' : '1F1B17' } },
      fill: { fgColor: { rgb: isCur ? 'FAF0EB' : 'F5F2F0' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: borderHeader(true, true),
    })
    if (mg.count > 1) merges.push({ s: { r: 0, c: colOff }, e: { r: 0, c: colOff + mg.count - 1 } })
    colOff += mg.count
  })

  // ── Ligne 1 : numéros de semaine ──
  rowIdx = 1
  setCell(0, rowIdx, 'Phase', styleHeader(0))
  setCell(1, rowIdx, 'Durée', styleHeader(1))

  weeks.forEach((w, i) => {
    const isCur = w.semaine === cw.semaine && w.annee === cw.annee
    setCell(FIXED_COLS + i, rowIdx, `S${w.semaine}`, {
      font: { bold: isCur, sz: 8, color: { rgb: isCur ? 'E8602C' : '5E5854' } },
      fill: { fgColor: { rgb: isCur ? 'FAF0EB' : 'FAFAF9' } },
      alignment: { horizontal: 'center' },
      border: borderHeader(isFirstWeekOfMonth(w.semaine, w.annee), false),
    })
  })
  rowIdx = 2

  // ── Occupation d'une semaine ──
  const couvre = (w, sem, ann, duree) => {
    const offset = weeksBetween(sem, ann, w.semaine, w.annee)
    return offset >= 0 && offset < Math.max(1, duree)
  }

  const periodeDeLaSemaine = (w) => {
    const couvrantes = periodes.filter((p) => {
      const d = weekOfDate(p.date_debut)
      const f = weekOfDate(p.date_fin)
      if (!d || !f) return false
      return weeksBetween(d.semaine, d.annee, w.semaine, w.annee) >= 0
        && weeksBetween(w.semaine, w.annee, f.semaine, f.annee) >= 0
    })
    return couvrantes.find((p) => p.est_bloquante !== false) ?? couvrantes[0] ?? null
  }

  // ── Lignes de phases ──
  phases.forEach((phase) => {
    const couleur = TYPE_COLORS[phase.type_tache] ?? '#9C9591'
    const hex = couleur.replace('#', '')
    const segs = segments.filter((s) => s.phase_id === phase.id)

    setCell(0, rowIdx, phase.nom ?? '', {
      font: { bold: phase.type_tache === 'etude', sz: 9, color: { rgb: '1F1B17' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { vertical: 'center' },
      border: borderRow(false, false),
    })
    setCell(1, rowIdx, `${phase.duree_semaines} sem.`, {
      font: { sz: 9, color: { rgb: '5E5854' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: borderRow(false, true),
    })

    weeks.forEach((w, i) => {
      const dansPhase = couvre(w, phase.semaine_debut, phase.annee_debut, phase.duree_semaines)
      const dansSegment = segs.some((s) => couvre(w, s.semaine_debut, s.annee_debut, s.duree_semaines))
      const periode = periodeDeLaSemaine(w)

      let fillHex = 'FFFFFF'
      if (dansPhase) fillHex = hex
      else if (dansSegment) fillHex = pastel(couleur, 0.65)   // segment : même teinte, atténuée
      else if (periode) fillHex = pastel(periode.couleur, periode.est_bloquante !== false ? 0.22 : 0.08)

      setCell(FIXED_COLS + i, rowIdx, '', {
        fill: { fgColor: { rgb: fillHex } },
        border: borderRow(isFirstWeekOfMonth(w.semaine, w.annee), false),
      })
    })
    rowIdx++
  })

  // ── Jalons ──
  if (jalons.length > 0) {
    setCell(0, rowIdx, 'JALONS', { font: { bold: true, sz: 9 }, border: borderThin })
    setCell(1, rowIdx, '', { border: borderThin })
    weeks.forEach((_, i) => setCell(FIXED_COLS + i, rowIdx, '', { border: borderThin }))
    rowIdx++

    jalons.forEach((jalon) => {
      setCell(0, rowIdx, jalon.label ?? '', {
        font: { bold: true, sz: 9, color: { rgb: '1F1B17' } },
        alignment: { vertical: 'center' },
        border: borderRow(false, false),
      })
      setCell(1, rowIdx, '', { border: borderRow(false, true) })

      weeks.forEach((w, i) => {
        const isJalon = w.semaine === jalon.semaine && w.annee === jalon.annee
        const jHex = (jalon.couleur ?? '#8B5CF6').replace('#', '')
        setCell(FIXED_COLS + i, rowIdx, isJalon ? '▼' : '', {
          fill: { fgColor: { rgb: isJalon ? jHex : 'FFFFFF' } },
          font: { color: { rgb: 'FFFFFF' }, sz: 8 },
          alignment: { horizontal: 'center' },
          border: borderRow(isFirstWeekOfMonth(w.semaine, w.annee), false),
        })
      })
      rowIdx++
    })
  }

  // ── Légende ──
  rowIdx += 2
  const legende = [
    { color: TYPE_COLORS.etude.replace('#', ''), label: 'Phase MOE' },
    { color: TYPE_COLORS.validation.replace('#', ''), label: 'Validation MOA' },
    { color: TYPE_COLORS.administratif.replace('#', ''), label: 'Administratif' },
    { color: TYPE_COLORS.chantier.replace('#', ''), label: 'Chantier' },
    { color: pastel(TYPE_COLORS.etude, 0.65), label: 'Segment' },
    { color: pastel('#B8412C', 0.22), label: 'Période bloquante' },
    { color: pastel('#B8412C', 0.08), label: 'Période informative' },
  ]
  legende.forEach((item, i) => {
    setCell(FIXED_COLS + i * 2, rowIdx, '', {
      fill: { fgColor: { rgb: item.color } },
      border: borderThin,
    })
    setCell(FIXED_COLS + i * 2 + 1, rowIdx, item.label, {
      font: { sz: 8, color: { rgb: '5E5854' } },
      alignment: { vertical: 'center' },
      border: borderThin,
    })
  })
  rowIdx++

  // ── Finalisation ──
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: {
      r: rowIdx - 1,
      c: Math.max(FIXED_COLS + weeks.length - 1, FIXED_COLS + legende.length * 2 - 1),
    },
  })
  ws['!merges'] = merges
  ws['!cols'] = [{ wch: 30 }, { wch: 8 }, ...weeks.map(() => ({ wch: 4 }))]
  ws['!rows'] = Array(rowIdx).fill({ hpt: 16 })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Planning étude')

  const nomAffaire = affaire?.nom ?? affaire?.code_affaire ?? 'planning'
  const d = new Date()
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  XLSX.writeFile(wb, `Planning_etude_${nomAffaire}_${dateStr}.xlsx`)
}
