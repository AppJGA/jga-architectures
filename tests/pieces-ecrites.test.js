// Pièces écrites : lecture des CCTP et recherche d'articles.
// Textes inventés : aucun extrait réel de CCTP dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  lignesDePage, retirerBruit, decouperArticles, lireLot, lireIndice, lirePiece,
  chercherArticles, extrait, proposerLot, numeroLibre, titrePiece,
  styleDePolice, traitsHorizontaux, fragmentSouligne,
  recomposerTexte,
} from '../src/modules/etude/pieces-ecrites/piecesLogique.js'

// Une page faite de lignes { texte, taille }
const page = (numero, ...lignes) => ({ numero, lignes: lignes.map((l) => (typeof l === 'string' ? { texte: l, taille: 10 } : l)) })

describe('lignes d’une page pdf.js', () => {
  test('les fragments d’une même ordonnée font une ligne, dans l’ordre', () => {
    const item = (str, x, y, t = 10) => ({ str, transform: [t, 0, 0, t, x, y] })
    const lignes = lignesDePage([item('4.1 ', 50, 700, 12), item('CLOISONS', 70, 700, 12), item('Texte du corps', 50, 680), item('', 50, 660)])
    assert.deepEqual(lignes, [{ texte: '4.1 CLOISONS', taille: 12 }, { texte: 'Texte du corps', taille: 10 }])
  })

  test('un numéro dessiné après son titre revient devant, séparé', () => {
    const item = (str, x, w) => ({ str, transform: [10, 0, 0, 10, x, 500], width: w })
    assert.equal(lignesDePage([item('INSTALLATIONS DE CHANTIER', 80, 140), item('5.1', 50, 15)])[0].texte, '5.1 INSTALLATIONS DE CHANTIER')
  })
})

describe('bruit', () => {
  const corps = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
  const pages = [1, 2, 3, 4, 5].map((n) => page(n,
    `Lot 99 : Ouvrages imaginaires  ${n}/5`, 'Commune fictive',
    `Texte ${corps[n - 1]} un`, `Texte ${corps[n - 1]} deux`, 'Localisation :', `Texte ${corps[n - 1]} trois`, `Texte ${corps[n - 1]} quatre`, `Texte ${corps[n - 1]} cinq`,
    'Établi par : bureau fictif', `Page ${n}`))

  test('en-têtes et pieds répétés disparaissent ; une ligne répétée au milieu reste', () => {
    const propres = retirerBruit(pages)
    assert.deepEqual(propres[2].lignes.map((l) => l.texte), ['Texte charlie un', 'Texte charlie deux', 'Localisation :', 'Texte charlie trois', 'Texte charlie quatre', 'Texte charlie cinq'])
  })

  test('les lignes de sommaire disparaissent', () => {
    const propres = retirerBruit([page(1, '4.2 TOITURE IMAGINAIRE ........................ 9', '2.4 VENTILATION FICTIVE ______________ 12', '4.2 TOITURE IMAGINAIRE')])
    assert.deepEqual(propres[0].lignes.map((l) => l.texte), ['4.2 TOITURE IMAGINAIRE'])
  })
})

describe('articles', () => {
  const pages = [
    page(3, '4 DESCRIPTION DES OUVRAGES IMAGINAIRES', '4.1 CLOISONS EN NUAGE', 'Les cloisons seront réalisées en nuage compressé.', 'Hauteur : 2,50 m.'),
    page(4, '4.1.2 Porte en brume', 'Porte à un vantail.', '1 porte au rez-de-chaussée', '2 portes à l’étage', '4.2 PLAFONDS', 'Plafond suspendu.'),
  ]

  test('numéro, niveau, titre, texte et page', () => {
    const a = decouperArticles(pages)
    assert.deepEqual(a.map((x) => [x.numero, x.niveau, x.titre, x.page]), [
      ['4', 1, 'DESCRIPTION DES OUVRAGES IMAGINAIRES', 3],
      ['4.1', 2, 'CLOISONS EN NUAGE', 3],
      ['4.1.2', 3, 'Porte en brume', 4],
      ['4.2', 2, 'PLAFONDS', 4],
    ])
    assert.equal(a[1].texte, 'Les cloisons seront réalisées en nuage compressé.\nHauteur : 2,50 m.')
  })

  test('un titre écrit deux fois n’apparaît qu’une fois', () => {
    const a = decouperArticles([page(2, '1 OUVRAGES FICTIFSOUVRAGES FICTIFS', 'Texte.', '2 AUTRES OUVRAGES', 'Texte.', '3 DERNIERS', 'Texte.')])
    assert.equal(a[0].titre, 'OUVRAGES FICTIFS')
  })

  test('une liste de quantités n’ouvre pas d’article', () => {
    const a = decouperArticles(pages)
    assert.match(a[2].texte, /1 porte au rez-de-chaussée\n2 portes à l’étage/)
  })

  test('sans numérotation reconnue : un article par page', () => {
    const a = decouperArticles([page(1, 'Texte libre sans titre.'), page(2, 'Autre texte.')])
    assert.deepEqual(a.map((x) => [x.numero, x.titre, x.texte]), [[null, 'Page 1', 'Texte libre sans titre.'], [null, 'Page 2', 'Autre texte.']])
  })
})

