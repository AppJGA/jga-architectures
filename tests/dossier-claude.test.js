// Dossier pour Claude : couleurs des plans, contenu des fichiers.
// Textes inventés : aucun extrait réel de plan ni de CCTP dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { readFileSync } from 'node:fs'

import {
  nomCouleur, ecrituresColorees, annotationsDePage, textePlan,
  VERSION_CONSIGNES, FICHIERS_DOSSIER, estCctpCommun, ordonnerPieces, libellePiece, lotsSansCctp,
  numeroPlan, titrePlan, ordonnerPlans, intituleAffaire, messageClaude, nomDossier,
  sommaireMarkdown, cctpMarkdown, plansMarkdown,
} from '../src/modules/etude/pieces-ecrites/dossierClaudeLogique.js'

// Codes d'opérations factices : seuls les noms comptent pour la logique
const OPS = {
  save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5,
  setFillRGBColor: 6, setStrokeRGBColor: 7, setFont: 8, setHScale: 9, setCharSpacing: 10,
  setWordSpacing: 11, setLeading: 12, setTextRise: 13, setTextRenderingMode: 14,
  beginText: 15, setTextMatrix: 16, moveText: 17, setLeadingMoveText: 18, nextLine: 19,
  showText: 20, showSpacedText: 21, nextLineShowText: 22, nextLineSetSpacingShowText: 23,
}
const glyphes = (texte, largeur = 500) => [...texte].map((c) => ({ unicode: c, width: largeur, isSpace: c === ' ' }))
const MM = 72 / 25.4 // points par mm

describe('couleurs', () => {
  test('les seuils de la référence', () => {
    assert.equal(nomCouleur([230, 20, 20]), 'rouge')
    assert.equal(nomCouleur([0, 0, 255]), 'bleu')
    assert.equal(nomCouleur([0, 160, 0]), 'vert')
    assert.equal(nomCouleur([255, 140, 0]), 'orange')
    assert.equal(nomCouleur([200, 0, 200]), 'magenta')
    assert.equal(nomCouleur([0, 0, 0]), '')
    assert.equal(nomCouleur([128, 128, 128]), '')
  })

  test('chaque écriture prend la couleur de remplissage courante, à sa position', () => {
    const fn = [OPS.setFillRGBColor, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.endText,
      OPS.setFillRGBColor, OPS.beginText, OPS.setTextMatrix, OPS.showText]
    const args = [[255, 0, 0], null, ['F1', 10], [1, 0, 0, 1, 100, 500], [glyphes('Démolir')], null,
      [0, 0, 255], null, [1, 0, 0, 1, 50, 300], [glyphes('2,60')]]
    const e = ecrituresColorees(fn, args, OPS)
    assert.deepEqual(e.map((x) => [Math.round(x.x), Math.round(x.y), x.rgb.join(',')]), [[100, 500, '255,0,0'], [50, 300, '0,0,255']])
  })

  test('les écritures qui se suivent avancent de la largeur des glyphes', () => {
    const fn = [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.showText]
    const args = [null, ['F1', 10], [1, 0, 0, 1, 100, 500], [glyphes('AB')], [glyphes('CD')]]
    const [, deuxieme] = ecrituresColorees(fn, args, OPS)
    assert.equal(Math.round(deuxieme.x), 110) // 2 glyphes de 500/1000 × 10
  })

  test('save / restore et transform : la couleur et la matrice reviennent', () => {
    const fn = [OPS.save, OPS.setFillRGBColor, OPS.transform, OPS.restore, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText]
    const args = [null, [255, 0, 0], [2, 0, 0, 2, 10, 10], null, null, ['F1', 10], [1, 0, 0, 1, 20, 30], [glyphes('x')]]
    const [e] = ecrituresColorees(fn, args, OPS)
    assert.deepEqual([e.x, e.y, e.rgb], [20, 30, [0, 0, 0]])
  })

  test('un symbole (forme) applique sa matrice au texte qu’il contient', () => {
    const fn = [OPS.paintFormXObjectBegin, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.paintFormXObjectEnd]
    const args = [[[1, 0, 0, 1, 100, 200], null], null, ['F1', 10], [1, 0, 0, 1, 5, 5], [glyphes('PAC')], null]
    const [e] = ecrituresColorees(fn, args, OPS)
    assert.deepEqual([e.x, e.y], [105, 205])
  })
})

