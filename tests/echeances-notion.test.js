// Échéances partagées avec Notion : lecture des cartes « ECHEANCES RENDUS »
// et calcul de la synchronisation. Cartes INVENTÉES : le dépôt est public,
// aucun texte réel de Notion n'y entre.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planSynchro } from '../src/shared/notion/synchroNotionLogique.js'
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


const AFF = [
  { id: 'a-etude', code_affaire: '2699-ABC', phase: 'apd' },
  { id: 'a-chantier', code_affaire: '2698-XYZ', phase: 'chantier' },
]
const REFS = [{ numero: '2697', reference: '2697 - QRS Exemple' }]
let compteur = 0
const base = (extra = {}) => ({
  cartes: [], lectureComplete: true, registre: [], jalons: [], affaires: AFF, references: REFS,
  numero: null, aujourdhui: '2026-10-12', nouvelId: () => `n${++compteur}`, ...extra,
})
const carte = (id, titre, modifieLe = '2026-10-10T10:00:00Z') => ({ id, titre, creeLe: '2026-10-01T08:00:00Z', modifieLe })
const ligne = (extra) => ({
  id: 'l1', page_id: 'p1', rang: 0, numero: '2698', reference: null, affaire_id: 'a-chantier', origine: 'chantier',
  jalon_id: 7, libelle: 'Rendu', libelle_app: 'Rendu', date_synchro: '2026-10-20', texte_carte: '', nb_dates: 1,
  notion_modifie_le: null, ...extra,
})
const jalonC = (extra) => ({ origine: 'chantier', id: 7, affaire_id: 'a-chantier', label: 'Rendu', date: '2026-10-20', ancre: false, modifie_le: '2026-10-01T00:00:00Z', ...extra })

test('synchro : carte nouvelle d’une affaire de l’app → échéance de son planning (étude à la semaine)', () => {
  const p = planSynchro(base({ cartes: [carte('p9', '2699 ABC : Rendu APD 14/10')] }))
  assert.equal(p.jalons.length, 1)
  assert.deepEqual({ ...p.jalons[0], ligneId: undefined }, { action: 'creer', ligneId: undefined, origine: 'etude', affaire_id: 'a-etude', label: 'Rendu APD', semaine: 42, annee: 2026 })
  const { ligne: l, nouvelle } = p.registre.ecrire[0]
  assert.equal(nouvelle, true)
  assert.equal(l.id, p.jalons[0].ligneId)
  assert.equal(l.date_synchro, '2026-10-14')
  assert.equal(l.page_id, 'p9')
  assert.deepEqual(p.cartes, [])
})

test('synchro : affaire absente de l’app → ligne seule, nommée d’après la base des affaires', () => {
  const p = planSynchro(base({ cartes: [carte('p8', '2697 QRS : Dépôt PC 16/10')] }))
  assert.deepEqual(p.jalons, [])
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.affaire_id, null)
  assert.equal(l.reference, '2697 - QRS Exemple')
  assert.equal(l.date_synchro, '2026-10-16')
})

test('synchro : échéance de l’app à venir, sans carte → carte créée au format de l’agence', () => {
  const p = planSynchro(base({ jalons: [jalonC({ label: 'OPR' })] }))
  assert.equal(p.cartes.length, 1)
  assert.equal(p.cartes[0].action, 'creer')
  assert.equal(p.cartes[0].titre, '2698 XYZ – OPR 20/10/26')
  assert.equal(p.cartes[0].semaine, '2026-10-20')
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.page_id, null)
  assert.equal(l.id, p.cartes[0].ligneId)
  assert.equal(l.jalon_id, 7)
})

test('synchro : échéance passée sans carte → rien', () => {
  const p = planSynchro(base({ jalons: [jalonC({ date: '2026-09-01' })] }))
  assert.deepEqual(p.cartes, [])
  assert.deepEqual(p.registre.ecrire, [])
})

