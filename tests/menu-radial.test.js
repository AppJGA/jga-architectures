// Couronne d'actions d'une barre de planning : répartition des pétales.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { positionsPetales, ecartEntrePetales, RAYON_COURONNE } from '../src/shared/planning/positionsPetales.js'

const sept = ['params', 'move', 'resize', 'segment', 'dep', 'dup', 'del'].map(action => ({ action }))

describe('répartition des pétales', () => {
  test('le premier pétale est à midi', () => {
    const [premier] = positionsPetales(sept)
    assert.equal(premier.dx, 0)
    assert.equal(premier.dy, -RAYON_COURONNE)
  })

  test('tous sont à la même distance de la barre', () => {
    for (const p of positionsPetales(sept)) {
      assert.ok(Math.abs(Math.hypot(p.dx, p.dy) - RAYON_COURONNE) <= 1)
    }
  })

  test('sept pétales, également espacés : un septième de tour chacun', () => {
    const angles = positionsPetales(sept).map(p => Math.atan2(p.dy, p.dx))
    for (let i = 1; i < angles.length; i++) {
      let pas = angles[i] - angles[i - 1]
      if (pas < 0) pas += 2 * Math.PI
      assert.ok(Math.abs(pas - (2 * Math.PI) / 7) < 0.02)
    }
  })

  test('ils tournent dans le sens des aiguilles d’une montre', () => {
    const [, deuxieme] = positionsPetales(sept)
    assert.ok(deuxieme.dx > 0, 'le deuxième pétale est à droite de midi')
  })

  test('deux pétales voisins ne se chevauchent pas, jusqu’à huit actions', () => {
    for (const n of [6, 7, 8]) assert.ok(ecartEntrePetales(n) > 0, `${n} pétales`)
  })

  test('l’ordre et les libellés sont conservés', () => {
    assert.deepEqual(positionsPetales(sept).map(p => p.action), sept.map(a => a.action))
  })
})
