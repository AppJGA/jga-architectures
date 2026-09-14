// Bornes des barres du planning chantier, communes à la modale et aux trois vues.
//
// La durée d'une tâche est en jours ouvrés : ni les week-ends ni les fermetures
// bloquantes ne comptent. Toutes les vues doivent donc partir du dernier jour
// réel de la tâche. Les vues semaine et mois convertissaient auparavant la durée
// en semaines (÷ 7) ou en mois (÷ 30) comme s'il s'agissait de jours calendaires :
// une tâche de trois mois et demi s'arrêtait un mois trop tôt.

import { dernierJourTache, dureeEntre, parseDate } from './types'
import { skipBlockedPeriods } from './propagation'

const JOUR_MS = 24 * 3600 * 1000

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
  const diffDays = Math.floor((date.getTime() - dateRef.getTime()) / JOUR_MS)
  return Math.floor(diffDays / 7)
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
function jourSousXMois(x, months, monthWidth) {
  const m0 = months[0]
  const idx = Math.floor(x / monthWidth)
  const joursDuMois = new Date(m0.year, m0.month + idx + 1, 0).getDate()
  const jour = Math.floor((x / monthWidth - idx) * joursDuMois)
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
