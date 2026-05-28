import { lazy } from 'react'

export const phases = [
  {
    id: 'etude',
    label: 'Phase Étude',
    color: '#E05A1E',
    supabasePhases: ['esq', 'avp', 'pro', 'dce'],
    modules: [
      {
        id: 'planning-etude',
        label: "Planning d'étude",
        icon: 'Calendar',
        path: 'planning-etude',
        component: lazy(() => import('./etude/planning')),
        enabled: true,
        description: "Planification des phases et jalons d'étude",
      },
      {
        id: 'financier-etude',
        label: 'Suivi financier',
        icon: 'BarChart2',
        path: 'financier-etude',
        component: lazy(() => import('./etude/financier')),
        enabled: false,
        description: 'Honoraires, avenants, enveloppe prévisionnelle',
      },
      {
        id: 'todo',
        label: 'To-do list',
        icon: 'CheckSquare',
        path: 'todo',
        component: lazy(() => import('./etude/todo')),
        enabled: false,
        description: "Tâches par phase d'étude",
      },
    ],
  },
  {
    id: 'chantier',
    label: 'Phase Chantier',
    color: '#639922',
    supabasePhases: ['chantier'],
    modules: [
      {
        id: 'lots-entreprises',
        label: 'Entreprises & Lots',
        icon: 'Building2',
        path: 'lots-entreprises',
        component: lazy(() => import('./chantier/lots-entreprises')),
        enabled: true,
        layout: 'fullbleed',
        description: 'Lots du chantier et entreprises attributaires',
      },
      {
        id: 'comptes-rendus',
        label: 'Comptes rendus',
        icon: 'ClipboardList',
        path: 'comptes-rendus',
        component: lazy(() => import('./chantier/comptes-rendus')),
        enabled: true,
        description: 'Comptes rendus de chantier',
      },
      {
        id: 'opr',
        label: 'OPR',
        icon: 'ClipboardCheck',
        path: 'opr',
        component: lazy(() => import('./chantier/opr')),
        enabled: false,
        description: 'Opérations Préalables à la Réception',
      },
      {
        id: 'ftm',
        label: 'Fiches de travaux modificatifs',
        icon: 'FilePen',
        path: 'ftm',
        component: lazy(() => import('./chantier/ftm')),
        enabled: true,
        description: 'Travaux modificatifs en cours de chantier',
      },
      {
        id: 'planning-chantier',
        label: 'Planning chantier',
        icon: 'CalendarRange',
        path: 'planning-chantier',
        component: lazy(() => import('./chantier/planning')),
        enabled: true,
        layout: 'fullbleed',
        description: 'Diagramme de Gantt avec chemin critique',
      },
      {
        id: 'financier-chantier',
        label: 'Suivi financier',
        icon: 'TrendingUp',
        path: 'financier-chantier',
        component: lazy(() => import('./chantier/financier')),
        enabled: true,
        layout: 'fullbleed',
        description: 'Plus et moins-values, situations de travaux',
      },
    ],
  },
]

export function getPhaseActive(affairePhase) {
  return phases.find(p => p.supabasePhases.includes(affairePhase)) ?? phases[0]
}

export function getAllModules() {
  return phases.flatMap(p => p.modules)
}
