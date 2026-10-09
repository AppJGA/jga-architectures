// Le retour du bandeau du haut, d'après l'adresse de la page.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { retourParDefaut } from '../src/core/layout/retourLogique.js'

const r = (chemin, recherche) => {
  const x = retourParDefaut(chemin, recherche)
  return x && [x.libelle, x.icone, x.vers]
}

test('pages de premier niveau : vers l’accueil ; l’accueil, rien', () => {
  for (const p of ['/dashboard', '/carnet-adresses', '/tools', '/heures', '/settings']) assert.deepEqual(r(p), ['Accueil', 'accueil', '/home'], p)
  assert.equal(r('/home'), null)
  assert.equal(r('/login'), null)
})

test('un outil : vers la boîte à outils', () => {
  assert.deepEqual(r('/tools/convertisseur'), ['Boîte à outils', 'outils', '/tools'])
  assert.deepEqual(r('/gestion-agence'), ['Accueil', 'accueil', '/home'])
  assert.deepEqual(r('/gestion-agence/calendrier'), ['Gestion d’agence', 'gestion', '/gestion-agence'])
})

test('une affaire, ses modules et leurs sous-pages', () => {
  assert.deepEqual(r('/affaires/a1'), ['Portail d’affaires', 'portail', '/dashboard'])
  assert.deepEqual(r('/affaires/a1/planning-chantier'), ['Tableau de bord de l’affaire', 'tableau', '/affaires/a1'])
  assert.deepEqual(r('/affaires/a1/comptes-rendus'), ['Tableau de bord de l’affaire', 'tableau', '/affaires/a1'])
  assert.deepEqual(r('/affaires/a1/comptes-rendus', '?cr=c2'), ['Liste des visites', 'visites', '/affaires/a1/comptes-rendus'])
  assert.deepEqual(r('/affaires/a1/opr', '?visite=v3'), ['Visites d’OPR', 'opr', '/affaires/a1/opr'])
  assert.deepEqual(r('/affaires/a1/opr', '?onglet=suivi'), ['Tableau de bord de l’affaire', 'tableau', '/affaires/a1'])
})
