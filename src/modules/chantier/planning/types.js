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

// ─── Périodes bloquées ────────────────────────────────────────────────────────
//
// Les périodes informatives sont dessinées mais ne décalent aucune tâche.

export function estBloque(date, periodes = []) {
  return periodes.some((p) => {
    if (p.est_bloquante === false) return false
    if (!p.date_debut || !p.date_fin) return false
    return date >= parseDate(p.date_debut) && date <= parseDate(p.date_fin)
  })
}

// Comme addWorkingDays (dans les deux sens), mais saute aussi les périodes bloquées
export function addWorkingDaysBlocked(date, days, periodes = []) {
  const result = parseDate(date)
  const step = days > 0 ? 1 : -1
  let added = 0
  while (added < Math.abs(days)) {
    result.setDate(result.getDate() + step)
    if (isWorkingDay(result) && !estBloque(result, periodes)) added++
  }
  return result
}

// Dernier jour d'une tâche, la durée incluant le jour de début. Une fermeture
// bloquante l'allonge d'autant : c'est la fin que dessine la barre.
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
    if (isWorkingDay(cur) && !estBloque(cur, periodes)) duree++
    cur.setDate(cur.getDate() + 1)
  }
  return duree
}

// ─── Écart (lag) d'un lien de dépendance ──────────────────────────────────────
//
// L'écart part de la fin réelle du parent (fermetures comprises, comme sa
// barre) et se compte ensuite en jours ouvrés simples : les liens existants
// ont été mesurés ainsi, les recompter autrement décalerait des tâches.

export function computeLag(parentDebut, parentDuree, childDebut, periodes = []) {
  const parentLastDay = dernierJourTache(parentDebut, parentDuree, periodes)
  return workingDaysBetween(parentLastDay, parseDate(childDebut))
}

export function applyLag(parentDebut, parentDuree, lag, periodes = []) {
  const parentLastDay = dernierJourTache(parentDebut, parentDuree, periodes)
  return addWorkingDays(parentLastDay, lag)
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
