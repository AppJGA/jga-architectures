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

const { generatePlanningChantierPdf, intervallesTache } =
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
  const conges = [{ id: 'p1', label: 'Congés', date_debut: '2026-03-09', date_fin: '2026-03-13', couleur: '#B8412C' }]
  const melange = (o) => `rgb(${Math.round(0xB8 * o + 255 * (1 - o))},${Math.round(0x41 * o + 255 * (1 - o))},${Math.round(0x2C * o + 255 * (1 - o))})`
  const trait = `2px solid ${melange(0.85)}`

  test('une période bloquante est peinte en aplat soutenu', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    assert.ok(corpsPdf().includes(`background:${melange(0.30)}`))
  })

  test('pas de hachures dans les cellules : elles bavaient à l’impression', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    assert.ok(!/<td[^>]*repeating-linear-gradient/.test(corpsPdf()))
  })

  test('une période informative est plus pâle et sans encadrement', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      periodes: [{ ...conges[0], est_bloquante: false }],
    }))
    assert.ok(corpsPdf().includes(`background:${melange(0.15)}`))
    assert.ok(!corpsPdf().includes(`border-right:${trait}`))
  })

  test('l’encadrement ne marque que les deux extrémités', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    const c = corpsPdf()
    const compter = (motif) => c.split(motif).length - 1
    assert.equal(compter(`border-left:${trait}`), TACHES.length)
    assert.equal(compter(`border-right:${trait}`), TACHES.length)
  })

  test('une période qui déborde de la plage ne s’encadre pas', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      periodes: [{ id: 'p1', label: 'Longue', date_debut: '2026-02-01', date_fin: '2026-04-30', couleur: '#B8412C' }],
    }))
    assert.ok(!corpsPdf().includes(`border-left:${trait}`))
  })

  test('un bandeau nomme la période sous les dates', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ periodes: conges }))
    const thead = htmlGenere.slice(htmlGenere.indexOf('<thead>'), htmlGenere.indexOf('</thead>'))
    assert.match(thead, /class="hdr-periode" colspan="5"[^>]*>Congés</)
  })

  test('la ligne de mois traverse le bandeau des périodes', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      dateFin: '2026-04-10',
      periodes: [{ id: 'p', label: 'Pâques', date_debut: '2026-03-30', date_fin: '2026-04-03', couleur: '#B8412C' }],
    }))
    const thead = htmlGenere.slice(htmlGenere.indexOf('<thead>'), htmlGenere.indexOf('</thead>'))
    const morceaux = [...thead.matchAll(/class="hdr-periode" colspan="(\d+)" style="border-left:([^;]*);background[^>]*>([^<]*)</g)]
      .map(m => [Number(m[1]), m[2], m[3]])
    assert.deepEqual(morceaux, [[2, '1px solid #a8a8a8', 'Pâques'], [3, '1.5px solid #5f5f5f', '']])
  })

  test('lignes horizontales à la teinte des mois', () => {
    generatePlanningChantierPdf(paramsPdfChantier())
    assert.ok(corpsPdf().includes('border-bottom:1px solid #5f5f5f'))
    assert.ok(!corpsPdf().includes('#f0f0f0'))
  })

  test('sans période, pas de bandeau', () => {
    generatePlanningChantierPdf(paramsPdfChantier())
    assert.ok(!htmlGenere.includes('class="hdr-periode"'))
  })

  test('une barre qui traverse une période y est « en pause »', () => {
    // Terrassement : 5 jours à partir du 2 mars ; la fermeture du 3 au 5 la
    // prolonge jusqu'au 9 — les trois jours de fermeture sont en pause
    generatePlanningChantierPdf(paramsPdfChantier({
      tasks: [TACHES[0]],
      periodes: [{ id: 'p', label: 'Fermeture', date_debut: '2026-03-03', date_fin: '2026-03-05', couleur: '#B8412C' }],
    }))
    const pauses = [...corpsPdf().matchAll(/data-pause="1" style="position:absolute;left:([\d.]+)mm;width:([\d.]+)mm/g)]
    assert.equal(pauses.length, 1)
    assert.ok(Number(pauses[0][1]) > 0, 'la pause commence après le premier jour')
    assert.ok(corpsPdf().includes('repeating-linear-gradient(45deg, #E8602C'), 'rayures de la couleur de la barre')
  })

  test('une période informative ne met pas la barre en pause', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      tasks: [TACHES[0]],
      periodes: [{ id: 'p', label: 'Info', date_debut: '2026-03-03', date_fin: '2026-03-05', couleur: '#B8412C', est_bloquante: false }],
    }))
    assert.ok(!corpsPdf().includes('data-pause'))
  })
})

