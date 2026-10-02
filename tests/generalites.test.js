// Comptes rendus, refonte (chantier 2) : généralités (parties I à V).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  normaliserGeneralites, aDuTexte, squeletteHabituel, copierPourImport,
  ajouter, modifier, supprimer, deplacer, prochainRomain, prochainCode, generalitesAImprimer,
} from '../src/modules/chantier/comptes-rendus/generalitesLogique.js'

let n = 0
const id = () => `id${++n}`

const exemple = () => normaliserGeneralites({
  parties: [
    { id: 'p1', numero_romain: 'I', titre: 'MISE AU POINT ADMINISTRATIVE', rubriques: [
      { id: 'r1', code: '1-1', titre: 'Réunion de chantier', paragraphes: [
        { id: 'a', date: '2025-03-27', texte: 'Réunion de chantier fixée tous les jeudis à 9h00' },
        { id: 'b', date: '2025-03-27', texte: 'Présence obligatoire', suite: true },
      ] },
      { id: 'r2', code: '1-2', titre: 'Situation de travaux - DGD', paragraphes: [] },
    ] },
    { id: 'p4', numero_romain: 'IV', titre: 'RESPECT', paragraphes: [{ id: 'c', date: '2025-03-27', texte: 'Respect du travail d’autrui' }] },
  ],
})

describe('forme', () => {
  test('une valeur absente ou abîmée donne des généralités vides, jamais une erreur', () => {
    for (const brut of [null, undefined, 'texte', [], { parties: 'x' }]) {
      assert.deepEqual(normaliserGeneralites(brut), { parties: [] })
    }
  })

  test('les listes manquantes sont complétées', () => {
    const g = normaliserGeneralites({ parties: [{ id: 'p', titre: 'X' }] })
    assert.deepEqual(g.parties[0].rubriques, [])
    assert.deepEqual(g.parties[0].paragraphes, [])
    assert.equal(g.parties[0].numero_romain, '')
  })

  test('du texte quelque part : à la racine d’une partie ou dans une rubrique', () => {
    assert.equal(aDuTexte(exemple()), true)
    assert.equal(aDuTexte(squeletteHabituel(id)), false)
    assert.equal(aDuTexte({ parties: [] }), false)
  })
})

describe('départ et import', () => {
  test('les cinq titres habituels, sans texte', () => {
    const g = squeletteHabituel(id)
    assert.deepEqual(g.parties.map((p) => p.numero_romain), ['I', 'II', 'III', 'IV', 'V'])
    assert.equal(g.parties[0].titre, 'MISE AU POINT ADMINISTRATIVE')
    assert.ok(g.parties[0].rubriques.length > 0)
    assert.ok(g.parties.every((p) => p.rubriques.every((r) => r.paragraphes.length === 0)))
  })

  test('l’import recopie tout avec de nouveaux identifiants', () => {
    const source = exemple()
    const copie = copierPourImport(source, id)
    assert.equal(copie.parties[0].rubriques[0].paragraphes[1].texte, 'Présence obligatoire')
    assert.equal(copie.parties[0].rubriques[0].paragraphes[1].suite, true)
    const ids = JSON.stringify(copie).match(/"id":"[^"]+"/g)
    assert.ok(ids.every((x) => !['"id":"p1"', '"id":"r1"', '"id":"a"'].includes(x)))
    assert.equal(source.parties[0].id, 'p1', 'la source n’est pas modifiée')
  })
})

describe('édition', () => {
  test('ajouter une partie, une rubrique, un paragraphe', () => {
    let g = exemple()
    g = ajouter(g, null, 'partie', id)
    assert.equal(g.parties.at(-1).numero_romain, 'V', 'numéro romain suivant le dernier')
    g = ajouter(g, 'p1', 'rubrique', id)
    assert.equal(g.parties[0].rubriques.at(-1).code, '1-3')
    g = ajouter(g, 'r2', 'paragraphe', id, { date: '2025-04-10' })
    assert.deepEqual(g.parties[0].rubriques[1].paragraphes.map((p) => [p.date, p.texte, p.suite]), [['2025-04-10', '', false]])
    g = ajouter(g, 'p4', 'paragraphe', id, { date: '2025-04-10' })
    assert.equal(g.parties[1].paragraphes.length, 2)
  })

  test('modifier, supprimer, déplacer un élément, à n’importe quel niveau', () => {
    let g = exemple()
    g = modifier(g, 'b', { texte: 'Présence obligatoire et contractuelle' })
    assert.equal(g.parties[0].rubriques[0].paragraphes[1].texte, 'Présence obligatoire et contractuelle')
    g = deplacer(g, 'b', -1)
    assert.deepEqual(g.parties[0].rubriques[0].paragraphes.map((p) => p.id), ['b', 'a'])
    g = deplacer(g, 'b', -1)
    assert.deepEqual(g.parties[0].rubriques[0].paragraphes.map((p) => p.id), ['b', 'a'], 'déjà en tête : rien ne bouge')
    g = deplacer(g, 'p4', -1)
    assert.deepEqual(g.parties.map((p) => p.id), ['p4', 'p1'])
    g = supprimer(g, 'r1')
    assert.deepEqual(g.parties[1].rubriques.map((r) => r.id), ['r2'])
  })

  test('numéros proposés', () => {
    assert.equal(prochainRomain([]), 'I')
    assert.equal(prochainRomain([{ numero_romain: 'IV' }]), 'V')
    assert.equal(prochainRomain([{ numero_romain: 'n’importe quoi' }]), 'II')
    assert.equal(prochainCode({ rubriques: [] }), '1-1')
    assert.equal(prochainCode({ rubriques: [{ code: '1-1' }, { code: '1-4' }] }), '1-5')
  })
})

describe('impression', () => {
  const affaire = exemple()
  const figee = { parties: [{ id: 'x', numero_romain: 'I', titre: 'VERSION DU JOUR', rubriques: [], paragraphes: [] }] }

  test('un CR émis imprime la version de son jour', () => {
    assert.equal(generalitesAImprimer({ statut: 'emis', generalites: figee }, affaire).parties[0].titre, 'VERSION DU JOUR')
  })

  test('un brouillon, ou un CR émis avant la migration 055, imprime celles de l’affaire', () => {
    assert.equal(generalitesAImprimer({ statut: 'brouillon', generalites: figee }, affaire).parties[0].titre, 'MISE AU POINT ADMINISTRATIVE')
    assert.equal(generalitesAImprimer({ statut: 'emis' }, affaire).parties[0].titre, 'MISE AU POINT ADMINISTRATIVE')
    assert.deepEqual(generalitesAImprimer({ statut: 'brouillon' }, null), { parties: [] })
  })
})
