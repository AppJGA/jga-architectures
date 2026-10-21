// ─── Importer un jeu de plans : règle pure ───────────────────────────────────
//
// Chaque page de chaque PDF devient un plan de l'affaire (conception :
// docs/superpowers/specs/2026-10-21-module-plans-design.md). Pas de doublon :
// une page qui porte le nom d'un plan existant en devient la nouvelle version
// (indice suivant), sauf si on en fait expressément un nouveau plan. Deux
// pages du même import ne peuvent pas porter le même nom. Testé
// (tests/plans-module.test.js).

import { cleNom } from '../planning/importPlanning'

/** « Plan RDC.pdf » → « Plan RDC » ; page 3 d'un PDF de plusieurs pages → « Jeu APD – p. 3 ». */
export function nomPropose(nomFichier = '', page = 1, nbPages = 1) {
  const base = String(nomFichier).replace(/\.[^./]+$/, '').trim() || 'Plan'
  return nbPages > 1 ? `${base} – p. ${page}` : base
}

/** Le plan existant de même nom (sans majuscules, accents ni ligatures), ou null. */
export function cibleDe(nom, plans = []) {
  const cle = cleNom(nom)
  if (!cle) return null
  return plans.find((p) => cleNom(p.nom) === cle)?.id ?? null
}

/**
 * Les pages proposées, toutes cochées.
 * @param fichiers [{ id, nom, nbPages }] — une image compte une page
 * @returns [{ cle, fichierId, page, nom, coche, cible, nouveau }]
 */
export function pagesProposees(fichiers = [], plans = []) {
  return fichiers.flatMap((f) => Array.from({ length: Math.max(1, f.nbPages ?? 1) }, (_, k) => {
    const nom = nomPropose(f.nom, k + 1, f.nbPages ?? 1)
    return { cle: `${f.id}:${k + 1}`, fichierId: f.id, page: k + 1, nom, coche: true, cible: cibleDe(nom, plans), nouveau: false }
  }))
}

const modifier = (pages, cle, changement) => pages.map((p) => (p.cle === cle ? { ...p, ...changement(p) } : p))

/** Renommer une page : sa cible suit le nouveau nom (sauf page forcée en nouveau plan). */
export function renommerPage(pages, cle, nom, plans = []) {
  return modifier(pages, cle, () => ({ nom, cible: cibleDe(nom, plans) }))
}

/** En faire un nouveau plan malgré un plan du même nom (ou revenir à la nouvelle version). */
export function forcerNouveau(pages, cle, oui) {
  return modifier(pages, cle, () => ({ nouveau: !!oui }))
}

export function cocherPage(pages, cle, oui) {
  return modifier(pages, cle, () => ({ coche: !!oui }))
}

/**
 * Ce qui empêche l'import, page cochée par page cochée : nom vide, ou même
 * nom qu'une page cochée plus haut (deux plans du même nom se confondraient).
 * @returns Map cle → 'vide' | 'doublon'
 */
export function problemesImport(pages = []) {
  const problemes = new Map()
  const vus = new Set()
  for (const p of pages) {
    if (!p.coche) continue
    const cle = cleNom(p.nom)
    if (!cle) { problemes.set(p.cle, 'vide'); continue }
    if (vus.has(cle)) problemes.set(p.cle, 'doublon')
    vus.add(cle)
  }
  return problemes
}

/** Les pages à envoyer, dans l'ordre ; aucune tant qu'un problème reste. */
export function pagesAEnvoyer(pages = []) {
  if (problemesImport(pages).size) return []
  return pages.filter((p) => p.coche)
}

/** Ce que deviendra la page : nouvelle version d'un plan existant, ou nouveau plan. */
export const versionDe = (page) => (page.cible && !page.nouveau ? page.cible : null)
