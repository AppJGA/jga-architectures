// « Gestion de l'application » : jauges, regroupements, alerte, comptes.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  LIMITES, jauge, parSorte, parAffaire, alerteAccueil, etatComptes, formatTaille,
} from '../src/admin/gestionAppLogique.js'
import { retourParDefaut } from '../src/core/layout/retourLogique.js'

const MO = 1024 * 1024

describe('jauges', () => {
  test('part et alerte à 80 %', () => {
    assert.deepEqual(jauge(512 * MO, LIMITES.fichiers), { octets: 512 * MO, limite: LIMITES.fichiers, part: 0.5, alerte: false })
    assert.equal(jauge(0.8 * LIMITES.base, LIMITES.base).alerte, true)
    assert.equal(jauge(null, LIMITES.base).octets, 0)
  })

  test('tailles lisibles', () => {
    assert.equal(formatTaille(300 * 1024), '300 Ko')
    assert.equal(formatTaille(3.4 * MO), '3,4 Mo')
    assert.equal(formatTaille(250 * MO), '250 Mo')
    assert.equal(formatTaille(1.5 * 1024 * MO), '1,5 Go')
  })
})

const lignes = [
  { bucket: 'cr-photos', affaire_id: 'A1', fichiers: 10, octets: 3 * MO },
  { bucket: 'cr-photos', affaire_id: 'A2', fichiers: 2, octets: 1 * MO },
  { bucket: 'cr-plans', affaire_id: 'A1', fichiers: 4, octets: 6 * MO },
  { bucket: 'affaires-photos', affaire_id: null, fichiers: 3, octets: 0.5 * MO },
  { bucket: 'cr-archives', affaire_id: 'A9', fichiers: 1, octets: 0.2 * MO },
  { bucket: 'inconnu', affaire_id: null, fichiers: 1, octets: 100 },
]

describe('regroupements', () => {
  test('par sorte, du plus lourd au plus léger', () => {
    assert.deepEqual(parSorte(lignes).map((s) => [s.sorte, s.fichiers]), [
      ['plans', 4], ['photos', 12], ['couvertures', 3], ['archives', 1], ['autres', 1],
    ])
  })

  test('par affaire ; hors affaire et affaire disparue regroupés à la fin', () => {
    const r = parAffaire(lignes, [{ id: 'A1', code: '2618', nom: 'Logements' }, { id: 'A2', code: '2701', nom: 'École' }], 10)
    assert.deepEqual(r.map((a) => [a.affaireId, a.libelle, a.fichiers]), [
      ['A1', '2618 · Logements', 14], ['A2', '2701 · École', 2], [null, 'Hors affaire (ou affaire supprimée)', 5],
    ])
    assert.equal(parAffaire(lignes, [{ id: 'A1' }, { id: 'A2' }], 1).length, 2)
  })
})

describe('alerte de l’accueil', () => {
  test('aucune sous le seuil ; la plus remplie au-dessus ; inconnu ignoré', () => {
    assert.equal(alerteAccueil({ fichiers: 100 * MO, base: 50 * MO }), null)
    assert.equal(alerteAccueil({ fichiers: 900 * MO, base: 450 * MO }).texte, 'Base de données à 90 % de l’offre gratuite')
    assert.equal(alerteAccueil({ fichiers: 870 * MO }).texte, 'Stockage des fichiers à 85 % de l’offre gratuite')
    assert.equal(alerteAccueil({}), null)
  })
})

describe('comptes', () => {
  test('agence, extérieurs, associés, sans profil', () => {
    const comptes = [
      { a_un_profil: true, type_compte: 'agence', est_associe: true },
      { a_un_profil: true, type_compte: 'agence', est_associe: false },
      { a_un_profil: true, type_compte: 'exterieur', est_associe: false },
      { a_un_profil: false, type_compte: null, est_associe: false },
    ]
    assert.deepEqual(etatComptes(comptes), { total: 4, agence: 2, exterieurs: 1, associes: 1, sansProfil: 1 })
  })
})

describe('retour', () => {
  test('la page mène à l’accueil', () => {
    assert.equal(retourParDefaut('/gestion-application').vers, '/home')
  })
})

// ─── Crédits API Claude ──────────────────────────────────────────────────────

import {
  coutAppel, usageDuFlux, periodeCredits, resumeConsommation, formatDollars, CREDITS_API,
} from '../src/admin/consommationIaLogique.js'

const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)