describe('annotations d’une page', () => {
  // Page A3 paysage : 420 × 297 mm
  const view = [0, 0, 420 * MM, 297 * MM]
  // Fragment pdf.js à (x, y) mm depuis le haut, hauteur 2,5 mm
  const frag = (str, xMm, yMm, largeurMm = str.length * 1.5) => ({
    str, width: largeurMm * MM, height: 2.5 * MM,
    transform: [1, 0, 0, 1, xMm * MM, (297 - yMm - 2.5) * MM],
  })
  const ecr = (xMm, yMm, rgb) => ({ x: xMm * MM, y: (297 - yMm - 2.5) * MM, rgb })

  test('position en mm depuis le haut, couleur de l’écriture la plus proche', () => {
    const items = [frag('Démolition cloison', 100, 50), frag('2,60', 200, 80)]
    const ecritures = [ecr(100, 50, [230, 0, 0]), ecr(200, 80, [0, 0, 255])]
    assert.deepEqual(annotationsDePage({ items, ecritures, view }), [
      { x: 100, y: 50, couleur: 'rouge', texte: 'Démolition cloison' },
      { x: 200, y: 80, couleur: 'bleu', texte: '2,60' },
    ])
  })

  test('les fragments d’une même ligne se rejoignent', () => {
    const items = [frag('Séjour', 100, 50, 9), frag('/', 109.2, 50, 1), frag('21,07 m2', 111, 50)]
    assert.deepEqual(annotationsDePage({ items, ecritures: [], view }).map((a) => a.texte), ['Séjour/ 21,07 m2'])
  })

  test('un exposant (m²) rejoint son texte', () => {
    const items = [frag('21,07 m', 100, 50, 10), { ...frag('2', 110.2, 49, 0.8), height: 1.5 * MM }]
    assert.deepEqual(annotationsDePage({ items, ecritures: [], view }).map((a) => a.texte), ['21,07 m2'])
  })

  test('les lignes d’un même bloc et de même couleur fusionnent par « / »', () => {
    const items = [frag('ME01', 200, 70), frag('all. 0,90', 200, 74), frag('Cuisine', 200, 78)]
    const ecritures = [ecr(200, 70, [0, 160, 0]), ecr(200, 74, [0, 160, 0]), ecr(200, 78, [0, 0, 0])]
    assert.deepEqual(annotationsDePage({ items, ecritures, view }), [
      { x: 200, y: 70, couleur: 'vert', texte: 'ME01 / all. 0,90' },
      { x: 200, y: 78, couleur: '', texte: 'Cuisine' },
    ])
  })

  test('trop loin (plus de 6 mm plus bas ou 12 mm de côté) : pas de fusion', () => {
    const items = [frag('A', 100, 50), frag('B', 100, 57), frag('C', 113, 60)]
    assert.equal(annotationsDePage({ items, ecritures: [], view }).length, 3)
  })

  test('les fragments vides sont ignorés', () => {
    assert.deepEqual(annotationsDePage({ items: [frag('  ', 10, 10)], ecritures: [], view }), [])
  })
})

