// Mode « Résumé » du planning de chantier : une ligne par lot (ou par zone),
// barre faite des périodes réelles d'activité.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

const { resumePlanning, fusionnerPlages } =
  await import('../src/modules/chantier/planning/resumeLogique.js')

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const morceaux = (ligne) => ligne.morceaux.map(m => `${iso(m.debut)}→${iso(m.fin)}`)

const LOTS = [
  { id: 1, num_lot: '02', nom: 'Gros œuvre', couleur: '#8B5E34', ordre: 1 },
  { id: 2, num_lot: '01', nom: 'Démolition', couleur: '#E8602C', ordre: 0 },
  { id: 3, num_lot: '03', nom: 'Charpente', couleur: '#2A8A4E', ordre: 2 },
]
const ZONES = [
  { id: 'a', nom: 'Bâtiment A', couleur: '#3366AA', ordre: 0 },
  { id: 'b', nom: 'Bâtiment B', couleur: '#AA3366', ordre: 1 },
]

describe('fusion des plages d’un lot', () => {
  test('deux tâches enchaînées par-dessus un week-end font un seul morceau', () => {
    // Lundi 2 → vendredi 6 mars, puis lundi 9 → vendredi 13
    const p = fusionnerPlages([
      { debut: new Date(2026, 2, 2), fin: new Date(2026, 2, 6) },
      { debut: new Date(2026, 2, 9), fin: new Date(2026, 2, 13) },
    ])
    assert.deepEqual(p.map(m => `${iso(m.debut)}→${iso(m.fin)}`), ['2026-03-02→2026-03-13'])
  })

  test('un jour ouvré libre entre deux tâches laisse un trou', () => {
    const p = fusionnerPlages([
      { debut: new Date(2026, 2, 2), fin: new Date(2026, 2, 4) },
      { debut: new Date(2026, 2, 6), fin: new Date(2026, 2, 10) },
    ])
    assert.equal(p.length, 2)
  })

  test('une fermeture bloquante entre deux tâches ne fait pas de trou', () => {
    const periodes = [{ date_debut: '2026-08-03', date_fin: '2026-08-21', est_bloquante: true }]
    const p = fusionnerPlages([
      { debut: new Date(2026, 6, 27), fin: new Date(2026, 6, 31) },
      { debut: new Date(2026, 7, 24), fin: new Date(2026, 7, 28) },
    ], periodes)
    assert.deepEqual(p.map(m => `${iso(m.debut)}→${iso(m.fin)}`), ['2026-07-27→2026-08-28'])
  })

  test('une période informative, elle, laisse le trou', () => {
    const periodes = [{ date_debut: '2026-08-03', date_fin: '2026-08-21', est_bloquante: false }]
    const p = fusionnerPlages([
      { debut: new Date(2026, 6, 27), fin: new Date(2026, 6, 31) },
      { debut: new Date(2026, 7, 24), fin: new Date(2026, 7, 28) },
    ], periodes)
    assert.equal(p.length, 2)
  })

  test('plages qui se chevauchent ou s’englobent, dans le désordre', () => {
    const p = fusionnerPlages([
      { debut: new Date(2026, 2, 10), fin: new Date(2026, 2, 12) },
      { debut: new Date(2026, 2, 2), fin: new Date(2026, 2, 20) },
      { debut: new Date(2026, 2, 5), fin: new Date(2026, 2, 6) },
    ])
    assert.deepEqual(p.map(m => `${iso(m.debut)}→${iso(m.fin)}`), ['2026-03-02→2026-03-20'])
  })
})

