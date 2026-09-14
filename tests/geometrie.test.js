// Fin des barres du planning chantier.
//
// La modale exprime la durée en jours ouvrés ; chaque vue (jour, semaine, mois)
// doit arrêter la barre sur la date de fin que la modale affiche.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  barreSemaine, barreMois, xAtDateMonth, redimensionnerBarre,
} from '../src/modules/chantier/planning/geometrie.js'
import {
  formatDateISO, parseDate, dernierJourTache, dureeEntre,
} from '../src/modules/chantier/planning/types.js'

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

// ── Étirement d'une barre ────────────────────────────────────────────────────
//
// Le geste donne un déplacement en pixels ; la durée enregistrée est en jours
// ouvrés. Ajouter l'un à l'autre faisait tomber la fin sur un jour quelconque.

describe('redimensionnerBarre', () => {
  const dateRef = parseDate('2026-03-02') // lundi
  const W_SEMAINE = 40
  const dernier = (r) => formatDateISO(dernierJourTache(r.debut, r.duree))

  describe('vue semaine', () => {
    const geo = { viewMode: 'week', dateRef, weekWidth: W_SEMAINE }

    test('étirer d’une semaine va jusqu’au vendredi de la semaine visée', () => {
      // lun 2 → mer 4 ; la poignée passe sur la semaine suivante
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 3, dx: 40, geo })
      assert.equal(dernier(r), '2026-03-13')
      assert.equal(r.duree, 10)
    })

    test('un petit geste cale la fin sur le vendredi de sa propre semaine', () => {
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 3, dx: 10, geo })
      assert.equal(dernier(r), '2026-03-06')
    })

    test('rétrécir en deçà du début garde la semaine du début', () => {
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-11', duree: 3, dx: -200, geo })
      assert.equal(formatDateISO(r.debut), '2026-03-11')
      assert.equal(dernier(r), '2026-03-13')
    })

    test('étirer par la gauche part du lundi et garde la fin', () => {
      // mer 11 → ven 13, poignée gauche reculée d'une semaine
      const r = redimensionnerBarre({ cote: 'left', debut: '2026-03-11', duree: 3, dx: -40, geo })
      assert.equal(formatDateISO(r.debut), '2026-03-02')
      assert.equal(dernier(r), '2026-03-13')
    })

    test('une fermeture dans la semaine visée ne décale pas le vendredi', () => {
      const conges = [{ date_debut: '2026-03-09', date_fin: '2026-03-10' }]
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 3, dx: 40, geo, periodes: conges })
      assert.equal(formatDateISO(dernierJourTache(r.debut, r.duree, conges)), '2026-03-13')
      assert.equal(r.duree, 8)
    })
  })

  describe('vue jour', () => {
    // Colonnes de 40 px, week-ends réduits à 14 px
    const dayPositions = [0]
    for (let i = 0; i < 60; i++) {
      const d = new Date(2026, 2, 2 + i)
      const we = d.getDay() === 0 || d.getDay() === 6
      dayPositions.push(dayPositions[i] + (we ? 14 : 40))
    }
    const geo = { viewMode: 'day', dateRef, dayPositions, dayWidth: 40 }

    test('la fin suit la colonne sous la poignée, week-end compris', () => {
      // lun 2 → ven 6 (bord droit à 200 px) ; +68 px = sam, dim, lun 9
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 5, dx: 68, geo })
      assert.equal(dernier(r), '2026-03-09')
    })

    test('lâcher sur un week-end arrête la barre au vendredi', () => {
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 5, dx: 20, geo })
      assert.equal(dernier(r), '2026-03-06')
    })

    test('la poignée gauche garde la fin, même en traversant un week-end', () => {
      // mar 10 → ven 13, poignée gauche reculée sur le ven 6
      const r = redimensionnerBarre({ cote: 'left', debut: '2026-03-10', duree: 4, dx: -108, geo })
      assert.equal(formatDateISO(r.debut), '2026-03-06')
      assert.equal(dernier(r), '2026-03-13')
    })
  })

  describe('vue mois', () => {
    const geo = { viewMode: 'month', dateRef, months: MOIS(2026, 2, 12), monthWidth: 80 }

    test('la fin suit le curseur au jour près', () => {
      // lun 2 → ven 6, poignée avancée d'environ un mois : dim 5 avril → ven 3
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 5, dx: 80, geo })
      assert.equal(dernier(r), '2026-04-03')
    })

    test('la durée minimale de la vue est respectée', () => {
      const r = redimensionnerBarre({ cote: 'right', debut: '2026-03-02', duree: 10, dx: -300, geo, minDuree: 5 })
      assert.equal(r.duree, 5)
    })
  })
})
