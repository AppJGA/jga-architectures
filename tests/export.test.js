// Exports PDF (planning chantier, planning étude) et Excel (planning étude).
//
// Les générateurs PDF écrivent du HTML dans une fenêtre ouverte par le
// navigateur, et l'export Excel passe par xlsx-js-style. Les deux sont ici
// détournés vers des doublures pour inspecter ce qui est réellement produit.

import assert from 'node:assert/strict'
import { test, describe, before } from 'node:test'
import { createRequire } from 'node:module'

// ── Doublure de fenêtre ──────────────────────────────────────────────────────

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

// ── Doublure d'écriture de classeur ──────────────────────────────────────────

const require_ = createRequire(import.meta.url)
const XLSX = require_('xlsx-js-style')
let classeur = null
XLSX.writeFile = (wb, nom) => { classeur = { wb, nom } }

const { generatePlanningChantierPdf } =
  await import('../src/modules/chantier/planning/generatePlanningChantierPdf.js')
const { generatePlanningEtudePdf } =
  await import('../src/modules/etude/planning/generatePlanningEtudePdf.js')
const { exportPlanningEtudeExcel } =
  await import('../src/modules/etude/planning/exportPlanningEtudeExcel.js')
const { legendeCouleurs, sansDiese } =
  await import('../src/modules/chantier/planning/legende.js')
const { assignLabelLanes } =
  await import('../src/modules/chantier/planning/jalonLayout.js')

// ── Jeux de données ──────────────────────────────────────────────────────────

const LOTS = [
  { id: 7, num_lot: '01', nom: 'Gros œuvre', couleur: '#E8602C', ordre: 0 },
  { id: 8, num_lot: '02', nom: 'Charpente', couleur: '#2A8A4E', ordre: 1 },
]
const ZONES = [
  { id: 'z1', nom: 'Bâtiment A', couleur: '#E8602C', ordre: 0 },
  { id: 'z2', nom: 'Bâtiment B', couleur: '#2A8A4E', ordre: 1 },
]
const TACHES = [
  { id: 1, num_tache: '01', nom: 'Terrassement', debut: '2026-03-02', duree: 5, lot_id: 7, zone_id: 'z1', avancement: 0 },
  { id: 2, num_tache: '02', nom: 'Fondations', debut: '2026-03-09', duree: 5, lot_id: 8, zone_id: 'z2', avancement: 50 },
]

const paramsPdfChantier = (extra = {}) => ({
  tasks: TACHES, lots: LOTS, jalons: [], affaire: { nom: 'Test' },
  dateDebut: '2026-03-02', dateFin: '2026-03-20',
  largeurMm: 420, hauteurMm: 297,
  segments: [], dependances: [], periodes: [], zones: ZONES,
  ...extra,
})

const PHASES = [
  { id: 1, nom: 'APS', type_tache: 'etude', semaine_debut: 10, annee_debut: 2026, duree_semaines: 4, importance: 'moe' },
  { id: 2, nom: 'Instruction PC', type_tache: 'administratif', label_barre: 'PC', semaine_debut: 14, annee_debut: 2026, duree_semaines: 8, importance: 'moa' },
]

const paramsPdfEtude = (extra = {}) => ({
  phases: PHASES, jalons: [], affaire: { nom: 'Test' },
  semaineDebut: 8, anneeDebut: 2026, semaineFin: 24, anneeFin: 2026,
  largeurMm: 420, hauteurMm: 297, segments: [], periodes: [],
  ...extra,
})

const paramsExcel = (extra = {}) => ({
  phases: PHASES, segments: [], jalons: [], periodes: [], affaire: { nom: 'Test' },
  refSemaine: 6, refAnnee: 2026,
  ...extra,
})

