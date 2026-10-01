// Convertisseur d'images : reconnaissance des fichiers, noms et dimensions des
// sorties. Le décodage lui-même (heic-to, canvas) demande un navigateur.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  ACCEPT, FORMATS_SORTIE, TAILLES, estHeif, formatDe, extensionDe,
  dimensionsCible, nomSortie, nomArchive, modeTelechargement, formatTaille,
} from '../src/tools/convertisseur/conversionLogique.js'

const JPEG = FORMATS_SORTIE.find(f => f.id === 'jpeg')

// En-tête d'un conteneur HEIF : taille de boîte, « ftyp », marque principale
const entete = marque => new Uint8Array([0, 0, 0, 24, ...[...`ftyp${marque}`].map(c => c.charCodeAt(0))])

describe('reconnaissance des fichiers', () => {
  test('un HEIC se reconnaît à son contenu, quelle que soit l’extension', () => {
    assert.equal(estHeif(entete('heic')), true)
    assert.equal(estHeif(entete('mif1')), true)
    assert.equal(formatDe('IMG_0001.jpg', entete('heic')).id, 'heic')
    assert.equal(formatDe('sans-extension', entete('heix')).id, 'heic')
  })

  test('un MP4 a aussi une boîte ftyp, mais n’est pas un HEIC', () => {
    assert.equal(estHeif(entete('isom')), false)
    assert.equal(formatDe('video.mp4', entete('isom')), null)
  })

  test('sans en-tête reconnu, l’extension décide, sans tenir compte de la casse', () => {
    assert.equal(formatDe('IMG_0001.HEIC', new Uint8Array(0)).id, 'heic')
    assert.equal(formatDe('photo.JPEG', null).id, 'jpeg')
    assert.equal(formatDe('plan.png', null).id, 'png')
    assert.equal(formatDe('rapport.pdf', null), null)
  })

  test('extensionDe ne prend que la dernière extension', () => {
    assert.equal(extensionDe('a.b.HEIC'), 'heic')
    assert.equal(extensionDe('dossier.x/fichier'), '')
    assert.equal(extensionDe(''), '')
  })

  test('le sélecteur de fichiers propose les extensions de tous les formats', () => {
    assert.match(ACCEPT, /\.heic/)
    assert.match(ACCEPT, /\.jpg/)
  })
})

describe('dimensions', () => {
  test('la taille d’origine ne change rien', () => {
    assert.deepEqual(dimensionsCible(4032, 3024, null), { largeur: 4032, hauteur: 3024 })
  })

  test('l’allègement ramène le grand côté à la limite, proportions gardées', () => {
    const email = TAILLES.find(t => t.id === 'email')
    assert.deepEqual(dimensionsCible(4032, 3024, email.coteMax), { largeur: 2000, hauteur: 1500 })
    assert.deepEqual(dimensionsCible(3024, 4032, email.coteMax), { largeur: 1500, hauteur: 2000 })
  })

  test('une image déjà petite n’est jamais agrandie', () => {
    assert.deepEqual(dimensionsCible(800, 600, 2000), { largeur: 800, hauteur: 600 })
  })
})

describe('noms des fichiers produits', () => {
  test('l’extension est remplacée', () => {
    assert.equal(nomSortie('IMG_1234.HEIC', JPEG, new Set()), 'IMG_1234.jpg')
  })

  test('deux photos du même nom ne s’écrasent pas dans le ZIP', () => {
    const pris = new Set()
    assert.equal(nomSortie('IMG_1234.HEIC', JPEG, pris), 'IMG_1234.jpg')
    assert.equal(nomSortie('IMG_1234.JPG', JPEG, pris), 'IMG_1234 (2).jpg')
    assert.equal(nomSortie('img_1234.heic', JPEG, pris), 'img_1234 (3).jpg')
  })

  test('un nom vide reçoit un nom par défaut', () => {
    assert.equal(nomSortie('.heic', JPEG, new Set()), 'image.jpg')
  })

  test('l’archive porte la date du jour', () => {
    assert.equal(nomArchive(new Date(2026, 9, 1)), 'photos-converties-2026-10-01.zip')
  })
})

describe('téléchargement', () => {
  test('une seule photo se télécharge directement, plusieurs dans un ZIP', () => {
    assert.equal(modeTelechargement(0), null)
    assert.equal(modeTelechargement(1), 'fichier')
    assert.equal(modeTelechargement(12), 'zip')
  })

  test('les tailles s’écrivent à la française', () => {
    assert.equal(formatTaille(350 * 1024), '350 Ko')
    assert.equal(formatTaille(3.4 * 1024 * 1024), '3,4 Mo')
  })
})
