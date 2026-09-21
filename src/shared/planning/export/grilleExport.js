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

/** Niveau de la séparation qui précède un jour (chantier). */
export function niveauDuJour(date) {
  if (date.getDate() === 1) return 'mois'
  if (date.getDay() === 1) return 'semaine'
  return 'jour'
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
 * Regroupe des colonnes consécutives qui portent la même période (ou aucune),
 * pour le bandeau qui nomme les périodes sous les en-têtes de dates.
 * @param periodesParColonne tableau parallèle aux colonnes : période ou null
 * @returns [{ periode, debut, nombre }]
 */
export function groupesDePeriodes(periodesParColonne) {
  const groupes = []
  periodesParColonne.forEach((p, i) => {
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.periode === p) dernier.nombre++
    else groupes.push({ periode: p ?? null, debut: i, nombre: 1 })
  })
  return groupes
}
