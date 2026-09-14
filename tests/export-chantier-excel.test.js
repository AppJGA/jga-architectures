// Export Excel du planning chantier : les cases colorées suivent les barres de
// l'écran (dernier jour inclus, fermetures comprises) et l'ordre des lots.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const XLSX = require_('xlsx-js-style')
let classeur = null
XLSX.writeFile = (wb, nom) => { classeur = { wb, nom } }

const { exporterPlanningChantierExcel } =
  await import('../src/modules/chantier/planning/exportPlanningChantierExcel.js')

const LOTS = [
  { id: 'l1', numero: 1, nom: 'Gros œuvre', couleur: '#E8602C' },
  { id: 'l2', numero: 2, nom: 'Charpente', couleur: '#1B3A5C' },
]

// Colonne (0-based) de la date dans la ligne des jours, et remplissage d'une case
function feuille() { return classeur.wb.Sheets.Planning }
function colonneDuJour(jour) {
  const ws = feuille()
  for (let c = 3; c < 400; c++) {
    const cell = ws[XLSX.utils.encode_cell({ c, r: 1 })]
    if (!cell) break
    if (cell.v === jour.getDate() && colonneMois(c) === jour.getMonth()) return c
  }
  return -1
}
// Mois d'une colonne, lu dans l'en-tête fusionné de la ligne 0
function colonneMois(c) {
  const ws = feuille()
  for (let k = c; k >= 3; k--) {
    const cell = ws[XLSX.utils.encode_cell({ c: k, r: 0 })]
    if (cell?.v) {
      const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
      return mois.findIndex((m) => cell.v.toLowerCase().startsWith(m))
    }
  }
  return -1
}
function remplissage(ligne, jour) {
  return feuille()[XLSX.utils.encode_cell({ c: colonneDuJour(jour), r: ligne })]?.s?.fill?.fgColor?.rgb
}
function ligneDe(libelle) {
  const ws = feuille()
  for (let r = 0; r < 100; r++) {
    if (String(ws[XLSX.utils.encode_cell({ c: 1, r })]?.v ?? '').includes(libelle)) return r
  }
  return -1
}

describe('export Excel chantier', () => {
  test('une tâche du lundi au vendredi ne colore pas le week-end', () => {
    exporterPlanningChantierExcel({
      tasks: [{ id: 1, num_tache: '01', nom: 'Semaine', debut: '2026-09-14', duree: 5, lot_id: 'l1' }],
      lots: LOTS, viewMode: 'day',
    })
    const r = ligneDe('Semaine')
    assert.equal(remplissage(r, new Date(2026, 8, 18)), 'E8602C')
    assert.notEqual(remplissage(r, new Date(2026, 8, 19)), 'E8602C')
    assert.notEqual(remplissage(r, new Date(2026, 8, 20)), 'E8602C')
  })

  test('une fermeture traversée allonge la barre, celle qui suit n’est pas colorée', () => {
    const periodes = [{ id: 'p', date_debut: '2026-08-03', date_fin: '2026-08-21', couleur: '#B8412C' }]
    exporterPlanningChantierExcel({
      tasks: [
        // 27/07 → 31/07, fermeture, 24/08 → 28/08 : 10 jours ouvrés
        { id: 1, num_tache: '01', nom: 'Traverse', debut: '2026-07-27', duree: 10, lot_id: 'l1' },
        // finit le vendredi 31/07, juste avant la fermeture
        { id: 2, num_tache: '02', nom: 'Avant', debut: '2026-07-27', duree: 5, lot_id: 'l1' },
      ],
      lots: LOTS, viewMode: 'day', periodes,
    })
    assert.equal(remplissage(ligneDe('Traverse'), new Date(2026, 7, 28)), 'E8602C')
    assert.notEqual(remplissage(ligneDe('Traverse'), new Date(2026, 7, 31)), 'E8602C')
    assert.equal(remplissage(ligneDe('Avant'), new Date(2026, 6, 31)), 'E8602C')
    assert.notEqual(remplissage(ligneDe('Avant'), new Date(2026, 7, 1)), 'E8602C')
    assert.notEqual(remplissage(ligneDe('Avant'), new Date(2026, 7, 10)), 'E8602C')
  })

  test('les lots sortent dans l’ordre de l’écran, « Sans lot » en dernier', () => {
    exporterPlanningChantierExcel({
      tasks: [
        { id: 1, num_tache: '01', nom: 'Libre', debut: '2026-09-14', duree: 2, lot_id: null },
        { id: 2, num_tache: '01', nom: 'Charpente A', debut: '2026-09-14', duree: 2, lot_id: 'l2' },
        { id: 3, num_tache: '01', nom: 'Maçonnerie', debut: '2026-09-14', duree: 2, lot_id: 'l1' },
      ],
      lots: LOTS, viewMode: 'day',
    })
    assert.ok(ligneDe('Gros œuvre') < ligneDe('Charpente –') || ligneDe('Gros œuvre') < ligneDe('Charpente A'))
    assert.ok(ligneDe('Maçonnerie') < ligneDe('Charpente A'))
    assert.ok(ligneDe('Charpente A') < ligneDe('Libre'))
  })

  test('la période choisie dans la modale borne les colonnes', () => {
    exporterPlanningChantierExcel({
      tasks: [{ id: 1, num_tache: '01', nom: 'Longue', debut: '2026-09-01', duree: 40, lot_id: 'l1' }],
      lots: LOTS, viewMode: 'day', dateDebut: '2026-09-14', dateFin: '2026-09-20',
    })
    const ws = feuille()
    const jours = []
    for (let c = 3; ws[XLSX.utils.encode_cell({ c, r: 1 })]; c++) jours.push(ws[XLSX.utils.encode_cell({ c, r: 1 })].v)
    assert.deepEqual(jours, [14, 15, 16, 17, 18, 19, 20])
  })
})
