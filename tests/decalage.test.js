// Décalage de tout le planning de chantier (report du démarrage)

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { planDecalage, ecartOuvre, decalerDate, debutActuel } from '../src/modules/chantier/planning/decalage.js'
import { diffSnapshots } from '../src/modules/chantier/planning/snapshotDiff.js'
import { entityKey } from '../src/modules/chantier/planning/propagation.js'

// A et C liés (C suit A), B libre avec un segment, un jalon
const TACHES = [
  { id: 'A', nom: 'Terrassement', debut: '2026-11-02', duree: 5 },
  { id: 'B', nom: 'Fondations', debut: '2026-11-16', duree: 10 },
  { id: 'C', nom: 'Réseaux', debut: '2026-11-09', duree: 3, depends_on: 'A', lag_days: 1 },
]
const SEGMENTS = [{ id: 's1', tache_id: 'B', date_debut: '2026-11-18', duree_jours: 3 }]
const JALONS = [{ id: 'j1', label: 'OPR', date: '2026-12-18' }]

const debutApres = (plan, type, id, avant) => plan.changements.get(entityKey(type, id))?.debut ?? avant

describe('décaler le planning', () => {
  test('novembre → mars : tout avance du même nombre de jours ouvrés', () => {
    const plan = planDecalage({ tasks: TACHES, segments: SEGMENTS, jalons: JALONS, nouveauDebut: '2027-03-01' })
    assert.equal(plan.ancienDebut, '2026-11-02')
    assert.equal(debutApres(plan, 'task', 'A'), '2027-03-01')
    // Les écarts entre éléments sont conservés, en jours ouvrés
    for (const [a, b] of [['A', 'B'], ['A', 'C']]) {
      const avant = ecartOuvre(TACHES.find(t => t.id === a).debut, TACHES.find(t => t.id === b).debut)
      const apres = ecartOuvre(debutApres(plan, 'task', a), debutApres(plan, 'task', b))
      assert.equal(apres, avant, `${a} → ${b}`)
    }
    assert.equal(debutApres(plan, 'segment', 's1'), decalerDate('2026-11-18', plan.ecart))
    assert.deepEqual(plan.jalons, [{ id: 'j1', date: decalerDate('2026-12-18', plan.ecart) }])
    assert.equal(plan.semaines, 17)
    assert.deepEqual(plan.resume, { taches: 3, segments: 1, jalons: 1, allongees: [] })
  })

  test('seules les dates changent, jamais les durées', () => {
    const plan = planDecalage({ tasks: TACHES, segments: SEGMENTS, nouveauDebut: '2027-03-01' })
    for (const u of plan.changements.values()) assert.deepEqual(Object.keys(u).sort(), ['debut', 'id', 'type'])
  })

  test('les congés restent en place : une tâche qui les traverse s’allonge, sans démarrer dedans', () => {
    const periodes = [{ id: 'p', date_debut: '2027-03-15', date_fin: '2027-03-19', couleur: '#B8412C' }]
    // A dure maintenant trois semaines : décalée au 1er mars, elle traverse les congés
    const taches = TACHES.map(t => (t.id === 'A' ? { ...t, duree: 15 } : t))
    const plan = planDecalage({ tasks: taches, segments: SEGMENTS, periodes, nouveauDebut: '2027-03-01' })
    for (const u of plan.changements.values()) {
      assert.ok(!(u.debut >= '2027-03-15' && u.debut <= '2027-03-19'), `${u.id} démarre pendant les congés`)
    }
    assert.deepEqual(plan.resume.allongees, ['Terrassement'])
  })

  test('rien ne démarre un week-end', () => {
    const plan = planDecalage({ tasks: TACHES, segments: SEGMENTS, nouveauDebut: '2027-03-06' })  // un samedi
    for (const u of plan.changements.values()) {
      const jour = new Date(u.debut + 'T12:00').getDay()
      assert.ok(jour !== 0 && jour !== 6, u.debut)
    }
    assert.equal(debutApres(plan, 'task', 'A'), '2027-03-08')
  })

  test('on peut aussi avancer le planning', () => {
    const plan = planDecalage({ tasks: TACHES, segments: SEGMENTS, nouveauDebut: '2026-10-05' })
    assert.ok(plan.ecart < 0)
    assert.equal(debutApres(plan, 'task', 'A'), '2026-10-05')
    assert.ok(debutApres(plan, 'task', 'B') < '2026-11-16')
  })

  test('« à partir du » : le reste ne bouge pas, le lien de frontière reçoit son nouvel écart', () => {
    const dependances = [{ id: 'd1', source_tache_id: 'A', cible_tache_id: 'B', lag_jours: 5 }]
    const plan = planDecalage({
      tasks: TACHES, segments: SEGMENTS, jalons: JALONS, dependances,
      nouveauDebut: '2027-03-01', aPartirDe: '2026-11-10',
    })
    assert.equal(plan.ancienDebut, '2026-11-16')
    assert.ok(!plan.changements.has(entityKey('task', 'A')))
    assert.ok(!plan.changements.has(entityKey('task', 'C')))
    assert.equal(debutApres(plan, 'task', 'B'), '2027-03-01')
    assert.equal(plan.lagsDependances.length, 1)
    assert.ok(plan.lagsDependances[0].lag_jours > 5)
    assert.equal(plan.resume.taches, 1)
  })

  test('un lien entre deux éléments décalés garde son écart', () => {
    const plan = planDecalage({ tasks: TACHES, nouveauDebut: '2027-03-01' })
    assert.deepEqual(plan.lagsTaches, [])
    assert.deepEqual(plan.lagsDependances, [])
  })

  test('planning vide : rien à décaler', () => {
    assert.equal(planDecalage({ tasks: [], nouveauDebut: '2027-03-01' }), null)
    assert.equal(debutActuel({ tasks: TACHES, aPartirDe: '2030-01-01' }), null)
  })
})

describe('historique et jalons', () => {
  test('annuler un décalage remet la date des jalons, sans recréer ni effacer de jalon', () => {
    const avant = { tasks: [], segments: [], dependances: [], jalons: [{ id: 'j1', date: '2026-12-18', label: 'OPR' }] }
    const apres = { tasks: [], segments: [], dependances: [], jalons: [{ id: 'j1', date: '2027-04-23', label: 'OPR' }, { id: 'j2', date: '2027-05-01' }] }
    const d = diffSnapshots(apres, avant)
    assert.deepEqual(d.jalons.updates, [{ id: 'j1', changes: { date: '2026-12-18' } }])
    assert.deepEqual(d.jalons.deletions, [])
    assert.deepEqual(d.jalons.insertions, [])
  })

  test('un ancien instantané sans jalons n’y touche pas', () => {
    const d = diffSnapshots({ tasks: [] }, { tasks: [], jalons: [{ id: 'j1', date: '2026-12-18' }] })
    assert.deepEqual(d.jalons.updates, [])
  })
})
