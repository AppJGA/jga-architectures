// État des lieux, rapport : tableaux par niveau (une ligne par pièce, statuts
// des matériaux), chiffres clés et points d'attention. Affaire, pièces et
// relevés inventés : aucun plan ni nom réel dans le dépôt (public). Les
// éléments passent par le vrai `elementsAExporter` (export DXF).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { elementsAExporter } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { numeroterPhotos } from '../src/modules/etude/etat-des-lieux/export/numerotationEdl.js'
import pdfmake from 'pdfmake'
import { PDFDocument } from 'pdf-lib'
import { LIGNES_PAR_RANGEE, definitionTableauxEdl, etiquetteStatut, rangeesDeLigne } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import {
  comptesLignes, ligneHorsPieces, lignesTableau, syntheseRapport, tableauxDuRapport, texteComptes, tronquer,
} from '../src/modules/etude/etat-des-lieux/export/tableauxEdlLogique.js'

const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]]

const niveaux = [{ id: 'n1', nom: 'RDC', ordre: 0 }, { id: 'n2', nom: 'R+1', ordre: 1 }]
const pieces = [
  {
    id: 'p1', niveau_id: 'n1', ordre: 0, numero: '01', nom: 'Séjour', contour: carre(0, 0, 5), surface_lue: 25, hsp_lue: 2.5,
    fiche: {
      sol: 'Parquet chêne', plinthes: 'Bois peint', murs: 'Papier peint décollé', plafond: '', hsp: '', remarques: 'Odeur de renfermé.',
      porte: { huisserie: 'bois', vantail: 'isoplane', quincaillerie: '' },
      statuts: { sol: 'conserver', plinthes: 'rafraichir', murs: 'deposer', plafond: 'deposer', porte: 'rafraichir' },
    },
  },
  { id: 'p2', niveau_id: 'n1', ordre: 1, numero: '02', nom: 'Cuisine', contour: carre(5, 0, 3), fiche: { sol: 'Carrelage', murs: 'Faïence' } },
  { id: 'p3', niveau_id: 'n1', ordre: 2, numero: '03', nom: 'Cellier', contour: carre(8, 0, 2), fiche: {} },
  {
    id: 'p4', niveau_id: 'n2', ordre: 0, numero: '11', nom: 'Chambre', contour: carre(0, 0, 4), fiche_a_valider: true,
    fiche: { sol: 'Moquette proposée', statuts: { sol: 'deposer' }, porte: { huisserie: 'métallique' } },
  },
]
const point = (id, piece, numero, niveau = 'n1', type = null) => ({ id, niveau_id: niveau, piece_id: piece, numero, x: numero, y: 1, type })
const points = [
  point('pt1', 'p1', 1, 'n1', 'prise'),
  point('pt2', 'p1', 2),
  point('pt3', 'p1', 3),
  point('pt4', 'p1', 4),
  point('pt5', 'p1', 5), // ni type ni élément
  point('pt6', 'p2', 6),
  { ...point('pt7', null, 7), x: 30 }, // hors des pièces
  point('pt8', 'p4', 8, 'n2'),
]
const ligne = (id, piece, pointId, calque, type, libelle, cotes = null, aValider = false) => ({
  id, piece_id: piece, point_id: pointId, calque, type, libelle, cotes, a_valider: aValider,
})
const elements = [
  ligne('e2', 'p1', 'pt2', 'electricite', 'prise', 'Prise triple', 'h 0,30'),
  ligne('e3', 'p1', 'pt3', 'desordres', 'fissure', 'Fissure en plafond', '40 cm'),
  ligne('e4', 'p1', 'pt4', 'chauffage', 'radiateur', 'Sèche-serviettes'),
  ligne('e6', 'p2', 'pt6', 'plomberie', null, 'Arrivée d’eau en attente', null, true),
  ligne('e7', null, 'pt7', 'compteurs', 'compteur-eau', 'Compteur d’eau'),
  ligne('e8', 'p4', 'pt8', 'desordres', 'humidite', 'Tache d’humidité'),
]
const exporter = (inclurePropositions) => elementsAExporter({ pieces, points, elements, inclurePropositions })
const photos = numeroterPhotos([
  { id: 'ph1', point_id: 'pt1', prise_le: '2026-11-17T10:01:00Z' },
  { id: 'ph2', point_id: 'pt3', prise_le: '2026-11-17T10:02:00Z' },
  { id: 'ph3', point_id: 'pt5', prise_le: '2026-11-17T10:03:00Z' },
  { id: 'ph4', point_id: 'pt7', prise_le: '2026-11-17T10:04:00Z' },
], points, { niveaux, pieces })

