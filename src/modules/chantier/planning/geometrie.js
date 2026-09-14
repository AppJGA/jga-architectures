// Bornes des barres du planning chantier, communes à la modale et aux trois vues.
//
// La durée d'une tâche est en jours ouvrés : ni les week-ends ni les fermetures
// bloquantes ne comptent. Toutes les vues doivent donc partir du dernier jour
// réel de la tâche. Les vues semaine et mois convertissaient auparavant la durée
// en semaines (÷ 7) ou en mois (÷ 30) comme s'il s'agissait de jours calendaires :
// une tâche de trois mois et demi s'arrêtait un mois trop tôt.

import { dernierJourTache, dureeEntre, parseDate, addWorkingDaysBlocked } from './types'
import { skipBlockedPeriods } from './propagation'

const JOUR_MS = 24 * 3600 * 1000

// Écart en jours calendaires entre deux dates à minuit. Arrondi, et non tronqué :
// entre une date d'hiver et une date d'été, l'écart fait N jours moins une heure,
// et Math.floor faisait tomber chaque lundi dans la semaine précédente.
export function joursEntre(debut, fin) {
  return Math.round((fin.getTime() - debut.getTime()) / JOUR_MS)
}

function lendemain(date) {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  return d
}

// ── Vue jour ─────────────────────────────────────────────────────────────────

// `dayPositions[i]` : bord gauche du i-ème jour depuis `dateRef` (week-ends réduits)
export function xAtDate(date, dateRef, dayPositions) {
  const offset = Math.round((date.getTime() - dateRef.getTime()) / (1000 * 3600 * 24))
  if (offset <= 0) return 0
  if (offset >= dayPositions.length - 1) return dayPositions[dayPositions.length - 1]
  return dayPositions[offset]
}

// ── Vue semaine ──────────────────────────────────────────────────────────────

// Index de semaine depuis la date de référence (toujours un lundi)
export function weekIndexFromRef(date, dateRef) {
  return Math.floor(joursEntre(dateRef, date) / 7)
}

// Barre alignée sur des semaines entières : de la semaine du début à celle du
// dernier jour incluse.
export function barreSemaine(debut, duree, dateRef, weekWidth, periodes = []) {
  const debutIdx = weekIndexFromRef(debut, dateRef)
  const finIdx = weekIndexFromRef(dernierJourTache(debut, duree, periodes), dateRef)
  return { left: debutIdx * weekWidth, width: (finIdx - debutIdx + 1) * weekWidth }
}

// ── Vue mois ─────────────────────────────────────────────────────────────────

// Position du début de la journée : le 1er d'un mois tombe sur le trait du mois,
// comme la colonne d'un jour en vue jour.
export function xAtDateMonth(date, months, monthWidth) {
  const refMois = months[0]
  if (!refMois) return 0
  const totalMonths = (date.getFullYear() - refMois.year) * 12 + (date.getMonth() - refMois.month)
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return (totalMonths + (date.getDate() - 1) / daysInMonth) * monthWidth
}

// Barre proportionnelle aux jours du calendrier : elle s'arrête à la fin du
// dernier jour de la tâche.
export function barreMois(debut, duree, months, monthWidth, periodes = []) {
  const left = xAtDateMonth(debut, months, monthWidth)
  const fin = lendemain(dernierJourTache(debut, duree, periodes))
  return { left, width: xAtDateMonth(fin, months, monthWidth) - left }
}

// ── Conversion inverse ───────────────────────────────────────────────────────

// Inverse de xAtDate/weekIndexFromRef/xAtDateMonth : convertit une position en
// pixels (dans le référentiel du contenu de la timeline, pas de la fenêtre) en
// date, selon le mode de vue actif.
export function dateForX(x, geo) {
  if (geo.viewMode === 'month') {
    const idx = Math.floor(x / geo.monthWidth)
    const m0 = geo.months[0]
    if (!m0) return new Date(geo.dateRef)
    return new Date(m0.year, m0.month + idx, 1)
  }
  if (geo.viewMode === 'week') {
    const idx = Math.floor(x / geo.weekWidth)
    const d = new Date(geo.dateRef)
    d.setDate(d.getDate() + idx * 7)
    return d
  }
  // Vue jour : recherche dans dayPositions (paliers cumulés, colonnes week-end réduites)
  const { dayPositions, dateRef } = geo
  let idx = 0
  while (idx < dayPositions.length - 1 && dayPositions[idx + 1] <= x) idx++
  const d = new Date(dateRef)
  d.setDate(d.getDate() + idx)
  return d
}

