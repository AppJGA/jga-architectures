import { lazy } from 'react'

export const tools = [
  {
    id: 'rasterisation',
    label: 'Rastérisation PDF',
    icon: 'FileType',
    description: 'Convertit les plans vectoriels en bitmap haute résolution',
    path: 'rasterisation',
    component: lazy(() => import('./rasterisation')),
    enabled: true,
  },
  {
    id: 'analyseur',
    label: 'Analyseur réglementaire',
    icon: 'Bot',
    description: 'Conformité ERP, PMR, thermique via IA',
    path: 'analyseur',
    component: lazy(() => import('./analyseur')),
    enabled: false,
  },
  {
    id: 'heures',
    label: 'Déclaration des heures',
    icon: 'Clock',
    description: 'Saisie hebdomadaire par collaborateur et affaire',
    path: 'heures',
    component: lazy(() => import('./heures')),
    enabled: false,
  },
]
