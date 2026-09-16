// OPR : réserves d'une visite, visite de levée, tableau par lot, filtres.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  groupesVisiteOpr, tableauParLot, statutAvantVisite, peutSupprimerReserve, passeFiltreReserve,
  reserveEnRetard, lotsAvecEntreprise, infosStatutReserve, libelleZone, grouperParZone,
} from '../src/modules/chantier/opr/oprLogique.js'

const lots = [{ id: 'L2', numero: 2, nom: 'Gros œuvre' }, { id: 'L5', numero: 5, nom: 'Serrurerie' }, { id: 'L7', numero: 7, nom: 'Peinture' }]
const visites = [
  { id: 'V1', numero: 1, type: 'opr', lot_ids: ['L2', 'L5', 'L7'] },
  { id: 'V2', numero: 2, type: 'levee', lot_ids: ['L2', 'L5'] },
]
const reserves = [
  { id: 'R1', numero: 1, visite_origine_id: 'V1', lot_id: 'L2', statut: 'levee', description: 'Fissure linteau' },
  { id: 'R2', numero: 2, visite_origine_id: 'V1', lot_id: 'L5', statut: 'ouverte', description: 'Garde-corps', date_limite: '2026-09-30' },
  { id: 'R3', numero: 3, visite_origine_id: 'V1', lot_id: 'L7', statut: 'ouverte', description: 'Reprise peinture' },
  { id: 'R4', numero: 4, visite_origine_id: 'V1', lot_id: 'L2', statut: 'abandonnee', description: 'Joint' },
  { id: 'R5', numero: 5, visite_origine_id: 'V2', lot_id: 'L2', statut: 'ouverte', description: 'Nouvelle en levée', localisation: 'Hall' },
]
const constats = [
  { reserve_id: 'R1', visite_id: 'V1', statut: 'ouverte', created_at: '2026-09-15T10:00' },
  { reserve_id: 'R2', visite_id: 'V1', statut: 'ouverte', created_at: '2026-09-15T10:01' },
  { reserve_id: 'R3', visite_id: 'V1', statut: 'ouverte', created_at: '2026-09-15T10:02' },
  { reserve_id: 'R4', visite_id: 'V1', statut: 'ouverte', created_at: '2026-09-15T10:03' },
  { reserve_id: 'R4', visite_id: null, statut: 'abandonnee', created_at: '2026-09-20T09:00' },
  { reserve_id: 'R1', visite_id: 'V2', statut: 'levee', created_at: '2026-10-01T10:00' },
  { reserve_id: 'R5', visite_id: 'V2', statut: 'ouverte', created_at: '2026-10-01T10:05' },
]

describe('groupesVisiteOpr', () => {
  test('OPR : ses réserves par lot, lots concernés sans réserve affichés', () => {
    const g = groupesVisiteOpr({ visite: visites[0], visites, reserves, constats, lots })
    assert.deepEqual(g.map((x) => [x.libelle, x.reserves.map((r) => r.numero)]), [
      ['Lot 2 — Gros œuvre', [1, 4]], ['Lot 5 — Serrurerie', [2]], ['Lot 7 — Peinture', [3]],
    ])
    assert.ok(g[0].reserves.every((r) => r.nouvelle))
  })

  test('levée : ouvertes au début de la visite, lots concernés seulement ; la levée faite pendant la visite reste affichée', () => {
    const g = groupesVisiteOpr({ visite: visites[1], visites, reserves, constats, lots })
    assert.deepEqual(g.map((x) => [x.lotId, x.reserves.map((r) => r.numero)]), [['L2', [1, 5]], ['L5', [2]]])
    const r1 = g[0].reserves[0]
    assert.equal(r1.constat.statut, 'levee')
    assert.equal(r1.nouvelle, false)
    assert.equal(g[0].reserves[1].nouvelle, true)
  })
})

test('statutAvantVisite : dernier constat antérieur, constats hors visite compris', () => {
  assert.equal(statutAvantVisite(constats, 'R1', visites[1], visites), 'ouverte')
  assert.equal(statutAvantVisite(constats, 'R4', visites[1], visites), 'abandonnee')
  assert.equal(statutAvantVisite(constats, 'R5', visites[1], visites), null)
})