const donnees = (plus = {}) => ({ niveaux, pieces, elementsExport: exporter(true), photos, points, elements, visitees: new Set(), ...plus })

describe('lignes du tableau d’un niveau', () => {
  const { etages } = tableauxDuRapport(donnees({ inclurePropositions: true }))
  const [rdc, r1] = etages
  const [sejour, cuisine] = rdc.lignes

  test('une ligne par pièce visitée, puis « Hors pièces » ; non visitées à part', () => {
    assert.deepEqual(rdc.lignes.map((l) => l.piece.libelle), ['01 Séjour', '02 Cuisine', 'Hors pièces'])
    assert.deepEqual(rdc.nonVisitees.map((p) => p.id), ['p3'])
    assert.equal(rdc.nom, 'RDC')
    assert.deepEqual(sejour.piece, { id: 'p1', designation: 'Séjour', numero: '01', libelle: '01 Séjour', surface: '25 m²', hsp: '2,50 m' })
  })

  test('sol puis plinthes, murs, plafond, avec leur statut ; rubrique vide = []', () => {
    assert.deepEqual(sejour.sol, [
      { texte: 'Parquet chêne', statut: 'conserver', rubrique: 'sol' },
      { texte: 'Plinthes : Bois peint', statut: 'rafraichir', rubrique: 'plinthes' },
    ])
    assert.deepEqual(sejour.mur, [{ texte: 'Papier peint décollé', statut: 'deposer', rubrique: 'murs' }])
    assert.deepEqual(sejour.plafond, [], 'statut d’une rubrique vide ignoré')
    assert.deepEqual(cuisine.sol, [{ texte: 'Carrelage', statut: 'a-preciser', rubrique: 'sol' }])
  })

  test('bloc porte : parties et statut, null si rien', () => {
    assert.deepEqual(sejour.porte, { huisserie: 'bois', vantail: 'isoplane', quincaillerie: '', texte: 'huisserie bois, vantail isoplane', statut: 'rafraichir' })
    assert.equal(cuisine.porte, null)
  })

  test('équipements : une ligne par type, libellé et cotes, « ×n », cotes et « Ph n » ; désordres et remarques à part', () => {
    assert.deepEqual(sejour.equipements.map((e) => e.texte), [
      'Prise de courant · Ph 1',
      'Prise triple ×3 · h 0,30',
      'Sèche-serviettes',
    ])
    assert.deepEqual(sejour.particuliers.map((p) => [p.sorte, p.texte]), [
      ['desordre', 'Fissure en plafond · 40 cm · Ph 2'],
      ['remarque', 'Odeur de renfermé.'],
      ['point', 'P5 (point sans élément) · Ph 3'],
    ])
    assert.deepEqual(cuisine.equipements, [{ texte: 'Arrivée d’eau en attente', aValider: true, sorte: 'equipement' }])
  })

  test('regroupement : même type, même libellé (vide ou générique = celui du type), mêmes cotes', () => {
    const el = (id, type, libelle, cotes = null) => ({ id, pieceId: 'p2', pointId: null, calque: 'electricite', type, libelle, cotes, x: 6, y: 1 })
    const [l] = lignesTableau({
      pieces: [pieces[1]], points: [], photos: [], sansElement: [],
      elementsExport: [
        el('a', 'prise', ''), el('b', 'prise', 'Prise'), el('c', 'prise', 'prise de courant'),
        el('d', 'prise', 'Prise double', 'h 0,30'), el('e', 'prise', 'Prise double', 'h 0,30'), el('f', 'prise', 'Prise double', 'h 1,10'),
        el('g', 'interrupteur', 'Interrupteur'),
      ],
    })
    assert.deepEqual(l.equipements.map((e) => e.texte), [
      'Prise de courant ×3', 'Prise double ×4 · h 0,30', 'Prise double ×2 · h 1,10', 'Interrupteur',
    ])
  })

  test('ligne « Hors pièces » : équipements et points particuliers seulement', () => {
    const hors = rdc.lignes.at(-1)
    assert.equal(hors.hors, true)
    assert.deepEqual([hors.sol, hors.mur, hors.plafond, hors.porte], [[], [], [], null])
    assert.deepEqual(hors.equipements.map((e) => e.texte), ['Compteur d’eau · Ph 4'])
    assert.equal(ligneHorsPieces({ elements: [], sansElement: [], photos: [] }), null)
  })

  test('fiche proposée : incluse marquée « à valider », écartée sinon (règle du DXF)', () => {
    assert.equal(r1.lignes[0].ficheAValider, true)
    assert.deepEqual(r1.lignes[0].sol, [{ texte: 'Moquette proposée', statut: 'deposer', rubrique: 'sol' }])
    const sans = tableauxDuRapport(donnees({ elementsExport: exporter(false) })).etages
    const chambre = sans[1].lignes[0]
    assert.deepEqual([chambre.sol, chambre.porte, chambre.ficheAValider], [[], null, false])
    // La proposition exclue laisse son point cité
    assert.ok(sans[0].lignes[1].particuliers.some((p) => p.texte === 'P6 (élément à valider)'))
    assert.deepEqual(sans[0].lignes[1].equipements, [])
  })

  test('photo d’un point sans élément ni point cité : jamais perdue', () => {
    const [l] = lignesTableau({ pieces: [pieces[1]], elementsExport: [], photos: [{ id: 'x', point_id: 'pt6', numero: 9 }], points, sansElement: [] })
    assert.deepEqual(l.particuliers.map((p) => p.texte), ['Photos : Ph 9'])
  })

  test('comptes du niveau', () => {
    assert.deepEqual(comptesLignes(rdc.lignes), { locaux: 2, renseignees: 6, conserver: 1, rafraichir: 2, deposer: 1, aPreciser: 2, desordres: 1 })
    assert.equal(texteComptes(rdc.lignes), '2 locaux · 1 à déposer · 2 à rafraîchir · 1 à conserver · 2 à préciser · 1 désordre')
  })
})

