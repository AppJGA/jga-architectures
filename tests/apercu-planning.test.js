// Mise en page des PDF de planning : feuilles fabriquées par la page,
// répartition des lignes, et page d'aperçu (la même, sans impression).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

globalThis.window = { location: { origin: 'http://localhost' } }

const { repartirLignes, scriptMiseEnPage } =
  await import('../src/shared/planning/export/miseEnPageExport.js')
const { couleurTexteSur, largeurEtiquetteMm, bandeEcheances } =
  await import('../src/shared/planning/export/echeancesExport.js')
const { libelleApercu } =
  await import('../src/shared/planning/export/apercuPlanningLogique.js')
const { htmlApercuChantier, generatePlanningChantierPdf } =
  await import('../src/modules/chantier/planning/generatePlanningChantierPdf.js')
const { htmlApercuEtude } =
  await import('../src/modules/etude/planning/generatePlanningEtudePdf.js')

describe('répartition des lignes sur les feuilles', () => {
  const sansTitre = (n) => Array(n).fill(false)

  test('tout tient : une feuille, fin comprise', () => {
    const r = repartirLignes([10, 10, 10], sansTitre(3), { premiere: 100, suivantes: 150, fin: 20 })
    assert.deepEqual(r.pages, [[0, 1, 2]])
    assert.equal(r.finSeule, false)
  })

  test('la première feuille a moins de place (en-tête du document)', () => {
    const r = repartirLignes(Array(10).fill(10), sansTitre(10), { premiere: 35, suivantes: 50, fin: 0 })
    assert.deepEqual(r.pages, [[0, 1, 2], [3, 4, 5, 6, 7], [8, 9]])
  })

  test('un titre de groupe ne reste pas seul en bas de feuille', () => {
    const titres = [true, false, false, true, false, false]
    const r = repartirLignes(Array(6).fill(10), titres, { premiere: 40, suivantes: 40, fin: 0 })
    assert.deepEqual(r.pages, [[0, 1, 2], [3, 4, 5]])
  })

  test('la fin du document qui ne tient pas prend sa propre feuille', () => {
    const r = repartirLignes([10, 10], sansTitre(2), { premiere: 30, suivantes: 30, fin: 15 })
    assert.equal(r.finSeule, true)
  })

  test('une ligne plus haute que la feuille passe quand même', () => {
    const r = repartirLignes([80, 10], sansTitre(2), { premiere: 50, suivantes: 50, fin: 0 })
    assert.deepEqual(r.pages, [[0], [1]])
  })

  test('aucune ligne : une feuille', () => {
    assert.deepEqual(repartirLignes([], [], { premiere: 50, suivantes: 50, fin: 10 }).pages, [[]])
  })
})

describe('échéances dans les PDF', () => {
  test('texte foncé sur une couleur claire, blanc sur une couleur foncée', () => {
    assert.equal(couleurTexteSur('#F2C94C'), '#1F1B17')
    assert.equal(couleurTexteSur('#7C3AED'), '#FFFFFF')
    assert.equal(couleurTexteSur('#E8602C'), '#FFFFFF')
    assert.equal(couleurTexteSur('pas une couleur'), '#FFFFFF')
  })

  test('deux étiquettes trop proches passent sur deux lignes, éloignées sur une', () => {
    const lignes = (html) => [...html.matchAll(/top:([\d.]+)mm;left:1.2mm/g)].map(m => Number(m[1]))
    const jalon = (label) => ({ label, couleur: '#E8602C' })
    // 30 mm d'écart : un titre court tient, un titre long déborde sur le suivant
    const courts = bandeEcheances([{ jalon: jalon('OPR'), x: 50 }, { jalon: jalon('DCE'), x: 80 }], 400, '#E8602C')
    assert.deepEqual(lignes(courts), [0, 0])
    const longs = bandeEcheances([{ jalon: jalon('Réception des offres entreprises'), x: 50 }, { jalon: jalon('DCE'), x: 80 }], 400, '#E8602C')
    assert.deepEqual(lignes(longs), [0, 4.6])
    assert.ok(largeurEtiquetteMm('Réception des offres entreprises') > 30)
  })

  test('le trait passe devant les barres et derrière les noms des tâches', () => {
    let html = ''
    globalThis.window.open = () => ({ document: { write: (h) => { html = h }, close: () => {} } })
    generatePlanningChantierPdf({
      tasks: [{ id: 1, nom: 'Gros œuvre', debut: '2026-03-02', duree: 10, lot_id: 7 }],
      lots: [{ id: 7, num_lot: '01', nom: 'GO', couleur: '#2A8A4E', ordre: 0 }],
      jalons: [{ id: 1, date: '2026-03-04', label: 'Rendu', couleur: '#7C3AED' }],
      affaire: { nom: 'Essai' }, dateDebut: '2026-03-02', dateFin: '2026-03-20', largeurMm: 420, hauteurMm: 297,
    })
    const corps = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'))
    const z = (motif) => Number(corps.match(motif)[1])
    const trait = z(/data-echeance="1" style="[^"]*z-index:(\d+)/)
    assert.ok(trait > z(/data-type="task" style="[^"]*z-index:(\d+)/), 'devant la barre')
    assert.ok(trait < z(/white-space:nowrap;font-size:[\d.]+pt;color:#1F1B17;z-index:(\d+)/), 'derrière le nom')
    // La ligne de titre du lot est traversée aussi, sous son texte
    assert.match(corps, /<span style="position:relative;z-index:10">01 – GO<\/span><div data-echeance="1"/)
  })
})

