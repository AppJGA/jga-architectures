// Le bouton « visite de chantier » de la page d'affaire : où il mène.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { actionVisite, cheminVisite } from '../src/modules/chantier/comptes-rendus/accesVisite.js'

const AUJ = '2026-09-16'

describe('ce que propose le bouton', () => {
  test('une visite en cours se reprend', () => {
    const a = actionVisite([{ id: 'c6', numero: 6, statut: 'brouillon', date_reunion: AUJ }], AUJ)
    assert.equal(a.action, 'reprendre')
    assert.equal(a.cr.id, 'c6')
    assert.match(a.libelle, /Reprendre la visite n°06/)
    assert.equal(a.precision, 'Visite du jour, en cours')
  })

  test('un brouillon d’un autre jour se reprend aussi, en le disant', () => {
    const a = actionVisite([{ id: 'c6', numero: 6, statut: 'brouillon', date_reunion: '2026-09-09' }], AUJ)
    assert.equal(a.action, 'reprendre')
    assert.equal(a.precision, 'Ouverte le 09/09')
  })

  test('toutes les visites émises : on démarre celle du jour', () => {
    const a = actionVisite([
      { id: 'c5', numero: 5, statut: 'emis', date_reunion: '2026-09-09' },
      { id: 'c4', numero: 4, statut: 'emis', date_reunion: '2026-09-02' },
    ], AUJ)
    assert.equal(a.action, 'demarrer')
    assert.equal(a.cr, null)
    assert.match(a.libelle, /Démarrer la visite du 16\/09/)
    assert.match(a.precision, /Reprend la visite n°05 du 09\/09/)
  })

  test('aucune visite : première du chantier', () => {
    const a = actionVisite([], AUJ)
    assert.equal(a.action, 'demarrer')
    assert.equal(a.precision, 'Première visite de ce chantier')
  })

  test('le brouillon le plus récent l’emporte', () => {
    const a = actionVisite([
      { id: 'c7', numero: 7, statut: 'brouillon', date_reunion: AUJ },
      { id: 'c6', numero: 6, statut: 'brouillon', date_reunion: '2026-09-09' },
    ], AUJ)
    assert.equal(a.cr.id, 'c7')
  })
})

describe('où mène le bouton', () => {
  test('sur tablette, directement dans le mode Visite', () => {
    assert.equal(cheminVisite('a1', 'c6', { tactile: true }), '/affaires/a1/comptes-rendus?cr=c6&visite=1')
  })

  test('au bureau, dans l’éditeur du compte rendu', () => {
    assert.equal(cheminVisite('a1', 'c6', { tactile: false }), '/affaires/a1/comptes-rendus?cr=c6')
  })
})
