// État des lieux, lot 2 (visite) : calques, logique de la visite, file
// d'attente. Plans et pièces inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { CALQUES, CALQUES_DE_POINT, calqueEdl, typeEdl, libellePoint } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'

describe('calques de l’état des lieux', () => {
  test('tous préfixés EDL-, codes uniques', () => {
    assert.ok(CALQUES.every((c) => c.nom.startsWith('EDL-')))
    assert.equal(new Set(CALQUES.map((c) => c.code)).size, CALQUES.length)
  })
  test('un code de type ne désigne qu’un seul type, tous calques confondus', () => {
    const codes = CALQUES.flatMap((c) => c.types.map((t) => t.code))
    assert.equal(new Set(codes).size, codes.length)
  })
  test('la barre d’icônes ne propose que les calques qui ont des types', () => {
    assert.deepEqual(CALQUES_DE_POINT.map((c) => c.code), [
      'plomberie', 'electricite', 'chauffage', 'ventilation', 'menuiseries', 'occultations', 'compteurs', 'securite', 'desordres',
    ])
  })
  test('un type retrouve son calque', () => {
    assert.deepEqual(typeEdl('radiateur'), { code: 'radiateur', libelle: 'Radiateur', calque: 'chauffage' })
    assert.equal(typeEdl('inconnu'), null)
    assert.equal(typeEdl(null), null)
    assert.equal(calqueEdl('chauffage').nom, 'EDL-Chauffage')
    assert.equal(calqueEdl('rien'), null)
  })
  test('libellé d’un point : numéro et type, sinon le numéro seul', () => {
    assert.equal(libellePoint({ numero: 7, type: 'wc' }), 'P7 · WC')
    assert.equal(libellePoint({ numero: 8, type: null }), 'P8')
  })
})
