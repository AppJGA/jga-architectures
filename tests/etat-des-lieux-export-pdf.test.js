// État des lieux, lot 4 (export) : rapport PDF (garde, tableaux par niveau, annexe photos).
// Affaire, pièces et relevés inventés : aucun plan ni nom réel dans le dépôt (public).
// Les éléments exportés sont fabriqués par le vrai `elementsAExporter` (export
// DXF) : le contrat entre les deux exports est exercé, pas imité.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { elementsAExporter } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { dxfDuNiveau, preparerExport } from '../src/modules/etude/etat-des-lieux/export/exportFenetreLogique.js'
import { lireDxf } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'
import { decalagesSymboles } from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'
import { numeroterPhotos } from '../src/modules/etude/etat-des-lieux/export/numerotationEdl.js'
import {
  definitionGardeEdl, definitionPhotosEdl, definitionTableauxEdl, etagesDuRapport, groupesElements, hspPiece, HORS_LATIN, nombreFr, nomFichierRapportEdl,
  pieceVisitee, piedRapportEdl, pointsSansElement, relevesHorsPieces, surfacePiece, texteLatin,
} from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import {
  agrandir, cadragePiece, cadragePlan, dessinerPlanRapport, echelleSymbole, marquesElements, placementFond,
  vecteursDuCadrage, PX_PLAN_ETAGE, PX_PLAN_PIECE, PX_SYMBOLE_MIN,
} from '../src/modules/etude/etat-des-lieux/export/planRapportEdl.js'

const proche = (a, b, ecart = 1e-9) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]]

const affaire = { code_affaire: '9901', nom: 'Maison de l’essai', projet_adresse: '1 rue Imaginaire', projet_commune: 'Villefictive', moa_nom: 'Maître d’ouvrage inventé' }
const niveaux = [
  { id: 'n2', nom: 'R+1', ordre: 1, cadrage: { x0: 0, y0: 0, x1: 20, y1: 20, pxParMetre: 100, largeur: 2000, hauteur: 2000 } },
  { id: 'n1', nom: 'RDC', ordre: 0, cadrage: { x0: 0, y0: 0, x1: 20, y1: 20, pxParMetre: 100, largeur: 2000, hauteur: 2000 } },
]
const pieces = [
  { id: 'p1', niveau_id: 'n1', ordre: 0, numero: '01', nom: 'Séjour', contour: carre(0, 0, 5), surface_lue: 25, hsp_lue: 2.5, fiche: { sol: 'Parquet chêne', murs: 'Peinture blanche', plafond: '', plinthes: 'Bois', hsp: '', remarques: 'Fissure au droit de la fenêtre → à surveiller ✓' }, analyse_le: '2026-11-17T10:00:00Z' },
  { id: 'p2', niveau_id: 'n1', ordre: 1, numero: '02', nom: 'Salle d’eau', contour: carre(5, 0, 3), surface_lue: null, fiche: {} },
  { id: 'p3', niveau_id: 'n1', ordre: 2, numero: '03', nom: 'Cellier', contour: carre(8, 0, 2), fiche: {} },
  { id: 'p4', niveau_id: 'n2', ordre: 0, numero: '11', nom: 'Chambre', contour: carre(0, 0, 4), fiche: { hsp: '2,45 m' } },
]
const point = (id, piece, numero, x, y, type = null) => ({ id, niveau_id: 'n1', piece_id: piece, numero, x, y, type })
const points = [
  point('pt1', 'p1', 1, 1, 1, 'prise'),
  point('pt2', 'p1', 2, 2, 4.8),
  point('pt3', 'p1', 3, 4, 1),
  point('pt4', 'p1', 4, 2.5, 2.5), // ni type ni élément
  point('pt5', 'p2', 5, 6, 1),
  point('pt6', 'p1', 6, 3, 3), // élément d'un calque inconnu, écarté de l'export
  point('pt7', 'p1', 7, 0.5, 0.5, 'interrupteur'), // typé sans élément : exporté de son type
  point('pt8', 'p2', 8, 7, 2), // seule une proposition
]
const ligne = (id, piece, pointId, calque, type, libelle, cotes = null, aValider = false) => ({
  id, piece_id: piece, point_id: pointId, calque, type, libelle, cotes, a_valider: aValider,
})
const elements = [
  ligne('e1', 'p1', 'pt1', 'electricite', 'prise', 'Prise double', 'h 0,30'),
  ligne('e2', 'p1', 'pt2', 'menuiseries', 'fenetre', '', '1,20 × 1,35'),
  ligne('e3', 'p1', 'pt3', 'plomberie', null, 'Arrivée d’eau en attente', null, true),
  ligne('e4', 'p2', 'pt5', 'plomberie', 'lavabo', 'Lavabo'),
  ligne('e5', 'p2', null, 'chauffage', 'radiateur', 'Sèche-serviettes'),
  ligne('e6', 'p1', 'pt6', 'inconnu', null, 'Chose'),
  ligne('e7', 'p2', 'pt8', 'desordres', 'humidite', 'Trace d’humidité', null, true),
]
const exporter = (inclurePropositions) => elementsAExporter({ pieces, points, elements, inclurePropositions })
const elementsExport = exporter(true)
const photos = [
  { id: 'ph1', point_id: 'pt1', chemin: 'a/edl/photos/ph1.webp', prise_le: '2026-11-17T10:01:00Z' },
  { id: 'ph2', point_id: 'pt5', chemin: 'a/edl/photos/ph2.webp', prise_le: '2026-11-17T10:05:00Z' },
  { id: 'ph3', point_id: 'pt4', chemin: 'a/edl/photos/ph3.webp', prise_le: '2026-11-17T10:03:00Z' },
]
const IMG = 'data:image/jpeg;base64,AAAA'
const images = {
  logo: IMG,
  plans: new Map([['n1', IMG], ['n2', IMG]]),
  pieces: new Map([['p1', IMG]]),
  photos: new Map([['ph1', IMG], ['ph2', IMG], ['ph3', IMG]]),
}

