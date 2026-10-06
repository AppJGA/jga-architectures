// Rester connecté sans réseau, et dire de quand datent les données montrées.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { utilisateurDeSessionGardee, echecDeReseau } from '../src/core/auth/sessionHorsLigne.js'
import { libelleSynchro } from '../src/core/layout/enLigne.js'

test('l’utilisateur se relit dans la session rangée sur l’appareil', () => {
  const session = { access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'v@x.fr' } }
  assert.equal(utilisateurDeSessionGardee(JSON.stringify(session)).id, 'u1')
  // Ancienne forme rangée par Supabase
  assert.equal(utilisateurDeSessionGardee(JSON.stringify({ currentSession: session })).id, 'u1')
  assert.equal(utilisateurDeSessionGardee(null), null)
  assert.equal(utilisateurDeSessionGardee('pas du json'), null)
  assert.equal(utilisateurDeSessionGardee(JSON.stringify({ user: {} })), null)
})

test('seul un échec de réseau garde la session ; un refus du serveur déconnecte', () => {
  assert.equal(echecDeReseau(null, false), true, 'appareil hors ligne')
  assert.equal(echecDeReseau({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), true)
  assert.equal(echecDeReseau({ message: 'TypeError: Load failed' }), true, 'Safari')
  assert.equal(echecDeReseau({ name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token: Refresh Token Not Found' }), false)
  assert.equal(echecDeReseau(null, true), false)
})

test('date de la dernière synchronisation', () => {
  const maintenant = new Date('2026-10-06T16:00:00+02:00')
  assert.equal(libelleSynchro(new Date('2026-10-06T14:05:00+02:00'), maintenant), 'aujourd’hui à 14 h 05')
  assert.equal(libelleSynchro(new Date('2026-10-05T08:30:00+02:00'), maintenant), 'le lundi 5 octobre à 08 h 30')
  assert.equal(libelleSynchro(null, maintenant), null)
})