const feuille = () => classeur.wb.Sheets[classeur.wb.SheetNames[0]]
const cellule = (c, r) => feuille()[XLSX.utils.encode_cell({ c, r })]
// Corps du tableau, hors légende
const corpsPdf = () => htmlGenere.slice(htmlGenere.indexOf('<tbody>'), htmlGenere.indexOf('</tbody>'))
const legendePdf = () => htmlGenere.slice(htmlGenere.indexOf('<div class="legend">'), htmlGenere.indexOf('<div class="footer">'))

// ═══ PDF chantier ════════════════════════════════════════════════════════════

describe('PDF chantier — structure', () => {
  before(() => { htmlGenere = '' })

  test('le document est complet et au format demandé', () => {
    generatePlanningChantierPdf(paramsPdfChantier())
    assert.match(htmlGenere, /^<!DOCTYPE html>/)
    assert.match(htmlGenere, /<html lang="fr">/)
    assert.match(htmlGenere, /size: 420mm 297mm/)
    assert.ok(htmlGenere.includes('</html>'))
  })

  test('chaque tâche apparaît dans le corps du tableau', () => {
    generatePlanningChantierPdf(paramsPdfChantier())
    for (const t of TACHES) assert.ok(corpsPdf().includes(t.nom), t.nom)
  })

  test('l’en-tête reprend la plage imprimée', () => {
    generatePlanningChantierPdf(paramsPdfChantier())
    assert.match(htmlGenere, /02 mars 2026 → 20 mars 2026/)
  })

  test('des dates d’en-tête explicites remplacent la plage', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      headerDateDebut: '2026-01-15', headerDateFin: '2026-12-31',
    }))
    assert.match(htmlGenere, /15 janvier 2026 → 31 décembre 2026/)
    // La plage imprimée, elle, n'a pas bougé
    assert.ok(corpsPdf().includes('Terrassement'))
  })

  test('une date d’en-tête illisible retombe sur la plage', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ headerDateDebut: '', headerDateFin: 'n’importe quoi' }))
    assert.match(htmlGenere, /02 mars 2026 → 20 mars 2026/)
  })
})

