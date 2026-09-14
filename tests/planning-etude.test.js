// Chemin critique du planning étude.
//
// Le calcul est pur : l'état des phases entre, les changements à appliquer et à
// enregistrer sortent. C'est ce qui garantit que les phases décalées à l'écran
// sont aussi celles écrites en base.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  calculerModificationPhase, creeraitUnCycle, descendantsPhase,
  recalerPhasesDependantes, normaliserSemaine,
} from '../src/modules/etude/planning/types.js'
import { computeCriticalPath } from '../src/modules/etude/planning/computeCriticalPath.js'
import { construirePayloadPhase, champsModifiesPhase } from '../src/modules/etude/planning/formulairePhaseEtude.js'
import { rapprocherPhasesNotion } from '../src/modules/etude/planning/rapprochementNotion.js'

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

// ── Boucles de dépendances ────────────────────────────────────────────────────

describe('boucles de dépendances', () => {
  // 1 ← 2 ← 3
  const chaine = [P(1, 10), P(2, 12, 2, { depends_on: 1 }), P(3, 14, 2, { depends_on: 2 })]

  test('une descendante ne peut pas devenir le prédécesseur', () => {
    assert.equal(creeraitUnCycle(chaine, 1, 3), true)
    assert.equal(creeraitUnCycle(chaine, 1, 1), true)
    assert.equal(creeraitUnCycle(chaine, 3, 1), false)
    assert.equal(creeraitUnCycle(chaine, 2, null), false)
  })

  test('les descendantes sont toutes trouvées', () => {
    assert.deepEqual([...descendantsPhase(chaine, 1)].sort(), [2, 3])
    assert.equal(descendantsPhase(chaine, 3).size, 0)
  })

  test('une boucle déjà en base ne renvoie pas la phase modifiée dans les décalages', () => {
    const boucle = [P(1, 10, 2, { depends_on: 2 }), P(2, 12, 2, { depends_on: 1 })]
    const { cascades } = calculerModificationPhase(boucle, 1, { semaine_debut: 11, annee_debut: 2026 })
    assert.ok(cascades.length > 0)
    assert.ok(cascades.every((c) => c.id !== 1))
  })
})

// ── Nouveau prédécesseur choisi dans la modale ────────────────────────────────

describe('changement de prédécesseur', () => {
  const phases = [P(1, 10), P(3, 20)]

  test('un battement saisi avec le nouveau parent replace la phase', () => {
    const { changes } = calculerModificationPhase(phases, 3, { depends_on: 1, lag_semaines: 3 })
    assert.equal(changes.semaine_debut, 15)
    assert.equal(changes.lag_semaines, 3)
  })

  test('sans battement, il se déduit de la position actuelle', () => {
    const { changes } = calculerModificationPhase(phases, 3, { depends_on: 1 })
    assert.equal(changes.lag_semaines, 8)
    assert.equal(changes.semaine_debut, undefined)
  })
})

describe('formulaire de la modale', () => {
  const form = (extra = {}) => ({
    nom: 'APS', type_tache: 'etude', semaine_debut: 10, annee_debut: 2026, duree_semaines: 4,
    duree_arch: '', duree_bet: '', duree_econ: '', label_barre: '', couleur_custom: null,
    depends_on: null, lag_semaines: 0, ...extra,
  })
  const diff = (avant, apres, propose = null) =>
    champsModifiesPhase(construirePayloadPhase(avant), construirePayloadPhase(apres), propose)

  test('seuls les champs modifiés sont renvoyés', () => {
    assert.deepEqual(diff(form(), form({ nom: 'APS bis' })), { nom: 'APS bis' })
    assert.deepEqual(diff(form(), form()), {})
  })

  test('le battement proposé au choix du parent n’est pas une saisie', () => {
    assert.deepEqual(diff(form(), form({ depends_on: 1, lag_semaines: 8 }), 8), { depends_on: 1 })
  })

  test('un battement différent de la proposition est envoyé', () => {
    assert.deepEqual(diff(form(), form({ depends_on: 1, lag_semaines: 2 }), 8), { depends_on: 1, lag_semaines: 2 })
  })

  test('un battement négatif proposé n’est pas une saisie', () => {
    assert.deepEqual(diff(form(), form({ depends_on: 1, lag_semaines: -2 }), -2), { depends_on: 1 })
  })

  test('retirer le parent remet le battement à zéro', () => {
    assert.deepEqual(
      diff(form({ depends_on: 1, lag_semaines: 2 }), form({ depends_on: null, lag_semaines: 2 })),
      { depends_on: null, lag_semaines: 0 }
    )
  })

  test('une S53 d’une année à 52 semaines est ramenée sur la S1 suivante', () => {
    const payload = construirePayloadPhase(form({ semaine_debut: 53, annee_debut: 2025 }))
    assert.deepEqual([payload.semaine_debut, payload.annee_debut], [1, 2026])
    assert.deepEqual(normaliserSemaine(53, 2026), { semaine: 53, annee: 2026 })
    assert.deepEqual(normaliserSemaine(0, 2026), { semaine: 52, annee: 2025 })
  })
})

