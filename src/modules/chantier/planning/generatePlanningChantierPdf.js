import { parseDate, formatDateISO, addWorkingDays } from './types'
import { assignLabelLanes } from './jalonLayout'
import { buildRowsByZone } from './groupByZone'

const WEEKEND_RATIO = 0.35
const LABEL_COL_MM = 45

// Bande de jalons : écart minimal (mm) entre deux libellés avant de les répartir
// sur des lignes successives, et hauteur d'une de ces lignes.
const JALON_LABEL_MIN_GAP_MM = 26
const JALON_LABEL_HEIGHT_MM = 3.2

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6
}

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
  )
}

function buildDaysList(dateDebut, dateFin) {
  const days = []
  const current = new Date(dateDebut)
  current.setHours(0, 0, 0, 0)
  const end = new Date(dateFin)
  end.setHours(0, 0, 0, 0)
  while (current <= end) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

function computeDayWidths(days, contentMm, viewMode = 'day') {
  // En vue semaine/mois, le détail jour par jour n'est pas affiché : largeur uniforme
  // (pas de rétrécissement des week-ends, qui n'aurait plus de sens sans le repère des jours).
  if (viewMode !== 'day') {
    const uniformMm = days.length > 0 ? contentMm / days.length : 3
    return days.map(() => uniformMm)
  }
  const workingCount = days.filter(d => !isWeekend(d)).length
  const weekendCount = days.length - workingCount
  const totalUnits = workingCount + weekendCount * WEEKEND_RATIO
  const normalMm = totalUnits > 0 ? contentMm / totalUnits : 3
  return days.map(d => isWeekend(d) ? normalMm * WEEKEND_RATIO : normalMm)
}

function getBarColor(task, lot, zones, colorMode) {
  if (colorMode === 'zone') {
    const zone = zones.find(z => z.id === task.zone_id)
    return zone?.couleur ?? '#C9C4C0'
  }
  return lot?.couleur ?? '#94a3b8'
}

function getSegColor(seg, taskColor, zones) {
  if (seg.zone_id) {
    const zone = zones.find(z => z.id === seg.zone_id)
    if (zone?.couleur) return zone.couleur
  }
  return taskColor
}

// Regroupe des jours consécutifs par année/mois/semaine et rend un <th colspan="N">
// par groupe — un <th> par groupe SANS colspan ne mapperait qu'à une seule colonne
// du tableau (une par <col> du colgroup), ce qui écrase tous les groupes suivants
// dans les premières colonnes et laisse le reste de la ligne d'en-tête vide : c'est
// la cause du rendu « semaines entassées en début de tableau ».
function buildYearHeaders(days) {
  const years = []
  days.forEach((d) => {
    const y = d.getFullYear()
    const last = years[years.length - 1]
    if (last && last.year === y) last.count++
    else years.push({ year: y, count: 1 })
  })
  return years.map(y =>
    `<th class="hdr-year" colspan="${y.count}">${y.year}</th>`
  ).join('')
}

function buildMonthHeaders(days, includeYear) {
  const months = []
  days.forEach((d) => {
    const label = includeYear
      ? d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : d.toLocaleDateString('fr-FR', { month: 'long' })
    const last = months[months.length - 1]
    if (last && last.label === label) last.count++
    else months.push({ label, count: 1 })
  })
  return months.map(m =>
    `<th class="hdr-month" colspan="${m.count}">${m.label.charAt(0).toUpperCase() + m.label.slice(1)}</th>`
  ).join('')
}

function buildWeekHeaders(days) {
  const weeks = []
  days.forEach((d) => {
    const wn = getISOWeek(d)
    const wKey = `${d.getFullYear()}-${wn}`
    const last = weeks[weeks.length - 1]
    if (last && last.key === wKey) last.count++
    else weeks.push({ key: wKey, wn, count: 1 })
  })
  return weeks.map(w =>
    `<th class="hdr-week" colspan="${w.count}">S${w.wn}</th>`
  ).join('')
}

// Période couvrant ce jour, sinon null. En cas de chevauchement, la bloquante
// l'emporte : son hachurage ne doit pas être masqué par un simple repère.
function periodeDuJour(day, periodes) {
  const couvrantes = periodes.filter(p => {
    if (!p.date_debut || !p.date_fin) return false
    const debut = parseDate(p.date_debut)
    const fin = parseDate(p.date_fin)
    debut.setHours(0, 0, 0, 0)
    fin.setHours(23, 59, 59, 999)
    const d = new Date(day)
    d.setHours(12, 0, 0, 0)
    return d >= debut && d <= fin
  })
  return couvrantes.find(p => p.est_bloquante !== false) ?? couvrantes[0] ?? null
}

function hexToRgb(hex) {
  const h = (hex || '#B8412C').replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

// Fond d'une cellule couverte par une période : hachures à la couleur de la
// période si elle est bloquante, aplat très clair si elle est informative.
function fondPeriode(periode) {
  const rgb = hexToRgb(periode.couleur)
  return periode.est_bloquante !== false
    ? `repeating-linear-gradient(45deg, rgba(${rgb},0.08), rgba(${rgb},0.08) 3px, rgba(${rgb},0.15) 3px, rgba(${rgb},0.15) 6px)`
    : `rgba(${rgb},0.06)`
}

// Position + largeur (en mm) d'une barre tâche/segment, exprimées relativement à la
// cellule <td> de son propre jour de début — cf. buildTaskRow : la barre est un enfant
// de ce <td> positionné en left:0 et déborde vers la droite grâce à overflow:visible,
// donc aucun décalage absolu par rapport au début de la ligne n'est nécessaire.
function computeBarGeometry(days, dayWidths, startStr, duree) {
  const startIdx = days.findIndex(d => formatDateISO(d) === startStr)
  if (startIdx < 0) return null
  const endDate = addWorkingDays(parseDate(startStr), duree)
  const endDateStr = formatDateISO(endDate)
  const endIdx = days.findIndex(d => formatDateISO(d) === endDateStr)
  const actualEnd = endIdx >= 0 ? endIdx : days.length
  let widthMm = 0
  for (let i = startIdx; i < actualEnd && i < days.length; i++) widthMm += dayWidths[i]
  return { startIdx, widthMm }
}

// ─── Bande de jalons ──────────────────────────────────────────────────────────
//
// Les jalons occupent une zone dédiée au-dessus du tableau plutôt que d'être
// répétés sur chaque ligne de tâche : un seul libellé par jalon, décalé
// verticalement quand deux jalons sont trop proches. Une fine ligne verticale
// reste tracée dans les lignes du tableau comme repère de lecture (cf.
// buildTaskRow), mais sans texte.
//
// Les positions sont en mm dans le même repère que le tableau (colonne de
// libellés + colonnes de jours), pour rester alignées après la mise à l'échelle
// appliquée à l'ensemble du bloc.
function buildJalonBand(jalons, days, dayWidths) {
  const places = (jalons ?? [])
    .map((jalon) => {
      const dayStr = (jalon.date ?? '').split('T')[0]
      const idx = days.findIndex((d) => formatDateISO(d) === dayStr)
      if (idx < 0) return null
      let x = LABEL_COL_MM
      for (let i = 0; i < idx; i++) x += dayWidths[i]
      return { jalon, x: x + dayWidths[idx] / 2 }
    })
    .filter(Boolean)

  if (places.length === 0) return ''

  const lanes = assignLabelLanes(places.map((p) => p.x), JALON_LABEL_MIN_GAP_MM)
  const nbLignes = Math.max(...lanes) + 1
  const hauteurMm = nbLignes * JALON_LABEL_HEIGHT_MM + 5

  const marqueurs = places.map(({ jalon, x }, i) => {
    const couleur = jalon.couleur ?? '#E8602C'
    const topLabel = lanes[i] * JALON_LABEL_HEIGHT_MM
    const topTrait = (lanes[i] + 1) * JALON_LABEL_HEIGHT_MM
    return `<div style="position:absolute;left:${x.toFixed(2)}mm;top:0;bottom:0;width:0">
      <div style="position:absolute;top:${topLabel.toFixed(2)}mm;left:1.2mm;font-size:5pt;font-weight:bold;color:${couleur};white-space:nowrap;line-height:${JALON_LABEL_HEIGHT_MM}mm">${jalon.label ?? ''}</div>
      <div style="position:absolute;top:${topTrait.toFixed(2)}mm;bottom:1.6mm;left:0;width:1.5px;background:${couleur}"></div>
      <div style="position:absolute;bottom:0;left:-2.5px;width:0;height:0;border-left:2.5px solid transparent;border-right:2.5px solid transparent;border-top:1.6mm solid ${couleur}"></div>
    </div>`
  }).join('')

  return `<div style="position:relative;height:${hauteurMm.toFixed(2)}mm;border-bottom:1px solid #E9E2D6;margin-bottom:1mm">${marqueurs}</div>`
}

function buildDayHeaders(days, dayWidths, todayStr) {
  return days.map((d, i) => {
    const isWE = isWeekend(d)
    const isToday = formatDateISO(d) === todayStr
    const isMonthStart = d.getDate() === 1
    const isMonday = d.getDay() === 1
    const label = d.toLocaleDateString('fr-FR', { weekday: 'narrow' })
    const w = dayWidths[i].toFixed(2)
    const bg = isToday ? 'rgba(232,96,44,0.10)' : isWE ? 'rgba(0,0,0,0.04)' : 'transparent'
    const color = isToday ? '#E8602C' : isWE ? 'rgba(155,143,133,0.5)' : '#9C9591'
    const borderLeft = isMonthStart ? '1.5px solid #bbb' : isMonday ? '1px solid rgba(0,0,0,0.25)' : '0.5px solid #eee'
    return `<th class="hdr-day" style="width:${w}mm;background:${bg};color:${color};border-left:${borderLeft}">${dayWidths[i] >= 2.5 ? label : ''}</th>`
  }).join('')
}

function buildTaskRow(task, color, days, dayWidths, jalons, todayStr, ctx, rowInfo) {
  const { segments = [], periodes = [], zones = [] } = ctx ?? {}
  // En groupement par zone, une tâche peut n'apparaître que par ses segments
  // (ligne dupliquée) : `showMainBar` et `visibleSegmentIds` viennent alors de
  // buildRowsByZone, la même source que la timeline interactive.
  const showMainBar = rowInfo?.showMainBar !== false
  const visibleSegmentIds = rowInfo?.visibleSegmentIds ?? null
  const labelLigne = rowInfo?.displayName ?? task.nom

  const taskStartStr = typeof task.debut === 'string' ? task.debut.split('T')[0] : formatDateISO(parseDate(task.debut))
  const mainGeo = showMainBar ? computeBarGeometry(days, dayWidths, taskStartStr, task.duree) : null
  const startIdx = mainGeo?.startIdx ?? -1
  const barWidthMm = mainGeo?.widthMm ?? 0

  // Délais avant / après : mêmes hachures à 45° et même hauteur que la barre de
  // tâche (top/bottom 1mm), comme dans la timeline interactive.
  const fondDelai = `repeating-linear-gradient(45deg, ${color}28, ${color}28 4px, ${color}55 4px, ${color}55 8px)`

  let approHtml = ''
  if (task.appro_actif && task.appro_duree > 0 && startIdx >= 0) {
    const approStart = addWorkingDays(parseDate(taskStartStr), -task.appro_duree)
    const approStartStr = formatDateISO(approStart)
    const approIdx = days.findIndex(d => formatDateISO(d) === approStartStr)
    let approWidthMm = 0
    for (let i = (approIdx >= 0 ? approIdx : 0); i < startIdx && i < days.length; i++) approWidthMm += dayWidths[i]
    if (approWidthMm > 0) {
      // Motif à l'intérieur de la barre, aligné à gauche et tronqué si trop long
      const lbl = task.appro_materiau || `Appro. ${task.appro_duree}j`
      approHtml = `<div style="position:absolute;left:-${approWidthMm.toFixed(2)}mm;width:${approWidthMm.toFixed(2)}mm;top:1mm;bottom:1mm;background:${fondDelai};border:1px dashed ${color}80;display:flex;align-items:center;overflow:hidden;z-index:3;pointer-events:none">
        <span style="font-size:5pt;font-style:italic;color:${color};filter:brightness(0.6);white-space:nowrap;overflow:hidden;padding:0 1mm">${lbl}</span>
      </div>`
    }
  }

  // Délai après la tâche (séchage, livraison…) : prolongement à droite de la
  // barre, motif écrit à l'extérieur — même convention que le nom d'une tâche.
  let delaiApresHtml = ''
  if (task.delai_apres > 0 && startIdx >= 0 && barWidthMm > 0) {
    const lastDay = addWorkingDays(parseDate(taskStartStr), Math.max(1, task.duree) - 1)
    const geoDelai = computeBarGeometry(days, dayWidths, formatDateISO(addWorkingDays(lastDay, 1)), task.delai_apres)
    if (geoDelai && geoDelai.widthMm > 0) {
      const finDelaiMm = barWidthMm + geoDelai.widthMm
      delaiApresHtml = `<div style="position:absolute;left:${barWidthMm.toFixed(2)}mm;width:${geoDelai.widthMm.toFixed(2)}mm;top:1mm;bottom:1mm;background:${fondDelai};border:1px dashed ${color}80;z-index:3;pointer-events:none"></div>`
      if (task.label_apres) {
        delaiApresHtml += `<div style="position:absolute;left:${finDelaiMm.toFixed(2)}mm;padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:5.5pt;font-style:italic;color:#9C9591;z-index:10">${task.label_apres}</div>`
      }
    }
  }

  // Segments supplémentaires de la tâche : chacun est rendu comme sa propre barre,
  // enfant du <td> de son propre jour de début (même technique que la barre principale
  // et l'extension d'appro ci-dessus).
  const segGeoms = segments
    .filter(s => s.tache_id === task.id)
    .filter(s => !visibleSegmentIds || visibleSegmentIds.includes(s.id))
    .map(seg => {
      const segStartStr = typeof seg.date_debut === 'string' ? seg.date_debut.split('T')[0] : formatDateISO(parseDate(seg.date_debut))
      const geo = computeBarGeometry(days, dayWidths, segStartStr, seg.duree_jours ?? 0)
      return geo ? { seg, ...geo } : null
    })
    .filter(Boolean)

  const cells = days.map((d, idx) => {
    const isWE = isWeekend(d)
    const isMonthStart = d.getDate() === 1
    const isMonday = d.getDay() === 1
    const borderLeft = isMonthStart ? '1.5px solid #ccc' : isMonday ? '1px solid rgba(0,0,0,0.15)' : '0.5px solid #f0f0f0'
    // Priorité de fond de cellule : tâche/segment (barres, au-dessus) > période bloquée > week-end > vide.
    // Comme les barres sont des <div> opaques positionnés par-dessus, il suffit d'appliquer
    // le hachurage sur toutes les cellules bloquées : les barres le masquent naturellement
    // là où elles passent.
    const periode = periodeDuJour(d, periodes)
    const bg = periode
      ? fondPeriode(periode)
      : isWE ? 'rgba(0,0,0,0.03)' : 'transparent'

    let barContent = ''
    if (idx === startIdx && startIdx >= 0 && barWidthMm > 0) {
      const progressBar = task.avancement > 0
        ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${task.avancement}%;background:rgba(0,0,0,0.22);z-index:2"></div>`
        : ''
      const labelAvancement = task.avancement > 0 && task.avancement < 100
        ? `<span style="margin-left:1.5mm;font-size:5.5pt;color:#9C9591">${task.avancement}%</span>`
        : ''
      barContent = `${approHtml}${delaiApresHtml}
        <div data-task-id="${task.id}" data-type="task" style="position:absolute;left:0;width:${barWidthMm.toFixed(2)}mm;top:1mm;bottom:1mm;background:${color};z-index:4;overflow:hidden">${progressBar}</div>
        <div style="position:absolute;left:${barWidthMm.toFixed(2)}mm;padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:6.5pt;color:#1F1B17;z-index:10">${labelLigne}${labelAvancement}</div>`
    }

    let segContent = ''
    segGeoms.forEach(({ seg, startIdx: segStartIdx, widthMm: segWidthMm }) => {
      if (segStartIdx !== idx || segWidthMm <= 0) return
      const segColor = getSegColor(seg, color, zones)
      const segLabel = seg.nom ? `<span style="margin-left:1.5mm;font-size:5.5pt;color:#1F1B17">${seg.nom}</span>` : ''
      segContent += `<div data-segment-id="${seg.id}" data-task-id="${task.id}" data-type="segment" style="position:absolute;left:0;width:${segWidthMm.toFixed(2)}mm;top:1mm;bottom:1mm;background:${segColor};outline:1px dashed rgba(255,255,255,0.6);outline-offset:-1px;z-index:3;overflow:hidden;display:flex;align-items:center">${segLabel}</div>`
    })

    // Repère vertical du jalon, sans libellé : celui-ci est rendu une seule fois
    // dans la bande dédiée au-dessus du tableau (buildJalonBand).
    const dayStr = formatDateISO(d)
    const jalonLines = (jalons ?? [])
      .filter(j => (j.date ?? '').split('T')[0] === dayStr)
      .map(j => `<div style="position:absolute;top:0;bottom:0;left:50%;width:1.5px;background:${j.couleur};opacity:0.55;z-index:5"></div>`)
      .join('')

    return `<td style="width:${dayWidths[idx].toFixed(2)}mm;border-bottom:0.5px solid #f0f0f0;border-left:${borderLeft};height:6mm;padding:0;overflow:visible;position:relative;background:${bg}">${barContent}${segContent}${jalonLines}</td>`
  }).join('')

  const suffixe = rowInfo?.suffixe
    ? `<span style="color:#9C9591;font-size:5.5pt;margin-left:1.5mm">${rowInfo.suffixe}</span>`
    : ''

  return `<tr>
    <td class="plabel">${task.num_tache ? `<span style="color:#9C9591;margin-right:1.5mm">${task.num_tache}</span>` : ''}${labelLigne}${suffixe}</td>
    ${cells}
  </tr>`
}

function buildHtml({
  tasks, lots, jalons, affaire, dateDebut, dateFin, largeurMm, hauteurMm,
  zones = [], colorMode = 'lot', viewMode = 'day',
  segments = [], dependances = [], periodes = [], showDependances = true,
  groupMode = 'lot',
}) {
  const dStart = parseDate(dateDebut)
  const dEnd = parseDate(dateFin)
  const days = buildDaysList(dStart, dEnd)

  const contentMm = largeurMm - 20 - LABEL_COL_MM
  const dayWidths = computeDayWidths(days, contentMm, viewMode)
  const todayStr = formatDateISO(new Date())
  const rowCtx = { segments, periodes, zones }

  // Chemins critiques : deux sources, comme dans la timeline interactive — les
  // dépendances tâche→tâche historiques (`depends_on`) et la table étendue
  // `planning_dependances` (qui peut impliquer des segments). Fusionnées ici pour
  // que le script de rendu des flèches n'ait qu'une seule liste à parcourir.
  const legacyDeps = tasks
    .filter(t => t.depends_on != null)
    .map(t => ({ source_tache_id: t.depends_on, cible_tache_id: t.id }))
  // Option « Afficher les chemins critiques » : sans elle, aucune dépendance
  // n'est transmise au script de rendu, qui ne trace donc aucune flèche.
  const allDeps = showDependances ? [...legacyDeps, ...dependances] : []
  // Échappe "</" pour ne pas fermer prématurément le <script> hôte si un champ
  // texte venait à contenir cette séquence.
  const depsJson = JSON.stringify(allDeps).replace(/</g, '\\u003c')

  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const nomAffaire  = affaire?.nom ?? ''
  const moaNom      = affaire?.moa_nom ?? ''
  const codeAffaire = affaire?.code_affaire ?? affaire?.numero ?? ''
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const periodeStr = `${dStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} → ${dEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`

  // Granularité :
  //  - vue jour   : Mois (avec année) / Semaine / Jours — 3 niveaux
  //  - vue semaine: Année / Mois / Semaines — 3 niveaux
  //  - vue mois   : Année / Mois — 2 niveaux
  const showYearRow = viewMode !== 'day'
  const showWeekRow = viewMode !== 'month'
  const showDayRow = viewMode === 'day'
  const yearHeaders  = showYearRow ? buildYearHeaders(days) : ''
  const monthHeaders = buildMonthHeaders(days, !showYearRow)
  const weekHeaders  = showWeekRow ? buildWeekHeaders(days) : ''
  const dayHeaders   = showDayRow ? buildDayHeaders(days, dayWidths, todayStr) : ''

  // ── Corps du tableau : groupé par lot (défaut) ou par zone ──
  let lotsRows = ''

  if (groupMode === 'zone') {
    // Mêmes lignes que la vue « Par zone » de l'éditeur : une tâche peut
    // apparaître dans plusieurs zones — une fois avec sa barre principale, une
    // fois par ses seuls segments.
    buildRowsByZone(tasks, zones, segments).forEach(row => {
      if (row.type === 'header-zone') {
        const couleur = row.couleur ?? '#C9C4C0'
        lotsRows += `<tr>
          <td colspan="${1 + days.length}" style="background:${couleur}18;color:${couleur};font-weight:bold;font-size:7pt;padding:0 2mm;height:5.5mm;border-bottom:1px solid ${couleur}">
            ${(row.displayName ?? '').toUpperCase()}
          </td>
        </tr>`
        return
      }
      const lot = lots.find(l => l.id === row.lotId) ?? null
      lotsRows += buildTaskRow(
        row.task,
        getBarColor(row.task, lot, zones, colorMode),
        days, dayWidths, jalons, todayStr, rowCtx,
        {
          showMainBar: row.showMainBar,
          visibleSegmentIds: row.visibleSegmentIds,
          displayName: row.displayName,
          // Le lot n'est plus le regroupement : on le rappelle en petit
          suffixe: lot ? `${lot.num_lot ?? ''} ${lot.nom}`.trim() : null,
        }
      )
    })
  } else {
    const sortedLots = [...lots].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    sortedLots.forEach(lot => {
      const lotTasks = tasks.filter(t => t.lot_id === lot.id)
      if (!lotTasks.length) return
      lotsRows += `<tr>
        <td colspan="${1 + days.length}" style="background:${lot.couleur}18;color:${lot.couleur};font-weight:bold;font-size:7pt;padding:0 2mm;height:5.5mm;border-bottom:0.5px solid rgba(0,0,0,0.08)">
          ${lot.num_lot ?? ''} – ${lot.nom}
        </td>
      </tr>`
      lotTasks.forEach(t => { lotsRows += buildTaskRow(t, getBarColor(t, lot, zones, colorMode), days, dayWidths, jalons, todayStr, rowCtx) })
    })
    const unassigned = tasks.filter(t => t.lot_id == null)
    if (unassigned.length > 0) {
      lotsRows += `<tr><td colspan="${1 + days.length}" style="color:#9C9591;font-weight:bold;font-size:7pt;padding:0 2mm;height:5.5mm;border-bottom:0.5px solid rgba(0,0,0,0.08)">Sans lot</td></tr>`
      unassigned.forEach(t => { lotsRows += buildTaskRow(t, getBarColor(t, null, zones, colorMode), days, dayWidths, jalons, todayStr, rowCtx) })
    }
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Planning de chantier — ${nomAffaire}</title>
<style>
  @page { size: ${largeurMm}mm ${hauteurMm}mm; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #111; background: white; width: ${largeurMm - 20}mm; max-width: ${largeurMm - 20}mm; }

  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6mm; padding-bottom: 4mm; border-bottom: 1.5px solid #E8602C; }
  .logo { height: 14mm; width: auto; }
  .header-right { text-align: right; }
  .header-title { font-size: 12pt; font-weight: bold; color: #1F1B17; margin-bottom: 2mm; }
  .header-sub { font-size: 7.5pt; color: #5E5854; line-height: 1.6; }
  .header-period { font-size: 7.5pt; color: #E8602C; font-weight: bold; margin-top: 1mm; }

  .gantt-wrap { position: relative; width: 100%; transform-origin: top left; border: 1px solid #1F1B17; }
  .gantt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .gantt-table thead tr:first-child th:first-child { border-top: none; border-left: none; }
  .gantt-table thead tr:first-child th:last-child  { border-top: none; border-right: none; }
  .gantt-table tbody tr:last-child td:first-child   { border-bottom: none; border-left: none; }
  .gantt-table tbody tr:last-child td:last-child    { border-bottom: none; border-right: none; }

  .col-label { width: ${LABEL_COL_MM}mm; min-width: ${LABEL_COL_MM}mm; }

  .hdr-year  { background: #F5F2F0; font-size: 7pt; font-weight: bold; color: #1F1B17; text-align: center; border: 0.5px solid #ddd; padding: 1mm 0; }
  .hdr-month { background: #FAF7F2; font-size: 6.5pt; font-weight: bold; color: #E8602C; text-align: center; border: 0.5px solid #ddd; padding: 1mm 0; }
  .hdr-week  { background: #FAFAF9; font-size: 5.5pt; color: #9C9591; text-align: center; border: 0.5px solid #ddd; padding: 0.6mm 0; }
  .hdr-day   { font-size: 5pt; text-align: center; border-bottom: 0.5px solid #ddd; padding: 0.5mm 0; }

  .plabel { width: ${LABEL_COL_MM}mm; border: 0.5px solid #eee; border-right: 1px solid #ccc; padding: 0 1.5mm; vertical-align: middle; overflow: hidden; white-space: nowrap; height: 6mm; font-size: 6.5pt; color: #1F1B17; }

  .legend { margin-top: 5mm; padding-top: 3mm; border-top: 0.5px solid #eee; display: flex; align-items: center; gap: 5mm; flex-wrap: wrap; }
  .leg-title { font-size: 5.5pt; font-weight: bold; color: #9C9591; text-transform: uppercase; letter-spacing: 0.05em; }
  .leg-item { display: flex; align-items: center; gap: 1.5mm; font-size: 6pt; color: #4b5563; }
  .leg-swatch { width: 8mm; height: 3mm; }

  .footer { margin-top: 4mm; padding-top: 2mm; border-top: 0.5px solid #eee; font-size: 6pt; color: #9C9591; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <img src="${logoUrl}" class="logo" alt="JGA" onerror="this.style.display='none'" />
  <div class="header-right">
    <div class="header-title">Planning de chantier — ${nomAffaire}</div>
    <div class="header-sub">
      ${moaNom ? `Maître d'ouvrage : ${moaNom}<br>` : ''}
      Référence : ${codeAffaire}
    </div>
    <div class="header-period">${periodeStr}</div>
  </div>
</div>

<div class="gantt-wrap" id="gw">
  ${buildJalonBand(jalons, days, dayWidths)}
  <table class="gantt-table" id="gantt-table">
    <colgroup>
      <col class="col-label">
      ${days.map((_, i) => `<col style="width:${dayWidths[i].toFixed(2)}mm">`).join('')}
    </colgroup>
    <thead>
      ${showYearRow ? `<tr>
        <th class="plabel" style="background:#F5F2F0;font-size:6pt;color:#9C9591;text-align:center">Tâches</th>
        ${yearHeaders}
      </tr>` : ''}
      <tr>
        <th class="plabel" style="background:#FAF7F2;font-size:6pt;color:#9C9591;text-align:center">${showYearRow ? '' : 'Tâches'}</th>
        ${monthHeaders}
      </tr>
      ${showWeekRow ? `<tr>
        <th class="plabel" style="background:#FAF7F2"></th>
        ${weekHeaders}
      </tr>` : ''}
      ${showDayRow ? `<tr>
        <th class="plabel" style="background:#FAFAF9"></th>
        ${dayHeaders}
      </tr>` : ''}
    </thead>
    <tbody>${lotsRows}</tbody>
  </table>

  <!-- Overlay SVG des flèches de chemin critique — positionné/dimensionné en JS
       une fois le tableau rendu (cf. window.onload), exactement comme dans la
       timeline interactive (mêmes courbes de Bézier, mêmes marqueurs). -->
  <svg id="arrows-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible"></svg>
</div>

<script id="deps-data" type="application/json">${depsJson}</script>

<div class="legend">
  <span class="leg-title">Légende</span>
  <div class="leg-item">
    <div class="leg-swatch" style="background:#E8602C"></div>
    Barre de tâche (couleur du lot)
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:rgba(0,0,0,0.22)"></div>
    Avancement
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:repeating-linear-gradient(45deg, #E8602C28, #E8602C28 4px, #E8602C55 4px, #E8602C55 8px);border:1px dashed #E8602C80"></div>
    Délai avant / après
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:#C9C4C0;outline:1px dashed rgba(255,255,255,0.6);outline-offset:-1px"></div>
    Segment
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:repeating-linear-gradient(45deg, rgba(184,65,44,0.15), rgba(184,65,44,0.15) 3px, rgba(184,65,44,0.28) 3px, rgba(184,65,44,0.28) 6px)"></div>
    Période bloquante
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:rgba(184,65,44,0.10);border:0.5px solid rgba(184,65,44,0.25)"></div>
    Période informative
  </div>
  ${showDependances ? `<div class="leg-item">
    <svg width="10mm" height="4mm" viewBox="0 0 38 16" style="overflow:visible">
      <path d="M 0 8 C 15 8, 23 8, 34 8" fill="none" stroke="#e4702a" stroke-width="2" stroke-dasharray="6 3" stroke-opacity="0.85" />
      <path d="M34,8 L28,4 L28,12 z" fill="#e4702a" />
    </svg>
    Dépendance (chemin critique)
  </div>` : ''}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  <div class="leg-item">
    <div style="width:8mm;border-top:2px solid #8B5CF6"></div>
    Jalon
  </div>
</div>

<div class="footer">
  <span>JGA Architectures</span>
  <span>Document généré le ${dateStr} · Planning de chantier ${nomAffaire}</span>
</div>

<script>
window.onload = function() {
  // ── 1. Flèches de chemin critique ──────────────────────────────────────────
  // Mesurées dans le repère naturel (non mis à l'échelle) du tableau : la mise
  // à l'échelle qui suit (étape 2) s'applique à #gw dans son ensemble (tableau
  // + overlay SVG), donc les tracés restent alignés une fois transform:scale()
  // appliqué — pas besoin de recalculer après coup.
  var table = document.getElementById('gantt-table');
  var svg = document.getElementById('arrows-svg');
  var tableRect = table.getBoundingClientRect();

  var geoMap = {};
  var barEls = document.querySelectorAll('[data-task-id], [data-segment-id]');
  for (var i = 0; i < barEls.length; i++) {
    var el = barEls[i];
    var rect = el.getBoundingClientRect();
    var key = el.dataset.segmentId ? el.dataset.segmentId : ('task:' + el.dataset.taskId);
    // Ne garder que la barre principale (type=task) pour les clés tâche —
    // les segments ont leur propre clé (segmentId), donc pas de collision.
    if (!geoMap[key] || el.dataset.type === 'task') {
      geoMap[key] = {
        left: rect.left - tableRect.left,
        right: rect.right - tableRect.left,
        centerY: rect.top - tableRect.top + rect.height / 2,
      };
    }
  }

  var depsDataEl = document.getElementById('deps-data');
  var deps = depsDataEl ? JSON.parse(depsDataEl.textContent) : [];
  var NS = 'http://www.w3.org/2000/svg';

  var defs = document.createElementNS(NS, 'defs');
  var marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'pdf-dep-arrow');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '4');
  marker.setAttribute('orient', 'auto');
  var markerPath = document.createElementNS(NS, 'path');
  markerPath.setAttribute('d', 'M0,0 L0,8 L8,4 z');
  markerPath.setAttribute('fill', '#e4702a');
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  for (var j = 0; j < deps.length; j++) {
    var dep = deps[j];
    var srcKey = dep.source_segment_id ? dep.source_segment_id : ('task:' + dep.source_tache_id);
    var tgtKey = dep.cible_segment_id ? dep.cible_segment_id : ('task:' + dep.cible_tache_id);
    var src = geoMap[srcKey];
    var tgt = geoMap[tgtKey];
    if (!src || !tgt) continue;

    var x1 = src.right, y1 = src.centerY;
    var x2 = tgt.left, y2 = tgt.centerY;
    var span = Math.abs(x2 - x1);
    var ctrl = Math.max(50, span * 0.45);
    var d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + ctrl) + ' ' + y1 + ', ' + (x2 - ctrl) + ' ' + y2 + ', ' + x2 + ' ' + y2;

    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#e4702a');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '6 3');
    path.setAttribute('stroke-opacity', '0.85');
    path.setAttribute('marker-end', 'url(#pdf-dep-arrow)');
    svg.appendChild(path);

    var circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', x1);
    circle.setAttribute('cy', y1);
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', '#e4702a');
    circle.setAttribute('fill-opacity', '0.85');
    svg.appendChild(circle);
  }

  // Origine et hauteur du SVG alignées sur le tableau : les coordonnées ci-dessus
  // sont mesurées depuis le haut du TABLEAU, alors que l'overlay est positionné
  // dans #gw, qui commence plus haut (bande de jalons). Sans ce recalage, toutes
  // les flèches seraient décalées vers le haut de la hauteur de la bande.
  svg.style.top = table.offsetTop + 'px';
  svg.setAttribute('height', table.offsetHeight);
  svg.style.height = table.offsetHeight + 'px';

  // ── 2. Mise à l'échelle pour tenir sur une page + impression ────────────────
  var gw = document.getElementById('gw');
  var pw = document.body.clientWidth;
  var tw = gw.scrollWidth;
  if (tw > pw * 1.02) {
    var s = pw / tw;
    gw.style.transformOrigin = 'top left';
    gw.style.transform = 'scale(' + s + ')';
    gw.style.marginBottom = ((s - 1) * gw.offsetHeight) + 'px';
  }
  setTimeout(function() { window.print(); }, 400);
};
</script>
</body>
</html>`
}

export function generatePlanningChantierPdf(params) {
  const win = window.open('', '_blank')
  if (!win) { alert('Autorisez les pop-ups pour exporter en PDF.'); return }
  win.document.write(buildHtml(params))
  win.document.close()
}