// Le PDF hors planches : la garde, les tableaux par niveau (A3 paysage), puis
// l'annexe des photos (les planches A3 sont dessinées et posées par l'assemblage)
function rapportPdf(d) {
  const garde = definitionGardeEdl(d)
  const tableaux = definitionTableauxEdl(d)
  const photos = definitionPhotosEdl(d)
  return { garde, tableaux, photos, content: [...garde.content, ...(tableaux?.content ?? []), ...(photos?.content ?? [])] }
}

const donnees = (plus = {}) => ({
  affaire, niveaux, pieces, elementsExport, photos, points, elements,
  visitees: new Set(['p2']), images, redacteur: 'Rédacteur Inventé', date: '2026-11-18', ...plus,
})

// Tous les textes d'une description pdfmake, à toute profondeur
function textes(noeud, acc = []) {
  if (typeof noeud === 'string') acc.push(noeud)
  else if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, acc))
  else if (noeud && typeof noeud === 'object') {
    for (const [k, v] of Object.entries(noeud)) {
      if (k === 'text' || k === 'stack' || k === 'columns' || k === 'table' || k === 'body' || k === 'content') textes(v, acc)
    }
  }
  return acc
}
const texteDe = (n) => textes(n).join(' ')

// Lignes du tableau d'un niveau (sans l'en-tête), chacune en texte par cellule
function lignesDuNiveau(def, niveauId) {
  const bloc = def.tableaux.content.find((n) => n.id === `niveau-${niveauId}`)
  const tableau = bloc.stack.find((n) => n.table?.headerRows === 1)
  return tableau ? tableau.table.body.slice(1).map((cellules) => cellules.map(texteDe)) : []
}

