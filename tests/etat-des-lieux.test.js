// État des lieux : logique pure (format, DXF, pièces, étages, géométrie,
// demande à Claude). Plans inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from '../src/modules/etude/etat-des-lieux/formatPlanEdl.js'
import {
  aire, pointDansPolygone, boite, cadrage, versPixels, versMetres, ecartSurface,
  deplacerSommet, insererSommet, retirerSommet, arrondirContour, mediane, ecartEchelle,
  partRecouverte, seSuperposent, retirerSuperpositions, pieceChevauchee,
} from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import { lireDxf, decoderDxf, nettoyerMtext } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'
import { detecterPieces, lireSurface, lireHsp, lireNumero, estNom } from '../src/modules/etude/etat-des-lieux/piecesDxfLogique.js'

import { piecesDesRestes } from '../src/modules/etude/etat-des-lieux/restesLogique.js'
import { niveauDeNom, uniteParDefaut, proposerNiveaux } from '../src/modules/etude/etat-des-lieux/niveauxLogique.js'
import { construireDemandePieces, lirePropositionsPieces, versPiecesEdl, SCHEMA_PIECES, TEXTES_MAX } from '../src/modules/etude/etat-des-lieux/piecesIaLogique.js'

const octets = (s) => new TextEncoder().encode(s)

describe('format du plan', () => {
  test('un DWG se reconnaît à son en-tête, quelle que soit l’extension', () => {
    assert.equal(formatPlan(octets('AC1032\0\0\0\0\0\0\0')), 'dwg')
    assert.equal(formatPlan(octets('AC1018xxxxx')), 'dwg')
  })
  test('DXF texte, avec retours Windows, commentaire 999 ou marque UTF-8', () => {
    assert.equal(formatPlan(octets('  0\nSECTION\n  2\nHEADER\n')), 'dxf')
    assert.equal(formatPlan(octets('0\r\nSECTION\r\n2\r\nHEADER\r\n')), 'dxf')
    assert.equal(formatPlan(octets('999\nArchiCAD\n  0\nSECTION\n')), 'dxf')
    assert.equal(formatPlan(new Uint8Array([0xef, 0xbb, 0xbf, ...octets('  0\nSECTION\n')])), 'dxf')
  })
  test('PDF, DXF binaire, inconnu', () => {
    assert.equal(formatPlan(octets('%PDF-1.7\n')), 'pdf')
    assert.equal(formatPlan(octets('AutoCAD Binary DXF\r\n\x1a\0')), 'dxf-binaire')
    assert.equal(formatPlan(octets('PK\x03\x04')), 'inconnu')
  })
  test('verdict : seul le DXF est accepté ; DWG et PDF refusés avec ce qu’il faut faire', () => {
    assert.deepEqual(verdictFormat('dxf'), { ok: true, message: null })
    const dwg = verdictFormat('dwg')
    assert.equal(dwg.ok, false)
    assert.equal(dwg.message, 'Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF (dans ArchiCAD ou AutoCAD : Fichier → Enregistrer sous → DXF).')
    const pdf = verdictFormat('pdf')
    assert.equal(pdf.ok, false)
    assert.equal(pdf.message, 'Les PDF ne sont pas acceptés : importez le plan en DXF (dans ArchiCAD ou AutoCAD : Fichier → Enregistrer sous → DXF).')
    assert.equal(verdictFormat('zip').message, MESSAGES_FORMAT.inconnu)
  })
})

describe('géométrie', () => {
  const carre = [[0, 0], [4, 0], [4, 5], [0, 5]]
  test('aire, point dans un polygone (pièce en L comprise)', () => {
    assert.equal(aire(carre), 20)
    const enL = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]
    assert.equal(aire(enL), 12)
    assert.equal(pointDansPolygone([1, 3], enL), true)
    assert.equal(pointDansPolygone([3, 3], enL), false)
    assert.deepEqual(boite(enL), [0, 0, 4, 4])
    assert.equal(mediane([3, 1, 2]), 2)
    assert.equal(mediane([4, 1, 2, 3]), 2.5)
  })
  test('cadrage : y du plan vers le haut, y de l’image vers le bas, aller-retour exact', () => {
    const c = cadrage([0, 0, 10, 5], { marge: 0, pxMax: 1000 })
    assert.equal(c.pxParMetre, 100)
    assert.equal(c.largeur, 1000)
    assert.equal(c.hauteur, 500)
    assert.deepEqual(versPixels(c, [0, 5]), [0, 0])
    assert.deepEqual(versPixels(c, [10, 0]), [1000, 500])
    assert.deepEqual(versMetres(c, versPixels(c, [3.2, 1.7])).map((v) => Math.round(v * 1000) / 1000), [3.2, 1.7])
  })
  test('cadrage : marge et plafond de pixels de l’iPad', () => {
    const c = cadrage([0, 0, 100, 100], { marge: 0.05, pxMax: 6000, pixelsMax: 16_000_000 })
    assert.equal(c.x0, -5)
    assert.ok(c.largeur * c.hauteur <= 16_000_000)
  })
  test('écart de surface et édition du contour', () => {
    assert.equal(ecartSurface(carre, 20), 0)
    assert.ok(Math.abs(ecartSurface(carre, 25) + 0.2) < 1e-9)
    assert.equal(ecartSurface(carre, null), null)
    assert.deepEqual(deplacerSommet(carre, 1, [5, 0])[1], [5, 0])
    assert.deepEqual(insererSommet(carre, 0, [2, 0]), [[0, 0], [2, 0], [4, 0], [4, 5], [0, 5]])
    assert.equal(retirerSommet(carre, 0).length, 3)
    assert.equal(retirerSommet(retirerSommet(carre, 0), 0).length, 3) // jamais moins de trois sommets
    assert.deepEqual(arrondirContour([[1.23456, 2.0004]]), [[1.235, 2]])
  })
})

