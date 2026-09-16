// ─── Aller à la visite en deux gestes ────────────────────────────────────────
//
// Sur le chantier, la tablette à la main, écrire une remarque ne doit pas
// demander de traverser trois écrans. Un seul bouton, sur la page de l'affaire,
// décide où il mène : reprendre la visite en cours, ou démarrer celle du jour.

import { dateDuJour } from './crLogique'

/**
 * Ce que propose le bouton, selon l'état des visites de l'affaire.
 * @param comptesRendus triés par numéro décroissant (le plus récent d'abord)
 * @returns { action: 'reprendre' | 'demarrer', cr, libelle, precision }
 */
export function actionVisite(comptesRendus, aujourdhui = dateDuJour()) {
  const brouillon = (comptesRendus ?? []).find((cr) => cr.statut !== 'emis')

  if (brouillon) {
    const duJour = brouillon.date_reunion === aujourdhui
    return {
      action: 'reprendre',
      cr: brouillon,
      libelle: `Reprendre la visite n°${String(brouillon.numero).padStart(2, '0')}`,
      precision: duJour ? 'Visite du jour, en cours' : `Ouverte le ${jourCourt(brouillon.date_reunion)}`,
    }
  }

  const dernier = (comptesRendus ?? [])[0]
  return {
    action: 'demarrer',
    cr: null,
    libelle: `Démarrer la visite du ${jourCourt(aujourdhui)}`,
    precision: dernier
      ? `Reprend la visite n°${String(dernier.numero).padStart(2, '0')} du ${jourCourt(dernier.date_reunion)}`
      : 'Première visite de ce chantier',
  }
}

export function jourCourt(d) {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/**
 * Où mène le bouton. Le mode Visite est fait pour le doigt et le plein écran :
 * au bureau, à la souris, l'éditeur du compte rendu est plus confortable.
 */
export function cheminVisite(affaireId, crId, { tactile }) {
  return `/affaires/${affaireId}/comptes-rendus?cr=${crId}${tactile ? '&visite=1' : ''}`
}

// Écran tactile : un pointeur grossier (doigt) ou une fenêtre étroite.
export function estTactile() {
  if (typeof window === 'undefined') return false
  const doigt = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
  return doigt || window.innerWidth < 1024
}
