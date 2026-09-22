// Zoom au pincement des plannings : valeur de zoom et défilement qui garde le
// point sous les doigts en place.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { zoomPincement } from '../src/shared/planning/pincement.js'

const base = { depart: 40, ecartDepart: 100, min: 4, max: 100, pointContenu: 1000, milieuX: 200 }

describe('zoom au pincement', () => {
  test('écarter les doigts zoome dans le même rapport', () => {
    assert.equal(zoomPincement({ ...base, ecart: 150 }).valeur, 60)
    assert.equal(zoomPincement({ ...base, ecart: 50 }).valeur, 20)
  })

  test('le point sous les doigts reste sous les doigts', () => {
    // 1 000 px de contenu au départ ; à ×1,5 il est à 1 500 px, toujours à 200 px du bord
    const { scrollLeft } = zoomPincement({ ...base, ecart: 150 })
    assert.equal(scrollLeft + base.milieuX, 1500)
  })

  test('les doigts qui glissent en pinçant font suivre le planning', () => {
    const { scrollLeft } = zoomPincement({ ...base, ecart: 100, milieuX: 260 })
    assert.equal(scrollLeft, 740)
  })

  test('bornes respectées', () => {
    assert.equal(zoomPincement({ ...base, ecart: 1000 }).valeur, 100)
    assert.equal(zoomPincement({ ...base, ecart: 1 }).valeur, 4)
  })

  test('arrondi au pas, sans queue de flottant', () => {
    assert.equal(zoomPincement({ ...base, pas: 0.5, ecart: 101 }).valeur, 40.5)
    assert.equal(zoomPincement({ ...base, depart: 0.3, min: 0.1, max: 4, pas: 0.01, ecart: 100 }).valeur, 0.3)
  })

  test('écarts invalides : rien ne bouge', () => {
    assert.equal(zoomPincement({ ...base, ecartDepart: 0, ecart: 50 }).valeur, 40)
    assert.equal(zoomPincement({ ...base, ecart: 0 }).valeur, 40)
  })

  test('jamais de défilement négatif', () => {
    assert.equal(zoomPincement({ ...base, pointContenu: 50, ecart: 50 }).scrollLeft, 0)
  })
})
