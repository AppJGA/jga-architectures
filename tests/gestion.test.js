// Gestion d'agence : calendrier des rendus et suivi des tâches de toutes les
// affaires (placement des jalons, mois, échéances, droits, regroupements).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  vendrediSemaineIso, rendus, grilleMois, parJour, prochaines, ecartJours,
  affairesModifiables, mesAffaires, groupesTaches, initiales, equipeParAffaire,
} from '../src/gestion/gestionLogique.js'

test('vendredi d’une semaine ISO', () => {
  assert.equal(vendrediSemaineIso(42, 2026), '2026-10-16')
  assert.equal(vendrediSemaineIso(1, 2026), '2026-01-02') // la semaine 1 commence le 29 décembre 2025
  assert.equal(vendrediSemaineIso(1, 2021), '2021-01-08') // 2021 : le 1er janvier est en semaine 53 de 2020
  assert.equal(vendrediSemaineIso(53, 2020), '2021-01-01')
  assert.equal(vendrediSemaineIso(13, 2026), '2026-03-27') // passage à l’heure d’été sans décalage
})

const affaires = [
  { id: 'a1', code_affaire: '2618-LVV', nom: 'Logements', phase: 'pro' },
  { id: 'a2', code_affaire: '2606-CPA', nom: 'CPA', phase: 'chantier' },
]

test('rendus : chantier à sa date, étude au vendredi, affaire inconnue écartée', () => {
  const ev = rendus(
    [{ id: 1, affaire_id: 'a2', label: 'OPR', date: '2026-10-20', couleur: '#f00' }, { id: 9, affaire_id: 'zz', label: 'X', date: '2026-10-20' }],
    [{ id: 2, affaire_id: 'a1', label: 'Rendu APD', semaine: 42, annee: 2026, couleur: '#00f' }],
    affaires,
  )
  assert.deepEqual(ev.map((e) => [e.id, e.date, e.origine, e.semaine ?? null]), [
    ['etude-2', '2026-10-16', 'etude', 42],
    ['chantier-1', '2026-10-20', 'chantier', null],
  ])
  assert.equal(ev[0].affaire.code_affaire, '2618-LVV')
  assert.equal(ev[0].couleur, '#00f')
})

test('grille du mois : semaines complètes du lundi au dimanche', () => {
  const g = grilleMois(2026, 11) // novembre 2026 commence un dimanche
  assert.equal(g[0][0].date, '2026-10-26')
  assert.equal(g[0][0].duMois, false)
  assert.equal(g[0][6].date, '2026-11-01')
  assert.equal(g[0][6].duMois, true)
  assert.ok(g.every((s) => s.length === 7))
  assert.equal(g[g.length - 1][6].date, '2026-12-06')
  assert.equal(grilleMois(2027, 2).length, 4) // février 2027 : du lundi 1er au dimanche 28
})

test('par jour et prochaines échéances', () => {
  const ev = [
    { id: 'a', date: '2026-10-09' }, { id: 'b', date: '2026-11-08' }, { id: 'c', date: '2026-11-09' },
    { id: 'd', date: '2026-10-01' }, { id: 'e', date: '2026-10-09' },
  ]
  assert.deepEqual(parJour(ev).get('2026-10-09').map((e) => e.id), ['a', 'e'])
  assert.deepEqual(prochaines(ev, '2026-10-09', 30).map((e) => e.id), ['a', 'e', 'b'])
  assert.equal(ecartJours('2026-10-09', '2026-10-12'), 3)
  assert.equal(ecartJours('2026-03-27', '2026-03-30'), 3) // heure d’été
})

const collabs = [
  { affaire_id: 'a1', user_id: 'moi', role: 'proprietaire' },
  { affaire_id: 'a2', user_id: 'autre', role: 'collaborateur' },
  { affaire_id: 'a3', user_id: 'moi', role: 'exterieur' },
]

test('affaires modifiables : même règle que la base', () => {
  const toutes = [...affaires, { id: 'a3' }, { id: 'a4' }]
  assert.deepEqual([...affairesModifiables(toutes, collabs, 'moi')].sort(), ['a1', 'a4'])
  assert.deepEqual([...mesAffaires(collabs, 'moi')], ['a1'])
})

