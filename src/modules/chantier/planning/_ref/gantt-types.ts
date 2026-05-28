export interface Lot {
  id: number
  affaire_id: string
  num_lot: string
  nom: string
  couleur: string
}

export interface GanttTask {
  id: number
  affaire_id: string
  num_tache: string
  nom: string
  debut: string        // ISO date string "YYYY-MM-DD"
  duree: number        // en jours ouvrés
  avancement: number   // 0-100
  lot_id: number | null
  depends_on?: number | null
  // Décalage en jours ouvrés entre fin(parent) et debut(enfant).
  // Calculé par computeLag, appliqué par applyLag (les deux sont symétriques).
  // 1 = collé (B commence le lendemain ouvré de la fin de A)
  // 6 = 5 jours ouvrés de battement entre fin(A) et début(B)
  // 0 = chevauchement d'un jour (B commence le même jour que A finit)
  lag_days?: number | null
}

// ─── Jours ouvrés ─────────────────────────────────────────────────────────────

export function isWorkingDay(date: Date): boolean {
  const d = date.getDay()
  return d !== 0 && d !== 6
}

/**
 * Ajoute N jours ouvrés à une date.
 * addWorkingDays(lundi, 5) = lundi suivant (5 jours ouvrés après)
 * addWorkingDays(lundi, 0) = lundi (inchangé)
 */
export function addWorkingDays(date: Date, days: number): Date {
  if (days === 0) return new Date(date)
  const result = new Date(date)
  let added = 0
  const step = days > 0 ? 1 : -1
  while (added < Math.abs(days)) {
    result.setDate(result.getDate() + step)
    if (isWorkingDay(result)) added++
  }
  return result
}

/**
 * Nombre de jours ouvrés entre deux dates.
 * La sémantique est : combien de jours ouvrés faut-il pour aller de start à end ?
 * Si end = addWorkingDays(start, N) alors workingDaysBetween(start, end) = N.
 *
 * Exemples :
 *   workingDaysBetween(lundi, lundi)   = 0
 *   workingDaysBetween(lundi, mardi)   = 1
 *   workingDaysBetween(vendredi, lundi)= 1  (1 seul pas ouvré entre eux)
 *   workingDaysBetween(lundi, vendredi)= 4
 */
export function workingDaysBetween(start: Date, end: Date): number {
  if (end.getTime() === start.getTime()) return 0
  if (end < start) return -workingDaysBetween(end, start)
  let count = 0
  const cur = new Date(start)
  // On avance de start vers end en comptant chaque jour ouvré STRICTEMENT entre les deux
  cur.setDate(cur.getDate() + 1) // commence au lendemain de start
  while (cur <= end) {
    if (isWorkingDay(cur)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * Calcule le lag (en jours ouvrés) entre la fin d'une tâche parente et le début
 * d'une tâche enfant.
 *
 * Convention :
 *   - lag = 0 : B commence exactement après A (début(B) = premier jour ouvré après fin(A))
 *   - lag > 0 : il y a N jours ouvrés de battement
 *   - lag < 0 : chevauchement
 *
 * "Fin de A" = dernier jour ouvré de la tâche A (inclusive).
 * lastWorkingDay(A) = addWorkingDays(debut(A), duree(A) - 1)
 */
export function computeLag(parentDebut: Date, parentDuree: number, childDebut: Date): number {
  // Dernier jour ouvré de la tâche parent
  const parentLastDay = addWorkingDays(parentDebut, parentDuree - 1)
  // Jours ouvrés entre fin(parent) et debut(enfant) — strictement entre les deux
  return workingDaysBetween(parentLastDay, childDebut)
}

/**
 * Calcule le nouveau début d'un enfant en appliquant le lag depuis la fin du parent.
 *
 * Convention identique à computeLag (symétrie garantie) :
 *   lag = 0 → B commence le même jour que A finit (chevauchement d'un jour)
 *   lag = 1 → B commence le lendemain ouvré de la fin de A (collé, sans battement)
 *   lag = N → N jours ouvrés de battement entre fin(A) et début(B)
 *
 * Propriété : applyLag(debut, duree, computeLag(debut, duree, childDebut)) === childDebut
 */
export function applyLag(parentDebut: Date, parentDuree: number, lag: number): Date {
  const parentLastDay = addWorkingDays(parentDebut, parentDuree - 1)
  return addWorkingDays(parentLastDay, lag)
}

export function calendarOffsetFromRef(refDate: Date, taskStart: Date): number {
  return Math.round((taskStart.getTime() - refDate.getTime()) / (1000 * 3600 * 24))
}

export function workingDaysToCalendarDays(start: Date, workingDays: number): number {
  const end = addWorkingDays(start, workingDays)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24))
}

export function parseDate(d: string | Date): Date {
  if (d instanceof Date) return new Date(d)
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}