// Jalons accrochés au début ou à la fin d'une barre : date tirée de l'ancre,
// recalage après un mouvement de barre, côté touché, déplacement à la main.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { bordTouche, estAncre, ancrageDisponible } from '../src/shared/planning/ancrage.js'
import {
  dateAncre, jalonsARecaler, champsAccroche, CHAMPS_DETACHE,
} from '../src/modules/chantier/planning/jalonsAncres.js'
import { deplacerJalon } from '../src/modules/chantier/planning/geometrie.js'
import { formatDateISO, parseDate } from '../src/modules/chantier/planning/types.js'
import {
  semaineAncre, jalonsARecalerEtude, champsAccrocheEtude, CHAMPS_DETACHE_ETUDE,
} from '../src/modules/etude/planning/jalonsAncresEtude.js'

// Fermeture de Noël, bloquante : elle allonge les barres qui la traversent
const NOEL = { date_debut: '2026-12-21', date_fin: '2027-01-01', est_bloquante: true }

const TACHES = [
  { id: 1, debut: '2026-03-02', duree: 5 },   // lun 2 → ven 6 mars
  { id: 2, debut: '2026-12-14', duree: 10 },  // traverse Noël
]
const SEGMENTS = [{ id: 'seg-a', tache_id: 1, date_debut: '2026-03-16', duree_jours: 3 }]

const jalon = (champs) => ({ id: 9, label: 'Réception', date: '2026-01-01', couleur: '#8B5CF6', ...champs })

describe('ancrage commun', () => {
  test('la moitié gauche de la barre accroche au début, la droite à la fin', () => {
    const rect = { left: 100, width: 80 }
    assert.equal(bordTouche(110, rect), 'debut')
    assert.equal(bordTouche(139, rect), 'debut')
    assert.equal(bordTouche(140, rect), 'fin')
    assert.equal(bordTouche(179, rect), 'fin')
  })

  test('un jalon est accroché dès qu’une de ses ancres est renseignée', () => {
    assert.equal(estAncre(jalon({})), false)
    assert.equal(estAncre(jalon({ ancre_tache_id: null, ancre_segment_id: null, ancre_bord: 'fin' })), false)
    assert.equal(estAncre(jalon({ ancre_tache_id: 1 })), true)
    assert.equal(estAncre(jalon({ ancre_segment_id: 'seg-a' })), true)
    assert.equal(estAncre(jalon({ ancre_phase_id: 4 })), true)
  })

  test('sans la migration 053, les jalons n’ont pas les colonnes d’ancre', () => {
    assert.equal(ancrageDisponible([{ id: 1, label: 'A', date: '2026-01-01' }]), false)
    assert.equal(ancrageDisponible([{ id: 1, ancre_bord: null }]), true)
    assert.equal(ancrageDisponible([]), false)
  })
})

describe('chantier : date d’un jalon accroché', () => {
  const ctx = { tasks: TACHES, segments: SEGMENTS, periodes: [NOEL] }

  test('au début ou à la fin d’une tâche', () => {
    assert.equal(dateAncre(jalon({ ancre_tache_id: 1, ancre_bord: 'debut' }), ctx), '2026-03-02')
    assert.equal(dateAncre(jalon({ ancre_tache_id: 1, ancre_bord: 'fin' }), ctx), '2026-03-06')
  })

  test('la fin suit la barre dessinée : une fermeture l’allonge', () => {
    // 14→18 déc (5 j), Noël fermé, puis 4→8 janv (5 j)
    assert.equal(dateAncre(jalon({ ancre_tache_id: 2, ancre_bord: 'fin' }), ctx), '2027-01-08')
  })

  test('un segment prime sur la tâche', () => {
    const j = jalon({ ancre_tache_id: 1, ancre_segment_id: 'seg-a', ancre_bord: 'fin' })
    assert.equal(dateAncre(j, ctx), '2026-03-18')
  })

  test('ni ancre, ni barre retrouvée : pas de date', () => {
    assert.equal(dateAncre(jalon({}), ctx), null)
    assert.equal(dateAncre(jalon({ ancre_tache_id: 99, ancre_bord: 'debut' }), ctx), null)
  })

  test('seuls les jalons dont la date a changé sont à recaler', () => {
    const jalons = [
      jalon({ id: 1, date: '2026-03-06', ancre_tache_id: 1, ancre_bord: 'fin' }),   // déjà juste
      jalon({ id: 2, date: '2026-03-01', ancre_tache_id: 1, ancre_bord: 'debut' }), // en retard
      jalon({ id: 3, date: '2026-05-05' }),                                          // libre
      jalon({ id: 4, date: '2026-05-05', ancre_tache_id: 99, ancre_bord: 'fin' }),   // barre disparue
    ]
    assert.deepEqual(jalonsARecaler(jalons, ctx), [{ id: 2, date: '2026-03-02' }])
  })

  test('accrocher renseigne une seule ancre ; détacher garde le côté', () => {
    assert.deepEqual(champsAccroche({ type: 'task', id: 1 }, 'fin'),
      { ancre_tache_id: 1, ancre_segment_id: null, ancre_bord: 'fin' })
    assert.deepEqual(champsAccroche({ type: 'segment', id: 'seg-a' }, 'debut'),
      { ancre_tache_id: null, ancre_segment_id: 'seg-a', ancre_bord: 'debut' })
    assert.deepEqual(CHAMPS_DETACHE, { ancre_tache_id: null, ancre_segment_id: null })
  })
})