describe('crédits API Claude', () => {
  test('coût d’un appel aux prix publics, cache compris', () => {
    // Opus 5.5 : 4 $ / 20 $ par million, lecture du cache 0,20 $, écriture 1,25 × l'entrée
    proche(coutAppel('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), 24)
    proche(coutAppel('claude-opus-5-5', { cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 }), 5 + 0.2)
    proche(coutAppel('claude-sonnet-5-5', { input_tokens: 500000, output_tokens: 100000 }), 1 + 1)
    assert.equal(coutAppel('claude-opus-5-5', null), 0)
  })

  test('un repli de modèle compte chaque essai à son propre prix', () => {
    const usage = {
      input_tokens: 1e6, output_tokens: 0,
      iterations: [
        { type: 'message', model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 0 },
        { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1e6, output_tokens: 0 },
      ],
    }
    proche(coutAppel('claude-opus-4-8', usage), 4 + 5)
  })

  test('modèle inconnu : prix de la famille la plus proche, sinon Opus 5', () => {
    proche(coutAppel('claude-sonnet-5-5-2027', { input_tokens: 1e6 }), 2)
    proche(coutAppel('modele-mystere', { input_tokens: 1e6 }), 5)
  })

  test('usage relevé dans un flux : entrée au départ, cumuls ensuite', () => {
    const lu = usageDuFlux([
      { type: 'message_start', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 1200, output_tokens: 1 } } },
      { type: 'content_block_delta' },
      { type: 'message_delta', usage: { output_tokens: 300 } },
      { type: 'message_delta', usage: { output_tokens: 800 } },
    ])
    assert.deepEqual(lu, { modele: 'claude-sonnet-5-5', usage: { input_tokens: 1200, output_tokens: 800 } })
    assert.equal(usageDuFlux([{ type: 'ping' }]), null)
  })

  test('période du 7 au 6, à cheval sur l’année', () => {
    const p = periodeCredits(new Date('2026-11-19T10:00:00Z'))
    assert.equal(p.debut.toISOString(), '2026-11-07T00:00:00.000Z')
    assert.equal(p.fin.toISOString(), '2026-12-07T00:00:00.000Z')
    const q = periodeCredits(new Date('2027-01-03T10:00:00Z'))
    assert.equal(q.debut.toISOString(), '2026-12-07T00:00:00.000Z')
    assert.equal(periodeCredits(new Date('2026-11-07T00:00:00Z')).debut.toISOString(), '2026-11-07T00:00:00.000Z')
  })

  test('résumé : période en cours, précédente, par usage, projection', () => {
    const lignes = [
      { cree_le: '2026-11-01T12:00:00Z', fonction: 'edl-pieces', modele: 'claude-opus-5-5', usage: { input_tokens: 1e6 } },
      { cree_le: '2026-11-08T12:00:00Z', fonction: 'analyser-edl', modele: 'claude-opus-5-5', usage: { output_tokens: 1e6 } },
      { cree_le: '2026-11-10T12:00:00Z', fonction: 'analyser-edl', modele: 'claude-opus-5-5', usage: { output_tokens: 1e6 } },
      { cree_le: '2026-11-12T12:00:00Z', fonction: 'analyser-visite', modele: 'claude-sonnet-5-5', usage: { input_tokens: 1e6 } },
    ]
    const r = resumeConsommation(lignes, new Date('2026-11-19T00:00:00Z'))
    proche(r.depense, 42)
    proche(r.part, 0.42)
    assert.equal(r.alerte, false)
    proche(r.reste, 58)
    assert.equal(r.appels, 3)
    assert.deepEqual(r.parFonction.map((f) => [f.fonction, f.appels]), [['analyser-edl', 2], ['analyser-visite', 1]])
    proche(r.precedente.depense, 4)
    // 42 $ en 12 jours sur une période de 30
    proche(r.projection, 42 * 30 / 12)
    assert.equal(r.depuis.toISOString(), '2026-11-01T12:00:00.000Z')
  })

  test('alerte à 80 %, pas de projection le premier jour, reste jamais négatif', () => {
    const lignes = [{ cree_le: '2026-11-07T02:00:00Z', fonction: 'analyser-edl', modele: 'claude-opus-5-5', usage: { output_tokens: 6e6 } }]
    const r = resumeConsommation(lignes, new Date('2026-11-07T10:00:00Z'))
    assert.equal(r.alerte, true)
    assert.equal(r.reste, 0)
    assert.equal(r.projection, null)
    assert.equal(r.montant, CREDITS_API.montantUsd)
  })

  test('l’accueil prévient au-delà de 80 % des crédits', () => {
    assert.equal(alerteAccueil({ credits: 0.5 }), null)
    assert.match(alerteAccueil({ credits: 0.85, fichiers: 0, base: 0 }).texte, /Crédits API Claude du mois utilisés à 85 %/)
  })

  test('montants en dollars', () => {
    assert.equal(formatDollars(12.3), '12,30 $')
    assert.equal(formatDollars(0.001), '< 0,01 $')
    assert.equal(formatDollars(0), '0,00 $')
  })
})