describe('texte d’un plan', () => {
  test('titre, format de chaque page, une ligne par annotation', () => {
    const t = textePlan({ titre: '40 RDC', pages: [{ largeur: 420, hauteur: 297, annotations: [
      { x: 10, y: 20, couleur: 'bleu', texte: '2,60' }, { x: 30, y: 40, couleur: '', texte: 'Séjour' },
    ] }] })
    assert.equal(t, [
      '=== 40 RDC ===',
      '--- page 1 : 420×297 mm, (x,y) en mm depuis le coin haut gauche ---',
      '(10,20) [bleu] 2,60',
      '(30,40) Séjour',
    ].join('\n'))
  })

  test('une page sans texte le dit', () => {
    const t = textePlan({ titre: 'Scan', pages: [{ largeur: 420, hauteur: 297, annotations: [] }] })
    assert.match(t, /aucun texte lisible/)
  })
})

const affaire = { code_affaire: '9901-ESS', nom: 'Réhabilitation de 4 maisons', projet_commune: 'Villeneuve', projet_code_postal: '01000', moa_nom: 'Office exemple', phase: 'DCE' }
const lots = [
  { id: 'l2', numero: 80, numero_affiche: '080', nom: 'Menuiseries extérieures' },
  { id: 'l1', numero: 60, numero_affiche: '060', nom: 'Couverture' },
  { id: 'l3', numero: 140, numero_affiche: null, nom: 'Peinture' },
]
const pieces = [
  { id: 'p2', lot_id: 'l2', titre: 'Lot 080 — Menuiseries extérieures', nom_fichier: 'CCTP 080.pdf', indice: 'B', nb_pages: 12, nb_articles: 2 },
  { id: 'p0', lot_id: null, titre: 'CCTPC', nom_fichier: 'Exemple - CCTPC.pdf', indice: null, nb_pages: 9, nb_articles: 1 },
  { id: 'p1', lot_id: 'l1', titre: 'Lot 060 — Couverture', nom_fichier: 'CCTP 060.pdf', indice: null, nb_pages: 8, nb_articles: 1 },
]

describe('consignes', () => {
  test('la version du fichier est celle du code', () => {
    const md = readFileSync(new URL('../src/modules/etude/pieces-ecrites/consignesConformite.md', import.meta.url), 'utf8')
    assert.equal(md.split('\n')[0], `Version des consignes : ${VERSION_CONSIGNES}`)
  })
})

describe('pièces et plans', () => {
  test('le CCTP commun vient en tête, puis les lots par numéro', () => {
    assert.equal(estCctpCommun(pieces[1]), true)
    assert.equal(estCctpCommun(pieces[0]), false)
    assert.deepEqual(ordonnerPieces(pieces, lots).map((p) => p.id), ['p0', 'p1', 'p2'])
    assert.equal(libellePiece(pieces[1], lots), 'CCTP commun')
    assert.equal(libellePiece(pieces[0], lots), 'Lot 080 — Menuiseries extérieures')
  })

  test('un CCTP dont le titre dit « commun » est commun même rattaché', () => {
    assert.equal(estCctpCommun({ lot_id: 'l9', titre: 'CCTP commun à tous les lots', nom_fichier: 'x.pdf' }), true)
  })

  test('lots sans CCTP', () => {
    assert.deepEqual(lotsSansCctp(lots, pieces).map((l) => l.id), ['l3'])
  })

  test('les plans se rangent par leur numéro en tête du nom', () => {
    assert.equal(numeroPlan('40 RDC.pdf'), '40')
    assert.equal(numeroPlan('Plan de masse.pdf'), null)
    assert.equal(titrePlan('40 RDC.PDF'), '40 RDC')
    const ordre = ordonnerPlans([{ nomFichier: '100 Détail.pdf' }, { nomFichier: 'Notice.pdf' }, { nomFichier: '9 Masse.pdf' }, { nomFichier: '40 RDC.pdf' }])
    assert.deepEqual(ordre.map((p) => p.nomFichier), ['9 Masse.pdf', '40 RDC.pdf', '100 Détail.pdf', 'Notice.pdf'])
  })
})