describe('PDF chantier — grille selon la granularité', () => {
  const MOIS = 'border-left:1.5px solid #5f5f5f'
  const SEMAINE = 'border-left:1px solid #a8a8a8'
  const JOUR = 'border-left:0.5px solid #e6e6e6'
  const params = (viewMode) => paramsPdfChantier({ viewMode, dateDebut: '2026-02-23', dateFin: '2026-03-20' })

  test('en jours : mois, semaines et jours sont tracés', () => {
    generatePlanningChantierPdf(params('day'))
    const c = corpsPdf()
    assert.ok(c.includes(MOIS) && c.includes(SEMAINE) && c.includes(JOUR))
  })

  test('en semaines : plus de lignes de jour', () => {
    generatePlanningChantierPdf(params('week'))
    const c = corpsPdf()
    assert.ok(c.includes(MOIS) && c.includes(SEMAINE))
    assert.ok(!c.includes(JOUR))
  })

  test('en mois : seules les lignes de mois restent', () => {
    generatePlanningChantierPdf(params('month'))
    const c = corpsPdf()
    assert.ok(c.includes(MOIS))
    assert.ok(!c.includes(SEMAINE) && !c.includes(JOUR))
  })

  test('le grisé du week-end ne reste qu’en vue jours', () => {
    generatePlanningChantierPdf(params('week'))
    assert.ok(!corpsPdf().includes('rgba(0,0,0,0.03)'))
    generatePlanningChantierPdf(params('day'))
    assert.ok(corpsPdf().includes('rgba(0,0,0,0.03)'))
  })
})

describe('PDF chantier — textes libres', () => {
  test('le texte d’en-tête se place entre le logo et le titre', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ texteEntete: '<b>Version contractuelle</b>' }))
    const entete = htmlGenere.slice(htmlGenere.indexOf('<div class="header">'), htmlGenere.indexOf('<div class="header-right">'))
    assert.ok(entete.includes('class="logo"'))
    assert.match(entete, /<div class="texte-entete"><b>Version contractuelle<\/b><\/div>/)
  })

  test('le texte du bas se place sous le planning, avant la légende', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ textePied: 'Sous réserve des intempéries' }))
    const i = htmlGenere.indexOf('<div class="texte-pied">')
    assert.ok(i > htmlGenere.indexOf('</table>') && i < htmlGenere.indexOf('<div class="legend">'))
  })

  test('le texte est nettoyé : ni script ni attribut', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ texteEntete: '<p onclick="x()">A<script>alert(1)</script></p>' }))
    assert.ok(htmlGenere.includes('<div class="texte-entete"><p>A</p></div>'))
    assert.ok(!htmlGenere.includes('alert(1)'))
  })

  test('un texte vide n’ajoute aucun bloc', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ texteEntete: '<div><br></div>', textePied: '&nbsp;' }))
    assert.ok(!htmlGenere.includes('class="texte-entete"') && !htmlGenere.includes('class="texte-pied"'))
  })
})

