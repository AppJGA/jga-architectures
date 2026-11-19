// État des lieux, export : rapport Word (.docx), à reprendre à la main.
// Demande de l'agence (2026-11-19). Même suite que le PDF : garde, une
// planche A3 par étage (fond verrouillé, légende et symboles en images
// flottantes déplaçables), tableaux par niveau, annexe des photos. Affaire et
// relevés inventés : aucun plan ni nom réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { unzipSync, strFromU8 } from 'fflate'

import { elementsAExporter } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { misePlanche } from '../src/modules/etude/etat-des-lieux/export/plancheEdl.js'
import { PX_PAR_MM, tailleImageLegende, tailleImageSymbole } from '../src/modules/etude/etat-des-lieux/export/dessinPlancheEdl.js'
import { nomFichierWordEdl } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import {
  Packer, dimensionsJpeg, documentWordEdl, emu, imagesPlancheWord, tailleDansCadre,
} from '../src/modules/etude/etat-des-lieux/export/rapportWordEdl.js'

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

// En-tête PNG minimal (signature + IHDR) ; `marque` rend chaque image distincte
const png = (largeur, hauteur, marque = 0) => new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, largeur >> 8, largeur & 0xFF, 0, 0, hauteur >> 8, hauteur & 0xFF, 8, 6, 0, 0, 0, marque, 0, 0, 0,
])

const affaire = { code_affaire: '9901', nom: 'Maison de l’essai', projet_adresse: '1 rue Imaginaire', projet_commune: 'Villefictive', moa_nom: 'Maître d’ouvrage inventé' }
const niveaux = [
  { id: 'n2', nom: 'R+1', ordre: 1 },
  { id: 'n1', nom: 'RDC', ordre: 0 },
]
const pieces = [
  {
    id: 'p1', niveau_id: 'n1', ordre: 0, numero: '01', nom: 'Séjour', contour: carre(0, 0, 5), surface_lue: 25, hsp_lue: 2.5,
    fiche: {
      sol: 'Parquet chêne', murs: 'Peinture blanche', plafond: '', plinthes: 'Bois', remarques: 'Fissure au droit de la fenêtre',
      porte: { huisserie: 'bois', vantail: 'isoplane' }, statuts: { sol: 'conserver', murs: 'rafraichir', plinthes: 'deposer', porte: 'deposer' },
    },
    analyse_le: '2026-11-17T10:00:00Z',
  },
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
  photos: new Map([['ph1', jpeg(800, 600)], ['ph2', jpeg(600, 800)]]),
}
const donnees = (plus = {}) => ({
  affaire, niveaux, pieces, elementsExport, photos, points, elements,
  visitees: new Set(['p2', 'p4']), images, redacteur: 'Rédacteur Inventé', date: '2026-11-18', inclurePropositions: true, ...plus,
})

const decoder = (s) => s.replace(/&apos;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const textes = (xml) => decoder([...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join(''))

async function ouvrir(doc) {
  const fichiers = unzipSync(new Uint8Array(await Packer.toArrayBuffer(doc)))
  const texte = (nom) => (fichiers[nom] ? strFromU8(fichiers[nom]) : '')
  const corps = texte('word/document.xml')
  const rels = texte('word/_rels/document.xml.rels')
  const cible = (rid) => rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1]
  // Sections : ses propriétés (<w:sectPr>), son contenu, son pied. docx range
  // les propriétés d'une section dans le dernier paragraphe de celle-ci (et
  // celles de la dernière en fin de corps) : la section finit avec ce paragraphe
  const sections = []
  let debut = 0
  for (const m of corps.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)) {
    const proprietes = m[0]
    const rid = proprietes.match(/<w:footerReference w:type="default" r:id="([^"]+)"/)?.[1]
    const finParagraphe = corps.indexOf('</w:p>', m.index)
    const derniere = corps.slice(m.index + m[0].length).startsWith('</w:body>')
    const fin = derniere ? m.index : finParagraphe + '</w:p>'.length
    sections.push({ contenu: corps.slice(debut, fin), proprietes, pied: rid ? texte(`word/${cible(rid)}`) : '' })
    debut = fin
  }
  return {
    fichiers, corps, sections,
    // Texte lisible : le contenu de chaque <w:t>, paragraphe par paragraphe
    paragraphes: [...corps.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => textes(m[0])).filter(Boolean),
  }
}

const formatSection = (s) => {
  const pg = s.proprietes.match(/<w:pgSz [^>]*\/>/)[0]
  const [, w, h] = pg.match(/w:w="(\d+)" w:h="(\d+)"/)
  return `${Number(w) > 20000 || Number(h) > 20000 ? 'A3' : 'A4'} ${/w:orient="landscape"/.test(pg) ? 'paysage' : 'portrait'}`
}

