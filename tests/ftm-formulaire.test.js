// Fiche de travaux modificatifs : ce que le formulaire envoie à la base.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { payloadFtm } from '../src/modules/chantier/ftm/payloadFtm.js'

const vide = {
  origine: 'mo', lot_id: '', date_emission: '2026-09-16', reference_chantier: '',
  type_demande: '', description: '', motivation: '', motivation_autre: '',
  faisabilite_technique: null, impact_reglementaire: null,
  incidence_delai_valeur: '', incidence_delai_unite: 'jours',
  montant_travaux_ht: '', montant_honoraires_ht: '',
  decision: 'en_attente', date_decision: '',
}

describe('fiche enregistrée sans tout remplir', () => {
  test('les listes fermées laissées vides partent à vide, pas en chaîne vide', () => {
    const p = payloadFtm(vide)
    assert.equal(p.motivation, null)
    assert.equal(p.type_demande, null)
  })

  test('aucune chaîne vide ne subsiste sur les colonnes contraintes', () => {
    const p = payloadFtm(vide)
    for (const champ of ['type_demande', 'motivation', 'incidence_delai_unite', 'decision', 'lot_id', 'date_decision']) {
      assert.notEqual(p[champ], '', `${champ} ne doit jamais valoir une chaîne vide`)
    }
  })

  test('les montants vides ne deviennent pas zéro', () => {
    const p = payloadFtm(vide)
    assert.equal(p.montant_travaux_ht, null)
    assert.equal(p.montant_honoraires_ht, null)
  })

  test('l’origine est obligatoire : une valeur par défaut la garantit', () => {
    assert.equal(payloadFtm({ ...vide, origine: '' }).origine, 'mo')
  })
})

describe('fiche remplie', () => {
  const rempli = {
    ...vide, origine: 'aleas', lot_id: 'l1', type_demande: 'modification',
    motivation: 'technique', motivation_autre: 'texte oublié',
    incidence_delai_valeur: '5', montant_travaux_ht: '3200.50',
    montant_honoraires_ht: '-120', decision: 'accepte', date_decision: '2026-09-20',
  }

  test('les montants deviennent des nombres, moins-value comprise', () => {
    const p = payloadFtm(rempli)
    assert.equal(p.montant_travaux_ht, 3200.5)
    assert.equal(p.montant_honoraires_ht, -120)
    assert.equal(p.incidence_delai_valeur, 5)
  })

  test('le texte libre ne suit que la motivation « autre »', () => {
    assert.equal(payloadFtm(rempli).motivation_autre, null)
    assert.equal(payloadFtm({ ...rempli, motivation: 'autre' }).motivation_autre, 'texte oublié')
  })

  test('les valeurs choisies passent telles quelles', () => {
    const p = payloadFtm(rempli)
    assert.equal(p.type_demande, 'modification')
    assert.equal(p.decision, 'accepte')
    assert.equal(p.date_decision, '2026-09-20')
  })
})
