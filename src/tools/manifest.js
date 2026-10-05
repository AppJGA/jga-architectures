import { lazy } from 'react'

export const tools = [
  {
    id: 'rasterisation',
    label: 'Aplatisseur de plan',
    icon: 'Layers',
    description: 'Aplatit un plan en image, ou l’allège en gardant le vectoriel',
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
    id: 'convertisseur',
    label: 'Convertisseur',
    icon: 'ArrowRightLeft',
    description: 'Photos HEIC de l’iPhone en JPEG, par lot',
    path: 'convertisseur',
    component: lazy(() => import('./convertisseur')),
    enabled: true,
  },
  {
    id: 'essai-enregistrement',
    label: 'Essai d’enregistrement',
    icon: 'Robot',
    description: 'Tester l’enregistrement d’une visite sur cet appareil',
    path: 'essai-enregistrement',
    component: lazy(() => import('./essai-enregistrement')),
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
