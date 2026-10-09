// To-do list d'une affaire : fusion de la liste type et de l'état de
// l'affaire, compteurs, phase ouverte par défaut, tâches du quotidien, liens.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PHASES_MISSION, RUBRIQUES_PLANS, groupesDe, articlesAffiches, estGrise, compteur,
  parGroupe, phaseParDefaut, enRetard, tachesTriees, lienPartage, lireLien,
  nomPersonne, libelleFait, ordreSuivant, resumeTuile,
} from '../src/modules/etude/todo/todoLogique.js'

const m = (id, groupe, ordre, extra = {}) => ({ id, liste: 'mission', groupe, texte: `Article ${id}`, ordre, supprime_le: null, ...extra })
const etat = (modele_id, extra = {}) => ({ id: `e-${modele_id}`, type: 'modele', modele_id, fait_le: null, fait_par: null, sans_objet: false, note: null, ...extra })

test('phases de la mission et rubriques des plans, dans l’ordre', () => {
  assert.deepEqual(PHASES_MISSION.map((p) => p.code), ['engagement', 'esq', 'aps', 'apd', 'pro', 'dce', 'act', 'prepa', 'det', 'aor'])
  assert.equal(RUBRIQUES_PLANS[0].code, 'masse')
  assert.equal(groupesDe('plans'), RUBRIQUES_PLANS)
  assert.equal(groupesDe('mission'), PHASES_MISSION)
})

test('fusion : l’état de l’affaire se pose sur l’article type', () => {
  const articles = articlesAffiches([m('a', 'esq', 1), m('b', 'esq', 2)], [etat('b', { fait_le: '2026-10-09T10:00:00Z', fait_par: 'u1' })], 'mission')
  assert.equal(articles.length, 2)
  const b = articles.find((x) => x.modeleId === 'b')
  assert.equal(b.fait_le, '2026-10-09T10:00:00Z')
  assert.equal(b.elementId, 'e-b')
  assert.equal(b.source, 'modele')
  assert.equal(articles.find((x) => x.modeleId === 'a').elementId, null)
})

test('fusion : seule la liste demandée, articles propres de l’affaire compris', () => {
  const modele = [m('a', 'esq', 1), { ...m('p', 'masse', 1), liste: 'plans' }]
  const propre = { id: 'x', type: 'article', liste: 'mission', groupe: 'esq', texte: 'Spécifique', ordre: 99, fait_le: null, sans_objet: false }
  const tache = { id: 't', type: 'tache', texte: 'Tâche' }
  const articles = articlesAffiches(modele, [propre, tache], 'mission')
  assert.deepEqual(articles.map((x) => x.cle), ['m:a', 'e:x'])
  assert.equal(articles[1].source, 'article')
})

test('article retiré de la liste type : caché s’il n’a jamais été touché, grisé sinon', () => {
  const modele = [m('a', 'esq', 1, { supprime_le: '2026-10-01' }), m('b', 'esq', 2, { supprime_le: '2026-10-01' }), m('c', 'esq', 3, { supprime_le: '2026-10-01' })]
  const elements = [etat('b', { note: 'vu avec le MOA' }), etat('c')]
  const articles = articlesAffiches(modele, elements, 'mission')
  assert.deepEqual(articles.map((x) => x.modeleId), ['b'])
  assert.equal(articles[0].retire, true)
  assert.equal(estGrise(articles[0]), true)
})

test('compteur : sans objet et retirés ne comptent pas', () => {
  const articles = articlesAffiches(
    [m('a', 'esq', 1), m('b', 'esq', 2), m('c', 'esq', 3), m('d', 'esq', 4, { supprime_le: 'x' })],
    [etat('a', { fait_le: 't' }), etat('b', { sans_objet: true }), etat('d', { fait_le: 't' })],
    'mission',
  )
  assert.deepEqual(compteur(articles), { faits: 1, total: 2 })
})

test('par groupe : toutes les phases, actifs par ordre puis grisés', () => {
  const articles = articlesAffiches(
    [m('a', 'esq', 2), m('b', 'esq', 1), m('c', 'esq', 3)],
    [etat('b', { sans_objet: true })],
    'mission',
  )
  const groupes = parGroupe(articles, 'mission')
  assert.equal(groupes.length, PHASES_MISSION.length)
  const esq = groupes.find((g) => g.code === 'esq')
  assert.deepEqual(esq.articles.map((x) => x.modeleId), ['a', 'c', 'b'])
  assert.deepEqual(esq.compteur, { faits: 0, total: 2 })
  assert.deepEqual(groupes.find((g) => g.code === 'aor').compteur, { faits: 0, total: 0 })
})

function groupesAvec(restants) {
  return PHASES_MISSION.map((p) => ({ code: p.code, compteur: { faits: 0, total: restants.includes(p.code) ? 1 : 0 } }))
}

