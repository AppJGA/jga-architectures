import {
  getWeekStart, addWeeks, weeksBetween, getCurrentWeek, weekOfDate,
  computePhaseFragments, distributeSegmentsAcrossFragments,
  getPhaseCouleur, adminGradient, TYPE_COLORS,
} from './types'
import { assignLabelLanes } from '../../chantier/planning/jalonLayout'
import { echapperHtml } from '../../../shared/echapperHtml'
import {
  bordureGauche, pastelPdf, fondPeriode, traitPeriode, stylePause, estBloquante, groupesDePeriodes,
  TRAIT_HORIZONTAL,
} from '../../../shared/planning/export/grilleExport'
import { nettoyerHtml, estVide } from '../../../shared/planning/export/texteRiche'

// L'étude est en semaines : pas de lignes de jour
const GRANULARITE = 'week'
const trait = (debutDeMois) => bordureGauche(debutDeMois ? 'mois' : 'semaine', GRANULARITE)

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
    `<th colspan="${m.count}" class="week-month" style="border-left:${trait(true)}">${m.label}</th>`
  ).join('')
}

function buildWeekHeaders(weeks, cw) {
  return weeks.map(w => {
    const isCurrent = w.semaine === cw.semaine && w.annee === cw.annee
    const isStart = isFirstWeekOfMonth(w.semaine, w.annee)
    return `<th class="week-num${isCurrent ? ' wk-cur' : ''}" style="border-left:${trait(isStart)}">S${w.semaine}</th>`
  }).join('')
}

// ─── Densité des lignes ───────────────────────────────────────────────────────
//
// Reprend le réglage « Hauteur des lignes » de l'éditeur. `normal` reproduit
// exactement le rendu historique (8,5 mm par ligne).
const DENSITY_CONFIG = {
  compact: { rowMm: 6,   barPadTopMm: 1.2, barPadBotMm: 0.6, labelPt: 6,   barLabelPt: 5.5, hdrPadMm: 0.6 },
  normal:  { rowMm: 8.5, barPadTopMm: 2,   barPadBotMm: 1,   labelPt: 7,   barLabelPt: 6.5, hdrPadMm: 1 },
  confort: { rowMm: 12,  barPadTopMm: 3,   barPadBotMm: 1.5, labelPt: 8.5, barLabelPt: 8,   hdrPadMm: 1.5 },
}

