// PDF d'une visite OPR ou de levée : statuts affichés, contenu, nom du fichier.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { definitionPdfOpr, statutPourVisite, nomFichierOpr } from '../src/modules/chantier/opr/rapportOprLogique.js'
import { groupesVisiteOpr } from '../src/modules/chantier/opr/oprLogique.js'

const lots = [{ id: 'L2', numero: 2, nom: 'Gros œuvre' }, { id: 'L5', numero: 5, nom: 'Serrurerie' }]
const visites = [
  { id: 'V1', numero: 1, type: 'opr', date_visite: '2026-09-15', lot_ids: ['L2', 'L5'], statut: 'emis', date_emission: '2026-09-15T17:00:00Z' },
  { id: 'V2', numero: 2, type: 'levee', date_visite: '2026-10-01', lot_ids: ['L2', 'L5'], statut: 'brouillon', observations: 'Accès au local technique impossible.' },
]
const reserves = [
  { id: 'R1', numero: 1, visite_origine_id: 'V1', lot_id: 'L2', statut: 'levee', description: 'Fissure linteau', localisation: 'Hall', date_limite: '2026-09-25' },
  { id: 'R2', numero: 2, visite_origine_id: 'V1', lot_id: 'L5', statut: 'ouverte', description: 'Garde-corps', date_limite: '2026-09-25' },
  { id: 'R3', numero: 3, visite_origine_id: 'V1', lot_id: 'L5', statut: 'ouverte', description: 'Main courante' },
]
const constats = [
  { reserve_id: 'R1', visite_id: 'V1', statut: 'ouverte', created_at: '1' },
  { reserve_id: 'R2', visite_id: 'V1', statut: 'ouverte', created_at: '2' },
  { reserve_id: 'R3', visite_id: 'V1', statut: 'ouverte', created_at: '3' },
  { reserve_id: 'R1', visite_id: 'V2', statut: 'levee', commentaire: 'Reprise conforme', created_at: '4' },
  { reserve_id: 'R2', visite_id: 'V2', statut: 'ouverte', commentaire: 'Toujours absent', created_at: '5' },
]

function textes(noeud, acc = []) {
  if (typeof noeud === 'string') acc.push(noeud)
  else if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, acc))
  else if (noeud && typeof noeud === 'object') for (const [k, v] of Object.entries(noeud)) if (k !== 'image') textes(v, acc)
  return acc
}

test('statutPourVisite : levée, non levée, non revue', () => {
  const g = groupesVisiteOpr({ visite: visites[1], visites, reserves, constats, lots })
  const toutes = g.flatMap((x) => x.reserves)
  assert.deepEqual(toutes.map((r) => [r.numero, statutPourVisite(r, visites[1]).libelle]), [[1, 'Levée'], [2, 'Non levée'], [3, 'Non revue']])
})

test('PDF de levée : titre, récapitulatif, commentaires, retard, observations', () => {
  const groupes = groupesVisiteOpr({ visite: visites[1], visites, reserves, constats, lots })
  const def = definitionPdfOpr({ visite: visites[1], affaire: { nom: 'Groupe scolaire' }, groupes, toutesReserves: reserves, lots, presences: [], reglages: {} })
  const t = textes(def.content).join(' | ')
  for (const attendu of ['Levée des réserves n°02', 'Visite de levée des réserves', 'Récapitulatif des réserves par lot', 'LOT 2 — GROS ŒUVRE', 'Reprise conforme', 'Toujours absent', 'Non levée', 'Non revue', 'EN RETARD', 'Accès au local technique impossible.', 'Lots concernés : ']) {
    assert.ok(t.includes(attendu), `manque « ${attendu} »`)
  }
  assert.equal(def.footer(1, 2).columns[1].text, 'Page 1 / 2')
})

test('version par lot : récapitulatif limité au lot', () => {
  const groupes = groupesVisiteOpr({ visite: visites[0], visites, reserves, constats, lots }).filter((g) => g.lotId === 'L5')
  const def = definitionPdfOpr({ visite: visites[0], affaire: {}, groupes, toutesReserves: reserves, lots, presences: [], reglages: { lot: 'L5' }, versionPour: 'Lot 5 — Serrurerie' })
  const t = textes(def.content).join(' | ')
  assert.ok(t.includes('Version pour : Lot 5 — Serrurerie'))
  assert.ok(!t.includes('Fissure linteau'))
  assert.ok(!t.includes('Lot 2 — Gros œuvre'))
})

test('nomFichierOpr', () => {
  assert.equal(nomFichierOpr(visites[0], { nom: 'GS' }), 'OPR01 – GS – 2026-09-15.pdf')
  assert.equal(nomFichierOpr(visites[1], { nom: 'GS' }, 'Lot 5 — Serrurerie'), 'Levée02 – GS – 2026-10-01 – Lot 5 — Serrurerie.pdf')
})