describe('pièces superposées', () => {
  const rectangle = (x, y, l, h) => [[x, y], [x + l, y], [x + l, y + h], [x, y + h]]
  test('deux pièces qui se touchent par un mur ne se superposent pas', () => {
    assert.equal(seSuperposent(rectangle(0, 0, 4, 5), rectangle(4, 0, 3, 5)), false)
    assert.equal(partRecouverte(rectangle(0, 0, 4, 5), rectangle(4, 0, 3, 5)), 0)
  })
  test('pièce en L : un rectangle logé dans l’angle rentrant ne la recouvre pas', () => {
    const enL = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]
    assert.equal(seSuperposent(enL, rectangle(2.2, 2.2, 1.6, 1.6)), false)
  })
  test('part recouverte : moitié d’une pièce sous une autre', () => {
    const part = partRecouverte(rectangle(0, 0, 4, 4), rectangle(2, -1, 5, 6))
    assert.ok(Math.abs(part - 0.5) < 0.03)
  })
  test('zones englobantes écartées, pièces réelles gardées dans leur ordre', () => {
    const pieces = [
      { nom: 'Toute la surface', contour: rectangle(0, 0, 10, 10) },
      { nom: 'Chambre', contour: rectangle(0, 0, 4, 5) },
      { nom: 'Regroupement', contour: rectangle(0, 0, 7, 5) },
      { nom: 'Bureau', contour: rectangle(4, 0, 3, 5) },
      { nom: 'Débord', contour: rectangle(6, 0, 3, 5) },
    ]
    const r = retirerSuperpositions(pieces)
    assert.deepEqual(r.gardees.map((p) => p.nom), ['Chambre', 'Bureau'])
    assert.deepEqual(r.ecartees.map((p) => p.nom).sort(), ['Débord', 'Regroupement', 'Toute la surface'])
  })
  test('pièce chevauchée par un contour modifié, ou aucune', () => {
    const autres = [{ id: 'a', nom: 'Chambre', contour: rectangle(0, 0, 4, 5) }, { id: 'b', nom: 'Bureau', contour: rectangle(4, 0, 3, 5) }]
    assert.equal(pieceChevauchee(rectangle(3, 0, 3, 5), autres)?.nom, 'Chambre')
    assert.equal(pieceChevauchee(rectangle(7, 0, 2, 5), autres), null)
  })
})

