// Import d'un planning depuis une autre affaire — la préparation, côté
// chantier (jours ouvrés, lots et zones) et côté étude (semaines ISO).
// L'écriture en base n'est pas couverte ici : ces fonctions sont pures.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { preparerImport, cleNom, resumerSource } from '../src/modules/chantier/planning/importPlanning.js'
import {
  preparerImportEtude, debutEtude, dateDeSemaine, semaineDeDate, resumerSourceEtude,
} from '../src/modules/etude/planning/importPlanningEtude.js'

// ─── Chantier ─────────────────────────────────────────────────────────────────

// 2026-01-05 est un lundi ; 2026-01-12 le lundi suivant (5 jours ouvrés après).
const SOURCE = {
  taches: [
    { id: 1, num_tache: '1', nom: 'Gros œuvre', debut: '2026-01-05', duree: 10, avancement: 80, ordre: 1, lot_id: 'L1', zone_id: 'Z1', depends_on: null, lag_days: 1 },
    { id: 2, num_tache: '2', nom: 'Charpente', debut: '2026-01-19', duree: 5, avancement: 40, ordre: 2, lot_id: 'L2', zone_id: 'Z1', depends_on: 1, lag_days: 0 },
    { id: 3, num_tache: '3', nom: 'Couverture', debut: '2026-01-26', duree: 5, avancement: 0, ordre: 3, lot_id: null, zone_id: null, depends_on: 99, lag_days: 2 },
  ],
  segments: [
    { id: 'S1', tache_id: 2, date_debut: '2026-01-19', duree_jours: 3, zone_id: 'Z1', ordre: 0, nom: 'Pose', afficher_nom: true },
    { id: 'S9', tache_id: 77, date_debut: '2026-02-02', duree_jours: 2, zone_id: null, ordre: 0 },
  ],
  dependances: [
    { id: 'D1', source_tache_id: 1, source_segment_id: null, cible_tache_id: null, cible_segment_id: 'S1', lag_jours: 2 },
    { id: 'D2', source_tache_id: 1, source_segment_id: null, cible_tache_id: null, cible_segment_id: 'S9', lag_jours: 0 },
  ],
  jalons: [{ id: 10, label: 'Hors d’eau', date: '2026-02-02', couleur: '#E8602C', ordre: 1 }],
  zones: [
    { id: 'Z1', nom: 'Bâtiment A', couleur: '#111111', ordre: 1 },
    { id: 'Z2', nom: 'Bâtiment B', couleur: '#222222', ordre: 2 },
  ],
  lots: [
    { id: 'L1', numero: 1, nom: 'Gros œuvre', couleur: '#aaa', ordre: 1 },
    { id: 'L2', numero: 2, nom: 'Charpente', couleur: '#bbb', ordre: 2 },
  ],
}

const preparer = (opts = {}) => preparerImport({ source: SOURCE, ...opts })

describe('preparerImport — dates', () => {
  test('sans nouvelle date, les dates sont inchangées', () => {
    const p = preparer()
    assert.equal(p.ecart, 0)
    assert.equal(p.taches[0].ligne.debut, '2026-01-05')
    assert.equal(p.jalons[0].ligne.date, '2026-02-02')
  })

  test('le décalage se compte en jours ouvrés et s’applique à tout', () => {
    const p = preparer({ nouveauDebut: '2026-01-12' })
    assert.equal(p.ancienDebut, '2026-01-05')
    assert.equal(p.ecart, 5, 'un lundi au lundi suivant = 5 jours ouvrés')
    assert.equal(p.taches[0].ligne.debut, '2026-01-12')
    assert.equal(p.taches[1].ligne.debut, '2026-01-26')
    assert.equal(p.segments[0].ligne.date_debut, '2026-01-26')
    assert.equal(p.jalons[0].ligne.date, '2026-02-09')
  })

  test('les fermetures de l’affaire d’accueil sont enjambées', () => {
    const periodes = [{ date_debut: '2026-01-12', date_fin: '2026-01-16', est_bloquante: true }]
    const p = preparer({ nouveauDebut: '2026-01-19', periodes })
    assert.equal(p.taches[0].ligne.debut, '2026-01-19')
    // La durée ne change pas : c'est le début qui bouge
    assert.equal(p.taches[0].ligne.duree, 10)
  })

  test('un décalage vers l’arrière fonctionne', () => {
    const p = preparer({ nouveauDebut: '2025-12-29' })
    assert.equal(p.ecart, -5)
    assert.equal(p.taches[0].ligne.debut, '2025-12-29')
  })

  test('une source sans tâche ne donne pas de plan', () => {
    assert.equal(preparerImport({ source: { taches: [] } }), null)
  })
})

