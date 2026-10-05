// Phase d'une affaire : tuiles du tableau de bord et couleur du cadre.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { periodeAffaire, libellePhase, variablesPhase, phasesDuTableau } from '../src/affaire/phaseAffaire.js'

test('étude jusqu’au DCE, chantier ensuite — une affaire livrée reste au chantier', () => {
  for (const p of ['esq', 'avp', 'pro', 'dce', 'pc', null, undefined]) assert.equal(periodeAffaire(p), 'etude', p)
  assert.equal(periodeAffaire('chantier'), 'chantier')
  assert.equal(periodeAffaire('livree'), 'chantier')
})

test('orange à l’étude, vert au chantier', () => {
  assert.equal(variablesPhase('avp')['--affaire-accent'], 'var(--jga-orange)')
  assert.equal(variablesPhase('chantier')['--affaire-accent'], 'var(--jga-green)')
  assert.equal(variablesPhase('livree')['--affaire-accent'], 'var(--jga-green)')
})

test('libellés courts, sans travestir une valeur inconnue', () => {
  assert.equal(libellePhase('pro'), 'Étude · PRO')
  assert.equal(libellePhase('livree'), 'Livrée')
  assert.equal(libellePhase('pc'), 'PC')
})

test('tuiles : la phase de l’affaire seulement, jamais un tableau vide', () => {
  const etude = { id: 'etude' }
  const chantier = { id: 'chantier' }
  assert.deepEqual(phasesDuTableau([etude, chantier], 'avp'), [etude])
  assert.deepEqual(phasesDuTableau([etude, chantier], 'chantier'), [chantier])
  assert.deepEqual(phasesDuTableau([etude, chantier], 'livree'), [chantier])
  assert.deepEqual(phasesDuTableau([chantier], 'esq'), [chantier], 'extérieur sur une affaire à l’étude')
})
