// ─── Mode Visite : logique pure ──────────────────────────────────────────────
//
// Sans navigateur ni base, pour être testée (tests/visite.test.js).

import { sansAccents, infosStatut, estEnRetard, passeFiltre, FILTRE_VIDE } from './crLogique'

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

export function filtreVisite(id, destinataire = '', recherche = '') {
  const f = FILTRES_VISITE.find((x) => x.id === id) ?? FILTRES_VISITE[0]
  return { ...FILTRE_VIDE, familles: f.familles, enRetard: !!f.enRetard, destinataire, recherche }
}

/**
 * Cartes du mode Visite, groupées par section dans l'ordre de l'éditeur.
 * Chaque remarque garde le code de sa sous-section pour l'afficher.
 * @returns [{ section, remarques: [{ ...remarque, sousSection }] }] sans groupe vide
 */
export function groupesVisite(sections, filtre, dateReference) {
  return (sections ?? []).map((section) => {
    const remarques = [
      ...(section.sousSections ?? []).flatMap((ss) => (ss.remarques ?? []).map((r) => ({ ...r, sousSection: ss }))),
      ...(section.directRemarques ?? []).map((r) => ({ ...r, sousSection: null })),
    ].filter((r) => passeFiltre(r, filtre, dateReference))
    return { section, remarques }
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

/**
 * Remarques types proposées pendant la saisie. Sans saisie : les plus
 * utilisées. Avec saisie : celles qui contiennent tous les mots tapés (sans
 * accents ni casse), en tête celles qui commencent par la saisie, puis par
 * utilisation. Le texte déjà saisi en entier n'est pas reproposé.
 */
export function suggestionsTypes(types, saisie, max = 6) {
  const q = sansAccents(normaliserTexte(saisie))
  const mots = q.split(' ').filter(Boolean)
  return (types ?? [])
    .map((t) => ({ t, n: sansAccents(normaliserTexte(t.texte)) }))
    .filter(({ n }) => n !== q && mots.every((mot) => n.includes(mot)))
    .sort((a, b) => (Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)))
      || (b.t.utilisations ?? 0) - (a.t.utilisations ?? 0)
      || String(b.t.derniere_utilisation ?? '').localeCompare(String(a.t.derniere_utilisation ?? '')))
    .slice(0, max)
    .map(({ t }) => t)
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
