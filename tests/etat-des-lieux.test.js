// État des lieux : logique pure (format, DXF, pièces, étages, géométrie, PDF,
// demande à Claude). Plans inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from '../src/modules/etude/etat-des-lieux/formatPlanEdl.js'
import {
  aire, pointDansPolygone, boite, cadrage, versPixels, versMetres, ecartSurface,
  deplacerSommet, insererSommet, retirerSommet, arrondirContour, mediane,
} from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import { lireEchelle, metresParPoint, estVectoriel } from '../src/modules/etude/etat-des-lieux/pdfPlanLogique.js'

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
  test('verdict : DXF et PDF acceptés, DWG refusé avec le message de l’agence', () => {
    assert.deepEqual(verdictFormat('dxf'), { ok: true, message: null })
    assert.deepEqual(verdictFormat('pdf'), { ok: true, message: null })
    const dwg = verdictFormat('dwg')
    assert.equal(dwg.ok, false)
    assert.equal(dwg.message, 'Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF dans AutoCAD ou ArchiCAD (Fichier → Enregistrer sous → DXF), ou importez-le en PDF vectorisé.')
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

describe('PDF', () => {
  test('échelle lue dans le cartouche', () => {
    assert.equal(lireEchelle(['Document créé le 23/01/26', 'Echelle:1/100°']), 100)
    assert.equal(lireEchelle(['ÉCHELLE : 1 / 50']), 50)
    assert.equal(lireEchelle(['PLAN DU RDC']), null)
  })
  test('un point du papier au 1/100 vaut 3,53 cm', () => {
    assert.ok(Math.abs(metresParPoint(100) - 0.035278) < 1e-5)
  })
  test('vectoriel : au moins 30 chemins dessinés', () => {
    const OPS = { constructPath: 91, paintImageXObject: 85 }
    assert.equal(estVectoriel(Array(30).fill(91), OPS), true)
    assert.equal(estVectoriel([85, 91], OPS), false)
  })
})
