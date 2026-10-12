// ─── Forme des échanges avec l'API Notion ────────────────────────────────────
//
// Partagé par le passeur (api/notion.js) et les tests. Les noms des colonnes
// sont ceux du Planning hebdomadaire et de la base des affaires de l'agence :
// la structure de Notion ne change pas, l'app s'y adapte.

import { COLONNE_ECHEANCES, numeroAffaire } from './echeancesNotionLogique.js'

export const PROPRIETES = { titre: 'N° Affaire', jour: 'Jour', semaine: 'Semaine', reference: 'Référence' }

const colonne = { property: PROPRIETES.jour, multi_select: { contains: COLONNE_ECHEANCES } }

export function filtreEcheances(numero) {
  if (!numero) return colonne
  return { and: [colonne, { property: PROPRIETES.titre, title: { contains: numero } }] }
}

const texteTitre = (prop) => (prop?.title ?? []).map((t) => t.plain_text ?? '').join('')

export function carteDepuisPage(page) {
  return { id: page.id, titre: texteTitre(page.properties?.[PROPRIETES.titre]), creeLe: page.created_time, modifieLe: page.last_edited_time }
}

export function referenceDepuisPage(page) {
  const reference = texteTitre(page.properties?.[PROPRIETES.reference]).trim()
  return { numero: numeroAffaire(reference), reference }
}

/** Titre et Semaine ; la colonne Jour ne s'écrit qu'à la création. */
export function proprietesCarte({ titre, semaine }) {
  return {
    [PROPRIETES.titre]: { title: [{ type: 'text', text: { content: titre } }] },
    [PROPRIETES.semaine]: { date: semaine ? { start: semaine } : null },
  }
}

export const proprietesNouvelleCarte = (valeurs) => ({
  ...proprietesCarte(valeurs),
  [PROPRIETES.jour]: { multi_select: [{ name: COLONNE_ECHEANCES }] },
})