test('tableauParLot : compteurs et retards', () => {
  const t = tableauParLot(reserves, lots, '2026-10-15')
  assert.deepEqual(t.map((l) => [l.lotId, l.total, l.ouvertes, l.levees, l.abandonnees, l.enRetard]), [
    ['L2', 3, 1, 1, 1, 0], ['L5', 1, 1, 0, 0, 1], ['L7', 1, 1, 0, 0, 0],
  ])
})

test('peutSupprimerReserve : pas après un constat d’une autre visite', () => {
  assert.equal(peutSupprimerReserve(reserves[0], constats), false)
  assert.equal(peutSupprimerReserve(reserves[2], constats), true)
  assert.equal(peutSupprimerReserve(reserves[4], constats), true)
})

describe('filtres et statuts', () => {
  test('ouvertes, statut, retard, lot, recherche', () => {
    const ids = (f, d = '2026-10-15') => reserves.filter((r) => passeFiltreReserve(r, f, d)).map((r) => r.numero)
    assert.deepEqual(ids({}), [2, 3, 5])
    assert.deepEqual(ids({ statut: 'levee' }), [1])
    assert.deepEqual(ids({ statut: 'retard' }), [2])
    assert.deepEqual(ids({ statut: 'tous', lotId: 'L2' }), [1, 4, 5])
    assert.deepEqual(ids({ statut: 'tous', recherche: 'hall' }), [5])
    assert.deepEqual(ids({ statut: 'tous', recherche: 'n°3' }), [3])
  })
  test('retard et libellés', () => {
    assert.equal(reserveEnRetard(reserves[1], '2026-10-01'), true)
    assert.equal(reserveEnRetard({ ...reserves[1], statut: 'levee' }, '2026-10-01'), false)
    assert.equal(infosStatutReserve({ statut: 'contestee' }).libelle, 'Contestée')
  })
})

test('lotsAvecEntreprise', () => {
  assert.deepEqual(lotsAvecEntreprise(lots, [{ lot_id: 'L5' }, { lot_id: 'L2' }]).map((l) => l.id), ['L2', 'L5'])
})

describe('zones', () => {
  const zones = [{ id: 'Z1', nom: 'Bâtiment A' }, { id: 'Z2', nom: 'Bâtiment B' }]
  test('libelleZone : zone actuelle, sinon nom recopié', () => {
    assert.equal(libelleZone({ zone_id: 'Z2' }, zones), 'Bâtiment B')
    assert.equal(libelleZone({ zone_id: null, copie_zone: 'Ancienne zone' }, zones), 'Ancienne zone')
    assert.equal(libelleZone({}, zones), null)
  })
  test('grouperParZone : ordre des zones du planning, sans zone à la fin', () => {
    const g = grouperParZone([
      { id: 'a', zone_id: 'Z2', copie_zone: 'Bâtiment B' },
      { id: 'b' },
      { id: 'c', zone_id: 'Z1', copie_zone: 'Bâtiment A' },
      { id: 'd', zone_id: 'Z2', copie_zone: 'Bâtiment B' },
    ], zones)
    assert.deepEqual(g.map((x) => [x.libelle, x.elements.map((e) => e.id)]), [
      ['Bâtiment A', ['c']], ['Bâtiment B', ['a', 'd']], [null, ['b']],
    ])
  })
  test('filtre par zone', () => {
    const reserves = [{ numero: 1, statut: 'ouverte', zone_id: 'Z1', description: 'x' }, { numero: 2, statut: 'ouverte', description: 'y' }]
    assert.deepEqual(reserves.filter((r) => passeFiltreReserve(r, { zone: 'Z1' }, '2026-10-01')).map((r) => r.numero), [1])
    assert.deepEqual(reserves.filter((r) => passeFiltreReserve(r, { zone: 'sans-zone' }, '2026-10-01')).map((r) => r.numero), [2])
  })
})
