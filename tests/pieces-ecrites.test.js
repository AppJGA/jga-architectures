// Pièces écrites : lecture des CCTP et recherche d'articles.
// Textes inventés : aucun extrait réel de CCTP dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  lignesDePage, retirerBruit, decouperArticles, lireLot, lireIndice, lirePiece,
  chercherArticles, extrait,
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
    assert.deepEqual(lireLot(couverture(grand('LOT 07 - OUVRAGES - IMAGINAIRES'), 'Commune fictive')), { numero: 7, nom: 'Ouvrages - imaginaires' })
    assert.deepEqual(lireLot(couverture(grand('Lot n°170 : PLOMBERIE DES NUAGES'))), { numero: 170, nom: 'Plomberie des nuages' })
    assert.deepEqual(lireLot(couverture(grand('Lot N°080 MENUISERIES EN BRUME'))), { numero: 80, nom: 'Menuiseries en brume' })
  })

  test('un nom coupé en fin de ligne continue sur la suivante', () => {
    assert.deepEqual(lireLot(couverture(grand('LOT 2 - DEMOLITION - GROS ŒUVRE -'), grand('TERRASSEMENT'))), { numero: 2, nom: 'Demolition - gros œuvre - terrassement' })
  })

  test('à défaut, le nom du fichier ; sinon rien', () => {
    assert.deepEqual(lireLot(couverture('Sans mention'), 'Affaire fictive - CCTP LOT 290 FACADES.pdf'), { numero: 290, nom: 'Facades' })
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

  test('extrait surligné autour du premier mot', () => {
    const morceaux = extrait('Début du texte. Plafond suspendu, cloisons non porteuses. Fin.', ['cloisons'], 30)
    assert.ok(morceaux.some((m) => m.surligne && m.texte === 'cloisons'))
    assert.ok(morceaux.map((m) => m.texte).join('').length <= 40)
  })
})