// Jour dont la colonne contient `x` en vue mois, au jour près (dateForX, lui,
// renvoie le 1er du mois : c'est la maille du dessin d'une nouvelle tâche).
function jourSousXMois(x, months, monthWidth, arrondi = Math.floor) {
  const m0 = months[0]
  const idx = Math.floor(x / monthWidth)
  const joursDuMois = new Date(m0.year, m0.month + idx + 1, 0).getDate()
  const jour = arrondi((x / monthWidth - idx) * joursDuMois)
  return new Date(m0.year, m0.month + idx, 1 + jour)
}

// ── Étirement d'une barre ────────────────────────────────────────────────────

function decaler(date, jours) {
  const d = new Date(date)
  d.setDate(d.getDate() + jours)
  return d
}

// Lundi et vendredi de la semaine d'une date
function lundi(date) { return decaler(date, -((date.getDay() + 6) % 7)) }
function vendredi(date) { return decaler(lundi(date), 4) }

/**
 * Nouvelles bornes d'une barre (tâche ou segment) après un geste sur l'une de
 * ses poignées. Le geste fixe une DATE — la colonne sous la poignée, le
 * vendredi (fin) ou le lundi (début) de la semaine visée en vue semaine — et la
 * durée en jours ouvrés s'en déduit. L'autre bord ne bouge pas.
 *
 * @returns { debut: Date, duree }
 */
export function redimensionnerBarre({ cote, debut, duree, dx, geo, periodes = [], minDuree = 1 }) {
  const debutInitial = parseDate(debut)
  const dernierJour = dernierJourTache(debutInitial, duree, periodes)

  if (cote === 'right') {
    let fin
    if (geo.viewMode === 'week') {
      fin = decaler(vendredi(dernierJour), 7 * Math.round(dx / geo.weekWidth))
      if (fin < debutInitial) fin = vendredi(debutInitial)
    } else if (geo.viewMode === 'month') {
      const x = xAtDateMonth(lendemain(dernierJour), geo.months, geo.monthWidth) + dx
      fin = decaler(jourSousXMois(x, geo.months, geo.monthWidth), -1)
    } else {
      const x = xAtDate(lendemain(dernierJour), geo.dateRef, geo.dayPositions) + dx
      fin = dateForX(x - 1, geo)
    }
    if (fin < debutInitial) fin = debutInitial
    return { debut: debutInitial, duree: Math.max(minDuree, dureeEntre(debutInitial, fin, periodes)) }
  }

  let nouveauDebut
  if (geo.viewMode === 'week') {
    nouveauDebut = decaler(lundi(debutInitial), 7 * Math.round(dx / geo.weekWidth))
  } else if (geo.viewMode === 'month') {
    const x = xAtDateMonth(debutInitial, geo.months, geo.monthWidth) + dx
    nouveauDebut = jourSousXMois(x, geo.months, geo.monthWidth)
  } else {
    nouveauDebut = dateForX(xAtDate(debutInitial, geo.dateRef, geo.dayPositions) + dx, geo)
  }
  // Une tâche ne démarre ni un week-end ni pendant une fermeture
  nouveauDebut = skipBlockedPeriods(nouveauDebut, periodes)
  if (nouveauDebut > dernierJour) {
    // Poignée tirée au-delà de la fin : la barre garde sa dernière semaine
    // (vue semaine) ou son dernier jour
    const plancher = geo.viewMode === 'week' ? skipBlockedPeriods(lundi(dernierJour), periodes) : dernierJour
    nouveauDebut = plancher > dernierJour ? dernierJour : plancher
  }
  return {
    debut: nouveauDebut,
    duree: Math.max(minDuree, dureeEntre(nouveauDebut, dernierJour, periodes)),
  }
}

