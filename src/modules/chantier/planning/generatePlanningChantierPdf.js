import { parseDate, formatDateISO, addWorkingDaysBlocked, dernierJourTache } from './types'
import { buildRowsByZone } from './groupByZone'
import { resumePlanning } from './resumeLogique'
import { legendeCouleurs } from './legende'
import { echapperHtml } from '../../../shared/echapperHtml'
import {
  bordureGauche, niveauDuJour, moisDuJour, semainesEntieres, pastelPdf, fondPeriode, traitPeriode, stylePause,
  estBloquante, groupesDePeriodes, TRAIT_HORIZONTAL, SEPARATION_NOMS,
} from '../../../shared/planning/export/grilleExport'
import { scriptMiseEnPage, STYLE_FEUILLES, STYLE_APERCU } from '../../../shared/planning/export/miseEnPageExport'
import { nettoyerHtml, estVide } from '../../../shared/planning/export/texteRiche'
import {
  bandeEcheances, traitEcheance, traitsEcheancesLigneEntiere, exempleLegendeEcheance,
} from '../../../shared/planning/export/echeancesExport'

// ─── Densité des lignes ───────────────────────────────────────────────────────
//
// Reprend le réglage « Hauteur des lignes » de l'éditeur. `normal` reproduit
// exactement le rendu historique (6 mm par ligne) : seules les variantes
// compact et confort s'en écartent.
const DENSITY_CONFIG = {
  compact: { rowMm: 4.5, barPadMm: 0.5, labelPt: 6,   barLabelPt: 5.5, groupMm: 4.5, groupPt: 6.5, hdrPadMm: 0.5 },
  normal:  { rowMm: 6,   barPadMm: 1,   labelPt: 6.5, barLabelPt: 6.5, groupMm: 5.5, groupPt: 7,   hdrPadMm: 1 },
  confort: { rowMm: 9,   barPadMm: 1.5, labelPt: 8,   barLabelPt: 8,   groupMm: 8,   groupPt: 8.5, hdrPadMm: 1.5 },
}

function densityConfig(density) {
  return DENSITY_CONFIG[density] ?? DENSITY_CONFIG.normal
}

const WEEKEND_RATIO = 0.35
const LABEL_COL_MM = 45

// Longueur horizontale dans le tableau. En mise en page « une seule feuille »,
// la page élargit le tableau avant de le réduire : ses colonnes s'étirent,
// et une barre écrite en mm fixes ne les suivait plus (elle s'arrêtait au
// milieu de sa dernière semaine). Toutes les largeurs du tableau passent donc
// par le même facteur `--k`, que la mise en page règle (miseEnPageExport.js).
function mmK(x) {
  return `calc(${x.toFixed(2)}mm * var(--k, 1))`
}


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

// Les couleurs finissent dans des attributs style="…" : échappées elles aussi,
// une valeur contenant un guillemet sortirait de l'attribut.
function getBarColor(task, lot, zones, colorMode) {
  if (colorMode === 'zone') {
    const zone = zones.find(z => z.id === task.zone_id)
    return echapperHtml(zone?.couleur ?? '#C9C4C0')
  }
  return echapperHtml(lot?.couleur ?? '#94a3b8')
}

function getSegColor(seg, taskColor, zones) {
  if (seg.zone_id) {
    const zone = zones.find(z => z.id === seg.zone_id)
    if (zone?.couleur) return echapperHtml(zone.couleur)
  }
  return taskColor
}

// Les dates arrivent en 'YYYY-MM-DD', parfois suivies d'une heure
function dateSeule(valeur) {
  return parseDate(typeof valeur === 'string' ? valeur.split('T')[0] : valeur)
}

// Bornes calendaires d'une tâche, toutes incluses. Les fermetures bloquantes
// allongent la tâche comme ses délais : c'est ce que dessine l'écran, et c'est
// sur ces bornes que la modale choisit sa plage et filtre les tâches.
function bornesTache(task, periodes = []) {
  const debut = dateSeule(task.debut)
  const dernierJour = dernierJourTache(debut, task.duree, periodes)
  const avecDelaiAvant = !!task.appro_actif && task.appro_duree > 0
  const avecDelaiApres = task.delai_apres > 0
  const debutApres = avecDelaiApres ? addWorkingDaysBlocked(dernierJour, 1, periodes) : null
  return {
    debut,
    dernierJour,
    debutAvant: avecDelaiAvant ? addWorkingDaysBlocked(debut, -task.appro_duree, periodes) : null,
    debutApres,
    finApres: avecDelaiApres ? dernierJourTache(debutApres, task.delai_apres, periodes) : null,
  }
}

// Intervalles [debut, fin] (bornes incluses) qu'une tâche occupe sur le
// planning : la tâche avec ses délais avant/après, puis chacun de ses segments.
export function intervallesTache(task, segments = [], periodes = []) {
  const intervalles = []
  if (task?.debut) {
    const b = bornesTache(task, periodes)
    intervalles.push({ debut: b.debutAvant ?? b.debut, fin: b.finApres ?? b.dernierJour })
  }
  segments
    .filter(s => s.tache_id === task?.id && s.date_debut)
    .forEach(s => {
      const debut = dateSeule(s.date_debut)
      intervalles.push({ debut, fin: dernierJourTache(debut, s.duree_jours, periodes) })
    })
  return intervalles
}

// Regroupe des jours consécutifs par année/mois/semaine et rend un <th colspan="N">
// par groupe — un <th> par groupe SANS colspan ne mapperait qu'à une seule colonne
// du tableau (une par <col> du colgroup), ce qui écrase tous les groupes suivants
// dans les premières colonnes et laisse le reste de la ligne d'en-tête vide : c'est
// la cause du rendu « semaines entassées en début de tableau ».
function buildYearHeaders(days, granularite) {
  const years = []
  days.forEach((d) => {
    const y = moisDuJour(d, granularite).getFullYear()
    const last = years[years.length - 1]
    if (last && last.year === y) last.count++
    else years.push({ year: y, count: 1 })
  })
  return years.map(y =>
    `<th class="hdr-year" colspan="${y.count}">${y.year}</th>`
  ).join('')
}

