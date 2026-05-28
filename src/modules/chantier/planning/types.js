// ─── Jours ouvrés ─────────────────────────────────────────────────────────────

export function isWorkingDay(date) {
  const d = date.getDay()
  return d !== 0 && d !== 6
}

export function addWorkingDays(date, days) {
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

export function workingDaysBetween(start, end) {
  if (end.getTime() === start.getTime()) return 0
  if (end < start) return -workingDaysBetween(end, start)
  let count = 0
  const cur = new Date(start)
  cur.setDate(cur.getDate() + 1)
  while (cur <= end) {
    if (isWorkingDay(cur)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function computeLag(parentDebut, parentDuree, childDebut) {
  const parentLastDay = addWorkingDays(parentDebut, parentDuree - 1)
  return workingDaysBetween(parentLastDay, childDebut)
}

export function applyLag(parentDebut, parentDuree, lag) {
  const parentLastDay = addWorkingDays(parentDebut, parentDuree - 1)
  return addWorkingDays(parentLastDay, lag)
}

export function calendarOffsetFromRef(refDate, taskStart) {
  return Math.round((taskStart.getTime() - refDate.getTime()) / (1000 * 3600 * 24))
}

export function workingDaysToCalendarDays(start, workingDays) {
  if (workingDays <= 0) return 0
  // Last working day of the task (0-indexed: duree-1 days from start)
  const lastDay = addWorkingDays(start, workingDays - 1)
  // Extend to the right edge of that day (= start of the next calendar day)
  const dayAfter = new Date(lastDay)
  dayAfter.setDate(dayAfter.getDate() + 1)
  return Math.round((dayAfter.getTime() - start.getTime()) / (1000 * 3600 * 24))
}

export function parseDate(d) {
  if (d instanceof Date) return new Date(d)
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function formatDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
