// DPGF : lecture des tableaux Excel et PDF, lien au CCTP.
// Tableaux inventés : aucun extrait réel de DPGF dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  lireDpgfExcel, casesDePage, lirePdfPieces, cleNumero, lienCctpDpgf, formatQuantite, lireNombre,
} from '../src/modules/etude/pieces-ecrites/dpgfLogique.js'
import { lignesDePage, lireLot } from '../src/modules/etude/pieces-ecrites/piecesLogique.js'

// Une grille Excel : nombres en `valeur`, texte affiché en `texte`
const cellule = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'object') return v
  return { texte: String(v), valeur: v }
}
const grille = (...lignes) => lignes.map((l) => l.map(cellule))
const resume = (lignes) => lignes.map((l) => [l.numero, l.designation, l.unite, l.quantite ?? l.quantiteTexte])

// Un fragment pdf.js (largeur de 5 points par caractère par défaut)
const frag = (str, x, y, largeur = str.length * 5, t = 10) => ({ str, transform: [t, 0, 0, t, x, y], width: largeur })
const page = (numero, ...items) => ({ numero, lignes: lignesDePage(items), cases: casesDePage(items) })

describe('DPGF Excel', () => {
  test('numéro, désignation, unité, quantité ; détails rattachés ; lot lu sur la feuille du tableau', () => {
    const tableau = grille(
      ['Désignation', null, 'U', 'Quantité', 'Prix unitaire en €', 'Montant en €'],
      ['5', 'DESCRIPTION DES OUVRAGES'],
      ['5.1', 'REPRISE DE CLOISON', 'ml', 12],
      ['5.2', 'REPRISE DE SOLS'],
      [null, 'reprise de sols', 'm2', 26],
      [null, 'reprise de plinthes', 'ml', 22],
      ['5.3', 'RACCORDS'],
      [null, 'A inclure dans les prix unitaires', 'CP'],
      [null, 'Montant HT du Lot N°12 ESSAI', null, null, null, 0],
    )
    const lu = lireDpgfExcel({
      feuilles: [{ nom: 'Lot N°12 PDG', grille: [[null]] }, { nom: 'Lot N°12 PEINTURE ESSAI', grille: tableau }],
      nomFichier: 'DPGF essai.xlsx',
    })
    assert.deepEqual(lu.colonnes, { numero: 0, designation: 1, unite: 2, quantite: 3 })
    assert.deepEqual(resume(lu.lignes), [
      ['5', 'DESCRIPTION DES OUVRAGES', null, undefined],
      ['5.1', 'REPRISE DE CLOISON', 'ml', 12],
      ['5.2', 'REPRISE DE SOLS', null, undefined],
      [null, 'reprise de sols', 'm2', 26],
      [null, 'reprise de plinthes', 'ml', 22],
      ['5.3', 'RACCORDS', null, undefined],
      [null, 'A inclure dans les prix unitaires', null, 'CP'],
    ].map((l) => l.map((v) => (v === undefined ? null : v))))
    assert.equal(lu.lignes[4].article, '5.2')
    assert.equal(lu.lignes[2].titre, true)
    assert.equal(lu.lignes[1].titre, false)
    assert.deepEqual([lu.lot.numero, lu.lot.nom], [12, 'Peinture essai'])
  })

  test('colonnes ailleurs, libellé de chapitre dans la colonne voisine, sous-totaux et totaux écartés', () => {
    const tableau = grille(
      [null, null, null, null, 'D.P.G.F'],
      ['Indice 1', null, null, null, 'LOT N° 5 - CHAUFFAGE ESSAI'],
      ['Code', null, 'Désignation', null, null, 'Unité', 'Qté', null, 'P.U. HT', null, 'MONTANT'],
      ['2.1', null, 'CHAUFFAGE'],
      ['2.1.1', null, 'Unité extérieure', null, null, 'U', 11, null, null, null, 0],
      [null, null, 'Liaison frigorifique', null, null, 'ml', 275],
      [null, null, 'Sous Total', null, null, null, null, null, null, null, 0],
      ['2.2', 'Dépose'],
      [null, null, 'Dépose des anciens ballons', null, null, 'ens', 11],
      [null, null, 'TOTAL H.T.', null, null, null, null, null, null, null, 0],
      [null, null, 'TOTAL T.T.C', null, null, null, null, null, null, null, 0],
      [null, 'Fait à :   Le :'],
    )
    const lu = lireDpgfExcel({ feuilles: [{ nom: 'Feuil1', grille: tableau }], nomFichier: 'essai.xlsx' })
    assert.deepEqual(lu.colonnes, { numero: 0, designation: 1, unite: 5, quantite: 6 })
    assert.deepEqual(resume(lu.lignes), [
      ['2.1', 'CHAUFFAGE', null, null],
      ['2.1.1', 'Unité extérieure', 'U', 11],
      [null, 'Liaison frigorifique', 'ml', 275],
      ['2.2', 'Dépose', null, null],
      [null, 'Dépose des anciens ballons', 'ens', 11],
    ])
    assert.deepEqual([lu.lot.numero, lu.lot.nom, lu.indice], [5, 'Chauffage essai', '1'])
  })

  test('en-tête répété qui n’arrive qu’après les premiers articles ; « 1.10 » lu tel qu’affiché ; « 2 portes » n’est pas un article', () => {
    const tableau = grille(
      [null, 'LOT ESSAI'],
      ['1', 'GENERALITES', 'PM'],
      ['1.6', 'VERIFICATIONS'],
      [null, null, 'U.', 'Q.', 'P. U.', 'TOT.'],
      [null, '- Vérification par un organisme', 'ens', 3, null, 0],
      [{ texte: '1.10', valeur: 1.1 }, 'DOCUMENTS A CONSULTER', 'PM'],
      [null, null, 'U.', 'Q.', 'P. U.', 'TOT.'],
      [null, null, null, null, null, '1 - GENERALITES - TOTAL H.T. ....'],
      ['2', 'TRAVAUX'],
      [null, '2 portes à reprendre', 'u', 2],
    )
    const lu = lireDpgfExcel({ feuilles: [{ nom: 'DPGF', grille: tableau }], nomFichier: 'essai.xls' })
    assert.deepEqual(resume(lu.lignes), [
      ['1', 'GENERALITES', null, 'PM'],
      ['1.6', 'VERIFICATIONS', null, null],
      [null, '- Vérification par un organisme', 'ens', 3],
      ['1.10', 'DOCUMENTS A CONSULTER', null, 'PM'],
      ['2', 'TRAVAUX', null, null],
      [null, '2 portes à reprendre', 'u', 2],
    ])
    assert.equal(lu.lignes[5].article, '2')
  })

  test('numéro en tête de désignation, préambule ignoré, arrêt sur la signature, quantité arrondie', () => {
    const tableau = grille(
      ['Art.', 'Désignation', 'U', 'Quantité', 'Prix', 'Total Euros'],
      [null, 'PRÉAMBULE : l’entreprise renseigne toutes les lignes'],
      ['3', 'DESCRIPTION DES TRAVAUX'],
      [null, '3.1 RAGREAGE'],
      [null, 'Localisation : ensemble des surfaces'],
      [null, 'Boutique', 'M2', 30.240000000000002, 0, 0],
      [null, '3.2 ETANCHEITE'],
      [null, '3.2.1 Cornière'],
      [null, 'Boutique', 'ML', 5.45],
      [null, 'Sous Total TRAVAUX DE CARRELAGE', null, null, null, 0],
      [null, 'MONTANT TOTAL HT'],
      [null, 'TVA 20%'],
      ['ENTREPRISE Vu et accepté A ……, le ……'],
      [null, '9.9 NE DOIT PAS ETRE LU', 'u', 1],
    )
    const lu = lireDpgfExcel({ feuilles: [{ nom: 'DPGF', grille: tableau }], nomFichier: 'essai.xlsx' })
    assert.deepEqual(resume(lu.lignes), [
      ['3', 'DESCRIPTION DES TRAVAUX', null, null],
      ['3.1', 'RAGREAGE', null, null],
      [null, 'Localisation : ensemble des surfaces', null, null],
      [null, 'Boutique', 'M2', 30.24],
      ['3.2', 'ETANCHEITE', null, null],
      ['3.2.1', 'Cornière', null, null],
      [null, 'Boutique', 'ML', 5.45],
    ])
  })

  test('aucune feuille reconnue : pas de lignes, colonnes nulles (l’écran demande)', () => {
    const lu = lireDpgfExcel({ feuilles: [{ nom: 'Feuil1', grille: grille(['a', 'b'], ['c', 'd']) }], nomFichier: 'x.xlsx' })
    assert.deepEqual([lu.lignes, lu.colonnes], [[], null])
  })

  test('choix manuel des colonnes', () => {
    const tableau = grille(['1', 'Ouvrage', 'ens', 2], ['1.1', 'Détail', 'u', 4])
    const lu = lireDpgfExcel({
      feuilles: [{ nom: 'A', grille: tableau }], nomFichier: 'x.xlsx',
      choix: { feuille: 'A', colonnes: { numero: 0, designation: 1, unite: 2, quantite: 3 } },
    })
    assert.deepEqual(resume(lu.lignes), [['1', 'Ouvrage', 'ens', 2], ['1.1', 'Détail', 'u', 4]])
  })
})

