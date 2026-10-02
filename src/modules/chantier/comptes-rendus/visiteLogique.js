// ─── Mode Visite : logique pure ──────────────────────────────────────────────
//
// Sans navigateur ni base, pour être testée (tests/visite.test.js).

import { infosStatut, estEnRetard, passeFiltre, FILTRE_VIDE } from './crLogique'
import { estPartieRemarques, groupesDestinataires } from './remarquesLogique'

// Filtres du mode Visite, en gros boutons. « Ouvertes » par défaut : sur le
// chantier, on passe en revue ce qui reste à lever.
export const FILTRES_VISITE = [
  { id: 'ouvertes', libelle: 'Ouvertes', familles: ['rouge', 'orange', 'bleu'] },
  { id: 'a_traiter', libelle: 'À traiter', familles: ['rouge'] },
  { id: 'en_cours', libelle: 'En cours', familles: ['orange'] },
  { id: 'info', libelle: 'Pour info', familles: ['bleu'] },
  { id: 'retard', libelle: 'En retard', familles: [], enRetard: true },
  { id: 'closes', libelle: 'Closes', familles: ['vert'] },
  { id: 'toutes', libelle: 'Toutes', familles: [] },
]

export function filtreVisite(id, destinataire = '', recherche = '', zone = '') {
  const f = FILTRES_VISITE.find((x) => x.id === id) ?? FILTRES_VISITE[0]
  return { ...FILTRE_VIDE, familles: f.familles, enRetard: !!f.enRetard, destinataire, recherche, zone }
}

/**
 * Cartes du mode Visite, groupées par section dans l'ordre de l'éditeur.
 * Chaque remarque garde le code de sa sous-section pour l'afficher.
 *
 * Les parties VI et VII (migration 054) sont découpées par destinataire —
 * lot ou rôle — dans `sousGroupes`, quand `contexte` ({ lots,
 * interlocuteurs }) est fourni ; null pour les autres sections.
 *
 * @returns [{ section, remarques: [{ ...remarque, sousSection }], sousGroupes }] sans groupe vide
 */
export function groupesVisite(sections, filtre, dateReference, contexte = null) {
  return (sections ?? []).map((section) => {
    const remarques = [
      ...(section.sousSections ?? []).flatMap((ss) => (ss.remarques ?? []).map((r) => ({ ...r, sousSection: ss }))),
      ...(section.directRemarques ?? []).map((r) => ({ ...r, sousSection: null })),
    ].filter((r) => passeFiltre(r, filtre, dateReference))
    const sousGroupes = contexte && estPartieRemarques(section) ? groupesDestinataires(remarques, contexte) : null
    return { section, remarques, sousGroupes }
  }).filter((g) => g.remarques.length > 0)
}

export function compteursVisite(sections, dateReference) {
  const toutes = (sections ?? []).flatMap((s) => [
    ...(s.directRemarques ?? []),
    ...(s.sousSections ?? []).flatMap((ss) => ss.remarques ?? []),
  ])
  return {
    total: toutes.length,
    ouvertes: toutes.filter((r) => !infosStatut(r).clos).length,
    aTraiter: toutes.filter((r) => infosStatut(r).famille === 'rouge').length,
    enRetard: toutes.filter((r) => estEnRetard(r, dateReference)).length,
  }
}

// Date + n semaines, au format 'YYYY-MM-DD', en date locale
export function echeanceRapide(dateBase, semaines) {
  const [a, m, j] = String(dateBase).split('-').map(Number)
  const d = new Date(a, m - 1, j + 7 * semaines)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function normaliserTexte(texte) {
  return String(texte ?? '').trim().replace(/\s+/g, ' ')
}

// Texte dicté ajouté à la saisie : espace entre les deux, majuscule en début
// de phrase
export function ajouterDictee(texte, ajout) {
  const morceau = normaliserTexte(ajout)
  if (!morceau) return texte
  const base = String(texte ?? '').replace(/\s+$/, '')
  const debutPhrase = !base || /[.!?]$/.test(base)
  const phrase = debutPhrase ? morceau[0].toUpperCase() + morceau.slice(1) : morceau
  return base ? `${base} ${phrase}` : phrase
}