/**
 * Nouveau début d'une barre glissée de `dx` pixels, durée inchangée.
 *
 * Vue semaine : par semaines entières, calé sur le lundi, et seulement si le
 * geste atteint une demi-semaine — un tremblement ne déplace rien. Vues jour et
 * mois : le jour sous le bord gauche de la barre. L'ancienne conversion par une
 * largeur de jour moyenne, suivie d'un recalage au 1er du mois le plus proche,
 * pouvait envoyer la barre dans le sens opposé au geste.
 */
export function deplacerBarre({ debut, dx, geo, periodes = [] }) {
  const debutInitial = parseDate(debut)
  let nouveau
  if (geo.viewMode === 'week') {
    const semaines = Math.round(dx / geo.weekWidth)
    if (semaines === 0) return debutInitial
    nouveau = decaler(lundi(debutInitial), 7 * semaines)
  } else if (geo.viewMode === 'month') {
    const x = xAtDateMonth(debutInitial, geo.months, geo.monthWidth) + dx
    nouveau = jourSousXMois(x, geo.months, geo.monthWidth, Math.round)
  } else {
    nouveau = dateForX(xAtDate(debutInitial, geo.dateRef, geo.dayPositions) + dx, geo)
  }
  return skipBlockedPeriods(nouveau, periodes)
}

// ── Périodes ─────────────────────────────────────────────────────────────────

/**
 * Position d'une période [début, fin incluse]. Vue semaine : semaines entières,
 * comme les barres. Vues jour et mois : au jour près, comme les barres — en vue
 * mois, une fermeture du 3 au 21 août ne doit pas hachurer tout le mois.
 */
export function periodeGeometry(dateDebut, dateFinInclusive, geo) {
  if (geo.viewMode === 'week') {
    const debutIdx = weekIndexFromRef(dateDebut, geo.dateRef)
    const finIdx = weekIndexFromRef(dateFinInclusive, geo.dateRef)
    return { left: debutIdx * geo.weekWidth, width: (finIdx - debutIdx + 1) * geo.weekWidth }
  }
  if (geo.viewMode === 'month') {
    const left = xAtDateMonth(dateDebut, geo.months, geo.monthWidth)
    return { left, width: Math.max(2, xAtDateMonth(lendemain(dateFinInclusive), geo.months, geo.monthWidth) - left) }
  }
  const left = xAtDate(dateDebut, geo.dateRef, geo.dayPositions)
  return { left, width: Math.max(4, xAtDate(lendemain(dateFinInclusive), geo.dateRef, geo.dayPositions) - left) }
}

// ── Étendue ──────────────────────────────────────────────────────────────────

/**
 * Premier et dernier jour occupés du planning : délais avant et après,
 * segments et jalons compris, fermetures déduites comme sur les barres.
 * Sert à borner la timeline et les exports ; `null` pour un planning vide.
 *
 * @returns { debut: Date, fin: Date } | null — fin incluse
 */
export function etenduePlanning({ tasks = [], segments = [], jalons = [], periodes = [] }) {
  let debut = null
  let fin = null
  const inclure = (d, f = d) => {
    if (!debut || d < debut) debut = new Date(d)
    if (!fin || f > fin) fin = new Date(f)
  }

  tasks.forEach((t) => {
    if (!t.debut) return
    const dernier = dernierJourTache(t.debut, t.duree, periodes)
    inclure(parseDate(t.debut), dernier)
    if (t.appro_actif && t.appro_duree > 0) inclure(addWorkingDaysBlocked(t.debut, -t.appro_duree, periodes))
    if (t.delai_apres > 0) {
      const debutDelai = addWorkingDaysBlocked(dernier, 1, periodes)
      inclure(debutDelai, dernierJourTache(debutDelai, t.delai_apres, periodes))
    }
  })
  segments.forEach((sg) => {
    if (sg.date_debut) inclure(parseDate(sg.date_debut), dernierJourTache(sg.date_debut, sg.duree_jours, periodes))
  })
  jalons.forEach((j) => { if (j.date) inclure(parseDate(String(j.date).split('T')[0])) })

  return debut ? { debut, fin } : null
}