describe('PDF chantier — légende et groupement', () => {
  test('couleur par zone : toutes les zones, puis « Sans zone », comme à l’écran', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'zone', groupMode: 'zone' }))
    const l = legendePdf()
    assert.match(l, /leg-sous-titre">Zones</)
    assert.ok(l.includes('Bâtiment A') && l.includes('Bâtiment B') && l.includes('Sans zone'))
    assert.match(l, /Tâches groupées par zone/)
  })

  test('couleur par lot : tous les lots, même groupés par lot', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'lot', groupMode: 'lot' }))
    const l = legendePdf()
    assert.match(l, /leg-sous-titre">Lots</)
    assert.ok(l.includes('01 – Gros œuvre') && l.includes('02 – Charpente'))
  })

  test('la convention orange « Barre de tâche » a disparu', () => {
    generatePlanningChantierPdf(paramsPdfChantier())
    assert.ok(!legendePdf().includes('Barre de tâche'))
  })

  test('les conventions restent présentes dans tous les modes', () => {
    generatePlanningChantierPdf(paramsPdfChantier({ colorMode: 'zone', groupMode: 'zone' }))
    for (const conv of ['Avancement', 'Délai avant / après', 'Segment', 'Période bloquante', 'en pause', 'Jalon']) {
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

describe('PDF chantier — géométrie des barres', () => {
  // Vue semaine : toutes les colonnes de jour ont la même largeur, ce qui
  // ramène la largeur d'une barre à un nombre de jours calendaires.
  const CONTENU_MM = 420 - 20 - 45
  const nbJours = (debut, fin) => Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1

  // Colonne du jour qui porte la barre, et largeur de celle-ci
  const barre = (attribut) => {
    const ligne = corpsPdf().split('<tr>').find(tr => tr.includes(attribut))
    assert.ok(ligne, `aucune barre ${attribut}`)
    const cellules = ligne.split('<td style="width:')
    const idx = cellules.findIndex(c => c.includes(attribut)) - 1
    const largeur = Number(ligne.slice(ligne.indexOf(attribut)).match(/;width:([\d.]+)mm/)[1])
    return { idx, largeur }
  }
  const proche = (reel, attendu) => assert.ok(Math.abs(reel - attendu) < 0.05, `${reel} ≠ ${attendu}`)

  test('une barre traverse une fermeture et s’arrête sur son dernier jour ouvré', () => {
    const plage = { dateDebut: '2026-07-27', dateFin: '2026-09-04' }
    generatePlanningChantierPdf(paramsPdfChantier({
      ...plage, viewMode: 'week',
      tasks: [{ id: 1, nom: 'Enduits', debut: '2026-07-27', duree: 10, lot_id: 7 }],
      periodes: [{ id: 'p', date_debut: '2026-08-03', date_fin: '2026-08-21', couleur: '#B8412C' }],
    }))
    const { idx, largeur } = barre('data-task-id="1" data-type="task"')
    assert.equal(idx, 0)
    // 5 jours avant la fermeture, 5 après : fin le vendredi 28 août
    const uniforme = CONTENU_MM / nbJours(plage.dateDebut, plage.dateFin)
    proche(largeur, nbJours('2026-07-27', '2026-08-28') * uniforme)
  })

  test('une barre du lundi au vendredi ne couvre pas le week-end', () => {
    const plage = { dateDebut: '2026-03-02', dateFin: '2026-03-20' }
    generatePlanningChantierPdf(paramsPdfChantier({ ...plage, viewMode: 'week' }))
    const { idx, largeur } = barre('data-task-id="1" data-type="task"')
    assert.equal(idx, 0)
    proche(largeur, 5 * CONTENU_MM / nbJours(plage.dateDebut, plage.dateFin))
  })

  test('une tâche commencée avant la plage a bien une barre, ancrée au premier jour', () => {
    const plage = { dateDebut: '2026-03-02', dateFin: '2026-03-20' }
    generatePlanningChantierPdf(paramsPdfChantier({
      ...plage, viewMode: 'week',
      tasks: [{ id: 1, nom: 'Démolition', debut: '2026-02-23', duree: 10, lot_id: 7 }],
    }))
    const { idx, largeur } = barre('data-task-id="1" data-type="task"')
    assert.equal(idx, 0)
    // Seuls les jours visibles comptent : du 2 au vendredi 6 mars
    proche(largeur, 5 * CONTENU_MM / nbJours(plage.dateDebut, plage.dateFin))
  })

  test('le délai après reprend au jour ouvré suivant la fermeture', () => {
    const plage = { dateDebut: '2026-07-27', dateFin: '2026-09-04' }
    generatePlanningChantierPdf(paramsPdfChantier({
      ...plage, viewMode: 'week',
      tasks: [{ id: 1, nom: 'Chape', debut: '2026-07-27', duree: 5, delai_apres: 3, label_apres: 'Séchage', lot_id: 7 }],
      periodes: [{ id: 'p', date_debut: '2026-08-03', date_fin: '2026-08-21', couleur: '#B8412C' }],
    }))
    const ligne = corpsPdf().split('<tr>').find(tr => tr.includes('Séchage'))
    const cellules = ligne.split('<td style="width:')
    // Lundi 24 août : 28e jour de la plage
    assert.equal(cellules.findIndex(c => c.includes('dashed')) - 1, nbJours('2026-07-27', '2026-08-24') - 1)
  })

  test('le nom d’un segment n’est écrit que si « afficher le nom » est coché', () => {
    const seg = { id: 's1', tache_id: 1, nom: 'Reprise', date_debut: '2026-03-16', duree_jours: 3 }
    generatePlanningChantierPdf(paramsPdfChantier({ segments: [seg] }))
    assert.ok(corpsPdf().includes('data-segment-id="s1"'))
    assert.ok(!corpsPdf().includes('Reprise'))
    generatePlanningChantierPdf(paramsPdfChantier({ segments: [{ ...seg, afficher_nom: true }] }))
    assert.ok(corpsPdf().includes('Reprise'))
  })
})

describe('PDF chantier — textes et en-têtes', () => {
  test('un nom de tâche est échappé', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      tasks: [{ ...TACHES[0], nom: '<b>x</b> & co' }],
      affaire: { nom: 'Maison <script>' },
    }))
    assert.ok(corpsPdf().includes('&lt;b&gt;x&lt;/b&gt; &amp; co'))
    assert.ok(!htmlGenere.includes('<b>x</b>'))
    assert.ok(!htmlGenere.includes('Maison <script>'))
  })

  test('pas de doublon S1 au nouvel an', () => {
    generatePlanningChantierPdf(paramsPdfChantier({
      dateDebut: '2024-12-30', dateFin: '2025-01-12', viewMode: 'week',
    }))
    const semaines = [...htmlGenere.matchAll(/class="hdr-week"[^>]*>(S\d+)</g)].map(m => m[1])
    assert.deepEqual(semaines, ['S1', 'S2'])
  })
})

