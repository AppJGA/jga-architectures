// Ce qu'un compte extérieur voit de l'application (les droits eux-mêmes sont
// tenus en base, migrations 050 et 051 — voir pgtest/test050.mjs).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { phases, phasesPour } from '../src/modules/manifest.js'
import {
  peutModifierRemarque, peutRepondre, peutOrganiser, auteurExterieur,
} from '../src/modules/chantier/comptes-rendus/crLogique.js'

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

describe('ce qu’un intervenant extérieur peut toucher', () => {
  const moi = 'bet-1'
  const agence = { lectureSeule: false, contributeur: false, utilisateurId: 'jga-1' }
  const invite = { lectureSeule: false, contributeur: true, utilisateurId: moi }
  const sienne = { id: 'r1', created_by: moi, description: 'Vue du BET' }
  const nôtre = { id: 'r2', created_by: 'jga-1', description: 'Fissure' }

  test('l’agence modifie tout le compte rendu', () => {
    assert.equal(peutModifierRemarque(nôtre, agence), true)
    assert.equal(peutModifierRemarque(sienne, agence), true)
    assert.equal(peutOrganiser(agence), true)
  })

  test('l’intervenant ne modifie que ses propres remarques', () => {
    assert.equal(peutModifierRemarque(sienne, invite), true)
    assert.equal(peutModifierRemarque(nôtre, invite), false)
  })

  test('il ne touche pas aux sections ni à l’organisation', () => {
    assert.equal(peutOrganiser(invite), false)
  })

  test('il peut répondre sous une remarque de l’agence', () => {
    assert.equal(peutRepondre(invite), true)
  })

  test('un compte rendu émis ferme tout, pour tout le monde', () => {
    const emis = { lectureSeule: true, contributeur: true, utilisateurId: moi }
    assert.equal(peutModifierRemarque(sienne, emis), false)
    assert.equal(peutRepondre(emis), false)
    assert.equal(peutOrganiser({ lectureSeule: true }), false)
  })

  test('sans identité connue, rien n’est modifiable en contribution', () => {
    assert.equal(peutModifierRemarque(sienne, { contributeur: true }), false)
  })
})

describe('signature des observations extérieures', () => {
  const profils = [
    { id: 'bet-1', prenom: 'Paul', nom: 'Untel', type_compte: 'exterieur' },
    { id: 'jga-1', prenom: 'Jacques', nom: 'Gerbe', type_compte: 'agence' },
    { id: 'bet-2', email: 'bureau@etudes.fr', type_compte: 'exterieur' },
  ]

  test('une remarque d’intervenant porte son nom', () => {
    assert.equal(auteurExterieur({ created_by: 'bet-1' }, profils), 'Paul Untel')
  })

  test('sans nom renseigné, son adresse fait l’affaire', () => {
    assert.equal(auteurExterieur({ created_by: 'bet-2' }, profils), 'bureau@etudes.fr')
  })

  test('une remarque de l’agence n’est pas signée', () => {
    assert.equal(auteurExterieur({ created_by: 'jga-1' }, profils), null)
  })

  test('un auteur inconnu ou absent ne signe rien', () => {
    assert.equal(auteurExterieur({ created_by: 'parti' }, profils), null)
    assert.equal(auteurExterieur({}, profils), null)
  })
})
