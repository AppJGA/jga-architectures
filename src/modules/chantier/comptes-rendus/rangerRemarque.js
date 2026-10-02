// ─── Où ranger une remarque selon son destinataire ───────────────────────────
//
// Commun au mode Visite et à l'éditeur de bureau : un lot range la remarque
// dans la partie VII, un interlocuteur dans la partie VI (migration 054). La
// partie est créée si elle manque encore — par la file des opérations, donc
// aussi hors ligne.

import { PARTIES_REMARQUES, typePourDestinataire } from './remarquesLogique'

/** Identifiant de la section de la partie qui reçoit ce destinataire. */
export async function sectionDeLaPartie(ops, sections, cle) {
  const type = typePourDestinataire(cle)
  if (!type) throw new Error('Choisissez à qui s’adresse la remarque.')
  const existante = sections.find((s) => s.type_section === type)
  if (existante) return existante.id
  const partie = PARTIES_REMARQUES.find((p) => p.type === type)
  return ops.addSection({ numero_romain: partie.numero_romain, titre: partie.titre, type_section: type })
}

/** Nouvelle remarque adressée : rangée dans sa partie. @returns son identifiant */
export async function creerRemarqueAdressee(ops, sections, cle, payload) {
  return ops.addSectionRemarque(await sectionDeLaPartie(ops, sections, cle), payload)
}

/**
 * Champs d'une modification : un destinataire de l'autre partie (lot ↔
 * interlocuteur) emmène la remarque dans cette partie. Une observation
 * d'intervenant extérieur reste dans sa section.
 */
export async function champsModification(ops, sections, remarque, cle, payload) {
  const actuelle = sections.find((s) => s.id === remarque.section_id)
  const type = typePourDestinataire(cle)
  if (!type || actuelle?.type_section === type || actuelle?.type_section === 'intervenants') return payload
  return { ...payload, section_id: await sectionDeLaPartie(ops, sections, cle), sous_section_id: null }
}
