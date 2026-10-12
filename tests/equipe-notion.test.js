// Équipe des cartes Notion créées par l'app : colonne « 👤 Equipe JGA »
// remplie d'après l'équipe de l'affaire dans l'app (prénoms rapprochés,
// associés et personnes inactives écartés). Noms INVENTÉS : dépôt public.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clePrenom, equipesNotion, estCarteApp, operationsEquipe, ajouterEquipe } from '../src/shared/notion/equipeNotionLogique.js'
import { membreEquipeDepuisPage, sourceEquipe, carteDepuisPage, proprietesNouvelleCarte, operationValide } from '../src/shared/notion/notionApiLogique.js'

const MEMBRES = [
  { id: 'n-alix', nom: 'Alix', role: 'Collaborateur', actif: true },
  { id: 'n-marie', nom: 'Marie-Jo', role: 'Collaborateur', actif: true },
  { id: 'n-paul', nom: 'Paul Martin', role: 'Associé', actif: true },
  { id: 'n-zoe', nom: 'Zoé', role: 'Collaborateur', actif: false },
  { id: 'n-leo', nom: 'Léo', role: 'Collaborateur', actif: true },
]
const PROFILS = {
  u1: { id: 'u1', prenom: 'Alix ', nom: 'Durand', type_compte: 'agence' },
  u2: { id: 'u2', prenom: 'Marie Jo', nom: 'Petit', type_compte: 'agence' },
  u3: { id: 'u3', prenom: 'Paul', nom: 'Martin', type_compte: 'agence', est_associe: true },
  u4: { id: 'u4', prenom: 'Zoe', nom: 'Blanc', type_compte: 'agence' },
  u5: { id: 'u5', prenom: 'Léo', nom: 'Roux', type_compte: 'exterieur' },
  u6: { id: 'u6', prenom: 'Inconnu', nom: 'X', type_compte: 'agence' },
}

test('prénom : sans majuscules, accents, tirets ni espaces', () => {
  assert.equal(clePrenom(' Marie-Jo '), clePrenom('marie jo'))
  assert.equal(clePrenom('Zoé'), 'zoe')
})

test('équipe Notion d’une affaire : responsable et collaborateurs actifs, sans associés ni extérieurs', () => {
  const collaborateurs = [
    { affaire_id: 'a1', user_id: 'u1', role: 'proprietaire' },
    { affaire_id: 'a1', user_id: 'u2', role: 'collaborateur' },
    { affaire_id: 'a1', user_id: 'u3', role: 'collaborateur' },  // associé
    { affaire_id: 'a1', user_id: 'u4', role: 'collaborateur' },  // inactive dans Notion
    { affaire_id: 'a1', user_id: 'u5', role: 'exterieur' },
    { affaire_id: 'a1', user_id: 'u6', role: 'collaborateur' },  // absent de Notion
    { affaire_id: 'a2', user_id: 'u3', role: 'proprietaire' },
  ]
  const equipes = equipesNotion(collaborateurs, PROFILS, MEMBRES)
  assert.deepEqual(equipes.get('a1'), ['n-alix', 'n-marie'])
  assert.equal(equipes.has('a2'), false)
})

test('équipe Notion : une fiche Associé de Notion n’est jamais prise, même pour un compte non associé dans l’app', () => {
  const equipes = equipesNotion([{ affaire_id: 'a1', user_id: 'u9', role: 'collaborateur' }],
    { u9: { id: 'u9', prenom: 'Paul', nom: 'Martin', type_compte: 'agence' } }, MEMBRES)
  assert.equal(equipes.has('a1'), false)
})

test('carte de l’app : reconnue à son format', () => {
  assert.equal(estCarteApp('2699 ABC – Rendu PRO 16/10/26'), true)
  assert.equal(estCarteApp('2696 – Rendu 16/10/26'), true)
  assert.equal(estCarteApp('2699 ABC – Rendu 16/10'), true)
  assert.equal(estCarteApp('2699 ABC : Rendu PRO 16/10/26'), false)
  assert.equal(estCarteApp('!!! 2699 ABC – Rendu 16/10/26'), false)
})

