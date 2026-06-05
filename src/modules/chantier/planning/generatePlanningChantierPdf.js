import { parseDate, formatDateISO, addWorkingDays } from './types'

const WEEKEND_RATIO = 0.35
const LABEL_COL_MM = 45

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

function computeDayWidths(days, contentMm) {
  const workingCount = days.filter(d => !isWeekend(d)).length
  const weekendCount = days.length - workingCount
  const totalUnits = workingCount + weekendCount * WEEKEND_RATIO
  const normalMm = totalUnits > 0 ? contentMm / totalUnits : 3
  return days.map(d => isWeekend(d) ? normalMm * WEEKEND_RATIO : normalMm)
}

function buildMonthHeaders(days, dayWidths) {
  const months = []
  days.forEach((d, i) => {
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    if (!months.length || months[months.length - 1].label !== label) {
      months.push({ label, widthMm: dayWidths[i] })
    } else {
      months[months.length - 1].widthMm += dayWidths[i]
    }
  })
  return months.map(m =>
    `<th class="hdr-month" style="width:${m.widthMm.toFixed(2)}mm">${m.label}</th>`
  ).join('')
}

function buildWeekHeaders(days, dayWidths) {
  const weeks = []
  days.forEach((d, i) => {
    const wn = getISOWeek(d)
    const wKey = `${d.getFullYear()}-${wn}`
    if (!weeks.length || weeks[weeks.length - 1].key !== wKey) {
      weeks.push({ key: wKey, wn, widthMm: dayWidths[i] })
    } else {
      weeks[weeks.length - 1].widthMm += dayWidths[i]
    }
  })
  return weeks.map(w =>
    `<th class="hdr-week" style="width:${w.widthMm.toFixed(2)}mm">S${w.wn}</th>`
  ).join('')
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

function buildTaskRow(task, color, days, dayWidths, jalons, todayStr) {
  const taskStartStr = typeof task.debut === 'string' ? task.debut.split('T')[0] : formatDateISO(parseDate(task.debut))
  const startIdx = days.findIndex(d => formatDateISO(d) === taskStartStr)

  const endDate = addWorkingDays(parseDate(taskStartStr), task.duree)
  const endDateStr = formatDateISO(endDate)
  const endIdx = days.findIndex(d => formatDateISO(d) === endDateStr)

  const actualEnd = endIdx >= 0 ? endIdx : days.length
  let barWidthMm = 0
  if (startIdx >= 0) {
    for (let i = startIdx; i < actualEnd && i < days.length; i++) barWidthMm += dayWidths[i]
  }

  let approHtml = ''
  if (task.appro_actif && task.appro_duree > 0 && startIdx >= 0) {
    const approStart = addWorkingDays(parseDate(taskStartStr), -task.appro_duree)
    const approStartStr = formatDateISO(approStart)
    const approIdx = days.findIndex(d => formatDateISO(d) === approStartStr)
    let approWidthMm = 0
    for (let i = (approIdx >= 0 ? approIdx : 0); i < startIdx && i < days.length; i++) approWidthMm += dayWidths[i]
    if (approWidthMm > 0) {
      const lbl = task.appro_materiau ? `Appro. – ${task.appro_materiau}` : `Délai appro. – ${task.appro_duree}j`
      approHtml = `<div style="position:absolute;left:-${approWidthMm.toFixed(2)}mm;width:${approWidthMm.toFixed(2)}mm;top:1mm;bottom:1mm;background:${color};opacity:0.28;border:1.5px dashed ${color};border-right:none;display:flex;align-items:center;overflow:hidden;z-index:3;pointer-events:none">
        <span style="font-size:5pt;color:${color};filter:brightness(0.5);white-space:nowrap;overflow:hidden;padding:0 1mm">${lbl}</span>
      </div>`
    }
  }

  const cells = days.map((d, idx) => {
    const isWE = isWeekend(d)
    const isMonthStart = d.getDate() === 1
    const isMonday = d.getDay() === 1
    const borderLeft = isMonthStart ? '1.5px solid #ccc' : isMonday ? '1px solid rgba(0,0,0,0.15)' : '0.5px solid #f0f0f0'
    const bg = isWE ? 'rgba(0,0,0,0.03)' : 'transparent'

    let barContent = ''
    if (idx === startIdx && startIdx >= 0 && barWidthMm > 0) {
      const progressBar = task.avancement > 0
        ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${task.avancement}%;background:rgba(0,0,0,0.22);z-index:2"></div>`
        : ''
      const labelAvancement = task.avancement > 0 && task.avancement < 100
        ? `<span style="margin-left:1.5mm;font-size:5.5pt;color:#9C9591">${task.avancement}%</span>`
        : ''
      barContent = `${approHtml}
        <div style="position:absolute;left:0;width:${barWidthMm.toFixed(2)}mm;top:1mm;bottom:1mm;background:${color};z-index:4;overflow:hidden">${progressBar}</div>
        <div style="position:absolute;left:${barWidthMm.toFixed(2)}mm;padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:6.5pt;color:#1F1B17;z-index:10">${task.nom}${labelAvancement}</div>`
    }

    const dayStr = formatDateISO(d)
    const jalonLines = (jalons ?? [])
      .filter(j => (j.date ?? '').split('T')[0] === dayStr)
      .map(j => `<div style="position:absolute;top:0;bottom:0;left:50%;width:1.5px;background:${j.couleur};z-index:5">
        <div style="position:absolute;top:0.5mm;left:2px;font-size:5pt;font-weight:bold;color:${j.couleur};white-space:nowrap">${j.label}</div>
      </div>`)
      .join('')

    return `<td style="width:${dayWidths[idx].toFixed(2)}mm;border-bottom:0.5px solid #f0f0f0;border-left:${borderLeft};height:6mm;padding:0;overflow:visible;position:relative;background:${bg}">${barContent}${jalonLines}</td>`
  }).join('')

  return `<tr>
    <td class="plabel">${task.num_tache ? `<span style="color:#9C9591;margin-right:1.5mm">${task.num_tache}</span>` : ''}${task.nom}</td>
    ${cells}
  </tr>`
}

function buildHtml({ tasks, lots, jalons, affaire, dateDebut, dateFin, largeurMm, hauteurMm }) {
  const dStart = parseDate(dateDebut)
  const dEnd = parseDate(dateFin)
  const days = buildDaysList(dStart, dEnd)

  const contentMm = largeurMm - 20 - LABEL_COL_MM
  const dayWidths = computeDayWidths(days, contentMm)
  const todayStr = formatDateISO(new Date())

  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const nomAffaire  = affaire?.nom ?? ''
  const moaNom      = affaire?.moa_nom ?? ''
  const codeAffaire = affaire?.code_affaire ?? affaire?.numero ?? ''
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const periodeStr = `${dStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} → ${dEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`

  const monthHeaders = buildMonthHeaders(days, dayWidths)
  const weekHeaders  = buildWeekHeaders(days, dayWidths)
  const dayHeaders   = buildDayHeaders(days, dayWidths, todayStr)

  const sortedLots = [...lots].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
  let lotsRows = ''
  sortedLots.forEach(lot => {
    const lotTasks = tasks.filter(t => t.lot_id === lot.id)
    if (!lotTasks.length) return
    lotsRows += `<tr>
      <td colspan="${1 + days.length}" style="background:${lot.couleur}18;color:${lot.couleur};font-weight:bold;font-size:7pt;padding:0 2mm;height:5.5mm;border-bottom:0.5px solid rgba(0,0,0,0.08)">
        ${lot.num_lot ?? ''} – ${lot.nom}
      </td>
    </tr>`
    lotTasks.forEach(t => { lotsRows += buildTaskRow(t, lot.couleur, days, dayWidths, jalons, todayStr) })
  })
  const unassigned = tasks.filter(t => t.lot_id == null)
  if (unassigned.length > 0) {
    lotsRows += `<tr><td colspan="${1 + days.length}" style="color:#9C9591;font-weight:bold;font-size:7pt;padding:0 2mm;height:5.5mm;border-bottom:0.5px solid rgba(0,0,0,0.08)">Sans lot</td></tr>`
    unassigned.forEach(t => { lotsRows += buildTaskRow(t, '#94a3b8', days, dayWidths, jalons, todayStr) })
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

  .gantt-wrap { width: 100%; transform-origin: top left; border: 1px solid #1F1B17; }
  .gantt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .gantt-table thead tr:first-child th:first-child { border-top: none; border-left: none; }
  .gantt-table thead tr:first-child th:last-child  { border-top: none; border-right: none; }
  .gantt-table tbody tr:last-child td:first-child   { border-bottom: none; border-left: none; }
  .gantt-table tbody tr:last-child td:last-child    { border-bottom: none; border-right: none; }

  .col-label { width: ${LABEL_COL_MM}mm; min-width: ${LABEL_COL_MM}mm; }

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
  <table class="gantt-table">
    <colgroup>
      <col class="col-label">
      ${days.map((_, i) => `<col style="width:${dayWidths[i].toFixed(2)}mm">`).join('')}
    </colgroup>
    <thead>
      <tr>
        <th class="plabel" style="background:#FAF7F2;font-size:6pt;color:#9C9591;text-align:center">Tâches</th>
        ${monthHeaders}
      </tr>
      <tr>
        <th class="plabel" style="background:#FAF7F2"></th>
        ${weekHeaders}
      </tr>
      <tr>
        <th class="plabel" style="background:#FAFAF9"></th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>${lotsRows}</tbody>
  </table>
</div>

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
    <div class="leg-swatch" style="background:transparent;border:1px dashed #E8602C;opacity:0.6"></div>
    Extension appro.
  </div>
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
