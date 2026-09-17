// Contrôle au pixel d'un plan allégé : ce qui compte comme une différence.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { comparerPixels, pageConforme, SEUIL_FRANC } from '../src/tools/rasterisation/vectoriel/comparaison.js'

const image = (largeur, hauteur, couleur = 255) => new Uint8ClampedArray(largeur * hauteur * 4).fill(couleur)

describe('comparaison de deux rendus', () => {
  test('deux rendus identiques : aucun écart', () => {
    const r = comparerPixels(image(10, 10), image(10, 10), 10)
    assert.equal(r.francs, 0)
    assert.equal(r.legers, 0)
    assert.equal(pageConforme(r), true)
  })

  test('un trait disparu donne des écarts francs, localisés', () => {
    const a = image(20, 10)
    const b = image(20, 10)
    for (let x = 5; x < 15; x++) { const i = (4 * 20 + x) * 4; a[i] = a[i + 1] = a[i + 2] = 0 }
    const r = comparerPixels(a, b, 20)
    assert.equal(r.francs, 10)
    assert.deepEqual(r.emprise, [5, 4, 14, 4])
    assert.equal(pageConforme(r), false)
  })

  test('un bord adouci différemment ne compte que comme écart léger', () => {
    const a = image(10, 10)
    const b = image(10, 10)
    b[0] = b[1] = b[2] = 255 - (SEUIL_FRANC - 40)
    const r = comparerPixels(a, b, 10)
    assert.equal(r.francs, 0)
    assert.equal(r.legers, 1)
  })

  test('quelques pixels isolés restent tolérés sur une grande page', () => {
    assert.equal(pageConforme({ francs: 3, total: 5_000_000 }), true)
    assert.equal(pageConforme({ francs: 200, total: 5_000_000 }), false)
  })
})