describe('message et nom', () => {
  test('le message commence par le code de l’affaire (titre de la conversation)', () => {
    assert.equal(messageClaude(affaire), '9901-ESS — Réhabilitation de 4 maisons — Rapport complet')
    assert.equal(messageClaude({ nom: 'Sans code' }), 'Sans code — Rapport complet')
  })
  test('nom du ZIP sans caractère interdit', () => {
    assert.equal(nomDossier(affaire), 'Dossier Claude - 9901-ESS')
    assert.equal(nomDossier({ nom: 'A/B: test' }), 'Dossier Claude - A-B- test')
  })
  test('intitulé de l’affaire', () => {
    assert.equal(intituleAffaire(affaire), '9901-ESS — Réhabilitation de 4 maisons — Villeneuve (01000) — maître d’ouvrage : Office exemple — phase DCE')
  })
})

describe('fichiers du dossier', () => {
  test('sommaire : version, CCTP, plans, lots sans CCTP, pièces non fournies', () => {
    const md = sommaireMarkdown({
      affaire, pieces, lots, date: '2026-10-08',
      plans: [{ nomFichier: '40 RDC.pdf', largeur: 420, hauteur: 297, nbPages: 1, sansTexte: false }, { nomFichier: '41 Scan.pdf', largeur: 594, hauteur: 420, nbPages: 2, sansTexte: true }],
    })
    assert.ok(md.includes(`Version des consignes attendue : ${VERSION_CONSIGNES}`))
    assert.match(md, /\| CCTP commun \| Exemple - CCTPC\.pdf \| — \| 9 \| 1 \|/)
    assert.match(md, /\| Lot 080 — Menuiseries extérieures \| CCTP 080\.pdf \| B \| 12 \| 2 \|/)
    assert.match(md, /\| 40 \| 40 RDC \| 420×297 \| 1 \|/)
    assert.match(md, /\| 41 \| 41 Scan \(sans texte lisible\) \| 594×420 \| 2 à 3 \|/)
    assert.match(md, /Lot 140 — Peinture/)
    assert.match(md, /DPGF/)
    assert.ok(md.indexOf('CCTP commun') < md.indexOf('Lot 060'))
  })

  test('CCTP : en-tête par pièce, articles numérotés avec leur page, phrases recollées', () => {
    const articles = [
      { piece_id: 'p2', ordre: 2, numero: '5.1', titre: 'FENÊTRES', page: 4, texte: 'Fourniture et pose\nde fenêtres PVC.' },
      { piece_id: 'p2', ordre: 1, numero: '1', titre: 'OBJET', page: 3, texte: 'Texte.' },
      { piece_id: 'p0', ordre: 1, numero: null, titre: 'Page 2', page: 2, texte: 'Généralités.' },
    ]
    const md = cctpMarkdown({ affaire, pieces, articles, lots })
    assert.ok(md.indexOf('## CCTP COMMUN') < md.indexOf('## LOT 080'))
    assert.match(md, /Fichier : CCTP 080\.pdf · indice : B · 12 pages · 2 articles/)
    assert.ok(md.indexOf('§1 OBJET [p.3]') < md.indexOf('§5.1 FENÊTRES [p.4]'))
    assert.match(md, /Fourniture et pose de fenêtres PVC\./)
    assert.match(md, /\nPage 2 \[p\.2\]\n/)
  })

  test('plans : mode d’emploi puis les textes dans l’ordre', () => {
    const md = plansMarkdown({ affaire, textes: ['=== 40 RDC ===\n(1,2) A', '=== 41 R+1 ===\n(3,4) B'] })
    assert.match(md, /coin HAUT GAUCHE/)
    assert.ok(md.indexOf('=== 40 RDC ===') < md.indexOf('=== 41 R+1 ==='))
  })

  test('les quatre noms de fichiers', () => {
    assert.deepEqual(Object.values(FICHIERS_DOSSIER), ['1 - Sommaire.md', '2 - CCTP.md', '3 - Plans (texte).md', '4 - Plans.pdf'])
  })
})
