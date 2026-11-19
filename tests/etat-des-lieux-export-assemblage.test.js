// État des lieux, planches A3 : assemblage du rapport par pdf-lib (garde A4,
// une planche A3 paysage par étage, tableaux A3 paysage, photos A4, pied de page).
// Les PDF « garde » et « fiches » sont fabriqués ici par pdf-lib (pdfmake ne
// tourne pas dans Node) ; la planche est un vrai JPEG de 4 × 3 pixels inventé.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

import { assemblerRapport, textePied } from '../src/modules/etude/etat-des-lieux/export/assemblageRapportEdl.js'
import { piedRapportEdl } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'

const A4 = [595.28, 841.89]
const JPEG = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/90ABAAB/9oADAMBAAIRAxEAPwD89tR+Ivjf7U3/ABOJ/wAx/hVH/hYvjf8A6DE/5j/CuY1H/j6aqNfvueZVhfrtf91H45fZXdn9dU8lwfKv3Mf/AAFf5H//2Q==',
  'base64',
))

async function pdfA4(pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage(A4)
  return doc.save()
}

// Texte écrit sur une page : pdf-lib code l'Helvetica en chaînes hexadécimales
// WinAnsi (« <70616765> Tj ») ; on relit les flux de la page et on décode
const latin1 = (octets) => Array.from(octets, (o) => String.fromCharCode(o)).join('')
function texteDePage(page) {
  const contenus = page.node.Contents()
  const flux = contenus ? (contenus.asArray?.() ?? [contenus]).map((r) => page.doc.context.lookup(r)) : []
  const brut = flux.filter((f) => f instanceof PDFRawStream).map((f) => latin1(decodePDFRawStream(f).decode())).join('\n')
  return [...brut.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map((m) => new TextDecoder('windows-1252').decode(Buffer.from(m[1], 'hex')))
    .join(' ')
}

describe('assemblage du rapport : garde A4, planches A3, fiches A4', () => {
  const affaire = { code_affaire: '9901', nom: 'Maison de l’essai' }

  test('5 pages dans l’ordre garde (1), planches (2), fiches (2), aux bons formats', async () => {
    const octets = await assemblerRapport({
      garde: await pdfA4(1),
      planches: [{ jpeg: JPEG, largeurMm: 420, hauteurMm: 297 }, { jpeg: JPEG, largeurMm: 420, hauteurMm: 297 }],
      fiches: await pdfA4(2),
      pied: piedRapportEdl(affaire),
      titre: 'État des lieux — Maison de l’essai',
    })
    const doc = await PDFDocument.load(octets)
    const tailles = doc.getPages().map((p) => {
      const { width, height } = p.getSize()
      return [Math.round(width), Math.round(height)]
    })
    assert.deepEqual(tailles, [[595, 842], [1191, 842], [1191, 842], [595, 842], [595, 842]])
    assert.equal(doc.getTitle(), 'État des lieux — Maison de l’essai')
    assert.equal(doc.getAuthor(), 'JGA Architectes')
  })

  test('pied « … page n / N » sur les pages A4 seulement, N = toutes les pages', async () => {
    const octets = await assemblerRapport({
      garde: await pdfA4(1),
      planches: [{ jpeg: JPEG, largeurMm: 420, hauteurMm: 297 }, { jpeg: JPEG, largeurMm: 420, hauteurMm: 297 }],
      fiches: await pdfA4(2),
      pied: piedRapportEdl(affaire),
    })
    const doc = await PDFDocument.load(octets)
    const textes = doc.getPages().map(texteDePage)
    assert.equal(textes[0], '9901 Maison de l’essai · État des lieux · page 1 / 5')
    assert.equal(textes[1], '')
    assert.equal(textes[2], '')
    assert.equal(textes[3], '9901 Maison de l’essai · État des lieux · page 4 / 5')
    assert.equal(textes[4], '9901 Maison de l’essai · État des lieux · page 5 / 5')
  })

  test('suite de documents : garde A4, planches A3, tableaux A3 paysage, photos A4 ; pied partout sauf sur les planches', async () => {
    const A3 = [1190.55, 841.89]
    const tableaux = await PDFDocument.create()
    tableaux.addPage(A3)
    tableaux.addPage(A3)
    const octets = await assemblerRapport({
      documents: [
        { octets: await pdfA4(1), pied: true },
        { planches: [{ jpeg: JPEG, largeurMm: 420, hauteurMm: 297 }] },
        { octets: await tableaux.save(), pied: true },
        { octets: null, pied: true }, // annexe absente : rien
        { octets: await pdfA4(1), pied: true },
      ],
      pied: piedRapportEdl(affaire),
    })
    const doc = await PDFDocument.load(octets)
    const tailles = doc.getPages().map((p) => {
      const { width, height } = p.getSize()
      return [Math.round(width), Math.round(height)]
    })
    assert.deepEqual(tailles, [[595, 842], [1191, 842], [1191, 842], [1191, 842], [595, 842]])
    const textes = doc.getPages().map(texteDePage)
    assert.equal(textes[1], '', 'la planche a son cartouche')
    assert.equal(textes[2], '9901 Maison de l’essai · État des lieux · page 3 / 5')
    assert.equal(textes[3], '9901 Maison de l’essai · État des lieux · page 4 / 5')
    assert.equal(textes[4], '9901 Maison de l’essai · État des lieux · page 5 / 5')
  })

  test('un document marqué sans pied n’en reçoit pas', async () => {
    const doc = await PDFDocument.load(await assemblerRapport({ documents: [{ octets: await pdfA4(1), pied: false }], pied: 'X' }))
    assert.equal(texteDePage(doc.getPages()[0]), '')
  })

  test('sans fiches ni planches : la garde seule, « page 1 / 1 »', async () => {
    const doc = await PDFDocument.load(await assemblerRapport({ garde: await pdfA4(1), planches: [], fiches: null, pied: piedRapportEdl(null) }))
    assert.equal(doc.getPageCount(), 1)
    assert.equal(texteDePage(doc.getPages()[0]), 'Affaire · État des lieux · page 1 / 1')
  })

  test('texte du pied : latin courant, une seule ligne', () => {
    assert.equal(textePied('Essai ▶\nsuite', 2, 3), 'Essai » suite · page 2 / 3')
    assert.equal(textePied(piedRapportEdl({ code_affaire: '9901', nom: 'Maison ✓' }), 1, 1), '9901 Maison · État des lieux · page 1 / 1')
  })
})