describe('rapport PDF et DXF : mêmes fiches, même HSP, mêmes photos', () => {
  // Cas de la relecture : fiche proposée par l'analyse, HSP lue, point sans
  // `piece_id` et photo, passés par `preparerExport` comme dans la fenêtre
  const donneesFenetre = (plus = {}) => ({
    niveaux: [{ id: 'n1', nom: 'RDC', ordre: 0, unites_par_metre: 100 }],
    pieces: [{ id: 'p1', niveau_id: 'n1', nom: 'Chambre', contour: carre(0, 0, 4), fiche_a_valider: true, fiche: { sol: 'Moquette proposée', hsp: '2,70' }, hsp_lue: 2.5 }],
    points: [{ id: 'pt1', niveau_id: 'n1', piece_id: null, numero: 3, x: 1, y: 1, type: null }],
    photos: [{ id: 'ph1', point_id: 'pt1', chemin: 'x' }],
    elements: [{ id: 'e1', point_id: 'pt1', piece_id: null, type: 'prise', calque: 'electricite', libelle: 'Prise', a_valider: false }],
    entrees: [],
    ...plus,
  })
  const exporterLesDeux = (d, inclurePropositions = false) => {
    const prep = preparerExport(d, { niveaux: ['n1'], inclurePropositions, rapport: true })
    const pdf = texteDe({ stack: rapportPdf({ ...prep.rapport, images: { photos: new Map([['ph1', IMG]]) } }).content })
    const dxf = lireDxf(dxfDuNiveau(prep.etages[0], { inclurePropositions })).textes.map((t) => t.texte).join(' | ')
    return { prep, pdf, dxf }
  }

  test('fiche proposée écartée des deux côtés ; HSP lue « 2,50 m » des deux côtés', () => {
    const { pdf, dxf } = exporterLesDeux(donneesFenetre())
    assert.equal(pdf.includes('Moquette'), false)
    assert.equal(dxf.includes('Moquette'), false)
    assert.ok(pdf.includes('2,50 m') && !pdf.includes('2,70'), pdf)
    assert.ok(dxf.includes('HSP 2,50 m') && !dxf.includes('2,70'), dxf)
  })

  test('fiche proposée incluse : imprimée des deux côtés, HSP lue toujours en tête', () => {
    const { pdf, dxf } = exporterLesDeux(donneesFenetre(), true)
    assert.ok(pdf.includes('Moquette proposée') && dxf.includes('Moquette proposée'))
    assert.ok(pdf.includes('Fiche proposée, à valider'))
    assert.ok(pdf.includes('2,50 m') && dxf.includes('HSP 2,50 m'))
  })

  test('pièce dont la seule trace est une fiche proposée écartée : pas de ligne, citée non visitée', () => {
    const prep = preparerExport(donneesFenetre({ points: [], photos: [], elements: [] }), { niveaux: ['n1'], rapport: true })
    const r = rapportPdf({ ...prep.rapport, images: {} })
    assert.deepEqual(lignesDuNiveau(r, 'n1'), [])
    assert.ok(texteDe(r.tableaux.content).includes('Pièces non visitées (1) :  Chambre'), texteDe(r.tableaux.content))
    assert.equal(r.photos, null)
    const garde = r.garde.content[0].stack.find((n) => n.table?.headerRows === 1)
    assert.deepEqual(garde.table.body[1].slice(1).map((c) => c.text), ['1', '0', '0'])
  })

  test('point sans piece_id dans une pièce : rattaché des deux côtés, « Ph 1 » des deux côtés', () => {
    const { prep, pdf, dxf } = exporterLesDeux(donneesFenetre())
    assert.equal(prep.rapport.points[0].piece_id, 'p1')
    assert.equal(prep.etages[0].points[0].piece_id, 'p1')
    assert.ok(pdf.includes('Ph 1'), pdf)
    assert.ok(dxf.includes('Ph 1'), dxf)
  })

  test('point hors de toute pièce : ligne « Hors pièces », « Ph 1 » des deux côtés, compté sur la garde', () => {
    const d = donneesFenetre({ points: [{ id: 'pt1', niveau_id: 'n1', piece_id: null, numero: 3, x: 6, y: 1, type: null }] })
    const prep = preparerExport(d, { niveaux: ['n1'], rapport: true })
    assert.equal(prep.rapport.points[0].piece_id, null)
    const def = rapportPdf({ ...prep.rapport, images: { photos: new Map([['ph1', IMG]]) } })
    const lignes = lignesDuNiveau(def, 'n1')
    const hors = lignes.at(-1)
    assert.ok(hors[0].includes('Hors pièces'), hors.join(' | '))
    assert.ok(hors[5].includes('Prise de courant · Ph 1'), hors[5])
    assert.ok(texteDe(def.photos.content).includes('Ph 1 · Hors pièces · P3 · Prise'))
    // La garde compte l'élément posé hors pièce
    const garde = def.content[0].stack.find((n) => n.table?.headerRows === 1)
    assert.equal(garde.table.body[1][3].text, '1')
    assert.ok(lireDxf(dxfDuNiveau(prep.etages[0])).textes.some((t) => t.texte === 'Ph 1'))
    const r = relevesHorsPieces({ niveauId: 'n1', ...prep.rapport, sansElement: [] })
    assert.deepEqual([r.elements.length, r.photos.length], [1, 1])
  })
})

