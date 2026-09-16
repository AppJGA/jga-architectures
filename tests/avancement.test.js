// Avancement par lot : pondération par les durées, prévu à la date de visite,
// instantané d'un CR émis.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  partPrevue, avancementParLot, avancementGlobal, infosEcart,
  instantaneAvancement, lignesAvancement,
} from '../src/modules/chantier/comptes-rendus/avancementLogique.js'
import { blocAvancement, definitionPdf, REGLAGES_DEFAUT } from '../src/modules/chantier/comptes-rendus/rapportLogique.js'

const texteDe = (noeud) => JSON.stringify(noeud)

const lots = [
  { id: 'l1', nom: 'Lot 01 — Gros œuvre', couleur: '#E8602C' },
  { id: 'l2', nom: 'Lot 02 — Charpente', couleur: '#1B3A5C' },
]

describe('part prévue d’une tâche', () => {
  // Lundi 2026-09-07, 10 jours ouvrés → dernier jour vendredi 2026-09-18
  const tache = { debut: '2026-09-07', duree: 10 }

  test('avant le début : rien de prévu', () => {
    assert.equal(partPrevue(tache, '2026-09-01'), 0)
  })

  test('le jour du début compte pour un jour', () => {
    assert.equal(partPrevue(tache, '2026-09-07'), 0.1)
  })

  test('à mi-parcours, un vendredi', () => {
    assert.equal(partPrevue(tache, '2026-09-11'), 0.5)
  })

  test('le week-end ne fait pas avancer le planning', () => {
    assert.equal(partPrevue(tache, '2026-09-13'), partPrevue(tache, '2026-09-11'))
  })

  test('après la fin : tout était prévu fait', () => {
    assert.equal(partPrevue(tache, '2026-09-30'), 1)
  })

  test('une fermeture bloquante décale la fin', () => {
    const periodes = [{ date_debut: '2026-09-14', date_fin: '2026-09-18', est_bloquante: true }]
    assert.equal(partPrevue(tache, '2026-09-18', periodes), 0.5)
  })

  test('sans date de début, rien de prévu', () => {
    assert.equal(partPrevue({ duree: 5 }, '2026-09-11'), 0)
  })
})

describe('avancement par lot', () => {
  const taches = [
    // Lot 1 : une tâche longue à 100 %, une courte à 0 %
    { id: 1, lot_id: 'l1', debut: '2026-09-07', duree: 20, avancement: 100 },
    { id: 2, lot_id: 'l1', debut: '2026-09-07', duree: 5, avancement: 0 },
    // Lot 2 : pas commencé
    { id: 3, lot_id: 'l2', debut: '2026-10-05', duree: 10, avancement: 0 },
  ]

  test('le réalisé est pondéré par la durée, pas une moyenne simple', () => {
    const [lot1] = avancementParLot(taches, lots, { date: '2026-09-18' })
    assert.equal(lot1.realise, 80) // 20 j à 100 % + 5 j à 0 % = 80 %, et non 50 %
  })

  test('le prévu est celui du planning à la date de la visite', () => {
    const [lot1] = avancementParLot(taches, lots, { date: '2026-09-11' })
    // 20 j : 5/20 écoulés ; 5 j : 5/5 écoulés → (20×25 + 5×100) / 25 = 40 %
    assert.equal(lot1.prevu, 40)
    assert.equal(lot1.ecart, lot1.realise - lot1.prevu)
  })

  test('un lot non commencé n’a ni réalisé ni prévu', () => {
    const lot2 = avancementParLot(taches, lots, { date: '2026-09-11' })[1]
    assert.equal(lot2.realise, 0)
    assert.equal(lot2.prevu, 0)
    assert.equal(lot2.nom, 'Lot 02 — Charpente')
  })

  test('les lots sans tâche ne sont pas listés', () => {
    const lignes = avancementParLot([taches[0]], lots, { date: '2026-09-11' })
    assert.deepEqual(lignes.map(l => l.lot_id), ['l1'])
  })

  test('les tâches sans lot finissent en « Hors lot »', () => {
    const lignes = avancementParLot([...taches, { id: 4, debut: '2026-09-07', duree: 5, avancement: 50 }], lots, { date: '2026-09-11' })
    const derniere = lignes[lignes.length - 1]
    assert.equal(derniere.lot_id, null)
    assert.equal(derniere.nom, 'Hors lot')
    assert.equal(derniere.realise, 50)
  })

  test('un lot disparu du carnet garde quand même ses tâches', () => {
    const lignes = avancementParLot([{ id: 9, lot_id: 'supprime', debut: '2026-09-07', duree: 4, avancement: 25 }], lots, { date: '2026-09-11' })
    assert.equal(lignes.length, 1)
    assert.equal(lignes[0].nom, 'Hors lot')
    assert.equal(lignes[0].realise, 25)
  })

  test('une durée absente vaut un jour, sans division par zéro', () => {
    const lignes = avancementParLot([{ id: 5, lot_id: 'l1', debut: '2026-09-07', avancement: 40 }], lots, { date: '2026-09-11' })
    assert.equal(lignes[0].realise, 40)
    assert.equal(lignes[0].jours, 1)
  })

  test('sans tâche, aucune ligne', () => {
    assert.deepEqual(avancementParLot([], lots, { date: '2026-09-11' }), [])
  })
})