describe('DPGF PDF', () => {
  const enTete = (y) => [frag('Art.', 50, y), frag('Désignation', 200, y), frag('U', 408, y), frag('Quantité', 426, y), frag('Prix', 480, y), frag('Total', 525, y)]

  test('tableau sous une couverture ; rubrique « Localisation » ; détail en retrait ; sous-total écarté', () => {
    const pages = [
      page(1, frag('LOT 8 - CARRELAGE ESSAI', 100, 700, 115, 14), frag('déc-24', 400, 699), frag('DECOMPTE DU PRIX GLOBAL', 100, 300, 115, 12)),
      page(2,
        ...enTete(780),
        frag('3', 55, 760), frag('DESCRIPTION DES TRAVAUX', 89, 760),
        frag('3.1', 89, 740, 12), frag('RAGREAGE SUR DALLAGE', 102, 740),
        frag('Localisation : ensemble des surfaces', 89, 730),
        frag('Boutique', 360, 720), frag('M2', 406, 719), frag('73,53', 434, 719), frag('-', 493, 719), frag('€', 505, 719),
        frag('3.2', 89, 700, 12), frag('ETANCHEITE', 102, 700),
        frag('Sous Total TRAVAUX', 89, 680), frag('- €', 550, 680)),
    ]
    const lu = lirePdfPieces({ pages, nomFichier: 'essai.pdf' })
    assert.equal(lu.cctp, null)
    assert.deepEqual(lu.dpgf.pages, [2])
    assert.deepEqual(resume(lu.dpgf.lignes), [
      ['3', 'DESCRIPTION DES TRAVAUX', null, null],
      ['3.1', 'RAGREAGE SUR DALLAGE', null, null],
      [null, 'Localisation : ensemble des surfaces', null, null],
      [null, 'Boutique', 'M2', 73.53],
      ['3.2', 'ETANCHEITE', null, null],
    ])
    assert.equal(lu.dpgf.lignes[3].page, 2)
    assert.equal(lu.lot.nom, 'Carrelage essai')
  })

  test('quantité entre deux lignes, texte coupé au bord continué, sous-titre séparé, numéro dans sa case malgré un saut', () => {
    const pages = [page(1,
      frag('U.', 380, 800), frag('Q.', 408, 800), frag('P. U.', 446, 800), frag('TOT.', 508, 800),
      frag('1.6', 30, 780, 15), frag('VERIFICATIONS', 64, 780),
      frag('- Vérification des installations par un organisme agréé, compris', 66, 760, 290),
      frag('ens', 377, 756), frag('3,00', 405, 756),
      frag('et de vérification CONSUEL', 64, 751, 120),
      frag('- Liaisons équipotentielles des masses métalliques, suivant', 66, 730, 290),
      frag('ens', 377, 726), frag('3,00', 405, 726),
      frag('CCTP.', 64, 721, 25),
      frag('- Détecteur conforme', 66, 700, 100), frag('u', 377, 700), frag('14', 405, 700),
      frag('Prises de courant', 64, 690, 80),
      frag('5.5.4', 30, 670, 20), frag('Tableau général', 64, 670),
    )]
    const lu = lirePdfPieces({ pages, nomFichier: 'essai.pdf' })
    assert.deepEqual(resume(lu.dpgf.lignes), [
      ['1.6', 'VERIFICATIONS', null, null],
      [null, '- Vérification des installations par un organisme agréé, compris et de vérification CONSUEL', 'ens', 3],
      [null, '- Liaisons équipotentielles des masses métalliques, suivant CCTP.', 'ens', 3],
      [null, '- Détecteur conforme', 'u', 14],
      [null, 'Prises de courant', null, null],
      ['5.5.4', 'Tableau général', null, null],
    ])
  })

  test('PDF mixte : CCTP dans les pages de texte, DPGF dans les pages à tableau (sans en-tête sur la seconde)', () => {
    const texte = (n, numero, titre, y = 700) => [frag(`${numero} ${titre}`, 50, y), frag('Le présent article décrit les ouvrages.', 50, y - 15)]
    const pages = [
      page(1, frag('LOT 3 - ESSAI', 100, 700)),
      page(2, ...texte(2, '1', 'GENERALITES'), ...texte(2, '1.1', 'OBJET', 650)),
      page(3, ...texte(3, '1.2', 'NORMES'), ...texte(3, '2', 'OUVRAGES', 650)),
      page(4, ...texte(4, '2.1', 'CLOISONS'), ...texte(4, '2.2', 'DOUBLAGES', 650)),
      page(5, frag('U.', 380, 800), frag('Q.', 408, 800), frag('P. U.', 446, 800), frag('TOT.', 508, 800),
        frag('2.1', 30, 780, 15), frag('CLOISONS', 64, 780), frag('m2', 377, 780), frag('120', 405, 780)),
      page(6, frag('2.2', 30, 780, 15), frag('DOUBLAGES', 64, 780), frag('m2', 377, 780), frag('80', 405, 780),
        frag('2.3', 30, 760, 15), frag('PLINTHES', 64, 760), frag('ml', 377, 760), frag('40', 405, 760)),
    ]
    const lu = lirePdfPieces({ pages, nomFichier: 'essai.pdf' })
    assert.deepEqual(lu.dpgf.pages, [5, 6])
    assert.deepEqual(lu.dpgf.lignes.map((l) => l.numero), ['2.1', '2.2', '2.3'])
    assert.deepEqual(lu.cctp.pages, [1, 2, 3, 4])
    assert.deepEqual(lu.cctp.articles.map((a) => a.numero), ['1', '1.1', '1.2', '2', '2.1', '2.2'])
  })

  test('une page récapitulative isolée ne fait pas un CCTP ; un CCTP seul reste un CCTP', () => {
    const tableau = page(2, frag('U.', 380, 800), frag('Q.', 408, 800), frag('P. U.', 446, 800), frag('TOT.', 508, 800),
      frag('1', 30, 780, 8), frag('GENERALITES', 64, 780), frag('ens', 377, 780), frag('1', 405, 780))
    const recap = page(3, frag('TABLEAU RECAPITULATIF', 50, 780), frag('1 - GENERALITES', 50, 760), frag('2 - TRAVAUX', 50, 740), frag('3 - DIVERS', 50, 720))
    assert.equal(lirePdfPieces({ pages: [page(1, frag('LOT 1', 50, 700)), tableau, recap], nomFichier: 'x.pdf' }).cctp, null)

    const cctp = lirePdfPieces({ pages: [
      page(1, frag('LOT 1 - ESSAI', 50, 700)),
      page(2, frag('1 GENERALITES', 50, 700), frag('Texte.', 50, 690), frag('1.1 OBJET', 50, 670), frag('Texte.', 50, 660)),
      page(3, frag('1.2 NORMES', 50, 700), frag('Texte.', 50, 690), frag('2 OUVRAGES', 50, 670), frag('Texte.', 50, 660)),
    ], nomFichier: 'x.pdf' })
    assert.equal(cctp.dpgf, null)
    assert.deepEqual(cctp.cctp.articles.map((a) => a.numero), ['1', '1.1', '1.2', '2'])
  })

  test('fragments proches réunis : un petit écart reste une espace', () => {
    const [l1, l2] = casesDePage([frag('4.3.3.6', 89, 700, 22), frag('Dépose', 112, 700), frag('7', 400, 680, 5), frag('3,53', 405.5, 680)])
    assert.equal(l1.texte, '4.3.3.6 Dépose')
    assert.equal(l2.cases[0].texte, '73,53')
  })
})