test('groupes de tâches : retards en tête, filtres', () => {
  const t = (id, affaire_id, extra = {}) => ({ id, type: 'tache', affaire_id, texte: id, fait_le: null, echeance: null, responsable_id: null, created_at: '2026-10-01', ...extra })
  const taches = [
    t('t1', 'a1', { echeance: '2026-10-20', responsable_id: 'moi' }),
    t('t2', 'a2', { echeance: '2026-10-01' }),
    t('t3', 'a2'),
    t('t4', 'a1', { fait_le: '2026-10-05' }),
    { id: 'x', type: 'modele', affaire_id: 'a1' },
  ]
  const g = groupesTaches(taches, affaires, {}, '2026-10-09')
  assert.deepEqual(g.map((x) => x.affaire.id), ['a2', 'a1'])
  assert.deepEqual(g[0].taches.map((x) => x.id), ['t2', 't3'])
  assert.equal(g[0].enRetard, 1)
  assert.deepEqual(g[1].taches.map((x) => x.id), ['t1'])

  assert.deepEqual(groupesTaches(taches, affaires, { enRetard: true }, '2026-10-09').map((x) => x.taches.map((y) => y.id)), [['t2']])
  assert.deepEqual(groupesTaches(taches, affaires, { personne: 'moi' }, '2026-10-09').map((x) => x.affaire.id), ['a1'])
  assert.deepEqual(groupesTaches(taches, affaires, { affaires: new Set(['a2']) }, '2026-10-09').map((x) => x.affaire.id), ['a2'])
})

test('initiales : comme sur la page d’une affaire, prénom puis nom', () => {
  assert.equal(initiales({ prenom: 'Anne-Lise', nom: 'Aumeunier' }), 'AA')
  assert.equal(initiales({ prenom: 'Véronique', nom: 'Durafour-Soro' }), 'VD')
  assert.equal(initiales({ prenom: ' anthonin ', nom: 'bridon' }), 'AB')
  assert.equal(initiales({ prenom: '', nom: '', email: 'claire@exemple.fr' }), 'C')
  assert.equal(initiales(null), '')
})

test('équipe d’une affaire : ni associés ni extérieurs, propriétaire d’abord', () => {
  const profils = {
    p1: { prenom: 'Anthonin', nom: 'Bridon' }, p2: { prenom: 'Anne-Lise', nom: 'Aumeunier' },
    as: { prenom: 'Cédric', nom: 'Thomas', est_associe: true }, ex: { prenom: 'Bureau', nom: 'Études' },
  }
  const collabs = [
    { affaire_id: 'a1', user_id: 'p1', role: 'collaborateur' }, { affaire_id: 'a1', user_id: 'p2', role: 'proprietaire' },
    { affaire_id: 'a1', user_id: 'as', role: 'proprietaire' }, { affaire_id: 'a1', user_id: 'ex', role: 'exterieur' },
    { affaire_id: 'a2', user_id: 'inconnu', role: 'collaborateur' },
  ]
  const equipe = equipeParAffaire(collabs, profils)
  assert.deepEqual(equipe.get('a1'), [
    { id: 'p2', initiales: 'AA', nom: 'Anne-Lise Aumeunier', proprietaire: true },
    { id: 'p1', initiales: 'AB', nom: 'Anthonin Bridon', proprietaire: false },
  ])
  assert.equal(equipe.has('a2'), false)
})

test('PDF d’un mois : grille, détail trié, échappement, rien des autres mois', async () => {
  const { htmlCalendrierMois, titreMois } = await import('../src/gestion/exportCalendrier.js')
  const aff = { id: 'a1', code_affaire: '2618-LVV', nom: 'Logements <Vignes>' }
  const ev = [
    { id: 'e2', date: '2026-10-20', libelle: 'OPR', affaire: aff, origine: 'chantier', couleur: '#2A8A4E' },
    { id: 'e1', date: '2026-10-16', libelle: 'Rendu PRO', affaire: aff, origine: 'etude', semaine: 42, couleur: '#E8602C' },
    { id: 'e3', date: '2026-11-03', libelle: 'Réception', affaire: aff, origine: 'chantier' },
  ].sort((a, b) => a.date.localeCompare(b.date))
  const equipes = new Map([['a1', [{ id: 'p', initiales: 'AA', nom: 'Anne-Lise Aumeunier', proprietaire: true }]]])
  const html = htmlCalendrierMois({ annee: 2026, mois: 10, evenements: ev, equipes, filtres: 'Toutes les affaires', edition: '09/10/2026' })
  assert.equal(titreMois(2026, 10), 'Octobre 2026')
  assert.match(html, /Calendrier des rendus — Octobre 2026/)
  assert.match(html, /2 rendus · édité le 09\/10\/2026/)
  assert.match(html, /Logements &lt;Vignes&gt;/)
  assert.doesNotMatch(html, /<Vignes>/)
  assert.doesNotMatch(html, /Réception/)
  assert.ok(html.indexOf('ven. 16 octobre') < html.indexOf('mar. 20 octobre'))
  assert.match(html, /Étude · S42/)
  assert.match(html, /Anne-Lise Aumeunier <i>\(propriétaire\)<\/i>/)
})
