import { getWeekStart, addWeeks, getCurrentWeek } from './types'

const BAR_COLORS = {
  etude:         '#E8A200',
  validation:    '#2A8A4E',
  administratif: '#D97706',
  chantier:      '#1B3A5C',
}

function isFirstWeekOfMonth(semaine, annee) {
  const date = getWeekStart(semaine, annee)
  const prev = new Date(date)
  prev.setDate(prev.getDate() - 7)
  return prev.getMonth() !== date.getMonth()
}

function buildWeeksList(semaineDebut, anneeDebut, semaineFin, anneeFin) {
  const weeks = []
  let s = semaineDebut, a = anneeDebut
  for (let i = 0; i < 500; i++) {
    weeks.push({ semaine: s, annee: a })
    if (a === anneeFin && s >= semaineFin) break
    const next = addWeeks(s, a, 1)
    s = next.semaine; a = next.annee
  }
  return weeks
}

function buildMonthHeaders(weeks) {
  const months = []
  weeks.forEach(w => {
    const d = getWeekStart(w.semaine, w.annee)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    if (!months.length || months[months.length - 1].label !== label) {
      months.push({ label, count: 1 })
    } else {
      months[months.length - 1].count++
    }
  })
  return months.map(m =>
    `<th colspan="${m.count}" class="week-month">${m.label}</th>`
  ).join('')
}

function buildWeekHeaders(weeks, cw) {
  return weeks.map(w => {
    const isCurrent = w.semaine === cw.semaine && w.annee === cw.annee
    const isStart = isFirstWeekOfMonth(w.semaine, w.annee)
    return `<th class="week-num${isCurrent ? ' wk-cur' : ''}${isStart ? ' wk-ms' : ''}">S${w.semaine}</th>`
  }).join('')
}

function buildPhaseRows(phases, weeks, jalons) {
  return phases.map(phase => {
    const color = BAR_COLORS[phase.type_tache] ?? '#9C9591'
    const labelCls = {
      etude:         'lbl-moe',
      validation:    'lbl-moa',
      administratif: 'lbl-adm',
      chantier:      'lbl-chantier',
    }[phase.type_tache] ?? 'lbl-moa'

    const startIdx = weeks.findIndex(w =>
      w.semaine === phase.semaine_debut && w.annee === phase.annee_debut
    )
    const endW = addWeeks(phase.semaine_debut, phase.annee_debut, phase.duree_semaines)
    const endIdx = weeks.findIndex(w => w.semaine === endW.semaine && w.annee === endW.annee)
    const spanCount = endIdx >= 0 ? endIdx - startIdx : weeks.length - Math.max(startIdx, 0)

    const cells = weeks.map((w, idx) => {
      const ms = isFirstWeekOfMonth(w.semaine, w.annee)
      let content = ''

      if (idx === startIdx && startIdx >= 0 && spanCount > 0) {
        let segments = ''
        if (phase.type_tache === 'etude') {
          const segs = [
            { d: phase.duree_arch, n: '1', op: 0.15 },
            { d: phase.duree_bet,  n: '2', op: 0.25 },
            { d: phase.duree_econ, n: '3', op: 0.35 },
          ].filter(s => s.d > 0)
          if (segs.length) {
            let offset = 0
            segments = segs.map(seg => {
              const pct = (seg.d / phase.duree_semaines) * 100
              const div = `<div class="seg" style="left:${offset}%;width:${pct}%;background:rgba(0,0,0,${seg.op})">${seg.n}</div>`
              offset += pct
              return div
            }).join('')
          }
        }

        const barText = phase.type_tache === 'administratif' && phase.label_barre
          ? `<span class="bar-inner-txt">${phase.label_barre}</span>`
          : ''

        const isMoe = phase.type_tache === 'etude'
        const isAdmin = phase.type_tache === 'administratif'
        const barStyle = `left:0;width:${spanCount * 100}%;background:${color};${isAdmin ? 'background:transparent;border:1px dashed ' + color + ';' : ''}`

        content = `<div class="bar" style="${barStyle}">${segments}${barText}</div>
          <div style="position:absolute;left:calc(${spanCount * 100}% + 3px);top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:6.5pt;font-weight:${isMoe ? 'bold' : 'normal'};color:#1F1B17;z-index:10;">${phase.nom}</div>`
      }

      const jalonsSemaine = (jalons ?? []).filter(j => j.semaine === w.semaine && j.annee === w.annee)
      const jalonLines = jalonsSemaine.map(j =>
        `<div class="jalon-line" style="background:${j.couleur};left:50%">
           <div class="jalon-label" style="background:${j.couleur}">${j.label}</div>
         </div>`
      ).join('')

      return `<td class="pcell${ms ? ' ms' : ''}" style="position:relative">${content}${jalonLines}</td>`
    }).join('')

    return `<tr><td class="plabel ${labelCls}">${phase.nom}</td>${cells}</tr>`
  }).join('')
}