describe('couloirs : reste des zones englobantes', () => {
  const rectangle = (x, y, l, h) => [[x, y], [x + l, y], [x + l, y + h], [x, y + h]]
  const designation = (texte, x, y) => ({ calque: 'P-DÉSIGNATION_DES_PIECES_R', texte, pos: [x, y] })
  const numero = (texte, x, y) => ({ calque: 'P-NUMEROTATION_DES_PIECES3', texte, pos: [x, y] })
  const sdo = { nom: 'SDO', calque: 'S-SURFACES_RDC', bloc: 'VUE_RDC', contour: rectangle(0, 0, 10, 5) }
  const chambres = [
    { nom: 'Chambre', calque: 'S-SURFACES_RDC', bloc: 'VUE_RDC', contour: rectangle(0, 0, 4, 5) },
    { nom: 'Bureau', calque: 'S-SURFACES_RDC', bloc: 'VUE_RDC', contour: rectangle(6, 0, 4, 5) },
  ]
  const procheDe = (v, attendu, tolerance) => Math.abs(v - attendu) <= tolerance

  test('le reste nommé d’une zone englobante devient une pièce, avec son numéro', () => {
    const r = piecesDesRestes([sdo], chambres, [designation('CIRC.', 5, 3), numero('0019', 5, 2)])
    assert.equal(r.length, 1)
    assert.equal(r[0].nom, 'CIRC.')
    assert.equal(r[0].numero, '0019')
    // 2 × 5 m, moins une marge d'une case (10 cm) le long de chaque chambre
    assert.ok(procheDe(aire(r[0].contour), 9, 0.3))
    assert.equal(r[0].bloc, 'VUE_RDC')
    assert.ok(chambres.every((c) => !seSuperposent(c.contour, r[0].contour)))
  })
  test('un reste sans nom écrit (liseré entre deux pièces) est ignoré', () => {
    assert.deepEqual(piecesDesRestes([sdo], chambres, [designation('Armoire', 2, 2)]), [])
    assert.deepEqual(piecesDesRestes([sdo], chambres, []), [])
  })
  test('deux noms dans un même reste : partagé entre eux, sans rien perdre', () => {
    const r = piecesDesRestes([sdo], [], [designation('CIRCULATION', 2, 2.5), designation('DEG.', 8, 2.5)])
    assert.deepEqual(r.map((p) => p.nom).sort(), ['CIRCULATION', 'DEG.'])
    assert.ok(procheDe(aire(r[0].contour) + aire(r[1].contour), 50, 1))
    assert.equal(seSuperposent(r[0].contour, r[1].contour), false)
  })
  test('zones imbriquées : le couloir d’une petite zone n’est pas repris par la grande', () => {
    const grande = { nom: 'Tout l’étage', calque: 'S-SURFACES_RDC', bloc: 'VUE_RDC', contour: rectangle(0, 0, 20, 5) }
    const r = piecesDesRestes([grande, sdo], chambres, [designation('CIRC.', 5, 3), designation('HALL', 15, 2.5)])
    assert.deepEqual(r.map((p) => p.nom).sort(), ['CIRC.', 'HALL'])
    const hall = r.find((p) => p.nom === 'HALL')
    assert.ok(procheDe(aire(hall.contour), 50, 1))
  })
})

describe('échelle d’un étage', () => {
  // Carrés de côté c : aire c², surface écrite donnée
  const piece = (c, surface) => ({ contour: [[0, 0], [c, 0], [c, c], [0, c]], surface_lue: surface })
  test('surfaces dessinées quatre fois trop grandes : rapport rendu', () => {
    assert.equal(ecartEchelle([piece(4, 4), piece(6, 9), piece(2, 1), piece(3, null)]), 4)
  })
  test('écart de 15 % au plus, ou moins de trois surfaces écrites : rien', () => {
    assert.equal(ecartEchelle([piece(4, 14), piece(6, 31.5), piece(2, 3.5)]), null) // ≈ ×1,14
    assert.equal(ecartEchelle([piece(4, 4), piece(6, 9), piece(2, null)]), null)
    assert.equal(ecartEchelle([]), null)
  })
  test('la médiane l’emporte sur une pièce mal dessinée ; surface lue en texte ou en nombre', () => {
    assert.equal(ecartEchelle([piece(4, '8'), piece(6, 18), piece(2, 2), piece(10, 1)]), 2)
    assert.equal(ecartEchelle([{ contour: [[0, 0], [2, 0], [2, 2], [0, 2]], surfaceLue: 1 }, piece(2, 1), piece(2, 1)]), 4)
  })
})

// DXF inventés, construits par de petites fonctions
const P = (c, v) => `${String(c).padStart(3)}\n${v}\n`
const section = (nom, contenu) => P(0, 'SECTION') + P(2, nom) + contenu + P(0, 'ENDSEC')
const dxf = ({ entete = '', blocs = '', entites = '' }) =>
  section('HEADER', entete) + section('BLOCKS', blocs) + section('ENTITIES', entites) + P(0, 'EOF')
const ligne = (calque, x1, y1, x2, y2, papier = false) =>
  P(0, 'LINE') + (papier ? P(67, 1) : '') + P(8, calque) + P(10, x1) + P(20, y1) + P(11, x2) + P(21, y2)
const lwpoly = (calque, pts, ferme = true) =>
  P(0, 'LWPOLYLINE') + P(8, calque) + P(90, pts.length) + P(70, ferme ? 1 : 0) + pts.map(([x, y]) => P(10, x) + P(20, y)).join('')
const polyline = (calque, pts, ferme = true) =>
  P(0, 'POLYLINE') + P(8, calque) + P(66, 1) + P(70, ferme ? 1 : 0) + P(10, 0) + P(20, 0)
  + pts.map(([x, y]) => P(0, 'VERTEX') + P(8, calque) + P(10, x) + P(20, y)).join('') + P(0, 'SEQEND')