describe('avancement de l’opération', () => {
  test('les lots pèsent leur durée', () => {
    const lignes = [
      { realise: 100, prevu: 100, jours: 30 },
      { realise: 0, prevu: 50, jours: 10 },
    ]
    const total = avancementGlobal(lignes)
    assert.equal(total.realise, 75)
    assert.equal(total.prevu, 88)
    assert.equal(total.ecart, -13)
  })

  test('sans lot, tout est à zéro', () => {
    assert.deepEqual(avancementGlobal([]), { realise: 0, prevu: 0, ecart: 0, jours: 0 })
  })
})

describe('lecture de l’écart', () => {
  test('un petit écart reste conforme', () => {
    assert.equal(infosEcart(4).etat, 'conforme')
    assert.equal(infosEcart(-4).etat, 'conforme')
  })

  test('au-delà du seuil, retard ou avance', () => {
    assert.equal(infosEcart(-12).etat, 'retard')
    assert.match(infosEcart(-12).libelle, /12 pts de retard/)
    assert.equal(infosEcart(9).etat, 'avance')
  })
})

describe('instantané d’un CR émis', () => {
  const lignes = [{ lot_id: 'l1', nom: 'Lot 01', couleur: '#E8602C', realise: 80, prevu: 60, ecart: 20, taches: 2, jours: 25 }]

  test('l’instantané garde les chiffres du jour', () => {
    const gele = instantaneAvancement(lignes)
    assert.deepEqual(gele, [{ lot_id: 'l1', nom: 'Lot 01', couleur: '#E8602C', realise: 80, prevu: 60, taches: 2, jours: 25 }])
  })

  test('un CR émis montre ses chiffres gelés, pas le planning d’aujourd’hui', () => {
    const cr = { statut: 'emis', avancement_lots: instantaneAvancement(lignes) }
    const vivantes = [{ lot_id: 'l1', nom: 'Lot 01', realise: 100, prevu: 100, ecart: 0, taches: 2, jours: 25 }]
    const affichees = lignesAvancement(cr, vivantes)
    assert.equal(affichees[0].realise, 80)
    assert.equal(affichees[0].ecart, 20)
    assert.equal(affichees[0].gele, true)
  })

  test('un brouillon suit le planning', () => {
    const vivantes = [{ lot_id: 'l1', realise: 100, prevu: 100, ecart: 0, taches: 2, jours: 25 }]
    assert.equal(lignesAvancement({ statut: 'brouillon' }, vivantes)[0].realise, 100)
  })

  test('un CR émis avant la migration 049 suit le planning plutôt que rien', () => {
    const vivantes = [{ lot_id: 'l1', realise: 100, prevu: 100, ecart: 0, taches: 2, jours: 25 }]
    assert.equal(lignesAvancement({ statut: 'emis' }, vivantes)[0].realise, 100)
  })
})

describe('tableau d’avancement du PDF', () => {
  const lignes = [
    { lot_id: 'l1', nom: 'Lot 01 — Gros œuvre', realise: 80, prevu: 60, jours: 30 },
    { lot_id: 'l2', nom: 'Lot 02 — Charpente', realise: 0, prevu: 20, jours: 10 },
  ]

  test('sans lot, pas de tableau', () => {
    assert.deepEqual(blocAvancement([]), [])
  })

  test('une ligne par lot, plus le total de l’opération', () => {
    const [, tableau] = blocAvancement(lignes)
    assert.equal(tableau.table.body.length, 4) // en-tête + 2 lots + opération
    assert.match(texteDe(tableau.table.body[1]), /Lot 01/)
    assert.match(texteDe(tableau.table.body[3]), /Opération/)
  })

  test('le total est pondéré par les durées', () => {
    const [, tableau] = blocAvancement(lignes)
    assert.match(texteDe(tableau.table.body[3]), /60 %/) // (80×30 + 0×10) / 40
  })

  test('l’écart porte son signe', () => {
    const [, tableau] = blocAvancement(lignes)
    assert.match(texteDe(tableau.table.body[1]), /\+20 pts/)
    assert.match(texteDe(tableau.table.body[2]), /-20 pts/)
  })

  test('un lot dans les clous n’affiche pas d’écart', () => {
    const [, tableau] = blocAvancement([{ nom: 'Lot 01', realise: 50, prevu: 50, jours: 10 }])
    assert.match(texteDe(tableau.table.body[1]), /—/)
  })

  test('le réglage « sans » retire le tableau du PDF', () => {
    const cr = { numero: 5, date_reunion: '2026-09-16', statut: 'brouillon' }
    const args = { cr, affaire: { nom: 'Affaire' }, sections: [], presences: [], lots: [], interlocuteurs: [], avancement: lignes }
    const avec = definitionPdf({ ...args, reglages: REGLAGES_DEFAUT })
    const sans = definitionPdf({ ...args, reglages: { ...REGLAGES_DEFAUT, avancement: 'non' } })
    assert.match(texteDe(avec.content), /AVANCEMENT DES LOTS/)
    assert.doesNotMatch(texteDe(sans.content), /AVANCEMENT DES LOTS/)
  })
})
