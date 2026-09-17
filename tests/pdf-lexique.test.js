// Lecture des instructions de dessin d'un PDF (allègement vectoriel des plans).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { lireInstructions } from '../src/tools/rasterisation/vectoriel/lexique.js'

const CR = String.fromCharCode(13)

const lire = (texte) => {
  const octets = new TextEncoder().encode(texte)
  const liste = []
  lireInstructions(octets, (op, nombres, nNombres, nom, debut, fin, autres) => {
    liste.push({ op, nombres: Array.from(nombres.subarray(0, nNombres)), nom, brut: texte.slice(debut, fin), autres })
  })
  return liste
}

describe('instructions simples', () => {
  test('opérandes numériques et opérateur', () => {
    const [i] = lire('0.364706 0.45098 0.254902 RG')
    assert.equal(i.op, 'RG')
    assert.deepEqual(i.nombres.map(v => +v.toFixed(6)), [0.364706, 0.45098, 0.254902])
    assert.equal(i.brut, '0.364706 0.45098 0.254902 RG')
  })

  test('séparateurs retour chariot, comme dans les plans ArchiCAD', () => {
    const liste = lire(['q', '/G1 gs', '224.4 601.7 m', '224.4 601.7 l', 'S', 'Q', ''].join(CR))
    assert.deepEqual(liste.map(i => i.op), ['q', 'gs', 'm', 'l', 'S', 'Q'])
    assert.equal(liste[1].nom, 'G1')
  })

  test('nombres négatifs, signés, sans partie entière', () => {
    const [i] = lire('-1.5 +2 .25 -.5 cm')
    assert.deepEqual(i.nombres, [-1.5, 2, 0.25, -0.5])
  })

  test('les bornes permettent de recopier une instruction à l’identique', () => {
    const liste = lire('q 1 0 0 1 10 20 cm /Fm2 Do Q')
    const faire = liste.find(i => i.op === 'Do')
    assert.equal(faire.brut, '/Fm2 Do')
    assert.equal(faire.nom, 'Fm2')
  })
})

describe('opérandes à franchir sans se tromper', () => {
  test('chaîne avec parenthèses imbriquées et échappées', () => {
    const liste = lire('(Mur (en) pierre \\) conservé) Tj ET')
    assert.deepEqual(liste.map(i => i.op), ['Tj', 'ET'])
    assert.equal(liste[0].autres, 1)
  })

  test('chaîne hexadécimale et tableau de texte', () => {
    const liste = lire('<48656C6C6F> Tj [(A) -120 (B)] TJ')
    assert.deepEqual(liste.map(i => i.op), ['Tj', 'TJ'])
  })

  test('dictionnaire de contenu marqué, avec « >> » dans une chaîne', () => {
    const liste = lire('/OC << /Titre (a >> b) /N 2 >> BDC q Q')
    assert.deepEqual(liste.map(i => i.op), ['BDC', 'q', 'Q'])
    assert.equal(liste[0].nom, 'OC')
  })

  test('motif de pointillés', () => {
    const [i] = lire('[3 2] 0 d')
    assert.equal(i.op, 'd')
    assert.deepEqual(i.nombres, [0])
  })

  test('commentaire ignoré', () => {
    const liste = lire('% un commentaire' + CR + '1 w S')
    assert.deepEqual(liste.map(i => i.op), ['w', 'S'])
  })

  test('image en ligne : les données binaires ne sont pas lues comme des instructions', () => {
    const binaire = String.fromCharCode(1) + 'Q S' + String.fromCharCode(2)
    const liste = lire(`BI /W 2 /H 1 /BPC 8 /CS /G ID ${binaire} EI Q`)
    assert.deepEqual(liste.map(i => i.op), ['BI', 'EI', 'Q'])
  })

  test('booléens et null sont des opérandes', () => {
    const liste = lire('true false null x')
    assert.deepEqual(liste.map(i => i.op), ['x'])
    assert.equal(liste[0].autres, 3)
  })
})
