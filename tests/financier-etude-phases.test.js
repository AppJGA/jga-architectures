// Suivi financier d'étude : phases nommées librement, plus de liste figée.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  construirePhases, estRenseignee, nomPhase, phaseDuMemeNom,
  dernierePhaseRenseignee, prochainCodePhase, prochainOrdre, SUGGESTIONS_PHASES,
} from '../src/modules/etude/financier/phases.js'

const ligne = (champs) => ({ affaire_id: 'a', ...champs })

describe('liste des phases', () => {
  test('sans ligne enregistrée, aucune phase : plus de phases pré-remplies', () => {
    assert.deepEqual(construirePhases([]), [])
  })

  test('seules les lignes enregistrées apparaissent, dans l’ordre choisi', () => {
    const phases = construirePhases([
      ligne({ phase: 'perso_2', nom_custom: 'PC modificatif', ordre: 2, enveloppe_ttc: 900 }),
      ligne({ phase: 'avp', ordre: 0, enveloppe_ttc: 800 }),
      ligne({ phase: 'perso_1', nom_custom: 'APD', ordre: 1, enveloppe_ttc: 850 }),
    ])
    assert.deepEqual(phases.map((p) => p.label), ['AVP', 'APD', 'PC modificatif'])
    assert.deepEqual(phases.map((p) => p.id), ['avp', 'perso_1', 'perso_2'])
  })

  test('une ancienne ligne sans ordre garde le rang chronologique de son code', () => {
    const phases = construirePhases([ligne({ phase: 'dce' }), ligne({ phase: 'esq' })])
    assert.deepEqual(phases.map((p) => p.id), ['esq', 'dce'])
  })

  test('le nom : nom libre, sinon libellé d’origine, sinon le code', () => {
    assert.equal(nomPhase(ligne({ phase: 'pro', nom_custom: 'PRO indice B' })), 'PRO indice B')
    assert.equal(nomPhase(ligne({ phase: 'pro' })), 'PRO')
    assert.equal(nomPhase(ligne({ phase: 'perso_4' })), 'perso_4')
  })
})

describe('saisie d’une phase', () => {
  const phases = construirePhases([
    ligne({ phase: 'avp', enveloppe_ttc: 1 }),
    ligne({ phase: 'perso_1', nom_custom: 'APD', ordre: 3 }),
  ])

  test('un nom déjà pris est repéré, sans tenir compte de la casse ni des espaces', () => {
    assert.equal(phaseDuMemeNom(phases, '  apd ')?.id, 'perso_1')
    assert.equal(phaseDuMemeNom(phases, 'avp')?.id, 'avp')
    assert.equal(phaseDuMemeNom(phases, 'PRO'), null)
  })

  test('renommer une phase avec son propre nom n’est pas un doublon', () => {
    assert.equal(phaseDuMemeNom(phases, 'APD', 'perso_1'), null)
  })

  test('une nouvelle phase prend un code libre et se range en fin de liste', () => {
    assert.equal(prochainCodePhase(phases), 'perso_3')
    assert.equal(prochainOrdre(phases), 4)
    assert.equal(prochainOrdre([]), 0)
  })

  test('les suggestions couvrent les phases usuelles de la loi MOP', () => {
    for (const p of ['ESQ', 'APS', 'APD', 'PRO', 'DCE', 'ACT']) assert.ok(SUGGESTIONS_PHASES.includes(p), p)
  })
})

describe('dernière phase renseignée', () => {
  test('la dernière de la liste qui porte un montant ; une phase vide ne compte pas', () => {
    const lignes = [
      ligne({ phase: 'avp', ordre: 0, enveloppe_ttc: 800 }),
      ligne({ phase: 'perso_1', nom_custom: 'APD', ordre: 1, enveloppe_ttc: 850 }),
      ligne({ phase: 'perso_2', nom_custom: 'PRO', ordre: 2 }),
    ]
    assert.equal(dernierePhaseRenseignee(lignes)?.phase, 'perso_1')
    assert.equal(dernierePhaseRenseignee([]), null)
    assert.equal(estRenseignee(lignes[2]), false)
  })
})