describe('libellé de l’aperçu', () => {
  test('feuilles et réduction', () => {
    assert.equal(libelleApercu({ pages: 1, reduction: 1 }), '1 feuille')
    assert.equal(libelleApercu({ pages: 3, reduction: 0.996 }), '3 feuilles')
    assert.equal(libelleApercu({ pages: 1, reduction: 0.66 }), '1 feuille · réduit à 66 %')
    assert.equal(libelleApercu(null), '')
  })
})

describe('script de mise en page', () => {
  test('le texte envoyé dans la page est du JavaScript valide', () => {
    for (const apercu of [true, false]) {
      for (const uneFeuille of [true, false]) {
        assert.doesNotThrow(() => new Function(scriptMiseEnPage({ largeurMm: 420, hauteurMm: 297, uneFeuille, apercu })))
      }
    }
  })
})

describe('pages produites', () => {
  const paramsChantier = (extra = {}) => ({
    tasks: [], lots: [], jalons: [], affaire: { nom: 'Essai' },
    dateDebut: '2026-03-02', dateFin: '2026-03-20', largeurMm: 420, hauteurMm: 297, ...extra,
  })
  const paramsEtude = (extra = {}) => ({
    phases: [], jalons: [], affaire: { nom: 'Essai' },
    semaineDebut: 8, anneeDebut: 2026, semaineFin: 12, anneeFin: 2026,
    largeurMm: 420, hauteurMm: 297, ...extra,
  })
  const scripts = (html) => html.slice(html.lastIndexOf('<script>'))

  test('l’aperçu n’imprime pas : il envoie sa hauteur, ses feuilles et sa réduction', () => {
    for (const html of [htmlApercuChantier(paramsChantier()), htmlApercuEtude(paramsEtude())]) {
      assert.ok(!html.includes('window.print'))
      assert.match(html, /parent\.postMessage\(\{ apercuPlanning: true, hauteur: [^,]+, pages: resultat\.pages, reduction: resultat\.reduction \}/)
      // La marge de la feuille, qui n'existe qu'à l'impression, entoure chaque feuille
      assert.match(html, /\.feuille \{ box-sizing: content-box; padding: 10mm;/)
    }
  })

  test('une seule feuille par défaut, plusieurs sur demande', () => {
    assert.match(scripts(htmlApercuChantier(paramsChantier())), /uneFeuille: true/)
    assert.match(scripts(htmlApercuChantier(paramsChantier({ uneFeuille: false }))), /uneFeuille: false/)
    assert.match(scripts(htmlApercuEtude(paramsEtude({ uneFeuille: false }))), /uneFeuille: false/)
  })

  test('chaque feuille est son propre plan : les fonds des périodes restent visibles', () => {
    // Sans z-index, le fond blanc de la feuille (aperçu) recouvrait les fonds
    // de période posés sous la grille (z-index -1)
    for (const html of [htmlApercuChantier(paramsChantier()), htmlApercuEtude(paramsEtude())]) {
      assert.match(html, /\.feuille \{ position: relative; z-index: 0;/)
    }
  })

  test('la flèche d’une échéance se place en % du tableau, comme les colonnes qui s’étirent', () => {
    const jalons = [{ id: 1, date: '2026-03-11', label: 'Rendu', couleur: '#E8602C' }]
    const html = htmlApercuChantier(paramsChantier({ jalons }))
    // 9e jour sur 19, colonne de libellés de 45 mm comprise
    assert.match(html, /<div style="position:absolute;left:\d+\.\d{4}%;top:0;bottom:0;width:0">/)
    const etude = htmlApercuEtude(paramsEtude({ jalons: [{ id: 1, semaine: 10, annee: 2026, label: 'Rendu' }] }))
    assert.match(etude, /<div style="position:absolute;left:\d+\.\d{4}%;top:0;bottom:0;width:0">/)
  })

  test('chantier : toutes les largeurs du tableau suivent l’étirement des colonnes', () => {
    // Sur une feuille, la page élargit le tableau : ses colonnes s'étirent.
    // Une barre en mm fixes s'arrêtait alors au milieu de sa dernière semaine.
    const tache = { id: 1, nom: 'Gros œuvre', debut: '2026-03-04', duree: 5, lot_id: 7 }
    const html = htmlApercuChantier(paramsChantier({
      tasks: [tache], lots: [{ id: 7, num_lot: '01', nom: 'GO', couleur: '#E8602C', ordre: 0 }],
      periodes: [{ date_debut: '2026-03-09', date_fin: '2026-03-13', couleur: '#B8412C' }],
      viewMode: 'week',
    }))
    assert.match(html, /data-largeur-mm="400\.00"/)
    const corps = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'))
    assert.ok(!/(width|left):[\d.]+mm/.test(corps), 'une largeur du tableau est restée en mm fixes')
    assert.match(corps, /data-type="task" style="position:absolute;left:0;width:calc\([\d.]+mm \* var\(--k, 1\)\)/)
    assert.match(corps, /data-periode="1" style="position:absolute;left:0;top:0;bottom:0;width:calc\(/)
    assert.match(scripts(html), /setProperty\('--k'/)
  })

  test('le chantier trace ses flèches feuille par feuille', () => {
    assert.match(scripts(htmlApercuChantier(paramsChantier())), /fleches: dessinerFleches/)
  })

  test('le PDF imprimé, lui, ouvre l’impression', () => {
    let html = ''
    globalThis.window.open = () => ({ document: { write: (h) => { html = h }, close: () => {} } })
    generatePlanningChantierPdf(paramsChantier())
    assert.ok(html.includes('window.print()'))
    assert.ok(!html.includes('postMessage'))
  })
})