describe('PDF chantier — périodes', () => {
  const conges = [{ id: 'p1', nom: 'Congés', date_debut: '2026-03-09', date_fin: '2026-03-13', couleur: '#B8412C' }]

  test('une période bloquante est peinte en aplat pastel opaque', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    // #B8412C mélangé à 20 % avec du blanc
    const attendu = `rgb(${Math.round(0xB8 * 0.2 + 255 * 0.8)},${Math.round(0x41 * 0.2 + 255 * 0.8)},${Math.round(0x2C * 0.2 + 255 * 0.8)})`
    assert.ok(corpsPdf().includes(`background:${attendu}`), attendu)
  })

  test('les hachures ont disparu', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    assert.ok(!/repeating-linear-gradient\(45deg, rgba\(184,65,44/.test(htmlGenere))
  })

  test('une période informative est plus pâle et sans encadrement', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      periodes: [{ ...conges[0], est_bloquante: false }],
    }))
    const clair = `rgb(${Math.round(0xB8 * 0.1 + 255 * 0.9)},${Math.round(0x41 * 0.1 + 255 * 0.9)},${Math.round(0x2C * 0.1 + 255 * 0.9)})`
    assert.ok(corpsPdf().includes(`background:${clair}`))
    assert.ok(!/border-right:1\.5px solid/.test(corpsPdf()))
  })

  test('l’encadrement ne marque que les deux extrémités', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    const c = corpsPdf()
    // Un trait de chaque côté par ligne de tâche, et pas davantage : sans quoi
    // la période doublerait la grille sur toute sa largeur
    assert.equal((c.match(/border-left:1\.5px solid #B8412C66/g) ?? []).length, TACHES.length)
    assert.equal((c.match(/border-right:1\.5px solid #B8412C66/g) ?? []).length, TACHES.length)
  })

  test('une période qui déborde de la plage ne s’encadre pas', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      periodes: [{ id: 'p1', nom: 'Longue', date_debut: '2026-02-01', date_fin: '2026-04-30', couleur: '#B8412C' }],
    }))
    assert.equal((corpsPdf().match(/border-left:1\.5px solid #B8412C66/g) ?? []).length, 0)
  })
})

describe('PDF chantier — légende et groupement', () => {
  test('mode zone : les zones sont énumérées', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'zone', groupMode: 'zone' }))
    const l = legendePdf()
    assert.match(l, /leg-sous-titre">Zones</)
    assert.ok(l.includes('Bâtiment A') && l.includes('Bâtiment B'))
    assert.match(l, /Barre de tâche \(couleur de la zone\)/)
    assert.match(l, /Tâches groupées par zone/)
  })

  test('l’export classique par lot ne gagne aucune entrée', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'lot', groupMode: 'lot' }))
    const l = legendePdf()
    assert.ok(!/leg-sous-titre/.test(l))
    assert.match(l, /Barre de tâche \(couleur du lot\)/)
  })

  test('groupé par zone mais colorié par lot : les lots sont énumérés', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'lot', groupMode: 'zone' }))
    assert.match(legendePdf(), /leg-sous-titre">Lots</)
    assert.ok(legendePdf().includes('01 Gros œuvre'))
  })

  test('les conventions restent présentes dans tous les modes', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'zone', groupMode: 'zone' }))
    for (const conv of ['Avancement', 'Délai avant / après', 'Segment', 'Période bloquante', 'Jalon']) {
      assert.ok(legendePdf().includes(conv), conv)
    }
    assert.equal((htmlGenere.match(/<div class="legend">/g) ?? []).length, 1)
  })

  test('la densité change la hauteur des lignes', () => {
    const hauteur = () => Number(htmlGenere.match(/height:([\d.]+)mm;padding:0/)[1])
    generatePlanningChantierPdf(paramsPdfChantier({ density: 'normal' }))
    const normal = hauteur()
    generatePlanningChantierPdf(paramsPdfChantier({ density: 'compact' }))
    const compact = hauteur()
    generatePlanningChantierPdf(paramsPdfChantier({ density: 'confort' }))
    assert.ok(compact < normal && normal < hauteur(), `${compact} < ${normal} < ${hauteur()}`)
  })

  test('une densité inconnue retombe sur normal', () => {
    const hauteur = () => Number(htmlGenere.match(/height:([\d.]+)mm;padding:0/)[1])
    generatePlanningChantierPdf(paramsPdfChantier({ density: 'normal' }))
    const normal = hauteur()
    generatePlanningChantierPdf(paramsPdfChantier({ density: 'énorme' }))
    assert.equal(hauteur(), normal)
  })
})

describe('légende — règles de composition', () => {
  test('couleur par zone : les zones sont listées dans leur ordre', () => {
    const l = legendeCouleurs({ tasks: TACHES, lots: LOTS, zones: ZONES, colorMode: 'zone', groupMode: 'zone' })
    assert.equal(l.titre, 'Zones')
    assert.deepEqual(l.entrees.map(e => e.label), ['Bâtiment A', 'Bâtiment B'])
  })

  test('« Sans zone » n’apparaît que si une barre porte ce gris', () => {
    const sans = legendeCouleurs({ tasks: TACHES, zones: ZONES, colorMode: 'zone', groupMode: 'zone' })
    assert.ok(!sans.entrees.some(e => e.label === 'Sans zone'))

    const avec = legendeCouleurs({
      tasks: [...TACHES, { id: 3, nom: 'Divers', zone_id: null }],
      zones: ZONES, colorMode: 'zone', groupMode: 'zone',
    })
    assert.equal(avec.entrees.at(-1).label, 'Sans zone')
  })

  test('une zone supprimée laisse ses tâches en gris', () => {
    const l = legendeCouleurs({
      tasks: [{ id: 1, zone_id: 'disparue' }], zones: ZONES,
      colorMode: 'zone', groupMode: 'zone',
    })
    assert.ok(l.entrees.some(e => e.label === 'Sans zone'))
  })

  test('lot + groupement par lot : aucune entrée ajoutée', () => {
    const l = legendeCouleurs({ tasks: TACHES, lots: LOTS, colorMode: 'lot', groupMode: 'lot' })
    assert.deepEqual(l.entrees, [])
    assert.equal(l.note, null)
  })

  test('un lot sans tâche n’encombre pas la légende', () => {
    const l = legendeCouleurs({
      tasks: [TACHES[0]], lots: [...LOTS, { id: 9, num_lot: '03', nom: 'Vide', couleur: '#000' }],
      colorMode: 'lot', groupMode: 'zone',
    })
    assert.deepEqual(l.entrees.map(e => e.label), ['01 Gros œuvre'])
  })

  test('appel sans argument : aucune exception', () => {
    assert.deepEqual(legendeCouleurs(), { titre: null, entrees: [], note: null })
  })

  test('sansDiese prépare les teintes pour Excel', () => {
    assert.equal(sansDiese('#E8602C'), 'E8602C')
    assert.equal(sansDiese(undefined), '')
  })
})