describe('rapport PDF : structure', () => {
  const def = rapportPdf(donnees())

  test('les éléments viennent bien d’elementsAExporter (pointId, numéro du point)', () => {
    assert.ok(elementsExport.every((e) => 'pointId' in e))
    assert.ok(elementsExport.some((e) => e.id === 'point-pt7' && e.type === 'interrupteur' && e.numero === 7))
    assert.ok(!elementsExport.some((e) => e.id === 'e6'), 'calque inconnu écarté par l’export')
  })

  test('garde, puis un tableau par niveau (dans l’ordre), puis l’annexe des photos', () => {
    assert.deepEqual(def.garde.content.map((n) => n.id), ['garde'])
    assert.deepEqual(def.tableaux.content.map((n) => n.id).filter(Boolean), ['tableaux', 'niveau-n1', 'niveau-n2'])
    assert.equal(def.photos.content[0].id, 'photos')
    const garde = texteDe(def.content[0])
    for (const attendu of ['État des lieux', 'Maison de l’essai', '9901', '1 rue Imaginaire Villefictive', 'Rédacteur Inventé', '18 novembre 2026', 'RDC', 'R+1']) {
      assert.ok(garde.includes(attendu), `garde sans « ${attendu} »`)
    }
  })

  test('formats : garde et photos A4 portrait, tableaux A3 paysage, sans pied pdfmake ; un niveau par page', () => {
    for (const [d, taille, sens] of [[def.garde, 'A4', 'portrait'], [def.tableaux, 'A3', 'landscape'], [def.photos, 'A4', 'portrait']]) {
      assert.equal(d.pageSize, taille)
      assert.equal(d.pageOrientation, sens)
      assert.equal(d.footer, undefined, 'le pied est écrit par l’assemblage')
      assert.ok(d.info.title.includes('Maison de l’essai'))
    }
    const niveaux = def.tableaux.content.filter((n) => n.id?.startsWith('niveau-'))
    assert.equal(niveaux[0].pageBreak, undefined, 'le premier niveau suit la légende')
    assert.equal(niveaux[1].pageBreak, 'before')
    const tableau = niveaux[0].stack.find((n) => n.table?.headerRows === 1)
    assert.equal(tableau.table.dontBreakRows, true, 'une ligne par pièce, insécable')
    assert.deepEqual(tableau.table.body[0].map((c) => c.text), ['PIÈCE', 'SOL', 'MUR', 'PLAFOND', 'BLOC PORTE', 'ÉQUIPEMENTS', 'POINTS PARTICULIERS'])
  })

  test('légende « Lecture du tableau » une fois, note « Sources » à la fin', () => {
    const t = texteDe(def.tableaux.content)
    assert.equal(t.split('LECTURE DU TABLEAU').length, 2)
    for (const s of ['CONSERVER', 'RAFRAÎCHIR', 'DÉPOSER', 'À PRÉCISER']) assert.ok(t.includes(s), s)
    assert.ok(texteDe(def.tableaux.content.at(-1)).startsWith('Sources.'))
  })

  test('pièce non visitée : pas de ligne, citée sous le tableau, décomptée sur la garde', () => {
    const lignes = lignesDuNiveau(def, 'n1')
    assert.ok(!lignes.some((l) => l[0].includes('Cellier')))
    assert.ok(texteDe(def.tableaux.content.find((n) => n.id === 'niveau-n1')).includes('Pièces non visitées (1) :  03 Cellier'))
    const garde = def.content[0].stack.find((n) => n.table?.headerRows === 1)
    assert.deepEqual(garde.table.body[1].map((c) => c.text), ['RDC', '3', '2', '7'])
  })

  test('ligne : nom, surface, HSP, finitions avec statut, « Non décrit », remarques', () => {
    const [sejour, salleDEau] = lignesDuNiveau(def, 'n1')
    assert.match(sejour[0], /01 +Séjour 25 m² · HSP 2,50 m/)
    assert.ok(sejour[1].includes('À PRÉCISER Parquet chêne') && sejour[1].includes('Plinthes : Bois'), sejour[1])
    assert.ok(sejour[2].includes('Peinture blanche'))
    assert.equal(sejour[3], 'Non décrit')
    assert.ok(sejour[6].includes('Fissure au droit de la fenêtre -> à surveiller'), sejour[6])
    assert.ok(salleDEau[0].includes('9 m²'), salleDEau[0])
    assert.ok(lignesDuNiveau(def, 'n2')[0][0].includes('HSP 2,45 m'), 'HSP dite en visite')
  })

  test('équipements regroupés par calque puis par type, cotes et « Ph n » à la suite', () => {
    const sejour = lignesDuNiveau(def, 'n1')[0][5]
    assert.match(sejour, /Arrivée d’eau en attente.*2 prises de courant \(Prise double\) · h 0,30 · Ph 1.*Interrupteur.*Fenêtre · 1,20 × 1,35/)
  })

  test('propositions marquées « à valider »', () => {
    assert.match(lignesDuNiveau(def, 'n1')[0][5], /Arrivée d’eau en attente\s+\(à valider\)/)
    assert.ok(texteDe(def.content[0]).includes('2 éléments marqués « à valider »'))
    assert.ok(lignesDuNiveau(def, 'n1')[1][5].includes('Sèche-serviettes'))
    assert.match(lignesDuNiveau(def, 'n1')[1][6], /Trace d’humidité\s+\(à valider\)/)
  })

  test('points sans élément : par pointId, calque écarté compris, dans les points particuliers', () => {
    const [sejour, salleDEau] = lignesDuNiveau(def, 'n1')
    assert.ok(sejour[6].includes('P4 (point sans élément) · Ph 2'), sejour[6])
    assert.ok(sejour[6].includes('P6 (point sans élément)'))
    assert.ok(!salleDEau[6].includes('point sans élément'), 'P5 porte le lavabo, P8 sa proposition')
  })

  test('propositions exclues : le point reste cité, « (élément à valider) »', () => {
    const sans = rapportPdf(donnees({ elementsExport: exporter(false) }))
    const [sejour, salleDEau] = lignesDuNiveau(sans, 'n1')
    assert.ok(sejour[6].includes('P3 (élément à valider)'))
    assert.ok(!sejour[5].includes('Arrivée d’eau en attente'))
    assert.ok(salleDEau[6].includes('P8 (élément à valider)'))
    assert.ok(!texteDe(sans.content[0]).includes('à valider »'))
    const seuls = pointsSansElement({ points, elements, elementsExport: exporter(false) })
    assert.deepEqual(seuls.map((p) => [p.id, !!p.elementAValider]), [['pt3', true], ['pt4', false], ['pt6', false], ['pt8', true]])
  })

  test('photos en annexe « Ph n · pièce · élément », numérotées comme le DXF, par niveau puis pièce', () => {
    const t = texteDe(def.photos.content)
    assert.ok(t.includes('Annexe — Photos'))
    assert.match(t, /RDC.*01 Séjour.*Ph 1 · 01 Séjour · P1 · Prise double.*Ph 2 · 01 Séjour · P4.*02 Salle d’eau.*Ph 3 · 02 Salle d’eau · P5 · Lavabo/)
    // Numéros reçus (ceux donnés au DXF) : repris tels quels, dans le tableau aussi
    const recues = photos.map((ph, i) => ({ ...ph, numero: 10 + i }))
    const d = rapportPdf(donnees({ photos: recues }))
    assert.ok(texteDe(d.photos.content).includes('Ph 11 · 02 Salle d’eau · P5 · Lavabo'))
    assert.ok(lignesDuNiveau(d, 'n1')[1][5].includes('Lavabo · Ph 11'))
  })

  test('pied de page « Affaire · État des lieux » (complété par l’assemblage de « · page n / N »)', () => {
    assert.equal(piedRapportEdl(affaire), '9901 Maison de l’essai · État des lieux')
    assert.equal(piedRapportEdl(null), 'Affaire · État des lieux')
  })

  test('aucun caractère hors latin courant dans les textes produits', () => {
    const sale = donnees({
      affaire: { ...affaire, nom: 'Essai ▶ 🏠' },
      pieces: pieces.map((p) => (p.id === 'p1' ? { ...p, nom: 'Séjour ✓', fiche: { ...p.fiche, murs: 'Enduit ≈ 2 cm, écaillé' } } : p)),
      elementsExport: elementsExport.map((e) => (e.id === 'e1' ? { ...e, libelle: 'Prise ⚡ 16 A', cotes: '≥ 0,30 m' } : e)),
    })
    const tout = textes(rapportPdf(sale).content)
    assert.deepEqual(tout.filter((t) => t.match(HORS_LATIN)), [])
    assert.ok(tout.some((t) => t.includes('Enduit ~ 2 cm, écaillé')))
    assert.ok(tout.some((t) => t.includes('>= 0,30 m')))
  })

  test('image absente : pas d’annexe photos, pas d’erreur', () => {
    assert.equal(rapportPdf(donnees({ images: {} })).photos, null)
  })

  test('éléments sans pointId (ancienne forme) : la position rattache encore', () => {
    const anciens = elementsExport.map((e) => { const copie = { ...e }; delete copie.pointId; return copie })
    assert.deepEqual(pointsSansElement({ points, elementsExport: anciens }).map((p) => p.id), ['pt4', 'pt6'])
  })

  test('garde : chiffres clés et points d’attention', () => {
    const t = texteDe(def.content[0])
    assert.ok(t.includes('POINTS D’ATTENTION'))
    assert.ok(t.includes('pièces relevées'), t)
    assert.ok(t.includes('Désordres') && t.includes('02 Salle d’eau : Trace d’humidité'), t)
  })
})

