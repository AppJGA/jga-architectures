// Avant d'émettre un CR : ce qui est fait, ce qui manque.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { controlesEmission, controleAvancement, libelleEmission } from '../src/modules/chantier/comptes-rendus/controleEmissionLogique.js'

const p = (presence, convoque = false) => ({ copie_type: 'entreprise', copie_entreprise: 'X', presence, convoque })
const parId = (liste) => Object.fromEntries(liste.map((c) => [c.id, c]))

describe('liste de contrôle', () => {
  test('tout est fait : tout en vert, « Émettre »', () => {
    const c = controlesEmission({
      cr: { date_prochaine_reunion: '2026-10-13' },
      presences: [p('p', true), p('e')],
      avancement: [{ lot_id: 'l1', realise: 40 }],
      precedent: { numero: 2, avancement_lots: [{ lot_id: 'l1', realise: 30 }] },
    })
    assert.ok(c.every((x) => x.ok), JSON.stringify(c))
    assert.equal(libelleEmission(c), 'Émettre')
    assert.equal(parId(c).convocations.detail, '1 convoqué pour le 13/10/2026')
  })

  test('ce qui manque, dit précisément ; « Émettre quand même »', () => {
    const c = parId(controlesEmission({
      cr: {}, presences: [p('p'), p(null), p('na')], avancement: [], nbPropositions: 2,
    }))
    assert.equal(c.presences.ok, false)
    assert.equal(c.presences.detail, '2 participants sans pointage')
    assert.equal(c.convocations.detail, 'date de la prochaine réunion à fixer ; personne n’est convoqué')
    assert.equal(c.avancement.ok, false)
    assert.equal(c.ia.bloquant, true)
    assert.equal(libelleEmission(Object.values(c)), 'Émettre quand même')
  })

  test('sans participant, les présences ne sont pas « faites »', () => {
    assert.equal(parId(controlesEmission({ cr: {} })).presences.detail, 'Aucun participant')
  })
})

describe('avancement depuis la visite précédente', () => {
  const precedent = { numero: 4, avancement_lots: [{ lot_id: 'l1', realise: 30 }, { lot_id: 'l2', realise: 10 }] }

  test('inchangé : en rouge', () => {
    const r = controleAvancement([{ lot_id: 'l1', realise: 30 }, { lot_id: 'l2', realise: 10 }], precedent)
    assert.equal(r.ok, false)
    assert.match(r.detail, /visite n°4/)
  })

  test('un lot a avancé, ou un lot nouveau a démarré : en vert', () => {
    assert.equal(controleAvancement([{ lot_id: 'l1', realise: 45 }, { lot_id: 'l2', realise: 10 }], precedent).detail, '1 lot en évolution depuis la visite n°4')
    assert.equal(controleAvancement([{ lot_id: 'l1', realise: 30 }, { lot_id: 'l2', realise: 10 }, { lot_id: 'l3', realise: 5 }], precedent).ok, true)
  })

  test('première visite : il suffit qu’un lot ait avancé', () => {
    assert.equal(controleAvancement([{ lot_id: 'l1', realise: 0 }], null).ok, false)
    assert.equal(controleAvancement([{ lot_id: 'l1', realise: 5 }], { numero: 1, avancement_lots: null }).ok, true)
  })

  test('sans planning : en rouge', () => {
    assert.equal(controleAvancement([], precedent).ok, false)
  })
})
