// « Gestion de l'application » : jauges, regroupements, alerte, comptes.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  LIMITES, jauge, parSorte, parAffaire, alerteAccueil, etatComptes, formatTaille,
} from '../src/admin/gestionAppLogique.js'
import { retourParDefaut } from '../src/core/layout/retourLogique.js'

const MO = 1024 * 1024

describe('jauges', () => {
  test('part et alerte à 80 %', () => {
    assert.deepEqual(jauge(512 * MO, LIMITES.fichiers), { octets: 512 * MO, limite: LIMITES.fichiers, part: 0.5, alerte: false })
    assert.equal(jauge(0.8 * LIMITES.base, LIMITES.base).alerte, true)
    assert.equal(jauge(null, LIMITES.base).octets, 0)
  })

  test('tailles lisibles', () => {
    assert.equal(formatTaille(300 * 1024), '300 Ko')
    assert.equal(formatTaille(3.4 * MO), '3,4 Mo')
    assert.equal(formatTaille(250 * MO), '250 Mo')
    assert.equal(formatTaille(1.5 * 1024 * MO), '1,5 Go')
  })
})

const lignes = [
  { bucket: 'cr-photos', affaire_id: 'A1', fichiers: 10, octets: 3 * MO },
  { bucket: 'cr-photos', affaire_id: 'A2', fichiers: 2, octets: 1 * MO },
  { bucket: 'cr-plans', affaire_id: 'A1', fichiers: 4, octets: 6 * MO },
  { bucket: 'affaires-photos', affaire_id: null, fichiers: 3, octets: 0.5 * MO },
  { bucket: 'cr-archives', affaire_id: 'A9', fichiers: 1, octets: 0.2 * MO },
  { bucket: 'inconnu', affaire_id: null, fichiers: 1, octets: 100 },
]

describe('regroupements', () => {
  test('par sorte, du plus lourd au plus léger', () => {
    assert.deepEqual(parSorte(lignes).map((s) => [s.sorte, s.fichiers]), [
      ['plans', 4], ['photos', 12], ['couvertures', 3], ['archives', 1], ['autres', 1],
    ])
  })

  test('par affaire ; hors affaire et affaire disparue regroupés à la fin', () => {
    const r = parAffaire(lignes, [{ id: 'A1', code: '2618', nom: 'Logements' }, { id: 'A2', code: '2701', nom: 'École' }], 10)
    assert.deepEqual(r.map((a) => [a.affaireId, a.libelle, a.fichiers]), [
      ['A1', '2618 · Logements', 14], ['A2', '2701 · École', 2], [null, 'Hors affaire (ou affaire supprimée)', 5],
    ])
    assert.equal(parAffaire(lignes, [{ id: 'A1' }, { id: 'A2' }], 1).length, 2)
  })
})

describe('alerte de l’accueil', () => {
  test('aucune sous le seuil ; la plus remplie au-dessus ; inconnu ignoré', () => {
    assert.equal(alerteAccueil({ fichiers: 100 * MO, base: 50 * MO }), null)
    assert.equal(alerteAccueil({ fichiers: 900 * MO, base: 450 * MO }).texte, 'Base de données à 90 % de l’offre gratuite')
    assert.equal(alerteAccueil({ fichiers: 870 * MO }).texte, 'Stockage des fichiers à 85 % de l’offre gratuite')
    assert.equal(alerteAccueil({}), null)
  })
})

describe('comptes', () => {
  test('agence, extérieurs, associés, sans profil', () => {
    const comptes = [
      { a_un_profil: true, type_compte: 'agence', est_associe: true },
      { a_un_profil: true, type_compte: 'agence', est_associe: false },
      { a_un_profil: true, type_compte: 'exterieur', est_associe: false },
      { a_un_profil: false, type_compte: null, est_associe: false },
    ]
    assert.deepEqual(etatComptes(comptes), { total: 4, agence: 2, exterieurs: 1, associes: 1, sansProfil: 1 })
  })
})

describe('retour', () => {
  test('la page mène à l’accueil', () => {
    assert.equal(retourParDefaut('/gestion-application').vers, '/home')
  })
})
