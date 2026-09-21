// Export PDF du planning d'étude : échappement des textes saisis et découpage
// des barres aux bornes de la période exportée.
//
// Le générateur écrit du HTML dans une fenêtre ouverte par le navigateur ; elle
// est ici remplacée par une doublure pour inspecter ce qui est produit.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

let htmlGenere = ''
globalThis.window = {
  location: { origin: 'http://localhost' },
  open: () => ({
    document: {
      write: (html) => { htmlGenere = html },
      close: () => {},
    },
  }),
}

const { generatePlanningEtudePdf } =
  await import('../src/modules/etude/planning/generatePlanningEtudePdf.js')
const { calculerPeriodeExport, phasesDansPeriode, segmentsDansPeriode } =
  await import('../src/modules/etude/planning/periodeExportEtude.js')
const { echapperHtml } = await import('../src/shared/echapperHtml.js')

const phase = (extra = {}) => ({
  id: 1, nom: 'APS', type_tache: 'etude', importance: 'moe',
  semaine_debut: 10, annee_debut: 2026, duree_semaines: 4, ...extra,
})

const params = (extra = {}) => ({
  phases: [phase()], jalons: [], affaire: { nom: 'Test' },
  semaineDebut: 8, anneeDebut: 2026, semaineFin: 16, anneeFin: 2026,
  largeurMm: 420, hauteurMm: 297, segments: [], periodes: [],
  ...extra,
})

// Largeurs (en % de cellule) des barres d'une classe donnée
const largeursBarres = (classe = 'bar') =>
  [...htmlGenere.matchAll(new RegExp(`class="${classe}" style="left:0;width:(\\d+)%`, 'g'))]
    .map((m) => Number(m[1]))

describe('echapperHtml', () => {
  test('neutralise les caractères actifs du HTML', () => {
    assert.equal(echapperHtml(`<a href="x">L'été & co</a>`),
      '&lt;a href=&quot;x&quot;&gt;L&#39;été &amp; co&lt;/a&gt;')
  })

  test('une valeur absente donne une chaîne vide', () => {
    assert.equal(echapperHtml(null), '')
    assert.equal(echapperHtml(undefined), '')
  })
})

describe('PDF étude — textes saisis', () => {
  const INJECTION = '<img src=x onerror=alert(1)>'

  test('nom, texte de barre, segment, jalon et affaire sont échappés', () => {
    generatePlanningEtudePdf(params({
      phases: [
        phase({ nom: `APS ${INJECTION}` }),
        phase({ id: 2, nom: 'PC', type_tache: 'administratif', label_barre: `Instruction ${INJECTION}` }),
      ],
      segments: [{ id: 's1', phase_id: 2, nom: `Reprise ${INJECTION}`, semaine_debut: 14, annee_debut: 2026, duree_semaines: 1 }],
      jalons: [{ id: 'j1', label: `Dépôt ${INJECTION}`, semaine: 12, annee: 2026, couleur: '#8B5CF6' }],
      affaire: { nom: `Maison ${INJECTION}`, moa_nom: `M. & Mme ${INJECTION}`, code_affaire: INJECTION },
    }))
    assert.ok(!htmlGenere.includes(INJECTION))
    assert.ok(htmlGenere.includes('APS &lt;img src=x onerror=alert(1)&gt;'))
    assert.ok(htmlGenere.includes('Instruction &lt;img'))
    assert.ok(htmlGenere.includes('Reprise &lt;img'))
    assert.ok(htmlGenere.includes('Dépôt &lt;img'))
    assert.ok(htmlGenere.includes('M. &amp; Mme'))
  })

  test('une couleur ne peut pas sortir de son attribut style', () => {
    generatePlanningEtudePdf(params({ phases: [phase({ couleur_custom: '#fff"><script>' })] }))
    assert.ok(!htmlGenere.includes('"><script>'))
  })
})

