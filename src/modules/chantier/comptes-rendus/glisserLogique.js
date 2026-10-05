// ─── Glisser une remarque vers un autre destinataire ─────────────────────────
//
// Pendant le glissement, une bande montre tous les destinataires de l'affaire
// (lots, puis personnes de l'équipe) : on lâche la remarque sur le bon. Ce
// qui se calcule sans écran vit ici (tests/glisser.test.js).

import { libelleLot, libelleRole, nomInterlocuteur } from './remarquesLogique'

/** Les cibles de la bande : lots par numéro, puis personnes dans l'ordre de l'équipe. */
export function ciblesDeDepot({ lots = [], interlocuteurs = [] } = {}) {
  return {
    entreprises: [...lots]
      .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
      .map((l) => ({ cle: `lot:${l.id}`, libelle: libelleLot(l), detail: l.raison_sociale ?? null })),
    equipe: [...interlocuteurs]
      .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99))
      .map((i) => ({ cle: `interlo:${i.id}`, libelle: nomInterlocuteur(i) || libelleRole(i), detail: libelleRole(i) })),
  }
}

/** Destinataire actuel d'une remarque, sous la même forme que les cibles. */
export function destinataireDe(rem) {
  if (rem?.lot_id) return `lot:${rem.lot_id}`
  if (rem?.interlocuteur_id) return `interlo:${rem.interlocuteur_id}`
  return null
}

/**
 * Une remarque se glisse-t-elle ? Les suites suivent leur remarque, les
 * observations des intervenants restent dans leur section, et il faut
 * pouvoir la modifier.
 */
export function peutGlisser(rem, { lectureSeule = false, sectionType = null } = {}) {
  if (lectureSeule || !rem || rem.parent_id) return false
  return sectionType === null || sectionType === 'equipe' || sectionType === 'entreprises'
}

/** Lâchée là, la remarque change-t-elle de destinataire ? */
export function depotUtile(rem, cible) {
  return !!cible && cible !== destinataireDe(rem)
}
