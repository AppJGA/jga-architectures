// ─── Grille et périodes des PDF de planning ──────────────────────────────────
//
// Commun aux plannings chantier et étude, pour que les deux PDF se lisent de
// la même façon.

// Séparations verticales : le mois se voit d'abord, la semaine ensuite, le
// jour discrètement
export const TRAITS_GRILLE = {
  mois: '1.5px solid #5f5f5f',
  semaine: '1px solid #a8a8a8',
  jour: '0.5px solid #e6e6e6',
}

// Lignes horizontales : la teinte des mois, un peu plus fines
export const TRAIT_HORIZONTAL = '1px solid #5f5f5f'

// Ce que chaque granularité montre : en semaines, les jours n'ont pas de
// colonne lisible ; en mois, les semaines non plus
const NIVEAUX_VISIBLES = {
  day: new Set(['mois', 'semaine', 'jour']),
  week: new Set(['mois', 'semaine']),
  month: new Set(['mois']),
}

/**
 * Bordure gauche d'une colonne qui commence un mois, une semaine ou un jour.
 * @param niveau 'mois' | 'semaine' | 'jour'
 * @param granularite 'day' | 'week' | 'month'
 */
export function bordureGauche(niveau, granularite = 'day') {
  const visibles = NIVEAUX_VISIBLES[granularite] ?? NIVEAUX_VISIBLES.day
  return visibles.has(niveau) ? TRAITS_GRILLE[niveau] : 'none'
}

/**
 * Niveau de la séparation qui précède un jour (chantier).
 * En vue Semaines, le mois commence au premier lundi du mois, comme dans
 * l'éditeur : un trait posé au 1er coupait une semaine en deux.
 */
export function niveauDuJour(date, granularite = 'day') {
  if (granularite === 'week') {
    if (date.getDay() !== 1) return 'jour'
    return date.getDate() <= 7 ? 'mois' : 'semaine'
  }
  if (date.getDate() === 1) return 'mois'
  if (date.getDay() === 1) return 'semaine'
  return 'jour'
}

/**
 * Premier jour du mois auquel un jour se rattache dans les en-têtes : en vue
 * Semaines, une semaine appartient au mois (et à l'année) de son lundi.
 */
export function moisDuJour(date, granularite = 'day') {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (granularite === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

// Script des pages imprimées : réduit le bloc du planning à la largeur de la
// page. Par `zoom`, qui réduit aussi la place occupée, et non par
// `transform: scale` : celui-ci ne réduit que le dessin, et la marge négative
// qui rattrapait la hauteur ne valait que sur une page — dès que le tableau
// en prenait deux, la légende remontait sur ses dernières lignes.
export const SCRIPT_MISE_A_ECHELLE = `
  var gw = document.getElementById('gw');
  var pw = document.body.clientWidth;
  var tw = gw.scrollWidth;
  if (tw > pw * 1.02) gw.style.zoom = pw / tw;`

// ─── Aperçu dans la fenêtre d'export ─────────────────────────────────────────
//
// La même page, affichée dans un cadre de la fenêtre d'export au lieu d'être
// imprimée : la marge de la feuille est posée sur le corps (`@page` ne vaut
// qu'à l'impression) et la page envoie sa hauteur au lieu d'ouvrir
// l'impression — le cadre est isolé, la fenêtre ne peut pas la mesurer.

export const MARGE_PAGE_MM = 10

export const STYLE_APERCU = `@media screen { html { background: white; overflow: hidden; } body { margin: ${MARGE_PAGE_MM}mm; } }`

export function scriptFin(apercu) {
  if (!apercu) return 'setTimeout(function() { window.print(); }, 400);'
  return `var corps = document.body;
  parent.postMessage({ apercuPlanning: true, hauteur: Math.ceil(corps.getBoundingClientRect().bottom + parseFloat(getComputedStyle(corps).marginBottom)) }, '*');`
}

// ─── Périodes ──────────────────────────────────────────────────────────────────
//
// Fond uni, pas de hachures : les hachures bavaient à l'impression (moiré,
// aplats irréguliers). La couleur est mélangée à du blanc, donc opaque.

export function pastelPdf(hex, opacite) {
  const h = String(hex || '#B8412C').replace('#', '')
  const canal = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16)
    return Math.round((Number.isNaN(c) ? 128 : c) * opacite + 255 * (1 - opacite))
  }
  return `rgb(${canal(0)},${canal(2)},${canal(4)})`
}

export const estBloquante = (periode) => periode?.est_bloquante !== false

/** Fond des cellules couvertes par une période. */
export function fondPeriode(periode) {
  return estBloquante(periode)
    ? pastelPdf(periode.couleur ?? '#B8412C', 0.30)
    : pastelPdf(periode.couleur ?? '#9C9591', 0.15)
}

/** Trait qui ouvre et ferme une période bloquante. */
export function traitPeriode(periode) {
  return `2px solid ${pastelPdf(periode.couleur ?? '#B8412C', 0.85)}`
}

/**
 * Portion d'une barre en pause pendant une période : la barre continue, mais
 * laisse voir la période à travers des rayures de sa couleur. Elle se lit
 * « la tâche se poursuit, ces jours ne comptent pas ».
 */
export function fondPause(couleurBarre, periode) {
  const fond = periode ? fondPeriode(periode) : '#ffffff'
  return `repeating-linear-gradient(45deg, ${couleurBarre} 0, ${couleurBarre} 1.5px, ${fond} 1.5px, ${fond} 4.5px)`
}

export function stylePause(couleurBarre, periode) {
  return `background:${fondPause(couleurBarre, periode)};border-top:1px dashed ${couleurBarre};border-bottom:1px dashed ${couleurBarre};box-sizing:border-box;`
}

/**
 * Regroupe des colonnes consécutives qui portent la même période (ou aucune).
 * @param periodesParColonne tableau parallèle aux colonnes : période ou null
 * @param coupures tableau parallèle : vrai si la colonne ouvre un nouveau
 *   morceau quoi qu'il arrive — le bandeau des périodes se coupe aux mois,
 *   pour que la ligne de mois le traverse
 * @returns [{ periode, debut, nombre, premier }] — `premier` : ce morceau
 *   ouvre sa période (c'est lui qui porte le libellé)
 */
export function groupesDePeriodes(periodesParColonne, coupures = []) {
  const groupes = []
  periodesParColonne.forEach((p, i) => {
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.periode === (p ?? null) && !coupures[i]) dernier.nombre++
    else groupes.push({ periode: p ?? null, debut: i, nombre: 1, premier: !dernier || dernier.periode !== (p ?? null) })
  })
  return groupes
}
