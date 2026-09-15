// Mode Visite : filtres, regroupement, compteurs, échéances rapides,
// suggestions de remarques types, dictée.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  filtreVisite, groupesVisite, compteursVisite, echeanceRapide, suggestionsTypes, ajouterDictee, normaliserTexte,
} from '../src/modules/chantier/comptes-rendus/visiteLogique.js'

const sections = [
  { id: 'S1', titre: 'Général', sousSections: [
    { id: 'SS1', code: '1', remarques: [
      { id: 'a', statut: 'urgent', description: 'Enduit', date_echeance: '2026-09-01' },
      { id: 'b', statut: 'fait', est_clos: true, description: 'Teintes' },
    ] },
  ], directRemarques: [{ id: 'c', statut: 'pour_memoire', description: 'Menuiseries', lot_id: 'L1' }] },
  { id: 'S2', titre: 'Vide', sousSections: [], directRemarques: [{ id: 'd', statut: 'annule', est_clos: true, description: 'x' }] },
]

describe('groupesVisite', () => {
  test('« Ouvertes » par défaut : sections sans remarque ouverte masquées', () => {
    const g = groupesVisite(sections, filtreVisite('ouvertes'), '2026-09-15')
    assert.deepEqual(g.map((x) => [x.section.id, x.remarques.map((r) => r.id)]), [['S1', ['a', 'c']]])
    assert.equal(g[0].remarques[0].sousSection.code, '1')
    assert.equal(g[0].remarques[1].sousSection, null)
  })
  test('en retard, closes, destinataire, recherche', () => {
    assert.deepEqual(groupesVisite(sections, filtreVisite('retard'), '2026-09-15').flatMap((x) => x.remarques.map((r) => r.id)), ['a'])
    assert.deepEqual(groupesVisite(sections, filtreVisite('closes'), '2026-09-15').flatMap((x) => x.remarques.map((r) => r.id)), ['b', 'd'])
    assert.deepEqual(groupesVisite(sections, filtreVisite('toutes', 'lot:L1'), '2026-09-15').flatMap((x) => x.remarques.map((r) => r.id)), ['c'])
    assert.deepEqual(groupesVisite(sections, filtreVisite('toutes', '', 'teinte'), '2026-09-15').flatMap((x) => x.remarques.map((r) => r.id)), ['b'])
  })
})

test('compteursVisite', () => {
  assert.deepEqual(compteursVisite(sections, '2026-09-15'), { total: 4, ouvertes: 2, aTraiter: 1, enRetard: 1 })
})

test('echeanceRapide : semaines calendaires, passage de mois et d’heure d’hiver', () => {
  assert.equal(echeanceRapide('2026-09-15', 1), '2026-09-22')
  assert.equal(echeanceRapide('2026-10-22', 2), '2026-11-05')
  assert.equal(echeanceRapide('2026-12-28', 1), '2027-01-04')
})

describe('suggestionsTypes', () => {
  const types = [
    { id: 1, texte: 'Nettoyage de fin de journée non réalisé', utilisations: 12 },
    { id: 2, texte: 'Protection des menuiseries à reprendre', utilisations: 30 },
    { id: 3, texte: 'Nettoyer les abords du chantier', utilisations: 2 },
    { id: 4, texte: 'Évacuation des gravats', utilisations: 5 },
  ]
  test('sans saisie : les plus utilisées d’abord', () => {
    assert.deepEqual(suggestionsTypes(types, '').map((t) => t.id), [2, 1, 4, 3])
  })
  test('tous les mots tapés, sans accents ; début de texte en tête', () => {
    assert.deepEqual(suggestionsTypes(types, 'nettoy').map((t) => t.id), [1, 3])
    assert.deepEqual(suggestionsTypes(types, 'evacuation').map((t) => t.id), [4])
    assert.deepEqual(suggestionsTypes(types, 'reprendre protection').map((t) => t.id), [2])
    assert.deepEqual(suggestionsTypes(types, 'fin chantier').map((t) => t.id), [])
  })
  test('texte déjà saisi en entier : pas reproposé', () => {
    assert.deepEqual(suggestionsTypes(types, 'évacuation des  gravats').map((t) => t.id), [])
  })
})

test('ajouterDictee', () => {
  assert.equal(ajouterDictee('', 'reprendre l’enduit'), 'Reprendre l’enduit')
  assert.equal(ajouterDictee('Reprendre l’enduit', 'côté nord'), 'Reprendre l’enduit côté nord')
  assert.equal(ajouterDictee('Fait.', 'reste la façade'), 'Fait. Reste la façade')
  assert.equal(ajouterDictee('Texte ', '  '), 'Texte ')
})

test('normaliserTexte', () => {
  assert.equal(normaliserTexte('  deux   espaces '), 'deux espaces')
})