describe('synthèse : chiffres clés et points d’attention', () => {
  const { etages } = tableauxDuRapport(donnees({ inclurePropositions: true }))

  test('cinq chiffres : pièces (par niveau), à déposer sur décrits, à rafraîchir, à préciser, désordres', () => {
    const { chiffres } = syntheseRapport({ etages })
    assert.deepEqual(chiffres, [
      { valeur: '3', libelle: 'pièces relevées', detail: 'RDC 2 · R+1 1' },
      { valeur: '2', libelle: 'à déposer', detail: 'sur 8 éléments décrits' },
      { valeur: '2', libelle: 'à rafraîchir' },
      { valeur: '3', libelle: 'à préciser' },
      { valeur: '2', libelle: 'désordres relevés' },
    ])
  })

  test('points d’attention par thème, niveau nommé devant son premier élément', () => {
    const { attention } = syntheseRapport({ etages })
    assert.deepEqual(attention.map((a) => a.titre), ['Désordres', 'À déposer', 'À vérifier'])
    assert.equal(attention[0].texte, 'RDC — 01 Séjour : Fissure en plafond ; R+1 — 11 Chambre : Tache d’humidité')
    assert.equal(attention[1].texte, 'RDC — 01 Séjour : murs (Papier peint décollé) ; R+1 — 11 Chambre : sol (Moquette proposée)')
    assert.equal(attention[2].texte, 'RDC — 02 Cuisine : sol, murs ; R+1 — 11 Chambre : bloc porte')
  })

  test('lignes reçues à part (tableau parallèle ou Map) ; un seul niveau : pas de préfixe', () => {
    const nus = etages.map(({ lignes, ...reste }) => reste)
    const parTableau = syntheseRapport({ etages: nus, lignes: etages.map((e) => e.lignes) })
    assert.deepEqual(parTableau, syntheseRapport({ etages }))
    const parMap = syntheseRapport({ etages: nus.slice(0, 1), lignes: new Map([['n1', etages[0].lignes]]) })
    assert.equal(parMap.attention[0].texte, '01 Séjour : Fissure en plafond')
    assert.equal(parMap.chiffres[0].detail, undefined)
  })

  test('textes tronqués proprement, « et n autres », jamais plus de 5 entrées', () => {
    const beaucoup = Array.from({ length: 40 }, (_, i) => ({
      piece: { libelle: `${i} Pièce au nom assez long pour remplir` }, sol: [], mur: [], plafond: [], porte: null, equipements: [],
      particuliers: [{ sorte: 'desordre', libelle: 'Fissure traversante sur toute la hauteur du mur porteur côté rue, à surveiller de près', texte: '' }],
    }))
    const { attention } = syntheseRapport({ etages: [{ niveau: { id: 'n', nom: 'RDC' }, lignes: beaucoup }] })
    assert.ok(attention.length <= 5)
    assert.ok(attention[0].texte.length <= 330, attention[0].texte)
    assert.match(attention[0].texte, /; et \d+ autres$/)
    assert.ok(attention[0].texte.includes('…'))
    assert.deepEqual(syntheseRapport({ etages: [] }).attention, [])
  })

  test('tronquer : à un espace, sans ponctuation pendante', () => {
    assert.equal(tronquer('court', 10), 'court')
    assert.equal(tronquer('Fissure traversante, sur le mur', 22), 'Fissure traversante…')
  })
})