describe('PDF chantier — étendue d’une tâche', () => {
  test('délais et fermetures élargissent l’intervalle, segments à part', () => {
    const periodes = [{ date_debut: '2026-08-03', date_fin: '2026-08-21' }]
    const tache = { id: 1, debut: '2026-07-27', duree: 5, appro_actif: true, appro_duree: 2, delai_apres: 3 }
    const seg = { tache_id: 1, date_debut: '2026-09-07', duree_jours: 2 }
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const res = intervallesTache(tache, [seg], periodes).map(({ debut, fin }) => [iso(debut), iso(fin)])
    assert.deepEqual(res, [
      ['2026-07-23', '2026-08-26'],
      ['2026-09-07', '2026-09-08'],
    ])
  })
})

describe('légende — règles de composition', () => {
  test('couleur par zone : les zones dans leur ordre, puis « Sans zone »', () => {
    const l = legendeCouleurs({ lots: LOTS, zones: [...ZONES].reverse(), colorMode: 'zone', groupMode: 'zone' })
    assert.equal(l.titre, 'Zones')
    assert.deepEqual(l.entrees.map(e => e.label), ['Bâtiment A', 'Bâtiment B', 'Sans zone'])
  })

  test('couleur par lot : tous les lots, y compris sans tâche', () => {
    const l = legendeCouleurs({
      lots: [...LOTS, { id: 9, num_lot: '03', nom: 'Vide', couleur: '#000', ordre: 2 }],
      colorMode: 'lot', groupMode: 'lot',
    })
    assert.equal(l.titre, 'Lots')
    assert.deepEqual(l.entrees.map(e => e.label), ['01 – Gros œuvre', '02 – Charpente', '03 – Vide'])
    assert.equal(l.note, null)
  })

  test('le groupement par zone ajoute seulement une note', () => {
    const l = legendeCouleurs({ lots: LOTS, colorMode: 'lot', groupMode: 'zone' })
    assert.equal(l.entrees.length, 2)
    assert.equal(l.note, 'Tâches groupées par zone')
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
