// Convocations du CR précédent, rappelées au pointage des présences.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cleParticipant, convocationsDe, convocationDe, libelleConvocation, convoquesDabord } from '../src/modules/chantier/comptes-rendus/convocationLogique.js'

const precedent = [
  { id: 'x1', interlocuteur_id: 'moa', convoque: true, heure_convocation: '09:00:00' },
  { id: 'x2', lot_entreprise_id: 'le-go', convoque: true, heure_convocation: null },
  { id: 'x3', lot_entreprise_id: 'le-pl', convoque: false },
]
const convocations = convocationsDe(precedent, 2)

test('un participant se reconnaît d’un CR à l’autre par sa fiche ou son lot', () => {
  assert.equal(cleParticipant({ id: 'a', interlocuteur_id: 'moa' }), 'i:moa')
  assert.equal(cleParticipant({ id: 'b', lot_entreprise_id: 'le-go' }), 'l:le-go')
  assert.equal(cleParticipant({ id: 'c' }), null)
})

test('seuls les convoqués du CR précédent, avec l’heure', () => {
  assert.deepEqual([...convocations.entries()], [['i:moa', { numero: 2, heure: '09:00' }], ['l:le-go', { numero: 2, heure: null }]])
  assert.deepEqual(convocationDe({ id: 'nouvelle-ligne', interlocuteur_id: 'moa' }, convocations), { numero: 2, heure: '09:00' })
  assert.equal(convocationDe({ lot_entreprise_id: 'le-pl' }, convocations), null)
})

test('la mention', () => {
  assert.equal(libelleConvocation({ numero: 2, heure: '09:00' }), 'Convoqué au CR n°2 · 09h00')
  assert.equal(libelleConvocation({ numero: 2, heure: null }), 'Convoqué au CR n°2')
  assert.equal(libelleConvocation(null), '')
})

test('les convoqués en tête, l’ordre habituel conservé', () => {
  const liste = [{ lot_entreprise_id: 'le-pl' }, { lot_entreprise_id: 'le-ch' }, { lot_entreprise_id: 'le-go' }]
  assert.deepEqual(convoquesDabord(liste, convocations).map((p) => p.lot_entreprise_id), ['le-go', 'le-pl', 'le-ch'])
  assert.deepEqual(convoquesDabord(liste, new Map()).map((p) => p.lot_entreprise_id), ['le-pl', 'le-ch', 'le-go'])
})
