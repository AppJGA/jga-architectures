// ─── Avancement par lot : logique pure ───────────────────────────────────────
//
// L'avancement affiché dans un compte rendu est celui du planning chantier :
// chaque tâche porte déjà son pourcentage (`planning.avancement`). Rien n'est
// ressaisi ici, on agrège.
//
// Deux chiffres par lot :
//   · réalisé — moyenne des pourcentages des tâches, pondérée par leur durée,
//     car une tâche de 20 jours pèse plus qu'une tâche de 2 ;
//   · prévu — ce que le planning annonçait pour la date de la visite, même
//     pondération. L'écart entre les deux est l'avance ou le retard du lot.
//
// Le temps se compte toujours en jours ouvrés, fermetures bloquantes déduites
// (voir `planning/types.js`) : une durée n'est jamais des jours calendaires.

import { dureeEntre, dernierJourTache, parseDate } from '../planning/types'

const borne = (v, min, max) => Math.min(max, Math.max(min, v))

function dureeTache(t) {
  return Math.max(1, Number(t.duree) || 1)
}

/**
 * Part de la tâche que le planning prévoyait faite à cette date, de 0 à 1.
 * Bornes incluses : le jour de début compte pour un jour travaillé.
 */
export function partPrevue(tache, date, periodes = []) {
  if (!tache?.debut || !date) return 0
  const debut = parseDate(tache.debut)
  const jour = parseDate(date)
  if (jour < debut) return 0
  const duree = dureeTache(tache)
  if (jour >= dernierJourTache(debut, duree, periodes)) return 1
  return borne(dureeEntre(debut, jour, periodes) / duree, 0, 1)
}

/**
 * Avancement de chaque lot à une date donnée.
 * @param taches lignes de `planning` (lot_id, debut, duree, avancement)
 * @param lots   lots de l'affaire (id, nom, couleur)
 * @param date   date de référence — celle de la réunion
 * @returns [{ lot_id, nom, couleur, realise, prevu, ecart, taches, jours }]
 *          réalisé, prévu et écart en pourcentages entiers ; les tâches sans
 *          lot sont regroupées en fin de liste sous « Hors lot ».
 */
export function avancementParLot(taches, lots = [], { date, periodes = [] } = {}) {
  const parLot = new Map()
  for (const t of taches ?? []) {
    const cle = t.lot_id ?? null
    if (!parLot.has(cle)) parLot.set(cle, [])
    parLot.get(cle).push(t)
  }

  const ligne = (cle, liste) => {
    const jours = liste.reduce((s, t) => s + dureeTache(t), 0)
    const fait = liste.reduce((s, t) => s + dureeTache(t) * borne(Number(t.avancement) || 0, 0, 100), 0)
    const attendu = liste.reduce((s, t) => s + dureeTache(t) * partPrevue(t, date, periodes) * 100, 0)
    const realise = Math.round(fait / jours)
    const prevu = Math.round(attendu / jours)
    const lot = lots.find(l => l.id === cle)
    return {
      lot_id: cle,
      nom: lot?.nom ?? 'Hors lot',
      couleur: lot?.couleur ?? '#9C9591',
      realise, prevu, ecart: realise - prevu,
      taches: liste.length, jours,
    }
  }

  // L'ordre des lots de l'affaire, puis ce qui n'en a pas
  const ordonnees = [
    ...lots.filter(l => parLot.has(l.id)).map(l => ligne(l.id, parLot.get(l.id))),
    ...(parLot.has(null) ? [ligne(null, parLot.get(null))] : []),
  ]
  // Un lot supprimé du carnet garde ses tâches : ne pas les perdre
  const connus = new Set(ordonnees.map(l => l.lot_id))
  for (const [cle, liste] of parLot) if (!connus.has(cle)) ordonnees.push(ligne(cle, liste))
  return ordonnees
}

/** Avancement de l'opération entière, pondéré par les durées des lots. */
export function avancementGlobal(lignes) {
  const jours = (lignes ?? []).reduce((s, l) => s + l.jours, 0)
  if (!jours) return { realise: 0, prevu: 0, ecart: 0, jours: 0 }
  const realise = Math.round(lignes.reduce((s, l) => s + l.realise * l.jours, 0) / jours)
  const prevu = Math.round(lignes.reduce((s, l) => s + l.prevu * l.jours, 0) / jours)
  return { realise, prevu, ecart: realise - prevu, jours }
}

// Un écart de quelques points n'est pas un retard : le pointage des tâches se
// fait par paliers de 5 %.
export const SEUIL_ECART = 5

export function infosEcart(ecart) {
  if (ecart <= -SEUIL_ECART) return { etat: 'retard', libelle: `${Math.abs(ecart)} pts de retard`, couleur: '#B8412C' }
  if (ecart >= SEUIL_ECART) return { etat: 'avance', libelle: `${ecart} pts d’avance`, couleur: '#2A8A4E' }
  return { etat: 'conforme', libelle: 'Conforme au planning', couleur: '#5E5854' }
}

/**
 * Ce qu'un CR émis garde de l'avancement : le planning continue de vivre, le
 * compte rendu doit montrer les chiffres du jour de la visite.
 */
export function instantaneAvancement(lignes) {
  return (lignes ?? []).map(l => ({
    lot_id: l.lot_id, nom: l.nom, couleur: l.couleur,
    realise: l.realise, prevu: l.prevu, taches: l.taches, jours: l.jours,
  }))
}

/** Lignes à afficher : l'instantané si le CR est émis, sinon le planning vivant. */
export function lignesAvancement(cr, lignesVivantes) {
  const gele = cr?.avancement_lots
  if (cr?.statut === 'emis' && Array.isArray(gele) && gele.length > 0) {
    return gele.map(l => ({ ...l, ecart: l.realise - l.prevu, gele: true }))
  }
  return lignesVivantes
}