const mtext = (calque, x, y, t, h = 0.2) => P(0, 'MTEXT') + P(8, calque) + P(10, x) + P(20, y) + P(40, h) + P(1, t)
const texte = (calque, x, y, t, h = 0.2) => P(0, 'TEXT') + P(8, calque) + P(10, x) + P(20, y) + P(40, h) + P(1, t)
const insert = (nom, calque, x, y, sx = 1, sy = 1, rot = 0) =>
  P(0, 'INSERT') + P(8, calque) + P(2, nom) + P(10, x) + P(20, y) + P(41, sx) + P(42, sy) + P(50, rot)
const bloc = (nom, bx, by, contenu) =>
  P(0, 'BLOCK') + P(8, '0') + P(2, nom) + P(70, 0) + P(10, bx) + P(20, by) + contenu + P(0, 'ENDBLK')
const rond = (pts) => pts.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6))

describe('lecture DXF', () => {
  test('lignes, polylignes fermées, version et unités', () => {
    const l = lireDxf(dxf({
      entete: P(9, '$ACADVER') + P(1, 'AC1032') + P(9, '$INSUNITS') + P(70, 6),
      entites: ligne('MURS', 0, 0, 5, 0) + lwpoly('PIECES', [[0, 0], [4, 0], [4, 5], [0, 5]]) + polyline('ZONES', [[1, 1], [2, 1], [2, 2]]),
    }))
    assert.equal(l.version, 'AC1032')
    assert.equal(l.unites, 6)
    assert.deepEqual(l.traits.map((t) => [t.calque, t.ferme, t.pts.length]), [['MURS', false, 2], ['PIECES', true, 4], ['ZONES', true, 3]])
  })
  test('bloc inséré : déplacé, agrandi, tourné ; calque 0 → calque de l’insertion', () => {
    const l = lireDxf(dxf({
      blocs: bloc('VUE_RDC', 0, 0, ligne('0', 0, 0, 1, 0)),
      entites: insert('VUE_RDC', 'MURS', 10, 5, 2, 2, 90),
    }))
    assert.equal(l.traits.length, 1)
    assert.equal(l.traits[0].calque, 'MURS')
    assert.equal(l.traits[0].bloc, 'VUE_RDC')
    assert.deepEqual(rond(l.traits[0].pts), [[10, 5], [10, 7]])
  })
  test('blocs imbriqués : le bloc retenu est celui du premier niveau, point de base compris', () => {
    const l = lireDxf(dxf({
      blocs: bloc('PORTE', 1, 1, ligne('PORTES', 1, 1, 2, 1)) + bloc('VUE_SSOL', 0, 0, insert('PORTE', 'PORTES', 5, 5)),
      entites: insert('VUE_SSOL', '0', 100, 0),
    }))
    assert.equal(l.traits[0].bloc, 'VUE_SSOL')
    assert.deepEqual(rond(l.traits[0].pts), [[105, 5], [106, 5]])
  })
  test('espace papier ignoré quand l’espace objet porte le dessin, lu sinon', () => {
    const objet = Array.from({ length: 60 }, (_, i) => ligne('MURS', i, 0, i, 1)).join('')
    const cadre = ligne('CADRE', 0, 0, 500, 0, true)
    assert.equal(lireDxf(dxf({ entites: objet + cadre })).traits.some((t) => t.calque === 'CADRE'), false)
    assert.equal(lireDxf(dxf({ entites: cadre })).traits[0].calque, 'CADRE')
  })
  test('arc et cercle approchés par des segments', () => {
    const arc = P(0, 'ARC') + P(8, 'A') + P(10, 0) + P(20, 0) + P(40, 1) + P(50, 0) + P(51, 90)
    const cercle = P(0, 'CIRCLE') + P(8, 'C') + P(10, 0) + P(20, 0) + P(40, 2)
    const l = lireDxf(dxf({ entites: arc + cercle }))
    assert.deepEqual(rond([l.traits[0].pts[0], l.traits[0].pts.at(-1)]), [[1, 0], [0, 1]])
    assert.equal(l.traits[1].ferme, true)
  })
  test('textes : MTEXT nettoyé (codes d’ArchiCAD, ^J, \\P), TEXT, hauteur mise à l’échelle', () => {
    const l = lireDxf(dxf({
      blocs: bloc('B', 0, 0, mtext('0', 1, 1, '{\\fArial|b0|i0|c0|p34;Pièce}^JS=22.9 m²\\PHP:2.47 m', 0.2)),
      entites: insert('B', 'TEXTE', 0, 0, 10, 10) + texte('COTES', 3, 3, '2.54'),
    }))
    assert.equal(l.textes[0].texte, 'Pièce\nS=22.9 m²\nHP:2.47 m')
    assert.equal(l.textes[0].hauteur, 2)
    assert.deepEqual(l.textes[0].pos, [10, 10])
    assert.equal(l.textes[1].texte, '2.54')
  })
  test('nettoyage MTEXT', () => {
    assert.equal(nettoyerMtext('\\A1;68,1996'), '68,1996')
    assert.equal(nettoyerMtext('{\\H2.5x;\\C1;Couloir}'), 'Couloir')
    assert.equal(nettoyerMtext('Hauteur\\~2,50\\U+00B2'), 'Hauteur 2,50²')
  })
  test('code de paragraphe \\p…; retiré (minuscule ; \\P reste un saut de ligne)', () => {
    assert.equal(nettoyerMtext('{\\pxqc;Salon\\PS=12 m²}'), 'Salon\nS=12 m²')
    assert.equal(nettoyerMtext('\\pi-2,l2;Entrée'), 'Entrée')
  })
  test('décodage : Windows-1252 avant AC1021, UTF-8 ensuite', () => {
    const ancien = new Uint8Array([...new TextEncoder().encode('  9\n$ACADVER\n  1\nAC1014\nS=4 m'), 0xb2])
    assert.ok(decoderDxf(ancien).endsWith('S=4 m²'))
    const recent = new TextEncoder().encode('  9\n$ACADVER\n  1\nAC1032\nS=4 m²')
    assert.ok(decoderDxf(recent).endsWith('S=4 m²'))
  })
})

