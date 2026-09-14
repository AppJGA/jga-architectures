// Chemin critique du planning étude.
//
// Le calcul est pur : l'état des phases entre, les changements à appliquer et à
// enregistrer sortent. C'est ce qui garantit que les phases décalées à l'écran
// sont aussi celles écrites en base.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { calculerModificationPhase } from '../src/modules/etude/planning/types.js'

// Phase de 2 semaines ; `depends_on`/`lag_semaines` en option
const P = (id, semaine, duree = 2, extra = {}) => ({
  id, nom: `P${id}`, semaine_debut: semaine, annee_debut: 2026, duree_semaines: duree,
  depends_on: null, lag_semaines: 0, ...extra,
})

describe('calculerModificationPhase', () => {
  // A (S10-11) → B (S12-13) → C (S14-15), phases collées
  const phases = [
    P(1, 10),
    P(2, 12, 2, { depends_on: 1 }),
    P(3, 14, 2, { depends_on: 2 }),
  ]

  test('décaler A décale B puis C, et le renvoie pour l’enregistrement', () => {
    const { cascades } = calculerModificationPhase(phases, 1, { semaine_debut: 13, annee_debut: 2026 })
    assert.deepEqual(cascades, [
      { id: 2, semaine_debut: 15, annee_debut: 2026 },
      { id: 3, semaine_debut: 17, annee_debut: 2026 },
    ])
  })

  test('allonger A par la modale décale aussi les suivantes', () => {
    const { cascades } = calculerModificationPhase(phases, 1, { nom: 'A', duree_semaines: 3 })
    assert.deepEqual(cascades.map((c) => c.semaine_debut), [13, 15])
  })

  test('déplacer B à la main recalcule son battement', () => {
    const { changes } = calculerModificationPhase(phases, 2, { semaine_debut: 14, annee_debut: 2026 })
    assert.equal(changes.lag_semaines, 2)
  })

  test('un battement saisi replace la phase', () => {
    const { changes, cascades } = calculerModificationPhase(phases, 2, { lag_semaines: 1 })
    assert.equal(changes.semaine_debut, 13)
    assert.deepEqual(cascades, [{ id: 3, semaine_debut: 15, annee_debut: 2026 }])
  })

  test('une phase inconnue ne produit rien', () => {
    assert.deepEqual(calculerModificationPhase(phases, 99, { semaine_debut: 1 }),
      { changes: { semaine_debut: 1 }, cascades: [] })
  })
})