function buildMonthHeaders(days, includeYear, granularite) {
  const months = []
  days.forEach((d) => {
    const mois = moisDuJour(d, granularite)
    const label = includeYear
      ? mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : mois.toLocaleDateString('fr-FR', { month: 'long' })
    const last = months[months.length - 1]
    if (last && last.label === label) last.count++
    else months.push({ label, count: 1, premier: d })
  })
  return months.map(m =>
    `<th class="hdr-month" colspan="${m.count}" style="border-left:${bordureGauche(niveauDuJour(m.premier, granularite), granularite)}">${m.label.charAt(0).toUpperCase() + m.label.slice(1)}</th>`
  ).join('')
}

function buildWeekHeaders(days, granularite) {
  const weeks = []
  days.forEach((d) => {
    const wn = getISOWeek(d)
    // Le lundi identifie la semaine : l'année civile coupait en deux la S1 ou
    // la S53 qui chevauche le nouvel an.
    const lundi = new Date(d)
    lundi.setDate(d.getDate() - (d.getDay() + 6) % 7)
    const wKey = formatDateISO(lundi)
    const last = weeks[weeks.length - 1]
    if (last && last.key === wKey) last.count++
    else weeks.push({ key: wKey, wn, count: 1, premier: d })
  })
  return weeks.map(w =>
    `<th class="hdr-week" colspan="${w.count}" style="border-left:${bordureGauche(niveauDuJour(w.premier, granularite), granularite)}">S${w.wn}</th>`
  ).join('')
}

// Période couvrant ce jour, sinon null. En cas de chevauchement, la bloquante
// l'emporte : son hachurage ne doit pas être masqué par un simple repère.
function periodeDuJour(day, periodes) {
  if (!day) return null
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

// Index d'une date dans `days`, liste de jours consécutifs à minuit : l'arrondi
// absorbe l'heure gagnée ou perdue au changement d'heure.
function indexJour(days, date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - days[0].getTime()) / 86400000)
}

// Portion visible d'un intervalle [debut, fin], bornes incluses : premier et
// dernier index affichés, et largeur (mm) cumulée. En vue Semaines,
// l'intervalle couvre des semaines entières, du lundi au dimanche, comme dans
// l'éditeur (`barreSemaine`) : une barre remplit les cases de ses semaines. La barre est un enfant du
// <td> de `startIdx`, positionnée en left:0 et débordant vers la droite grâce
// à overflow:visible. Un intervalle commencé avant la plage s'ancre sur le
// premier jour affiché : sans cela, une tâche en cours au début de l'export
// n'aurait aucune barre.
function plageVisible(days, dayWidths, debut, fin, granularite = 'day') {
  if (!days.length || !debut || !fin) return null
  if (granularite === 'week') ({ debut, fin } = semainesEntieres(debut, fin))
  const debutIdx = indexJour(days, debut)
  const finIdx = indexJour(days, fin)
  if (Number.isNaN(debutIdx) || Number.isNaN(finIdx)) return null
  const startIdx = Math.max(0, debutIdx)
  const endIdx = Math.min(days.length - 1, finIdx)
  if (endIdx < startIdx) return null
  let widthMm = 0
  for (let i = startIdx; i <= endIdx; i++) widthMm += dayWidths[i]
  return { startIdx, endIdx, widthMm }
}

// Barre d'une tâche ou d'un segment : la durée est en jours ouvrés, fermetures
// bloquantes non comptées, et la barre s'arrête sur le dernier jour travaillé —
// ni avant une fermeture qu'elle traverse, ni sur le week-end qui suit.
function computeBarGeometry(days, dayWidths, debut, duree, periodes = [], granularite = 'day') {
  const d = dateSeule(debut)
  return plageVisible(days, dayWidths, d, dernierJourTache(d, duree, periodes), granularite)
}

// ─── Bande de jalons ──────────────────────────────────────────────────────────
//
// Les jalons occupent une zone dédiée au-dessus du tableau plutôt que d'être
// répétés sur chaque ligne de tâche : un seul libellé par jalon, décalé
// verticalement quand deux jalons sont trop proches. Une fine ligne verticale
// reste tracée dans les lignes du tableau comme repère de lecture (cf.
// buildTaskRow), mais sans texte.
//
// Les positions sont en pourcentage de la largeur du tableau (colonne de
// libellés + colonnes de jours) : les colonnes s'étirent quand le tableau est
// plus large que leur somme (mise en page sur une feuille), une position en
// mm ne les suivait pas et la flèche se décalait de son trait.
const COULEUR_ECHEANCE = '#E8602C'

// Échéances de la plage, avec la position (mm) du milieu de leur jour
function placesEcheances(jalons, days, dayWidths) {
  return (jalons ?? [])
    .map((jalon) => {
      const dayStr = (jalon.date ?? '').split('T')[0]
      const idx = days.findIndex((d) => formatDateISO(d) === dayStr)
      if (idx < 0) return null
      let x = LABEL_COL_MM
      for (let i = 0; i < idx; i++) x += dayWidths[i]
      return { jalon, x: x + dayWidths[idx] / 2 }
    })
    .filter(Boolean)
}

// Bandeau qui nomme les périodes, sous les en-têtes de dates : une cellule
// par période, à sa couleur, avec son libellé
// Le bandeau est coupé à chaque début de mois : la ligne de mois le traverse
// et fait le lien entre les en-têtes et les lignes de tâches.
function buildBandePeriodes(days, periodes, granularite) {
  const parJour = days.map(d => periodeDuJour(d, periodes))
  if (!parJour.some(Boolean)) return ''
  const debutsDeMois = days.map(d => niveauDuJour(d, granularite) === 'mois')
  const cellules = groupesDePeriodes(parJour, debutsDeMois).map(({ periode, debut, nombre, premier }) => {
    const trait = `border-left:${bordureGauche(niveauDuJour(days[debut], granularite), granularite)};`
    if (!periode) return `<th class="hdr-periode" colspan="${nombre}" style="${trait}"></th>`
    const couleur = echapperHtml(pastelPdf(periode.couleur ?? '#B8412C', 1))
    // Le libellé n'est écrit qu'une fois, au début de la période ; il peut
    // déborder sur le morceau suivant, d'où le z-index
    const libelle = premier ? echapperHtml(periode.label ?? periode.nom ?? '') : ''
    return `<th class="hdr-periode" colspan="${nombre}" style="${trait}background:${fondPeriode(periode)};color:${couleur};${libelle ? 'z-index:1;' : ''}">${libelle}</th>`
  }).join('')
  return `<tr><th class="plabel" style="background:#FAFAF9;font-size:5.5pt;color:#9C9591;text-align:center">Périodes</th>${cellules}</tr>`
}