describe('chantier : déplacer un jalon à la main', () => {
  const dateRef = parseDate('2026-03-02')
  // Jours de 40 px, week-ends réduits à 14 px (comme l'écran)
  const dayPositions = [0]
  for (let i = 0; i < 40; i++) {
    const d = new Date(2026, 2, 2 + i)
    dayPositions.push(dayPositions[i] + (d.getDay() % 6 === 0 ? 14 : 40))
  }
  const jour = { viewMode: 'day', dateRef, dayPositions, dayWidth: 40 }
  const bouger = (date, dx, geo = jour) => formatDateISO(deplacerJalon({ date, dx, geo }))

  test('vue jour : le jour dont le bord est le plus proche, dans le sens du geste', () => {
    assert.equal(bouger('2026-03-04', 25), '2026-03-05')
    assert.equal(bouger('2026-03-04', 15), '2026-03-04', 'moins d’une demi-colonne : rien ne bouge')
    assert.equal(bouger('2026-03-04', -30), '2026-03-03')
  })

  test('vue semaine : au jour près, à l’échelle de la semaine', () => {
    const geo = { viewMode: 'week', dateRef, weekWidth: 70 }
    assert.equal(bouger('2026-03-04', 24, geo), '2026-03-06')
    assert.equal(bouger('2026-03-04', -21, geo), '2026-03-02')
  })
})

describe('étude : semaine d’un jalon accroché', () => {
  const PHASES = [
    { id: 1, semaine_debut: 10, annee_debut: 2026, duree_semaines: 4 },  // S10 → S13
    { id: 2, semaine_debut: 50, annee_debut: 2026, duree_semaines: 4 },  // traverse Noël
  ]
  const SEG = [{ id: 'seg-e', phase_id: 1, semaine_debut: 20, annee_debut: 2026, duree_semaines: 3 }]
  const ctx = { phases: PHASES, segments: SEG, periodes: [NOEL] }

  test('début et fin d’une phase', () => {
    assert.deepEqual(semaineAncre(jalon({ ancre_phase_id: 1, ancre_bord: 'debut' }), ctx), { semaine: 10, annee: 2026 })
    assert.deepEqual(semaineAncre(jalon({ ancre_phase_id: 1, ancre_bord: 'fin' }), ctx), { semaine: 13, annee: 2026 })
  })

  test('une phase coupée par Noël finit plus tard, l’année suivante', () => {
    // S50, S51 travaillées ; S52 et S53 de 2026 fermées ; S1, S2 de 2027
    const fin = semaineAncre(jalon({ ancre_phase_id: 2, ancre_bord: 'fin' }), ctx)
    assert.equal(fin.annee, 2027)
    assert.ok(fin.semaine >= 1 && fin.semaine <= 3, `semaine ${fin.semaine}`)
  })

  test('un segment : sa première et sa dernière semaine', () => {
    assert.deepEqual(semaineAncre(jalon({ ancre_segment_id: 'seg-e', ancre_bord: 'debut' }), ctx), { semaine: 20, annee: 2026 })
    assert.deepEqual(semaineAncre(jalon({ ancre_segment_id: 'seg-e', ancre_bord: 'fin' }), ctx), { semaine: 22, annee: 2026 })
  })

  test('barre disparue ou jalon libre : rien', () => {
    assert.equal(semaineAncre(jalon({ ancre_phase_id: 99, ancre_bord: 'fin' }), ctx), null)
    assert.equal(semaineAncre(jalon({ semaine: 3, annee: 2026 }), ctx), null)
  })

  test('recalage : seuls les jalons décalés de leur ancre', () => {
    const jalons = [
      { id: 1, semaine: 13, annee: 2026, ancre_phase_id: 1, ancre_bord: 'fin' },
      { id: 2, semaine: 9, annee: 2026, ancre_phase_id: 1, ancre_bord: 'debut' },
      { id: 3, semaine: 9, annee: 2026 },
    ]
    assert.deepEqual(jalonsARecalerEtude(jalons, ctx), [{ id: 2, semaine: 10, annee: 2026 }])
  })

  test('accrocher et détacher', () => {
    assert.deepEqual(champsAccrocheEtude({ type: 'phase', id: 1 }, 'debut'),
      { ancre_phase_id: 1, ancre_segment_id: null, ancre_bord: 'debut' })
    assert.deepEqual(champsAccrocheEtude({ type: 'segment', id: 'seg-e' }, 'fin'),
      { ancre_phase_id: null, ancre_segment_id: 'seg-e', ancre_bord: 'fin' })
    assert.deepEqual(CHAMPS_DETACHE_ETUDE, { ancre_phase_id: null, ancre_segment_id: null })
  })
})
