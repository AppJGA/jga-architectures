// Visite enregistrée, lot 2 : demande à l'IA, relecture de sa réponse, coût.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  contexteAnalyse, construireDemande, lireFlux, lirePropositions, coutAnalyse, OUTIL_PROPOSITIONS,
  remarquesDuCr, propositionsAValider, ecrituresValidation,
} from '../src/modules/chantier/comptes-rendus/enregistrement/analyseIaLogique.js'

const donnees = {
  affaire: { nom: 'Coligny' },
  cr: { date_reunion: '2026-10-05' },
  transcription: 'Le plaquiste doit reprendre les joints. La descente EP est faite.',
  lots: [
    { id: 'lot-b', numero: 140, nom: 'Plâtrerie / Peinture', raison_sociale: 'SARL PLAK' },
    { id: 'lot-a', numero: 20, nom: 'Gros-Œuvre' },
  ],
  interlocuteurs: [{ id: 'moa', categorie: 'moa', prenom: 'Jean', nom: 'Arragon', organisation: 'SEMCODA' }],
  zones: [{ id: 'z-rdc', nom: 'RDC' }],
  remarques: [
    { id: 'r-41', numero: 41, lot_id: 'lot-a', description: 'Reprendre la descente EP', statut: 'a_faire', sous_remarques: [{ description: 'Commandée' }] },
    { id: 'r-42', numero: 42, description: 'Close', est_clos: true },
    { id: 'r-43', numero: 43, description: 'Proposition en attente', a_valider: true },
  ],
}

describe('contexte donné à l’IA', () => {
  const { contexte, references } = contexteAnalyse(donnees)

  test('lots dans l’ordre des numéros, interlocuteurs, zones : des références courtes', () => {
    assert.deepEqual(contexte.destinataires.map((d) => [d.ref, d.libelle]), [['L1', '20 - Gros-Œuvre'], ['L2', '140 - Plâtrerie / Peinture'], ['I1', 'Maître d’ouvrage']])
    assert.equal(contexte.destinataires[1].entreprise, 'SARL PLAK')
    assert.deepEqual(references, { L1: 'lot:lot-a', L2: 'lot:lot-b', I1: 'interlo:moa', Z1: 'zone:z-rdc', R41: 'remarque:r-41' })
  })

  test('seulement les remarques ouvertes et validées, avec leur dernière suite', () => {
    assert.deepEqual(contexte.remarques, [{ ref: 'R41', destinataire: 'L1', texte: 'Reprendre la descente EP', statut: 'a_faire', derniere_suite: 'Commandée' }])
  })

  test('aucun identifiant de la base dans la demande', () => {
    const demande = construireDemande(contexte)
    const texte = JSON.stringify(demande.messages)
    for (const id of ['lot-a', 'lot-b', 'moa', 'z-rdc', 'r-41']) assert.ok(!texte.includes(`"${id}"`), id)
    assert.equal(demande.tool_choice.name, OUTIL_PROPOSITIONS.name)
    assert.ok(demande.messages[0].content.startsWith('<transcription>'))
  })
})

