// Recherche dans le carnet d'adresses, depuis le formulaire d'un interlocuteur.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { optionsCarnet, filtrerOptions, remplirDepuis } from '../src/modules/chantier/comptes-rendus/rechercheCarnetLogique.js'

const carnet = [
  {
    id: 'apave', raison_sociale: 'Apave', adresse: '12 rue des Prés', code_postal: '01000', ville: 'Bourg-en-Bresse',
    telephone: '04 74 00 00 00', email: 'contact@apave.com',
    interlocuteurs: [
      { id: 'dv', prenom: 'Damien', nom: 'Vinot', fonction: 'Coordonnateur SPS', telephone: '06 28 20 02 06', email: 'damien.vinot@apave.com' },
      { id: 'ml', prenom: 'Marie', nom: 'Lefèvre', fonction: 'Contrôleur technique' },
    ],
  },
  { id: 'renaud', raison_sociale: 'RENAUD SAS', ville: 'Mâcon', telephone: '03 85 31 01 33', interlocuteurs: [] },
]
const options = optionsCarnet(carnet)
const titres = (l) => l.map((o) => o.titre)

test('une option par personne et une par organisation', () => {
  assert.deepEqual(titres(options), ['Damien Vinot', 'Marie Lefèvre', 'Apave', 'RENAUD SAS'])
  assert.equal(options[0].detail, 'Apave · Coordonnateur SPS · 06 28 20 02 06 · damien.vinot@apave.com')
})

test('sans saisie, tout ; puis la liste se précise lettre à lettre', () => {
  assert.equal(filtrerOptions(options, '').length, 4)
  assert.deepEqual(titres(filtrerOptions(options, 'a')), ['Apave', 'Damien Vinot', 'Marie Lefèvre', 'RENAUD SAS'])
  assert.deepEqual(titres(filtrerOptions(options, 'ap')), ['Apave', 'Damien Vinot', 'Marie Lefèvre'])
  assert.deepEqual(titres(filtrerOptions(options, 'apave dam')), ['Damien Vinot'])
})

test('dans tous les champs, sans majuscules ni accents', () => {
  assert.deepEqual(titres(filtrerOptions(options, 'lefevre')), ['Marie Lefèvre'])
  assert.deepEqual(titres(filtrerOptions(options, 'coordonnateur')), ['Damien Vinot'])
  assert.deepEqual(titres(filtrerOptions(options, 'macon')), ['RENAUD SAS'])
  assert.deepEqual(titres(filtrerOptions(options, 'bourg')), ['Apave', 'Damien Vinot', 'Marie Lefèvre'])
  assert.deepEqual(titres(filtrerOptions(options, 'vinot@')), ['Damien Vinot'])
})

test('un numéro, avec ou sans espaces', () => {
  assert.deepEqual(titres(filtrerOptions(options, '0628')), ['Damien Vinot'])
  assert.deepEqual(titres(filtrerOptions(options, '06 28')), ['Damien Vinot'])
  assert.deepEqual(titres(filtrerOptions(options, '0385')), ['RENAUD SAS'])
})

test('choisir une personne remplit toute la fiche ; une organisation garde la personne saisie', () => {
  const personne = filtrerOptions(options, 'vinot')[0]
  assert.deepEqual(remplirDepuis(personne, { categorie: 'csps', prenom: '' }), {
    categorie: 'csps', prenom: 'Damien', nom: 'Vinot', fonction: 'Coordonnateur SPS', organisation: 'Apave',
    adresse: '12 rue des Prés, 01000 Bourg-en-Bresse', telephone: '06 28 20 02 06', email: 'damien.vinot@apave.com',
  })
  const marie = filtrerOptions(options, 'marie')[0]
  assert.equal(remplirDepuis(marie, {}).telephone, '04 74 00 00 00', 'à défaut, le numéro de l’organisation')
  const orga = filtrerOptions(options, 'renaud')[0]
  assert.deepEqual(remplirDepuis(orga, { prenom: 'Bastien', nom: 'Desbleds' }), {
    prenom: 'Bastien', nom: 'Desbleds', organisation: 'RENAUD SAS', adresse: 'Mâcon', telephone: '03 85 31 01 33', email: '',
  })
})
