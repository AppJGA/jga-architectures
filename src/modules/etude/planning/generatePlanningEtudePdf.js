import {
  getWeekStart, addWeeks, weeksBetween, getCurrentWeek, weekOfDate,
  computePhaseFragments, distributeSegmentsAcrossFragments,
  getPhaseCouleur, adminGradient, TYPE_COLORS,
} from './types'
import { assignLabelLanes } from '../../chantier/planning/jalonLayout'

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

// Fond d'une cellule couverte par une période : hachures si bloquante, aplat
// très clair si informative (mêmes conventions que le planning chantier).
function hexToRgb(hex) {
  const h = (hex || '#B8412C').replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

function periodeDeLaSemaine(w, periodes) {
  const couvrantes = (periodes ?? []).filter(p => {
    const d = weekOfDate(p.date_debut)
    const f = weekOfDate(p.date_fin)
    if (!d || !f) return false
    return weeksBetween(d.semaine, d.annee, w.semaine, w.annee) >= 0
      && weeksBetween(w.semaine, w.annee, f.semaine, f.annee) >= 0
  })
  return couvrantes.find(p => p.est_bloquante !== false) ?? couvrantes[0] ?? null
}

function fondPeriode(periode) {
  const rgb = hexToRgb(periode.couleur)
  return periode.est_bloquante !== false
    ? `repeating-linear-gradient(45deg, rgba(${rgb},0.08), rgba(${rgb},0.08) 3px, rgba(${rgb},0.15) 3px, rgba(${rgb},0.15) 6px)`
    : `rgba(${rgb},0.06)`
}

function buildPhaseRows(phases, weeks, jalons, segments = [], periodes = []) {
  return phases.map(phase => {
    // Couleur effective : personnalisée si définie, sinon celle du type
    const color = getPhaseCouleur(phase)
    // Phases administratives : bariolé rouge et trait noir épais, pour qu'elles
    // ressortent nettement de l'ambre MOE une fois imprimées.
    const fondBarre = phase.type_tache === 'administratif'
      ? `background:${adminGradient(color)};border:2px solid #1F1B17;box-sizing:border-box;`
      : `background:${color};`
    const labelCls = {
      etude:         'lbl-moe',
      validation:    'lbl-moa',
      administratif: 'lbl-adm',
      chantier:      'lbl-chantier',
    }[phase.type_tache] ?? 'lbl-moa'

    // Fragments : les semaines bloquantes coupent la barre (même règle qu'à l'écran)
    const fragments = computePhaseFragments(phase, periodes)
    const segsParFragment = distributeSegmentsAcrossFragments(phase, fragments)
    const fragsIndexes = fragments.map((f, fi) => ({
      idx: weeks.findIndex(w => w.semaine === f.semaine_debut && w.annee === f.annee_debut),
      duree: f.duree_semaines,
      sousDurees: segsParFragment[fi] ?? [],
    })).filter(f => f.idx >= 0)
    const dernierFrag = fragsIndexes[fragsIndexes.length - 1] ?? null

    // Segments de la phase : chacun démarre dans sa propre cellule
    const segsDePhase = segments.filter(s => s.phase_id === phase.id)

    const cells = weeks.map((w, idx) => {
      const ms = isFirstWeekOfMonth(w.semaine, w.annee)
      let content = ''

      const fragIci = fragsIndexes.find(f => f.idx === idx)
      if (fragIci) {
        const spanCount = fragIci.duree
        const estDernier = fragIci === dernierFrag
        // Répartition ①②③ propre à CE fragment : une sous-durée coupée par des
        // congés se poursuit sur le fragment suivant.
        let segments = ''
        if (phase.type_tache === 'etude' && fragIci.sousDurees.length > 0) {
          const opacite = { 1: 0.15, 2: 0.25, 3: 0.35 }
          let offset = 0
          segments = fragIci.sousDurees.map(sub => {
            const pct = (sub.duree / spanCount) * 100
            const div = `<div class="seg" style="left:${offset}%;width:${pct}%;background:rgba(0,0,0,${opacite[sub.num]})">${sub.num}</div>`
            offset += pct
            return div
          }).join('')
        }

        const barText = phase.type_tache === 'administratif' && phase.label_barre
          ? `<span class="bar-inner-txt">${phase.label_barre}</span>`
          : ''

        const isMoe = phase.type_tache === 'etude'
        const barStyle = `left:0;width:${spanCount * 100}%;${fondBarre}`

        content = `<div class="bar" style="${barStyle}">${segments}${barText}</div>`
        if (estDernier) {
          content += `<div style="position:absolute;left:calc(${spanCount * 100}% + 3px);top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:6.5pt;font-weight:${isMoe ? 'bold' : 'normal'};color:#1F1B17;z-index:10;">${phase.nom}</div>`
        }
      }

      // Barres de segment (mêmes couleur et géométrie que dans la timeline)
      let segContent = ''
      segsDePhase.forEach(seg => {
        if (seg.semaine_debut !== w.semaine || seg.annee_debut !== w.annee) return
        const span = Math.max(1, seg.duree_semaines)
        const texteSeg = phase.type_tache === 'administratif'
          ? (seg.nom ?? phase.label_barre ?? '')
          : (seg.nom ?? '')
        segContent += `<div class="bar seg-bar" style="left:0;width:${span * 100}%;${fondBarre}">
          ${texteSeg ? `<span class="bar-inner-txt">${texteSeg}</span>` : ''}
        </div>`
      })

      const jalonsSemaine = (jalons ?? []).filter(j => j.semaine === w.semaine && j.annee === w.annee)
      const jalonLines = jalonsSemaine.map(j =>
        `<div class="jalon-line" style="background:${j.couleur};left:50%"></div>`
      ).join('')

      const periode = periodeDeLaSemaine(w, periodes)
      const bg = periode ? `background:${fondPeriode(periode)};` : ''

      return `<td class="pcell${ms ? ' ms' : ''}" style="position:relative;${bg}">${content}${segContent}${jalonLines}</td>`
    }).join('')

    return `<tr><td class="plabel ${labelCls}">${phase.nom}</td>${cells}</tr>`
  }).join('')
}

// ─── Bande de jalons ──────────────────────────────────────────────────────────
// Un seul libellé par jalon, au-dessus du tableau, décalé verticalement quand
// deux jalons sont trop proches (même traitement que le planning chantier).
const JALON_GAP_MM = 26
const JALON_LIGNE_MM = 3.2

function buildJalonBand(jalons, weeks, labelColMm, weekWidthMm) {
  const places = (jalons ?? [])
    .map(j => {
      const idx = weeks.findIndex(w => w.semaine === j.semaine && w.annee === j.annee)
      if (idx < 0) return null
      return { jalon: j, x: labelColMm + idx * weekWidthMm + weekWidthMm / 2 }
    })
    .filter(Boolean)

  if (places.length === 0) return ''

  const lanes = assignLabelLanes(places.map(p => p.x), JALON_GAP_MM)
  const hauteurMm = (Math.max(...lanes) + 1) * JALON_LIGNE_MM + 5

  const marqueurs = places.map(({ jalon, x }, i) => {
    const couleur = jalon.couleur ?? '#8B5CF6'
    const topLabel = lanes[i] * JALON_LIGNE_MM
    const topTrait = (lanes[i] + 1) * JALON_LIGNE_MM
    return `<div style="position:absolute;left:${x.toFixed(2)}mm;top:0;bottom:0;width:0">
      <div style="position:absolute;top:${topLabel.toFixed(2)}mm;left:1.2mm;font-size:5pt;font-weight:bold;color:${couleur};white-space:nowrap;line-height:${JALON_LIGNE_MM}mm">${jalon.label ?? ''}</div>
      <div style="position:absolute;top:${topTrait.toFixed(2)}mm;bottom:1.6mm;left:0;width:1.5px;background:${couleur}"></div>
      <div style="position:absolute;bottom:0;left:-2.5px;width:0;height:0;border-left:2.5px solid transparent;border-right:2.5px solid transparent;border-top:1.6mm solid ${couleur}"></div>
    </div>`
  }).join('')

  return `<div style="position:relative;height:${hauteurMm.toFixed(2)}mm;border-bottom:1px solid #E9E2D6;margin-bottom:1mm">${marqueurs}</div>`
}

function buildHtml({
  phases, jalons, affaire, semaineDebut, anneeDebut, semaineFin, anneeFin,
  largeurMm, hauteurMm, segments = [], periodes = [],
}) {
  const weeks = buildWeeksList(semaineDebut, anneeDebut, semaineFin, anneeFin)
  const cw = getCurrentWeek()
  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const marginH = 20
  const labelColMm = 45
  const contentMm = largeurMm - marginH - labelColMm
  const weekWidthMm = Math.max(4, contentMm / weeks.length)

  const monthHeaders = buildMonthHeaders(weeks)
  const weekHeaders  = buildWeekHeaders(weeks, cw)
  const phaseRows    = buildPhaseRows(phases, weeks, jalons, segments, periodes)
  const jalonBand    = buildJalonBand(jalons, weeks, labelColMm, weekWidthMm)

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
  .seg-bar      { opacity: 0.85; outline: 1px dashed rgba(255,255,255,0.6); outline-offset: -1px; z-index: 3; }
  .bar-inner-txt{ position: absolute; inset: 0; display: flex; align-items: center; padding: 0 1.5mm; font-size: 5.5pt; color: white; font-style: italic; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }

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
  ${jalonBand}
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
    { c: TYPE_COLORS.etude, l: 'MOE' },
    { c: TYPE_COLORS.validation, l: 'Validation MOA' },
    { c: TYPE_COLORS.administratif, l: 'Administratif (bariolé)', bariole: true },
    { c: TYPE_COLORS.chantier, l: 'Chantier' },
  ].map(i => `<div class="leg-item"><div class="leg-swatch" style="background:${i.bariole ? adminGradient(i.c) : i.c};${i.bariole ? 'border:2px solid #1F1B17;box-sizing:border-box;' : ''}"></div>${i.l}</div>`).join('')}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  ${[['1','Architecte'],['2','BET'],['3','Économiste']].map(([n,l]) =>
    `<div class="leg-item"><div class="leg-num">${n}</div>${l}</div>`
  ).join('')}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  <div class="leg-item"><div class="leg-swatch" style="background:#E8A200;opacity:0.85;outline:1px dashed rgba(255,255,255,0.6);outline-offset:-1px"></div>Segment</div>
  <div class="leg-item"><div class="leg-swatch" style="background:repeating-linear-gradient(45deg, rgba(184,65,44,0.15), rgba(184,65,44,0.15) 3px, rgba(184,65,44,0.28) 3px, rgba(184,65,44,0.28) 6px)"></div>Période bloquante</div>
  <div class="leg-item"><div class="leg-swatch" style="background:rgba(184,65,44,0.10);border:0.5px solid rgba(184,65,44,0.25)"></div>Période informative</div>
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