describe('résumé par lot', () => {
  const TACHES = [
    // Gros œuvre : mars, puis reprise en juin
    { id: 1, lot_id: 1, debut: '2026-03-02', duree: 10, avancement: 100 },
    { id: 2, lot_id: 1, debut: '2026-06-01', duree: 5, avancement: 40 },
    // Démolition : une tâche
    { id: 3, lot_id: 2, debut: '2026-02-16', duree: 5, avancement: 100 },
  ]

  test('une ligne par lot ayant des tâches, dans l’ordre des lots', () => {
    const lignes = resumePlanning({ tasks: TACHES, lots: LOTS })
    assert.deepEqual(lignes.map(l => l.nom), ['Démolition', 'Gros œuvre'])
    assert.equal(lignes[0].numero, '01')
    assert.equal(lignes[1].couleur, '#8B5E34')
    assert.equal(lignes[1].nbTaches, 2)
  })

  test('un lot qui revient a deux morceaux', () => {
    const go = resumePlanning({ tasks: TACHES, lots: LOTS }).find(l => l.nom === 'Gros œuvre')
    assert.deepEqual(morceaux(go), ['2026-03-02→2026-03-13', '2026-06-01→2026-06-05'])
  })

  test('avancement pondéré par la durée des tâches', () => {
    const go = resumePlanning({ tasks: TACHES, lots: LOTS }).find(l => l.nom === 'Gros œuvre')
    // (10 × 100 + 5 × 40) / 15 = 80
    assert.equal(go.avancement, 80)
  })

  test('les segments comptent dans les périodes d’activité de leur lot', () => {
    const segments = [{ id: 's1', tache_id: 3, date_debut: '2026-04-06', duree_jours: 3 }]
    const demol = resumePlanning({ tasks: TACHES, lots: LOTS, segments }).find(l => l.nom === 'Démolition')
    assert.deepEqual(morceaux(demol), ['2026-02-16→2026-02-20', '2026-04-06→2026-04-08'])
  })

  test('les tâches sans lot sont regroupées en fin, sous « Sans lot »', () => {
    const lignes = resumePlanning({ tasks: [...TACHES, { id: 9, debut: '2026-05-04', duree: 2 }], lots: LOTS })
    assert.equal(lignes.at(-1).nom, 'Sans lot')
    assert.equal(lignes.at(-1).numero, '')
  })

  test('une tâche d’un lot supprimé passe sous « Sans lot »', () => {
    const lignes = resumePlanning({ tasks: [{ id: 1, lot_id: 99, debut: '2026-03-02', duree: 2 }], lots: LOTS })
    assert.deepEqual(lignes.map(l => l.nom), ['Sans lot'])
  })

  test('une tâche sans date ne compte pas', () => {
    const lignes = resumePlanning({ tasks: [{ id: 1, lot_id: 3, duree: 5 }], lots: LOTS })
    assert.deepEqual(lignes, [])
  })
})

describe('résumé par zone', () => {
  const TACHES = [
    { id: 1, lot_id: 1, zone_id: 'a', debut: '2026-03-02', duree: 5, avancement: 50 },
    { id: 2, lot_id: 3, zone_id: 'b', debut: '2026-04-06', duree: 5, avancement: 0 },
    { id: 3, lot_id: 2, debut: '2026-02-16', duree: 3, avancement: 100 },
  ]

  test('« Sans zone » en premier, puis les zones dans leur ordre, à leur couleur', () => {
    const lignes = resumePlanning({ tasks: TACHES, lots: LOTS, zones: ZONES, groupMode: 'zone' })
    assert.deepEqual(lignes.map(l => l.nom), ['Sans zone', 'Bâtiment A', 'Bâtiment B'])
    assert.equal(lignes[1].couleur, '#3366AA')
  })

  test('un segment placé dans une autre zone compte pour cette zone', () => {
    const segments = [{ id: 's', tache_id: 1, zone_id: 'b', date_debut: '2026-05-04', duree_jours: 2 }]
    const lignes = resumePlanning({ tasks: TACHES, lots: LOTS, zones: ZONES, segments, groupMode: 'zone' })
    assert.deepEqual(morceaux(lignes.find(l => l.nom === 'Bâtiment B')), ['2026-04-06→2026-04-10', '2026-05-04→2026-05-05'])
    // et pas pour la zone de sa tâche
    assert.deepEqual(morceaux(lignes.find(l => l.nom === 'Bâtiment A')), ['2026-03-02→2026-03-06'])
  })

  test('un segment sans zone suit la zone de sa tâche', () => {
    const segments = [{ id: 's', tache_id: 1, date_debut: '2026-05-04', duree_jours: 2 }]
    const a = resumePlanning({ tasks: TACHES, lots: LOTS, zones: ZONES, segments, groupMode: 'zone' })
      .find(l => l.nom === 'Bâtiment A')
    assert.deepEqual(morceaux(a), ['2026-03-02→2026-03-06', '2026-05-04→2026-05-05'])
  })
})
