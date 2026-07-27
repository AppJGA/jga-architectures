// ─── Couleurs et labels par type de tâche ────────────────────────────────────

export const TYPE_COLORS = {
  etude:         '#E8A200',
  validation:    '#2A8A4E',
  administratif: '#D97706',
  chantier:      '#1B3A5C',
}

export const TYPE_LABELS = {
  etude:         "Phase d'étude",
  validation:    'Validation / Visa',
  administratif: 'Période administrative',
  chantier:      'Phase chantier',
}

export const INTERVENANTS = [
  { id: 1, label: 'Architecte',      abrev: 'ARCH' },
  { id: 2, label: 'BET',             abrev: 'BET'  },
  { id: 3, label: 'Économiste',      abrev: 'ECON' },
  { id: 4, label: 'MOA',             abrev: 'MOA'  },
  { id: 5, label: 'Géomètre',        abrev: 'GEO'  },
  { id: 6, label: 'Bureau contrôle', abrev: 'BC'   },
  { id: 7, label: 'CSPS',            abrev: 'CSPS' },
]

// ─── Utilitaires semaines ISO ──────────────────────────────────────────────────

// Retourne le lundi de la semaine ISO donnée
export function getWeekStart(semaine, annee) {
  const jan4 = new Date(annee, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const firstMonday = new Date(jan4)
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)
  const result = new Date(firstMonday)
  result.setDate(firstMonday.getDate() + (semaine - 1) * 7)
  return result
}

// Retourne { semaine, annee } ISO pour une date
export function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return {
    semaine: 1 + Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
    ),
    annee: d.getFullYear(),
  }
}

// Ajoute n semaines à une position semaine/annee
export function addWeeks(semaine, annee, n) {
  const date = getWeekStart(semaine, annee)
  date.setDate(date.getDate() + n * 7)
  return getISOWeek(date)
}

// Nombre de semaines entre deux positions (peut être négatif)
export function weeksBetween(s1, a1, s2, a2) {
  const d1 = getWeekStart(s1, a1)
  const d2 = getWeekStart(s2, a2)
  return Math.round((d2.getTime() - d1.getTime()) / (7 * 86400000))
}

// Semaine ISO courante
export function getCurrentWeek() {
  return getISOWeek(new Date())
}

// Parsing local d'une date ISO 'YYYY-MM-DD' — `new Date(str)` serait interprété
// en UTC et décalerait la date d'un jour selon le fuseau.
export function parseDateLocale(d) {
  if (d instanceof Date) return new Date(d)
  if (!d) return null
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number)
  if (!y || !m || !day) return null
  return new Date(y, m - 1, day)
}

// Semaine ISO d'une date ISO 'YYYY-MM-DD' (null si date invalide)
export function weekOfDate(d) {
  const date = parseDateLocale(d)
  return date ? getISOWeek(date) : null
}