const ligne = (extra) => ({ id: 'l1', page_id: 'p1', affaire_id: 'a1', jalon_id: 7, date_synchro: '2026-10-20', ...extra })
const carte = (extra) => ({ id: 'p1', titre: '2699 ABC – Rendu 20/10/26', equipe: [], ...extra })

test('équipe à compléter : seulement une carte de l’app, liée à une affaire, sans personne', () => {
  const equipes = new Map([['a1', ['n-alix']]])
  assert.deepEqual(operationsEquipe({ cartes: [carte()], registre: [ligne()], equipes }),
    [{ action: 'equipe', pageId: 'p1', equipe: ['n-alix'], ligneIds: [] }])
  // Carte écrite à la main : on n'y touche pas
  assert.deepEqual(operationsEquipe({ cartes: [carte({ titre: '2699 ABC : Rendu 20/10/26' })], registre: [ligne()], equipes }), [])
  // Déjà remplie dans Notion : le choix de l'agence est gardé
  assert.deepEqual(operationsEquipe({ cartes: [carte({ equipe: ['n-marie'] })], registre: [ligne()], equipes }), [])
  // Affaire absente de l'app, ou équipe vide
  assert.deepEqual(operationsEquipe({ cartes: [carte()], registre: [ligne({ affaire_id: null })], equipes }), [])
  assert.deepEqual(operationsEquipe({ cartes: [carte()], registre: [ligne()], equipes: new Map() }), [])
})

test('plan : la carte créée porte l’équipe, la carte à compléter s’ajoute, pas une carte partie à la corbeille', () => {
  const plan = {
    jalons: [],
    cartes: [{ action: 'creer', ligneId: 'l9', titre: '2699 ABC – OPR 20/10/26', semaine: '2026-10-20' }, { action: 'corbeille', pageId: 'p2', ligneIds: ['l2'] }],
    registre: { ecrire: [{ ligne: { id: 'l9', affaire_id: 'a1' }, nouvelle: true }], supprimer: [] },
  }
  const equipes = new Map([['a1', ['n-alix']]])
  ajouterEquipe(plan, {
    cartes: [carte(), carte({ id: 'p2' })],
    registre: [ligne(), ligne({ id: 'l2', page_id: 'p2' })],
    equipes,
  })
  assert.deepEqual(plan.cartes[0].equipe, ['n-alix'])
  assert.deepEqual(plan.cartes.slice(2), [{ action: 'equipe', pageId: 'p1', equipe: ['n-alix'], ligneIds: [] }])
})

test('API Notion : fiche d’équipe, source reliée, relation lue et écrite, opération validée', () => {
  const page = { id: 'n1', properties: { Nom: { title: [{ plain_text: 'Alix' }] }, Role: { select: { name: 'Collaborateur' } }, Actif: { checkbox: true } } }
  assert.deepEqual(membreEquipeDepuisPage(page), { id: 'n1', nom: 'Alix', role: 'Collaborateur', actif: true })
  assert.equal(sourceEquipe({ properties: { '👤 Equipe JGA': { type: 'relation', relation: { data_source_id: 'ds-1' } } } }), 'ds-1')
  assert.equal(sourceEquipe({ properties: {} }), null)
  const lue = carteDepuisPage({ id: 'p1', properties: { 'N° Affaire': { title: [] }, '👤 Equipe JGA': { relation: [{ id: 'n1' }] } } })
  assert.deepEqual(lue.equipe, ['n1'])
  const uuid = '35c563d1-521f-80eb-ac4f-ca287398a551'
  assert.deepEqual(proprietesNouvelleCarte({ titre: 'T', semaine: null, equipe: [uuid] })['👤 Equipe JGA'], { relation: [{ id: uuid }] })
  assert.equal('👤 Equipe JGA' in proprietesNouvelleCarte({ titre: 'T', semaine: null }), false)
  assert.equal(operationValide({ action: 'equipe', pageId: uuid, equipe: [uuid] }), true)
  assert.equal(operationValide({ action: 'equipe', pageId: uuid, equipe: [] }), false)
  assert.equal(operationValide({ action: 'equipe', pageId: uuid, equipe: ['../x'] }), false)
  assert.equal(operationValide({ action: 'creer', titre: 'T', equipe: ['../x'] }), false)
  assert.equal(operationValide({ action: 'creer', titre: 'T', equipe: [uuid] }), true)
})