describe('anti-collision des libellés de jalons', () => {
  test('deux jalons éloignés partagent la même voie', () => {
    assert.deepEqual(assignLabelLanes([0, 100], 26), [0, 0])
  })

  test('deux jalons proches sont répartis sur deux voies', () => {
    assert.deepEqual(assignLabelLanes([0, 5], 26), [0, 1])
  })

  test('une voie est réutilisée dès que l’écart le permet', () => {
    assert.deepEqual(assignLabelLanes([0, 5, 10, 200], 26), [0, 1, 2, 0])
  })

  test('liste vide', () => {
    assert.deepEqual(assignLabelLanes([], 26), [])
  })
})

// ═══ PDF étude ═══════════════════════════════════════════════════════════════

describe('PDF étude', () => {
  const hauteurCellule = () => Number(htmlGenere.match(/\.pcell\s+\{[^}]*height: ([\d.]+)mm/)[1])

  test('le document contient les phases', () => {
    generatePlanningEtudePdf(paramsPdfEtude())
    assert.match(htmlGenere, /^<!DOCTYPE html>/)
    assert.ok(htmlGenere.includes('APS'))
  })

  test('la densité normale reproduit le rendu historique', () => {
    generatePlanningEtudePdf(paramsPdfEtude())
    assert.equal(hauteurCellule(), 8.5)
  })

  test('compact et confort encadrent normal', () => {
    generatePlanningEtudePdf(paramsPdfEtude({ density: 'compact' }))
    const c = hauteurCellule()
    generatePlanningEtudePdf(paramsPdfEtude({ density: 'confort' }))
    assert.ok(c < 8.5 && hauteurCellule() > 8.5)
  })

  test('une densité inconnue retombe sur normal', () => {
    generatePlanningEtudePdf(paramsPdfEtude({ density: 'énorme' }))
    assert.equal(hauteurCellule(), 8.5)
  })

  test('un planning sans phase ne plante pas', () => {
    generatePlanningEtudePdf(paramsPdfEtude({ phases: [] }))
    assert.match(htmlGenere, /^<!DOCTYPE html>/)
  })
})

// ═══ Excel étude ═════════════════════════════════════════════════════════════

