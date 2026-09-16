// Ce qu'un compte extérieur voit de l'application (les droits eux-mêmes sont
// tenus en base, migrations 050 et 051 — voir pgtest/test050.mjs).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { phases, phasesPour } from '../src/modules/manifest.js'

describe('modules visibles selon le type de compte', () => {
  test('un compte agence voit tout le manifeste', () => {
    assert.deepEqual(phasesPour(true), phases)
  })

  test('un intervenant extérieur ne voit que les visites de chantier', () => {
    const vues = phasesPour(false)
    assert.deepEqual(vues.flatMap(p => p.modules.map(m => m.id)), ['comptes-rendus'])
  })

  test('une phase vidée de ses modules disparaît', () => {
    assert.deepEqual(phasesPour(false).map(p => p.id), ['chantier'])
  })

  test('le manifeste n’est pas modifié au passage', () => {
    phasesPour(false)
    assert.ok(phases.find(p => p.id === 'etude').modules.length > 0)
  })
})
