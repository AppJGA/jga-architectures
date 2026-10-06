// Diffusion par la messagerie : destinataires, entreprises, texte et lien.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  participantsAvecEmail, selectionParDefaut, entreprisesDiffusion, dateExpiration, texteEmail, texteEmailDocument, lienMailto, texteACopier, MAILTO_MAX, fichierOutlook, corpsHtml, nomFichierOutlook, codeLien, aleaLien, adresseLien,
} from '../src/modules/chantier/comptes-rendus/diffusionLogique.js'

const presences = [
  { id: 'p1', presence: 'p', convoque: true, copie_type: 'interlocuteur', copie_prenom: 'Anne', copie_nom: 'Martin', copie_organisation: 'Ville de Lyon', copie_email: 'a.martin@lyon.fr' },
  { id: 'p2', presence: 'na', convoque: false, copie_type: 'interlocuteur', copie_prenom: 'Luc', copie_nom: 'Bet', copie_email: 'pas-une-adresse' },
  { id: 'p3', presence: 'a', convoque: false, copie_type: 'entreprise', copie_lot_numero: 2, copie_lot_nom: 'Gros œuvre', copie_entreprise: 'Maçonnerie Dupont', copie_email: 'contact@dupont.fr', lot_entreprises: { lot_id: 'L2' } },
  { id: 'p4', presence: 'na', convoque: true, copie_type: 'entreprise', copie_lot_numero: 2, copie_lot_nom: 'Gros œuvre', copie_entreprise: 'Béton Plus', copie_email: 'Contact@Dupont.fr' },
  { id: 'p5', presence: 'e', convoque: false, copie_type: 'entreprise', copie_lot_numero: 5, copie_lot_nom: 'Serrurerie', copie_entreprise: 'Fer & Co', copie_email: 'fer@co.fr' },
]
const lots = [{ id: 'L2', numero: 2, nom: 'Gros œuvre' }, { id: 'L5', numero: 5, nom: 'Serrurerie' }]

describe('participantsAvecEmail', () => {
  test('adresses valides seulement, une fois chacune (casse ignorée)', () => {
    const p = participantsAvecEmail(presences)
    assert.deepEqual(p.map((x) => x.email), ['a.martin@lyon.fr', 'contact@dupont.fr', 'fer@co.fr'])
    assert.equal(p[1].nom, 'Maçonnerie Dupont')
    assert.equal(p[1].detail, 'Lot 2 — Gros œuvre')
  })
  test('sélection par défaut : convoqués ou présents, sinon tous', () => {
    const p = participantsAvecEmail(presences)
    assert.deepEqual([...selectionParDefaut(p)], ['p1'])
    assert.deepEqual([...selectionParDefaut(p.map((x) => ({ ...x, convoque: false, present: false })))], ['p1', 'p3', 'p5'])
  })
})

test('entreprisesDiffusion : une ligne par lot, lot de la fiche ou retrouvé par numéro', () => {
  const e = entreprisesDiffusion(presences, lots)
  assert.deepEqual(e.map((x) => [x.destinataire, x.libelle, x.entreprises, x.adresses]), [
    ['lot:L2', 'Lot 2 — Gros œuvre', ['Maçonnerie Dupont', 'Béton Plus'], ['contact@dupont.fr']],
    ['lot:L5', 'Lot 5 — Serrurerie', ['Fer & Co'], ['fer@co.fr']],
  ])
})

test('dateExpiration : 30 jours', () => {
  assert.equal(dateExpiration(new Date('2026-09-15T12:00:00Z')).toISOString(), '2026-10-15T12:00:00.000Z')
})

describe('texteEmail', () => {
  const cr = { numero: 5, date_reunion: '2026-09-15', date_prochaine_reunion: '2026-09-22', heure_prochaine_reunion: '09:00:00' }
  test('objet, version, lien, expiration, prochaine réunion, signature', () => {
    const { objet, corps } = texteEmail({ cr, affaire: { nom: 'Groupe scolaire' }, versionPour: 'Lot 2 — Gros œuvre', lien: 'https://x/y', expiration: new Date('2026-10-15T12:00:00Z'), signataire: 'Victor Guyon' })
    assert.equal(objet, 'Compte rendu de réunion n°05 — Groupe scolaire — 15/09/2026')
    assert.ok(corps.includes('Veuillez trouver ci-joint le compte rendu de la réunion de chantier n°05 du 15 septembre 2026 (Groupe scolaire), version pour Lot 2 — Gros œuvre.'))
    assert.ok(corps.includes("Il est aussi téléchargeable jusqu'au 15 octobre 2026 :\nhttps://x/y\n"))
    assert.ok(corps.includes('Prochaine réunion : mardi 22 septembre 2026 à 9 h.'))
    assert.ok(corps.endsWith('Victor Guyon — JGA Architectures'))
  })
  test('sans prochaine réunion ni version', () => {
    const { corps } = texteEmail({ cr: { numero: 1, date_reunion: '2026-09-15' }, affaire: null, lien: 'L', expiration: new Date('2026-10-15') })
    assert.ok(!corps.includes('Prochaine'))
    assert.ok(!corps.includes('version pour'))
  })
})