describe('étiquettes de statut (PDF)', () => {
  test('cerne plein, pointillé ou tireté ; « Déposer » blanc sur fond', () => {
    const style = (code) => etiquetteStatut(code).layout.hLineStyle()
    assert.equal(style('conserver'), null)
    assert.ok(style('rafraichir').dash.length < style('a-preciser').dash.length)
    const cellule = (code) => etiquetteStatut(code).table.body[0][0]
    assert.deepEqual([cellule('deposer').text, cellule('deposer').color, cellule('deposer').fillColor], ['DÉPOSER', '#FFFFFF', '#B9481B'])
    assert.equal(cellule('conserver').fillColor, undefined)
    assert.equal(cellule('inconnu').text, 'À PRÉCISER')
    assert.equal(etiquetteStatut('rafraichir').layout.hLineColor(), '#B7700A')
  })
})

describe('pièce aux très nombreux relevés : rangées « (suite) »', () => {
  const beaucoup = () => {
    const piece = { id: 'pg', niveau_id: 'n1', ordre: 0, numero: '01', nom: 'Grand hall', contour: carre(0, 0, 20), fiche: { sol: 'Carrelage', remarques: 'Remarque '.repeat(40) } }
    const pts = Array.from({ length: 80 }, (_, i) => ({ id: `q${i}`, niveau_id: 'n1', piece_id: 'pg', numero: i + 1, x: 1 + (i % 15), y: 1 + Math.floor(i / 15), type: null }))
    const els = pts.map((p, i) => ({
      id: `f${i}`, piece_id: 'pg', point_id: p.id, a_valider: false,
      ...(i < 60
        ? { calque: 'electricite', type: 'prise', libelle: `Prise de courant repérée ${i}`, cotes: `h 0,${10 + i}` }
        : { calque: 'desordres', type: 'fissure', libelle: `Fissure relevée en partie ${i} du mur, ouverte de quelques millimètres` }),
    }))
    return { niveaux: [niveaux[0]], pieces: [piece], points: pts, elements: els, elementsExport: elementsAExporter({ pieces: [piece], points: pts, elements: els }), photos: [], visitees: null }
  }

  test('la ligne se découpe, chaque rangée tient dans le budget, la première porte la pièce', () => {
    const { etages } = tableauxDuRapport(beaucoup())
    const [ligne] = etages[0].lignes
    assert.equal(ligne.equipements.length, 60)
    assert.equal(ligne.particuliers.length, 21)
    const rangees = rangeesDeLigne(ligne)
    assert.ok(rangees.length >= 2, `${rangees.length} rangées`)
    assert.equal(rangees[0].suite, undefined)
    assert.ok(rangees.slice(1).every((r) => r.suite && r.porte === null && r.sol.length === 0))
    // Rien de perdu, dans l'ordre
    assert.deepEqual(rangees.flatMap((r) => r.equipements), ligne.equipements)
    assert.deepEqual(rangees.flatMap((r) => r.particuliers), ligne.particuliers)
    for (const r of rangees) {
      const lignes = (items, car) => items.reduce((n, it) => n + Math.ceil(it.texte.length / car) + 0.3, 0)
      assert.ok(lignes(r.equipements, 42) <= LIGNES_PAR_RANGEE && lignes(r.particuliers, 40) <= LIGNES_PAR_RANGEE)
    }
    // Une ligne ordinaire reste entière
    assert.equal(rangeesDeLigne(tableauxDuRapport(donnees()).etages[0].lignes[0]).length, 1)
  })

  test('un texte seul plus long que la rangée est coupé entre deux mots', () => {
    const texte = 'mot '.repeat(1200).trim()
    const rangees = rangeesDeLigne({ piece: {}, sol: [], mur: [], plafond: [], porte: null, equipements: [], particuliers: [{ texte, sorte: 'remarque' }] })
    assert.ok(rangees.length >= 2)
    assert.equal(rangees.flatMap((r) => r.particuliers.map((p) => p.texte)).join(' '), texte)
  })

  test('rendu réel par pdfmake (Node) : le PDF se construit, en peu de pages A3', async () => {
    const f = new URL('../node_modules/pdfmake/fonts/Roboto/', import.meta.url).pathname
    pdfmake.setFonts({ Roboto: { normal: `${f}Roboto-Regular.ttf`, bold: `${f}Roboto-Medium.ttf`, italics: `${f}Roboto-Italic.ttf`, bolditalics: `${f}Roboto-MediumItalic.ttf` } })
    pdfmake.setUrlAccessPolicy?.(() => false)
    pdfmake.setLocalAccessPolicy?.(() => true)
    const def = definitionTableauxEdl({ ...beaucoup(), affaire: { nom: 'Essai' }, date: '2026-11-19' })
    const corps = def.content.find((n) => n.id === 'niveau-n1').stack.find((n) => n.table).table.body
    assert.ok(corps.length >= 3, 'en-tête + au moins deux rangées')
    assert.ok(JSON.stringify(corps[2][0]).includes('(suite)'))
    const doc = await PDFDocument.load(await pdfmake.createPdf(def).getBuffer())
    assert.ok(doc.getPageCount() >= 1 && doc.getPageCount() <= 4, `${doc.getPageCount()} pages`)
    for (const page of doc.getPages()) assert.deepEqual(Object.values(page.getSize()).map(Math.round), [1191, 842])
  })
})
