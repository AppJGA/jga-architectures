// Briques communes aux PDF des plannings : texte mis en forme, grille selon
// la granularité, périodes, mémorisation des textes.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { nettoyerHtml, estVide } from '../src/shared/planning/export/texteRiche.js'
import {
  bordureGauche, niveauDuJour, fondPeriode, pastelPdf, groupesDePeriodes, TRAITS_GRILLE,
} from '../src/shared/planning/export/grilleExport.js'
import { lireTextesExport, ecrireTextesExport } from '../src/shared/planning/export/textesExport.js'

describe('nettoyerHtml', () => {
  test('garde la mise en forme simple', () => {
    const html = '<b>Gras</b> <i>it</i> <u>s</u><ul><li>un</li></ul><div>ligne<br>suite</div>'
    assert.equal(nettoyerHtml(html), html)
  })

  test('retire tous les attributs', () => {
    assert.equal(nettoyerHtml('<p style="color:red" class="x" onclick="alert(1)">A</p>'), '<p>A</p>')
  })

  test('jette script et style avec leur contenu', () => {
    assert.equal(nettoyerHtml('A<script>alert(1)</script><style>p{}</style>B'), 'AB')
  })

  test('les balises inconnues disparaissent, leur texte reste', () => {
    assert.equal(nettoyerHtml('<span style="x"><a href="javascript:x">lien</a></span> <img src=x onerror=alert(1)>'), 'lien ')
  })

  test('referme ce qui reste ouvert, ignore les fermetures orphelines', () => {
    assert.equal(nettoyerHtml('<b>a<i>b'), '<b>a<i>b</i></b>')
    assert.equal(nettoyerHtml('a</ul>b'), 'ab')
  })

  test('le texte est échappé, les entités gardées', () => {
    assert.equal(nettoyerHtml('1 < 2 &amp; 3&nbsp;€ & "x"'), '1 &lt; 2 &amp; 3&nbsp;€ &amp; &quot;x&quot;')
  })

  test('commentaires et vide', () => {
    assert.equal(nettoyerHtml('<!-- [if gte mso 9]><xml>w</xml><![endif] -->Texte'), 'Texte')
    assert.equal(nettoyerHtml(null), '')
  })

  test('estVide', () => {
    assert.equal(estVide('<div><br></div>'), true)
    assert.equal(estVide('&nbsp; '), true)
    assert.equal(estVide('<b>x</b>'), false)
  })
})

describe('grille selon la granularité', () => {
  test('jours : trois niveaux, du plus marqué au plus discret', () => {
    assert.equal(bordureGauche('mois', 'day'), TRAITS_GRILLE.mois)
    assert.equal(bordureGauche('semaine', 'day'), TRAITS_GRILLE.semaine)
    assert.equal(bordureGauche('jour', 'day'), TRAITS_GRILLE.jour)
  })

  test('semaines : plus de lignes de jour', () => {
    assert.equal(bordureGauche('semaine', 'week'), TRAITS_GRILLE.semaine)
    assert.equal(bordureGauche('jour', 'week'), 'none')
  })

  test('mois : seulement les mois', () => {
    assert.equal(bordureGauche('mois', 'month'), TRAITS_GRILLE.mois)
    assert.equal(bordureGauche('semaine', 'month'), 'none')
    assert.equal(bordureGauche('jour', 'month'), 'none')
  })

  test('niveau d’un jour : le 1er du mois l’emporte sur le lundi', () => {
    assert.equal(niveauDuJour(new Date(2026, 5, 1)), 'mois')   // lundi 1er juin 2026
    assert.equal(niveauDuJour(new Date(2026, 5, 8)), 'semaine')
    assert.equal(niveauDuJour(new Date(2026, 5, 9)), 'jour')
  })
})

describe('périodes', () => {
  test('bloquante plus soutenue qu’informative', () => {
    assert.equal(fondPeriode({ couleur: '#000000' }), 'rgb(179,179,179)')
    assert.equal(fondPeriode({ couleur: '#000000', est_bloquante: false }), 'rgb(217,217,217)')
  })

  test('une couleur illisible ne casse pas le rendu', () => {
    assert.match(pastelPdf('pas-une-couleur', 0.3), /^rgb\(\d+,\d+,\d+\)$/)
  })

  test('groupes de colonnes consécutives', () => {
    const p = { id: 'p' }
    assert.deepEqual(groupesDePeriodes([null, p, p, null]).map(g => [g.periode?.id ?? null, g.nombre]),
      [[null, 1], ['p', 2], [null, 1]])
  })
})

describe('textes mémorisés par affaire', () => {
  test('relus pour la même affaire, vides pour une autre', () => {
    const memoire = new Map()
    globalThis.localStorage = {
      getItem: (k) => memoire.get(k) ?? null,
      setItem: (k, v) => memoire.set(k, v),
    }
    ecrireTextesExport('chantier', 'a1', { entete: '<b>E</b>', pied: 'P' })
    assert.deepEqual(lireTextesExport('chantier', 'a1'), { entete: '<b>E</b>', pied: 'P' })
    assert.deepEqual(lireTextesExport('chantier', 'a2'), { entete: '', pied: '' })
    assert.deepEqual(lireTextesExport('etude', 'a1'), { entete: '', pied: '' })
  })

  test('sans stockage disponible, rien ne plante', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('bloqué') } }
    assert.deepEqual(lireTextesExport('chantier', 'a1'), { entete: '', pied: '' })
    ecrireTextesExport('chantier', 'a1', { entete: 'x' })
  })
})
