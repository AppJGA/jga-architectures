// ─── Export Excel du planning chantier ────────────────────────────────────────
//
// Extrait de GanttChart pour être testable. Les barres suivent les mêmes règles
// que l'écran : fin au dernier jour de la tâche (dernierJourTache), fermetures
// bloquantes comprises, délais avant/après calculés depuis la fin réelle.

// Import par défaut (et non `* as`) : xlsx-js-style est un module CommonJS, et
// seul l'import par défaut expose `utils` sous Node (tests) comme sous Vite.
import XLSX from 'xlsx-js-style'
import { parseDate, formatDateISO, addWorkingDaysBlocked, dernierJourTache } from './types'
import { etenduePlanning } from './geometrie'
import { buildRowsByZone } from './groupByZone'
import { legendeCouleurs, sansDiese } from './legende'

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

function lendemain(date) {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  return d
}

// Hauteurs de ligne (points) et corps de texte de l'export Excel, par densité.
// `normal` reproduit le rendu historique (16 pt, corps 9).
export const EXCEL_DENSITY = {
  compact: { headerRow: 14, taskRow: 12, lotRow: 14, legendRow: 12, fontSize: 7 },
  normal:  { headerRow: 18, taskRow: 16, lotRow: 18, legendRow: 14, fontSize: 9 },
  confort: { headerRow: 24, taskRow: 22, lotRow: 26, legendRow: 18, fontSize: 11 },
}

/**
 * @param tasks — dans l'ordre d'affichage (lot puis `ordre`)
 * @param dateDebut, dateFin — période optionnelle 'YYYY-MM-DD' (modale d'export)
 */
