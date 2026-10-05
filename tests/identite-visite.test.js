// Numéro, date et rédacteur d'une visite, modifiés depuis son tableau de bord.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { erreurNumero, redacteursPossibles } from '../src/modules/chantier/comptes-rendus/identiteVisiteLogique.js'

const visites = [
  { id: 'c1', numero: 1, date_reunion: '2026-09-14' },
  { id: 'c2', numero: 2, date_reunion: '2026-09-21' },
  { id: 'c3', numero: 3, date_reunion: null },
]

test('un numéro déjà attribué à une autre visite est refusé, avec sa date', () => {
  assert.equal(erreurNumero(2, visites, 'c1'), 'Le numéro 2 est déjà attribué à la visite du 21 septembre 2026.')
  assert.equal(erreurNumero('3', visites, 'c1'), 'Le numéro 3 est déjà attribué à une autre visite.')
})

test('garder son propre numéro, ou en prendre un libre', () => {
  assert.equal(erreurNumero(1, visites, 'c1'), null)
  assert.equal(erreurNumero(4, visites, 'c1'), null)
})

test('un numéro doit être un entier positif', () => {
  for (const s of ['', '0', '-2', '1.5', 'abc']) assert.ok(erreurNumero(s, visites, 'c1'), s)
})

const profils = [
  { id: 'vg', prenom: 'Victor', nom: 'Guyon', type_compte: 'agence' },
  { id: 'ct', prenom: 'Claire', nom: 'Tissot', type_compte: 'agence' },
  { id: 'jg', prenom: 'Jacques', nom: 'Gerbe', type_compte: 'agence' },
  { id: 'bet', prenom: 'Paul', nom: 'Bet', type_compte: 'exterieur' },
]

test('rédacteurs : les collaborateurs de l’affaire, pas les extérieurs', () => {
  const collab = [
    { user_id: 'vg', role: 'proprietaire' },
    { user_id: 'ct', role: 'collaborateur' },
    { user_id: 'bet', role: 'exterieur' },
  ]
  assert.deepEqual(redacteursPossibles(profils, collab).map((r) => r.id), ['ct', 'vg'])
})

test('affaire sans collaborateur : toute l’agence', () => {
  assert.deepEqual(redacteursPossibles(profils, []).map((r) => r.id), ['ct', 'jg', 'vg'])
})

test('le rédacteur déjà choisi qui n’a plus accès reste visible, signalé', () => {
  const liste = redacteursPossibles(profils, [{ user_id: 'vg', role: 'proprietaire' }], 'jg')
  assert.deepEqual(liste.map((r) => [r.id, r.sansAcces]), [['vg', false], ['jg', true]])
})
