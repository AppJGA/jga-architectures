// Fin des barres du planning chantier.
//
// La modale exprime la durée en jours ouvrés ; chaque vue (jour, semaine, mois)
// doit arrêter la barre sur la date de fin que la modale affiche.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  dernierJourTache,
  dureeEntre,
  barreSemaine,
  barreMois,
  xAtDateMonth,
} from '../src/modules/chantier/planning/geometrie.js'
import { formatDateISO, parseDate } from '../src/modules/chantier/planning/types.js'

const MOIS = (debutAnnee, debutMois, nb) => Array.from({ length: nb }, (_, i) => {
  const d = new Date(debutAnnee, debutMois + i, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
})

const NOEL = { date_debut: '2026-12-21', date_fin: '2027-01-01', est_bloquante: true }
const INFO = { date_debut: '2026-12-21', date_fin: '2027-01-01', est_bloquante: false }

describe('dernierJourTache / dureeEntre', () => {
  test('la durée saisie par date de fin redonne cette date', () => {
    const duree = dureeEntre('2026-10-01', '2027-01-15')
    assert.equal(formatDateISO(dernierJourTache('2026-10-01', duree)), '2027-01-15')
  })

  test('une fermeture bloquante repousse la fin, et la saisie par date reste exacte', () => {
    const duree = dureeEntre('2026-10-01', '2027-01-15', [NOEL])
    assert.equal(duree, dureeEntre('2026-10-01', '2027-01-15') - 10)
    assert.equal(formatDateISO(dernierJourTache('2026-10-01', duree, [NOEL])), '2027-01-15')
  })

  test('une période informative ne décale rien', () => {
    assert.equal(dureeEntre('2026-10-01', '2027-01-15', [INFO]), dureeEntre('2026-10-01', '2027-01-15'))
  })
})

describe('vue mois', () => {
  const months = MOIS(2026, 8, 12) // septembre 2026 → août 2027
  const W = 80

  test('la barre se termine à la fin du jour saisi (15 janvier), pas à mi-décembre', () => {
    const debut = parseDate('2026-10-01')
    const duree = dureeEntre(debut, '2027-01-15')
    const { left, width } = barreMois(debut, duree, months, W)
    assert.equal(left, xAtDateMonth(debut, months, W))
    assert.equal(left + width, xAtDateMonth(parseDate('2027-01-16'), months, W))
  })

  test('le 1er du mois tombe sur le trait de début de mois', () => {
    assert.equal(xAtDateMonth(parseDate('2026-10-01'), months, W), W)
  })
})

describe('vue semaine', () => {
  const dateRef = parseDate('2026-09-28') // lundi
  const W = 40

  test('la barre couvre la semaine du 15 janvier, et pas au-delà', () => {
    const debut = parseDate('2026-10-01')
    const duree = dureeEntre(debut, '2027-01-15')
    const { left, width } = barreSemaine(debut, duree, dateRef, W)
    const semaineDu15 = Math.floor((parseDate('2027-01-15') - dateRef) / (7 * 86400000))
    assert.equal(left, 0)
    assert.equal(left + width, (semaineDu15 + 1) * W)
  })

  test('une fermeture bloquante allonge la barre comme en vue jour', () => {
    const debut = parseDate('2026-12-14')
    const sans = barreSemaine(debut, 10, dateRef, W)
    const avec = barreSemaine(debut, 10, dateRef, W, [NOEL])
    assert.equal(avec.width - sans.width, 2 * W)
  })
})
