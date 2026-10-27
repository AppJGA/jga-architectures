// ─── Échéances dans les PDF de planning ──────────────────────────────────────
//
// Commun aux plannings chantier et étude. Le titre d'une échéance est une
// étiquette de sa couleur, dans la bande au-dessus du tableau : bien visible,
// et sans jamais recouvrir une tâche. Dans le tableau, un trait plein de la
// même couleur, devant les barres mais derrière les noms des tâches, qu'il
// ne doit pas rayer.

import { assignLabelLanes } from '../../../modules/chantier/planning/jalonLayout.js'
import { echapperHtml } from '../../echapperHtml.js'

const TAILLE_PT = 6.5
const LIGNE_MM = 4.6          // hauteur d'une ligne d'étiquettes, écart compris
const HAUTEUR_ETIQUETTE_MM = 3.6
const DECALAGE_MM = 1.2       // l'étiquette part juste à droite du trait
const ECART_MM = 2            // entre deux étiquettes d'une même ligne
const POINTE_MM = 1.6

// Trait d'une échéance dans le tableau : au-dessus des barres (4), des délais
// et segments (3) et des pauses (6), sous les noms des tâches (10)
export const Z_TRAIT_ECHEANCE = 7
export const LARGEUR_TRAIT_ECHEANCE = '2px'

/** Texte lisible sur une couleur de fond : blanc sur foncé, presque noir sur clair. */
export function couleurTexteSur(hex) {
  const h = String(hex ?? '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#FFFFFF'
  const canal = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
  return luminance > 0.4 ? '#1F1B17' : '#FFFFFF'
}

/** Largeur estimée (mm) de l'étiquette d'un titre : gras, Arial. */
export function largeurEtiquetteMm(titre) {
  const caracteres = String(titre ?? '').length
  return caracteres * TAILLE_PT * 0.3528 * 0.58 + 2.8
}

/**
 * Bande des échéances, au-dessus du tableau.
 * @param places   [{ jalon, x }] : x = milieu du jour ou de la semaine, en mm
 *                 depuis le bord gauche du tableau
 * @param totalMm  largeur naturelle du tableau : les positions sont posées en
 *                 % de celle-ci, pour suivre l'étirement des colonnes
 */
export function bandeEcheances(places, totalMm, couleurParDefaut) {
  if (!places.length) return ''
  const largeurs = places.map(({ jalon }) => largeurEtiquetteMm(jalon.label) + DECALAGE_MM + ECART_MM)
  const lanes = assignLabelLanes(places.map((p) => p.x), 0, largeurs)
  const hauteurMm = (Math.max(...lanes) + 1) * LIGNE_MM + 4

  const marqueurs = places.map(({ jalon, x }, i) => {
    const fond = jalon.couleur ?? couleurParDefaut
    const couleur = echapperHtml(fond)
    const haut = lanes[i] * LIGNE_MM
    return `<div style="position:absolute;left:${(x / totalMm * 100).toFixed(4)}%;top:0;bottom:0;width:0">
      <div style="position:absolute;top:${haut.toFixed(2)}mm;left:${DECALAGE_MM}mm;height:${HAUTEUR_ETIQUETTE_MM}mm;line-height:${HAUTEUR_ETIQUETTE_MM}mm;padding:0 1.4mm;border-radius:0.8mm;background:${couleur};color:${couleurTexteSur(fond)};font-size:${TAILLE_PT}pt;font-weight:bold;white-space:nowrap">${echapperHtml(jalon.label)}</div>
      <div style="position:absolute;top:${(haut + HAUTEUR_ETIQUETTE_MM / 2).toFixed(2)}mm;left:0;width:${DECALAGE_MM}mm;height:${LARGEUR_TRAIT_ECHEANCE};background:${couleur}"></div>
      <div style="position:absolute;top:${(haut + HAUTEUR_ETIQUETTE_MM / 2).toFixed(2)}mm;bottom:${POINTE_MM}mm;left:-1px;width:${LARGEUR_TRAIT_ECHEANCE};background:${couleur}"></div>
      <div style="position:absolute;bottom:0;left:-3px;width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:${POINTE_MM}mm solid ${couleur}"></div>
    </div>`
  }).join('')

  return `<div style="position:relative;height:${hauteurMm.toFixed(2)}mm;border-bottom:1px solid #E9E2D6;margin-bottom:1mm">${marqueurs}</div>`
}

/** Trait d'une échéance dans une case du tableau (au milieu de la case). */
export function traitEcheance(couleur) {
  return `<div data-echeance="1" style="position:absolute;top:0;bottom:0;left:50%;margin-left:-1px;width:${LARGEUR_TRAIT_ECHEANCE};background:${echapperHtml(couleur)};z-index:${Z_TRAIT_ECHEANCE};pointer-events:none"></div>`
}

/**
 * Traits des échéances dans une ligne qui couvre tout le tableau (titre de
 * lot ou de zone) : sans eux, le trait s'interrompait à chaque titre.
 */
export function traitsEcheancesLigneEntiere(places, totalMm, couleurParDefaut) {
  return places.map(({ jalon, x }) =>
    `<div data-echeance="1" style="position:absolute;top:0;bottom:0;left:${(x / totalMm * 100).toFixed(4)}%;margin-left:-1px;width:${LARGEUR_TRAIT_ECHEANCE};background:${echapperHtml(jalon.couleur ?? couleurParDefaut)};z-index:${Z_TRAIT_ECHEANCE};pointer-events:none"></div>`
  ).join('')
}

/** Pastille de la légende : le trait et l'étiquette, comme sur le planning. */
export function exempleLegendeEcheance(couleur) {
  const c = echapperHtml(couleur)
  return `<div style="position:relative;width:9mm;height:3mm"><div style="position:absolute;left:0;top:0;bottom:0;width:${LARGEUR_TRAIT_ECHEANCE};background:${c}"></div><div style="position:absolute;left:1.2mm;right:0;top:0.3mm;bottom:0.3mm;border-radius:0.6mm;background:${c}"></div></div>`
}
