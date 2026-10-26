// Aperçu des PDF de planning dans la fenêtre d'export : sauts de page estimés
// et page d'aperçu (la même que le PDF, sans impression).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

globalThis.window = { location: { origin: 'http://localhost' } }

const { sautsDePage, libellePages, PX_PAR_MM } =
  await import('../src/shared/planning/export/apercuPlanningLogique.js')
const { htmlApercuChantier } =
  await import('../src/modules/chantier/planning/generatePlanningChantierPdf.js')
const { htmlApercuEtude } =
  await import('../src/modules/etude/planning/generatePlanningEtudePdf.js')

describe('sauts de page', () => {
  // A4 paysage : 210 mm de haut, 190 mm utiles entre les marges de 10 mm
  const page = (mm) => mm * PX_PAR_MM

  test('un document qui tient dans la feuille n’a aucun saut', () => {
    assert.deepEqual(sautsDePage(page(210), 210), [])
    assert.deepEqual(sautsDePage(page(120), 210), [])
  })

  test('un saut à chaque hauteur utile, compté depuis la marge du haut', () => {
    const sauts = sautsDePage(page(20 + 190 * 2.5), 210)
    assert.equal(sauts.length, 2)
    assert.ok(Math.abs(sauts[0] - page(10 + 190)) < 0.01)
    assert.ok(Math.abs(sauts[1] - page(10 + 380)) < 0.01)
  })

  test('valeurs absurdes : aucun saut', () => {
    assert.deepEqual(sautsDePage(0, 210), [])
    assert.deepEqual(sautsDePage(page(500), 15), [])
  })

  test('libellé', () => {
    assert.equal(libellePages(1), 'tient sur une page')
    assert.equal(libellePages(3), 'environ 3 pages')
  })
})

describe('page d’aperçu', () => {
  const chantier = () => htmlApercuChantier({
    tasks: [], lots: [], jalons: [], affaire: { nom: 'Essai' },
    dateDebut: '2026-03-02', dateFin: '2026-03-20', largeurMm: 420, hauteurMm: 297,
  })
  const etude = () => htmlApercuEtude({
    phases: [], jalons: [], affaire: { nom: 'Essai' },
    semaineDebut: 8, anneeDebut: 2026, semaineFin: 12, anneeFin: 2026,
    largeurMm: 420, hauteurMm: 297,
  })

  test('n’ouvre pas l’impression et envoie sa hauteur à la fenêtre', () => {
    for (const html of [chantier(), etude()]) {
      assert.ok(!html.includes('window.print'))
      assert.ok(html.includes('parent.postMessage({ apercuPlanning: true'))
    }
  })

  test('pose la marge de la feuille, qui n’existe qu’à l’impression', () => {
    for (const html of [chantier(), etude()]) assert.match(html, /body \{ margin: 10mm; \}/)
  })
})
