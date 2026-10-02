// Comptes rendus, refonte (chantier 1) : remarques rangées par destinataire.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  PARTIES_REMARQUES, sectionsAMettreEnPlace, cleDestinataire, typePourDestinataire,
  champsDestinataire, libelleLot, libelleRole, choixDestinataires, destinataireParDefaut,
  groupesDestinataires, estPartieRemarques, ordonnerParties, romain, numeroterParties, numerosParties,
} from '../src/modules/chantier/comptes-rendus/remarquesLogique.js'

const LOTS = [
  { id: 'l3', numero: 3, nom: 'Charpente bois - Couverture' },
  { id: 'l2', numero: 2, nom: 'Démolition - Gros-Oeuvre' },
  { id: 'l11', numero: 11, nom: 'CVC - Plomberie' },
]
const INTERLOS = [
  { id: 'i-moe', categorie: 'moe', prenom: 'Victor', nom: 'Guyon', ordre: 1 },
  { id: 'i-moe2', categorie: 'moe', prenom: 'Caroline', nom: 'Jacquier', ordre: 2 },
  { id: 'i-csps', categorie: 'csps', prenom: 'Damien', nom: 'Vinot', ordre: 4 },
  { id: 'i-elec', categorie: 'be', categorie_label: 'BET Electricité', prenom: 'Fabien', nom: 'Vignatelli', ordre: 3 },
]
const contexte = { lots: LOTS, interlocuteurs: INTERLOS }

describe('parties VI et VII', () => {
  test('les deux sections manquantes sont à créer, après les autres', () => {
    const existantes = [{ id: 's1', numero_romain: 'I', type_section: 'general', ordre: 0 }, { id: 's2', numero_romain: 'II', type_section: 'general', ordre: 4 }]
    const aCreer = sectionsAMettreEnPlace(existantes)
    assert.deepEqual(aCreer.map((s) => [s.numero_romain, s.type_section, s.ordre]), [['VI', 'equipe', 5], ['VII', 'entreprises', 6]])
    assert.equal(aCreer[0].titre, PARTIES_REMARQUES[0].titre)
  })

  test('rien à créer quand elles existent déjà', () => {
    assert.deepEqual(sectionsAMettreEnPlace([{ type_section: 'equipe', ordre: 0 }, { type_section: 'entreprises', ordre: 1 }]), [])
  })

  test('la partie VI passe toujours avant la VII, même créée après', () => {
    const ordre = ordonnerParties([
      { id: 'I', type_section: 'general' }, { id: 'VII', type_section: 'entreprises' }, { id: 'X', type_section: 'intervenants' }, { id: 'VI', type_section: 'equipe' },
    ]).map((s) => s.id)
    assert.deepEqual(ordre, ['I', 'VI', 'VII', 'X'])
    assert.deepEqual(ordonnerParties([{ id: 'VI', type_section: 'equipe' }, { id: 'VII', type_section: 'entreprises' }]).map((s) => s.id), ['VI', 'VII'])
  })

  test('les parties des remarques suivent le nombre de parties des généralités', () => {
    const sections = [
      { id: 'vieux', numero_romain: 'II', type_section: 'general' },
      { id: 'e', numero_romain: 'VI', type_section: 'equipe' },
      { id: 'n', numero_romain: 'VII', type_section: 'entreprises' },
      { id: 'x', numero_romain: 'VIII', type_section: 'intervenants' },
    ]
    const num = (nb) => numeroterParties(sections, nb).map((s) => s.numero_romain)
    assert.deepEqual(num(5), ['II', 'VI', 'VII', 'VIII'])
    assert.deepEqual(num(6), ['II', 'VII', 'VIII', 'IX'], 'une sixième partie décale VI et VII')
    assert.deepEqual(num(0), ['II', 'VI', 'VII', 'VIII'], 'sans généralités, numérotation habituelle')
    assert.deepEqual(numerosParties(numeroterParties(sections, 6)), { equipe: 'VII', entreprises: 'VIII' })
    assert.deepEqual(numerosParties([]), { equipe: 'VI', entreprises: 'VII' })
    assert.deepEqual([1, 4, 9, 14].map(romain), ['I', 'IV', 'IX', 'XIV'])
  })

  test('une partie de remarques se reconnaît à son type', () => {
    assert.equal(estPartieRemarques({ type_section: 'entreprises' }), true)
    assert.equal(estPartieRemarques({ type_section: 'general' }), false)
  })
})

