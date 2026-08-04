// Propagation en cascade des chemins critiques du planning chantier.
//
// La fonction testée est pure : elle prend l'état courant et renvoie la liste
// des entités à décaler, sans lire ni écrire quoi que ce soit.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  propagateAllDependencies,
  buildParentEdges,
  skipBlockedPeriods,
  entityKey,
  finTache,
  endDateChanged,
} from '../src/modules/chantier/planning/propagation.js'
import { formatDateISO, parseDate } from '../src/modules/chantier/planning/types.js'

// Convention de lag du projet (cf. applyLag dans types.js) :
//   debut(enfant) = dernier jour ouvré du parent + lag jours ouvrés
// Un lag de 0 fait donc démarrer l'enfant LE JOUR MÊME où le parent finit,
// et non le lendemain.

// ── Fabriques ────────────────────────────────────────────────────────────────

// Semaine de référence : lundi 2 mars 2026 → vendredi 6 mars 2026
const T = (id, debut, duree = 5, extra = {}) => ({
  id, nom: `T${id}`, debut, duree, lot_id: 1, ...extra,
})

const S = (id, tacheId, date_debut, duree_jours = 3) => ({
  id, tache_id: tacheId, date_debut, duree_jours,
})

// Dépendance de la table planning_dependances
const D = (source, cible, lag = 0) => ({
  id: `d-${source}-${cible}`,
  source_tache_id: source, cible_tache_id: cible,
  source_segment_id: null, cible_segment_id: null,
  lag_jours: lag,
})

const propager = (args) => propagateAllDependencies({
  tasks: [], segments: [], dependances: [], periodes: [], ...args,
})

// Début résultant d'une entité, ou null si elle n'a pas bougé
const debutDe = (updates, type, id) => updates.get(entityKey(type, id))?.debut ?? null

// ── Chaîne ───────────────────────────────────────────────────────────────────

describe('chaîne A → B → C', () => {
  // État au repos : chaque enfant démarre le dernier jour de son parent
  const tasks = [
    T(1, '2026-03-02'),           // lun 2 → ven 6
    T(2, '2026-03-06'),           // ven 6 → jeu 12
    T(3, '2026-03-12'),           // jeu 12 → mer 18
  ]
  const dependances = [D(1, 2), D(2, 3)]

  test('un décalage se propage jusqu’au bout de la chaîne', () => {
    // A avancée d'une semaine : B et C suivent
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    assert.equal(debutDe(u, 'task', 2), '2026-03-13')
    assert.equal(debutDe(u, 'task', 3), '2026-03-19')
  })

  test('la tâche déplacée ne figure jamais dans le résultat', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    assert.equal(u.has(entityKey('task', 1)), false)
  })

  test('un allongement de durée décale aussi les suivantes', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-02', newDuree: 10,   // fin repoussée au ven 13
    })
    assert.equal(debutDe(u, 'task', 2), '2026-03-13')
    assert.equal(debutDe(u, 'task', 3), '2026-03-19')
  })

  test('une tâche déjà à la bonne date n’est pas réécrite', () => {
    // B démarre déjà le ven 6, dernier jour de A : rien à décaler
    const u = propager({
      tasks: [T(1, '2026-03-02'), T(2, '2026-03-06')], dependances: [D(1, 2)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-02', newDuree: 5,
    })
    assert.equal(u.size, 0)
  })

  test('chaque entité n’est écrite qu’une fois', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-23', newDuree: 5,
    })
    // Une Map : pas de doublon possible, donc pas d'écritures concurrentes
    assert.equal(u.size, 2)
    assert.equal(debutDe(u, 'task', 2), '2026-03-27')
    assert.equal(debutDe(u, 'task', 3), '2026-04-02')
  })
})

// ── Convergence (fan-in) ─────────────────────────────────────────────────────

describe('convergence A → C, B → C', () => {
  // C est calée sur la contrainte la plus tardive : la fin de B (ven 13)
  const tasks = [
    T(1, '2026-03-02'),           // fin ven 6
    T(2, '2026-03-09'),           // fin ven 13
    T(3, '2026-03-13'),
  ]
  const dependances = [D(1, 3), D(2, 3)]

  test('l’enfant se cale sur le parent le plus tardif', () => {
    // On avance A : B reste la contrainte la plus tardive, C ne bouge pas
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-02-23', newDuree: 5,
    })
    assert.equal(u.has(entityKey('task', 3)), false,
      'C est encore contrainte par B : elle ne doit pas reculer')
  })

  test('l’enfant recule seulement si toutes ses contraintes reculent', () => {
    const u = propager({
      tasks: [T(1, '2026-02-23'), T(2, '2026-03-09'), T(3, '2026-03-13')],
      dependances,
      changedType: 'task', changedId: 2,
      newDebut: '2026-03-02', newDuree: 5,   // B recule d'une semaine
    })
    // A finit le ven 27/02, B le ven 6 : c'est B qui contraint C
    assert.equal(debutDe(u, 'task', 3), '2026-03-06')
  })

  test('repousser un seul parent suffit à repousser l’enfant', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-23', newDuree: 5,   // A devient la contrainte tardive
    })
    assert.equal(debutDe(u, 'task', 3), '2026-03-27')
  })
})

