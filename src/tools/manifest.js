import { lazy } from 'react'

export const tools = [
  {
    id: 'rasterisation',
    label: 'Aplatisseur de plan',
    icon: 'Layers',
    description: 'Convertit les plans PDF vectoriels en images bitmap aplaties',
    path: 'rasterisation',
    component: lazy(() => import('./rasterisation')),
    enabled: true,
  },
  {
    id: 'analyseur',
    label: 'Analyseur réglementaire',
    icon: 'ShieldCheck',
    description: 'Conformité ERP, PMR, thermique via IA',
    path: 'analyseur',
    component: lazy(() => import('./analyseur')),
    enabled: true,
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
