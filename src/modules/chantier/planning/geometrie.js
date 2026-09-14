// Bornes des barres du planning chantier, communes à la modale et aux trois vues.
//
// La durée d'une tâche est en jours ouvrés : ni les week-ends ni les fermetures
// bloquantes ne comptent. Toutes les vues doivent donc partir du dernier jour
// réel de la tâche. Les vues semaine et mois convertissaient auparavant la durée
// en semaines (÷ 7) ou en mois (÷ 30) comme s'il s'agissait de jours calendaires :
// une tâche de trois mois et demi s'arrêtait un mois trop tôt.

import { parseDate, isWorkingDay } from './types'

const JOUR_MS = 24 * 3600 * 1000

// Les périodes informatives sont dessinées mais ne décalent aucune tâche
export function estBloque(date, periodes = []) {
  return periodes.some((p) => {
    if (p.est_bloquante === false) return false
    return date >= parseDate(p.date_debut) && date <= parseDate(p.date_fin)
  })
}

function estCompte(date, periodes) {
  return isWorkingDay(date) && !estBloque(date, periodes)
}

// Comme addWorkingDays, mais saute aussi les jours tombant dans une période bloquée
export function addWorkingDaysBlocked(date, days, periodes = []) {
  const result = parseDate(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (estCompte(result, periodes)) added++
  }
  return result
}

// Dernier jour de la tâche : la durée inclut le jour de début
export function dernierJourTache(debut, duree, periodes = []) {
  return addWorkingDaysBlocked(debut, Math.max(1, Number(duree) || 1) - 1, periodes)
}

// Inverse de dernierJourTache : durée couvrant [début, fin], bornes incluses
export function dureeEntre(debut, fin, periodes = []) {
  const cur = parseDate(debut)
  const end = parseDate(fin)
  let duree = 1
  cur.setDate(cur.getDate() + 1)
  while (cur <= end) {
    if (estCompte(cur, periodes)) duree++
    cur.setDate(cur.getDate() + 1)
  }
  return duree
}

function lendemain(date) {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  return d
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