describe('preparerImport — ce qui est repris', () => {
  test('l’avancement repart à zéro', () => {
    const p = preparer()
    assert.deepEqual(p.taches.map(t => t.ligne.avancement), [0, 0, 0])
  })

  test('les libellés et délais suivent', () => {
    const [t] = preparer().taches
    assert.equal(t.ligne.nom, 'Gros œuvre')
    assert.equal(t.ligne.num_tache, '1')
    assert.equal(t.ligne.duree, 10)
  })

  test('les colonnes calculées ne sont pas recopiées', () => {
    const [t] = preparer().taches
    for (const interdit of ['id', 'affaire_id', 'created_at', 'updated_at', 'lot_id', 'zone_id', 'depends_on']) {
      assert.equal(t.ligne[interdit], undefined, `${interdit} ne doit pas être dans la ligne`)
    }
  })

  test('le segment garde son nom et son affichage', () => {
    const [s] = preparer().segments
    assert.equal(s.ligne.nom, 'Pose')
    assert.equal(s.ligne.afficher_nom, true)
    assert.equal(s.ligne.duree_jours, 3)
  })
})

describe('preparerImport — ordre à la suite de l’existant', () => {
  test('les tâches se rangent après celles déjà présentes', () => {
    const p = preparer({ existant: { taches: [{ ordre: 7 }, { ordre: 12 }] } })
    assert.deepEqual(p.taches.map(t => t.ligne.ordre), [13, 14, 15])
  })

  test('sur un planning vide, l’ordre part de 1', () => {
    assert.deepEqual(preparer().taches.map(t => t.ligne.ordre), [1, 2, 3])
  })

  test('l’ordre d’origine est respecté', () => {
    const melange = { ...SOURCE, taches: [SOURCE.taches[2], SOURCE.taches[0], SOURCE.taches[1]] }
    const p = preparerImport({ source: melange })
    assert.deepEqual(p.taches.map(t => t.ligne.nom), ['Gros œuvre', 'Charpente', 'Couverture'])
  })
})

describe('preparerImport — lots et zones', () => {
  test('un lot de même nom est réutilisé, pas recréé', () => {
    const p = preparer({ existant: { lots: [{ id: 'X', numero: 4, nom: 'gros oeuvre', ordre: 4 }] } })
    const gros = p.lots.find(l => l.origine === 'L1')
    assert.equal(gros.existante, 'X', 'rapproché malgré l’accent et la casse')
    assert.equal(gros.ligne, null, 'rien à créer')
    assert.equal(p.resume.lotsCrees, 1, 'seule Charpente est créée')
  })

  test('un lot créé prend le premier numéro libre, jamais celui d’origine', () => {
    const p = preparer({ existant: { lots: [{ id: 'X', numero: 1, nom: 'Démolition' }, { id: 'Y', numero: 2, nom: 'VRD' }] } })
    const numeros = p.lots.filter(l => l.ligne).map(l => l.ligne.numero)
    assert.deepEqual(numeros, [3, 4], 'unique(affaire_id, numero) refuserait 1 et 2')
  })

  test('les zones inutilisées par le planning ne sont pas créées', () => {
    const p = preparer()
    assert.deepEqual(p.zones.map(z => z.origine), ['Z1'], 'Bâtiment B n’est porté par aucune tâche')
    assert.equal(p.resume.zonesCreees, 1)
  })

  test('une zone de même nom est réutilisée', () => {
    const p = preparer({ existant: { zones: [{ id: 'ZA', nom: 'BÂTIMENT A', ordre: 3 }] } })
    assert.equal(p.zones[0].existante, 'ZA')
    assert.equal(p.resume.zonesCreees, 0)
  })

  test('les tâches désignent leur lot et leur zone par l’identifiant d’origine', () => {
    const [t] = preparer().taches
    assert.equal(t.lotOrigine, 'L1')
    assert.equal(t.zoneOrigine, 'Z1')
  })
})