// ── Diamant ──────────────────────────────────────────────────────────────────

describe('diamant A → B → D, A → C → D', () => {
  const tasks = [
    T(1, '2026-03-02'),           // A, fin ven 6
    T(2, '2026-03-06', 5),        // B, ven 6 → jeu 12
    T(3, '2026-03-06', 10),       // C, ven 6 → jeu 19 — la branche longue
    T(4, '2026-03-19'),           // D, calée sur la branche longue
  ]
  const dependances = [D(1, 2), D(1, 3), D(2, 4), D(3, 4)]

  test('D suit la branche la plus longue', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,   // A décalée d'une semaine
    })
    assert.equal(debutDe(u, 'task', 2), '2026-03-13')
    assert.equal(debutDe(u, 'task', 3), '2026-03-13')
    // B finit le jeu 19, C le jeu 26 : c'est la branche longue qui l'emporte
    assert.equal(debutDe(u, 'task', 4), '2026-03-26')
  })

  test('D n’est écrite qu’une seule fois malgré ses deux parents', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    // Une écriture concurrente sur D était le bug historique du fan-in
    assert.equal(u.size, 3, 'B, C et D — pas davantage')
  })

  test('raccourcir la branche longue laisse la courte imposer la date', () => {
    const u = propager({
      tasks, dependances,
      changedType: 'task', changedId: 3,
      newDebut: '2026-03-06', newDuree: 2,   // C finit désormais le lun 9
    })
    // B finit toujours le jeu 12 : c'est elle qui contraint D désormais
    assert.equal(debutDe(u, 'task', 4), '2026-03-12')
  })
})

// ── Lag ──────────────────────────────────────────────────────────────────────

