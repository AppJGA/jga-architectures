// ─── Aide-mémoire de la pièce (visite de l'état des lieux) ──────────────────
//
// Demande de l'agence (2026-11-19) : dès qu'on entre dans une pièce, un
// aide-mémoire rappelle tout ce qu'il faut dire ou pointer pour que le
// rapport soit complet (finitions et leur état, bloc porte, électricité,
// plomberie, désordres…). Les rubriques se cochent d'elles-mêmes : une
// finition quand l'analyse l'a remplie, une famille d'équipements dès qu'un
// point de son calque est posé dans la pièce (ou qu'un élément y est relevé).
// Seule liste : la changer ici. Pur, testé (tests/etat-des-lieux-visite.test.js).

import { typeEdl } from '../calquesEdl.js'
import { porteDe } from '../statutsEdl.js'

const rempli = (v) => v != null && String(v).trim() !== ''

// `fiche` : rubriques de la fiche qui la cochent ; `calques` : un point ou
// un élément d'un de ces calques la coche
export const AIDE_MEMOIRE = [
  {
    cle: 'finitions', titre: 'Finitions et leur état',
    rubriques: [
      { cle: 'sol', libelle: 'Sol', aide: 'matériau, état', fiche: ['sol'] },
      { cle: 'murs', libelle: 'Murs', aide: 'revêtement, faïence, état', fiche: ['murs'] },
      { cle: 'plafond', libelle: 'Plafond', aide: 'matériau, dalles à remplacer (combien)', fiche: ['plafond'] },
      { cle: 'plinthes', libelle: 'Plinthes', aide: 'matériau, état', fiche: ['plinthes'] },
      { cle: 'hsp', libelle: 'Hauteur sous plafond', aide: 'si elle n’est pas sur le plan', fiche: ['hsp'], hspLue: true },
    ],
  },
  {
    cle: 'porte', titre: 'Bloc porte',
    rubriques: [{ cle: 'porte', libelle: 'Bloc porte', aide: 'huisserie, vantail, quincaillerie, état', porte: true }],
  },
  {
    cle: 'menuiseries', titre: 'Menuiseries',
    rubriques: [{ cle: 'menuiseries', libelle: 'Fenêtres, volets, stores', aide: 'un point par menuiserie, état', calques: ['menuiseries', 'occultations'] }],
  },
  {
    cle: 'equipements', titre: 'Équipements',
    rubriques: [
      { cle: 'electricite', libelle: 'Électricité', aide: 'interrupteurs, prises (combien), RJ45, luminaires, tableau', calques: ['electricite'] },
      { cle: 'plomberie', libelle: 'Plomberie', aide: 'appareils, arrivées et évacuations', calques: ['plomberie'] },
      { cle: 'chauffage', libelle: 'Chauffage, ventilation', aide: 'radiateurs (dimensions), thermostat, bouches VMC', calques: ['chauffage', 'ventilation'] },
      { cle: 'securite', libelle: 'Sécurité', aide: 'détecteur de fumée, BAES, extincteur', calques: ['securite', 'compteurs'] },
    ],
  },
  {
    cle: 'desordres', titre: 'Désordres',
    rubriques: [{ cle: 'desordres', libelle: 'Désordres', aide: 'fissures, humidité, dégradations, matériau suspect : pointer et photographier', calques: ['desordres'] }],
  },
]

export const RAPPEL_ETAT = 'Pour chaque matériau, dites son état : à conserver, à rafraîchir ou à déposer.'

const calqueDuPoint = (point) => typeEdl(point?.type)?.calque ?? null

/**
 * L'aide-mémoire d'une pièce, rubriques cochées d'après ce qui est déjà relevé.
 * @param piece { id, fiche, hsp_lue }
 * @param points points de l'étage (seuls ceux de la pièce comptent)
 * @param elements lignes `edl_elements` connues (seules celles de la pièce comptent)
 * @returns { groupes: [{ cle, titre, rubriques: [{ cle, libelle, aide, fait }] }], faites, total }
 */
export function aideMemoire(piece, { points = [], elements = [] } = {}) {
  const fiche = piece?.fiche ?? null
  const calques = new Set()
  for (const p of points) if (p.piece_id === piece?.id) calques.add(calqueDuPoint(p))
  for (const e of elements) if (e.piece_id === piece?.id && e.calque) calques.add(e.calque)
  const hspLue = Number(piece?.hsp_lue) > 0

  let faites = 0
  let total = 0
  const groupes = AIDE_MEMOIRE.map((g) => ({
    cle: g.cle,
    titre: g.titre,
    rubriques: g.rubriques.map((r) => {
      let fait = false
      if (r.fiche) fait = r.fiche.some((c) => rempli(fiche?.[c])) || (!!r.hspLue && hspLue)
      else if (r.porte) fait = Object.values(porteDe(fiche)).some(rempli)
      else if (r.calques) fait = r.calques.some((c) => calques.has(c))
      total++
      if (fait) faites++
      return { cle: r.cle, libelle: r.libelle, aide: r.aide, fait }
    }),
  }))
  return { groupes, faites, total }
}

// Ouverture à chaque entrée dans une pièce : réglage de l'appareil (un
// collaborateur rodé peut la couper), lu et écrit sans jamais casser l'écran
const CLE_OUVERTURE = 'jga.edl.aide-memoire.ouvrir'

export function ouvrirAChaqueEntree(stockage = globalThis.localStorage) {
  try { return stockage?.getItem(CLE_OUVERTURE) !== 'non' } catch { return true }
}

export function memoriserOuverture(oui, stockage = globalThis.localStorage) {
  try { stockage?.setItem(CLE_OUVERTURE, oui ? 'oui' : 'non') } catch { /* stockage indisponible : réglage de la séance seulement */ }
}