// ── Périodes bloquantes ───────────────────────────────────────────────────────

// S11 2026 : du lundi 9 au vendredi 13 mars
const CONGES_S11 = [{ id: 'p1', date_debut: '2026-03-09', date_fin: '2026-03-13', est_bloquante: true }]

describe('recalerPhasesDependantes', () => {
  // A (S10-11) → B (S12-13) → C (S15-16, une semaine de battement)
  const phases = [
    P(1, 10),
    P(2, 12, 2, { depends_on: 1 }),
    P(3, 15, 2, { depends_on: 2, lag_semaines: 1 }),
  ]

  test('une période ajoutée recale toutes les phases dépendantes', () => {
    assert.deepEqual(recalerPhasesDependantes(phases, CONGES_S11), [
      { id: 2, semaine_debut: 13, annee_debut: 2026 },
      { id: 3, semaine_debut: 16, annee_debut: 2026 },
    ])
  })

  test('sans changement de fin effective, rien ne bouge', () => {
    assert.deepEqual(recalerPhasesDependantes(phases, []), [])
  })

  test('une période informative ne recale rien', () => {
    assert.deepEqual(recalerPhasesDependantes(phases, [{ ...CONGES_S11[0], est_bloquante: false }]), [])
  })
})

// ── Chemin critique ───────────────────────────────────────────────────────────

describe('computeCriticalPath', () => {
  test('deux phases indépendantes ne sont pas comparées comme si elles démarraient ensemble', () => {
    assert.deepEqual([...computeCriticalPath([P(1, 10), P(2, 20)])], [2])
  })

  test('les semaines bloquées repoussent la fin effective', () => {
    // A (S10, 2 sem.) finit en S12, B (S12, 1 sem.) en S13 ; avec la S11
    // bloquée, A finit elle aussi en S13
    const phases = [P(1, 10, 2), P(2, 12, 1)]
    assert.deepEqual([...computeCriticalPath(phases)], [2])
    assert.deepEqual([...computeCriticalPath(phases, CONGES_S11)].sort(), [1, 2])
  })

  test('une chaîne qui mène à la fin du projet est critique', () => {
    const phases = [P(1, 10), P(2, 12, 2, { depends_on: 1 }), P(3, 10, 3)]
    assert.deepEqual([...computeCriticalPath(phases)].sort(), [1, 2])
  })

  test('les phases sans identifiant sont ignorées', () => {
    assert.deepEqual([...computeCriticalPath([{ ...P(1, 10), id: undefined }])], [])
  })
})

// ── Rapprochement Notion ──────────────────────────────────────────────────────

describe('rapprocherPhasesNotion', () => {
  const N = (notion_id, code, ordre) => ({ notion_id, _codePhase: code, ordre })

  test('le code doit être un mot entier', () => {
    const base = [{ id: 1, nom: 'Programmation', ordre: 9 }, { id: 2, nom: 'PRO — Projet', ordre: 8 }]
    const { correspondances, nonRapprochees } = rapprocherPhasesNotion(base, [N('n1', 'PRO', 0)])
    assert.deepEqual([...correspondances], [[2, 'n1']])
    assert.equal(nonRapprochees.length, 0)
  })

  test('une phase en base n’est rapprochée qu’une fois', () => {
    const base = [{ id: 1, nom: 'ESQ', ordre: 5 }, { id: 2, nom: 'APS', ordre: 1 }]
    const { correspondances, nonRapprochees } = rapprocherPhasesNotion(base, [N('n1', 'ESQ', 1), N('n2', 'AVP', 5)])
    assert.deepEqual([...correspondances], [[1, 'n1']])
    assert.deepEqual(nonRapprochees.map((n) => n.notion_id), ['n2'])
  })

  test('un ordre ambigu ne rapproche rien', () => {
    const base = [{ id: 1, nom: 'Phase A', ordre: 2 }]
    const { correspondances } = rapprocherPhasesNotion(base, [N('n1', null, 2), N('n2', null, 2)])
    assert.equal(correspondances.size, 0)
  })

  test('un ordre unique rapproche les phases restantes', () => {
    const base = [{ id: 1, nom: 'Phase A', ordre: 2 }]
    const { correspondances } = rapprocherPhasesNotion(base, [N('n1', null, 2)])
    assert.deepEqual([...correspondances], [[1, 'n1']])
  })
})