describe('lag', () => {
  const tasks = [T(1, '2026-03-02'), T(2, '2026-03-09')]

  test('un lag positif décale l’enfant d’autant de jours ouvrés', () => {
    const u = propager({
      tasks, dependances: [D(1, 2, 3)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-02', newDuree: 5,
    })
    // Fin de A ven 6 + 3 jours ouvrés = mer 11
    assert.equal(debutDe(u, 'task', 2), '2026-03-11')
  })

  test('un lag nul enchaîne au jour ouvré suivant', () => {
    const u = propager({
      tasks: [T(1, '2026-03-02'), T(2, '2026-03-20')],
      dependances: [D(1, 2, 0)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-02', newDuree: 5,
    })
    assert.equal(debutDe(u, 'task', 2), '2026-03-06',
      'lag 0 : l’enfant démarre le dernier jour du parent')
  })

  test('le lag franchit les week-ends', () => {
    const u = propager({
      tasks, dependances: [D(1, 2, 5)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-02', newDuree: 5,
    })
    // ven 6 + 5 ouvrés = ven 13 (le week-end ne compte pas)
    assert.equal(debutDe(u, 'task', 2), '2026-03-13')
  })

  test('le lag historique depends_on / lag_days est pris en compte', () => {
    const u = propager({
      tasks: [T(1, '2026-03-02'), T(2, '2026-03-09', 5, { depends_on: 1, lag_days: 2 })],
      dependances: [],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    // fin ven 13 + 2 ouvrés = mar 17
    assert.equal(debutDe(u, 'task', 2), '2026-03-17')
  })

  test('les deux sources de dépendances alimentent le même graphe', () => {
    const edges = buildParentEdges(
      [T(1, '2026-03-02'), T(2, '2026-03-09', 5, { depends_on: 1, lag_days: 1 })],
      [D(3, 2, 4)]
    )
    const parents = edges.get(entityKey('task', 2))
    assert.equal(parents.length, 2, 'depends_on ET planning_dependances')
    assert.deepEqual(parents.map(p => p.lag).sort(), [1, 4])
  })
})

// ── Cycles ───────────────────────────────────────────────────────────────────

describe('dépendances cycliques', () => {
  test('un cycle A → B → A se termine sans boucler', () => {
    const u = propager({
      tasks: [T(1, '2026-03-02'), T(2, '2026-03-09')],
      dependances: [D(1, 2), D(2, 1)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    // La tâche déplacée reste où l'utilisateur l'a posée
    assert.equal(u.has(entityKey('task', 1)), false)
    assert.equal(debutDe(u, 'task', 2), '2026-03-13')
  })

  test('un cycle à trois se termine aussi', () => {
    const u = propager({
      tasks: [T(1, '2026-03-02'), T(2, '2026-03-09'), T(3, '2026-03-16')],
      dependances: [D(1, 2), D(2, 3), D(3, 1)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    assert.equal(u.has(entityKey('task', 1)), false)
    assert.ok(u.size >= 1)
  })

  test('une auto-dépendance ne produit aucune mise à jour', () => {
    const u = propager({
      tasks: [T(1, '2026-03-02')],
      dependances: [D(1, 1)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-09', newDuree: 5,
    })
    assert.equal(u.size, 0)
  })
})

// ── Périodes bloquées ────────────────────────────────────────────────────────

describe('périodes bloquées', () => {
  const conges = [{
    id: 'p1', nom: 'Congés', couleur: '#B8412C',
    date_debut: '2026-03-09', date_fin: '2026-03-13',
  }]

  test('une tâche ne peut pas démarrer dans une période bloquante', () => {
    // A dure 6 jours ouvrés : elle finit le lun 9, en plein dans les congés
    const args = {
      tasks: [T(1, '2026-03-02', 6), T(2, '2026-03-20')],
      dependances: [D(1, 2)],
      changedType: 'task', changedId: 1,
      newDebut: '2026-03-02', newDuree: 6,
    }
    assert.equal(debutDe(propager({ ...args, periodes: conges }), 'task', 2), '2026-03-16',
      'reporté au premier jour ouvré après les congés')
    assert.equal(debutDe(propager(args), 'task', 2), '2026-03-09',
      'sans période bloquante, la même situation ne décale rien')
  })

  test('une période informative ne décale rien', () => {
    const informative = [{ ...conges[0], est_bloquante: false }]
    const debut = skipBlockedPeriods(parseDate('2026-03-09'), informative)
    assert.equal(formatDateISO(debut), '2026-03-09')
  })

  test('skipBlockedPeriods saute week-ends et périodes', () => {
    // Samedi 7 mars → lundi 16 (le week-end puis la semaine de congés)
    assert.equal(formatDateISO(skipBlockedPeriods(parseDate('2026-03-07'), conges)), '2026-03-16')
    // Un jour ouvré libre n'est pas déplacé
    assert.equal(formatDateISO(skipBlockedPeriods(parseDate('2026-03-03'), conges)), '2026-03-03')
  })

  test('sans période, seuls les week-ends décalent', () => {
    assert.equal(formatDateISO(skipBlockedPeriods(parseDate('2026-03-07'), [])), '2026-03-09')
    assert.equal(formatDateISO(skipBlockedPeriods(parseDate('2026-03-07'))), '2026-03-09')
  })

  test('une période sans dates est ignorée', () => {
    const bancale = [{ id: 'x', date_debut: null, date_fin: null }]
    assert.equal(formatDateISO(skipBlockedPeriods(parseDate('2026-03-03'), bancale)), '2026-03-03')
  })
})

// ── Segments ─────────────────────────────────────────────────────────────────

describe('segments', () => {
  test('un segment peut porter une dépendance', () => {
    const u = propagateAllDependencies({
      tasks: [T(1, '2026-03-02'), T(2, '2026-03-20')],
      segments: [S('s1', 1, '2026-03-02')],
      dependances: [{
        id: 'd1', source_segment_id: 's1', cible_tache_id: 2,
        source_tache_id: null, cible_segment_id: null, lag_jours: 0,
      }],
      periodes: [],
      changedType: 'segment', changedId: 's1',
      newDebut: '2026-03-09', newDuree: 3,
    })
    // Segment de 3 jours à partir du lun 9 → fin mer 11
    assert.equal(debutDe(u, 'task', 2), '2026-03-11')
  })

  test('une entité inconnue ne produit rien', () => {
    const u = propager({
      tasks: [T(1, '2026-03-02')],
      changedType: 'task', changedId: 999,
      newDebut: '2026-03-09', newDuree: 5,
    })
    assert.equal(u.size, 0)
  })
})

// ── Fin de tâche et garde de redimensionnement ───────────────────────────────

describe('finTache et endDateChanged', () => {
  test('la fin est le dernier jour ouvré, pas le lendemain', () => {
    assert.equal(formatDateISO(finTache({ debut: '2026-03-02', duree: 5 })), '2026-03-06')
    assert.equal(formatDateISO(finTache({ debut: '2026-03-02', duree: 1 })), '2026-03-02')
  })

  test('une durée nulle ou absente vaut un jour', () => {
    assert.equal(formatDateISO(finTache({ debut: '2026-03-02', duree: 0 })), '2026-03-02')
    assert.equal(formatDateISO(finTache({ debut: '2026-03-02' })), '2026-03-02')
  })

  test('un redimensionnement par la gauche ne change pas la fin', () => {
    // Le début recule d'un jour ouvré et la durée augmente d'autant
    const avant = { debut: '2026-03-03', duree: 4 }
    const apres = { debut: '2026-03-02', duree: 5 }
    assert.equal(endDateChanged(avant, apres), false,
      'aucune dépendance affectée : propager serait un faux positif')
  })

  test('un redimensionnement par la droite change la fin', () => {
    assert.equal(endDateChanged({ debut: '2026-03-02', duree: 5 },
                                { debut: '2026-03-02', duree: 6 }), true)
  })

  test('un simple déplacement change la fin', () => {
    assert.equal(endDateChanged({ debut: '2026-03-02', duree: 5 },
                                { debut: '2026-03-09', duree: 5 }), true)
  })
})
