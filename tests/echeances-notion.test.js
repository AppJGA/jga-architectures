// Échéances partagées avec Notion : lecture des cartes « ECHEANCES RENDUS »
// et calcul de la synchronisation. Cartes INVENTÉES : le dépôt est public,
// aucun texte réel de Notion n'y entre.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planSynchro } from '../src/shared/notion/synchroNotionLogique.js'
import {
  numeroAffaire, codeCarte, datesDuTexte, lireCarte, titreCarte, libellePourCarte, formatDateCarte,
  remplacerDate, remplacerLibelle, dateEtude, memePosition, dateDuJalon, champsJalon, nomAffaireNotion,
} from '../src/shared/notion/echeancesNotionLogique.js'

import {
  filtreEcheances, filtreAtelier, carteDepuisPage, referenceDepuisPage, proprietesCarte, operationValide, dansColonne, pagesAVerifier,
} from '../src/shared/notion/notionApiLogique.js'

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

test('titre d’une carte : une fraction du libellé n’est pas une seconde date', () => {
  const titre = titreCarte({ code: '2698-XYZ', libelle: 'Rendu lot 1/2', date: '2026-10-20' })
  assert.equal(titre, '2698 XYZ – Rendu lot 1-2 20/10/26')
  assert.equal(lireCarte(titre, '2026-10-12T00:00:00Z').dates.length, 1)
})

test('libellé pour une carte : fractions en tirets, vide = Échéance', () => {
  assert.equal(libellePourCarte(' Lot 1/2/3 '), 'Lot 1-2-3')
  assert.equal(libellePourCarte('  '), 'Échéance')
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
  numero: null, aujourdhui: '2026-10-12', maintenant: '2026-10-12T12:00:00.000Z', nouvelId: () => `n${++compteur}`, ...extra,
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
  assert.deepEqual(p.jalons, [{ action: 'deplacer', origine: 'chantier', id: 7, ligneId: 'l1', date: '2026-10-23', decrocher: true }])
  assert.equal(p.registre.ecrire[0].ligne.date_synchro, '2026-10-23')
})

test('synchro : date changée dans l’app → la date est réécrite dans la carte', () => {
  const p = planSynchro(base({
    registre: [ligne({ libelle: 'Rendu suite' })], jalons: [jalonC({ date: '2026-10-27' })], cartes: [carte('p1', '!! 2698 XYZ : Rendu 20/10/26 suite')],
  }))
  assert.deepEqual(p.cartes, [{ action: 'modifier', pageId: 'p1', titre: '!! 2698 XYZ : Rendu 27/10/26 suite', semaine: '2026-10-27', ligneIds: ['l1'] }])
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
  assert.deepEqual(p.jalons, [{ action: 'deplacer', origine: 'chantier', id: 7, ligneId: 'l1', date: '2026-10-20', decrocher: false }])
})

test('synchro : libellé changé dans Notion → l’échéance est renommée', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Réception 20/10/26')] }))
  assert.deepEqual(p.jalons, [{ action: 'renommer', origine: 'chantier', id: 7, ligneId: 'l1', label: 'Réception' }])
})

test('synchro : libellé changé dans l’app → réécrit dans la carte', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC({ label: 'Réception' })], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')] }))
  assert.equal(p.cartes[0].titre, '2698 XYZ : Réception 20/10/26')
})

