// Échéances partagées avec Notion : lecture des cartes « ECHEANCES RENDUS »
// et calcul de la synchronisation. Cartes INVENTÉES : le dépôt est public,
// aucun texte réel de Notion n'y entre.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  numeroAffaire, codeCarte, datesDuTexte, lireCarte, titreCarte, formatDateCarte,
  remplacerDate, remplacerLibelle, dateEtude, memePosition, dateDuJalon, champsJalon, nomAffaireNotion,
} from '../src/shared/notion/echeancesNotionLogique.js'

test('numéro d’affaire : premier nombre de 4 chiffres, pas une année de date', () => {
  assert.equal(numeroAffaire('!!! 2699 ABC : Rendu PRO 16/10/2026'), '2699')
  assert.equal(numeroAffaire('2698-XYZ- Réunion'), '2698')
  assert.equal(numeroAffaire('Rendu 16/10/2026 sans numéro'), null)
  assert.equal(numeroAffaire('Point agence'), null)
  assert.equal(numeroAffaire('12345 trop long'), null)
})

test('code de carte : numéro et premier mot', () => {
  assert.equal(codeCarte('2699-ABC'), '2699 ABC')
  assert.equal(codeCarte('2697 - Exemple Long'), '2697 Exemple')
  assert.equal(codeCarte('2696'), '2696')
})

test('dates : avec ou sans année, heure ignorée, dates impossibles écartées', () => {
  const d = datesDuTexte('Rendu 16/10 11h, dépôt 20/11/26, oral 3/2/2027, faux 31/02, PRO/DCE', '2026-09-27T16:00:00Z')
  assert.deepEqual(d.map((x) => x.date), ['2026-10-16', '2026-11-20', '2027-02-03'])
  assert.equal(d[0].texte, '16/10')
  assert.equal(d[1].anneeCourte, true)
})

test('année absente : la plus proche de la création de la carte', () => {
  assert.equal(datesDuTexte('Rendu 05/01', '2026-12-20T10:00:00Z')[0].date, '2027-01-05')
  assert.equal(datesDuTexte('Rendu 30/09', '2026-10-05T10:00:00Z')[0].date, '2026-09-30')
})

test('carte à une date : libellé = le texte sans le numéro, le code ni la date', () => {
  const c = lireCarte('!!! 2699 ABC AB CT : Rendu PRO/DCE 30/10/26', '2026-09-27T00:00:00Z')
  assert.equal(c.numero, '2699')
  assert.equal(c.dates.length, 1)
  assert.equal(c.dates[0].libelle, 'AB CT : Rendu PRO/DCE')
  assert.equal(c.aDater, false)
})

test('carte à plusieurs dates : un libellé par morceau', () => {
  const c = lireCarte('2698 XYZ - AB CT : Rendu PC 09/10/26 - Rendu PRO 09/10/26 - Rendu DCE 20/11/26', '2026-09-27T00:00:00Z')
  assert.deepEqual(c.dates.map((d) => [d.rang, d.date, d.libelle]), [
    [0, '2026-10-09', 'AB CT : Rendu PC'], [1, '2026-10-09', 'Rendu PRO'], [2, '2026-11-20', 'Rendu DCE'],
  ])
})

test('carte sans date lisible : à dater', () => {
  const c = lireCarte('2697 QRS : Rendu PC fin novembre', '2026-09-27T00:00:00Z')
  assert.equal(c.aDater, true)
  assert.equal(c.numero, '2697')
})

test('titre d’une carte de l’app, relu à l’identique', () => {
  const titre = titreCarte({ code: '2699-ABC', libelle: 'Rendu PRO', date: '2026-10-16' })
  assert.equal(titre, '2699 ABC – Rendu PRO 16/10/26')
  const c = lireCarte(titre, '2026-10-12T00:00:00Z')
  assert.equal(c.dates[0].libelle, 'Rendu PRO')
  assert.equal(c.dates[0].date, '2026-10-16')
  assert.equal(formatDateCarte('2027-01-05'), '05/01/27')
})

test('remplacer une date : même format, reste intact', () => {
  const titre = '!!2699 ABC : Rendu  APD 16/10 - présentation'
  const c = lireCarte(titre, '2026-10-01T00:00:00Z')
  assert.equal(remplacerDate(titre, c.dates[0], '2026-10-23'), '!!2699 ABC : Rendu  APD 23/10 - présentation')
  const t2 = '2699 ABC – Rendu PRO 16/10/2026'
  assert.equal(remplacerDate(t2, lireCarte(t2, '2026-10-01T00:00:00Z').dates[0], '2027-01-08'), '2699 ABC – Rendu PRO 08/01/2027')
})

test('remplacer un libellé : seulement s’il est là une fois', () => {
  assert.equal(remplacerLibelle('2699 ABC – Rendu PRO 16/10/26', 'Rendu PRO', 'Rendu PRO/DCE'), '2699 ABC – Rendu PRO/DCE 16/10/26')
  assert.equal(remplacerLibelle('PRO et PRO', 'PRO', 'X'), null)
  assert.equal(remplacerLibelle('abc', 'zzz', 'X'), null)
})

test('date d’étude : garde le jour de la semaine de référence, vendredi sinon', () => {
  assert.equal(dateEtude(42, 2026, null), '2026-10-16')
  assert.equal(dateEtude(43, 2026, '2026-10-14'), '2026-10-21') // mercredi → mercredi
})

test('position d’une échéance : jour au chantier, semaine à l’étude', () => {
  assert.equal(memePosition({ origine: 'chantier', date: '2026-10-14' }, '2026-10-14'), true)
  assert.equal(memePosition({ origine: 'etude', semaine: 42, annee: 2026 }, '2026-10-12'), true)
  assert.equal(memePosition({ origine: 'etude', semaine: 42, annee: 2026 }, '2026-10-19'), false)
  assert.equal(dateDuJalon({ origine: 'etude', semaine: 43, annee: 2026 }, '2026-10-14'), '2026-10-21')
  assert.deepEqual(champsJalon('etude', '2026-10-14'), { semaine: 42, annee: 2026 })
  assert.deepEqual(champsJalon('chantier', '2026-10-14'), { date: '2026-10-14' })
})

test('nom d’une affaire absente de l’app : la référence de la base des affaires', () => {
  const refs = [{ numero: '2697', reference: '2697 - QRS Exemple' }]
  assert.equal(nomAffaireNotion('2697', refs), '2697 - QRS Exemple')
  assert.equal(nomAffaireNotion('2600', refs), null)
})
