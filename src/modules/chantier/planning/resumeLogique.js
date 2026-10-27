// ─── Mode « Résumé » du planning de chantier ─────────────────────────────────
//
// Une ligne par lot — ou par zone quand le planning est groupé par zone —
// dont la barre montre les périodes réelles d'activité : un morceau par plage
// où au moins une tâche ou un segment du groupe est en cours, un trou là où il
// n'intervient pas (demande de l'agence : une entreprise qui revient plusieurs
// fois ne doit pas paraître travailler sans arrêt).
//
// L'écran, le PDF et l'Excel lisent ce même calcul : ils ne peuvent pas se
// contredire. Les délais (approvisionnement, séchage) n'y comptent pas : le
// lot n'est pas sur le chantier pendant ce temps.

import { addWorkingDaysBlocked, dernierJourTache, parseDate } from './types'
import { trierZones } from '../../../shared/hooks/ordreZones'

const borne = (v, min, max) => Math.min(max, Math.max(min, v))
const dureeTache = (t) => Math.max(1, Number(t.duree) || 1)
const dateSeule = (v) => parseDate(typeof v === 'string' ? v.split('T')[0] : v)

/**
 * Réunit des plages [debut, fin] (bornes incluses). Deux plages séparées
 * seulement par des jours non travaillés (week-end, fermeture bloquante) n'en
 * font qu'une : sinon un lot qui enchaîne ses tâches serait coupé chaque
 * samedi. Un seul jour ouvré libre laisse un trou.
 */
export function fusionnerPlages(plages, periodes = []) {
  const triees = [...plages].sort((a, b) => a.debut - b.debut)
  const resultat = []
  for (const p of triees) {
    const dernier = resultat[resultat.length - 1]
    if (dernier && p.debut <= addWorkingDaysBlocked(dernier.fin, 1, periodes)) {
      if (p.fin > dernier.fin) dernier.fin = new Date(p.fin)
    } else {
      resultat.push({ debut: new Date(p.debut), fin: new Date(p.fin) })
    }
  }
  return resultat
}

function plageTache(t, periodes) {
  const debut = dateSeule(t.debut)
  return { debut, fin: dernierJourTache(debut, t.duree, periodes) }
}

function plageSegment(s, periodes) {
  const debut = dateSeule(s.date_debut)
  return { debut, fin: dernierJourTache(debut, s.duree_jours, periodes) }
}

/**
 * Lignes du résumé.
 * @param groupMode 'lot' (défaut) ou 'zone' — suit le groupement de l'écran
 * @returns [{ id, cle, numero, nom, couleur, morceaux: [{ debut, fin }],
 *            avancement, nbTaches }] dans l'ordre d'affichage
 */
export function resumePlanning({ tasks = [], segments = [], lots = [], zones = [], periodes = [], groupMode = 'lot' }) {
  const datees = tasks.filter(t => t?.debut)
  const parZone = groupMode === 'zone'
  // Un lot ou une zone supprimés gardent leurs tâches : elles passent sous
  // « Sans lot » / « Sans zone » plutôt que de disparaître du résumé
  const connues = new Set((parZone ? zones : lots).map(g => g.id))
  const cleDe = (id) => (connues.has(id) ? id : null)
  const groupes = new Map()
  const groupe = (cle) => {
    if (!groupes.has(cle)) groupes.set(cle, { plages: [], taches: [] })
    return groupes.get(cle)
  }

  for (const t of datees) {
    const g = groupe(cleDe(parZone ? t.zone_id : t.lot_id))
    g.plages.push(plageTache(t, periodes))
    g.taches.push(t)
  }
  // Un segment compte pour son lot ; en zone, pour sa propre zone, à défaut
  // celle de sa tâche (comme les lignes du groupement par zone)
  const tachesParId = new Map(datees.map(t => [t.id, t]))
  for (const s of segments) {
    const t = tachesParId.get(s.tache_id)
    if (!t || !s.date_debut) continue
    groupe(cleDe(parZone ? (s.zone_id ?? t.zone_id) : t.lot_id)).plages.push(plageSegment(s, periodes))
  }

  const ligne = (cle, { id, numero, nom, couleur }) => {
    const { plages, taches } = groupes.get(cle)
    const jours = taches.reduce((s, t) => s + dureeTache(t), 0)
    const fait = taches.reduce((s, t) => s + dureeTache(t) * borne(Number(t.avancement) || 0, 0, 100), 0)
    return {
      id, cle, numero, nom, couleur,
      morceaux: fusionnerPlages(plages, periodes),
      avancement: jours > 0 ? Math.round(fait / jours) : 0,
      nbTaches: taches.length,
    }
  }

  const lignes = []
  if (parZone) {
    // « Sans zone » en premier, comme le groupement par zone
    if (groupes.has(null)) lignes.push(ligne(null, { id: 'resume-sans-zone', numero: '', nom: 'Sans zone', couleur: '#C9C4C0' }))
    for (const z of trierZones(zones)) {
      if (groupes.has(z.id)) lignes.push(ligne(z.id, { id: `resume-zone-${z.id}`, numero: '', nom: z.nom, couleur: z.couleur ?? '#C9C4C0' }))
    }
  } else {
    const tries = [...lots].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    for (const l of tries) {
      if (groupes.has(l.id)) lignes.push(ligne(l.id, { id: `resume-lot-${l.id}`, numero: l.num_lot ?? '', nom: l.nom, couleur: l.couleur ?? '#94a3b8' }))
    }
    if (groupes.has(null)) lignes.push(ligne(null, { id: 'resume-sans-lot', numero: '', nom: 'Sans lot', couleur: '#94a3b8' }))
  }
  return lignes
}
