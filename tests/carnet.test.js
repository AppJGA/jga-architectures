// Un interlocuteur d'affaire versé au carnet d'adresses.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { ficheCarnet, memeNom, correspondanceCarnet, ecartsCarnet, ecrituresCarnet } from '../src/modules/chantier/comptes-rendus/carnetLogique.js'

test('une personne d’une organisation : la fiche de l’organisation, la personne en contact', () => {
  assert.deepEqual(ficheCarnet({
    prenom: ' Damien ', nom: 'Vinot', fonction: 'Coordonnateur SPS', organisation: 'Apave',
    adresse: '1 rue des Prés', telephone: '06 28 20 02 06', email: 'damien.vinot@apave.com',
  }), {
    entreprise: { raison_sociale: 'Apave', adresse: '1 rue des Prés' },
    interlocuteur: { prenom: 'Damien', nom: 'Vinot', fonction: 'Coordonnateur SPS', telephone: '06 28 20 02 06', email: 'damien.vinot@apave.com' },
  })
})

test('une organisation seule : ses coordonnées sur la fiche', () => {
  assert.deepEqual(ficheCarnet({ organisation: 'Mairie de Coligny', telephone: '04 74 30 10 18', email: '' }), {
    entreprise: { raison_sociale: 'Mairie de Coligny', adresse: null, telephone: '04 74 30 10 18', email: null },
    interlocuteur: null,
  })
})

test('une personne sans organisation : la fiche à son nom', () => {
  assert.deepEqual(ficheCarnet({ prenom: 'Jean', nom: 'Arragon', telephone: '04 74 42 38 11' }), {
    entreprise: { raison_sociale: 'Jean Arragon', adresse: null, telephone: '04 74 42 38 11', email: null },
    interlocuteur: null,
  })
})

test('rien à verser sans nom ni organisation', () => {
  assert.equal(ficheCarnet({ fonction: 'Architecte', email: 'x@y.fr' }), null)
})

test('même fiche malgré les majuscules et les accents', () => {
  assert.equal(memeNom('APAVE ', 'apave'), true)
  assert.equal(memeNom('Société Générale', 'societe generale'), true)
  assert.equal(memeNom('Apave', 'Socotec'), false)
  assert.equal(memeNom('', ''), false)
})

describe('interlocuteur déjà au carnet', () => {
  const carnet = [
    { id: 'apave', raison_sociale: 'APAVE', adresse: '12 rue des Prés', code_postal: '01000', ville: 'Bourg-en-Bresse', telephone: '04 74 00 00 00', email: 'contact@apave.com',
      interlocuteurs: [{ id: 'dv', prenom: 'Damien', nom: 'Vinot', fonction: 'Coordonnateur SPS', telephone: '06 28 20 02 06', email: null }] },
    { id: 'arragon', raison_sociale: 'Jean Arragon', telephone: '04 74 42 38 11', interlocuteurs: [] },
  ]
  const damien = { prenom: 'Damien', nom: 'Vinot', fonction: 'Coordonnateur SPS', organisation: 'Apave', adresse: '12 rue des Prés, 01000 Bourg-en-Bresse', telephone: '06 28 20 02 06', email: 'contact@apave.com' }

  test('retrouvé par son organisation et son nom, ou par la fiche à son nom', () => {
    const l = correspondanceCarnet(damien, carnet)
    assert.deepEqual([l.entreprise.id, l.personne.id], ['apave', 'dv'])
    assert.deepEqual(correspondanceCarnet({ prenom: 'Jean', nom: 'Arragon' }, carnet).entreprise.id, 'arragon')
    assert.equal(correspondanceCarnet({ organisation: 'Socotec' }, carnet), null)
  })

  test('aucun écart quand le formulaire reprend le carnet (e-mail de l’organisation compris)', () => {
    assert.deepEqual(ecartsCarnet(correspondanceCarnet(damien, carnet), damien), [])
  })

  test('les écarts, et les mises à jour qui en découlent', () => {
    const l = correspondanceCarnet(damien, carnet)
    const modifie = { ...damien, telephone: '07 45 12 12 12', email: 'd.vinot@apave.com', adresse: '14 rue des Prés, 01000 Bourg-en-Bresse', fonction: '' }
    const ecarts = ecartsCarnet(l, modifie)
    assert.deepEqual(ecarts.map((x) => [x.libelle, x.avant, x.apres]), [
      ['Adresse', '12 rue des Prés, 01000 Bourg-en-Bresse', '14 rue des Prés, 01000 Bourg-en-Bresse'],
      ['Téléphone', '06 28 20 02 06', '07 45 12 12 12'],
      ['E-mail', 'contact@apave.com', 'd.vinot@apave.com'],
    ], 'une fonction effacée n’efface pas celle du carnet')
    assert.deepEqual(ecrituresCarnet(ecarts), [
      { table: 'entreprises', id: 'apave', champs: { adresse: '14 rue des Prés' } },
      { table: 'interlocuteurs', id: 'dv', champs: { telephone: '07 45 12 12 12', email: 'd.vinot@apave.com' } },
    ])
  })

  test('une fiche à son nom : ses coordonnées sont celles de la fiche', () => {
    const l = correspondanceCarnet({ prenom: 'Jean', nom: 'Arragon' }, carnet)
    assert.deepEqual(ecrituresCarnet(ecartsCarnet(l, { prenom: 'Jean', nom: 'Arragon', telephone: '06 11 22 33 44' })), [
      { table: 'entreprises', id: 'arragon', champs: { telephone: '06 11 22 33 44' } },
    ])
  })
})
