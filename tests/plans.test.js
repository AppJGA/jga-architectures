// Plans et pastilles : dimensions, indices, versions, cadrage, zoom, reprise.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  dimensionsPlan, indiceSuivant, versionCourante, versionsInutilisees,
  cadrageExtrait, pointSurPlan, zoomAutour, limiterVue,
} from '../src/modules/chantier/comptes-rendus/plansLogique.js'
import { preparerReprise } from '../src/modules/chantier/comptes-rendus/crLogique.js'

describe('dimensionsPlan', () => {
  test('A0 rendu très grand : plafonné à 16 millions de pixels (iPad)', () => {
    const d = dimensionsPlan(14043, 9933)
    assert.ok(d.largeur * d.hauteur <= 16_000_000)
    assert.ok(d.largeur <= 6000)
    assert.ok(Math.abs(d.largeur / d.hauteur - 14043 / 9933) < 0.002)
  })
  test('plan en longueur : plafonné à 6 000 px', () => {
    assert.deepEqual(dimensionsPlan(12000, 1000), { largeur: 6000, hauteur: 500 })
  })
  test('petite image gardée telle quelle', () => {
    assert.deepEqual(dimensionsPlan(1200, 800), { largeur: 1200, hauteur: 800 })
  })
})

test('indiceSuivant', () => {
  assert.equal(indiceSuivant(null), 'A')
  assert.equal(indiceSuivant('A'), 'B')
  assert.equal(indiceSuivant('c'), 'D')
  assert.equal(indiceSuivant('Z'), 'AA')
  assert.equal(indiceSuivant('AZ'), 'BA')
  assert.equal(indiceSuivant('ZZ'), 'AAA')
  assert.equal(indiceSuivant('B1'), 'C')
  assert.equal(indiceSuivant('3'), 'A')
})

describe('versions', () => {
  const versions = [
    { id: 'v1', plan_id: 'P', created_at: '2026-09-01T10:00:00Z' },
    { id: 'v3', plan_id: 'P', created_at: '2026-09-15T10:00:00Z' },
    { id: 'v2', plan_id: 'P', created_at: '2026-09-08T10:00:00Z' },
    { id: 'w1', plan_id: 'Q', created_at: '2026-09-20T10:00:00Z' },
  ]
  test('versionCourante : la plus récente du plan', () => {
    assert.equal(versionCourante(versions, 'P').id, 'v3')
    assert.equal(versionCourante(versions, 'X'), null)
  })
  test('versionsInutilisees : ni affichée par une pastille, ni gardée', () => {
    const pastilles = [{ version_id: 'v1' }]
    assert.deepEqual(versionsInutilisees(versions, pastilles, 'P', 'v3').map((v) => v.id), ['v2'])
  })
})

describe('cadrageExtrait', () => {
  const ratioA3 = 297 / 420
  test('pastille au centre : centrée dans la fenêtre', () => {
    const c = cadrageExtrait(0.5, 0.5, ratioA3)
    assert.ok(Math.abs(c.pastilleX - 50) < 1e-9)
    assert.ok(Math.abs(c.pastilleY - 50) < 1e-9)
    assert.ok(Math.abs(c.imageLargeur - 100 / 0.3) < 1e-9)
  })
  test('pastille dans un coin : la fenêtre reste dans le plan', () => {
    const c = cadrageExtrait(0.02, 0.98, ratioA3)
    assert.equal(c.imageGauche, -0)
    assert.ok(c.pastilleX < 50 && c.pastilleY > 50)
    assert.ok(c.pastilleX >= 0 && c.pastilleY <= 100)
  })
  test('plan très allongé : fenêtre sur toute la hauteur', () => {
    const c = cadrageExtrait(0.5, 0.5, 0.1)
    assert.equal(c.imageHaut, -0)
    assert.ok(Math.abs(c.pastilleY - 50) < 1e-9)
  })
})

test('pointSurPlan : relatif au rectangle affiché, null hors plan', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 }
  assert.deepEqual(pointSurPlan(300, 150, rect), { x: 0.5, y: 0.5 })
  assert.equal(pointSurPlan(90, 150, rect), null)
})

test('zoomAutour : le point sous le doigt reste immobile, zoom borné', () => {
  const vue = { zoom: 1, dx: 0, dy: 0 }
  const v = zoomAutour(vue, 2, 200, 100)
  // point écran (200,100) = point contenu (200,100) avant ; après : dx + 200 * zoom
  assert.ok(Math.abs(v.dx + 200 * v.zoom - 200) < 1e-9)
  assert.ok(Math.abs(v.dy + 100 * v.zoom - 100) < 1e-9)
  assert.equal(zoomAutour(vue, 0.2, 0, 0).zoom, 1)
  assert.equal(zoomAutour({ zoom: 10, dx: 0, dy: 0 }, 5, 0, 0).zoom, 12)
})

test('reprise : la pastille suit sa remarque, sur la version en vigueur', () => {
  let n = 0
  const r = preparerReprise({
    sections: [{ id: 'S1', numero_romain: 'I', titre: 'G' }], sousSections: [], crId: 'CR2', affaireId: 'A',
    nouvelId: () => `id-${++n}`,
    remarques: [
      { id: 'R1', section_id: 'S1', description: 'ouverte', statut: 'a_faire', suivi_id: 'R1', cloture_reportee: false },
      { id: 'R2', section_id: 'S1', description: 'close reportée', statut: 'fait', est_clos: true, suivi_id: 'R2', cloture_reportee: true },
    ],
    pastilles: [
      { remarque_id: 'R1', plan_id: 'P', version_id: 'vA', x: 0.2, y: 0.7 },
      { remarque_id: 'R2', plan_id: 'P', version_id: 'vA', x: 0.5, y: 0.5 },
    ],
    versionsCourantes: new Map([['P', 'vB']]),
  })
  assert.equal(r.pastilles.length, 1)
  assert.deepEqual(
    { ...r.pastilles[0], id: undefined },
    { id: undefined, affaire_id: 'A', cr_id: 'CR2', remarque_id: r.remarques[0].id, plan_id: 'P', version_id: 'vB', x: 0.2, y: 0.7 },
  )
})

test('limiterVue : le plan ne sort pas entièrement de l’écran', () => {
  assert.deepEqual(limiterVue({ zoom: 1, dx: 5000, dy: -5000 }, 400, 300), { zoom: 1, dx: 300, dy: -225 })
  assert.deepEqual(limiterVue({ zoom: 2, dx: -100, dy: 50 }, 400, 300), { zoom: 2, dx: -100, dy: 50 })
})