describe('relecture de la réponse', () => {
  const { references } = contexteAnalyse(donnees)

  test('références retraduites, suite reconnue, clôture seulement sur une suite', () => {
    const p = lirePropositions({ propositions: [
      { type: 'nouvelle', destinataire_ref: 'L2', texte: ' Reprendre  les joints ', statut: 'a_faire', echeance: '2026-10-09', zone_ref: 'Z1', extrait: 'reprendre les joints', clore_origine: true },
      { type: 'suite', remarque_ref: 'R41', texte: 'Descente EP faite', statut: 'fait', clore_origine: true, extrait: 'la descente EP est faite' },
    ] }, references)
    assert.deepEqual(p[0], { type: 'nouvelle', remarqueId: null, destinataire: 'lot:lot-b', texte: 'Reprendre les joints', statut: 'a_faire', echeance: '2026-10-09', zoneId: 'z-rdc', cloreOrigine: false, extrait: 'reprendre les joints' })
    assert.deepEqual([p[1].type, p[1].remarqueId, p[1].cloreOrigine, p[1].statut], ['suite', 'r-41', true, 'fait'])
  })

  test('tolérante : référence inventée, statut inconnu, date impossible, suite orpheline, doublon, texte vide', () => {
    const p = lirePropositions(JSON.stringify({ propositions: [
      { type: 'nouvelle', destinataire_ref: 'L9', texte: 'A', statut: 'peut-être', echeance: '2026-02-30', extrait: 'x' },
      { type: 'suite', remarque_ref: 'R99', destinataire_ref: 'I1', texte: 'B', statut: 'en_cours', extrait: 'y' },
      { type: 'nouvelle', texte: 'a', statut: 'a_faire', extrait: 'doublon' },
      { type: 'nouvelle', texte: '   ', statut: 'a_faire', extrait: 'vide' },
      { type: 'nouvelle', destinataire_ref: 'Z1', texte: 'Une zone n’est pas un destinataire', statut: 'a_faire', extrait: 'z' },
    ] }), references)
    assert.deepEqual(p.map((x) => [x.type, x.destinataire, x.statut, x.echeance]), [
      ['nouvelle', null, 'a_faire', null],
      ['nouvelle', 'interlo:moa', 'en_cours', null],
      ['nouvelle', null, 'a_faire', null],
    ])
  })

  test('réponse illisible : aucune proposition, pas d’erreur', () => {
    assert.deepEqual(lirePropositions('{pas du json', references), [])
    assert.deepEqual(lirePropositions(null, references), [])
  })
})

describe('flux et coût', () => {
  test('le JSON de l’outil recollé, et les jetons comptés', () => {
    const flux = [
      'event: message_start', 'data: {"type":"message_start","message":{"usage":{"input_tokens":12000}}}', '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"propositions\\": ["}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"]}"}}',
      'data: {"type":"message_delta","usage":{"output_tokens":1500}}',
      'data: [pas du json]',
    ].join('\n')
    const r = lireFlux(flux)
    assert.deepEqual(JSON.parse(r.json), { propositions: [] })
    assert.deepEqual(r.usage, { entree: 12000, sortie: 1500 })
    assert.equal(r.erreur, null)
    assert.equal(coutAnalyse(r.usage), 0.039)
  })

  test('une erreur dans le flux est remontée', () => {
    assert.equal(lireFlux('data: {"type":"error","error":{"message":"overloaded"}}').erreur, 'overloaded')
  })
})

describe('propositions dans le compte rendu', () => {
  const sections = [
    { type_section: 'equipe', directRemarques: [{ id: 'a', a_valider: true, interlocuteur_id: 'moa' }] },
    { type_section: 'entreprises', sousSections: [], directRemarques: [
      { id: 'b', sous_remarques: [{ id: 'b1', parent_id: 'b', a_valider: true, ia_clore_origine: true }, { id: 'b2', parent_id: 'b' }] },
      { id: 'c', a_valider: true },
    ] },
  ]

  test('remarques et suites à valider, dans l’ordre de l’écran', () => {
    assert.deepEqual(propositionsAValider(sections).map((r) => r.id), ['a', 'b1', 'c'])
    assert.deepEqual(remarquesDuCr(sections).map((r) => r.id), ['a', 'b', 'c'])
  })

  test('valider : la clôture de l’origine n’arrive qu’à ce moment ; sans destinataire, à compléter d’abord', () => {
    assert.deepEqual(ecrituresValidation({ id: 'a', interlocuteur_id: 'moa' }), { aCompleter: false, ecritures: [{ id: 'a', champs: { a_valider: false } }] })
    assert.deepEqual(ecrituresValidation({ id: 'b1', parent_id: 'b', ia_clore_origine: true }).ecritures, [
      { id: 'b1', champs: { a_valider: false } }, { id: 'b', champs: { statut: 'fait', est_clos: true } },
    ])
    assert.deepEqual(ecrituresValidation({ id: 'c' }), { aCompleter: true, ecritures: [] })
    assert.equal(ecrituresValidation({ id: 'd' }, { sectionType: 'intervenants' }).aCompleter, false)
  })
})