describe('rapport PDF : calculs', () => {
  test('texteLatin', () => {
    assert.equal(texteLatin('Mur → fissuré ✓'), 'Mur -> fissuré ')
    assert.equal(texteLatin('Œil-de-bœuf « ok » – 3 €'), 'Œil-de-bœuf « ok » – 3 €')
    assert.equal(texteLatin(null), '')
  })

  test('nombreFr sans espace fine', () => {
    assert.equal(nombreFr(12.5), '12,5')
    assert.equal(nombreFr(1234.567), '1 234,57')
    assert.equal(nombreFr(2.5, 2, { fixe: true }), '2,50')
    assert.equal(nombreFr(12), '12')
  })

  test('surface écrite, sinon mesurée ; HSP lue sur le plan, sinon dite (règle du DXF)', () => {
    assert.deepEqual(surfacePiece({ surface_lue: 12.5, contour: [] }), { texte: '12,5 m²', mesuree: false })
    assert.deepEqual(surfacePiece({ contour: carre(0, 0, 2) }), { texte: '4 m²', mesuree: true })
    assert.equal(surfacePiece({ contour: [] }), null)
    assert.equal(hspPiece({ fiche: { hsp: '2,60' }, hsp_lue: 2.5 }), '2,50 m')
    assert.equal(hspPiece({ fiche: { hsp: '2,60' } }), '2,60 m')
    assert.equal(hspPiece({ fiche: {}, hsp_lue: 2.5 }), '2,50 m')
    assert.equal(hspPiece({}), null)
    // Fiche proposée écartée : sa HSP dite non plus
    assert.equal(hspPiece({ fiche_a_valider: true, fiche: { hsp: '2,60' } }), null)
    assert.equal(hspPiece({ fiche_a_valider: true, fiche: { hsp: '2,60' } }, { inclurePropositions: true }), '2,60 m')
  })

  test('pièce visitée : entrée notée, élément, point, fiche ou analyse', () => {
    assert.equal(pieceVisitee({ id: 'x' }, {}), false)
    assert.equal(pieceVisitee({ id: 'x' }, { visitees: ['x'] }), true)
    assert.equal(pieceVisitee({ id: 'x', fiche: { sol: ' ' } }, {}), false)
    assert.equal(pieceVisitee({ id: 'x', fiche: { sol: 'Carrelage' } }, {}), true)
    assert.equal(pieceVisitee({ id: 'x' }, { points: [{ piece_id: 'x' }] }), true)
    // Seulement une fiche proposée laissée de côté (et l'analyse qui l'a faite) : pas visitée
    const proposee = { id: 'x', fiche_a_valider: true, fiche: { sol: 'Moquette' }, analyse_le: '2026-11-18T09:00:00Z' }
    assert.equal(pieceVisitee(proposee, {}), false)
    assert.equal(pieceVisitee(proposee, { inclurePropositions: true }), true)
    assert.equal(pieceVisitee(proposee, { visitees: ['x'] }), true)
    assert.equal(pieceVisitee(proposee, { elementsExport: [{ pieceId: 'x' }] }), true)
    const etages = etagesDuRapport({ niveaux, pieces, elementsExport, points, visitees: null })
    assert.deepEqual(etages.map((e) => e.niveau.id), ['n1', 'n2'])
    assert.deepEqual(etages[0].nonVisitees.map((p) => p.id), ['p3'])
  })

  test('groupesElements : ordre des calques puis des numéros, inconnu en dernier', () => {
    const g = groupesElements([
      { calque: 'desordres', numero: 9 }, { calque: 'plomberie', numero: 7 }, { calque: 'plomberie', numero: null },
      { calque: 'plomberie', numero: 2 }, { calque: 'zzz', numero: 1 },
    ])
    assert.deepEqual(g.map((x) => x.calque), ['plomberie', 'desordres', null])
    assert.deepEqual(g[0].elements.map((e) => e.numero), [2, 7, null])
  })

  test('nom du fichier', () => {
    assert.equal(nomFichierRapportEdl(affaire, '2026-11-18'), '2026-11-18-9901-etat-des-lieux.pdf')
    assert.equal(nomFichierRapportEdl({}, new Date(2026, 0, 5)), '2026-01-05-etat-des-lieux.pdf')
  })
})