// Label humain d'une semaine
export function formatWeekLabel(semaine, annee) {
  const d = getWeekStart(semaine, annee)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Fragments d'une phase autour des périodes bloquantes ─────────────────────
//
// Une phase de 5 semaines qui démarre une semaine avant des congés de 2 semaines
// s'affiche en deux morceaux : 1 semaine, puis 4 semaines après les congés. La
// durée en semaines TRAVAILLÉES reste 5, la date de début ne bouge pas, seule la
// fin effective recule.
//
// À la granularité hebdomadaire du planning d'étude, une semaine est neutralisée
// dès qu'une période bloquante la touche — même convention que l'affichage des
// bandes de période, pour que les deux coïncident toujours à l'écran.

const MAX_SEMAINES_PARCOURUES = 520 // garde-fou (10 ans) contre une boucle sans fin

function rangesBloquants(periodes) {
  return (periodes ?? [])
    .filter((p) => p.est_bloquante !== false)
    .map((p) => {
      const debut = weekOfDate(p.date_debut)
      const fin = weekOfDate(p.date_fin)
      return debut && fin ? { debut, fin } : null
    })
    .filter(Boolean)
}

export function semaineEstBloquee(semaine, annee, ranges) {
  return ranges.some(({ debut, fin }) =>
    weeksBetween(debut.semaine, debut.annee, semaine, annee) >= 0 &&
    weeksBetween(semaine, annee, fin.semaine, fin.annee) >= 0
  )
}

/**
 * Découpe une phase en fragments visuels autour des périodes bloquantes.
 *
 * @returns [{ semaine_debut, annee_debut, duree_semaines }] — au moins un
 *          fragment ; la somme des durées vaut toujours `phase.duree_semaines`.
 */
export function computePhaseFragments(phase, periodes) {
  const dureeTotale = Math.max(0, Number(phase?.duree_semaines) || 0)
  const entier = [{
    semaine_debut: phase?.semaine_debut,
    annee_debut: phase?.annee_debut,
    duree_semaines: dureeTotale || 1,
  }]
  if (!phase?.semaine_debut || dureeTotale === 0) return entier

  const ranges = rangesBloquants(periodes)
  if (ranges.length === 0) return entier

  const fragments = []
  let semaine = phase.semaine_debut
  let annee = phase.annee_debut
  let restant = dureeTotale
  let debutFragment = null
  let dureeFragment = 0
  let garde = 0

  while (restant > 0 && garde++ < MAX_SEMAINES_PARCOURUES) {
    if (semaineEstBloquee(semaine, annee, ranges)) {
      // Semaine neutralisée : elle ne consomme pas de durée et coupe le fragment
      if (debutFragment) {
        fragments.push({ ...debutFragment, duree_semaines: dureeFragment })
        debutFragment = null
        dureeFragment = 0
      }
    } else {
      if (!debutFragment) debutFragment = { semaine_debut: semaine, annee_debut: annee }
      dureeFragment++
      restant--
    }
    const suivante = addWeeks(semaine, annee, 1)
    semaine = suivante.semaine
    annee = suivante.annee
  }

  if (debutFragment) fragments.push({ ...debutFragment, duree_semaines: dureeFragment })

  return fragments.length > 0 ? fragments : entier
}

/**
 * Fin effective d'une phase : fin du dernier fragment, périodes bloquantes
 * déduites. C'est cette date que voient les phases dépendantes.
 */
export function finEffectivePhase(phase, periodes) {
  const fragments = computePhaseFragments(phase, periodes)
  const dernier = fragments[fragments.length - 1]
  return addWeeks(dernier.semaine_debut, dernier.annee_debut, dernier.duree_semaines)
}

// ─── Propagation chemin critique ──────────────────────────────────────────────

export function propagateEtudeDependencies(taches, changedId, newSemaine, newAnnee, newDuree, periodes = []) {
  const snapshot = new Map(taches.map(t => [t.id, { ...t }]))
  snapshot.set(changedId, {
    ...snapshot.get(changedId),
    semaine_debut: newSemaine,
    annee_debut: newAnnee,
    duree_semaines: newDuree,
  })

  const updates = []
  const queue = [changedId]
  const visited = new Set()

  while (queue.length > 0) {
    const parentId = queue.shift()
    if (visited.has(parentId)) continue
    visited.add(parentId)

    const parent = snapshot.get(parentId)
    // Fin effective : les semaines bloquées repoussent d'autant la fin réelle
    const parentEnd = finEffectivePhase(parent, periodes)

    snapshot.forEach(child => {
      if (child.depends_on !== parentId) return
      const newStart = addWeeks(parentEnd.semaine, parentEnd.annee, child.lag_semaines ?? 0)
      if (newStart.semaine !== child.semaine_debut || newStart.annee !== child.annee_debut) {
        snapshot.set(child.id, { ...child, semaine_debut: newStart.semaine, annee_debut: newStart.annee })
        updates.push({ id: child.id, semaine_debut: newStart.semaine, annee_debut: newStart.annee })
        queue.push(child.id)
      }
    })
  }
  return updates
}

// Calcule le lag en semaines entre la fin d'une tâche parente et le début d'une
// enfant. `periodes` permet de partir de la fin EFFECTIVE du parent, pour que le
// lag mesuré à l'écran soit celui qui sera réappliqué à la propagation.
export function computeLagSemaines(parentSemaine, parentAnnee, parentDuree, childSemaine, childAnnee, periodes = []) {
  const parentEnd = finEffectivePhase(
    { semaine_debut: parentSemaine, annee_debut: parentAnnee, duree_semaines: parentDuree },
    periodes
  )
  return weeksBetween(parentEnd.semaine, parentEnd.annee, childSemaine, childAnnee)
}
