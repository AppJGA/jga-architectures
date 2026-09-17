// Nouveau segment ajouté d'un geste : où il se pose, dans les deux plannings.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { segmentParDefautTache } from '../src/modules/chantier/planning/segmentParDefaut.js'
import { segmentParDefautPhase } from '../src/modules/etude/planning/segmentParDefaut.js'

describe('segment d’une tâche de chantier', () => {
  // Lundi 07/09, 5 jours ouvrés : dernier jour vendredi 11/09
  const tache = { debut: '2026-09-07', duree: 5, zone_id: 'Z1' }

  test('sans segment, il commence le lendemain ouvré de la tâche', () => {
    assert.equal(segmentParDefautTache(tache).date_debut, '2026-09-14')
  })

  test('il reprend la durée et la zone de la tâche', () => {
    const s = segmentParDefautTache(tache)
    assert.equal(s.duree_jours, 5)
    assert.equal(s.zone_id, 'Z1')
  })

  test('il se pose après le dernier segment, s’il finit plus tard', () => {
    const segments = [{ date_debut: '2026-09-14', duree_jours: 5 }]
    assert.equal(segmentParDefautTache(tache, segments).date_debut, '2026-09-21')
  })

  test('l’ordre des segments ne change rien : c’est la fin la plus tardive qui compte', () => {
    const segments = [
      { date_debut: '2026-09-21', duree_jours: 5 },
      { date_debut: '2026-09-14', duree_jours: 5 },
    ]
    assert.equal(segmentParDefautTache(tache, segments).date_debut, '2026-09-28')
  })

  test('une fermeture bloquante est sautée', () => {
    const periodes = [{ date_debut: '2026-09-14', date_fin: '2026-09-18', est_bloquante: true }]
    assert.equal(segmentParDefautTache(tache, [], periodes).date_debut, '2026-09-21')
  })

  test('sans durée ni zone, des valeurs sûres', () => {
    const s = segmentParDefautTache({ debut: '2026-09-07' })
    assert.equal(s.duree_jours, 5)
    assert.equal(s.zone_id, null)
  })
})

describe('segment d’une phase d’étude', () => {
  const phase = { semaine_debut: 10, annee_debut: 2026, duree_semaines: 4 }

  test('sans segment, il commence à la fin de la phase', () => {
    const s = segmentParDefautPhase(phase)
    assert.equal(s.semaine_debut, 14)
    assert.equal(s.annee_debut, 2026)
    assert.equal(s.duree_semaines, 2)
  })

  test('il se pose après le dernier segment', () => {
    const s = segmentParDefautPhase(phase, [{ semaine_debut: 14, annee_debut: 2026, duree_semaines: 3 }])
    assert.equal(s.semaine_debut, 17)
  })

  test('il passe l’année', () => {
    const s = segmentParDefautPhase({ semaine_debut: 51, annee_debut: 2026, duree_semaines: 3 })
    assert.equal(s.annee_debut, 2027)
  })
})