function buildDayHeaders(days, dayWidths, todayStr) {
  return days.map((d, i) => {
    const isWE = isWeekend(d)
    const isToday = formatDateISO(d) === todayStr
    const label = d.toLocaleDateString('fr-FR', { weekday: 'narrow' })
    const bg = isToday ? 'rgba(232,96,44,0.10)' : isWE ? 'rgba(0,0,0,0.04)' : 'transparent'
    const color = isToday ? '#E8602C' : isWE ? 'rgba(155,143,133,0.5)' : '#9C9591'
    const borderLeft = bordureGauche(niveauDuJour(d), 'day')
    return `<th class="hdr-day" style="width:${mmK(dayWidths[i])};background:${bg};color:${color};border-left:${borderLeft}">${dayWidths[i] >= 2.5 ? label : ''}</th>`
  }).join('')
}

// Portions d'une barre qui traversent une période bloquante : la barre
// continue, mais ces jours ne comptent pas — on y laisse voir la période
function pausesBarre(geo, couleur, { days, dayWidths, periodes, dens }) {
  let html = ''
  let i = geo.startIdx
  while (i <= geo.endIdx) {
    const p = periodeDuJour(days[i], periodes)
    if (!p || !estBloquante(p)) { i++; continue }
    let fin = i
    while (fin + 1 <= geo.endIdx && periodeDuJour(days[fin + 1], periodes) === p) fin++
    let gauche = 0
    for (let k = geo.startIdx; k < i; k++) gauche += dayWidths[k]
    let largeur = 0
    for (let k = i; k <= fin; k++) largeur += dayWidths[k]
    html += `<div data-pause="1" style="position:absolute;left:${mmK(gauche)};width:${mmK(largeur)};top:${dens.barPadMm}mm;bottom:${dens.barPadMm}mm;${stylePause(couleur, p)}z-index:6;pointer-events:none"></div>`
    i = fin + 1
  }
  return html
}

// Cases de jour d'une ligne (tâche ou résumé) : grille, fond des périodes,
// trait des échéances, et ce que la ligne pose dans chaque case (`parJour`).
function cellulesLigne(parJour, { days, dayWidths, jalons, periodes, granularite, dens }) {
  // Fond des périodes : un seul bloc par période et par ligne, posé sous la
  // grille et les barres (z-index négatif). Un fond par cellule laissait voir
  // un fil clair entre deux jours à l'écran (chaque bord adouci séparément).
  const fonds = new Map()
  groupesDePeriodes(days.map(d => periodeDuJour(d, periodes))).forEach(({ periode, debut, nombre }) => {
    if (!periode) return
    let largeur = 0
    for (let k = debut; k < debut + nombre; k++) largeur += dayWidths[k]
    // Le trait est calé sur les dates réelles de la période : une période qui
    // déborde de la plage imprimée continue hors cadre et ne s'y ferme pas
    let bords = ''
    if (estBloquante(periode)) {
      const trait = echapperHtml(traitPeriode(periode))
      if (formatDateISO(days[debut]) === periode.date_debut) bords += `border-left:${trait};`
      if (formatDateISO(days[debut + nombre - 1]) === periode.date_fin) bords += `border-right:${trait};`
    }
    fonds.set(debut, `<div data-periode="1" style="position:absolute;left:0;top:0;bottom:0;width:${mmK(largeur)};background:${fondPeriode(periode)};${bords}box-sizing:border-box;z-index:-1;pointer-events:none"></div>`)
  })

  return days.map((d, idx) => {
    // Le grisé du week-end n'a de sens que là où les jours se lisent
    const isWE = granularite === 'day' && isWeekend(d)
    const borderLeft = bordureGauche(niveauDuJour(d, granularite), granularite)
    const bg = isWE ? 'rgba(0,0,0,0.03)' : 'transparent'

    // Repère vertical du jalon, sans libellé : celui-ci est rendu une seule fois
    // dans la bande dédiée au-dessus du tableau (bandeEcheances).
    const dayStr = formatDateISO(d)
    const jalonLines = (jalons ?? [])
      .filter(j => (j.date ?? '').split('T')[0] === dayStr)
      .map(j => traitEcheance(j.couleur ?? COULEUR_ECHEANCE))
      .join('')

    return `<td style="width:${mmK(dayWidths[idx])};border-bottom:${TRAIT_HORIZONTAL};border-left:${borderLeft};height:${dens.rowMm}mm;padding:0;overflow:visible;position:relative;background:${bg}">${fonds.get(idx) ?? ''}${parJour.get(idx) ?? ''}${jalonLines}</td>`
  }).join('')
}

