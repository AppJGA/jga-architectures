// Module Plans : import d'un jeu de plans, préparation pour le chantier.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  nomPropose, cibleDe, pagesProposees, renommerPage, forcerNouveau, cocherPage,
  problemesImport, pagesAEnvoyer, versionDe,
} from '../src/modules/chantier/plans/importPlansLogique.js'
import { etapesPreparation } from '../src/modules/chantier/comptes-rendus/horsLigne/preparationLogique.js'
import { cheminsAGarder } from '../src/modules/chantier/comptes-rendus/plansLogique.js'

const plans = [{ id: 'P1', nom: 'Plan du rez-de-chaussée' }, { id: 'P2', nom: 'Façade Nord' }]

describe('noms proposés', () => {
  test('page seule, PDF de plusieurs pages, image', () => {
    assert.equal(nomPropose('Façade Nord.pdf'), 'Façade Nord')
    assert.equal(nomPropose('Jeu APD.pdf', 3, 12), 'Jeu APD – p. 3')
    assert.equal(nomPropose('photo.plan.jpeg'), 'photo.plan')
    assert.equal(nomPropose(''), 'Plan')
  })
})

describe('rapprochement avec les plans existants', () => {
  test('même nom sans majuscules ni accents → nouvelle version', () => {
    assert.equal(cibleDe('PLAN DU REZ-DE-CHAUSSEE', plans), 'P1')
    assert.equal(cibleDe('facade nord', plans), 'P2')
    assert.equal(cibleDe('Coupe AA', plans), null)
  })

  test('toutes les pages proposées, cochées, avec leur cible', () => {
    const pages = pagesProposees([{ id: 'f1', nom: 'Façade Nord.pdf', nbPages: 1 }, { id: 'f2', nom: 'Jeu.pdf', nbPages: 2 }], plans)
    assert.deepEqual(pages.map((p) => [p.cle, p.nom, p.coche, p.cible]), [
      ['f1:1', 'Façade Nord', true, 'P2'], ['f2:1', 'Jeu – p. 1', true, null], ['f2:2', 'Jeu – p. 2', true, null],
    ])
  })

  test('renommer fait gagner ou perdre la cible ; forcer un nouveau plan l’annule', () => {
    let pages = pagesProposees([{ id: 'f', nom: 'Jeu.pdf', nbPages: 2 }], plans)
    pages = renommerPage(pages, 'f:1', 'Plan du rez-de-chaussée', plans)
    assert.equal(pages[0].cible, 'P1')
    assert.equal(versionDe(pages[0]), 'P1')
    pages = forcerNouveau(pages, 'f:1', true)
    assert.equal(versionDe(pages[0]), null)
    pages = renommerPage(pages, 'f:1', 'Coupe AA', plans)
    assert.equal(pages[0].cible, null)
  })
})

describe('problèmes avant l’import', () => {
  test('deux pages cochées du même nom : la seconde est un doublon ; une page décochée ne compte pas', () => {
    let pages = pagesProposees([{ id: 'f', nom: 'Jeu.pdf', nbPages: 3 }], plans)
    pages = renommerPage(pages, 'f:2', 'Jeu – P. 1', plans)
    assert.deepEqual([...problemesImport(pages)], [['f:2', 'doublon']])
    assert.deepEqual(pagesAEnvoyer(pages), [])
    pages = cocherPage(pages, 'f:2', false)
    assert.equal(problemesImport(pages).size, 0)
    assert.deepEqual(pagesAEnvoyer(pages).map((p) => p.cle), ['f:1', 'f:3'])
  })

  test('un nom vide bloque', () => {
    const pages = renommerPage(pagesProposees([{ id: 'f', nom: 'A.pdf', nbPages: 1 }]), 'f:1', '  ', [])
    assert.deepEqual([...problemesImport(pages)], [['f:1', 'vide']])
  })
})

describe('préparation pour le chantier', () => {
  test('les plans de l’affaire sont une étape', () => {
    const etape = etapesPreparation('A1', null).find((e) => e.cle === 'plans')
    assert.deepEqual([etape?.chemin, etape?.plans], ['/affaires/A1/plans', true])
  })
})

describe('images gardées sur l’appareil', () => {
  test('aperçu et pleine définition de la seule version courante de chaque plan', () => {
    const versions = [
      { plan_id: 'P1', chemin: 'a/1A.webp', chemin_apercu: 'a/1A-ap.webp', created_at: '2026-01-01' },
      { plan_id: 'P1', chemin: 'a/1B.webp', chemin_apercu: 'a/1B-ap.webp', created_at: '2026-03-01' },
      { plan_id: 'P2', chemin: 'a/2A.webp', chemin_apercu: 'a/2A-ap.webp', created_at: '2026-02-01' },
    ]
    assert.deepEqual(cheminsAGarder([{ id: 'P1' }, { id: 'P2' }, { id: 'P3' }], versions), ['a/1B-ap.webp', 'a/1B.webp', 'a/2A-ap.webp', 'a/2A.webp'])
  })
})