// Pièces inventées : rectangles fermés, textes posés dans leur contour
const rect = (calque, x, y, l, h) => ({ calque, bloc: null, ferme: true, pts: [[x, y], [x + l, y], [x + l, y + h], [x, y + h]] })
const txt = (calque, x, y, texte) => ({ calque, bloc: null, texte, pos: [x, y], hauteur: 0.2 })

describe('pièces d’un DXF', () => {
  test('textes : surface, hauteur sous plafond (HP, pas Hp ni HSP), numéro, nom', () => {
    assert.equal(lireSurface('Pièce\nS=22.9 m²\nHP:2.47 m'), 22.9)
    assert.equal(lireSurface('Salon\nS=16.0 m carrés'), 16)
    assert.equal(lireSurface('4.40'), 4.4)
    assert.equal(lireSurface('4.40', { seulAccepte: false }), null)
    assert.equal(lireSurface('2.54 m'), null)
    assert.equal(lireHsp('Pièce\nS=22.9 m²\nHP:2.47 m'), 2.47)
    assert.equal(lireHsp('Hp:2.10'), null)
    assert.equal(lireHsp('HSP:2.49m'), null)
    assert.equal(lireNumero('0001'), '0001')
    assert.equal(lireNumero('ET008'), 'ET008')
    assert.equal(lireNumero('Chambre'), null)
    assert.equal(estNom('Ch. 1 lit'), true)
    assert.equal(estNom('SU'), false)
    assert.equal(estNom('02_RDC'), false)
    assert.equal(estNom('S=4.0 m²'), false)
  })

  test('plan de géomètre (mètres) : calque des pièces trouvé, contour englobant écarté, cote ignorée', () => {
    const traits = [
      rect('PIECES', 0, 0, 4, 5), rect('PIECES', 4, 0, 3, 3), rect('PIECES', 4, 3, 2, 4),
      rect('PIECES', -1, -1, 9, 9), // contour du bâtiment : aucun texte à lui
      rect('MOBILIER', 0.5, 0.5, 1, 1),
    ]
    const textes = [
      txt('TEXTE', 2, 2.5, 'Salon\nS=20.0 m²\nHP:2.50 m'),
      txt('COTES', 1, 1, '4.00'),
      txt('TEXTE', 5.5, 1.5, 'Cuisine\nS=9.0 m²\nHP:2.40 m'),
      txt('TEXTE', 5, 5, 'Bains\nS=8.0 m²'),
    ]
    const r = detecterPieces({ traits, textes })
    assert.equal(r.calque, 'PIECES')
    assert.equal(r.unitesParMetre, 1)
    assert.deepEqual(r.pieces.map((p) => [p.nom, p.surfaceLue, p.hspLue]), [['Salon', 20, 2.5], ['Cuisine', 9, 2.4], ['Bains', 8, null]])
  })

  test('zones d’ArchiCAD (centimètres) : tampon de zone, unité déduite, contour converti en mètres', () => {
    const traits = [rect('S-SURFACES_RDC', 0, 0, 400, 500), rect('S-SURFACES_RDC', 400, 0, 300, 300), rect('S-SURFACES_RDC', 400, 300, 200, 400)]
    const tampon = (x, y, numero, nom, surface) => ['02_RDC', 'SU', numero, nom, surface].map((t, i) => txt('S-SURFACES_RDC', x, y - i * 10, t))
    const textes = [...tampon(200, 250, '0001', 'Chambre', '20.00'), ...tampon(550, 150, '0002', 'Bureau', '9.00'), ...tampon(500, 500, '0003', 'Douche', '8.00')]
    const r = detecterPieces({ traits, textes })
    assert.equal(r.unitesParMetre, 100)
    assert.deepEqual(r.pieces[0], { nom: 'Chambre', numero: '0001', surfaceLue: 20, hspLue: null, calque: 'S-SURFACES_RDC', bloc: null, contour: [[0, 0], [4, 0], [4, 5], [0, 5]] })
  })

  test('tampon de zone sans nom : le nom est pris sur le calque des désignations, jamais sur le mobilier', () => {
    const traits = [rect('S-SURFACES_RDC', 0, 0, 400, 500), rect('S-SURFACES_RDC', 400, 0, 300, 300), rect('S-SURFACES_RDC', 400, 300, 200, 400)]
    const tampon = (x, y, numero, nom, surface) => ['02_RDC', 'SU', numero, nom, surface].filter(Boolean).map((t, i) => txt('S-SURFACES_RDC', x, y - i * 10, t))
    const textes = [
      ...tampon(200, 250, '0001', null, '20.00'),
      txt('A-MOBILIER_RDC', 100, 100, 'Armoire'),
      txt('P-DÉSIGNATION_DES_PIECES_R', 200, 400, 'L. SALE'),
      ...tampon(550, 150, '0002', null, '9.00'),
      txt('A-MOBILIER_RDC', 550, 100, 'Armoire'),
      ...tampon(500, 500, '0003', 'Douche', '8.00'),
    ]
    const r = detecterPieces({ traits, textes })
    assert.deepEqual(r.pieces.map((p) => p.nom), ['L. SALE', '', 'Douche'])
  })

  test('une pièce dont la surface s’écarte reste, les autres fixent l’unité', () => {
    const traits = [rect('P', 0, 0, 4, 5), rect('P', 4, 0, 3, 3), rect('P', 4, 3, 2, 4), rect('P', 10, 0, 2, 2)]
    const textes = [txt('T', 2, 2, 'A\nS=20 m²'), txt('T', 5, 1, 'B\nS=9 m²'), txt('T', 5, 5, 'C\nS=8 m²'), txt('T', 11, 1, 'D\nS=6 m²')]
    const r = detecterPieces({ traits, textes })
    assert.equal(r.unitesParMetre, 1)
    assert.equal(r.pieces.length, 4)
  })

  test('un calque de zones par étage (ArchiCAD) : les pièces de tous les étages, même unité', () => {
    const tampon = (calque, x, y, numero, nom, surface) => [numero, nom, surface].map((t, i) => txt(calque, x, y - i * 10, t))
    const etage = (calque, dx) => ({
      traits: [rect(calque, dx, 0, 400, 500), rect(calque, dx + 400, 0, 300, 300), rect(calque, dx + 400, 300, 200, 400)],
      textes: [...tampon(calque, dx + 200, 250, '0001', 'Chambre', '20.00'), ...tampon(calque, dx + 550, 150, '0002', 'Bureau', '9.00'), ...tampon(calque, dx + 500, 500, '0003', 'Douche', '8.00')],
    })
    const rdc = etage('Z_RDC', 0)
    const r1 = etage('Z_R+1', 2000)
    const r = detecterPieces({ traits: [...rdc.traits, ...r1.traits], textes: [...rdc.textes, ...r1.textes] })
    assert.equal(r.unitesParMetre, 100)
    assert.equal(r.pieces.length, 6)
    assert.deepEqual([...new Set(r.pieces.map((p) => p.calque))].sort(), ['Z_R+1', 'Z_RDC'])
    assert.deepEqual([...r.calques].sort(), ['Z_R+1', 'Z_RDC'])
    assert.ok(['Z_RDC', 'Z_R+1'].includes(r.calque))
  })

  test('un calque d’une autre unité ne s’ajoute pas aux pièces', () => {
    const metres = [rect('PIECES', 0, 0, 4, 5), rect('PIECES', 4, 0, 3, 3), rect('PIECES', 4, 3, 2, 4), rect('PIECES', 0, 5, 2, 2)]
    const textesM = [txt('PIECES', 2, 2.5, 'S=20 m²'), txt('PIECES', 5.5, 1.5, 'S=9 m²'), txt('PIECES', 5, 5, 'S=8 m²'), txt('PIECES', 1, 6, 'S=4 m²')]
    const cm = [rect('CM', 1000, 0, 400, 500), rect('CM', 1400, 0, 300, 300), rect('CM', 1400, 300, 200, 400)]
    const textesCm = [txt('CM', 1200, 250, 'S=20 m²'), txt('CM', 1550, 150, 'S=9 m²'), txt('CM', 1500, 500, 'S=8 m²')]
    const r = detecterPieces({ traits: [...metres, ...cm], textes: [...textesM, ...textesCm] })
    assert.equal(r.calque, 'PIECES')
    assert.deepEqual(r.calques, ['PIECES'])
    assert.equal(r.pieces.length, 4)
  })

  test('aucun calque de pièces : rien de proposé', () => {
    const r = detecterPieces({ traits: [rect('MURS', 0, 0, 1, 1)], textes: [] })
    assert.deepEqual(r, { calque: null, calques: [], unitesParMetre: null, pieces: [] })
  })
})

