import { lazy } from 'react'
import { CalendarDays, ListChecks, Users } from 'lucide-react'

// Le violet de la bulle « Gestion d'agence » de l'accueil
export const ACCENT = '#7A4E9C'

/** Date du jour à l'heure locale (toISOString passerait à la veille le soir). */
export function aujourdhuiLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Outils de Gestion d'agence (associés seulement). Ajouter un outil, c'est
// une entrée ici : sa tuile du tableau de bord, son entrée dans la colonne et
// son adresse en découlent.
export const outilsGestion = [
  {
    id: 'calendrier',
    label: 'Calendrier des rendus',
    Icone: CalendarDays,
    description: 'Les jalons de toutes les affaires, mois par mois, et les prochaines échéances',
    component: lazy(() => import('./CalendrierRendus')),
  },
  {
    id: 'taches',
    label: 'Suivi des tâches',
    Icone: ListChecks,
    description: 'Les tâches à faire de toutes les affaires, et en ajouter',
    component: lazy(() => import('./SuiviTaches')),
  },
  {
    id: 'associes',
    label: 'Associés',
    Icone: Users,
    description: 'Qui a accès à la gestion d’agence',
    component: lazy(() => import('./Associes')),
  },
]