test('synchro : même affaire, même date des deux côtés → reliées, rien de créé', () => {
  const p = planSynchro(base({ jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Réception 20/10/26')] }))
  assert.deepEqual(p.jalons, [])
  assert.deepEqual(p.cartes, [])
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.page_id, 'p1')
  assert.equal(l.jalon_id, 7)
  assert.equal(l.libelle, 'Réception')
  assert.equal(l.libelle_app, 'Rendu')
})

test('synchro : date changée dans Notion → l’échéance suit, décrochée si accrochée', () => {
  const p = planSynchro(base({
    registre: [ligne()], jalons: [jalonC({ ancre: true })], cartes: [carte('p1', '2698 XYZ : Rendu 23/10/26')],
  }))
  assert.deepEqual(p.jalons, [{ action: 'deplacer', origine: 'chantier', id: 7, date: '2026-10-23', decrocher: true }])
  assert.equal(p.registre.ecrire[0].ligne.date_synchro, '2026-10-23')
})

test('synchro : date changée dans l’app → la date est réécrite dans la carte', () => {
  const p = planSynchro(base({
    registre: [ligne({ libelle: 'Rendu suite' })], jalons: [jalonC({ date: '2026-10-27' })], cartes: [carte('p1', '!! 2698 XYZ : Rendu 20/10/26 suite')],
  }))
  assert.deepEqual(p.cartes, [{ action: 'modifier', pageId: 'p1', titre: '!! 2698 XYZ : Rendu 27/10/26 suite', semaine: '2026-10-27' }])
  assert.equal(p.registre.ecrire[0].ligne.date_synchro, '2026-10-27')
})

test('synchro : changée des deux côtés → la plus récente l’emporte', () => {
  const entree = (modifApp) => base({
    registre: [ligne()], jalons: [jalonC({ date: '2026-10-27', modifie_le: modifApp })],
    cartes: [carte('p1', '2698 XYZ : Rendu 23/10/26', '2026-10-11T10:00:00Z')],
  })
  assert.equal(planSynchro(entree('2026-10-11T12:00:00Z')).cartes[0]?.action, 'modifier')
  assert.equal(planSynchro(entree('2026-10-11T08:00:00Z')).jalons[0]?.action, 'deplacer')
})

test('synchro : carte à plusieurs dates → Notion fait foi, l’échéance est remise', () => {
  const p = planSynchro(base({
    registre: [ligne({ nb_dates: 2 }), ligne({ id: 'l2', rang: 1, jalon_id: 8, date_synchro: '2026-11-20', libelle: 'DCE', libelle_app: 'DCE' })],
    jalons: [jalonC({ date: '2026-10-27', modifie_le: '2026-10-12T00:00:00Z' }), jalonC({ id: 8, label: 'DCE', date: '2026-11-20' })],
    cartes: [carte('p1', '2698 XYZ - Rendu 20/10/26 - DCE 20/11/26')],
  }))
  assert.deepEqual(p.cartes, [])
  assert.deepEqual(p.jalons, [{ action: 'deplacer', origine: 'chantier', id: 7, date: '2026-10-20', decrocher: false }])
})

test('synchro : libellé changé dans Notion → l’échéance est renommée', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Réception 20/10/26')] }))
  assert.deepEqual(p.jalons, [{ action: 'renommer', origine: 'chantier', id: 7, label: 'Réception' }])
})

test('synchro : libellé changé dans l’app → réécrit dans la carte', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC({ label: 'Réception' })], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')] }))
  assert.equal(p.cartes[0].titre, '2698 XYZ : Réception 20/10/26')
})

test('synchro : carte disparue → échéance à venir supprimée, passée gardée ; lecture partielle → rien', () => {
  const futur = planSynchro(base({ registre: [ligne()], jalons: [jalonC()] }))
  assert.deepEqual(futur.jalons, [{ action: 'supprimer', origine: 'chantier', id: 7 }])
  assert.deepEqual(futur.registre.supprimer, ['l1'])
  const passe = planSynchro(base({ registre: [ligne({ date_synchro: '2026-09-01' })], jalons: [jalonC({ date: '2026-09-01' })] }))
  assert.deepEqual(passe.jalons, [])
  assert.deepEqual(passe.registre.supprimer, ['l1'])
  const partielle = planSynchro(base({ lectureComplete: false, registre: [ligne()], jalons: [jalonC()] }))
  assert.deepEqual(partielle.jalons, [])
  assert.deepEqual(partielle.registre.supprimer, [])
})

test('synchro : échéance supprimée dans l’app → carte à la corbeille', () => {
  const p = planSynchro(base({ registre: [ligne()], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')] }))
  assert.deepEqual(p.cartes, [{ action: 'corbeille', pageId: 'p1' }])
  assert.deepEqual(p.registre.supprimer, ['l1'])
})

test('synchro : carte sans date lisible → ligne « à dater »', () => {
  const p = planSynchro(base({ cartes: [carte('p5', '2697 QRS : Rendu PC fin novembre')] }))
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.date_synchro, null)
  assert.equal(l.nb_dates, 0)
  assert.equal(l.texte_carte, '2697 QRS : Rendu PC fin novembre')
})

test('synchro : étude déplacée d’une semaine dans l’app → la carte garde son jour', () => {
  const p = planSynchro(base({
    registre: [ligne({ numero: '2699', affaire_id: 'a-etude', origine: 'etude', date_synchro: '2026-10-14' })],
    jalons: [{ origine: 'etude', id: 7, affaire_id: 'a-etude', label: 'Rendu', semaine: 43, annee: 2026, ancre: false, modifie_le: '2026-10-12T00:00:00Z' }],
    cartes: [carte('p1', '2699 ABC : Rendu 14/10')],
  }))
  assert.equal(p.cartes[0].titre, '2699 ABC : Rendu 21/10')
})

test('synchro d’un planning : rien hors de son affaire', () => {
  const p = planSynchro(base({
    numero: '2699', lectureComplete: true,
    registre: [ligne()], jalons: [jalonC()], cartes: [carte('p7', '2697 QRS : Dépôt 16/10')],
  }))
  assert.deepEqual(p, { jalons: [], cartes: [], registre: { ecrire: [], supprimer: [] } })
})
