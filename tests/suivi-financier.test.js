// Tableau du suivi financier : où va chaque ligne, et ce que comptent les totaux.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { buildTableau } from '../src/modules/chantier/financier/tableauLogique.js'

const lots = [
  { id: 'L1', numero: 1, nom: 'Gros œuvre', ordre: 0, lot_entreprises: [{ montant_marche_ht: 100000, entreprises: { raison_sociale: 'Dupont' } }] },
  // Marché non renseigné : le lot existe, son montant n'est pas encore saisi
  { id: 'L2', numero: 2, nom: 'Charpente', ordre: 1, lot_entreprises: [] },
]

const ligne = (id, champs) => ({ id, lot_id: null, categorie: 'aleas', statut: 'en_attente', montant_ht: 0, ordre: 0, intitule: id, ...champs })

describe('où va une ligne', () => {
  test('une ligne rejoint son lot', () => {
    const t = buildTableau(lots, [ligne('A', { lot_id: 'L1', montant_ht: 500 })], [], 1.2)
    assert.deepEqual(t.lots[0].lignes.map(l => l.id), ['A'])
  })

  test('un lot sans marché garde ses lignes et son total', () => {
    const t = buildTableau(lots, [ligne('B', { lot_id: 'L2', montant_ht: 3200 })], [], 1.2)
    const charpente = t.lots.find(l => l.id === 'L2')
    assert.deepEqual(charpente.lignes.map(l => l.id), ['B'])
    assert.equal(charpente.total_supplements_ht, 3200)
  })

  test('une ligne sans lot se range en fin de tableau, elle ne disparaît pas', () => {
    const t = buildTableau(lots, [ligne('C', { montant_ht: 1200 })], [], 1.2)
    const dernier = t.lots[t.lots.length - 1]
    assert.equal(dernier.sansLot, true)
    assert.deepEqual(dernier.lignes.map(l => l.id), ['C'])
  })

  test('et elle compte dans le total général', () => {
    const t = buildTableau(lots, [ligne('C', { montant_ht: 1200 })], [], 1.2)
    assert.equal(t.totaux.total_aleas_ht, 1200)
    assert.equal(t.totaux.total_general_ht, 100000 + 1200)
  })

  test('sans ligne orpheline, pas de bloc « sans lot »', () => {
    const t = buildTableau(lots, [ligne('A', { lot_id: 'L1' })], [], 1.2)
    assert.equal(t.lots.some(l => l.sansLot), false)
  })
})

describe('lien avec la fiche de travaux', () => {
  const fiche = { id: 'F1', numero: 12, ligne_financiere_id: 'A' }

  test('le numéro se lit depuis la fiche', () => {
    const t = buildTableau(lots, [ligne('A', { lot_id: 'L1' })], [fiche], 1.2)
    assert.equal(t.lots[0].lignes[0].ftm_numero, 12)
    assert.equal(t.lots[0].lignes[0].ftm_id, 'F1')
  })

  test('il se lit aussi depuis la ligne, si la fiche a perdu son lien', () => {
    const t = buildTableau(lots, [ligne('A', { lot_id: 'L1', ftm_id: 'F1' })], [{ id: 'F1', numero: 12 }], 1.2)
    assert.equal(t.lots[0].lignes[0].ftm_numero, 12)
  })

  test('une ligne saisie à la main n’affiche aucun numéro de fiche', () => {
    const t = buildTableau(lots, [ligne('A', { lot_id: 'L1' })], [], 1.2)
    assert.equal(t.lots[0].lignes[0].ftm_numero, undefined)
  })
})

describe('totaux', () => {
  test('une ligne refusée reste affichée mais ne compte pas', () => {
    const t = buildTableau(lots, [
      ligne('A', { lot_id: 'L1', montant_ht: 500 }),
      ligne('R', { lot_id: 'L1', montant_ht: 9000, statut: 'refuse' }),
    ], [], 1.2)
    assert.equal(t.lots[0].lignes.length, 2)
    assert.equal(t.lots[0].total_aleas_ht, 500)
  })

  test('une moins-value diminue le total', () => {
    const t = buildTableau(lots, [ligne('M', { lot_id: 'L1', categorie: 'demande_mo', montant_ht: -2000 })], [], 1.2)
    assert.equal(t.lots[0].total_mo_ht, -2000)
    assert.equal(t.totaux.total_general_ht, 98000)
  })
})
