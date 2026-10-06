// Numéro d'un lot : le zéro saisi devant reste à l'affichage.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { numeroLot, libelleNumeroLot, lireNumeroSaisi } from '../src/shared/lots/numeroLot.js'

test('le texte saisi l’emporte sur le nombre', () => {
  assert.equal(numeroLot({ numero: 60, numero_affiche: '060' }), '060')
  assert.equal(numeroLot({ numero: 1, numero_affiche: '01' }), '01')
  assert.equal(numeroLot({ numero: 7 }), '7')
  assert.equal(numeroLot({ numero: null }), '')
})

test('le complément de zéros ne joue que sans texte saisi', () => {
  assert.equal(numeroLot({ numero: 3 }, { minimum: 2 }), '03')
  assert.equal(numeroLot({ numero: 60, numero_affiche: '060' }, { minimum: 2 }), '060')
})

test('libellé', () => {
  assert.equal(libelleNumeroLot({ numero: 60, numero_affiche: '060', nom: 'Menuiseries' }), 'Lot 060 — Menuiseries')
  assert.equal(libelleNumeroLot({ numero: null, nom: 'Divers' }), 'Divers')
})

test('saisie : chiffres seulement ; le texte n’est gardé que s’il a un zéro devant', () => {
  assert.deepEqual(lireNumeroSaisi('060'), { numero: 60, numero_affiche: '060' })
  assert.deepEqual(lireNumeroSaisi(' 7 '), { numero: 7, numero_affiche: null })
  assert.deepEqual(lireNumeroSaisi('0'), { numero: 0, numero_affiche: null })
  assert.equal(lireNumeroSaisi('7a'), null)
  assert.equal(lireNumeroSaisi(''), null)
})