describe('numéros des photos, communs au DXF et au rapport', () => {
  test('étage, pièce, numéro de point, puis heure ; point inconnu en dernier', () => {
    const pts = [
      { id: 'a', niveau_id: 'n2', piece_id: 'p4', numero: 1 },
      { id: 'b', niveau_id: 'n1', piece_id: 'p2', numero: 2 },
      { id: 'c', niveau_id: 'n1', piece_id: 'p1', numero: 9 },
      { id: 'd', niveau_id: 'n1', piece_id: 'p1', numero: 3 },
    ]
    const ph = [
      { id: 'x1', point_id: 'a', prise_le: '2026-11-17T09:00:00Z' },
      { id: 'x2', point_id: 'b', prise_le: '2026-11-17T09:00:00Z' },
      { id: 'x3', point_id: 'c', prise_le: '2026-11-17T09:00:00Z' },
      { id: 'x4', point_id: 'd', prise_le: '2026-11-17T10:00:00Z' },
      { id: 'x5', point_id: 'd', prise_le: '2026-11-17T08:00:00Z' },
      { id: 'x6', point_id: 'perdu', prise_le: '2026-11-17T07:00:00Z' },
    ]
    const n = numeroterPhotos(ph, pts, { niveaux, pieces })
    assert.deepEqual(n.map((p) => [p.id, p.numero]), [['x5', 1], ['x4', 2], ['x3', 3], ['x2', 4], ['x1', 5], ['x6', 6]])
    assert.equal(ph[0].numero, undefined, 'les lignes reçues ne sont pas modifiées')
    assert.deepEqual(numeroterPhotos([], pts), [])
  })
})

