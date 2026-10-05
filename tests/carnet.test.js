// Un interlocuteur d'affaire versé au carnet d'adresses.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ficheCarnet, memeNom } from '../src/modules/chantier/comptes-rendus/carnetLogique.js'

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