function buildHtml({ phases, jalons, affaire, semaineDebut, anneeDebut, semaineFin, anneeFin, largeurMm, hauteurMm }) {
  const weeks = buildWeeksList(semaineDebut, anneeDebut, semaineFin, anneeFin)
  const cw = getCurrentWeek()
  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const marginH = 20
  const labelColMm = 45
  const contentMm = largeurMm - marginH - labelColMm
  const weekWidthMm = Math.max(4, contentMm / weeks.length)

  const monthHeaders = buildMonthHeaders(weeks)
  const weekHeaders  = buildWeekHeaders(weeks, cw)
  const phaseRows    = buildPhaseRows(phases, weeks, jalons)

  const dateStr    = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomAffaire  = affaire?.nom ?? ''
  const moaNom      = affaire?.moa_nom ?? ''
  const codeAffaire = affaire?.code_affaire ?? affaire?.numero ?? ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Planning d'étude — ${nomAffaire}</title>
<style>
  @page { size: ${largeurMm}mm ${hauteurMm}mm; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #111; background: white; width: ${largeurMm - 20}mm; max-width: ${largeurMm - 20}mm; }

  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6mm; padding-bottom: 4mm; border-bottom: 1.5px solid #E8602C; }
  .logo { height: 13mm; width: auto; }
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

  .col-label { width: ${labelColMm}mm; min-width: ${labelColMm}mm; }
  .col-week  { width: ${weekWidthMm}mm; min-width: ${weekWidthMm}mm; }

  .week-month { background: #FAF7F2; font-size: 6.5pt; font-weight: bold; color: #E8602C; text-align: center; border: 0.5px solid #ddd; padding: 1mm 0; }
  .week-num   { background: #FAFAF9; font-size: 5.5pt; color: #9C9591; text-align: center; border: 0.5px solid #ddd; padding: 0.8mm 0; }
  .wk-cur     { background: rgba(232,96,44,0.10); color: #E8602C; font-weight: bold; }
  .wk-ms      { border-left: 1.5px solid #bbb; }

  .plabel       { border: 0.5px solid #eee; border-right: 1px solid #ccc; padding: 0 1.5mm; vertical-align: middle; overflow: hidden; white-space: nowrap; height: 8.5mm; }
  .lbl-moe      { font-weight: bold; font-size: 7pt; color: #1F1B17; }
  .lbl-moa      { font-weight: normal; font-size: 6.5pt; color: #4b5563; padding-left: 4mm; }
  .lbl-adm      { font-style: italic; font-size: 6.5pt; color: #92400E; }
  .lbl-chantier { font-weight: 500; font-size: 7pt; color: #1e40af; }

  .pcell    { border: 0.5px solid #f0f0f0; height: 8.5mm; padding: 0; overflow: visible; }
  .pcell.ms { border-left: 1.5px solid #ccc; }

  .bar          { position: absolute; top: 2mm; bottom: 1mm; z-index: 2; overflow: hidden; }
  .seg          { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-size: 5.5pt; font-weight: bold; color: white; border-right: 1px solid rgba(255,255,255,0.5); }
  .bar-inner-txt{ position: absolute; inset: 0; display: flex; align-items: center; padding: 0 1.5mm; font-size: 5.5pt; color: white; font-style: italic; }

  .jalon-line  { position: absolute; top: 0; bottom: 0; width: 1.5px; z-index: 5; }
  .jalon-label { position: absolute; top: 1mm; left: 2px; font-size: 5.5pt; font-weight: bold; color: white; white-space: nowrap; padding: 0.3mm 1mm; }

  .legend    { margin-top: 5mm; padding-top: 3mm; border-top: 0.5px solid #eee; display: flex; align-items: center; gap: 5mm; flex-wrap: wrap; }
  .leg-title { font-size: 5.5pt; font-weight: bold; color: #9C9591; text-transform: uppercase; letter-spacing: 0.05em; }
  .leg-item  { display: flex; align-items: center; gap: 1.5mm; font-size: 6pt; color: #4b5563; }
  .leg-swatch{ width: 7mm; height: 2.5mm; }
  .leg-num   { width: 4mm; height: 4mm; background: rgba(232,162,0,0.25); color: #B07C00; font-size: 5.5pt; font-weight: bold; display: flex; align-items: center; justify-content: center; }

  .footer { margin-top: 4mm; padding-top: 2mm; border-top: 0.5px solid #eee; font-size: 6pt; color: #9C9591; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <img src="${logoUrl}" class="logo" alt="JGA" onerror="this.style.display='none'" />
  <div class="header-right">
    <div class="header-title">Planning d'étude — ${nomAffaire}</div>
    <div class="header-sub">
      ${moaNom ? `Maître d'ouvrage : ${moaNom}<br>` : ''}
      Référence : ${codeAffaire}
    </div>
    <div class="header-period">S${semaineDebut} ${anneeDebut} → S${semaineFin} ${anneeFin}</div>
  </div>
</div>

<div class="gantt-wrap" id="gw">
  <table class="gantt-table">
    <colgroup>
      <col class="col-label">
      ${weeks.map(() => `<col class="col-week">`).join('')}
    </colgroup>
    <thead>
      <tr>
        <th class="plabel" style="background:#FAF7F2;font-size:6pt;color:#9C9591;text-align:center">Phases</th>
        ${monthHeaders}
      </tr>
      <tr>
        <th class="plabel" style="background:#FAFAF9"></th>
        ${weekHeaders}
      </tr>
    </thead>
    <tbody>${phaseRows}</tbody>
  </table>
</div>

<div class="legend">
  <span class="leg-title">Légende</span>
  ${[
    { c: '#E8A200', l: 'MOE' },
    { c: '#2A8A4E', l: 'Validation MOA' },
    { c: '#D97706', l: 'Administratif', dashed: true },
    { c: '#1B3A5C', l: 'Chantier' },
  ].map(i => `<div class="leg-item"><div class="leg-swatch" style="background:${i.c};${i.dashed ? 'background:transparent;border:1px dashed ' + i.c + ';' : ''}"></div>${i.l}</div>`).join('')}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  ${[['1','Architecte'],['2','BET'],['3','Économiste']].map(([n,l]) =>
    `<div class="leg-item"><div class="leg-num">${n}</div>${l}</div>`
  ).join('')}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  <div class="leg-item"><div style="width:8mm;border-top:2px solid #E8602C"></div>Jalon</div>
</div>

<div class="footer">
  <span>JGA Architectures</span>
  <span>Document généré le ${dateStr} · Planning d'étude ${nomAffaire}</span>
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

export function generatePlanningEtudePdf(params) {
  const win = window.open('', '_blank')
  if (!win) { alert('Autorisez les pop-ups pour exporter en PDF.'); return }
  win.document.write(buildHtml(params))
  win.document.close()
}
