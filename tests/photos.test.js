// Photos des remarques : dimensions, rangement, effacement des fichiers
// partagés, espace utilisé, reprise avec la remarque.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  dimensionsCible, cheminsPhoto, fichiersAEffacer, formatOctets, niveauEspace, pointeFleche,
  resumeOrphelines, paquets,
  TAILLE_PHOTO, LIMITE_STOCKAGE,
} from '../src/modules/chantier/comptes-rendus/photosLogique.js'
import { preparerReprise } from '../src/modules/chantier/comptes-rendus/crLogique.js'

describe('dimensionsCible', () => {
  test('réduit le plus grand côté, proportions gardées', () => {
    assert.deepEqual(dimensionsCible(4032, 3024, TAILLE_PHOTO), { largeur: 1920, hauteur: 1440 })
    assert.deepEqual(dimensionsCible(3024, 4032, TAILLE_PHOTO), { largeur: 1440, hauteur: 1920 })
  })
  test('n’agrandit jamais une petite image', () => {
    assert.deepEqual(dimensionsCible(800, 600, TAILLE_PHOTO), { largeur: 800, hauteur: 600 })
  })
})

test('cheminsPhoto : un dossier par affaire, miniature à côté', () => {
  assert.deepEqual(cheminsPhoto('AFF', 'ID', 'webp'), { chemin: 'AFF/ID.webp', chemin_miniature: 'AFF/ID-mini.webp' })
})

describe('fichiersAEffacer', () => {
  const p = (n) => ({ chemin: `a/${n}.webp`, chemin_miniature: `a/${n}-mini.webp` })
  test('fichier encore utilisé par une autre visite : conservé', () => {
    assert.deepEqual(fichiersAEffacer([p(1)], ['a/1.webp']), [])
  })
  test('plus aucune ligne : photo et miniature effacées, sans doublon', () => {
    assert.deepEqual(fichiersAEffacer([p(1), p(1), p(2)], ['a/2.webp']), ['a/1.webp', 'a/1-mini.webp'])
  })
})

test('formatOctets', () => {
  assert.equal(formatOctets(512), '512 o')
  assert.equal(formatOctets(300 * 1024), '300 Ko')
  assert.equal(formatOctets(120 * 1024 ** 2), '120 Mo')
  assert.equal(formatOctets(1.25 * 1024 ** 3), '1,3 Go')
})

test('niveauEspace : alerte à 80 %, plein à 98 %', () => {
  assert.equal(niveauEspace(0.5 * LIMITE_STOCKAGE).alerte, false)
  assert.equal(niveauEspace(0.85 * LIMITE_STOCKAGE).alerte, true)
  assert.equal(niveauEspace(0.85 * LIMITE_STOCKAGE).plein, false)
  assert.equal(niveauEspace(0.99 * LIMITE_STOCKAGE).plein, true)
})

test('pointeFleche : branches symétriques en arrière de la pointe', () => {
  const [a, b] = pointeFleche(0, 0, 100, 0, 20)
  assert.ok(a.x < 100 && b.x < 100)
  assert.ok(Math.abs(a.y + b.y) < 1e-9)
})

describe('reprise des photos', () => {
  let n = 0
  const id = () => `id-${++n}`
  const base = {
    sections: [{ id: 'S1', numero_romain: 'I', titre: 'G' }], sousSections: [], crId: 'CR2', affaireId: 'A', nouvelId: id,
    remarques: [
      { id: 'R1', section_id: 'S1', description: 'ouverte', statut: 'a_faire', suivi_id: 'R1', cloture_reportee: false },
      { id: 'R2', section_id: 'S1', description: 'close déjà reportée', statut: 'fait', est_clos: true, suivi_id: 'R2', cloture_reportee: true },
    ],
    photos: [
      { id: 'P1', remarque_id: 'R1', chemin: 'A/1.webp', chemin_miniature: 'A/1-mini.webp', legende: 'Fissure', poids_octets: 300000 },
      { id: 'P2', remarque_id: 'R2', chemin: 'A/2.webp', chemin_miniature: 'A/2-mini.webp' },
    ],
  }
  test('la photo suit sa remarque reprise, même fichier, nouvelle ligne', () => {
    const r = preparerReprise(base)
    assert.equal(r.photos.length, 1)
    assert.equal(r.photos[0].remarque_id, r.remarques[0].id)
    assert.equal(r.photos[0].chemin, 'A/1.webp')
    assert.equal(r.photos[0].cr_id, 'CR2')
    assert.equal(r.photos[0].legende, 'Fissure')
    assert.notEqual(r.photos[0].id, 'P1')
  })
})

test('resumeOrphelines : une photo et sa miniature comptent pour une', () => {
  const r = resumeOrphelines([
    { chemin: 'a/1.webp', taille: 250000 }, { chemin: 'a/1-mini.webp', taille: 15000 },
    { chemin: 'a/2-mini.jpg', taille: 12000 },
  ])
  assert.deepEqual(r, { photos: 2, fichiers: 3, taille: 277000 })
  assert.deepEqual(resumeOrphelines([]), { photos: 0, fichiers: 0, taille: 0 })
})

test('paquets', () => {
  assert.deepEqual(paquets([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(paquets([], 2), [])
})