describe('Excel étude — structure', () => {
  test('le classeur porte une feuille et une plage cohérentes', () => {
    exportPlanningEtudeExcel(paramsExcel())
    assert.ok(classeur.nom.endsWith('.xlsx'))
    assert.equal(classeur.wb.SheetNames.length, 1)
    assert.match(feuille()['!ref'], /^A1:[A-Z]+\d+$/)
  })

  test('toutes les lignes ont une hauteur', () => {
    exportPlanningEtudeExcel(paramsExcel({
      jalons: [{ id: 'j1', label: 'PC', semaine: 12, annee: 2026, couleur: '#8B5CF6' }],
    }))
    assert.ok(feuille()['!rows'].every(r => r && typeof r.hpt === 'number'))
  })

  test('la colonne de gauche nomme les phases', () => {
    exportPlanningEtudeExcel(paramsExcel())
    const noms = []
    for (let r = 2; r < 6; r++) if (cellule(0, r)?.v) noms.push(cellule(0, r).v)
    assert.ok(noms.includes('APS'), noms.join(' / '))
  })

  test('une phase administrative affiche son texte de barre', () => {
    exportPlanningEtudeExcel(paramsExcel())
    const noms = []
    for (let r = 2; r < 6; r++) if (cellule(0, r)?.v) noms.push(cellule(0, r).v)
    assert.ok(noms.includes('PC'), 'label_barre plutôt que le nom complet')
  })
})

describe('Excel étude — densité', () => {
  test('les hauteurs de ligne suivent la densité', () => {
    exportPlanningEtudeExcel(paramsExcel())
    assert.equal(feuille()['!rows'][2].hpt, 16)

    exportPlanningEtudeExcel(paramsExcel({ density: 'compact' }))
    assert.equal(feuille()['!rows'][2].hpt, 12)

    exportPlanningEtudeExcel(paramsExcel({ density: 'confort' }))
    assert.equal(feuille()['!rows'][2].hpt, 22)
  })

  test('le corps de texte suit la densité', () => {
    exportPlanningEtudeExcel(paramsExcel({ density: 'confort' }))
    const confort = cellule(0, 2).s.font.sz
    exportPlanningEtudeExcel(paramsExcel({ density: 'compact' }))
    assert.ok(cellule(0, 2).s.font.sz < confort)
  })

  test('une densité inconnue retombe sur normal', () => {
    exportPlanningEtudeExcel(paramsExcel({ density: 'énorme' }))
    assert.equal(feuille()['!rows'][2].hpt, 16)
  })
})

describe('Excel étude — mise en forme', () => {
  test('les cellules d’une phase portent une couleur de fond', () => {
    exportPlanningEtudeExcel(paramsExcel())
    // Une phase démarrant en S10 avec S6 pour référence : la 5e colonne de temps
    const remplies = []
    for (let c = 2; c < 20; c++) {
      const s = cellule(c, 2)?.s
      if (s?.fill?.fgColor?.rgb && s.fill.fgColor.rgb !== 'FFFFFF') remplies.push(c)
    }
    assert.ok(remplies.length >= 4, `${remplies.length} cellules coloriées`)
  })

  test('une phase administrative est encadrée en trait épais', () => {
    exportPlanningEtudeExcel(paramsExcel())
    let trouve = false
    for (let r = 2; r < 6; r++) {
      for (let c = 2; c < 24; c++) {
        if (cellule(c, r)?.s?.border?.top?.style === 'medium') { trouve = true; break }
      }
    }
    assert.ok(trouve, 'aucun encadrement épais trouvé')
  })

  test('les sous-parties MOE se distinguent par leur teinte', () => {
    exportPlanningEtudeExcel(paramsExcel({
      phases: [{
        id: 1, nom: 'APS', type_tache: 'etude', importance: 'moe',
        semaine_debut: 10, annee_debut: 2026, duree_semaines: 6,
        duree_arch: 2, duree_bet: 2, duree_econ: 2,
      }],
    }))
    const teintes = new Set()
    for (let c = 2; c < 24; c++) {
      const rgb = cellule(c, 2)?.s?.fill?.fgColor?.rgb
      if (rgb && rgb !== 'FFFFFF') teintes.add(rgb)
    }
    assert.ok(teintes.size >= 3, `${teintes.size} teintes distinctes attendues (①②③)`)
  })

  test('un planning sans phase produit quand même un classeur', () => {
    exportPlanningEtudeExcel(paramsExcel({ phases: [] }))
    assert.ok(feuille()['!ref'])
  })
})