// Un étage, trois symboles dont deux de même clé (deux luminaires au milieu
// de la pièce, loin des murs : même angle)
function etagePlanche() {
  const piece = { id: 'q1', niveau_id: 'm1', ordre: 0, numero: '01', nom: 'Salle', contour: carre(0, 0, 10), fiche: { sol: 'Carrelage' } }
  const pts = [point('q-a', 'q1', 1, 3, 3, null, 'm1'), point('q-b', 'q1', 2, 7, 7, null, 'm1'), point('q-c', 'q1', 3, 5, 5, null, 'm1')]
  const els = [
    ligne('f1', 'q1', 'q-a', 'electricite', 'luminaire', 'Luminaire'),
    ligne('f2', 'q1', 'q-b', 'electricite', 'luminaire', 'Luminaire'),
    ligne('f3', 'q1', 'q-c', 'securite', 'detecteur-fumee', 'DAAF'),
  ]
  const exportes = elementsAExporter({ pieces: [piece], points: pts, elements: els })
  const niveau = { id: 'm1', nom: 'RDC', ordre: 0 }
  const mise = misePlanche({ niveau, pieces: [piece], elementsExport: exportes, affaire, date: '2026-11-18', redacteur: 'Rédacteur Inventé', numero: 'EDL-1' })
  const cles = [...new Set(mise.symboles.map((s) => s.cle))]
  const planche = {
    niveauId: 'm1', mise, pxParMm: PX_PAR_MM, fond: jpeg(3307, 2339), legende: png(900, 400, 9),
    symboles: new Map(cles.map((c, i) => [c, png(40, 40, i + 1)])),
  }
  const parametres = {
    affaire, niveaux: [niveau], pieces: [piece], elementsExport: exportes, photos: [], points: pts, elements: els,
    visitees: new Set(['q1']), images: {}, planches: [planche], redacteur: 'Rédacteur Inventé', date: '2026-11-18',
  }
  return { mise, cles, planche, parametres }
}

