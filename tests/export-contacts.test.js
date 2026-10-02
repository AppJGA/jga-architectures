// Export des contacts d'une affaire : vCard pour le téléphone, CSV pour Outlook.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { annuaireAffaire } from '../src/affaire/annuaireLogique.js'
import {
  vcard, vcards, csvOutlook, ligneOutlook, estMobile, nomFichierContacts, nomFichierContact, COLONNES_OUTLOOK,
} from '../src/affaire/exportContactsLogique.js'

const affaire = { nom: 'Meillonnas' }
const { interlocuteurs, entreprises } = annuaireAffaire({
  interlocuteurs: [
    { id: 'c', categorie: 'csps', prenom: 'Damien', nom: 'Vinot', organisation: 'Apave', fonction: 'Coordonnateur', telephone: '06 28 20 02 06 / 04 74 00 00 00', email: 'damien.vinot@apave.com', ordre: 0 },
    { id: 'b', categorie: 'be', categorie_label: 'BET Electricité', organisation: 'ICT; Ingénierie', email: 'fabien@beict.fr', ordre: 1 },
  ],
  lots: [
    { id: 'l2', numero: 2, nom: 'Gros-Œuvre', entreprise_id: 'e2', raison_sociale: 'RENAUD SAS', prenom: 'Bastien', nom_contact: 'Desbleds', fonction: 'Conducteur de travaux', interlocuteur_tel: '06 32 74 67 88', interlocuteur_email: 'b.desbleds@renaudbatiment.fr' },
  ],
})
const [bet, csps] = interlocuteurs // bureau d’études avant CSPS
const [go] = entreprises

describe('vCard', () => {
  test('une carte complète, lignes terminées par CRLF', () => {
    const v = vcard(csps, affaire)
    assert.ok(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'))
    assert.ok(v.endsWith('END:VCARD\r\n'))
    assert.ok(v.includes('N:Vinot;Damien;;;\r\n'))
    assert.ok(v.includes('FN:Damien Vinot\r\n'))
    assert.ok(v.includes('ORG:Apave\r\n'))
    assert.ok(v.includes('TITLE:Coordonnateur\r\n'))
    assert.ok(v.includes('TEL;TYPE=CELL,VOICE:06 28 20 02 06\r\n'))
    assert.ok(v.includes('TEL;TYPE=WORK,VOICE:04 74 00 00 00\r\n'))
    assert.ok(v.includes('EMAIL;TYPE=INTERNET,WORK:damien.vinot@apave.com\r\n'))
    assert.ok(v.includes('NOTE:Affaire Meillonnas – CSPS\r\n'))
    assert.ok(v.includes('CATEGORIES:Meillonnas\r\n'))
  })

  test('sans personne nommée : la société, affichée comme telle, caractères spéciaux échappés', () => {
    const v = vcard(bet, affaire)
    assert.ok(v.includes('N:;;;;\r\n'))
    assert.ok(v.includes('FN:ICT\\; Ingénierie\r\n'))
    assert.ok(v.includes('X-ABShowAs:COMPANY\r\n'))
    assert.ok(!v.includes('TEL'))
  })

  test('une ligne longue est pliée à 75 octets sans couper un accent', () => {
    const v = vcard({ ...go, fonction: 'Conducteur de travaux principal, chargé des études d’exécution et de la sécurité' }, affaire)
    const lignes = v.split('\r\n')
    assert.ok(lignes.every((l) => new TextEncoder().encode(l).length <= 75))
    const titre = v.match(/TITLE:[\s\S]*?\r\n(?! )/)[0].replace(/\r\n /g, '')
    assert.ok(titre.includes('études d’exécution et de la sécurité'))
  })

  test('plusieurs cartes à la suite dans un seul fichier', () => {
    assert.equal(vcards([csps, bet, go], affaire).match(/BEGIN:VCARD/g).length, 3)
  })
})

describe('CSV Outlook', () => {
  test('en-têtes d’Outlook, marque UTF-8, une ligne par contact', () => {
    const csv = csvOutlook([csps, bet, go], affaire)
    assert.ok(csv.startsWith('﻿"First Name","Last Name","Company"'))
    assert.equal(csv.trim().split('\r\n').length, 4)
    assert.equal(csv.split('\r\n')[1].split('","').length, COLONNES_OUTLOOK.length)
  })

  test('mobiles et fixes dans leurs colonnes', () => {
    const l = ligneOutlook(csps, affaire)
    assert.equal(l['Mobile Phone'], '06 28 20 02 06')
    assert.equal(l['Business Phone'], '04 74 00 00 00')
    assert.equal(l['Notes'], 'Affaire Meillonnas – CSPS')
    assert.equal(l['Categories'], 'Meillonnas')
    assert.equal(ligneOutlook(go, affaire)['Notes'], 'Affaire Meillonnas – 02 - Gros-Œuvre')
  })

  test('sans personne nommée, la société tient lieu de nom ; guillemets doublés', () => {
    const l = ligneOutlook(bet, affaire)
    assert.equal(l['Last Name'], 'ICT; Ingénierie')
    assert.ok(csvOutlook([{ ...bet, organisation: 'La "Fabrique"' }], affaire).includes('"La ""Fabrique"""'))
  })

  test('estMobile', () => {
    assert.equal(estMobile('06 28 20 02 06'), true)
    assert.equal(estMobile('+33 7 12 34 56 78'), true)
    assert.equal(estMobile('04 74 42 38 11'), false)
  })
})

test('noms de fichier', () => {
  assert.equal(nomFichierContacts({ nom: 'Groupe scolaire / Meillonnas' }, 'vcf'), 'Contacts – Groupe scolaire Meillonnas.vcf')
  assert.equal(nomFichierContact(csps), 'Damien Vinot.vcf')
  assert.equal(nomFichierContact(bet), 'ICT; Ingénierie.vcf')
})
