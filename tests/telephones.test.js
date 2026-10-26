// Téléphones : fixe et portable (migration 076).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  estPortable, decouperNumeros, repartirNumeros, numerosFiche, texteTelephones, erreurPortable, sansPortable,
} from '../src/shared/telephones.js'
import { ecrireAvecReplis } from '../src/shared/repliColonnes.js'

test('un numéro en 06 / 07 est un portable', () => {
  assert.equal(estPortable('06 12 34 56 78'), true)
  assert.equal(estPortable('+33 7 12 34 56 78'), true)
  assert.equal(estPortable('0033 6 12 34 56 78'), true)
  assert.equal(estPortable('03 21 00 00 00'), false)
  assert.equal(estPortable(null), false)
})

test('un champ à deux numéros se découpe', () => {
  assert.deepEqual(decouperNumeros('06 12 34 56 78 / 03 21 00 00 00'), ['06 12 34 56 78', '03 21 00 00 00'])
  assert.deepEqual(decouperNumeros(''), [])
})

test('répartition d’un ancien champ entre fixe et portable', () => {
  assert.deepEqual(repartirNumeros('06 12 34 56 78'), { fixe: null, portable: '06 12 34 56 78' })
  assert.deepEqual(repartirNumeros('03 21 00 00 00'), { fixe: '03 21 00 00 00', portable: null })
  assert.deepEqual(repartirNumeros('03 21 00 00 00 / 06 12 34 56 78'), { fixe: '03 21 00 00 00', portable: '06 12 34 56 78' })
  // Rien ne se perd : ce qui n'est pas un numéro reste au fixe
  assert.deepEqual(repartirNumeros('06 12 34 56 78, standard'), { fixe: 'standard', portable: '06 12 34 56 78' })
  assert.deepEqual(repartirNumeros(null), { fixe: null, portable: null })
})

test('les numéros d’une fiche gardent leur nature', () => {
  assert.deepEqual(numerosFiche('03 21 00 00 00', '06 12 34 56 78'), [
    { numero: '03 21 00 00 00', portable: false },
    { numero: '06 12 34 56 78', portable: true },
  ])
  // Un portable resté dans le champ fixe (saisi avant la migration)
  assert.deepEqual(numerosFiche('07 11 22 33 44', null), [{ numero: '07 11 22 33 44', portable: true }])
})

test('les deux numéros sur une ligne', () => {
  assert.equal(texteTelephones('03 21', '06 12'), '03 21 · 06 12')
  assert.equal(texteTelephones(null, '06 12'), '06 12')
  assert.equal(texteTelephones('', ''), '')
})

test('sans la migration, le portable rejoint le fixe', () => {
  assert.equal(erreurPortable({ message: "Could not find the 'telephone_portable' column" }), true)
  assert.equal(erreurPortable({ message: 'autre' }), false)
  assert.deepEqual(sansPortable({ nom: 'A', telephone: '03 21', telephone_portable: '06 12' }), { nom: 'A', telephone: '03 21 / 06 12' })
  assert.deepEqual(sansPortable({ telephone: '03 21', telephone_portable: '' }), { telephone: '03 21' })
  assert.deepEqual(sansPortable({ moa_telephone: '', moa_telephone_portable: '06 12' }), { moa_telephone: '06 12' })
  assert.deepEqual(sansPortable({ nom: 'A' }), { nom: 'A' })
})

test('les replis s’enchaînent, un par erreur reconnue', async () => {
  const envois = []
  const ecrire = async (ligne) => {
    envois.push(ligne)
    if ('a' in ligne) return { error: { message: 'a' } }
    if ('b' in ligne) return { error: { message: 'b' } }
    return { error: null, data: ligne }
  }
  const sans = (cle) => (l) => { const c = { ...l }; delete c[cle]; return c }
  const { data, error } = await ecrireAvecReplis(ecrire, { a: 1, b: 2, c: 3 }, [
    [(e) => e.message === 'b', sans('b')],
    [(e) => e.message === 'a', sans('a')],
  ])
  assert.equal(error, null)
  assert.deepEqual(data, { c: 3 })
  assert.equal(envois.length, 3)
  // Une erreur inconnue est rendue telle quelle
  const r = await ecrireAvecReplis(async () => ({ error: { message: 'z' } }), {}, [[(e) => e.message === 'a', (l) => l]])
  assert.equal(r.error.message, 'z')
})