// Ligne du mode Résumé : un morceau par période d'activité du lot (ou de la
// zone), calculé par `resumePlanning` comme à l'écran. Chaque morceau se
// dessine comme une barre de tâche (semaines entières en vue Semaines,
// pauses sur les fermetures) ; nom et avancement après le dernier.
function buildResumeRow(ligne, days, dayWidths, jalons, ctx) {
  const { periodes = [], density, granularite = 'day' } = ctx ?? {}
  const dens = densityConfig(density)
  const couleur = echapperHtml(ligne.couleur)
  const parJour = new Map()
  const ajouter = (idx, html) => parJour.set(idx, (parJour.get(idx) ?? '') + html)
  // Arrondis à la semaine, deux morceaux proches se touchent : un seul alors,
  // pour que le nom du lot ne s'écrive pas dans le morceau suivant
  const visibles = []
  ligne.morceaux
    .map(m => plageVisible(days, dayWidths, m.debut, m.fin, granularite))
    .filter(g => g && g.widthMm > 0)
    .forEach(g => {
      const prec = visibles[visibles.length - 1]
      if (prec && g.startIdx <= prec.endIdx + 1) {
        prec.endIdx = Math.max(prec.endIdx, g.endIdx)
        prec.widthMm = 0
        for (let k = prec.startIdx; k <= prec.endIdx; k++) prec.widthMm += dayWidths[k]
      } else {
        visibles.push({ ...g })
      }
    })
  visibles.forEach((geo, i) => {
    let html = `<div data-type="resume" style="position:absolute;left:0;width:${mmK(geo.widthMm)};top:${dens.barPadMm}mm;bottom:${dens.barPadMm}mm;background:${couleur};z-index:4"></div>${pausesBarre(geo, couleur, { days, dayWidths, periodes, dens })}`
    if (i === visibles.length - 1) {
      const avancement = ligne.avancement > 0
        ? `<span style="margin-left:1.5mm;font-size:5.5pt;font-weight:normal;color:#9C9591">${ligne.avancement} %</span>`
        : ''
      html += `<div style="position:absolute;left:${mmK(geo.widthMm)};padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:${dens.barLabelPt}pt;font-weight:bold;color:#1F1B17;z-index:10">${echapperHtml(ligne.nom)}${avancement}</div>`
    }
    ajouter(geo.startIdx, html)
  })
  const cells = cellulesLigne(parJour, { days, dayWidths, jalons, periodes, granularite, dens })
  const numero = ligne.numero ? `<span style="color:#9C9591;margin-right:1.5mm">${echapperHtml(ligne.numero)}</span>` : ''
  return `<tr>
    <td class="plabel" style="font-weight:bold;background:${couleur}12"><span style="display:inline-block;width:2.2mm;height:2.2mm;background:${couleur};margin-right:1.5mm;vertical-align:middle"></span>${numero}${echapperHtml(ligne.nom)}<span style="float:right;font-weight:normal;color:#5E5854">${ligne.avancement} %</span></td>
    ${cells}
  </tr>`
}

function buildTaskRow(task, color, days, dayWidths, jalons, todayStr, ctx, rowInfo) {
  const { segments = [], periodes = [], zones = [], density, granularite = 'day' } = ctx ?? {}
  const dens = densityConfig(density)
  // En groupement par zone, une tâche peut n'apparaître que par ses segments
  // (ligne dupliquée) : `showMainBar` et `visibleSegmentIds` viennent alors de
  // buildRowsByZone, la même source que la timeline interactive.
  const showMainBar = rowInfo?.showMainBar !== false
  const visibleSegmentIds = rowInfo?.visibleSegmentIds ?? null
  const labelLigne = echapperHtml(rowInfo?.displayName ?? task.nom)

  const bornes = task.debut ? bornesTache(task, periodes) : null

  // Chaque élément est un enfant du <td> de son premier jour visible, et non de
  // celui du début de la tâche : un délai ou un segment reste dessiné même quand
  // la barre principale sort de la plage exportée.
  const parJour = new Map()
  const ajouter = (idx, html) => parJour.set(idx, (parJour.get(idx) ?? '') + html)

  // Délais avant / après : mêmes hachures à 45° et même hauteur que la barre de
  // tâche (top/bottom 1mm), comme dans la timeline interactive.
  const fondDelai = `repeating-linear-gradient(45deg, ${color}28, ${color}28 4px, ${color}55 4px, ${color}55 8px)`

  if (showMainBar && bornes?.debutAvant) {
    const veille = new Date(bornes.debut)
    veille.setDate(veille.getDate() - 1)
    const geoAvant = plageVisible(days, dayWidths, bornes.debutAvant, veille, granularite)
    if (geoAvant && geoAvant.widthMm > 0) {
      // Motif à l'intérieur de la barre, aligné à gauche et tronqué si trop long
      const lbl = echapperHtml(task.appro_materiau || `Appro. ${task.appro_duree}j`)
      ajouter(geoAvant.startIdx, `<div style="position:absolute;left:0;width:${mmK(geoAvant.widthMm)};top:${dens.barPadMm}mm;bottom:${dens.barPadMm}mm;background:${fondDelai};border:1px dashed ${color}80;display:flex;align-items:center;overflow:hidden;z-index:3;pointer-events:none">
        <span style="font-size:5pt;font-style:italic;color:${color};filter:brightness(0.6);white-space:nowrap;overflow:hidden;padding:0 1mm">${lbl}</span>
      </div>`)
    }
  }

  // Délai après la tâche (séchage, livraison…) : il reprend au jour ouvré qui
  // suit la tâche ; motif écrit à l'extérieur, même convention que le nom d'une tâche.
  if (showMainBar && bornes?.debutApres) {
    const geoApres = plageVisible(days, dayWidths, bornes.debutApres, bornes.finApres, granularite)
    if (geoApres && geoApres.widthMm > 0) {
      let html = `<div style="position:absolute;left:0;width:${mmK(geoApres.widthMm)};top:${dens.barPadMm}mm;bottom:${dens.barPadMm}mm;background:${fondDelai};border:1px dashed ${color}80;z-index:3;pointer-events:none"></div>`
      if (task.label_apres) {
        html += `<div style="position:absolute;left:${mmK(geoApres.widthMm)};padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:5.5pt;font-style:italic;color:#9C9591;z-index:10">${echapperHtml(task.label_apres)}</div>`
      }
      ajouter(geoApres.startIdx, html)
    }
  }

  const pauses = (geo, couleur) => pausesBarre(geo, couleur, { days, dayWidths, periodes, dens })

  const mainGeo = showMainBar && bornes
    ? plageVisible(days, dayWidths, bornes.debut, bornes.dernierJour, granularite)
    : null
  if (mainGeo && mainGeo.widthMm > 0) {
    const avancement = Number(task.avancement) || 0
    const progressBar = avancement > 0
      ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${avancement}%;background:rgba(0,0,0,0.22);z-index:2"></div>`
      : ''
    const labelAvancement = avancement > 0 && avancement < 100
      ? `<span style="margin-left:1.5mm;font-size:5.5pt;color:#9C9591">${avancement}%</span>`
      : ''
    ajouter(mainGeo.startIdx, `
        <div data-task-id="${echapperHtml(task.id)}" data-type="task" style="position:absolute;left:0;width:${mmK(mainGeo.widthMm)};top:${dens.barPadMm}mm;bottom:${dens.barPadMm}mm;background:${color};z-index:4;overflow:hidden">${progressBar}</div>${pauses(mainGeo, color)}
        <div style="position:absolute;left:${mmK(mainGeo.widthMm)};padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:${dens.barLabelPt}pt;color:#1F1B17;z-index:10">${labelLigne}${labelAvancement}</div>`)
  }

  // Segments supplémentaires : le nom n'est écrit que si « afficher le nom » est
  // coché, à droite du segment — la règle de la timeline interactive.
  segments
    .filter(s => s.tache_id === task.id && s.date_debut)
    .filter(s => !visibleSegmentIds || visibleSegmentIds.includes(s.id))
    .forEach(seg => {
      const geo = computeBarGeometry(days, dayWidths, seg.date_debut, seg.duree_jours, periodes, granularite)
      if (!geo || geo.widthMm <= 0) return
      const segColor = getSegColor(seg, color, zones)
      let html = `<div data-segment-id="${echapperHtml(seg.id)}" data-task-id="${echapperHtml(task.id)}" data-type="segment" style="position:absolute;left:0;width:${mmK(geo.widthMm)};top:${dens.barPadMm}mm;bottom:${dens.barPadMm}mm;background:${segColor};outline:1px dashed rgba(255,255,255,0.6);outline-offset:-1px;z-index:3;overflow:hidden"></div>${pauses(geo, segColor)}`
      if (seg.afficher_nom) {
        html += `<div style="position:absolute;left:${mmK(geo.widthMm)};padding-left:3px;top:0;bottom:0;display:flex;align-items:center;white-space:nowrap;font-size:5.5pt;color:#1F1B17;z-index:10">${echapperHtml(seg.nom ?? task.nom)}</div>`
      }
      ajouter(geo.startIdx, html)
    })

  const cells = cellulesLigne(parJour, { days, dayWidths, jalons, periodes, granularite, dens })

  const suffixe = rowInfo?.suffixe
    ? `<span style="color:#9C9591;font-size:5.5pt;margin-left:1.5mm">${echapperHtml(rowInfo.suffixe)}</span>`
    : ''

  return `<tr>
    <td class="plabel">${task.num_tache ? `<span style="color:#9C9591;margin-right:1.5mm">${echapperHtml(task.num_tache)}</span>` : ''}${labelLigne}${suffixe}</td>
    ${cells}
  </tr>`
}

