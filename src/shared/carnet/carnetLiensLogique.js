// ─── Carnet d'adresses : où une personne et une organisation interviennent ───
//
// Conception : docs/superpowers/specs/2026-10-13-carnet-interlocuteurs-design.md.
// Une personne du carnet sert dans une affaire comme représentant d'un lot
// (`lot_entreprises.interlocuteur_id`) ou comme contact de l'affaire
// (`affaire_interlocuteurs.interlocuteur_id`, migration 072). Une organisation
// y sert par ses lots, par ses contacts reliés à elle, et par ceux de ses
// personnes. Pur (tests/carnet-liens.test.js).

import { CATEGORIE_META } from './categoriesContact.js'
import { numeroLot } from '../lots/numeroLot.js'

export const TYPES_ORGANISATION = [
  { code: 'entreprise', libelle: 'Entreprise', pluriel: 'Entreprises' },
  { code: 'bet', libelle: 'Bureau d’études', pluriel: 'Bureaux d’études' },
  { code: 'moa', libelle: 'Maître d’ouvrage', pluriel: 'Maîtres d’ouvrage' },
  { code: 'autre', libelle: 'Autre', pluriel: 'Autres' },
]

export const libelleType = (code) => (TYPES_ORGANISATION.find((t) => t.code === code) ?? TYPES_ORGANISATION[3]).libelle

// Copie de `carnet_cle` (migration 072) : modifier les deux ensemble
const DE = 'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿ'
const VERS = 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy'
export function cleComparaison(texte) {
  const developpe = String(texte ?? '').replace(/Œ/g, 'OE').replace(/œ/g, 'oe').replace(/Æ/g, 'AE').replace(/æ/g, 'ae')
  const traduit = [...developpe].map((c) => { const i = DE.indexOf(c); return i >= 0 ? VERS[i] : c }).join('')
  return traduit.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const libelleLot = (lot) => [`lot ${numeroLot(lot, { minimum: 2 })}`, lot?.nom].filter(Boolean).join(' ')
const libelleContact = (c) => (c.categorie === 'autre' && c.categorie_label) || CATEGORIE_META[c.categorie]?.label || 'Contact'

function trier(usages) {
  const vus = new Set()
  return usages
    .filter((u) => u.affaire && !vus.has(u.cle) && vus.add(u.cle))
    .sort((a, b) => (a.affaire.code_affaire ?? '').localeCompare(b.affaire.code_affaire ?? '') || a.role.localeCompare(b.role, 'fr'))
}

export function usagesDePersonne(personneId, { lots = [], contacts = [] } = {}) {
  return trier([
    ...lots.filter((l) => l.interlocuteur_id === personneId)
      .map((l) => ({ cle: `lot:${l.id}`, affaire: l.affaire, role: `représentant ${libelleLot(l.lot)}` })),
    ...contacts.filter((c) => c.interlocuteur_id === personneId)
      .map((c) => ({ cle: `contact:${c.id}`, affaire: c.affaire, role: libelleContact(c) })),
  ])
}

export function usagesDOrganisation(entreprise, { lots = [], contacts = [] } = {}) {
  const personnes = new Set((entreprise?.interlocuteurs ?? []).map((p) => p.id))
  return trier([
    ...lots.filter((l) => l.entreprise_id === entreprise?.id)
      .map((l) => ({ cle: `lot:${l.id}`, affaire: l.affaire, role: libelleLot(l.lot) })),
    ...contacts.filter((c) => c.entreprise_id === entreprise?.id || (c.interlocuteur_id && personnes.has(c.interlocuteur_id)))
      .map((c) => ({ cle: `contact:${c.id}`, affaire: c.affaire, role: libelleContact(c) })),
  ])
}

export function affairesDesUsages(usages) {
  const vues = new Map()
  for (const u of usages ?? []) if (!vues.has(u.affaire.id)) vues.set(u.affaire.id, u.affaire)
  return [...vues.values()]
}

export const personneSupprimable = (personneId, donnees) => usagesDePersonne(personneId, donnees).length === 0
