// Glisser une remarque vers un autre destinataire.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ciblesDeDepot, destinataireDe, peutGlisser, depotUtile } from '../src/modules/chantier/comptes-rendus/glisserLogique.js'

test('la bande : lots par numéro, puis l’équipe dans son ordre', () => {
  const c = ciblesDeDepot({
    lots: [{ id: 'b', numero: 140, nom: 'Plâtrerie', raison_sociale: 'PLAK' }, { id: 'a', numero: 20, nom: 'Gros-Œuvre' }],
    interlocuteurs: [
      { id: 'bet', categorie: 'be', categorie_label: 'BET Fluides', organisation: 'ICT', ordre: 2 },
      { id: 'moa', categorie: 'moa', prenom: 'Jean', nom: 'Arragon', ordre: 0 },
    ],
  })
  assert.deepEqual(c.entreprises.map((x) => [x.cle, x.libelle, x.detail]), [['lot:a', '20 - Gros-Œuvre', null], ['lot:b', '140 - Plâtrerie', 'PLAK']])
  assert.deepEqual(c.equipe.map((x) => [x.cle, x.libelle, x.detail]), [['interlo:moa', 'Jean Arragon', 'Maître d’ouvrage'], ['interlo:bet', 'ICT', 'BET Fluides']])
})

test('destinataire actuel et dépôt utile', () => {
  assert.equal(destinataireDe({ lot_id: 'a' }), 'lot:a')
  assert.equal(destinataireDe({ interlocuteur_id: 'moa' }), 'interlo:moa')
  assert.equal(destinataireDe({}), null)
  assert.equal(depotUtile({ lot_id: 'a' }, 'lot:a'), false, 'lâchée sur son propre destinataire')
  assert.equal(depotUtile({ lot_id: 'a' }, 'interlo:moa'), true)
  assert.equal(depotUtile({}, 'lot:a'), true, 'une remarque à attribuer reçoit son destinataire')
  assert.equal(depotUtile({ lot_id: 'a' }, null), false, 'lâchée hors de la bande')
})

test('ce qui se glisse : pas les suites, pas les observations des intervenants, pas en lecture seule', () => {
  assert.equal(peutGlisser({ id: 'r' }), true)
  assert.equal(peutGlisser({ id: 'r' }, { sectionType: 'entreprises' }), true)
  assert.equal(peutGlisser({ id: 's', parent_id: 'r' }), false)
  assert.equal(peutGlisser({ id: 'r' }, { sectionType: 'intervenants' }), false)
  assert.equal(peutGlisser({ id: 'r' }, { sectionType: 'general' }), false)
  assert.equal(peutGlisser({ id: 'r' }, { lectureSeule: true }), false)
})