test('phase par défaut : la première phase de la période qui a encore à faire', () => {
  const tout = PHASES_MISSION.map((p) => p.code)
  assert.equal(phaseParDefaut('esq', groupesAvec(tout)), 'engagement')
  assert.equal(phaseParDefaut('esq', groupesAvec(['esq'])), 'esq')
  assert.equal(phaseParDefaut('avp', groupesAvec(tout)), 'aps')
  assert.equal(phaseParDefaut('avp', groupesAvec(['apd'])), 'apd')
  assert.equal(phaseParDefaut('pro', groupesAvec(tout)), 'pro')
  assert.equal(phaseParDefaut('dce', groupesAvec(['act'])), 'act')
  assert.equal(phaseParDefaut('chantier', groupesAvec(['det'])), 'det')
  assert.equal(phaseParDefaut('livree', groupesAvec(tout)), 'aor')
})

test('phase par défaut : tout fait → la dernière de la période ; phase inconnue → première à faire', () => {
  assert.equal(phaseParDefaut('avp', groupesAvec([])), 'apd')
  assert.equal(phaseParDefaut('pc', groupesAvec(['dce'])), 'dce')
  assert.equal(phaseParDefaut(null, groupesAvec([])), 'engagement')
})

test('tâches : retard, tri, faites à part', () => {
  const t = (id, extra) => ({ id, type: 'tache', texte: id, echeance: null, fait_le: null, created_at: '2026-10-01T00:00:00Z', ...extra })
  const taches = [
    t('sans', { created_at: '2026-10-05T00:00:00Z' }),
    t('plus-tard', { echeance: '2026-10-20' }),
    t('retard', { echeance: '2026-10-01' }),
    t('aujourdhui', { echeance: '2026-10-09' }),
    t('faite-ancienne', { fait_le: '2026-10-02T00:00:00Z', echeance: '2026-09-01' }),
    t('faite-recente', { fait_le: '2026-10-08T00:00:00Z' }),
  ]
  assert.equal(enRetard(taches[2], '2026-10-09'), true)
  assert.equal(enRetard(taches[3], '2026-10-09'), false)
  assert.equal(enRetard(taches[4], '2026-10-09'), false)
  const { aFaire, faites } = tachesTriees(taches, '2026-10-09')
  assert.deepEqual(aFaire.map((x) => x.id), ['retard', 'aujourdhui', 'plus-tard', 'sans'])
  assert.deepEqual(faites.map((x) => x.id), ['faite-recente', 'faite-ancienne'])
})

test('lien : aller et retour', () => {
  const lien = lienPartage('https://app.exemple.fr', 'aff-1', { onglet: 'mission', phase: 'apd' })
  assert.equal(lien, 'https://app.exemple.fr/affaires/aff-1/todo?onglet=mission&phase=apd')
  assert.deepEqual(lireLien(new URL(lien).search), { onglet: 'mission', phase: 'apd', tache: null })
  const tache = lienPartage('https://app.exemple.fr', 'aff-1', { onglet: 'quotidien', tache: 't-9' })
  assert.deepEqual(lireLien(new URL(tache).search), { onglet: 'quotidien', phase: null, tache: 't-9' })
  assert.equal(lienPartage('https://app.exemple.fr', 'aff-1', {}), 'https://app.exemple.fr/affaires/aff-1/todo')
  assert.deepEqual(lireLien('?onglet=nimporte'), { onglet: null, phase: null, tache: null })
})

test('qui a coché, et quand', () => {
  const profils = { u1: { prenom: 'Victor', nom: 'Guyon' }, u2: { prenom: '', nom: 'Martin' } }
  assert.equal(nomPersonne('u1', profils), 'Victor')
  assert.equal(nomPersonne('u2', profils), 'Martin')
  assert.equal(nomPersonne('u3', profils), 'un collaborateur')
  assert.equal(libelleFait({ fait_le: '2026-10-09T10:00:00Z', fait_par: 'u1' }, profils), 'Fait par Victor le 09/10/2026')
  assert.equal(libelleFait({ fait_le: null }, profils), null)
})

test('ordre suivant dans un groupe', () => {
  const articles = articlesAffiches([m('a', 'esq', 4), m('b', 'aps', 9)], [], 'mission')
  assert.equal(ordreSuivant(articles, 'esq'), 5)
  assert.equal(ordreSuivant(articles, 'dce'), 1)
})

test('résumé de la tuile : phase en cours et tâches en retard', () => {
  const modele = [m('a', 'apd', 1), m('b', 'apd', 2), m('c', 'aps', 1)]
  const elements = [
    etat('c', { fait_le: 't' }),
    etat('a', { fait_le: 't' }),
    { id: 't1', type: 'tache', texte: 'x', echeance: '2026-10-01', fait_le: null },
    { id: 't2', type: 'tache', texte: 'y', echeance: null, fait_le: null },
  ]
  assert.deepEqual(resumeTuile(modele, elements, 'avp', '2026-10-09'), {
    phase: 'apd', court: 'APD', faits: 1, total: 2, tachesAFaire: 2, tachesEnRetard: 1,
  })
})
