// État des lieux, export : rapport Word (.docx), à reprendre à la main.
// Demande de l'agence (2026-11-19). Même contenu que le PDF : la suite des
// pages est commune (`suiteRapportEdl`). Affaire et relevés inventés : aucun
// plan ni nom réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { unzipSync, strFromU8 } from 'fflate'

import { elementsAExporter } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { definitionRapportEdl, nomFichierWordEdl } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import { Packer, dimensionsJpeg, documentWordEdl, tailleDansCadre } from '../src/modules/etude/etat-des-lieux/export/rapportWordEdl.js'

const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]]

// En-tête JPEG minimal : SOI, APP0, SOF0 (hauteur, largeur), EOI
function jpeg(largeur, hauteur) {
  return new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08, hauteur >> 8, hauteur & 0xFF, largeur >> 8, largeur & 0xFF, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xD9,
  ])
}

const affaire = { code_affaire: '9901', nom: 'Maison de l’essai', projet_adresse: '1 rue Imaginaire', projet_commune: 'Villefictive', moa_nom: 'Maître d’ouvrage inventé' }
const niveaux = [
  { id: 'n2', nom: 'R+1', ordre: 1 },
  { id: 'n1', nom: 'RDC', ordre: 0 },
]
const pieces = [
  { id: 'p1', niveau_id: 'n1', ordre: 0, numero: '01', nom: 'Séjour', contour: carre(0, 0, 5), surface_lue: 25, hsp_lue: 2.5, fiche: { sol: 'Parquet chêne', murs: 'Peinture blanche', plafond: '', plinthes: 'Bois', remarques: 'Fissure au droit de la fenêtre\nà surveiller' }, analyse_le: '2026-11-17T10:00:00Z' },
  { id: 'p2', niveau_id: 'n1', ordre: 1, numero: '02', nom: 'Salle d’eau', contour: carre(5, 0, 3), fiche: {} },
  { id: 'p3', niveau_id: 'n1', ordre: 2, numero: '03', nom: 'Cellier', contour: carre(8, 0, 2), fiche: {} },
  { id: 'p4', niveau_id: 'n2', ordre: 0, numero: '11', nom: 'Chambre', contour: carre(0, 0, 4), fiche: { sol: 'Moquette' } },
]
const point = (id, piece, numero, x, y, type = null, niveau = 'n1') => ({ id, niveau_id: niveau, piece_id: piece, numero, x, y, type })
const points = [
  point('pt1', 'p1', 1, 1, 1, 'prise'),
  point('pt2', 'p1', 2, 2, 4.8),
  point('pt4', 'p1', 4, 2.5, 2.5), // ni type ni élément
  point('pt5', 'p2', 5, 6, 1),
  point('pt9', null, 9, 30, 30, null, 'n1'), // hors des pièces
]
const ligne = (id, piece, pointId, calque, type, libelle, cotes = null, aValider = false) => ({ id, piece_id: piece, point_id: pointId, calque, type, libelle, cotes, a_valider: aValider })
const elements = [
  ligne('e1', 'p1', 'pt1', 'electricite', 'prise', 'Prise double', 'h 0,30'),
  ligne('e2', 'p1', 'pt2', 'menuiseries', 'fenetre', '', '1,20 × 1,35'),
  ligne('e4', 'p2', 'pt5', 'plomberie', 'lavabo', 'Lavabo', null, true),
  ligne('e9', null, 'pt9', 'desordres', 'fissure', 'Fissure en façade'),
]
const elementsExport = elementsAExporter({ pieces, points, elements, inclurePropositions: true })
const photos = [
  { id: 'ph1', point_id: 'pt1', prise_le: '2026-11-17T10:01:00Z' },
  { id: 'ph2', point_id: 'pt5', prise_le: '2026-11-17T10:05:00Z' },
]
const images = {
  logo: jpeg(400, 200),
  plans: new Map([['n1', jpeg(3000, 2000)], ['n2', jpeg(2000, 2000)]]),
  pieces: new Map([['p1', jpeg(1200, 600)]]),
  photos: new Map([['ph1', jpeg(800, 600)], ['ph2', jpeg(600, 800)]]),
}
const donnees = (plus = {}) => ({
  affaire, niveaux, pieces, elementsExport, photos, points, elements,
  visitees: new Set(['p2', 'p4']), images, redacteur: 'Rédacteur Inventé', date: '2026-11-18', inclurePropositions: true, ...plus,
})

