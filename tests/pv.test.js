// Procès-verbaux : types proposés, pré-remplissage, contenu des documents.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  TYPES_PV, typesPvPourVisite, champsInitiaux, reservesPourPv, definitionPv, nomFichierPv, CHAMPS_PAR_TYPE, CHAMPS_DEFAUT,
} from '../src/modules/chantier/opr/pvLogique.js'

const reserves = [
  { numero: 12, lot_id: 'L5', description: 'Garde-corps', statut: 'ouverte', date_limite: '2026-11-15' },
  { numero: 13, lot_id: 'L5', description: 'Main courante', statut: 'contestee', date_limite: '2026-11-30' },
  { numero: 14, lot_id: 'L5', description: 'Grille', statut: 'levee', date_statut: '2026-10-01T10:00:00Z' },
  { numero: 15, lot_id: 'L5', description: 'Joint', statut: 'abandonnee' },
  { numero: 3, lot_id: 'L2', description: 'Autre lot', statut: 'ouverte' },
]

test('typesPvPourVisite : OPR selon le marché, levée à part', () => {
  assert.deepEqual(typesPvPourVisite({ type: 'opr' }, 'public').map((t) => t.code), ['public_opr', 'public_propositions', 'public_decision'])
  assert.deepEqual(typesPvPourVisite({ type: 'opr' }, 'prive').map((t) => t.code), ['prive_reception'])
  assert.deepEqual(typesPvPourVisite({ type: 'levee' }, 'public').map((t) => t.code), ['levee'])
})

test('chaque type a un formulaire, et tous ses champs existent', () => {
  for (const t of TYPES_PV) {
    assert.ok(CHAMPS_PAR_TYPE[t.code], t.code)
    for (const c of CHAMPS_PAR_TYPE[t.code]) assert.ok(c in CHAMPS_DEFAUT, `${t.code} : ${c}`)
  }
})

describe('champsInitiaux', () => {
  const visite = { date_visite: '2026-10-01' }
  test('dates de la visite, délai le plus lointain des réserves ouvertes', () => {
    const c = champsInitiaux('public_propositions', { visite, pvs: [], reserves, lotId: 'L5' })
    assert.equal(c.date_pv_opr, '2026-10-01')
    assert.equal(c.delai_levee, '2026-11-30')
    assert.equal(c.decision, 'avec_reserves')
  })
  test('sans réserve ouverte : sans réserves proposé', () => {
    assert.equal(champsInitiaux('prive_reception', { visite, pvs: [], reserves, lotId: 'L9' }).decision, 'sans_reserves')
  })
  test('reprend les PV déjà établis du lot', () => {
    const pvs = [
      { lot_id: 'L5', type: 'public_opr', champs: { numero_marche: '2025-017-05', lieu: 'Villeurbanne' } },
      { lot_id: 'L5', type: 'public_propositions', champs: { date_propositions: '2026-10-03', date_effet: '2026-09-30', decision: 'sans_reserves' } },
      { lot_id: 'L2', type: 'public_opr', champs: { numero_marche: 'AUTRE' } },
    ]
    const c = champsInitiaux('public_decision', { visite, pvs, reserves, lotId: 'L5' })
    assert.equal(c.numero_marche, '2025-017-05')
    assert.equal(c.lieu, 'Villeurbanne')
    assert.equal(c.date_propositions, '2026-10-03')
    assert.equal(c.date_effet, '2026-09-30')
    assert.equal(c.decision, 'sans_reserves')
  })
})

test('reservesPourPv : ouvertes et contestées ; pour la levée, levées et restantes', () => {
  assert.deepEqual(reservesPourPv('public_opr', { reserves, lotId: 'L5' }).reserves.map((r) => r.numero), [12, 13])
  const l = reservesPourPv('levee', { reserves, lotId: 'L5' })
  assert.deepEqual(l.levees.map((r) => r.numero), [14])
  assert.deepEqual(l.restantes.map((r) => r.numero), [12, 13])
})

function textes(n, acc = []) {
  if (typeof n === 'string') acc.push(n)
  else if (Array.isArray(n)) n.forEach((x) => textes(x, acc))
  else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) if (k !== 'image') textes(v, acc)
  return acc
}

describe('definitionPv', () => {
  const base = { affaire: { nom: 'GS', moa_nom: 'Ville de Lyon' }, lot: { id: 'L5', numero: 5, nom: 'Serrurerie' }, entreprise: { raison_sociale: 'Métallerie' }, visite: { date_visite: '2026-10-01' }, reserves }
  test('tous les types se construisent, avec titre, lot, entreprise et signatures', () => {
    for (const t of TYPES_PV) {
      const d = definitionPv({ ...base, type: t.code, champs: champsInitiaux(t.code, { ...base, pvs: [], lotId: 'L5' }) })
      const txt = textes(d.content).join(' | ')
      assert.ok(txt.includes(t.titre), t.code)
      assert.ok(txt.includes('Lot 5 — Serrurerie') && txt.includes('Métallerie'), t.code)
      assert.ok(txt.includes('Signature :'), t.code)
    }
  })
  test('PV des OPR : avis d’achèvement, réserves du lot, refus de signer', () => {
    const d = definitionPv({ ...base, type: 'public_opr', champs: { date_avis_achevement: '2026-09-10', titulaire_refus_signature: true } })
    const txt = textes(d.content).join(' | ')
    assert.ok(txt.includes('10/09/2026'))
    assert.ok(txt.includes('Garde-corps') && !txt.includes('Autre lot') && !txt.includes('Grille'))
    assert.ok(txt.includes('Le titulaire a refusé de signer.'))
  })
  test('refus : motifs, et pas de liste de réserves', () => {
    const txt = textes(definitionPv({ ...base, type: 'prive_reception', champs: { decision: 'refus', motifs: 'Ouvrage inachevé' } }).content).join(' | ')
    assert.ok(txt.includes('Ouvrage inachevé'))
    assert.ok(txt.includes('Sans objet.'))
    assert.ok(!txt.includes('Garde-corps'))
  })
  test('type inconnu refusé', () => {
    assert.throws(() => definitionPv({ ...base, type: 'x', champs: {} }))
  })
})

test('nomFichierPv', () => {
  assert.equal(nomFichierPv('public_decision', { numero: 5, nom: 'Serrurerie' }, { nom: 'GS' }, '2026-10-08'), 'Décision de réception – GS – Lot 5 — Serrurerie – 2026-10-08.pdf')
})
