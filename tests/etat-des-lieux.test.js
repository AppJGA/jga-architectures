// État des lieux : logique pure (format, DXF, pièces, étages, géométrie, PDF,
// demande à Claude). Plans inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from '../src/modules/etude/etat-des-lieux/formatPlanEdl.js'

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