describe('destinataire', () => {
  test('clé, partie et colonnes d’un destinataire', () => {
    assert.equal(cleDestinataire({ lot_id: 'l2' }), 'lot:l2')
    assert.equal(cleDestinataire({ interlocuteur_id: 'i-csps' }), 'interlo:i-csps')
    assert.equal(cleDestinataire({}), '')
    assert.equal(typePourDestinataire('lot:l2'), 'entreprises')
    assert.equal(typePourDestinataire('interlo:i-csps'), 'equipe')
    assert.equal(typePourDestinataire(''), null)
    assert.deepEqual(champsDestinataire('lot:l2'), { lot_id: 'l2', interlocuteur_id: null })
    assert.deepEqual(champsDestinataire('interlo:i-moe'), { lot_id: null, interlocuteur_id: 'i-moe' })
  })

  test('libellés : lot numéroté sur deux chiffres, rôle saisi ou catégorie', () => {
    assert.equal(libelleLot(LOTS[1]), '02 - Démolition - Gros-Oeuvre')
    assert.equal(libelleLot({ nom: 'Sans numéro' }), 'Sans numéro')
    assert.equal(libelleRole(INTERLOS[3]), 'BET Electricité')
    assert.equal(libelleRole(INTERLOS[2]), 'CSPS')
    assert.equal(libelleRole(INTERLOS[0]), 'Maître d’œuvre')
  })

  test('choix proposés : lots par numéro, puis l’équipe dans son ordre', () => {
    const choix = choixDestinataires(contexte)
    assert.deepEqual(choix.entreprises.map((c) => c.cle), ['lot:l2', 'lot:l3', 'lot:l11'])
    assert.deepEqual(choix.equipe.map((c) => c.cle), ['interlo:i-moe', 'interlo:i-moe2', 'interlo:i-elec', 'interlo:i-csps'])
    assert.equal(choix.entreprises[0].court, 'Lot 02')
  })

  test('le dernier destinataire est reproposé s’il existe encore', () => {
    const choix = choixDestinataires(contexte)
    assert.equal(destinataireParDefaut('lot:l3', choix), 'lot:l3')
    assert.equal(destinataireParDefaut('lot:supprime', choix), '')
    assert.equal(destinataireParDefaut(null, choix), '')
  })
})

describe('regroupement', () => {
  const r = (id, champs) => ({ id, ordre: 0, ...champs })

  test('VII : un groupe par lot, dans l’ordre des numéros ; sans destinataire à la fin', () => {
    const groupes = groupesDestinataires([
      r('a', { lot_id: 'l11' }), r('b', { lot_id: 'l2' }), r('c', {}), r('d', { lot_id: 'l2' }),
    ], contexte)
    assert.deepEqual(groupes.map((g) => g.titre), ['02 - Démolition - Gros-Oeuvre', '11 - CVC - Plomberie', 'À attribuer'])
    assert.deepEqual(groupes[0].remarques.map((x) => x.id), ['b', 'd'])
    assert.equal(groupes[0].destinataire, 'lot:l2')
    assert.equal(groupes[2].destinataire, null)
  })

  test('VI : un groupe par rôle, plusieurs personnes du même rôle ensemble', () => {
    const groupes = groupesDestinataires([
      r('a', { interlocuteur_id: 'i-csps' }), r('b', { interlocuteur_id: 'i-moe2' }), r('c', { interlocuteur_id: 'i-moe' }),
    ], contexte)
    assert.deepEqual(groupes.map((g) => g.titre), ['Maître d’œuvre', 'CSPS'])
    assert.deepEqual(groupes[0].remarques.map((x) => x.id), ['b', 'c'])
    assert.equal(groupes[0].destinataire, 'interlo:i-moe', 'le + du groupe vise la première personne du rôle')
  })

  test('un destinataire supprimé depuis garde son groupe, sous son nom recopié', () => {
    const groupes = groupesDestinataires([r('a', { copie_destinataire: 'Lot 9 — Sols' })], contexte)
    assert.deepEqual(groupes.map((g) => g.titre), ['Lot 9 — Sols'])
    assert.equal(groupes[0].destinataire, null)
  })
})
