// Références cadastrales : autant de sections que le terrain en compte (migration 076).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  referencesCadastre, lignesCadastre, superficieTotale, colonnesCadastre, texteCadastre, erreurCadastre, sansReferences,
} from '../src/affaire/cadastreLogique.js'

test('les références enregistrées priment', () => {
  const affaire = {
    cadastre_section: 'ZZ',
    cadastre_references: [
      { section: 'AB', parcelles: '142, 143', superficie: 1200 },
      { section: 'AC', parcelles: '12', superficie: '300' },
      { section: '', parcelles: '', superficie: null },
    ],
  }
  assert.deepEqual(referencesCadastre(affaire), [
    { section: 'AB', parcelles: '142, 143', superficie: 1200 },
    { section: 'AC', parcelles: '12', superficie: 300 },
  ])
})

test('une affaire d’avant la migration garde sa référence', () => {
  assert.deepEqual(referencesCadastre({ cadastre_section: 'AB', cadastre_parcelle: '0142', cadastre_superficie: 4200 }), [
    { section: 'AB', parcelles: '0142', superficie: 4200 },
  ])
  assert.deepEqual(referencesCadastre({ cadastre_references: [] }), [])
  assert.deepEqual(referencesCadastre(null), [])
})

test('le formulaire a toujours au moins une ligne', () => {
  assert.deepEqual(lignesCadastre({}), [{ section: '', parcelles: '', superficie: '' }])
  assert.deepEqual(lignesCadastre({ cadastre_references: [{ section: 'AB', parcelles: '1', superficie: 50 }] }), [
    { section: 'AB', parcelles: '1', superficie: '50' },
  ])
})

test('superficie totale', () => {
  assert.equal(superficieTotale([{ superficie: 1200 }, { superficie: '300,5' }, { superficie: '' }]), 1500.5)
  assert.equal(superficieTotale([{ superficie: '' }]), null)
})

test('enregistrement : la liste et les anciennes colonnes', () => {
  assert.deepEqual(colonnesCadastre([
    { section: ' ab ', parcelles: '142', superficie: '1200' },
    { section: '', parcelles: '', superficie: '' },
    { section: 'AC', parcelles: '12', superficie: '' },
  ]), {
    cadastre_references: [
      { section: 'AB', parcelles: '142', superficie: 1200 },
      { section: 'AC', parcelles: '12', superficie: null },
    ],
    cadastre_section: 'AB',
    cadastre_parcelle: '142',
    cadastre_superficie: 1200,
  })
  assert.deepEqual(colonnesCadastre([{ section: '', parcelles: '', superficie: '' }]), {
    cadastre_references: [], cadastre_section: null, cadastre_parcelle: null, cadastre_superficie: null,
  })
})

test('texte affiché', () => {
  assert.equal(texteCadastre([{ section: 'AB', parcelles: '142, 143' }, { section: 'AC', parcelles: '12' }]), 'AB 142, 143 · AC 12')
  assert.equal(texteCadastre([{ section: '', parcelles: '', superficie: 10 }]), '')
})

test('sans la migration, on écrit sans la liste', () => {
  assert.equal(erreurCadastre({ message: "Could not find the 'cadastre_references' column" }), true)
  assert.deepEqual(sansReferences({ cadastre_references: [], nom: 'X' }), { nom: 'X' })
})