describe('nombres et lot', () => {
  test('quantités à la française', () => {
    assert.equal(lireNombre('1 650,50'), 1650.5)
    assert.equal(lireNombre('73.53'), 73.53)
    assert.equal(lireNombre('PM'), null)
    assert.equal(formatQuantite({ quantite: 1650.5 }), '1 650,5')
    assert.equal(formatQuantite({ quantite: null, quantiteTexte: 'PM' }), 'PM')
  })

  test('une date posée à côté du lot n’entre pas dans son nom, un numéro de tranche si', () => {
    const lot = (texte) => lireLot([{ numero: 1, lignes: [{ texte, taille: 14 }] }]).nom
    assert.equal(lot('LOT 8 - CARRELAGE - FAIENCE déc-24'), 'Carrelage - faience')
    assert.equal(lot('LOT 8 - CARRELAGE 10/12/2024'), 'Carrelage')
    assert.equal(lot('LOT 2 - LOGEMENTS TRANCHE 12'), 'Logements tranche 12')
  })
})

describe('lien au CCTP', () => {
  test('clé d’un numéro', () => {
    assert.equal(cleNumero('3.0'), '3')
    assert.equal(cleNumero('01.2'), '1.2')
    assert.equal(cleNumero('2.1.'), '2.1')
    assert.equal(cleNumero(' 4.1.0.0 '), '4.1')
    assert.equal(cleNumero('Type T4'), null)
  })

  test('même lot, même numéro ; lignes sans article comptées ; DPGF sans lot non relié', () => {
    const pieces = [
      { id: 'C1', type: 'cctp', lot_id: 'L1' }, { id: 'D1', type: 'dpgf', lot_id: 'L1' },
      { id: 'C2', type: 'cctp', lot_id: 'L2' }, { id: 'D3', type: 'dpgf', lot_id: null },
    ]
    const articles = [
      { id: 'a1', piece_id: 'C1', numero: '3' }, { id: 'a2', piece_id: 'C1', numero: '3.1' },
      { id: 'b1', piece_id: 'C2', numero: '3.1' },
    ]
    const lignes = [
      { id: 'l1', piece_id: 'D1', article: '3.0', ordre: 1 },
      { id: 'l3', piece_id: 'D1', article: '3.1', ordre: 3 },
      { id: 'l2', piece_id: 'D1', article: '3.1', ordre: 2 },
      { id: 'l4', piece_id: 'D1', article: '9.9', ordre: 4 },
      { id: 'l5', piece_id: 'D3', article: '3.1', ordre: 1 },
    ]
    const { parArticle, sansArticle, articleDeLigne } = lienCctpDpgf(pieces, articles, lignes)
    assert.deepEqual(parArticle.get('a1').map((l) => l.id), ['l1'])
    assert.deepEqual(parArticle.get('a2').map((l) => l.id), ['l2', 'l3'])
    assert.equal(parArticle.has('b1'), false)
    assert.equal(sansArticle.get('D1'), 1)
    assert.equal(sansArticle.get('D3'), 1)
    assert.equal(articleDeLigne.get('l2').id, 'a2')
  })
})
