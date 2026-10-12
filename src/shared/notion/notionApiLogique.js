// ─── Forme des échanges avec l'API Notion ────────────────────────────────────
//
// Partagé par le passeur (api/notion.js) et les tests. Les noms des colonnes
// sont ceux du Planning hebdomadaire et de la base des affaires de l'agence :
// la structure de Notion ne change pas, l'app s'y adapte.

import { COLONNE_ECHEANCES, numeroAffaire } from './echeancesNotionLogique.js'

export const PROPRIETES = { titre: 'N° Affaire', jour: 'Jour', semaine: 'Semaine', reference: 'Référence', equipe: '👤 Equipe JGA' }

// Fiches de la base « Equipe JGA », reliée aux cartes par la colonne équipe
const FICHE = { nom: 'Nom', role: 'Role', actif: 'Actif' }
const EQUIPE_MAX = 30

const colonne = { property: PROPRIETES.jour, multi_select: { contains: COLONNE_ECHEANCES } }

export function filtreEcheances(numero) {
  if (!numero) return colonne
  return { and: [colonne, { property: PROPRIETES.titre, title: { contains: numero } }] }
}

/** Base des affaires : en entier pour le calendrier, le seul numéro pour un planning. */
export function filtreAtelier(numero) {
  return numero ? { property: PROPRIETES.reference, title: { contains: numero } } : null
}

/** La carte est-elle toujours dans la colonne « ECHEANCES RENDUS » ? */
export function dansColonne(page) {
  return (page?.properties?.[PROPRIETES.jour]?.multi_select ?? []).some((o) => o?.name === COLONNE_ECHEANCES)
}

const texteTitre = (prop) => (prop?.title ?? []).map((t) => t.plain_text ?? '').join('')

export function carteDepuisPage(page) {
  return {
    id: page.id, titre: texteTitre(page.properties?.[PROPRIETES.titre]), creeLe: page.created_time, modifieLe: page.last_edited_time,
    equipe: (page.properties?.[PROPRIETES.equipe]?.relation ?? []).map((r) => r.id),
  }
}

/** La base « Equipe JGA » se retrouve par la colonne équipe du Planning : aucune variable de plus. */
export function sourceEquipe(sourcePlanning) {
  return sourcePlanning?.properties?.[PROPRIETES.equipe]?.relation?.data_source_id ?? null
}

export function membreEquipeDepuisPage(page) {
  const p = page.properties ?? {}
  return { id: page.id, nom: texteTitre(p[FICHE.nom]).trim(), role: p[FICHE.role]?.select?.name ?? null, actif: p[FICHE.actif]?.checkbox === true }
}

export const relationEquipe = (equipe) => ({ [PROPRIETES.equipe]: { relation: equipe.map((id) => ({ id })) } })

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
  ...(valeurs.equipe?.length ? relationEquipe(valeurs.equipe) : {}),
})

const ID_PAGE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

const PAGES_CONNUES_MAX = 200

/**
 * Cartes déjà liées que la lecture d'un planning doit retrouver même si leur
 * titre ne contient plus le numéro (en cours de frappe, numéro changé) : sans
 * elles, la carte paraîtrait supprimée. Identifiants contrôlés, sans doublon.
 */
export function pagesAVerifier(liste) {
  if (!Array.isArray(liste)) return []
  const vues = new Set()
  const pages = []
  for (const id of liste) {
    if (typeof id !== 'string' || !ID_PAGE.test(id)) continue
    const cleId = id.replace(/-/g, '').toLowerCase()
    if (vues.has(cleId)) continue
    vues.add(cleId)
    pages.push(id)
    if (pages.length === PAGES_CONNUES_MAX) break
  }
  return pages
}

/** Une opération reçue du navigateur n'entre ni dans une adresse ni dans Notion sans ce contrôle. */
const equipeValide = (equipe) => Array.isArray(equipe) && equipe.length > 0 && equipe.length <= EQUIPE_MAX
  && equipe.every((id) => typeof id === 'string' && ID_PAGE.test(id))

export function operationValide(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return false
  if (!['creer', 'modifier', 'corbeille', 'equipe'].includes(op.action)) return false
  if (op.action !== 'creer' && !(typeof op.pageId === 'string' && ID_PAGE.test(op.pageId))) return false
  if (op.action === 'corbeille') return true
  if (op.action === 'equipe') return equipeValide(op.equipe)
  if (op.equipe != null && !equipeValide(op.equipe)) return false
  if (typeof op.titre !== 'string' || !op.titre || op.titre.length > 2000) return false
  return op.semaine == null || (typeof op.semaine === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(op.semaine))
}