test('synchro : carte disparue → échéance à venir supprimée, passée gardée ; lecture partielle → rien', () => {
  const futur = planSynchro(base({ registre: [ligne()], jalons: [jalonC()] }))
  assert.deepEqual(futur.jalons, [{ action: 'supprimer', origine: 'chantier', id: 7, ligneId: 'l1' }])
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
  assert.deepEqual(p.cartes, [{ action: 'corbeille', pageId: 'p1', ligneIds: ['l1'] }])
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

// ─── Passages successifs : un plan appliqué, puis relu, ne demande plus rien ──

const VIDE = { jalons: [], cartes: [], registre: { ecrire: [], supprimer: [] } }

// Applique un plan à l'état (cartes, registre, jalons) comme le ferait l'application
function appliquer(entree, plan) {
  let suivant = 1000
  const registre = entree.registre.filter((l) => !plan.registre.supprimer.includes(l.id))
  const jalons = entree.jalons.filter((j) => !plan.jalons.some((a) => a.action === 'supprimer' && a.origine === j.origine && a.id === j.id))
    .map((j) => {
      const a = plan.jalons.find((x) => x.origine === j.origine && x.id === j.id && x.action !== 'supprimer' && x.action !== 'creer')
      if (!a) return j
      const { action, ...reste } = a
      return { ...j, ...(action === 'deplacer' ? { date: undefined, semaine: undefined, annee: undefined } : {}), ...reste, ancre: a.decrocher ? false : j.ancre }
    })
  const ids = new Map()
  for (const a of plan.jalons.filter((x) => x.action === 'creer')) {
    const { ligneId, ...reste } = a
    delete reste.action
    const id = suivant++
    ids.set(ligneId, id)
    jalons.push({ id, ancre: false, modifie_le: '2026-10-12T00:00:00Z', ...reste })
  }
  const cartes = entree.cartes.map((c) => {
    const m = plan.cartes.find((x) => x.action === 'modifier' && x.pageId === c.id)
    return m ? { ...c, titre: m.titre } : c
  }).filter((c) => !plan.cartes.some((x) => x.action === 'corbeille' && x.pageId === c.id))
  const pages = new Map()
  for (const a of plan.cartes.filter((x) => x.action === 'creer')) {
    const id = `pn${suivant++}`
    pages.set(a.ligneId, id)
    cartes.push({ id, titre: a.titre, creeLe: entree.aujourdhui, modifieLe: entree.aujourdhui })
  }
  for (const { ligne } of plan.registre.ecrire) {
    const l = { ...ligne }
    if (ids.has(l.id)) l.jalon_id = ids.get(l.id)
    if (pages.has(l.id)) l.page_id = pages.get(l.id)
    const i = registre.findIndex((x) => x.id === l.id)
    if (i >= 0) registre[i] = l; else registre.push(l)
  }
  return { ...entree, cartes, registre, jalons }
}
const stable = (entree) => {
  const premier = planSynchro(entree)
  const deuxieme = appliquer(entree, premier)
  const second = planSynchro(deuxieme)
  // Le registre peut encore noter la référence et l'heure de la carte
  // (une écriture, sans effet sur Notion ni sur les plannings), puis plus rien
  assert.deepEqual({ ...second, registre: VIDE.registre }, VIDE)
  assert.deepEqual(planSynchro(appliquer(deuxieme, second)), VIDE)
  return premier
}

test('synchro : date lointaine sans année poussée par l’app → écrite avec son année, sans retour en arrière', () => {
  const p = stable(base({
    registre: [ligne()], jalons: [jalonC({ date: '2027-05-04', modifie_le: '2026-10-11T00:00:00Z' })],
    cartes: [{ ...carte('p1', '2698 XYZ : Rendu 20/10'), creeLe: '2026-10-01T08:00:00Z' }],
  }))
  assert.equal(p.cartes[0].titre, '2698 XYZ : Rendu 04/05/27')
})

test('synchro : ligne sans affaire, l’affaire arrive avec une échéance au même endroit → reliées, pas de doublon', () => {
  const p = stable(base({
    registre: [ligne({ affaire_id: null, origine: null, jalon_id: null, libelle_app: null })],
    jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')],
  }))
  assert.deepEqual(p.jalons, [])
  assert.deepEqual(p.cartes, [])
  assert.equal(p.registre.ecrire[0].ligne.jalon_id, 7)
})

test('synchro : échéance absente des données lues → carte jamais mise à la corbeille', () => {
  const horsDonnees = planSynchro(base({
    numero: '2699', affaires: [{ id: 'a-def', code_affaire: '2699-DEF', phase: 'chantier' }],
    registre: [ligne({ numero: '2699', affaire_id: 'a-abc' })], jalons: [], cartes: [carte('p1', '2699 ABC : Rendu 20/10/26')],
  }))
  assert.deepEqual(horsDonnees, VIDE)
  const sansAffaire = planSynchro(base({
    registre: [ligne({ affaire_id: null })], jalons: [], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')],
  }))
  assert.deepEqual(sansAffaire.cartes, [])
})

test('synchro : premier passage d’une carte créée par l’app → rien à renommer ensuite', () => {
  const p = stable(base({
    affaires: [...AFF, { id: 'a-long', code_affaire: '2697 - Exemple Long', phase: 'chantier' }],
    jalons: [jalonC({ id: 9, affaire_id: 'a-long', label: 'OPR' }), jalonC({ id: 10, label: '', date: '2026-10-22' })],
  }))
  assert.equal(p.cartes.length, 2)
})

test('synchro : libellé modifié dans l’app → titre réécrit relu à l’identique', () => {
  stable(base({
    affaires: [{ id: 'a-long', code_affaire: '2697 - Exemple Long', phase: 'chantier' }],
    registre: [ligne({ numero: '2697', affaire_id: 'a-long' })], jalons: [jalonC({ affaire_id: 'a-long', label: 'Levée des réserves' })],
    cartes: [carte('p1', '2697 Exemple : Rendu 20/10/26')],
  }))
})

test('synchro : ligne en attente de carte dont l’échéance a été supprimée → ligne retirée (affaire lue seulement)', () => {
  const attente = ligne({ page_id: null })
  assert.deepEqual(planSynchro(base({ registre: [attente], jalons: [] })).registre.supprimer, ['l1'])
  assert.deepEqual(planSynchro(base({ registre: [ligne({ page_id: null, affaire_id: 'ailleurs' })], jalons: [] })).registre.supprimer, [])
})

test('synchro : horodatages comparés comme des instants (Notion « Z », Supabase « +00:00 »)', () => {
  const p = planSynchro(base({
    registre: [ligne()], jalons: [jalonC({ date: '2026-10-27', modifie_le: '2026-10-11T12:00:00.500+00:00' })],
    cartes: [carte('p1', '2698 XYZ : Rendu 23/10/26', '2026-10-11T12:00:00Z')],
  }))
  assert.equal(p.cartes[0]?.action, 'modifier')
  assert.deepEqual(p.jalons, [])
})

test('synchro : échéance renommée « Rendu lot 1/2 » dans l’app → carte à une seule date, stable', () => {
  const p = stable(base({
    registre: [ligne()], jalons: [jalonC({ label: 'Rendu lot 1/2' })], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')],
  }))
  assert.equal(p.cartes[0].titre, '2698 XYZ : Rendu lot 1-2 20/10/26')
})

// ─── Deux appareils : la ligne en attente de carte appartient à celui qui la crée ──

test('synchro : ligne en attente sous bail + carte libre au même endroit → ni liaison ni écriture', () => {
  const p = planSynchro(base({
    registre: [ligne({ page_id: null, updated_at: '2026-10-12T11:59:00+00:00' })],
    jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ – Rendu 20/10/26')],
  }))
  // L'autre appareil vient de créer cette carte et va y écrire son adresse :
  // ni la relier ici, ni en faire une nouvelle échéance
  assert.deepEqual(p, VIDE)
})

test('synchro : ligne en attente au bail échu + carte libre au même endroit → reliées', () => {
  const p = planSynchro(base({
    registre: [ligne({ page_id: null, updated_at: '2026-10-12T11:50:00+00:00' })],
    jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ – Rendu 20/10/26')],
  }))
  assert.deepEqual(p.jalons, [])
  assert.deepEqual(p.cartes, [])
  assert.equal(p.registre.ecrire.length, 1)
  assert.equal(p.registre.ecrire[0].nouvelle, false)
  assert.equal(p.registre.ecrire[0].ligne.id, 'l1')
  assert.equal(p.registre.ecrire[0].ligne.page_id, 'p1')
})

test('synchro : ligne en attente sous bail sans carte → ni carte créée ni ligne retirée', () => {
  const attente = ligne({ page_id: null, updated_at: '2026-10-12T11:59:30+00:00' })
  assert.deepEqual(planSynchro(base({ registre: [attente], jalons: [jalonC()] })), VIDE)
  // Échéance supprimée entre-temps : la ligne attend la fin du bail
  assert.deepEqual(planSynchro(base({ registre: [attente], jalons: [] })), VIDE)
  // Bail échu : la carte est à créer, par celui qui reprendra le bail
  const echu = planSynchro(base({ registre: [{ ...attente, updated_at: '2026-10-12T11:00:00+00:00' }], jalons: [jalonC()] }))
  assert.equal(echu.cartes[0]?.action, 'creer')
  assert.equal(echu.cartes[0].ligneId, 'l1')
})

// ─── États passagers de Notion : une carte en cours de frappe n'efface rien ──

const RECENTE = '2026-10-12T11:58:00.000Z'   // deux minutes avant `maintenant`
const ANCIENNE = '2026-10-12T11:50:00.000Z'

test('synchro : numéro effacé à l’instant → lignes intactes ; effacé depuis longtemps → échéance retirée', () => {
  const entree = (modifieLe) => base({ registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', 'XYZ : Rendu 20/10/26', modifieLe)] })
  assert.deepEqual(planSynchro(entree(RECENTE)), VIDE)
  const ancienne = planSynchro(entree(ANCIENNE))
  assert.deepEqual(ancienne.jalons, [{ action: 'supprimer', origine: 'chantier', id: 7, ligneId: 'l1' }])
  assert.deepEqual(ancienne.registre.supprimer, ['l1'])
})

test('synchro d’un planning : carte passée à un autre numéro à l’instant → intacte ; une carte d’un autre numéro sans ligne ici → ignorée', () => {
  const entree = (modifieLe) => base({
    numero: '2698', registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', '2697 XYZ : Rendu 20/10/26', modifieLe)],
  })
  assert.deepEqual(planSynchro(entree(RECENTE)), VIDE)
  assert.deepEqual(planSynchro(entree(ANCIENNE)).registre.supprimer, ['l1'])
  // Carte d'un autre numéro, ses lignes hors de la lecture : rien, récente ou non
  const autre = (modifieLe) => planSynchro(base({
    numero: '2699', registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26', modifieLe)],
  }))
  assert.deepEqual(autre(RECENTE), VIDE)
  assert.deepEqual(autre(ANCIENNE), VIDE)
})

test('synchro : date effacée à l’instant (carte « à dater ») → échéance gardée telle quelle', () => {
  const entree = (modifieLe) => base({ registre: [ligne()], jalons: [jalonC({ couleur: '#123456' })], cartes: [carte('p1', '2698 XYZ : Rendu 2', modifieLe)] })
  assert.deepEqual(planSynchro(entree(RECENTE)), VIDE)
  // Restée sans date : l'échéance à venir part, la carte va dans « À dater »
  const ancienne = planSynchro(entree(ANCIENNE))
  assert.deepEqual(ancienne.jalons, [{ action: 'supprimer', origine: 'chantier', id: 7, ligneId: 'l1' }])
  assert.equal(ancienne.registre.ecrire[0].ligne.date_synchro, null)
})

test('synchro : une date d’une carte à plusieurs dates effacée à l’instant → toute la carte attend', () => {
  const entree = (modifieLe) => base({
    registre: [ligne({ nb_dates: 2 }), ligne({ id: 'l2', rang: 1, jalon_id: 8, date_synchro: '2026-11-20', libelle: 'DCE', libelle_app: 'DCE', nb_dates: 2 })],
    jalons: [jalonC(), jalonC({ id: 8, label: 'DCE', date: '2026-11-20' })],
    cartes: [carte('p1', '2698 XYZ - Rendu 20/10/26 - DCE', modifieLe)],
  })
  assert.deepEqual(planSynchro(entree(RECENTE)), VIDE)
  // Restée ainsi : la date disparue retire son échéance à venir
  const ancienne = planSynchro(entree(ANCIENNE))
  assert.deepEqual(ancienne.jalons.filter((a) => a.action === 'supprimer'), [{ action: 'supprimer', origine: 'chantier', id: 8, ligneId: 'l2' }])
})

test('synchro : une carte récente sans rien de destructif est traitée tout de suite', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Rendu 23/10/26', RECENTE)] }))
  assert.equal(p.jalons[0]?.action, 'deplacer')
})

test('API Notion : filtre de la colonne, avec ou sans numéro', () => {
  assert.deepEqual(filtreEcheances(null), { property: 'Jour', multi_select: { contains: 'ECHEANCES RENDUS' } })
  assert.deepEqual(filtreEcheances('2699'), { and: [
    { property: 'Jour', multi_select: { contains: 'ECHEANCES RENDUS' } },
    { property: 'N° Affaire', title: { contains: '2699' } },
  ] })
})

test('API Notion : base des affaires lue en entier, ou pour un numéro seulement', () => {
  assert.equal(filtreAtelier(null), null)
  assert.deepEqual(filtreAtelier('2699'), { property: 'Référence', title: { contains: '2699' } })
})

test('API Notion : carte encore dans la colonne, cartes connues à vérifier', () => {
  const page = (noms) => ({ properties: { Jour: { multi_select: noms.map((name) => ({ name })) } } })
  assert.equal(dansColonne(page(['Lundi', 'ECHEANCES RENDUS'])), true)
  assert.equal(dansColonne(page(['Dossiers en veille'])), false)
  assert.equal(dansColonne({}), false)
  const id = '0a1b2c3d-0000-4000-8000-0123456789ab'
  assert.deepEqual(pagesAVerifier([id, id.replace(/-/g, ''), '../x', 3, null]), [id])
  assert.deepEqual(pagesAVerifier('non'), [])
  assert.equal(pagesAVerifier(Array.from({ length: 300 }, (_, i) => `0a1b2c3d-0000-4000-8000-${String(i).padStart(12, '0')}`)).length, 200)
})

test('API Notion : page lue en carte, en référence ; carte écrite', () => {
  const page = {
    id: 'p1', created_time: '2026-10-01T08:00:00.000Z', last_edited_time: '2026-10-02T08:00:00.000Z',
    properties: { 'N° Affaire': { type: 'title', title: [{ plain_text: '2699 ABC : ' }, { plain_text: 'Rendu 16/10' }] } },
  }
  assert.deepEqual(carteDepuisPage(page), { id: 'p1', titre: '2699 ABC : Rendu 16/10', creeLe: '2026-10-01T08:00:00.000Z', modifieLe: '2026-10-02T08:00:00.000Z' })
  assert.deepEqual(referenceDepuisPage({ properties: { 'Référence': { title: [{ plain_text: '2697 - QRS' }] } } }), { numero: '2697', reference: '2697 - QRS' })
  assert.deepEqual(proprietesCarte({ titre: 'T', semaine: '2026-10-16' }), {
    'N° Affaire': { title: [{ type: 'text', text: { content: 'T' } }] },
    Semaine: { date: { start: '2026-10-16' } },
  })
})

test('API Notion : validation des opérations reçues', () => {
  const id = '0a1b2c3d-0000-4000-8000-0123456789ab'
  assert.equal(operationValide({ action: 'creer', titre: 'T', semaine: '2026-10-16' }), true)
  assert.equal(operationValide({ action: 'creer', titre: 'T', semaine: null }), true)
  assert.equal(operationValide({ action: 'creer', titre: 'T' }), true)
  assert.equal(operationValide({ action: 'modifier', pageId: id, titre: 'T', semaine: '2026-10-16' }), true)
  assert.equal(operationValide({ action: 'modifier', pageId: id.replace(/-/g, ''), titre: 'T' }), true)
  assert.equal(operationValide({ action: 'corbeille', pageId: id }), true)
  assert.equal(operationValide({ action: 'corbeille', pageId: '../users' }), false)
  assert.equal(operationValide({ action: 'modifier', pageId: id, semaine: '2026-10-16' }), false)
  assert.equal(operationValide({ action: 'creer', titre: '' }), false)
  assert.equal(operationValide({ action: 'creer', titre: 'x'.repeat(2001) }), false)
  assert.equal(operationValide({ action: 'creer', titre: 'T', semaine: '16/10/2026' }), false)
  assert.equal(operationValide({ action: 'autre' }), false)
  assert.equal(operationValide(null), false)
  assert.equal(operationValide('creer'), false)
  assert.equal(operationValide([]), false)
})
