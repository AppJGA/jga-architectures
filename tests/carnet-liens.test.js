// Carnet d'adresses : où une personne et une organisation interviennent,
// type d'organisation, clé de comparaison. Données inventées.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  TYPES_ORGANISATION, libelleType, cleComparaison, usagesDePersonne, usagesDOrganisation,
  affairesDesUsages, personneSupprimable,
} from '../src/shared/carnet/carnetLiensLogique.js'

const A1 = { id: 'a1', code_affaire: '2699-ABC', nom: 'Logements' }
const A2 = { id: 'a2', code_affaire: '2698-XYZ', nom: 'École' }
const lots = [
  { id: 'le1', entreprise_id: 'e1', interlocuteur_id: 'p1', lot: { numero: 2, numero_affiche: '02', nom: 'Gros œuvre' }, affaire: A1 },
  { id: 'le2', entreprise_id: 'e1', interlocuteur_id: 'p2', lot: { numero: 3, numero_affiche: null, nom: 'Charpente' }, affaire: A2 },
  { id: 'le3', entreprise_id: 'e1', interlocuteur_id: null, lot: { numero: 4, numero_affiche: null, nom: 'Couverture' }, affaire: A2 },
]
const contacts = [
  { id: 'c1', entreprise_id: 'e1', interlocuteur_id: 'p1', categorie: 'be', categorie_label: null, affaire: A2 },
  { id: 'c2', entreprise_id: null, interlocuteur_id: 'p2', categorie: 'autre', categorie_label: 'Géomètre', affaire: A1 },
  { id: 'c3', entreprise_id: 'e9', interlocuteur_id: null, categorie: 'moa', categorie_label: null, affaire: A1 },
]

test('types d’organisation', () => {
  assert.deepEqual(TYPES_ORGANISATION.map((t) => t.code), ['entreprise', 'bet', 'moa', 'autre'])
  assert.equal(libelleType('bet'), 'Bureau d’études')
  assert.equal(libelleType('inconnu'), 'Autre')
})

test('clé de comparaison : comme carnet_cle en SQL', () => {
  assert.equal(cleComparaison('  Éts  DUPONT-Frères '), 'ets dupont freres')
  assert.equal(cleComparaison('Œuvre & Cie'), 'oeuvre cie')
  assert.equal(cleComparaison('Gros œuvre'), cleComparaison('Gros oeuvre'))
  assert.equal(cleComparaison(null), '')
})

test('usages d’une personne : représentant de lot et contact d’affaire', () => {
  assert.deepEqual(usagesDePersonne('p1', { lots, contacts }).map((u) => [u.affaire.code_affaire, u.role]), [
    ['2698-XYZ', "Bureau d'études"],  // libellé de CATEGORIE_META, apostrophe droite
    ['2699-ABC', 'représentant lot 02 Gros œuvre'],
  ])
  assert.deepEqual(usagesDePersonne('p2', { lots, contacts }).map((u) => u.role), ['représentant lot 03 Charpente', 'Géomètre'])
  assert.deepEqual(usagesDePersonne('p3', { lots, contacts }), [])
})

test('usages d’une organisation : ses lots, ses contacts, ceux de ses personnes', () => {
  const e1 = { id: 'e1', interlocuteurs: [{ id: 'p1' }, { id: 'p2' }] }
  const usages = usagesDOrganisation(e1, { lots, contacts })
  assert.deepEqual(usages.map((u) => [u.affaire.code_affaire, u.role]), [
    ['2698-XYZ', "Bureau d'études"],
    ['2698-XYZ', 'lot 03 Charpente'],
    ['2698-XYZ', 'lot 04 Couverture'],
    ['2699-ABC', 'Géomètre'],
    ['2699-ABC', 'lot 02 Gros œuvre'],
  ])
  assert.deepEqual(affairesDesUsages(usages).map((a) => a.code_affaire), ['2698-XYZ', '2699-ABC'])
})

test('une personne utilisée ne se supprime pas', () => {
  assert.equal(personneSupprimable('p1', { lots, contacts }), false)
  assert.equal(personneSupprimable('p3', { lots, contacts }), true)
})