describe('preparerImport — remapping des liens', () => {
  test('une liaison interne est gardée avec son écart', () => {
    const t = preparer().taches.find(x => x.origine === 2)
    assert.equal(t.dependOrigine, 1)
    assert.equal(t.lag_days, 0)
  })

  test('une liaison vers une tâche absente de l’import est coupée', () => {
    const t = preparer().taches.find(x => x.origine === 3)
    assert.equal(t.dependOrigine, null, 'la tâche 99 n’existe pas')
    assert.equal(t.lag_days, null)
  })

  test('un segment orphelin est écarté', () => {
    const p = preparer()
    assert.deepEqual(p.segments.map(s => s.origine), ['S1'], 'S9 pointe vers la tâche 77')
  })

  test('une dépendance dont une extrémité manque est écartée', () => {
    const p = preparer()
    assert.equal(p.dependances.length, 1)
    assert.equal(p.dependances[0].cibleSegmentOrigine, 'S1')
    assert.equal(p.dependances[0].sourceTacheOrigine, 1)
    assert.equal(p.dependances[0].sourceSegmentOrigine, null)
  })

  test('le résumé compte ce qui sera écrit', () => {
    const { resume } = preparer()
    assert.deepEqual(resume, {
      taches: 3, segments: 1, dependances: 1, jalons: 1,
      zonesCreees: 1, lotsCrees: 2, liaisons: 1,
    })
  })
})

describe('cleNom', () => {
  test('ignore accents, casse et espaces multiples', () => {
    assert.equal(cleNom('  Gros   Œuvre '), cleNom('gros   œuvre'))
    assert.equal(cleNom('Éléctricité'), 'electricite')
  })

  test('défait les ligatures, que NFD laisse intactes', () => {
    assert.equal(cleNom('Gros œuvre'), 'gros oeuvre')
    assert.equal(cleNom('Gros Œuvre'), cleNom('gros oeuvre'))
    assert.equal(cleNom('Tænia'), 'taenia')
  })

  test('un nom absent ne fait pas tomber le rapprochement', () => {
    assert.equal(cleNom(null), '')
  })
})

describe('resumerSource', () => {
  test('compte ce que l’affaire d’origine propose', () => {
    assert.deepEqual(resumerSource(SOURCE), { taches: 3, jalons: 1, zones: 2 })
  })

  test('une affaire sans planning se résume à zéro', () => {
    assert.deepEqual(resumerSource({}), { taches: 0, jalons: 0, zones: 0 })
  })
})

// ─── Étude ────────────────────────────────────────────────────────────────────

const SOURCE_ETUDE = {
  phases: [
    { id: 1, nom: 'Esquisse', type_tache: 'etude', semaine_debut: 3, annee_debut: 2026, duree_semaines: 4, importance: 'moe', ordre: 1, depends_on: null, lag_semaines: 0, duree_arch: 2 },
    { id: 2, nom: 'APS', type_tache: 'etude', semaine_debut: 7, annee_debut: 2026, duree_semaines: 6, importance: 'moe', ordre: 2, depends_on: 1, lag_semaines: 0 },
    { id: 3, nom: 'Validation MOA', type_tache: 'validation', semaine_debut: 13, annee_debut: 2026, duree_semaines: 2, importance: 'moa', ordre: 3, depends_on: 42, lag_semaines: 1 },
  ],
  segments: [
    { id: 'E1', phase_id: 2, nom: 'Plans', semaine_debut: 7, annee_debut: 2026, duree_semaines: 3, ordre: 0 },
    { id: 'E9', phase_id: 88, semaine_debut: 9, annee_debut: 2026, duree_semaines: 1, ordre: 0 },
  ],
  jalons: [{ id: 5, label: 'Dépôt PC', semaine: 20, annee: 2026, couleur: '#8B5CF6', ordre: 1 }],
}

const preparerEtude = (opts = {}) => preparerImportEtude({ source: SOURCE_ETUDE, ...opts })

describe('debutEtude', () => {
  test('donne la première semaine du planning', () => {
    assert.deepEqual(debutEtude(SOURCE_ETUDE), { semaine: 3, annee: 2026 })
  })

  test('une année antérieure passe devant une semaine plus petite', () => {
    const s = { phases: [{ semaine_debut: 40, annee_debut: 2025 }, { semaine_debut: 2, annee_debut: 2026 }] }
    assert.deepEqual(debutEtude(s), { semaine: 40, annee: 2025 })
  })

  test('sans phase, rien', () => {
    assert.equal(debutEtude({ phases: [] }), null)
  })
})