describe('lot lu sur la couverture', () => {
  const couverture = (...lignes) => [page(1, ...lignes)]
  const grand = (texte) => ({ texte, taille: 20 })

  test('les trois formes rencontrées', () => {
    assert.deepEqual(lireLot(couverture(grand('LOT 07 - OUVRAGES - IMAGINAIRES'), 'Commune fictive')), { numero: 7, numeroTexte: '07', nom: 'Ouvrages - imaginaires' })
    assert.deepEqual(lireLot(couverture(grand('Lot n°170 : PLOMBERIE DES NUAGES'))), { numero: 170, numeroTexte: '170', nom: 'Plomberie des nuages' })
    assert.deepEqual(lireLot(couverture(grand('Lot N°080 MENUISERIES EN BRUME'))), { numero: 80, numeroTexte: '080', nom: 'Menuiseries en brume' })
  })

  test('un nom coupé en fin de ligne continue sur la suivante', () => {
    assert.deepEqual(lireLot(couverture(grand('LOT 2 - DEMOLITION - GROS ŒUVRE -'), grand('TERRASSEMENT'))), { numero: 2, numeroTexte: '2', nom: 'Demolition - gros œuvre - terrassement' })
  })

  test('à défaut, le nom du fichier ; sinon rien', () => {
    assert.deepEqual(lireLot(couverture('Sans mention'), 'Affaire fictive - CCTP LOT 290 FACADES.pdf'), { numero: 290, numeroTexte: '290', nom: 'Facades' })
    assert.equal(lireLot(couverture('Sans mention'), 'document.pdf'), null)
  })

  test('indice', () => {
    assert.equal(lireIndice([page(1, 'Indice : 2')], 'x.pdf'), '2')
    assert.equal(lireIndice([page(1, 'Indice n° : 2')], 'x.pdf'), '2')
    assert.equal(lireIndice([page(1, 'Logements individuels')], 'x.pdf'), null)
    assert.equal(lireIndice([page(1, 'rien')], 'CCTP_LOT 1_IND3.pdf'), '3')
    assert.equal(lireIndice([page(1, 'rien')], 'x.pdf'), null)
  })

  test('lirePiece enchaîne tout', () => {
    const sujets = { 2: 'CHARPENTE', 3: 'COUVERTURE', 4: 'ZINGUERIE' }
    const p = lirePiece({ nomFichier: 'x.pdf', pages: [page(1, grand('LOT 03 - TOITURE')), ...[2, 3, 4].map((n) => page(n, `${n}.1 ${sujets[n]}`, `Ouvrages de ${sujets[n].toLowerCase()} imaginaires.`))] })
    assert.equal(p.lot.numero, 3)
    assert.equal(p.articles.length, 3)
    assert.equal(p.nbPages, 4)
  })
})

