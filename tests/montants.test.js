// Montants : le HT prime, le TTC suit.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tvaAffaire, htDe, ttcDe, montantsAffaire, erreurColonnesHT, sansColonnesHT } from '../src/shared/montants.js'

test('taux de TVA de l’affaire, 20 % par défaut', () => {
  assert.equal(tvaAffaire({ taux_tva: 1.1 }), 1.1)
  assert.equal(tvaAffaire({}), 1.2)
  assert.equal(tvaAffaire({ taux_tva: 0 }), 1.2)
})

test('le HT enregistré prime ; sinon il se déduit du TTC', () => {
  assert.equal(htDe(1000, 9999, 1.2), 1000)
  assert.equal(htDe(null, 1200, 1.2), 1000)
  assert.equal(htDe('', 1055, 1.055), 1000)
  assert.equal(htDe(null, null, 1.2), null)
})

test('le TTC suit le HT, au centime', () => {
  assert.equal(ttcDe(1000, 1.2), 1200)
  assert.equal(ttcDe(333.33, 1.055), 351.66)
  assert.equal(ttcDe('', 1.2), null)
})

test('montants d’une affaire d’avant la migration', () => {
  assert.deepEqual(montantsAffaire({ taux_tva: 1.1, enveloppe_ttc: 1100000, montant_travaux_ttc: null, honoraires_ttc: 110000 }),
    { tva: 1.1, enveloppe: 1000000, travaux: null, honoraires: 100000 })
})

test('sans la migration : on réessaie sans les colonnes HT', () => {
  assert.equal(erreurColonnesHT({ message: "Could not find the 'enveloppe_ht' column" }), true)
  assert.equal(erreurColonnesHT({ message: 'autre' }), false)
  assert.deepEqual(sansColonnesHT({ nom: 'x', enveloppe_ht: 1, enveloppe_ttc: 1.2 }), { nom: 'x', enveloppe_ttc: 1.2 })
})