describe('conversions semaine ↔ date', () => {
  test('une semaine donne son lundi', () => {
    // La semaine ISO 1 de 2026 commence le lundi 29 décembre 2025.
    assert.equal(dateDeSemaine({ semaine: 1, annee: 2026 }), '2025-12-29')
    assert.equal(dateDeSemaine({ semaine: 10, annee: 2026 }), '2026-03-02')
  })

  test('n’importe quel jour vaut sa semaine', () => {
    assert.deepEqual(semaineDeDate('2026-03-02'), { semaine: 10, annee: 2026 })
    assert.deepEqual(semaineDeDate('2026-03-06'), { semaine: 10, annee: 2026 }, 'le vendredi aussi')
  })

  test('l’aller-retour est stable', () => {
    for (const s of [1, 14, 33, 52]) {
      assert.deepEqual(semaineDeDate(dateDeSemaine({ semaine: s, annee: 2026 })), { semaine: s, annee: 2026 })
    }
  })

  test('sans semaine, rien', () => {
    assert.equal(dateDeSemaine(null), '')
    assert.equal(semaineDeDate(''), null)
  })
})

describe('resumerSourceEtude', () => {
  test('compte phases et jalons', () => {
    assert.deepEqual(resumerSourceEtude(SOURCE_ETUDE), { phases: 3, jalons: 1 })
  })
})

describe('preparerImportEtude', () => {
  test('sans nouvelle semaine, le planning est copié tel quel', () => {
    const p = preparerEtude()
    assert.equal(p.ecart, 0)
    assert.deepEqual(
      p.phases.map(f => [f.ligne.semaine_debut, f.ligne.annee_debut]),
      [[3, 2026], [7, 2026], [13, 2026]],
    )
  })

  test('le décalage se compte en semaines et s’applique à tout', () => {
    const p = preparerEtude({ nouveauDebut: { semaine: 10, annee: 2026 } })
    assert.equal(p.ecart, 7)
    assert.deepEqual(p.phases.map(f => f.ligne.semaine_debut), [10, 14, 20])
    assert.equal(p.segments[0].ligne.semaine_debut, 14)
    assert.equal(p.jalons[0].ligne.semaine, 27)
  })

  test('un décalage passe d’une année à l’autre', () => {
    const p = preparerEtude({ nouveauDebut: { semaine: 50, annee: 2026 } })
    const [, , validation] = p.phases
    assert.equal(validation.ligne.annee_debut, 2027)
    assert.ok(validation.ligne.semaine_debut >= 1 && validation.ligne.semaine_debut <= 53)
  })

  test('les durées et les réglages suivent', () => {
    const [esquisse] = preparerEtude().phases
    assert.equal(esquisse.ligne.duree_semaines, 4)
    assert.equal(esquisse.ligne.type_tache, 'etude')
    assert.equal(esquisse.ligne.importance, 'moe')
    assert.equal(esquisse.ligne.duree_arch, 2)
  })

  test('ni identifiant ni affaire dans la ligne écrite', () => {
    const [esquisse] = preparerEtude().phases
    for (const interdit of ['id', 'affaire_id', 'created_at', 'updated_at', 'depends_on']) {
      assert.equal(esquisse.ligne[interdit], undefined)
    }
  })

  test('les phases se rangent après l’existant', () => {
    const p = preparerEtude({ existant: { phases: [{ ordre: 4 }] } })
    assert.deepEqual(p.phases.map(f => f.ligne.ordre), [5, 6, 7])
  })

  test('une liaison interne est gardée, une liaison sortante est coupée', () => {
    const p = preparerEtude()
    assert.equal(p.phases[1].dependOrigine, 1)
    assert.equal(p.phases[2].dependOrigine, null, 'la phase 42 n’est pas importée')
  })

  test('un segment orphelin est écarté', () => {
    assert.deepEqual(preparerEtude().segments.map(s => s.origine), ['E1'])
  })

  test('le résumé compte ce qui sera écrit', () => {
    assert.deepEqual(preparerEtude().resume, { phases: 3, segments: 1, jalons: 1, liaisons: 1 })
  })

  test('une source vide ne donne pas de plan', () => {
    assert.equal(preparerImportEtude({ source: { phases: [] } }), null)
  })
})
