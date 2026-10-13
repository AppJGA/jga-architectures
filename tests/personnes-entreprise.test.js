import test from 'node:test'
import assert from 'node:assert/strict'
import { ordonnerPersonnes, libellePersonne } from '../src/shared/lots/personnesEntreprise.js'

test('la personne principale passe en tête, les autres par nom', () => {
  const r = ordonnerPersonnes([
    { id: 1, nom: 'Zed', prenom: 'A' },
    { id: 2, nom: 'Émile', prenom: 'B' },
    { id: 3, nom: 'Mu', prenom: 'C', est_principal: true },
  ])
  assert.deepEqual(r.map(p => p.id), [3, 2, 1])
})

test('ordonnerPersonnes ne modifie pas la liste reçue et tolère null', () => {
  const l = [{ id: 1, nom: 'B' }, { id: 2, nom: 'A' }]
  ordonnerPersonnes(l)
  assert.equal(l[0].id, 1)
  assert.deepEqual(ordonnerPersonnes(null), [])
})

test('libellePersonne : prénom nom · fonction', () => {
  assert.equal(libellePersonne({ prenom: 'A', nom: 'B', fonction: 'Conducteur' }), 'A B · Conducteur')
  assert.equal(libellePersonne({ nom: 'B' }), 'B')
  assert.equal(libellePersonne({}), 'Sans nom')
})