describe('étages', () => {
  test('niveau reconnu au nom d’un calque ou d’un bloc', () => {
    assert.equal(niveauDeNom('S-SURFACES_RDC').cle, 'RDC')
    assert.equal(niveauDeNom('----_RDC_PRO_----__2D_').cle, 'RDC')
    assert.equal(niveauDeNom('----_SSOL_EDL_----__3D_').cle, 'SS')
    assert.equal(niveauDeNom('M-SOUS-SOL').nom, 'Sous-sol')
    assert.equal(niveauDeNom('Plan R+1').cle, 'R+1')
    assert.equal(niveauDeNom('2EME ETAGE').cle, 'R+2')
    assert.equal(niveauDeNom('Combles').cle, 'COMBLES')
    assert.equal(niveauDeNom('PLAN-RDC.dxf').cle, 'RDC')
    assert.equal(niveauDeNom('PARS'), null)
    assert.equal(niveauDeNom('00_MURS'), null)
    assert.equal(niveauDeNom(null), null)
  })

  test('unité par défaut : $INSUNITS, sinon d’après la taille du dessin', () => {
    assert.equal(uniteParDefaut({ unites: 4, traits: [] }), 1000)
    assert.equal(uniteParDefaut({ unites: 5, traits: [] }), 100)
    const dessin = (pas) => ({ unites: null, traits: [{ pts: Array.from({ length: 21 }, (_, i) => [i * pas, i * pas]) }] })
    assert.equal(uniteParDefaut(dessin(150)), 100) // 30 m dessinés en centimètres
    assert.equal(uniteParDefaut(dessin(1.5)), 1)
  })

  // Traits qui partent tous du même coin : une seule grappe par dessin
  const traitsDe = (bloc, calque, n, dx = 0) => Array.from({ length: n }, (_, i) => ({ calque, bloc, ferme: false, pts: [[dx, 0], [dx + 59, i * 0.25]] }))

  test('étages superposés (ArchiCAD) : séparés par le nom des blocs, sous-sol d’abord', () => {
    const lecture = { traits: [...traitsDe('VUE_RDC', 'M-RDC', 60), ...traitsDe('VUE_SSOL', 'M-SOUS-SOL', 60), ...traitsDe('GROUPE-1', 'GENERAL', 3)], textes: [{ calque: 'P', bloc: 'VUE_SSOL', texte: 'LOCAL', pos: [1, 1], hauteur: 1 }] }
    const piece = { nom: 'Chambre', calque: 'S-SURFACES_RDC', bloc: 'VUE_RDC', contour: [[0, 0], [1, 0], [1, 1]] }
    const n = proposerNiveaux(lecture, { pieces: [piece] }, 1, 'plan.dxf')
    assert.deepEqual(n.map((x) => [x.nom, x.traits.length, x.pieces.length, x.aProposer]), [['Sous-sol', 60, 0, true], ['Rez-de-chaussée', 60, 1, false]])
    assert.equal(n[0].textes[0].texte, 'LOCAL')
  })

  test('pièces superposées retirées étage par étage (les étages ArchiCAD se superposent entre eux)', () => {
    const rectangle = (x, y, l, h) => [[x, y], [x + l, y], [x + l, y + h], [x, y + h]]
    const lecture = { traits: [...traitsDe('VUE_RDC', 'M-RDC', 60), ...traitsDe('VUE_SSOL', 'M-SOUS-SOL', 60)], textes: [] }
    const pieces = [
      { nom: 'Chambre', calque: 'Z', bloc: 'VUE_RDC', contour: rectangle(0, 0, 4, 5) },
      { nom: 'SDO', calque: 'Z', bloc: 'VUE_RDC', contour: rectangle(0, 0, 8, 5) },
      { nom: 'Cave', calque: 'Z', bloc: 'VUE_SSOL', contour: rectangle(0, 0, 4, 5) },
    ]
    const n = proposerNiveaux(lecture, { pieces }, 1, 'plan.dxf')
    assert.deepEqual(n.map((x) => [x.nom, x.pieces.map((p) => p.nom), x.ecartees]), [['Sous-sol', ['Cave'], 0], ['Rez-de-chaussée', ['Chambre'], 1]])
  })

  test('un seul étage parmi d’autres dessins (géomètre) : la grappe qui porte les pièces, nommée d’après le fichier', () => {
    const batiment = traitsDe(null, 'MURS', 60, 0)
    const ailleurs = traitsDe(null, 'CADRE', 60, 10_000)
    const piece = { nom: 'Salon', calque: 'PIECES', bloc: null, contour: [[1, 1], [5, 1], [5, 5], [1, 5]] }
    const n = proposerNiveaux({ traits: [...batiment, ...ailleurs], textes: [] }, { pieces: [piece] }, 1, 'PLAN-RDC.dxf')
    assert.equal(n.length, 1)
    assert.equal(n[0].nom, 'Rez-de-chaussée')
    assert.equal(n[0].traits.length, 60)
    assert.deepEqual(n[0].boite, [0, 0, 59, 14.75])
  })

  test('dessin morcelé sans pièces : tout le dessin en un seul étage plutôt qu’aucun', () => {
    // 12 grappes éloignées de 10 traits : aucune n'atteint 10 % du dessin
    const morceaux = Array.from({ length: 12 }, (_, k) => traitsDe(null, 'MURS', 10, k * 1000)).flat()
    const n = proposerNiveaux({ traits: morceaux, textes: [{ calque: 'T', bloc: null, texte: 'NOTE', pos: [5000, 1], hauteur: 1 }] }, { pieces: [] }, 1, 'plan.dxf')
    assert.equal(n.length, 1)
    assert.equal(n[0].traits.length, 120)
    assert.equal(n[0].textes.length, 1)
    assert.equal(n[0].aProposer, true)
  })

  test('mise en mètres des traits, textes et boîte', () => {
    const lecture = { traits: traitsDe(null, 'MURS', 60).map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x * 100, y * 100]) })), textes: [] }
    const n = proposerNiveaux(lecture, { pieces: [] }, 100, 'x.dxf')
    assert.deepEqual(n[0].traits[1].pts, [[0, 0], [59, 0.25]])
    assert.equal(n[0].nom, 'Niveau 1')
    assert.equal(n[0].aProposer, true)
  })
})