describe('plan du rapport', () => {
  test('cadrage sur les pièces (et pas sur toute la feuille), ~2 400 px sur le long côté', () => {
    const c = cadragePlan(pieces.filter((p) => p.niveau_id === 'n1'), { repli: niveaux[0].cadrage })
    assert.equal(Math.max(c.largeur, c.hauteur), PX_PLAN_ETAGE)
    assert.ok(Math.abs(c.x0 + 1.5) < 1e-9 && Math.abs(c.x1 - 11.5) < 1e-9, JSON.stringify(c))
    const repli = cadragePlan([], { repli: niveaux[0].cadrage })
    assert.ok(repli.x1 - repli.x0 > 20)
    assert.equal(cadragePlan([], {}), null)
    const cp = cadragePiece(pieces[1])
    assert.ok(Math.abs(cp.x0 - 4) < 1e-9 && Math.max(cp.largeur, cp.hauteur) === PX_PLAN_PIECE)
  })

  test('extrait d’une pièce : seulement les traits, masses et textes de son cadrage', () => {
    const trait = (x) => ({ pts: [[x, 0], [x + 1, 0]], ferme: false, boite: [x, 0, x + 1, 0] })
    const vecteurs = {
      calques: ['A'], boite: [0, 0, 100, 100],
      traits: [trait(0), trait(6), trait(50), trait(90)],
      masses: [{ calque: 'A', anneaux: [carre(5, 0, 1)], boite: [5, 0, 6, 1] }, { calque: 'A', anneaux: [carre(60, 60, 1)], boite: [60, 60, 61, 61] }],
      textes: [{ texte: 'ICI', pos: [6, 1], hauteur: 0.2 }, { texte: 'LOIN', pos: [80, 80], hauteur: 0.2 }],
    }
    const v = vecteursDuCadrage(vecteurs, cadragePiece(pieces[1]))
    assert.deepEqual(v.traits.map((t) => t.boite[0]), [6])
    assert.equal(v.masses.length, 1)
    assert.deepEqual(v.textes.map((t) => t.texte), ['ICI'])
    assert.deepEqual(v.calques, ['A'])
    assert.equal(vecteursDuCadrage(null, cadragePiece(pieces[1])), null)
  })

  test('symboles à taille fixe agrandis sur un grand étage, appareils à leur taille', () => {
    assert.equal(echelleSymbole('lavabo', 10), 1)
    assert.equal(echelleSymbole('prise', 1000), 1)
    const k = echelleSymbole('prise', 20)
    assert.ok(Math.abs(k * 0.3 * 20 - PX_SYMBOLE_MIN) < 1e-9)
    const a = agrandir([{ cercle: [1, 1, 0.1] }, { texte: 'T', pos: [2, 1], hauteur: 0.1 }], [1, 1], 2)
    assert.deepEqual(a, [{ cercle: [1, 1, 0.2] }, { texte: 'T', pos: [3, 1], hauteur: 0.2 }])
  })

  test('image d’étage posée d’après son cadrage', () => {
    const c = { x0: 5, y0: 0, x1: 10, y1: 10, pxParMetre: 10 }
    assert.deepEqual(placementFond({ x0: 0, y0: 0, x1: 20, y1: 20 }, c), { x: -50, y: -100, largeur: 200, hauteur: 200 })
    assert.equal(placementFond(null, c), null)
  })

  test('une bulle « P n » par point, couleur des propositions', () => {
    const avecDeux = elementsAExporter({
      pieces, points, inclurePropositions: true,
      elements: [...elements, ligne('e8', 'p1', 'pt1', 'electricite', 'interrupteur', 'Va-et-vient')],
    })
    const m = marquesElements(avecDeux, pieces, 100)
    assert.equal(m.length, avecDeux.length - 1, 'l’élément sans point n’est pas dessiné')
    assert.equal(m.filter((x) => x.numero === 'P1').length, 1, 'deux éléments au même point : une bulle')
    assert.equal(m.find((x) => x.element.id === 'e3').couleur, '#2F6FB5')
    assert.deepEqual(m.find((x) => x.element.id === 'e3').primitives, [])
  })

  test('plusieurs symboles au même point : côte à côte le long de la pièce, comme le DXF', () => {
    const tournee = { id: 'pt', niveau_id: 'n1', contour: [[0, 0], [10, 0], [10, 1], [0, 1]].map(([u, v]) => {
      const a = (20 * Math.PI) / 180
      return [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)]
    }) }
    const memePoint = (id, type, aValider = false) => ({ id, pieceId: 'pt', pointId: 'q', x: 2, y: 3, type, calque: 'menuiseries', numero: 3, aValider })
    const liste = [memePoint('f', 'fenetre'), memePoint('v', 'volet'), memePoint('f2', 'fenetre', true)]
    const pxParMetre = 100
    const m = marquesElements(liste, [tournee], pxParMetre)
    // Deux types : deux symboles ; la fenêtre en double n'en fait qu'un, de l'élément validé
    assert.deepEqual(m.map((x) => x.element.id), ['f', 'v'])
    const { emplacements } = decalagesSymboles(['fenetre', 'volet'], { echelle: (t) => echelleSymbole(t, pxParMetre) })
    const a = (20 * Math.PI) / 180
    assert.ok(emplacements[1].dx > 0)
    proche(m[1].x, 2 + emplacements[1].dx * Math.cos(a))
    proche(m[1].y, 3 + emplacements[1].dx * Math.sin(a))
    proche(m[0].x, 2)
    // Une seule bulle, au coin haut droit de l'ensemble
    assert.equal(m.filter((x) => x.numero).length, 1)
    assert.ok(m[0].ancre[0] >= m[1].boite.xmax - 1e-9)
  })

  test('symbole mural contre son mur, même règle que le DXF (orientationElement)', () => {
    const salle = { id: 'ps', niveau_id: 'n1', contour: [[0, 0], [4, 0], [4, 3], [0, 3]] }
    const el = (id, type, x, y) => ({ id, pieceId: 'ps', pointId: id, x, y, type, calque: 'electricite', numero: 1, aValider: false })
    const m = marquesElements([el('haut', 'prise', 2, 2.8), el('milieu', 'prise', 2, 1.5), el('porte', 'porte', 2, 2.8)], [salle], 1000)
    // Prise contre le mur du haut : tournée de 180°, son trait vers le mur (+y du plan)
    const trait = (marque) => marque.primitives.find((p) => p.ligne && Math.abs(p.ligne[0][0] - p.ligne[1][0]) < 1e-9).ligne
    assert.ok(trait(m[0])[1][1] > 2.8, 'trait de la prise vers le mur du haut')
    assert.ok(trait(m[1])[1][1] < 1.5, 'loin des murs : droite, comme la pièce')
    // Le point plein du détecteur reste plein une fois posé et agrandi
    const [df] = marquesElements([{ ...el('df', 'detecteur-fumee', 2, 1.5), calque: 'securite' }], [salle], 10)
    assert.equal(df.primitives.filter((p) => p.plein).length, 1)
    // La porte n'est pas murale : elle suit la pièce (vantail vers +y), même près du mur
    const vantail = m[2].primitives[2].ligne
    assert.ok(vantail[1][1] > vantail[0][1])
  })

  test('dessin sur un contexte quelconque : pièces, symboles, bulles, points seuls', () => {
    const appels = []
    const ctx = new Proxy({}, {
      get: (cible, nom) => (nom in cible ? cible[nom] : (...args) => { appels.push([nom, ...args]); return nom === 'measureText' ? { width: 10 } : undefined }),
      set: (cible, nom, valeur) => { cible[nom] = valeur; return true },
    })
    const etage = pieces.filter((p) => p.niveau_id === 'n1')
    dessinerPlanRapport(ctx, {
      cadrage: cadragePlan(etage), vecteurs: { traits: [{ pts: [[0, 0], [10, 0]], ferme: false, boite: [0, 0, 10, 0] }], masses: [], textes: [] },
      pieces: etage, elementsExport, pointsSeuls: pointsSansElement({ points, elements, elementsExport }), visitees: new Set(['p1', 'p2']),
    })
    const dessines = appels.filter((a) => a[0] === 'fillText').map((a) => a[1])
    for (const t of ['01 · Séjour', 'P1', 'P2', 'P3', 'P5', 'P7', 'P8', 'P4', 'P6']) assert.ok(dessines.includes(t), `« ${t} » non dessiné`)
    assert.ok(appels.some((a) => a[0] === 'setLineDash' && a[1].length === 2), 'pièce non visitée en pointillés')
  })
})