export function exporterPlanningChantierExcel({
  tasks, lots, zones = [], segments = [], jalons = [], periodes = [], affaire = {},
  viewMode = 'day', colorMode = 'lot', groupMode = 'lot', density, dateDebut, dateFin,
}) {
  const dens = EXCEL_DENSITY[density] ?? EXCEL_DENSITY.normal
  const fontSize = dens.fontSize
  // Hauteur de chaque ligne, renseignée au fil des émissions
  const rowHeights = []
  const noteHauteur = (idx, hpt) => { rowHeights[idx] = { hpt } }
  // ── 1. Déterminer la plage de dates et les unités de temps (jour/semaine/mois) ──
  // Période choisie dans la modale d'export, sinon l'étendue réelle du
  // planning (délais, segments et jalons compris) avec une petite marge.
  const etendue = etenduePlanning({ tasks, segments, jalons, periodes })
  if (!etendue && !(dateDebut && dateFin)) return
  const minDate = dateDebut ? parseDate(dateDebut) : new Date(etendue.debut)
  const maxDate = dateFin ? parseDate(dateFin) : new Date(etendue.fin)
  if (!dateDebut) minDate.setDate(minDate.getDate() - 3)
  if (!dateFin) maxDate.setDate(maxDate.getDate() + 5)

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

  // ── Bordures ────────────────────────────────────────────────────────────
  // Toutes noires : fines par défaut, épaisses pour les séparateurs (mois,
  // sidebar/timeline, groupes de lots), tiretées entre les lignes de tâches.
  const B_THIN = { style: 'thin', color: { rgb: '000000' } }
  const B_THICK = { style: 'medium', color: { rgb: '000000' } }
  const B_DASH = { style: 'dashed', color: { rgb: '000000' } }

  const borderThin = { top: B_THIN, bottom: B_THIN, left: B_THIN, right: B_THIN }

  // En-têtes (mois / semaines / jours) : haut et bas épais
  const borderHeader = (leftThick, rightThick) => ({
    top: B_THICK, bottom: B_THICK,
    left: leftThick ? B_THICK : B_THIN,
    right: rightThick ? B_THICK : B_THIN,
  })

  // Lignes de tâches : séparateurs horizontaux tiretés
  const borderTask = (leftThick, rightThick) => ({
    top: B_DASH, bottom: B_DASH,
    left: leftThick ? B_THICK : B_THIN,
    right: rightThick ? B_THICK : B_THIN,
  })

  // En-tête de lot : bas épais pour détacher les groupes
  const borderLot = (rightThick) => ({
    top: B_THIN, bottom: B_THICK,
    left: B_THIN,
    right: rightThick ? B_THICK : B_THIN,
  })

  // Dernière colonne de la sidebar (Av.%) : séparation épaisse avec la timeline
  const LAST_SIDEBAR_COL = 2

  const styleHeader = (col) => ({
    font: { bold: true, sz: fontSize, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F1B17' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderHeader(false, col === LAST_SIDEBAR_COL),
  })

  const styleMonthHeader = (isCurrentMonth) => ({
    font: { bold: true, sz: fontSize, color: { rgb: isCurrentMonth ? 'E8602C' : '1F1B17' } },
    fill: { fgColor: { rgb: isCurrentMonth ? 'FAF0EB' : 'F5F2F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    // Chaque cellule de mois est un groupe fusionné : encadré épais des deux côtés
    border: borderHeader(true, true),
  })

  const styleLotHeader = (couleur, col) => {
    const hex = couleur?.replace('#', '') ?? 'E8602C'
    return {
      font: { bold: true, sz: fontSize, color: { rgb: hex } },
      fill: { fgColor: { rgb: 'FAF7F2' } },
      border: borderLot(col === LAST_SIDEBAR_COL),
    }
  }

  const styleSidebar = (bold, col) => ({
    font: { bold: bold ?? false, sz: fontSize, color: { rgb: '1F1B17' } },
    fill: { fgColor: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center' },
    border: borderTask(false, col === LAST_SIDEBAR_COL),
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

    setCell(0, 0, '', styleHeader(0))
    setCell(1, 0, '', styleHeader(1))
    setCell(2, 0, '', styleHeader(2))
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } })

    let colOff = FIXED_COLS
    monthGroups.forEach((mg) => {
      const isCur = mg.month === today.getMonth() && mg.year === today.getFullYear()
      setCell(colOff, 0, mg.label.charAt(0).toUpperCase() + mg.label.slice(1), styleMonthHeader(isCur))
      if (mg.count > 1) merges.push({ s: { r: 0, c: colOff }, e: { r: 0, c: colOff + mg.count - 1 } })
      colOff += mg.count
    })
    rowIdx = 1

    setCell(0, rowIdx, 'N°', styleHeader(0))
    setCell(1, rowIdx, 'Tâche', styleHeader(1))
    setCell(2, rowIdx, 'Av.%', styleHeader(2))
    noteHauteur(0, dens.headerRow)
    noteHauteur(rowIdx, dens.headerRow)

    timeUnits.forEach((d, i) => {
      const isWE = d.getDay() === 0 || d.getDay() === 6
      const isTod = d.getTime() === today.getTime()
      const isMonthStart = d.getDate() === 1
      setCell(FIXED_COLS + i, rowIdx, d.getDate(), {
        font: {
          bold: isTod, sz: Math.max(6, fontSize - 1),
          color: { rgb: isTod ? 'E8602C' : isWE ? '9C9591' : '5E5854' },
        },
        fill: { fgColor: { rgb: isTod ? 'FAF0EB' : isWE ? 'F0EDE8' : 'FAFAF9' } },
        alignment: { horizontal: 'center' },
        border: borderHeader(isMonthStart, false),
      })
    })
    rowIdx = 2
  } else if (viewMode === 'week') {
    setCell(0, 0, '', styleHeader(0))
    setCell(1, 0, '', styleHeader(1))
    setCell(2, 0, '', styleHeader(2))
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

    setCell(0, 1, 'N°', styleHeader(0))
    setCell(1, 1, 'Tâche', styleHeader(1))
    setCell(2, 1, 'Av.%', styleHeader(2))
    noteHauteur(0, dens.headerRow)
    noteHauteur(1, dens.headerRow)

    timeUnits.forEach((monday, i) => {
      const d = new Date(monday)
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
      const w1 = new Date(d.getFullYear(), 0, 4)
      const wNum = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)

      const isMonthStart = i > 0 && monday.getMonth() !== timeUnits[i - 1].getMonth()
      const isCurWeek = monday <= today && today < new Date(monday.getTime() + 7 * 24 * 3600 * 1000)

      setCell(FIXED_COLS + i, 1, `S${wNum}`, {
        font: { bold: isCurWeek, sz: Math.max(6, fontSize - 1), color: { rgb: isCurWeek ? 'E8602C' : '5E5854' } },
        fill: { fgColor: { rgb: isCurWeek ? 'FAF0EB' : 'FAFAF9' } },
        alignment: { horizontal: 'center' },
        border: borderHeader(isMonthStart, false),
      })
    })
    rowIdx = 2
  } else {
    setCell(0, 0, 'N°', styleHeader(0))
    setCell(1, 0, 'Tâche', styleHeader(1))
    setCell(2, 0, 'Av.%', styleHeader(2))
    noteHauteur(0, dens.headerRow)

    timeUnits.forEach((d, i) => {
      const isCur = d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
      const label = d.toLocaleDateString('fr-FR', { month: 'short' })
      setCell(FIXED_COLS + i, 0, label.charAt(0).toUpperCase() + label.slice(1), styleMonthHeader(isCur))
    })
    rowIdx = 1
  }

  // ── Lignes de données, groupées par lot ──
  const tasksByLot = {}
  tasks.forEach((task) => {
    const lotId = lots.some((l) => l.id === task.lot_id) ? task.lot_id : '__no_lot__'
    ;(tasksByLot[lotId] ??= []).push(task)
  })

  // Une unité de temps chevauche-t-elle [début, fin[ ? La fin exclusive est le
  // lendemain du dernier jour : sans quoi le week-end ou la fermeture qui suit
  // une tâche était colorié à sa couleur.
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
    return overlaps(unit, debut, lendemain(dernierJourTache(debut, task.duree, periodes)))
  }

  const isInSegment = (unit, seg) => {
    if (!seg.date_debut) return false
    const debut = parseDate(seg.date_debut)
    return overlaps(unit, debut, lendemain(dernierJourTache(debut, seg.duree_jours, periodes)))
  }

  // Délais avant (appro) et après (séchage…) : mêmes bornes que les barres
  // hachurées de la timeline, en jours ouvrés, fin exclusive.
  const isInDelaiAvant = (unit, task) => {
    if (!task.appro_actif || !(task.appro_duree > 0) || !task.debut) return false
    const debut = parseDate(task.debut)
    return overlaps(unit, addWorkingDaysBlocked(debut, -task.appro_duree, periodes), debut)
  }

  const isInDelaiApres = (unit, task) => {
    if (!(task.delai_apres > 0) || !task.debut) return false
    const debut = addWorkingDaysBlocked(dernierJourTache(task.debut, task.duree, periodes), 1, periodes)
    return overlaps(unit, debut, lendemain(dernierJourTache(debut, task.delai_apres, periodes)))
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
    // Même gris « sans lot » que l'écran, le PDF et la légende
    return lots.find((l) => l.id === task.lot_id)?.couleur ?? '#94a3b8'
  }

  const getSegColor = (seg, task) => {
    if (seg.zone_id) {
      return zones.find((z) => z.id === seg.zone_id)?.couleur ?? getTaskColor(task)
    }
    return getTaskColor(task)
  }

  // ── Émission d'une ligne de tâche ──
  // Partagée par les deux groupements : en mode zone, `rowInfo` vient de
  // buildRowsByZone (barre principale masquée, segments filtrés, libellé
  // propre à la ligne), exactement comme dans la timeline.
  const emitTaskRow = (task, rowInfo) => {
    const showMainBar = rowInfo?.showMainBar !== false
    const visibleSegmentIds = rowInfo?.visibleSegmentIds ?? null
    const libelle = rowInfo?.displayName ?? task.nom ?? ''
    const suffixe = rowInfo?.suffixe ? ` · ${rowInfo.suffixe}` : ''

    const taskColor = getTaskColor(task)
    const taskHex = taskColor.replace('#', '')
    const segsTous = segments
      .filter((sg) => sg.tache_id === task.id)
      .sort((a, b) => parseDate(a.date_debut) - parseDate(b.date_debut))
    const segs = visibleSegmentIds
      ? segsTous.filter((sg) => visibleSegmentIds.includes(sg.id))
      : segsTous

    setCell(0, rowIdx, rowInfo?.numero ?? task.num_tache ?? '', styleSidebar(false, 0))
    setCell(1, rowIdx, `${libelle}${suffixe}`, styleSidebar(false, 1))
    setCell(2, rowIdx, task.avancement ?? 0, { ...styleSidebar(false, 2), alignment: { horizontal: 'center' } })

    timeUnits.forEach((unit, i) => {
      const inMain = showMainBar && isInTask(unit, task)
      const inSeg = segs.find((sg) => isInSegment(unit, sg))
      const active = inMain || inSeg
      // En cas de chevauchement, la période bloquante prime sur l'informative
      const couvrantes = periodes.filter((pp) => isInPeriode(unit, pp))
      const periode = couvrantes.find((pp) => pp.est_bloquante !== false) ?? couvrantes[0] ?? null

      let fillHex = 'FFFFFF'

      if (active) {
        fillHex = inSeg ? getSegColor(inSeg, task).replace('#', '') : taskHex
      } else if (showMainBar && (isInDelaiAvant(unit, task) || isInDelaiApres(unit, task))) {
        // Délais : même couleur que la barre mais très atténuée, pour les
        // distinguer de la tâche elle-même (Excel ne gère pas la transparence).
        fillHex = pastel(taskColor, 0.4)
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
          : true // en vue mois, chaque colonne est un début de mois

      setCell(FIXED_COLS + i, rowIdx, '', {
        fill: { fgColor: { rgb: fillHex } },
        border: borderTask(isMonthStart, false),
      })
    })

    noteHauteur(rowIdx, dens.taskRow)
    rowIdx++
  }

  // ── En-tête de groupe (lot ou zone) ──
  const emitGroupHeader = (couleur, libelle) => {
    const hexGroupe = (couleur ?? '#E8602C').replace('#', '')
    setCell(0, rowIdx, '', styleLotHeader(couleur, 0))
    setCell(1, rowIdx, libelle, {
      ...styleLotHeader(couleur, 1),
      font: { bold: true, sz: fontSize, color: { rgb: hexGroupe } },
    })
    setCell(2, rowIdx, '', styleLotHeader(couleur, 2))
    timeUnits.forEach((_, i) => {
      setCell(FIXED_COLS + i, rowIdx, '', {
        fill: { fgColor: { rgb: 'FAF7F2' } },
        border: borderLot(false),
      })
    })
    noteHauteur(rowIdx, dens.lotRow)
    rowIdx++
  }

  if (groupMode === 'zone') {
    // Mêmes lignes que la vue « Par zone » de l'éditeur
    buildRowsByZone(tasks, zones, segments).forEach((row) => {
      if (row.type === 'header-zone') {
        emitGroupHeader(row.couleur ?? '#C9C4C0', (row.displayName ?? '').toUpperCase())
        return
      }
      const lot = lots.find((l) => l.id === row.lotId) ?? null
      emitTaskRow(row.task, {
        showMainBar: row.showMainBar,
        visibleSegmentIds: row.visibleSegmentIds,
        displayName: row.displayName,
        numero: row.numero,
        suffixe: lot ? `${lot.num_lot ?? ''} ${lot.nom}`.trim() : null,
      })
    })
  } else {
    // Ordre de l'écran : lots par numéro, « Sans lot » en dernier, tâches dans
    // l'ordre reçu (déjà trié par lot puis `ordre`)
    const groupes = [...lots.map((l) => l.id), '__no_lot__'].filter((id) => tasksByLot[id])
    groupes.forEach((lotId) => {
      const lot = lots.find((l) => l.id === lotId)
      emitGroupHeader(
        lot?.couleur ?? '#E8602C',
        `${lot?.numero ? String(lot.numero).padStart(2, '0') : ''} – ${lot?.nom ?? 'Sans lot'}`.trim()
      )
      tasksByLot[lotId].forEach((task) => emitTaskRow(task, null))
    })
  }

  // ── Jalons ──
  if (jalons && jalons.length > 0) {
    setCell(0, rowIdx, '', { border: borderThin })
    setCell(1, rowIdx, 'JALONS', { font: { bold: true, sz: fontSize }, border: borderThin })
    rowIdx++

    jalons.forEach((jalon) => {
      setCell(0, rowIdx, '', styleSidebar(false, 0))
      setCell(1, rowIdx, jalon.label ?? '', styleSidebar(true, 1))
      setCell(2, rowIdx, '', styleSidebar(false, 2))

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
          border: borderTask(false, false),
        })
      })
      noteHauteur(rowIdx, dens.taskRow)
      rowIdx++
    })
  }

  // ── Légende ──
  rowIdx += 2

  // Couleurs de barres (zones ou lots) — même source que l'export PDF.
  // Disposées comme les entrées ci-dessous : paires pastille + libellé, par
  // rangs de six pour qu'une opération à douze zones ne parte pas hors page.
  const legCouleurs = legendeCouleurs({ tasks, lots, zones, colorMode, groupMode })
  const PAIRES_PAR_RANG = 6
  let colMax = FIXED_COLS

  if (legCouleurs.entrees.length) {
    setCell(0, rowIdx, legCouleurs.titre, {
      font: { bold: true, sz: Math.max(6, fontSize - 1), color: { rgb: '1F1B17' } },
      alignment: { vertical: 'center' },
      border: borderThin,
    })
    legCouleurs.entrees.forEach((e, i) => {
      const rang = Math.floor(i / PAIRES_PAR_RANG)
      const col = FIXED_COLS + (i % PAIRES_PAR_RANG) * 2
      setCell(col, rowIdx + rang, '', {
        fill: { fgColor: { rgb: sansDiese(e.couleur) } },
        border: borderThin,
      })
      setCell(col + 1, rowIdx + rang, e.label, {
        font: { sz: Math.max(6, fontSize - 1), color: { rgb: '5E5854' } },
        alignment: { vertical: 'center' },
        border: borderThin,
      })
      colMax = Math.max(colMax, col + 1)
    })
    const rangs = Math.ceil(legCouleurs.entrees.length / PAIRES_PAR_RANG)
    for (let r = 0; r < rangs; r++) noteHauteur(rowIdx + r, dens.legendRow)
    rowIdx += rangs + 1   // rang vide de séparation
  }

  const legendItems = [
    { color: 'E8602C', label: `Tâche (couleur ${colorMode === 'zone' ? 'de la zone' : 'du lot'})` },
    { color: pastel('#E8602C', 0.4), label: 'Délai avant / après' },
    { color: BLOQUANTE_FILL, label: 'Période bloquante' },
    { color: INFORMATIVE_FILL, label: 'Période informative' },
    { color: 'F0EDE8', label: 'Week-end' },
  ]
  legendItems.forEach((item, i) => {
    setCell(FIXED_COLS + i * 2, rowIdx, '', {
      fill: { fgColor: { rgb: item.color } },
      border: borderThin,
    })
    setCell(FIXED_COLS + i * 2 + 1, rowIdx, item.label, {
      font: { sz: Math.max(6, fontSize - 1), color: { rgb: '5E5854' } },
      alignment: { vertical: 'center' },
      border: borderThin,
    })
  })
  colMax = Math.max(colMax, FIXED_COLS + legendItems.length * 2 - 1)
  noteHauteur(rowIdx, dens.legendRow)
  rowIdx++

  if (legCouleurs.note) {
    setCell(0, rowIdx, legCouleurs.note, {
      font: { italic: true, sz: Math.max(6, fontSize - 1), color: { rgb: '9C9591' } },
      alignment: { vertical: 'center' },
    })
    noteHauteur(rowIdx, dens.legendRow)
    rowIdx++
  }

  // ── Finaliser la feuille ──
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rowIdx - 1, c: Math.max(FIXED_COLS + timeUnits.length - 1, colMax) },
  })
  ws['!merges'] = merges

  const colWidths = [{ wch: 6 }, { wch: 22 }, { wch: 5 }]
  timeUnits.forEach(() => {
    colWidths.push({ wch: viewMode === 'day' ? 3.5 : viewMode === 'week' ? 6 : 10 })
  })
  ws['!cols'] = colWidths
  // Toute ligne non renseignée (séparateurs, lignes vides) reprend la hauteur
  // d'une ligne de tâche.
  ws['!rows'] = Array.from({ length: rowIdx }, (_, i) => rowHeights[i] ?? { hpt: dens.taskRow })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Planning')

  const nomAffaire = affaire?.nom ?? affaire?.code_affaire ?? 'planning'
  const date = formatDateISO(new Date())

  XLSX.writeFile(wb, `Planning_${nomAffaire}_${date}.xlsx`)
}