function buildHtml({
  tasks, lots, jalons, affaire, dateDebut, dateFin, largeurMm, hauteurMm,
  headerDateDebut, headerDateFin,
  zones = [], colorMode = 'lot', viewMode = 'day',
  segments = [], dependances = [], periodes = [], showDependances = true,
  groupMode = 'lot', density = 'normal',
  texteEntete = '', textePied = '', apercu = false, uneFeuille = true,
  resume = false,
}) {
  const dens = densityConfig(density)
  const dStart = parseDate(dateDebut)
  const dEnd = parseDate(dateFin)
  const days = buildDaysList(dStart, dEnd)

  const contentMm = largeurMm - 20 - LABEL_COL_MM
  const dayWidths = computeDayWidths(days, contentMm, viewMode)
  const todayStr = formatDateISO(new Date())
  const rowCtx = { segments, periodes, zones, density, granularite: viewMode }
  const entete = estVide(texteEntete) ? '' : nettoyerHtml(texteEntete)
  const pied = estVide(textePied) ? '' : nettoyerHtml(textePied)

  // Chemins critiques : deux sources, comme dans la timeline interactive — les
  // dépendances tâche→tâche historiques (`depends_on`) et la table étendue
  // `planning_dependances` (qui peut impliquer des segments). Fusionnées ici pour
  // que le script de rendu des flèches n'ait qu'une seule liste à parcourir.
  const legacyDeps = tasks
    .filter(t => t.depends_on != null)
    .map(t => ({ source_tache_id: t.depends_on, cible_tache_id: t.id }))
  // Option « Afficher les chemins critiques » : sans elle, aucune dépendance
  // n'est transmise au script de rendu, qui ne trace donc aucune flèche.
  // En résumé, plus de tâches visibles : plus de flèches entre elles
  const avecDependances = showDependances && !resume
  const allDeps = avecDependances ? [...legacyDeps, ...dependances] : []
  // Échappe "</" pour ne pas fermer prématurément le <script> hôte si un champ
  // texte venait à contenir cette séquence.
  const depsJson = JSON.stringify(allDeps).replace(/</g, '\\u003c')

  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const nomAffaire  = echapperHtml(affaire?.nom)
  const moaNom      = echapperHtml(affaire?.moa_nom)
  const codeAffaire = echapperHtml(affaire?.code_affaire ?? affaire?.numero)
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  // L'en-tête peut annoncer une période distincte de la plage imprimée
  // (dates contractuelles, par exemple) ; à défaut, il reprend la plage.
  const formatDateHeader = (dateStr, fallback) => {
    const d = dateStr ? parseDate(dateStr) : fallback
    return Number.isNaN(d?.getTime?.())
      ? fallback.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  }
  const periodeStr = `${formatDateHeader(headerDateDebut, dStart)} → ${formatDateHeader(headerDateFin, dEnd)}`

  // Granularité :
  //  - vue jour   : Mois (avec année) / Semaine / Jours — 3 niveaux
  //  - vue semaine: Année / Mois / Semaines — 3 niveaux
  //  - vue mois   : Année / Mois — 2 niveaux
  const showYearRow = viewMode !== 'day'
  const showWeekRow = viewMode !== 'month'
  const showDayRow = viewMode === 'day'
  const yearHeaders  = showYearRow ? buildYearHeaders(days, viewMode) : ''
  const monthHeaders = buildMonthHeaders(days, !showYearRow, viewMode)
  const weekHeaders  = showWeekRow ? buildWeekHeaders(days, viewMode) : ''
  const bandePeriodes = buildBandePeriodes(days, periodes, viewMode)
  const dayHeaders   = showDayRow ? buildDayHeaders(days, dayWidths, todayStr) : ''

  // Échéances : étiquettes dans la bande au-dessus du tableau, traits dans
  // les lignes. Une ligne de titre (lot, zone) couvre tout le tableau : elle
  // reçoit les traits à part, sous son texte.
  const echeances = placesEcheances(jalons, days, dayWidths)
  const largeurTableauMm = LABEL_COL_MM + dayWidths.reduce((a, b) => a + b, 0)
  const traitsTitre = traitsEcheancesLigneEntiere(echeances, largeurTableauMm, COULEUR_ECHEANCE)
  const titreLigne = (texte) => `<span style="position:relative;z-index:10">${texte}</span>${traitsTitre}`

  // ── Corps du tableau : groupé par lot (défaut) ou par zone ──
  let lotsRows = ''
  // Résumé : une ligne par lot, ou par zone si le planning est groupé par zone
  const groupeResume = groupMode === 'zone' && zones.length > 0 ? 'zone' : 'lot'

  if (resume) {
    resumePlanning({ tasks, segments, lots, zones, periodes, groupMode: groupeResume })
      .forEach(ligne => { lotsRows += buildResumeRow(ligne, days, dayWidths, jalons, rowCtx) })
  } else if (groupMode === 'zone') {
    // Mêmes lignes que la vue « Par zone » de l'éditeur : une tâche peut
    // apparaître dans plusieurs zones — une fois avec sa barre principale, une
    // fois par ses seuls segments.
    buildRowsByZone(tasks, zones, segments).forEach(row => {
      if (row.type === 'header-zone') {
        const couleur = echapperHtml(row.couleur ?? '#C9C4C0')
        lotsRows += `<tr>
          <td colspan="${1 + days.length}" style="position:relative;background:${couleur}18;color:${couleur};font-weight:bold;font-size:${dens.groupPt}pt;padding:0 2mm;height:${dens.groupMm}mm;border-bottom:${TRAIT_HORIZONTAL}">
            ${titreLigne(echapperHtml((row.displayName ?? '').toUpperCase()))}
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
      const couleurLot = echapperHtml(lot.couleur)
      lotsRows += `<tr>
        <td colspan="${1 + days.length}" style="position:relative;background:${couleurLot}18;color:${couleurLot};font-weight:bold;font-size:${dens.groupPt}pt;padding:0 2mm;height:${dens.groupMm}mm;border-bottom:${TRAIT_HORIZONTAL}">
          ${titreLigne(`${echapperHtml(lot.num_lot)} – ${echapperHtml(lot.nom)}`)}
        </td>
      </tr>`
      lotTasks.forEach(t => { lotsRows += buildTaskRow(t, getBarColor(t, lot, zones, colorMode), days, dayWidths, jalons, todayStr, rowCtx) })
    })
    const unassigned = tasks.filter(t => t.lot_id == null)
    if (unassigned.length > 0) {
      lotsRows += `<tr><td colspan="${1 + days.length}" style="position:relative;color:#9C9591;font-weight:bold;font-size:${dens.groupPt}pt;padding:0 2mm;height:${dens.groupMm}mm;border-bottom:${TRAIT_HORIZONTAL}">${titreLigne('Sans lot')}</td></tr>`
      unassigned.forEach(t => { lotsRows += buildTaskRow(t, getBarColor(t, null, zones, colorMode), days, dayWidths, jalons, todayStr, rowCtx) })
    }
  }

  // Légende : d'abord celle de l'écran (source commune avec l'export Excel),
  // puis les conventions de dessin utiles au lecteur du papier
  // En résumé, la couleur d'une barre est celle de son lot ou de sa zone
  const legCouleurs = resume
    ? { ...legendeCouleurs({ lots, zones, colorMode: groupeResume, groupMode: 'lot' }), note: `Résumé : une barre par ${groupeResume}, sur ses périodes d’activité` }
    : legendeCouleurs({ lots, zones, colorMode, groupMode })
  const legCouleursHtml = legCouleurs.entrees.length
    ? `<span class="leg-sous-titre">${echapperHtml(legCouleurs.titre)}</span>` + legCouleurs.entrees.map(e => `
  <div class="leg-item">
    <div class="leg-swatch" style="background:${echapperHtml(e.couleur)}"></div>
    ${echapperHtml(e.label)}
  </div>`).join('') + '<div class="leg-sep"></div>'
    : ''
  const legNoteHtml = legCouleurs.note
    ? `<div class="leg-item" style="font-style:italic;color:#9C9591">${echapperHtml(legCouleurs.note)}</div>`
    : ''
  const exemplePeriode = { couleur: '#B8412C' }
  const titreColonne = resume ? (groupeResume === 'zone' ? 'Zones' : 'Lots') : 'Tâches'

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
  .header-right { text-align: right; flex-shrink: 0; }
  .texte-entete { flex: 1; min-width: 0; margin: 0 8mm; font-size: 8.5pt; color: #1F1B17; line-height: 1.45; }
  .texte-pied { margin-top: 4mm; font-size: 8.5pt; color: #1F1B17; line-height: 1.45; }
  .texte-entete ul, .texte-entete ol, .texte-pied ul, .texte-pied ol { padding-left: 5mm; }
  .texte-entete p, .texte-pied p { margin: 0 0 1mm; }
  .header-title { font-size: 12pt; font-weight: bold; color: #1F1B17; margin-bottom: 2mm; }
  .header-sub { font-size: 7.5pt; color: #5E5854; line-height: 1.6; }
  .header-period { font-size: 7.5pt; color: #E8602C; font-weight: bold; margin-top: 1mm; }

  .gantt-wrap { position: relative; width: 100%; transform-origin: top left; border: 1px solid #1F1B17; }
  .gantt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .gantt-table thead tr:first-child th:first-child { border-top: none; border-left: none; }
  .gantt-table thead tr:first-child th:last-child  { border-top: none; border-right: none; }
  .gantt-table tbody tr:last-child td:first-child   { border-bottom: none; border-left: none; }
  .gantt-table tbody tr:last-child td:last-child    { border-bottom: none; border-right: none; }

  .col-label { width: ${mmK(LABEL_COL_MM)}; min-width: ${mmK(LABEL_COL_MM)}; }

  .hdr-year  { background: #F5F2F0; font-size: ${dens.groupPt}pt; font-weight: bold; color: #1F1B17; text-align: center; border: 0.5px solid #ddd; padding: ${dens.hdrPadMm}mm 0; }
  .hdr-month { background: #FAF7F2; font-size: ${dens.labelPt}pt; font-weight: bold; color: #E8602C; text-align: center; border: 0.5px solid #ddd; padding: ${dens.hdrPadMm}mm 0; }
  .hdr-week  { background: #FAFAF9; font-size: ${(dens.labelPt - 1).toFixed(1)}pt; color: #9C9591; text-align: center; border: 0.5px solid #ddd; padding: ${(dens.hdrPadMm * 0.6).toFixed(2)}mm 0; }
  .hdr-periode { font-size: ${(dens.labelPt - 1).toFixed(1)}pt; font-weight: bold; text-align: left; white-space: nowrap; overflow: visible; position: relative; padding: ${(dens.hdrPadMm * 0.6).toFixed(2)}mm 1mm; border-bottom: 0.5px solid #ddd; }
  .hdr-day   { font-size: ${(dens.labelPt - 1.5).toFixed(1)}pt; text-align: center; border-bottom: 0.5px solid #ddd; padding: ${(dens.hdrPadMm * 0.5).toFixed(2)}mm 0; }

  .plabel { width: ${mmK(LABEL_COL_MM)}; border: 0.5px solid #eee; border-bottom: ${TRAIT_HORIZONTAL}; border-right: ${SEPARATION_NOMS}; padding: 0 1.5mm; vertical-align: middle; overflow: hidden; white-space: nowrap; height: ${dens.rowMm}mm; font-size: ${dens.labelPt}pt; color: #1F1B17; }

  .legend { margin-top: 5mm; padding-top: 3mm; border-top: 0.5px solid #eee; display: flex; align-items: center; gap: 5mm; flex-wrap: wrap; }
  .leg-title { font-size: 5.5pt; font-weight: bold; color: #9C9591; text-transform: uppercase; letter-spacing: 0.05em; }
  .leg-item { display: flex; align-items: center; gap: 1.5mm; font-size: 6pt; color: #4b5563; }
  .leg-sous-titre { font-size: 6pt; font-weight: bold; color: #9C9591; text-transform: uppercase; letter-spacing: 0.04em; }
  .leg-swatch { width: 8mm; height: 3mm; box-sizing: border-box; }
  .leg-sep { border-left: 0.5px solid #ddd; height: 8px; margin: 0 2mm; }

  .footer { margin-top: 4mm; padding-top: 2mm; border-top: 0.5px solid #eee; font-size: 6pt; color: #9C9591; display: flex; justify-content: space-between; }
  ${STYLE_FEUILLES}
  ${apercu ? STYLE_APERCU : ''}
</style>
</head>
<body>

<div class="header">
  <img src="${logoUrl}" class="logo" alt="JGA" onerror="this.style.display='none'" />
  ${entete ? `<div class="texte-entete">${entete}</div>` : ''}
  <div class="header-right">
    <div class="header-title">Planning de chantier — ${nomAffaire}</div>
    <div class="header-sub">
      ${moaNom ? `Maître d'ouvrage : ${moaNom}<br>` : ''}
      Référence : ${codeAffaire}
    </div>
    <div class="header-period">${periodeStr}</div>
    ${resume ? `<div class="header-sub" style="margin-top:1mm">Résumé : une barre par ${groupeResume}</div>` : ''}
  </div>
</div>

<div class="gantt-wrap" id="gw">
  ${bandeEcheances(echeances, largeurTableauMm, COULEUR_ECHEANCE)}
  <table class="gantt-table" id="gantt-table" data-largeur-mm="${(LABEL_COL_MM + dayWidths.reduce((a, b) => a + b, 0)).toFixed(2)}">
    <colgroup>
      <col class="col-label">
      ${days.map((_, i) => `<col style="width:${mmK(dayWidths[i])}">`).join('')}
    </colgroup>
    <thead>
      ${showYearRow ? `<tr>
        <th class="plabel" style="background:#F5F2F0;font-size:6pt;color:#9C9591;text-align:center">${titreColonne}</th>
        ${yearHeaders}
      </tr>` : ''}
      <tr>
        <th class="plabel" style="background:#FAF7F2;font-size:6pt;color:#9C9591;text-align:center">${showYearRow ? '' : titreColonne}</th>
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
      ${bandePeriodes}
    </thead>
    <tbody>${lotsRows}</tbody>
  </table>

  <!-- Overlay SVG des flèches de chemin critique — positionné/dimensionné en JS
       une fois le tableau rendu (cf. dessinerFleches), exactement comme dans la
       timeline interactive (mêmes courbes de Bézier, mêmes marqueurs). -->
  <svg id="arrows-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible"></svg>
</div>

<script id="deps-data" type="application/json">${depsJson}</script>

${pied ? `<div class="texte-pied">${pied}</div>` : ''}

<div class="legend">
  <span class="leg-title">Légende</span>
  ${legCouleursHtml}
  <span class="leg-sous-titre">Conventions</span>
  ${resume ? '' : `<div class="leg-item">
    <div class="leg-swatch" style="background:#9C9591;position:relative;overflow:hidden"><div style="position:absolute;left:0;top:0;bottom:0;width:45%;background:rgba(0,0,0,0.22)"></div></div>
    Avancement
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:repeating-linear-gradient(45deg, #9C959128, #9C959128 4px, #9C959155 4px, #9C959155 8px);border:1px dashed #9C959180"></div>
    Délai avant / après
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:#C9C4C0;outline:1px dashed rgba(255,255,255,0.6);outline-offset:-1px"></div>
    Segment
  </div>`}
  <div class="leg-item">
    <div class="leg-swatch" style="background:${fondPeriode(exemplePeriode)};border-left:${traitPeriode(exemplePeriode)};border-right:${traitPeriode(exemplePeriode)}"></div>
    Période bloquante
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="background:${fondPeriode({ ...exemplePeriode, est_bloquante: false })}"></div>
    Période informative
  </div>
  <div class="leg-item">
    <div class="leg-swatch" style="${stylePause('#5E5854', exemplePeriode)}"></div>
    ${resume ? 'En pause pendant une période (jours non comptés)' : 'Tâche en pause pendant une période (jours non comptés)'}
  </div>
  ${avecDependances ? `<div class="leg-item">
    <svg width="10mm" height="4mm" viewBox="0 0 38 16" style="overflow:visible">
      <path d="M 0 8 C 15 8, 23 8, 34 8" fill="none" stroke="#e4702a" stroke-width="2" stroke-dasharray="6 3" stroke-opacity="0.85" />
      <path d="M34,8 L28,4 L28,12 z" fill="#e4702a" />
    </svg>
    Dépendance (chemin critique)
  </div>` : ''}
  <div class="leg-item">
    ${exempleLegendeEcheance(COULEUR_ECHEANCE)}
    Échéance
  </div>
  ${legNoteHtml}
</div>

<div class="footer">
  <span>JGA Architectures</span>
  <span>Document généré le ${dateStr} · Planning de chantier ${nomAffaire}</span>
</div>

<script>
// Flèches de chemin critique de chaque bloc de planning (un par feuille),
// mesurées avant toute réduction : la réduction s'applique au bloc entier,
// flèches comprises, qui restent donc alignées. Mêmes courbes de Bézier et
// mêmes marqueurs que la timeline interactive. Une dépendance coupée par un
// saut de feuille part vers le bas de la sienne et reprend en haut de la
// suivante.
function dessinerFleches(blocs) {
  var depsDataEl = document.getElementById('deps-data');
  var deps = depsDataEl ? JSON.parse(depsDataEl.textContent) : [];
  if (!deps.length) return;
  var NS = 'http://www.w3.org/2000/svg';

  var places = {};
  blocs.forEach(function (b, k) {
    var tableRect = b.table.getBoundingClientRect();
    var barEls = b.table.querySelectorAll('[data-task-id], [data-segment-id]');
    for (var i = 0; i < barEls.length; i++) {
      var el = barEls[i];
      var rect = el.getBoundingClientRect();
      var key = el.dataset.segmentId ? el.dataset.segmentId : ('task:' + el.dataset.taskId);
      // Ne garder que la barre principale (type=task) pour les clés tâche —
      // les segments ont leur propre clé (segmentId), donc pas de collision.
      if (!places[key] || el.dataset.type === 'task') {
        places[key] = {
          bloc: k,
          left: rect.left - tableRect.left,
          right: rect.right - tableRect.left,
          centerY: rect.top - tableRect.top + rect.height / 2,
        };
      }
    }
  });

  blocs.forEach(function (b, k) {
    var svg = b.svg;
    if (!svg) return;
    // Origine et hauteur du SVG alignées sur le tableau : il est posé dans le
    // bloc, qui commence plus haut (bande des échéances)
    svg.style.top = b.table.offsetTop + 'px';
    svg.setAttribute('height', b.table.offsetHeight);
    svg.style.height = b.table.offsetHeight + 'px';

    var idMarqueur = 'pdf-dep-arrow-' + k;
    var defs = document.createElementNS(NS, 'defs');
    var marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', idMarqueur);
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

    function courbe(x1, y1, x2, y2, pointe, depart) {
      var ctrl = Math.max(50, Math.abs(x2 - x1) * 0.45);
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + ctrl) + ' ' + y1 + ', ' + (x2 - ctrl) + ' ' + y2 + ', ' + x2 + ' ' + y2);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#e4702a');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '6 3');
      path.setAttribute('stroke-opacity', '0.85');
      if (pointe) path.setAttribute('marker-end', 'url(#' + idMarqueur + ')');
      svg.appendChild(path);
      if (depart) {
        var circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', x1);
        circle.setAttribute('cy', y1);
        circle.setAttribute('r', '3.5');
        circle.setAttribute('fill', '#e4702a');
        circle.setAttribute('fill-opacity', '0.85');
        svg.appendChild(circle);
      }
    }

    var bas = b.table.offsetHeight;
    var haut = b.table.tHead ? b.table.tHead.offsetHeight : 0;
    for (var j = 0; j < deps.length; j++) {
      var dep = deps[j];
      var src = places[dep.source_segment_id ? dep.source_segment_id : ('task:' + dep.source_tache_id)];
      var tgt = places[dep.cible_segment_id ? dep.cible_segment_id : ('task:' + dep.cible_tache_id)];
      if (!src || !tgt) continue;
      if (src.bloc === k && tgt.bloc === k) courbe(src.right, src.centerY, tgt.left, tgt.centerY, true, true);
      else if (src.bloc === k && tgt.bloc > k) courbe(src.right, src.centerY, tgt.left, bas, false, true);
      else if (tgt.bloc === k && src.bloc < k) courbe(src.right, haut, tgt.left, tgt.centerY, true, false);
    }
  });
}
${scriptMiseEnPage({ largeurMm, hauteurMm, uneFeuille, apercu, fleches: 'dessinerFleches' })}
</script>
</body>
</html>`
}

/** Page de l'aperçu de la fenêtre d'export : la même, sans impression. */
export function htmlApercuChantier(params) {
  return buildHtml({ ...params, apercu: true })
}

export function generatePlanningChantierPdf(params) {
  const win = window.open('', '_blank')
  if (!win) { alert('Autorisez les pop-ups pour exporter en PDF.'); return }
  win.document.write(buildHtml(params))
  win.document.close()
}