describe('rapport Word', () => {
  test('dimensions lues dans l’en-tête JPEG, image posée dans son cadre', () => {
    assert.deepEqual(dimensionsJpeg(jpeg(800, 600)), { largeur: 800, hauteur: 600 })
    assert.equal(dimensionsJpeg(new Uint8Array([1, 2, 3, 4])), null)
    assert.deepEqual(tailleDansCadre({ largeur: 800, hauteur: 600 }, [400, 400]), { largeur: 400, hauteur: 300 })
    assert.deepEqual(tailleDansCadre({ largeur: 600, hauteur: 800 }, [400, 400]), { largeur: 300, hauteur: 400 })
  })

  test('suite du PDF : garde A4, une planche A3 par étage, tableaux A3, photos A4', async () => {
    const { sections } = await ouvrir(documentWordEdl(donnees()))
    assert.deepEqual(sections.map(formatSection), ['A4 portrait', 'A3 paysage', 'A3 paysage', 'A3 paysage', 'A4 portrait'])
  })

  test('planche : fond verrouillé, légende et symboles flottants posés à leur place', async () => {
    const { mise, cles, planche, parametres } = etagePlanche()
    assert.equal(mise.symboles.length, 3)
    assert.equal(cles.length, 2)
    const { sections, fichiers } = await ouvrir(documentWordEdl(parametres))
    const s = sections[1]
    assert.match(s.proprietes, /<w:pgSz w:w="23811" w:h="16838" w:orient="landscape"\/>/)
    assert.match(s.proprietes, /<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"/)

    // Un seul paragraphe, 1 fond + 1 légende + 3 symboles
    const ancres = [...s.contenu.matchAll(/<wp:anchor [\s\S]*?<\/wp:anchor>/g)].map((m) => m[0])
    assert.equal(ancres.length, 5)
    assert.equal(ancres.filter((a, i, tout) => tout.indexOf(a) === i).length, 5)
    const attribut = (a, nom) => a.match(new RegExp(` ${nom}="([^"]*)"`))?.[1]
    const docPr = (a) => a.match(/<wp:docPr [^>]*\/>/)[0]
    const position = (a) => [Number(a.match(/<wp:positionH relativeFrom="page"><wp:posOffset>(-?\d+)/)[1]), Number(a.match(/<wp:positionV relativeFrom="page"><wp:posOffset>(-?\d+)/)[1])]

    const [fond, legende, ...symboles] = ancres
    assert.equal(attribut(fond, 'behindDoc'), '1')
    assert.equal(attribut(fond, 'locked'), '1')
    assert.match(docPr(fond), /name="Fond de plan EXISTANT - Plan RDC"/)
    assert.deepEqual(position(fond), [0, 0])
    assert.match(fond, /<wp:extent cx="15120000" cy="10692000"\/>/) // 420 × 297 mm

    assert.equal(attribut(legende, 'behindDoc'), '0')
    assert.equal(attribut(legende, 'locked'), '0')
    assert.match(docPr(legende), /descr="Légende"/)
    const tl = tailleImageLegende(mise.legende, PX_PAR_MM)
    assert.deepEqual(position(legende), [emu(mise.legende.cadreMm.x - tl.origine[0] / PX_PAR_MM), emu(mise.legende.cadreMm.y - tl.origine[1] / PX_PAR_MM)])

    // Relative heights croissantes : les symboles passent devant la légende
    const hauteurs = ancres.map((a) => Number(attribut(a, 'relativeHeight')))
    assert.deepEqual(hauteurs, [...hauteurs].sort((a, b) => a - b))

    const premiers = new Map()
    for (const sy of mise.symboles) if (!premiers.has(sy.cle)) premiers.set(sy.cle, sy)
    symboles.forEach((a, i) => {
      const sy = mise.symboles[i]
      assert.equal(attribut(a, 'behindDoc'), '0')
      assert.equal(attribut(a, 'locked'), '0')
      assert.equal(attribut(a, 'allowOverlap'), '1')
      assert.match(a, /<wp:wrapNone\/>/)
      assert.match(docPr(a), new RegExp(`descr="${sy.nom}"`))
      const taille = tailleImageSymbole(premiers.get(sy.cle), PX_PAR_MM)
      assert.deepEqual(position(a), [emu(sy.xMm - taille.centre[0] / PX_PAR_MM), emu(sy.yMm - taille.centre[1] / PX_PAR_MM)])
      // Le point d'insertion tombe sur le relevé (à l'EMU près)
      assert.ok(Math.abs(position(a)[0] + emu(taille.centre[0] / PX_PAR_MM) - emu(sy.xMm)) <= 1)
    })
    assert.deepEqual(mise.symboles.map((sy) => sy.nom).sort(), ['Détecteur de fumée', 'Luminaire', 'Luminaire'].sort())

    // Deux images de symbole seulement (les deux luminaires partagent la leur)
    const medias = Object.entries(fichiers).filter(([n]) => n.startsWith('word/media/'))
    const egal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    const symbolesRanges = medias.filter(([, o]) => [...planche.symboles.values()].some((p) => egal(p, o)))
    assert.equal(symbolesRanges.length, 2)
    assert.ok(medias.some(([, o]) => egal(o, planche.legende)))

    // Pied paginé sur la garde et les tableaux, vide sur la planche
    assert.match(sections[0].pied, /PAGE/)
    assert.doesNotMatch(s.pied, /PAGE|État des lieux/)
    assert.match(sections[2].pied, /NUMPAGES/)
  })

  test('planche sans fond : symboles posés, « Plan indisponible » écrit', async () => {
    const { planche, parametres } = etagePlanche()
    const { sections } = await ouvrir(documentWordEdl({ ...parametres, planches: [{ ...planche, fond: null }] }))
    const ancres = [...sections[1].contenu.matchAll(/<wp:anchor /g)]
    assert.equal(ancres.length, 4)
    assert.match(textes(sections[1].contenu), /RDC — Plan indisponible/)
  })

  test('les images de la planche se calculent sans docx (ordre, tailles en mm)', () => {
    const { mise, planche } = etagePlanche()
    const liste = imagesPlancheWord(planche)
    assert.deepEqual(liste.map((i) => i.nom), ['Fond de plan EXISTANT - Plan RDC', 'Légende', ...mise.symboles.map((s) => s.nom)])
    assert.deepEqual([liste[0].largeurMm, liste[0].hauteurMm], [420, 297])
    assert.deepEqual(liste.map((i) => i.rang), [1, 2, 3, 4, 5])
    assert.ok(liste[0].fond && !liste[1].fond && !liste[2].fond)
  })

  test('tableau d’un niveau : 7 colonnes, en-tête répété, une ligne par pièce, statuts écrits', async () => {
    const { sections } = await ouvrir(documentWordEdl(donnees()))
    const tableaux = sections[3].contenu
    assert.match(textes(tableaux), /DESCRIPTION DES PIÈCES/)
    assert.match(textes(tableaux), /État des lieux — 9901 · Maison de l’essai/)
    assert.match(textes(tableaux), /LECTURE DU TABLEAU/)
    assert.match(textes(tableaux), /Sources\. Relevé sur site du 18 novembre 2026 \(Rédacteur Inventé\)/)
    const tables = [...tableaux.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0]).filter((x) => /PIÈCE/.test(textes(x)))
    assert.equal(tables.length, 2) // RDC, R+1
    const rdc = tables[0]
    const rangees = [...rdc.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((m) => m[0])
    // En-tête + Séjour + Salle d'eau + Hors pièces (le Cellier n'est pas visité)
    assert.equal(rangees.length, 4)
    assert.match(rangees[0], /<w:tblHeader\/>/)
    const cases = (r) => [...r.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((m) => textes(m[0]).replace(/ /g, ' ').trim())
    assert.deepEqual(cases(rangees[0]), ['PIÈCE', 'SOL', 'MUR', 'PLAFOND', 'BLOC PORTE', 'ÉQUIPEMENTS', 'POINTS PARTICULIERS'])
    const sejour = cases(rangees[1])
    assert.match(sejour[0], /01\s+Séjour25 m² · HSP 2,50 m/)
    assert.match(sejour[1], /CONSERVER\s+Parquet chêne/)
    assert.match(sejour[1], /DÉPOSER\s+Plinthes : Bois/)
    assert.match(sejour[2], /RAFRAÎCHIR\s+Peinture blanche/)
    assert.equal(sejour[3], 'Non décrit')
    assert.match(sejour[4], /DÉPOSER\s+HUISSERIE\s+bois/)
    assert.match(sejour[5], /Prise double ×2 · h 0,30 · Ph 1/)
    assert.match(sejour[6], /Fissure au droit de la fenêtre/)
    assert.match(cases(rangees[3])[0], /Hors pièces/)
    assert.match(cases(rangees[3])[6], /Fissure en façade/)
    // Couleurs des statuts : Déposer blanc sur orange foncé, Rafraîchir sur fond clair
    assert.match(rangees[1], /<w:shd w:fill="B9481B"[^>]*\/>[\s\S]*?<w:color w:val="FFFFFF"\/>|<w:color w:val="FFFFFF"\/>[\s\S]*?<w:shd [^>]*w:fill="B9481B"/)
    assert.match(rangees[1], /w:fill="FFF4E0"/)
    // Comptes et pièces non visitées sous le titre du niveau
    assert.match(textes(tableaux), /2 locaux · 2 à déposer · 1 à rafraîchir · 1 à conserver · 0 à préciser · 1 désordre/)
    assert.match(textes(tableaux), /Pièces non visitées \(1\) : 03 Cellier/)
  })

  test('garde : chiffres clés et points d’attention en texte', async () => {
    const { sections } = await ouvrir(documentWordEdl(donnees()))
    const garde = textes(sections[0].contenu)
    assert.match(garde, /pièces relevées/)
    assert.match(garde, /POINTS D’ATTENTION/)
    assert.match(garde, /Désordres/)
    assert.match(garde, /À déposer/)
  })

  test('annexe des photos : par niveau puis par pièce, légendes « Ph n »', async () => {
    const { sections, fichiers } = await ouvrir(documentWordEdl(donnees()))
    const annexe = textes(sections[4].contenu)
    assert.match(annexe, /Annexe — Photos/)
    assert.match(annexe, /Ph 1 · 01 Séjour · P1 · Prise double/)
    assert.match(annexe, /Ph 2 · 02 Salle d’eau/)
    assert.match(sections[4].pied, /9901 Maison de l(’|&apos;)essai · État des lieux · page /)
    // Logo et deux photos
    assert.equal(Object.keys(fichiers).filter((n) => n.startsWith('word/media/')).length, 3)
  })

  test('sans images ni planches : le document se fabrique quand même, plans signalés indisponibles', async () => {
    const { paragraphes, fichiers, sections } = await ouvrir(documentWordEdl(donnees({ images: {} })))
    assert.equal(Object.keys(fichiers).filter((n) => n.startsWith('word/media/')).length, 0)
    assert.equal(paragraphes.filter((p) => p.includes('Plan indisponible')).length, 2)
    // Sans photo, pas d'annexe
    assert.deepEqual(sections.map(formatSection), ['A4 portrait', 'A3 paysage', 'A3 paysage', 'A3 paysage'])
  })

  test('nom du fichier à côté du PDF', () => {
    assert.equal(nomFichierWordEdl(affaire, new Date(2026, 10, 18)), '2026-11-18-9901-etat-des-lieux.docx')
  })
})