describe('demande à Claude', () => {
  test('image puis textes positionnés, schéma imposé', () => {
    const textes = Array.from({ length: TEXTES_MAX + 5 }, (_, i) => ({ texte: `T${i}  x`, x: i + 0.4, y: 2 }))
    const d = construireDemandePieces({ image: 'QUJD', largeur: 2000, hauteur: 1400, textes, niveauUnique: true })
    assert.equal(d.messages[0].content[0].type, 'image')
    assert.equal(d.messages[0].content[0].source.media_type, 'image/jpeg')
    const texte = d.messages[0].content[1].text
    assert.match(texte, /2000 × 1400/)
    assert.match(texte, /un seul étage/)
    assert.match(texte, /\n0\t2\tT0 x/)
    assert.equal(texte.split('\n').filter((l) => /^\d+\t/.test(l)).length, TEXTES_MAX)
    assert.equal(d.output_config.format.schema, SCHEMA_PIECES)
  })
  test('réponse relue : bornée à l’image, contours trop petits écartés, niveau par défaut', () => {
    const r = lirePropositionsPieces({
      niveaux: [],
      pieces: [
        { niveau: 3, nom: ' Cuisine ', numero: '', surface: 0, contour: [[-5, 0], [100, 0], [100, 80], [0, 80]] },
        { niveau: 0, nom: 'Miette', numero: '', surface: 0, contour: [[0, 0], [1, 0], [1, 1]] },
        { niveau: 0, nom: 'Ligne', numero: '', surface: 0, contour: [[0, 0], [5, 5]] },
      ],
    }, { largeur: 1000, hauteur: 800 })
    assert.deepEqual(r.niveaux, [{ nom: 'Niveau 1', cadre: [0, 0, 1000, 800] }])
    assert.deepEqual(r.pieces, [{ niveau: 0, nom: 'Cuisine', numero: null, surface: null, contour: [[0, 0], [100, 0], [100, 80], [0, 80]] }])
  })
  test('pièces converties en mètres, marquées à vérifier', () => {
    const [p] = versPiecesEdl([{ niveau: 0, nom: 'Salon', numero: '0004', surface: 12.5, contour: [[0, 0], [10, 0], [10, 10]] }], ([x, y]) => [x / 10, y / 10 + 1])
    assert.deepEqual(p, { nom: 'Salon', numero: '0004', surfaceLue: 12.5, hspLue: null, contour: [[0, 1], [1, 1], [1, 2]], origine: 'ia', aVerifier: true })
  })
})
