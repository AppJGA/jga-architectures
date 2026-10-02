// Annuaire d'une affaire : interlocuteurs et représentants des entreprises.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { annuaireAffaire, lienTelephone, telephones } from '../src/affaire/annuaireLogique.js'

describe('annuaire', () => {
  const interlocuteurs = [
    { id: 'c', categorie: 'csps', prenom: 'Damien', nom: 'Vinot', organisation: 'Apave', telephone: '06 28 20 02 06', email: 'damien.vinot@apave.com', ordre: 0 },
    { id: 'm', categorie: 'moa', prenom: 'Jean-Pierre', nom: 'Arragon', organisation: 'Commune de Meillonnas', telephone: '04 74 42 38 11', ordre: 0 },
    { id: 'b', categorie: 'be', categorie_label: 'BET Electricité', organisation: 'ICT', email: 'fabien@beict.fr', ordre: 1 },
  ]
  const lots = [
    { id: 'l3', numero: 3, nom: 'Charpente', entreprise_id: 'e3', raison_sociale: 'SARL PERRET ET FILS', entreprise_tel: '04 74 51 39 39', entreprise_email: 'toit.perret@wanadoo.fr' },
    { id: 'l2', numero: 2, nom: 'Gros-Oeuvre', entreprise_id: 'e2', raison_sociale: 'RENAUD SAS', prenom: 'Bastien', nom_contact: 'Desbleds', fonction: 'Conducteur de travaux', interlocuteur_tel: '06 32 74 67 88', interlocuteur_email: 'b.desbleds@renaudbatiment.fr', entreprise_tel: '03 85 31 01 33' },
    { id: 'l9', numero: 9, nom: 'Sol souple', entreprise_id: null },
  ]
  const a = annuaireAffaire({ interlocuteurs, lots })

  test('interlocuteurs dans l’ordre des catégories : maître d’ouvrage d’abord', () => {
    assert.deepEqual(a.interlocuteurs.map((i) => i.role), ['Maître d’ouvrage', 'BET Electricité', 'CSPS'])
    assert.equal(a.interlocuteurs[0].nom, 'Jean-Pierre Arragon')
    assert.equal(a.interlocuteurs[0].detail, 'Commune de Meillonnas')
    assert.equal(a.interlocuteurs[1].nom, 'ICT', 'sans nom de personne, la société')
  })

  test('entreprises par numéro de lot, seulement les lots attribués', () => {
    assert.deepEqual(a.entreprises.map((e) => e.role), ['02 - Gros-Oeuvre', '03 - Charpente'])
  })

  test('le représentant d’abord ; à défaut, les coordonnées de l’entreprise', () => {
    const [go, ch] = a.entreprises
    assert.deepEqual([go.nom, go.detail, go.telephone, go.email], ['RENAUD SAS', 'Bastien Desbleds · Conducteur de travaux', '06 32 74 67 88', 'b.desbleds@renaudbatiment.fr'])
    assert.deepEqual([ch.detail, ch.telephone, ch.email], ['', '04 74 51 39 39', 'toit.perret@wanadoo.fr'])
  })
})

describe('téléphones', () => {
  test('un lien d’appel que le téléphone compose', () => {
    assert.equal(lienTelephone('06 28 20 02 06'), 'tel:0628200206')
    assert.equal(lienTelephone('+33 4.74.42.38.11'), 'tel:+33474423811')
    assert.equal(lienTelephone(''), null)
  })

  test('plusieurs numéros dans un même champ', () => {
    assert.deepEqual(telephones('06 79 45 53 82 / 04 74 51 39 39'), ['06 79 45 53 82', '04 74 51 39 39'])
    assert.deepEqual(telephones('04 74 45 20 90'), ['04 74 45 20 90'])
    assert.deepEqual(telephones(null), [])
  })
})