describe('recherche', () => {
  const articles = [
    { id: 'a', lot_id: 'l1', ordre: 1, numero: '4.1', titre: 'Cloisons en nuage', texte: 'Hauteur 2,50 m, finition peinte.' },
    { id: 'b', lot_id: 'l1', ordre: 2, numero: '4.2', titre: 'Plafonds', texte: 'Plafond suspendu, cloisons non porteuses.' },
    { id: 'c', lot_id: 'l2', ordre: 1, numero: '2.1', titre: 'Porte coupe-feu', texte: 'Porte CF ½ heure, ferme-porte.' },
  ]

  test('titre d’abord, puis texte ; sans accents ni majuscules', () => {
    assert.deepEqual(chercherArticles(articles, 'CLOISONS').map((r) => r.article.id), ['a', 'b'])
    assert.deepEqual(chercherArticles(articles, 'plafond suspendu').map((r) => r.article.id), ['b'])
  })

  test('tous les mots doivent y être ; filtre par lot', () => {
    assert.deepEqual(chercherArticles(articles, 'porte nuage'), [])
    assert.deepEqual(chercherArticles(articles, 'porte', { lotId: 'l2' }).map((r) => r.article.id), ['c'])
    assert.deepEqual(chercherArticles(articles, ' '), [])
  })

  test('le texte entier garde ses retours à la ligne', () => {
    const t = 'Ligne une.\nLigne deux, cloisons.'
    assert.equal(extrait(t, ['cloisons'], t.length + 1).map((m) => m.texte).join(''), t)
  })

  test('extrait surligné autour du premier mot', () => {
    const morceaux = extrait('Début du texte. Plafond suspendu, cloisons non porteuses. Fin.', ['cloisons'], 30)
    assert.ok(morceaux.some((m) => m.surligne && m.texte === 'cloisons'))
    assert.ok(morceaux.map((m) => m.texte).join('').length <= 40)
  })
})

describe('lot proposé à l’import', () => {
  const lots = [{ id: 'l1', numero: 7, nom: 'Métallerie' }, { id: 'l2', numero: 2, nom: 'Gros oeuvre' }]

  test('même nom, aux accents et ligatures près, ou l’un contenant l’autre : rattacher', () => {
    assert.deepEqual(proposerLot({ numero: 7, nom: 'Metallerie - serrurerie' }, lots), { mode: 'rattacher', lotId: 'l1' })
    assert.deepEqual(proposerLot({ numero: 3, nom: 'Gros œuvre' }, lots), { mode: 'rattacher', lotId: 'l2' })
  })

  test('sinon créer, sur un numéro libre', () => {
    assert.deepEqual(proposerLot({ numero: 7, nom: 'Peinture' }, lots), { mode: 'creer', numero: '8', nom: 'Peinture' })
    assert.deepEqual(proposerLot(null, lots), { mode: 'creer', numero: '1', nom: '' })
    assert.equal(numeroLibre(170, lots), 170)
    assert.deepEqual(proposerLot({ numero: 60, numeroTexte: '060', nom: 'Façades' }, lots), { mode: 'creer', numero: '060', nom: 'Façades' }, 'le zéro lu sur le CCTP reste')
  })

  test('titre de la pièce', () => {
    assert.equal(titrePiece('07', 'Métallerie'), 'Lot 07 – Métallerie')
    assert.equal(titrePiece('7', 'Métallerie'), 'Lot 7 – Métallerie')
    assert.equal(titrePiece(null, ''), 'CCTP')
  })
})