describe('lienMailto', () => {
  test('destinataires visibles, texte encodé', () => {
    const l = lienMailto({ adresses: ['a@b.fr', 'c+d@e.fr'], objet: 'CR n°05 & suite', corps: 'Ligne 1\nLigne 2' })
    assert.equal(l, 'mailto:a%40b.fr,c%2Bd%40e.fr?subject=CR%20n%C2%B005%20%26%20suite&body=Ligne%201%0ALigne%202')
  })
  test('copie cachée : aucun destinataire visible', () => {
    const l = lienMailto({ adresses: ['a@b.fr', 'c@d.fr'], copieCachee: true, objet: 'O', corps: 'C' })
    assert.ok(l.startsWith('mailto:?bcc=a%40b.fr%2Cc%40d.fr&'))
  })
  test('longueur surveillée', () => {
    const l = lienMailto({ adresses: Array.from({ length: 80 }, (_, i) => `entreprise${i}@exemple.fr`), objet: 'O', corps: 'C' })
    assert.ok(l.length > MAILTO_MAX)
  })
})

test('texteACopier', () => {
  assert.equal(texteACopier({ adresses: ['a@b.fr'], copieCachee: true, objet: 'O', corps: 'C' }), 'Cci : a@b.fr\nObjet : O\n\nC')
})

test('texteEmailDocument : autre document (OPR)', () => {
  const { objet, corps } = texteEmailDocument({ intitule: 'OPR', designation: 'le compte rendu des opérations préalables à la réception', numero: 1, date: '2026-09-15', affaire: { nom: 'GS' }, versionPour: 'Lot 5 — Serrurerie', lien: 'L', expiration: new Date('2026-10-15') })
  assert.equal(objet, 'OPR n°01 — GS — 15/09/2026')
  assert.ok(corps.includes('Veuillez trouver ci-joint le compte rendu des opérations préalables à la réception n°01 du 15 septembre 2026 (GS), version pour Lot 5 — Serrurerie.'))
})

describe('fichier e-mail pour Outlook', () => {
  const decoder = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)))

  test('destinataires, objet accentué et texte en HTML', () => {
    const f = fichierOutlook({ adresses: ['a@b.fr', 'c@d.fr'], objet: 'Compte rendu n°05 — Église', corps: 'Bonjour,\n\nCi-joint.\nLien : https://x/y?a=1&b=2' })
    const [entete, corps] = f.split('\r\n\r\n')
    assert.ok(entete.includes('To: a@b.fr, c@d.fr'))
    const sujet = entete.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1]
    assert.equal(decoder(sujet), 'Compte rendu n°05 — Église')
    const html = decoder(corps)
    assert.ok(html.includes('<p>Bonjour,</p><p>Ci-joint.<br>Lien : <a href="https://x/y?a=1&amp;b=2">https://x/y?a=1&amp;b=2</a></p>'))
    assert.ok(!f.includes('\n') || f.split('\n').every((l, i, t) => i === t.length - 1 || l.endsWith('\r')), 'fins de ligne CRLF')
  })
  test('copie cachée', () => {
    const f = fichierOutlook({ adresses: ['a@b.fr'], copieCachee: true, objet: 'O', corps: 'C' })
    assert.ok(f.startsWith('Bcc: a@b.fr\r\n'))
    assert.ok(!f.includes('To:'))
  })
  test('le texte est échappé', () => {
    assert.ok(corpsHtml('<script>').includes('&lt;script&gt;'))
  })
  test('nom du fichier d’après le PDF', () => {
    assert.equal(nomFichierOutlook('CR05 – Groupe scolaire – 2026-09-15.pdf'), 'CR05 – Groupe scolaire – 2026-09-15.emltpl')
  })
})

describe('lien de téléchargement court', () => {
  test('affaire, document, numéro et aléa', () => {
    assert.equal(codeLien({ codeAffaire: '2618-LVV', numero: 3, alea: 'k7Pq9x' }), '2618-LVV-CR03-k7Pq9x')
  })
  test('version par lot, sans accents ni ligatures, raccourcie', () => {
    assert.equal(codeLien({ codeAffaire: '2618-LVV', numero: 3, version: '02 - Gros œuvre', alea: 'k7Pq9x' }), '2618-LVV-CR03-02-Gros-oeuvre-k7Pq9x')
    const long = codeLien({ codeAffaire: 'A', numero: 1, version: '07 - Menuiseries extérieures aluminium et occultations', alea: 'x' })
    assert.equal(long, 'A-CR01-07-Menuiseries-exterieur-x')
  })
  test('OPR, affaire sans code', () => {
    assert.equal(codeLien({ document: 'OPR', numero: 1, alea: 'abcdef' }), 'OPR01-abcdef')
  })
  test('le code passe la contrainte de la base', () => {
    assert.match(codeLien({ codeAffaire: '2618/LVV É', numero: 12, version: 'Mme Dupont (BET)', alea: aleaLien() }), /^[A-Za-z0-9-]{6,80}$/)
  })
  test('aléa : 6 caractères lisibles', () => {
    // 56 caractères : l'octet 56 revient au premier
    assert.equal(aleaLien(6, () => [0, 1, 2, 55, 56, 255]), 'abc9aH')
    assert.doesNotMatch(aleaLien(200), /[lo01IO]/)
    assert.equal(aleaLien().length, 6)
  })
  test('adresse', () => {
    assert.equal(adresseLien('https://site.fr/', 'A-CR01-x'), 'https://site.fr/pdf/A-CR01-x')
  })
})
