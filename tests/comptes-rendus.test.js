// Comptes rendus de chantier : reprise de la visite précédente, compteurs et
// historique des participants.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  dateDuJour,
  compterPresents,
  compterPointsEnCours,
  preparerReprise,
  copiePresence,
  affichagePresence,
} from '../src/modules/chantier/comptes-rendus/crLogique.js'

let n = 0
const id = () => `id-${++n}`

describe('dateDuJour', () => {
  test('juste après minuit en France, la date reste celle du jour local', () => {
    // 15 septembre 00 h 30 à Paris = 14 septembre 22 h 30 en UTC
    assert.equal(dateDuJour(new Date('2026-09-14T22:30:00Z')), '2026-09-15')
  })
})

describe('compteurs', () => {
  test('présents : P et retard, en minuscules comme en base', () => {
    const presences = [{ presence: 'p' }, { presence: 'r' }, { presence: 'a' }, { presence: 'na' }, { presence: 'e' }]
    assert.equal(compterPresents(presences), 2)
  })

  test('points en cours : remarques principales non closes, sans les suivis', () => {
    const remarques = [
      { id: 'a', est_clos: false, parent_id: null },
      { id: 'b', est_clos: true, parent_id: null },
      { id: 'c', est_clos: false, parent_id: 'a' },
    ]
    assert.equal(compterPointsEnCours(remarques), 1)
  })
})

describe('preparerReprise', () => {
  const precedent = {
    sections: [{ id: 'S1', numero_romain: 'I', titre: 'Général', ordre: 0, type_section: 'general' }],
    sousSections: [{ id: 'SS1', section_id: 'S1', code: '1', titre: 'Planning', ordre: 0 }],
    remarques: [
      { id: 'R1', sous_section_id: 'SS1', section_id: 'S1', description: 'Ouverte', est_clos: false, est_nouveau: true, statut: 'À faire', ordre: 0, copie_destinataire: 'Lot 2 — Gros œuvre', lot_id: 'L2' },
      { id: 'R2', sous_section_id: null, section_id: 'S1', description: 'Directe', est_clos: false, est_nouveau: false, ordre: 1 },
      { id: 'R3', sous_section_id: 'SS1', section_id: 'S1', description: 'Close', est_clos: true, ordre: 2 },
      { id: 'SR1', parent_id: 'R1', description: 'Suivi clos', est_clos: true, est_nouveau: true },
      { id: 'SR2', parent_id: 'R1', description: 'Suivi ouvert', est_clos: false },
      { id: 'SR3', parent_id: 'R3', description: 'Suivi d’une close', est_clos: false },
    ],
  }
  const reprise = preparerReprise({ ...precedent, crId: 'CR2', affaireId: 'AFF', nouvelId: id })

  test('sections et sous-sections copiées avec de nouveaux identifiants', () => {
    assert.equal(reprise.sections.length, 1)
    assert.equal(reprise.sections[0].cr_id, 'CR2')
    assert.notEqual(reprise.sections[0].id, 'S1')
    assert.equal(reprise.sousSections[0].section_id, reprise.sections[0].id)
  })

  test('seules les remarques principales non closes sont reprises', () => {
    assert.deepEqual(reprise.remarques.map((r) => r.description), ['Ouverte', 'Directe'])
    const ouverte = reprise.remarques[0]
    assert.equal(ouverte.sous_section_id, reprise.sousSections[0].id)
    assert.equal(ouverte.section_id, reprise.sections[0].id)
    assert.equal(ouverte.copie_destinataire, 'Lot 2 — Gros œuvre')
    assert.equal(reprise.remarques[1].sous_section_id, null)
  })

  test('une remarque reprise n’est pas « nouvelle »', () => {
    assert.ok(reprise.remarques.every((r) => r.est_nouveau === false))
    assert.ok(reprise.sousRemarques.every((r) => r.est_nouveau === false))
  })

  test('les suivis gardent leur état clos, et ceux d’une remarque close ne suivent pas', () => {
    assert.deepEqual(
      reprise.sousRemarques.map((r) => [r.description, r.est_clos]),
      [['Suivi clos', true], ['Suivi ouvert', false]],
    )
    assert.ok(reprise.sousRemarques.every((r) => r.parent_id === reprise.remarques[0].id))
  })
})

describe('historique des participants', () => {
  const interlocuteur = {
    interlocuteur_id: 'I1', presence: 'p',
    affaire_interlocuteurs: { categorie: 'moa', categorie_label: null, prenom: 'Anne', nom: 'Martin', fonction: 'Cheffe de projet', organisation: 'Ville de Lyon', adresse: '1 place Bellecour', email: 'a@lyon.fr', telephone: '04', ordre: 2 },
  }
  const entreprise = {
    lot_entreprise_id: 'LE1', presence: 'a',
    lot_entreprises: { lots: { numero: 2, nom: 'Gros œuvre' }, entreprises: { raison_sociale: 'Dupont', email: 'c@dupont.fr' }, interlocuteurs: { prenom: 'Paul', nom: 'Dupont', telephone: '06' } },
  }

  test('copiePresence reprend le participant lié', () => {
    assert.deepEqual(copiePresence(interlocuteur), {
      copie_type: 'interlocuteur', copie_categorie: 'moa', copie_categorie_label: null,
      copie_prenom: 'Anne', copie_nom: 'Martin', copie_fonction: 'Cheffe de projet',
      copie_organisation: 'Ville de Lyon', copie_adresse: '1 place Bellecour',
      copie_email: 'a@lyon.fr', copie_telephone: '04', copie_ordre: 2,
      copie_lot_numero: null, copie_lot_nom: null, copie_entreprise: null,
    })
    const c = copiePresence(entreprise)
    assert.equal(c.copie_type, 'entreprise')
    assert.equal(c.copie_entreprise, 'Dupont')
    assert.equal(c.copie_email, 'c@dupont.fr')
    assert.equal(c.copie_telephone, '06')
  })

  test('affichagePresence : une fiche supprimée s’affiche depuis sa copie', () => {
    const orpheline = { presence: 'a', interlocuteur_id: null, lot_entreprise_id: null, ...copiePresence(entreprise) }
    const vue = affichagePresence(orpheline)
    assert.equal(vue.type, 'entreprise')
    assert.equal(vue.entreprise, 'Dupont')
    assert.equal(vue.lotNumero, 2)
    assert.equal(vue.contact, 'Paul Dupont')
  })

  test('affichagePresence : sans copie (données anciennes), le lien suffit', () => {
    const vue = affichagePresence(interlocuteur)
    assert.equal(vue.type, 'interlocuteur')
    assert.equal(vue.nom, 'Anne Martin')
    assert.equal(vue.adresse, '1 place Bellecour')
  })
})