describe('PDF étude — découpage aux bornes de la période', () => {
  test('une phase commencée avant la période garde la partie visible', () => {
    // S6 → S9, période à partir de S8 : deux semaines visibles
    generatePlanningEtudePdf(params({ phases: [phase({ semaine_debut: 6, duree_semaines: 4 })] }))
    assert.deepEqual(largeursBarres(), [200])
    assert.ok(htmlGenere.includes('>APS</div>'))
  })

  test('la répartition des intervenants suit le découpage', () => {
    // ① S6-S8, ② S9 : seules S8 (①) et S9 (②) sont visibles
    generatePlanningEtudePdf(params({
      phases: [phase({ semaine_debut: 6, duree_semaines: 4, duree_arch: 3, duree_bet: 1 })],
    }))
    const sousBarres = [...htmlGenere.matchAll(/class="seg" style="left:([\d.]+)%;width:([\d.]+)%[^"]*">(\d)</g)]
      .map((m) => [Number(m[1]), Number(m[2]), m[3]])
    assert.deepEqual(sousBarres, [[0, 50, '1'], [50, 50, '2']])
  })

  test('une barre qui dépasse la fin de la période est tronquée', () => {
    // S15 → S18, période jusqu'à S16 : deux semaines visibles
    generatePlanningEtudePdf(params({ phases: [phase({ semaine_debut: 15, duree_semaines: 4 })] }))
    assert.deepEqual(largeursBarres(), [200])
  })

  test('un segment commencé avant la période est affiché', () => {
    generatePlanningEtudePdf(params({
      segments: [{ id: 's1', phase_id: 1, nom: null, semaine_debut: 6, annee_debut: 2026, duree_semaines: 3 }],
    }))
    assert.deepEqual(largeursBarres('bar seg-bar'), [100])
  })

  test('une phase entièrement hors période n’a pas de barre', () => {
    generatePlanningEtudePdf(params({ phases: [phase({ semaine_debut: 2, duree_semaines: 3 })] }))
    assert.deepEqual(largeursBarres(), [])
  })
})

describe('période d’export', () => {
  // S11 2026 : du lundi 9 au vendredi 13 mars
  const CONGES_S11 = [{ id: 'p1', date_debut: '2026-03-09', date_fin: '2026-03-13', est_bloquante: true }]

  test('la fin proposée tient compte des semaines bloquées', () => {
    // S10, 2 semaines, S11 bloquée : fin effective S13, marge d'une semaine
    const periode = calculerPeriodeExport([phase({ duree_semaines: 2 })], [], CONGES_S11)
    assert.deepEqual(periode, { semDebut: 9, anneeDebut: 2026, semFin: 14, anneeFin: 2026 })
  })

  test('les segments élargissent la période proposée', () => {
    const segments = [{ id: 's1', phase_id: 1, semaine_debut: 30, annee_debut: 2026, duree_semaines: 2 }]
    const periode = calculerPeriodeExport([phase()], segments, [])
    assert.deepEqual([periode.semFin, periode.anneeFin], [33, 2026])
  })

  test('un planning vide propose douze semaines', () => {
    const { semDebut, anneeDebut, semFin, anneeFin } = calculerPeriodeExport([], [], [])
    assert.ok(semDebut >= 1 && semFin >= 1 && anneeFin >= anneeDebut)
  })

  test('une phase repoussée dans la période par une période bloquante y figure', () => {
    // S10, 2 semaines, S11 bloquée : elle occupe encore la S12
    const debut = { semaine: 12, annee: 2026 }
    const fin = { semaine: 20, annee: 2026 }
    const p = phase({ duree_semaines: 2 })
    assert.equal(phasesDansPeriode([p], [], debut, fin).length, 0)
    assert.equal(phasesDansPeriode([p], CONGES_S11, debut, fin).length, 1)
  })

  test('les segments hors période sont écartés', () => {
    const segments = [
      { id: 'a', semaine_debut: 5, annee_debut: 2026, duree_semaines: 2 },
      { id: 'b', semaine_debut: 11, annee_debut: 2026, duree_semaines: 2 },
    ]
    const retenus = segmentsDansPeriode(segments, { semaine: 8, annee: 2026 }, { semaine: 16, annee: 2026 })
    assert.deepEqual(retenus.map((s) => s.id), ['b'])
  })
})

describe('PDF étude — périodes et barre en pause', () => {
  // S11 2026 : du lundi 9 au dimanche 15 mars
  const conges = [{ id: 'p', label: 'Congés', date_debut: '2026-03-09', date_fin: '2026-03-13', couleur: '#B8412C' }]

  test('la phase reste une seule barre, la semaine bloquée y est en pause', () => {
    generatePlanningEtudePdf(params({ phases: [phase()], periodes: conges }))
    // S10 → S14 : 4 semaines comptées + 1 en pause
    assert.deepEqual(largeursBarres(), [500])
    const pauses = [...htmlGenere.matchAll(/data-pause="1" style="position:absolute;top:0;bottom:0;left:([\d.]+)%;width:([\d.]+)%/g)]
      .map((m) => [Number(m[1]), Number(m[2])])
    assert.deepEqual(pauses, [[20, 20]])
  })

  test('les intervenants reprennent après la pause', () => {
    generatePlanningEtudePdf(params({ phases: [phase({ duree_arch: 2, duree_bet: 2 })], periodes: conges }))
    const sousBarres = [...htmlGenere.matchAll(/class="seg" style="left:([\d.]+)%;width:([\d.]+)%[^"]*">(\d)</g)]
      .map((m) => [Number(m[1]), Number(m[2]), m[3]])
    assert.deepEqual(sousBarres, [[0, 20, '1'], [40, 20, '1'], [60, 40, '2']])
  })

  test('le nom de la phase n’est écrit qu’une fois, au bout de la barre', () => {
    generatePlanningEtudePdf(params({ phases: [phase()], periodes: conges }))
    assert.equal(htmlGenere.split('>APS</div>').length - 1, 1)
  })

  test('un bandeau nomme la période sous les semaines', () => {
    generatePlanningEtudePdf(params({ periodes: conges }))
    assert.match(htmlGenere, /class="hdr-periode" colspan="1"[^>]*>Congés</)
  })

  test('grille : traits de mois et de semaine, jamais de jour', () => {
    generatePlanningEtudePdf(params())
    assert.ok(htmlGenere.includes('border-left:1.5px solid #5f5f5f'))
    assert.ok(htmlGenere.includes('border-left:1px solid #a8a8a8'))
    assert.ok(!htmlGenere.includes('0.5px solid #e6e6e6'))
  })
})

describe('PDF étude — textes et légende', () => {
  test('textes d’en-tête et du bas', () => {
    generatePlanningEtudePdf(params({ texteEntete: '<i>Indice B</i>', textePied: '<ul><li>Note</li></ul>' }))
    assert.ok(htmlGenere.includes('<div class="texte-entete"><i>Indice B</i></div>'))
    assert.ok(htmlGenere.includes('<div class="texte-pied"><ul><li>Note</li></ul></div>'))
  })

  test('la légende reprend les libellés de l’écran, puis les conventions', () => {
    generatePlanningEtudePdf(params())
    const l = htmlGenere.slice(htmlGenere.indexOf('<div class="legend">'), htmlGenere.indexOf('<div class="footer">'))
    for (const libelle of ['Phase MOE (ESQ, APS, APD…)', 'Validation / Visa', 'Période administrative', 'Phase chantier', 'Architecte', 'BET', 'Économiste']) {
      assert.ok(l.includes(libelle), libelle)
    }
    assert.ok(l.indexOf('Phase chantier') < l.indexOf('Conventions'))
    assert.ok(l.includes('border-top:2px solid #8B5CF6'), 'jalon à la couleur des jalons d’étude')
  })
})