function densityConfig(density) {
  return DENSITY_CONFIG[density] ?? DENSITY_CONFIG.normal
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

// Première et dernière semaine d'une période : c'est là qu'on la borde
function bordsPeriode(w, periode) {
  if (!periode || !estBloquante(periode)) return ''
  const d = weekOfDate(periode.date_debut)
  const f = weekOfDate(periode.date_fin)
  let bords = ''
  if (d && d.semaine === w.semaine && d.annee === w.annee) bords += `border-left:${traitPeriode(periode)};`
  if (f && f.semaine === w.semaine && f.annee === w.annee) bords += `border-right:${traitPeriode(periode)};`
  return bords
}

// Bandeau qui nomme les périodes, sous les semaines
function buildBandePeriodes(weeks, periodes) {
  const parSemaine = weeks.map(w => periodeDeLaSemaine(w, periodes))
  if (!parSemaine.some(Boolean)) return ''
  // Coupé à chaque début de mois : la ligne de mois traverse le bandeau
  const debutsDeMois = weeks.map(w => isFirstWeekOfMonth(w.semaine, w.annee))
  const cellules = groupesDePeriodes(parSemaine, debutsDeMois).map(({ periode, debut, nombre, premier }) => {
    const bord = `border-left:${trait(debutsDeMois[debut])};`
    if (!periode) return `<th class="hdr-periode" colspan="${nombre}" style="${bord}"></th>`
    const libelle = premier ? echapperHtml(periode.label ?? periode.nom ?? '') : ''
    return `<th class="hdr-periode" colspan="${nombre}" style="${bord}background:${fondPeriode(periode)};color:${pastelPdf(periode.couleur ?? '#B8412C', 1)};${libelle ? 'z-index:1;' : ''}">${libelle}</th>`
  }).join('')
  return `<tr><th class="plabel" style="background:#FAFAF9;font-size:5.5pt;color:#9C9591;text-align:center">Périodes</th>${cellules}</tr>`
}

// Répartition ①②③ d'un fragment dont seules les semaines [debut, debut + duree[
// sont visibles : les sous-durées tombées hors de la période sont retirées.
function decouperSousDurees(sousDurees, debut, duree) {
  const visibles = []
  let position = 0
  sousDurees.forEach(sub => {
    const de = Math.max(position, debut)
    const a = Math.min(position + sub.duree, debut + duree)
    if (a > de) visibles.push({ num: sub.num, duree: a - de })
    position += sub.duree
  })
  return visibles
}

// Place un élément dans la grille des semaines exportées, découpé aux bornes :
// une phase commencée avant la période doit garder la partie qui s'y trouve,
// et une barre qui la dépasse ne doit pas déborder de la page.
function placerDansPeriode(weeks, semaine, annee, duree) {
  if (weeks.length === 0) return null
  const debut = weeksBetween(weeks[0].semaine, weeks[0].annee, semaine, annee)
  const idx = Math.max(0, debut)
  const fin = Math.min(weeks.length, debut + duree)
  if (fin <= idx) return null
  return { idx, duree: fin - idx, masquees: idx - debut }
}

function buildPhaseRows(phases, weeks, jalons, segments = [], periodes = [], density = 'normal') {
  const dens = densityConfig(density)
  return phases.map(phase => {
    // Couleur effective : personnalisée si définie, sinon celle du type.
    // Échappée, car elle finit dans un attribut `style`.
    const color = echapperHtml(getPhaseCouleur(phase))
    const nom = echapperHtml(phase.nom)
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

    // Les semaines bloquantes ne comptent pas dans la durée (même règle qu'à
    // l'écran). Sur le papier, la barre reste continue : les semaines
    // neutralisées y sont « en pause », la période se voit à travers.
    const fragments = computePhaseFragments(phase, periodes)
    const segsParFragment = distributeSegmentsAcrossFragments(phase, fragments)
    const morceaux = []
    fragments.forEach((f, fi) => {
      if (fi > 0) {
        const prec = fragments[fi - 1]
        const finPrec = addWeeks(prec.semaine_debut, prec.annee_debut, prec.duree_semaines)
        const trou = weeksBetween(finPrec.semaine, finPrec.annee, f.semaine_debut, f.annee_debut)
        if (trou > 0) {
          morceaux.push({ pause: true, semaine: finPrec.semaine, annee: finPrec.annee, duree: trou, periode: periodeDeLaSemaine(finPrec, periodes) })
        }
      }
      morceaux.push({ pause: false, semaine: f.semaine_debut, annee: f.annee_debut, duree: f.duree_semaines, sous: segsParFragment[fi] ?? [] })
    })
    const places = morceaux.map(m => {
      const place = placerDansPeriode(weeks, m.semaine, m.annee, m.duree)
      return place && { ...m, idx: place.idx, duree: place.duree, masquees: place.masquees }
    }).filter(Boolean)
    const barre = places.length
      ? { idx: places[0].idx, span: places[places.length - 1].idx + places[places.length - 1].duree - places[0].idx }
      : null

    // Segments de la phase : chacun démarre dans sa propre cellule — la
    // première de la période s'il a commencé avant
    const segsDePhase = segments
      .filter(s => s.phase_id === phase.id)
      .map(seg => ({
        seg,
        place: placerDansPeriode(weeks, seg.semaine_debut, seg.annee_debut, Math.max(1, seg.duree_semaines)),
      }))
      .filter(({ place }) => place)

    const cells = weeks.map((w, idx) => {
      const ms = isFirstWeekOfMonth(w.semaine, w.annee)
      let content = ''

      if (barre && barre.idx === idx) {
        const spanCount = barre.span
        const pct = (semaines) => (semaines / spanCount) * 100
        let interieur = ''
        places.forEach(m => {
          const gauche = pct(m.idx - barre.idx)
          if (m.pause) {
            interieur += `<div data-pause="1" style="position:absolute;top:0;bottom:0;left:${gauche}%;width:${pct(m.duree)}%;${stylePause(color, m.periode)}z-index:3"></div>`
            return
          }
          // Répartition ①②③ propre à ce fragment : une sous-durée coupée par
          // des congés reprend après la pause
          if (phase.type_tache !== 'etude') return
          const opacite = { 1: 0.15, 2: 0.25, 3: 0.35 }
          let offset = gauche
          decouperSousDurees(m.sous, m.masquees, m.duree).forEach(sub => {
            interieur += `<div class="seg" style="left:${offset}%;width:${pct(sub.duree)}%;background:rgba(0,0,0,${opacite[sub.num]})">${sub.num}</div>`
            offset += pct(sub.duree)
          })
        })

        const barText = phase.type_tache === 'administratif' && phase.label_barre
          ? `<span class="bar-inner-txt">${echapperHtml(phase.label_barre)}</span>`
          : ''

        const isMoe = phase.type_tache === 'etude'
        content = `<div class="bar" style="left:0;width:${spanCount * 100}%;${fondBarre}">${interieur}${barText}</div>`
        content += `<div style="position:absolute;left:calc(${spanCount * 100}% + 3px);top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:${dens.barLabelPt}pt;font-weight:${isMoe ? 'bold' : 'normal'};color:#1F1B17;z-index:10;">${nom}</div>`
      }

      // Barres de segment (mêmes couleur et géométrie que dans la timeline)
      let segContent = ''
      segsDePhase.forEach(({ seg, place }) => {
        if (place.idx !== idx) return
        const span = place.duree
        const texteSeg = echapperHtml(phase.type_tache === 'administratif'
          ? (seg.nom ?? phase.label_barre ?? '')
          : (seg.nom ?? ''))
        segContent += `<div class="bar seg-bar" style="left:0;width:${span * 100}%;${fondBarre}">
          ${texteSeg ? `<span class="bar-inner-txt">${texteSeg}</span>` : ''}
        </div>`
      })

      const jalonsSemaine = (jalons ?? []).filter(j => j.semaine === w.semaine && j.annee === w.annee)
      const jalonLines = jalonsSemaine.map(j =>
        `<div class="jalon-line" style="background:${echapperHtml(j.couleur)};left:50%"></div>`
      ).join('')

      const periode = periodeDeLaSemaine(w, periodes)
      const bg = periode ? `background:${fondPeriode(periode)};` : ''

      return `<td class="pcell" style="position:relative;border-left:${trait(ms)};${bg}${bordsPeriode(w, periode)}">${content}${segContent}${jalonLines}</td>`
    }).join('')

    return `<tr><td class="plabel ${labelCls}">${nom}</td>${cells}</tr>`
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
    const couleur = echapperHtml(jalon.couleur ?? '#8B5CF6')
    const topLabel = lanes[i] * JALON_LIGNE_MM
    const topTrait = (lanes[i] + 1) * JALON_LIGNE_MM
    return `<div style="position:absolute;left:${x.toFixed(2)}mm;top:0;bottom:0;width:0">
      <div style="position:absolute;top:${topLabel.toFixed(2)}mm;left:1.2mm;font-size:5pt;font-weight:bold;color:${couleur};white-space:nowrap;line-height:${JALON_LIGNE_MM}mm">${echapperHtml(jalon.label)}</div>
      <div style="position:absolute;top:${topTrait.toFixed(2)}mm;bottom:1.6mm;left:0;width:1.5px;background:${couleur}"></div>
      <div style="position:absolute;bottom:0;left:-2.5px;width:0;height:0;border-left:2.5px solid transparent;border-right:2.5px solid transparent;border-top:1.6mm solid ${couleur}"></div>
    </div>`
  }).join('')

  return `<div style="position:relative;height:${hauteurMm.toFixed(2)}mm;border-bottom:1px solid #E9E2D6;margin-bottom:1mm">${marqueurs}</div>`
}

function buildHtml({
  phases, jalons, affaire, semaineDebut, anneeDebut, semaineFin, anneeFin,
  largeurMm, hauteurMm, segments = [], periodes = [], density = 'normal',
  texteEntete = '', textePied = '',
}) {
  const dens = densityConfig(density)
  const weeks = buildWeeksList(semaineDebut, anneeDebut, semaineFin, anneeFin)
  const cw = getCurrentWeek()
  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const marginH = 20
  const labelColMm = 45
  const contentMm = largeurMm - marginH - labelColMm
  const weekWidthMm = Math.max(4, contentMm / weeks.length)

  const monthHeaders = buildMonthHeaders(weeks)
  const weekHeaders  = buildWeekHeaders(weeks, cw)
  const phaseRows    = buildPhaseRows(phases, weeks, jalons, segments, periodes, density)
  const jalonBand    = buildJalonBand(jalons, weeks, labelColMm, weekWidthMm)
  const bandePeriodes = buildBandePeriodes(weeks, periodes)
  const entete = estVide(texteEntete) ? '' : nettoyerHtml(texteEntete)
  const pied = estVide(textePied) ? '' : nettoyerHtml(textePied)
  const exemplePeriode = { couleur: '#B8412C' }

  const dateStr    = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomAffaire  = echapperHtml(affaire?.nom)
  const moaNom      = echapperHtml(affaire?.moa_nom)
  const codeAffaire = echapperHtml(affaire?.code_affaire ?? affaire?.numero)

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
  .header-right { text-align: right; flex-shrink: 0; }
  .texte-entete { flex: 1; min-width: 0; margin: 0 8mm; font-size: 8.5pt; color: #1F1B17; line-height: 1.45; }
  .texte-pied { margin-top: 4mm; font-size: 8.5pt; color: #1F1B17; line-height: 1.45; }
  .texte-entete ul, .texte-entete ol, .texte-pied ul, .texte-pied ol { padding-left: 5mm; }
  .texte-entete p, .texte-pied p { margin: 0 0 1mm; }
  .leg-sous-titre { font-size: 6pt; font-weight: bold; color: #9C9591; text-transform: uppercase; letter-spacing: 0.04em; }
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

  .week-month { background: #FAF7F2; font-size: ${dens.labelPt}pt; font-weight: bold; color: #E8602C; text-align: center; border: 0.5px solid #ddd; padding: ${dens.hdrPadMm}mm 0; }
  .week-num   { background: #FAFAF9; font-size: ${(dens.labelPt - 1.5).toFixed(1)}pt; color: #9C9591; text-align: center; border: 0.5px solid #ddd; padding: ${(dens.hdrPadMm * 0.8).toFixed(2)}mm 0; }
  .wk-cur     { background: rgba(232,96,44,0.10); color: #E8602C; font-weight: bold; }
  .hdr-periode { font-size: ${(dens.labelPt - 1.5).toFixed(1)}pt; font-weight: bold; text-align: left; white-space: nowrap; overflow: visible; position: relative; padding: ${(dens.hdrPadMm * 0.6).toFixed(2)}mm 1mm; border-bottom: 0.5px solid #ddd; }

  .plabel       { border: 0.5px solid #eee; border-bottom: ${TRAIT_HORIZONTAL}; border-right: 1px solid #ccc; padding: 0 1.5mm; vertical-align: middle; overflow: hidden; white-space: nowrap; height: ${dens.rowMm}mm; }
  .lbl-moe      { font-weight: bold; font-size: ${dens.labelPt}pt; color: #1F1B17; }
  .lbl-moa      { font-weight: normal; font-size: ${dens.barLabelPt}pt; color: #4b5563; padding-left: 4mm; }
  .lbl-adm      { font-style: italic; font-size: ${dens.barLabelPt}pt; color: #92400E; }
  .lbl-chantier { font-weight: 500; font-size: ${dens.labelPt}pt; color: #1e40af; }

  .pcell    { border-top: ${TRAIT_HORIZONTAL}; border-bottom: ${TRAIT_HORIZONTAL}; height: ${dens.rowMm}mm; padding: 0; overflow: visible; }

  .bar          { position: absolute; top: ${dens.barPadTopMm}mm; bottom: ${dens.barPadBotMm}mm; z-index: 2; overflow: hidden; }
  .seg          { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-size: ${dens.barLabelPt}pt; font-weight: bold; color: white; border-right: 1px solid rgba(255,255,255,0.5); }
  .seg-bar      { opacity: 0.85; outline: 1px dashed rgba(255,255,255,0.6); outline-offset: -1px; z-index: 3; }
  .bar-inner-txt{ position: absolute; inset: 0; display: flex; align-items: center; padding: 0 1.5mm; font-size: ${dens.barLabelPt}pt; color: white; font-style: italic; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }

  .jalon-line  { position: absolute; top: 0; bottom: 0; width: 1.5px; z-index: 5; }
  .jalon-label { position: absolute; top: 1mm; left: 2px; font-size: 5.5pt; font-weight: bold; color: white; white-space: nowrap; padding: 0.3mm 1mm; }

  .legend    { margin-top: 5mm; padding-top: 3mm; border-top: 0.5px solid #eee; display: flex; align-items: center; gap: 5mm; flex-wrap: wrap; }
  .leg-title { font-size: 5.5pt; font-weight: bold; color: #9C9591; text-transform: uppercase; letter-spacing: 0.05em; }
  .leg-item  { display: flex; align-items: center; gap: 1.5mm; font-size: 6pt; color: #4b5563; }
  .leg-swatch{ width: 7mm; height: 2.5mm; box-sizing: border-box; }
  .leg-num   { width: 4mm; height: 4mm; background: rgba(232,162,0,0.25); color: #B07C00; font-size: 5.5pt; font-weight: bold; display: flex; align-items: center; justify-content: center; }

  .footer { margin-top: 4mm; padding-top: 2mm; border-top: 0.5px solid #eee; font-size: 6pt; color: #9C9591; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <img src="${logoUrl}" class="logo" alt="JGA" onerror="this.style.display='none'" />
  ${entete ? `<div class="texte-entete">${entete}</div>` : ''}
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
      ${bandePeriodes}
    </thead>
    <tbody>${phaseRows}</tbody>
  </table>
</div>

${pied ? `<div class="texte-pied">${pied}</div>` : ''}

<div class="legend">
  <span class="leg-title">Légende</span>
  ${[
    { c: TYPE_COLORS.etude, l: 'Phase MOE (ESQ, APS, APD…)' },
    { c: TYPE_COLORS.validation, l: 'Validation / Visa' },
    { c: TYPE_COLORS.administratif, l: 'Période administrative', bariole: true },
    { c: TYPE_COLORS.chantier, l: 'Phase chantier' },
  ].map(i => `<div class="leg-item"><div class="leg-swatch" style="background:${i.bariole ? adminGradient(i.c) : i.c};${i.bariole ? 'border:2px solid #1F1B17;' : ''}"></div>${i.l}</div>`).join('')}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  ${[['1','Architecte'],['2','BET'],['3','Économiste']].map(([n,l]) =>
    `<div class="leg-item"><div class="leg-num">${n}</div>${l}</div>`
  ).join('')}
  <div style="border-left:0.5px solid #ddd;height:8px;margin:0 2mm"></div>
  <span class="leg-sous-titre">Conventions</span>
  <div class="leg-item"><div class="leg-swatch" style="background:#E8A200;opacity:0.85;outline:1px dashed rgba(255,255,255,0.6);outline-offset:-1px"></div>Segment</div>
  <div class="leg-item"><div class="leg-swatch" style="background:${fondPeriode(exemplePeriode)};border-left:${traitPeriode(exemplePeriode)};border-right:${traitPeriode(exemplePeriode)}"></div>Période bloquante</div>
  <div class="leg-item"><div class="leg-swatch" style="background:${fondPeriode({ ...exemplePeriode, est_bloquante: false })}"></div>Période informative</div>
  <div class="leg-item"><div class="leg-swatch" style="${stylePause('#5E5854', exemplePeriode)}"></div>Phase en pause pendant une période (semaines non comptées)</div>
  <div class="leg-item"><div style="width:8mm;border-top:2px solid #8B5CF6"></div>Jalon</div>
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
