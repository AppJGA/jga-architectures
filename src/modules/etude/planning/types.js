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

// Label humain d'une semaine
export function formatWeekLabel(semaine, annee) {
  const d = getWeekStart(semaine, annee)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Propagation chemin critique ──────────────────────────────────────────────

export function propagateEtudeDependencies(taches, changedId, newSemaine, newAnnee, newDuree) {
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
    const parentEnd = addWeeks(parent.semaine_debut, parent.annee_debut, parent.duree_semaines)

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

// Calcule le lag en semaines entre la fin d'une tâche parente et le début d'une enfant
export function computeLagSemaines(parentSemaine, parentAnnee, parentDuree, childSemaine, childAnnee) {
  const parentEnd = addWeeks(parentSemaine, parentAnnee, parentDuree)
  return weeksBetween(parentEnd.semaine, parentEnd.annee, childSemaine, childAnnee)
}
