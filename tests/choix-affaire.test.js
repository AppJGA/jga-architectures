// Choisir une affaire en tapant : quelques lettres du nom ou du code suffisent,
// sans souci des majuscules ni des accents, et les meilleures réponses d'abord.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normaliser, filtrerAffaires, libelleAffaire } from '../src/shared/choixAffaireLogique.js'

const affaires = [
  { id: 'a1', code_affaire: '2618-LVV', nom: 'Logements Les Vignes', moa_nom: 'Habitat 21' },
  { id: 'a2', code_affaire: '2606-CPA', nom: 'Réhabilitation du CPA', moa_nom: 'Département' },
  { id: 'a3', code_affaire: '2621-ECO', nom: 'École Jules Ferry', moa_nom: 'Ville de Coligny' },
  { id: 'a4', code_affaire: '2531-LUD', nom: 'Ludothèque de Coligny', moa_nom: 'PACTES' },
  { id: 'a5', code_affaire: '2410-OEU', nom: 'Gros œuvre Maison Vignes', moa_nom: null },
]
const ids = (r) => r.map((a) => a.id)

test('normaliser : sans majuscules, accents ni ligatures', () => {
  assert.equal(normaliser('  École ŒUVRE  '), 'ecole oeuvre')
  assert.equal(normaliser(null), '')
})

test('saisie vide : toutes les affaires, par code', () => {
  assert.deepEqual(ids(filtrerAffaires(affaires, '')), ['a5', 'a4', 'a2', 'a1', 'a3'])
})

test('par code : le début du code d’abord', () => {
  assert.deepEqual(ids(filtrerAffaires(affaires, '26')), ['a2', 'a1', 'a3'])
  assert.deepEqual(ids(filtrerAffaires(affaires, 'lvv')), ['a1'])
  assert.deepEqual(ids(filtrerAffaires(affaires, '2606')), ['a2'])
})

test('par nom, sans accents, plusieurs mots', () => {
  assert.deepEqual(ids(filtrerAffaires(affaires, 'ecole')), ['a3'])
  assert.deepEqual(ids(filtrerAffaires(affaires, 'rehab')), ['a2'])
  assert.deepEqual(ids(filtrerAffaires(affaires, 'vignes')), ['a5', 'a1']) // à égalité : par code
  assert.deepEqual(ids(filtrerAffaires(affaires, 'vignes gros')), ['a5'])
  assert.deepEqual(ids(filtrerAffaires(affaires, 'oeuvre')), ['a5'])
})

test('le maître d’ouvrage compte aussi, après le code et le nom', () => {
  assert.deepEqual(ids(filtrerAffaires(affaires, 'coligny')), ['a4', 'a3'])
})

test('aucune correspondance, et plafond du nombre de réponses', () => {
  assert.deepEqual(filtrerAffaires(affaires, 'zzz'), [])
  assert.equal(filtrerAffaires(affaires, '', 2).length, 2)
})

test('libellé d’une affaire', () => {
  assert.equal(libelleAffaire(affaires[0]), '2618-LVV · Logements Les Vignes')
  assert.equal(libelleAffaire({ nom: 'Sans code' }), 'Sans code')
  assert.equal(libelleAffaire(null), '')
})