describe('mise en forme : gras, italique, souligné', () => {
  const item = (str, x, style, w = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, 500], width: w, style })

  test('la police dit gras et italique', () => {
    assert.deepEqual(styleDePolice('ABCDEF+Helvetica-BoldOblique'), { gras: true, italique: true })
    assert.deepEqual(styleDePolice('Calibri'), { gras: false, italique: false })
    assert.deepEqual(styleDePolice('Arial,Bold'), { gras: true, italique: false })
  })

  test('les plages suivent la ligne, espaces réduits', () => {
    const [l] = lignesDePage([item('Teinte :', 50), item('  RAL 7016', 95, { gras: true }), item(' mat', 150)])
    assert.equal(l.texte, 'Teinte : RAL 7016 mat')
    assert.deepEqual(l.styles, [[9, 17, 'g']])
  })

  test('un trait sous le texte souligne ; une bordure plus large que lui, non', () => {
    const OPS = { save: 1, restore: 2, transform: 3, constructPath: 4, rectangle: 5, moveTo: 6, lineTo: 7 }
    const traits = traitsHorizontaux([1, 3, 4, 2], [null, [1, 0, 0, 1, 0, 0], [[6, 7], [50, 498, 90, 498]], null], OPS)
    assert.deepEqual(traits, [[50, 90, 498]])
    assert.equal(fragmentSouligne({ transform: [10, 0, 0, 10, 50, 500], width: 40 }, traits), true)
    assert.equal(fragmentSouligne({ transform: [10, 0, 0, 10, 50, 500], width: 40 }, [[0, 500, 498]]), false, 'bordure de tableau')
    assert.equal(fragmentSouligne({ transform: [10, 0, 0, 10, 50, 520], width: 40 }, traits), false, 'trait d’une autre ligne')
  })

  test('les articles gardent leurs plages, décalées', () => {
    const pages = [page(2,
      '1 PREMIER', 'Texte simple.',
      { texte: 'Teinte : RAL 7016', taille: 10, styles: [[9, 17, 'g']] },
      '2 SECOND', 'Fin.', '3 TROISIEME', 'Fin.')]
    const [a] = decouperArticles(pages)
    assert.equal(a.texte, 'Texte simple.\nTeinte : RAL 7016')
    assert.deepEqual(a.styles, [[23, 31, 'g']])
  })

  test('l’extrait combine surlignage et mise en forme', () => {
    const morceaux = extrait('Teinte : RAL 7016 mat', ['ral'], 200, [[9, 17, 'g']])
    assert.deepEqual(morceaux, [
      { texte: 'Teinte : ', surligne: false },
      { texte: 'RAL', surligne: true, gras: true },
      { texte: ' 7016', surligne: false, gras: true },
      { texte: ' mat', surligne: false },
    ])
  })
})

describe('phrases coupées par les lignes du PDF', () => {
  // Texte inventé, mis en page comme un CCTP justifié
  const texte = [
    "Les menuiseries extérieures seront réalisées en profilés aluminium à rupture de",
    "pont thermique, de teinte au choix de l'architecte dans la gamme RAL du fabricant",
    'retenu par le maître d’ouvrage.',
    'Les prestations comprennent :',
    '- la fourniture des châssis ;',
    '- la pose sur précadre et les calfeutrements ;',
    'a) en façade nord',
    "Les vitrages seront conformes à la norme NF DTU 39 et au classement acoustique",
    'Rw+Ctr ≥ 35 dB.',
    '',
    'Article suivant après une ligne vide.',
  ].join('\n')
  const recompose = recomposerTexte(texte)

  test('même longueur : la mise en forme ne bouge pas', () => {
    assert.equal(recompose.length, texte.length)
  })
  test('une phrase coupée en milieu de ligne se recolle', () => {
    assert.ok(recompose.includes('à rupture de pont thermique, de teinte'))
    assert.ok(recompose.includes('du fabricant retenu par le maître'))
    assert.ok(recompose.includes('classement acoustique Rw+Ctr'), 'ligne pleine suivie d’une majuscule')
  })
  test('fin de phrase, puces, énumérations et lignes vides gardent leur retour', () => {
    assert.ok(recompose.includes('d’ouvrage.\nLes prestations comprennent :\n- la fourniture'))
    assert.ok(recompose.includes('châssis ;\n- la pose'))
    assert.ok(recompose.includes('calfeutrements ;\na) en façade nord\nLes vitrages'))
    assert.ok(recompose.includes('35 dB.\n\nArticle suivant'))
  })
  test('mot coupé par un trait d’union : recollé, trait gardé, même longueur', () => {
    const t = "Fourniture d'un bloc-porte avec huisse-\nrie bois et cadre périphérique en bois exotique de section courante"
    const r = recomposerTexte(t)
    assert.equal(r.length, t.length)
    assert.ok(r.includes('huisse-\u200Brie'))
    assert.ok(!r.includes('\n'))
  })
  test('une ligne en capitales est un sous-titre : son retour reste', () => {
    const t = "Lampe LED E27 15W de 1250 lm, culot standard, teinte chaude, pour tous les locaux du rez-de-chaussée\nTYPE A : caves et locaux techniques"
    assert.ok(recomposerTexte(t).includes('chaussée\nTYPE A'))
  })
  test('texte d’une ligne ou vide : inchangé', () => {
    assert.equal(recomposerTexte('Une seule ligne'), 'Une seule ligne')
    assert.equal(recomposerTexte(''), '')
  })
})