async function ouvrir(doc) {
  const fichiers = unzipSync(new Uint8Array(await Packer.toArrayBuffer(doc)))
  const texte = (nom) => (fichiers[nom] ? strFromU8(fichiers[nom]) : '')
  const corps = texte('word/document.xml')
  return {
    fichiers, corps,
    // Texte lisible : le contenu de chaque <w:t>, paragraphe par paragraphe
    paragraphes: [...corps.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join('')).filter(Boolean),
    pied: Object.keys(fichiers).filter((n) => /^word\/footer\d+\.xml$/.test(n)).map(texte).join(''),
  }
}

const decoder = (s) => s.replace(/&apos;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

describe('rapport Word', () => {
  test('dimensions lues dans l’en-tête JPEG, image posée dans son cadre', () => {
    assert.deepEqual(dimensionsJpeg(jpeg(800, 600)), { largeur: 800, hauteur: 600 })
    assert.equal(dimensionsJpeg(new Uint8Array([1, 2, 3, 4])), null)
    assert.deepEqual(tailleDansCadre({ largeur: 800, hauteur: 600 }, [400, 400]), { largeur: 400, hauteur: 300 })
    assert.deepEqual(tailleDansCadre({ largeur: 600, hauteur: 800 }, [400, 400]), { largeur: 300, hauteur: 400 })
  })

  test('mêmes pages que le PDF : garde, un plan paysage par étage, une fiche par pièce visitée, hors pièces', async () => {
    const { corps, paragraphes } = await ouvrir(documentWordEdl(donnees()))
    const pdf = definitionRapportEdl(donnees()).content.map((c) => c.id)
    assert.deepEqual(pdf, ['garde', 'plan-n1', 'fiche-p1', 'fiche-p2', 'hors-pieces-n1', 'plan-n2', 'fiche-p4'])
    // Titres de niveau 1 (volet de navigation de Word) dans l'ordre du PDF
    const titres = [...corps.matchAll(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading1"\/>[\s\S]*?<\/w:p>/g)]
      .map((m) => decoder([...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join('')))
    assert.deepEqual(titres, ['RDC   Plan de l’étage', '01 · Séjour', '02 · Salle d’eau', 'Hors pièces', 'R+1   Plan de l’étage', '11 · Chambre'])
    // Garde, RDC paysage, fiches RDC, R+1 paysage, fiches R+1
    const sections = [...corps.matchAll(/<w:pgSz [^>]*\/>/g)].map((m) => (/w:orient="landscape"/.test(m[0]) ? 'paysage' : 'portrait'))
    assert.deepEqual(sections, ['portrait', 'paysage', 'portrait', 'paysage', 'portrait'])
    // Le Cellier n'est pas visité : nommé sur le plan, sans fiche
    assert.ok(paragraphes.some((p) => decoder(p).includes('non visitée (1, sans fiche) : 03 · Cellier')))
  })

  test('fiche : surface, HSP, finitions, éléments par calque, remarques, photos légendées', async () => {
    const { paragraphes } = await ouvrir(documentWordEdl(donnees()))
    const tout = paragraphes.map(decoder)
    for (const attendu of [
      'Surface  25 m²     HSP  2,50 m',
      'Parquet chêne', 'Non relevé', 'Électricité', 'Menuiseries', 'P1', 'Prise double', 'h 0,30',
      'Fissure au droit de la fenêtre', 'à surveiller', 'Ph 1 · P1 · Prise double',
      'Lavabo  (à valider)', 'Fissure en façade', 'Moquette',
    ]) assert.ok(tout.some((p) => p.includes(attendu)), `absent : ${attendu}`)
    // Point ni typé ni rattaché : listé comme dans le PDF
    assert.ok(tout.some((p) => p === 'P4'))
  })

  test('images embarquées, une par plan, extrait, photo et logo ; pied paginé', async () => {
    const { fichiers, pied } = await ouvrir(documentWordEdl(donnees()))
    const medias = Object.keys(fichiers).filter((n) => n.startsWith('word/media/'))
    // Des images identiques ne sont rangées qu'une fois (même empreinte)
    assert.ok(medias.length >= 5, medias.join(', '))
    assert.match(pied, /9901 Maison de l(’|&apos;)essai · État des lieux · page /)
    assert.match(pied, /PAGE/)
    assert.match(pied, /NUMPAGES/)
  })

  test('sans images : le document se fabrique quand même, plans signalés indisponibles', async () => {
    const { paragraphes, fichiers } = await ouvrir(documentWordEdl(donnees({ images: {} })))
    assert.equal(Object.keys(fichiers).filter((n) => n.startsWith('word/media/')).length, 0)
    assert.equal(paragraphes.filter((p) => decoder(p).includes('Plan de l’étage indisponible')).length, 2)
  })

  test('nom du fichier à côté du PDF', () => {
    assert.equal(nomFichierWordEdl(affaire, new Date(2026, 10, 18)), '2026-11-18-9901-etat-des-lieux.docx')
  })
})
