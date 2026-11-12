// Portions d'une barre de planning en pause pendant une période bloquante :
// la barre les enjambe, l'écran les dessine en contour seul sous les hachures
// de la période (chantier et étude).

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { plagesEnPause, pausesDeLaBarre, barreSemaine } from '../src/modules/chantier/planning/geometrie.js'
import { formatDateISO, parseDate } from '../src/modules/chantier/planning/types.js'
import { computePhaseFragments, pausesEntreFragments } from '../src/modules/etude/planning/types.js'
import { masquePauses, styleMasque } from '../src/shared/planning/pauseBarre.js'

// Lundi 21 décembre 2026 → vendredi 1er janvier 2027
const NOEL = { label: 'Noël', couleur: '#B8412C', date_debut: '2026-12-21', date_fin: '2027-01-01', est_bloquante: true }
const INFO = { ...NOEL, est_bloquante: false }
const iso = (plages) => plages.map((p) => [formatDateISO(p.debut), formatDateISO(p.fin)])

describe('plagesEnPause (chantier)', () => {
  // Jeudi 17 + vendredi 18, puis lundi 4 et mardi 5 janvier
  test('vue jour : les jours de la fermeture, au jour près', () => {
    const plages = plagesEnPause('2026-12-17', 4, [NOEL], 'day')
    assert.deepEqual(iso(plages), [['2026-12-21', '2027-01-01']])
    assert.equal(plages[0].periode, NOEL)
  })

  test('vue semaine : semaines entières sans jour travaillé', () => {
    assert.deepEqual(iso(plagesEnPause('2026-12-17', 4, [NOEL], 'week')), [['2026-12-21', '2027-01-03']])
  })

  test('une période informative ne met rien en pause', () => {
    assert.deepEqual(plagesEnPause('2026-12-17', 4, [INFO], 'day'), [])
  })

  test('une tâche hors de la période n’a pas de pause', () => {
    assert.deepEqual(plagesEnPause('2026-11-02', 5, [NOEL], 'day'), [])
  })

  test('vue semaine : une fermeture de deux jours ne coupe pas la semaine', () => {
    const pont = { date_debut: '2026-11-10', date_fin: '2026-11-11', est_bloquante: true }
    assert.deepEqual(plagesEnPause('2026-11-09', 3, [pont], 'week'), [])
    assert.deepEqual(iso(plagesEnPause('2026-11-09', 3, [pont], 'day')), [['2026-11-10', '2026-11-11']])
  })
})

describe('pausesDeLaBarre (chantier)', () => {
  test('vue semaine : position relative à la barre', () => {
    const dateRef = parseDate('2026-12-07')
    const geo = { viewMode: 'week', dateRef, weekWidth: 20, periodes: [NOEL] }
    const barre = barreSemaine(parseDate('2026-12-17'), 4, dateRef, 20, [NOEL])
    assert.deepEqual(barre, { left: 20, width: 80 })
    const pauses = pausesDeLaBarre('2026-12-17', 4, geo, barre)
    assert.deepEqual(pauses.map(({ x, largeur }) => [x, largeur]), [[20, 40]])
  })
})

describe('pausesEntreFragments (étude)', () => {
  test('le trou entre deux fragments, avec sa période', () => {
    // S51 2026 (14 déc.), 3 semaines : S51, puis S01 et S02 2027 — S52 et S53 bloquées
    const phase = { semaine_debut: 51, annee_debut: 2026, duree_semaines: 3 }
    const fragments = computePhaseFragments(phase, [NOEL])
    assert.equal(fragments.length, 2)
    const pauses = pausesEntreFragments(fragments, [NOEL])
    assert.equal(pauses.length, 1)
    assert.equal(pauses[0].semaine_debut, 52)
    assert.equal(pauses[0].annee_debut, 2026)
    assert.equal(pauses[0].duree_semaines, 2)
    assert.equal(pauses[0].periode, NOEL)
  })

  test('une phase d’un seul morceau n’a pas de pause', () => {
    assert.deepEqual(pausesEntreFragments([{ semaine_debut: 10, annee_debut: 2026, duree_semaines: 4 }], [NOEL]), [])
  })
})

describe('masque des pauses', () => {
  test('rien sans pause', () => {
    assert.equal(masquePauses([]), undefined)
    assert.deepEqual(styleMasque([]), {})
  })

  test('le remplissage est retiré sur chaque pause', () => {
    assert.equal(
      masquePauses([{ x: 20, largeur: 40 }]),
      'linear-gradient(to right, #000 0px, #000 20px, transparent 20px, transparent 60px, #000 60px, #000 100%)',
    )
    assert.ok(styleMasque([{ x: 0, largeur: 5 }]).WebkitMaskImage)
  })
})
