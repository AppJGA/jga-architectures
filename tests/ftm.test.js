// Lien entre remarques, réserves et fiches de travaux modificatifs.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { ligneDeFtm } from '../src/modules/chantier/ftm/ligneFinanciereLogique.js'
import {
  ftmDeRemarque, ftmDeReserve, resumeFtm, ftmDepuisElement, libelleSourceRemarque, libelleSourceReserve,
} from '../src/modules/chantier/ftm/lienFtm.js'

const ftms = [
  { id: 'F1', numero: 3, decision: 'en_attente', source_type: 'remarque', source_suivi_id: 'S1' },
  { id: 'F2', numero: 4, decision: 'accepte', source_type: 'reserve', source_reserve_id: 'R9' },
]

test('retrouver la FTM d’une remarque (par son suivi) ou d’une réserve', () => {
  assert.equal(ftmDeRemarque(ftms, { suivi_id: 'S1' })?.id, 'F1')
  assert.equal(ftmDeRemarque(ftms, { suivi_id: 'autre' }), null)
  assert.equal(ftmDeRemarque(ftms, {}), null)
  assert.equal(ftmDeReserve(ftms, { id: 'R9' })?.id, 'F2')
  assert.equal(ftmDeReserve(ftms, { id: 'R1' }), null)
})

test('résumé affiché', () => {
  assert.equal(resumeFtm(ftms[0]).texte, 'FTM n°3 · En attente')
  assert.equal(resumeFtm(ftms[1]).texte, 'FTM n°4 · Acceptée')
  assert.equal(resumeFtm({ numero: 5 }).texte, 'FTM n°5 · En attente')
})

test('libellés de source', () => {
  assert.equal(libelleSourceRemarque({ numero: 12 }, { numero: 5 }), 'Remarque n°12 (CR n°05)')
  assert.equal(libelleSourceReserve({ numero: 4 }, { numero: 1, type: 'opr' }), 'Réserve n°4 (OPR n°01)')
  assert.equal(libelleSourceReserve({ numero: 4 }, { numero: 2, type: 'levee' }), 'Réserve n°4 (Levée n°02)')
})

test('champs d’une FTM créée depuis une remarque : description, lot et origine', () => {
  const longue = { numero: 12, suivi_id: 'S1', lot_id: 'L2', description: 'Reprendre entièrement l’enduit de la façade nord au droit des appuis de fenêtres, côté cour intérieure' }
  const champs = ftmDepuisElement({ type: 'remarque', element: longue, contexte: { numero: 5 } })
  // La table `ftm` n'a pas de colonne « intitulé » : tout est dans la description
  assert.equal('intitule' in champs, false)
  assert.equal(champs.description, longue.description)
  assert.equal(champs.lot_id, 'L2')
  assert.equal(champs.origine, 'aleas')
  assert.equal(champs.decision, 'en_attente')
  assert.equal(champs.source_suivi_id, 'S1')
  assert.equal(champs.source_libelle, 'Remarque n°12 (CR n°05)')
})

test('depuis une réserve : lien par identifiant', () => {
  const champs = ftmDepuisElement({ type: 'reserve', element: { id: 'R9', numero: 4, description: 'Garde-corps' }, contexte: { numero: 1, type: 'opr' }, lotId: 'L5' })
  assert.equal(champs.source_reserve_id, 'R9')
  assert.equal(champs.lot_id, 'L5')
  assert.equal(champs.description, 'Garde-corps')
})

describe('ligne financière d’une fiche', () => {
  const fiche = { id: 'f1', numero: 12, origine: 'aleas', lot_id: 'L2', montant_travaux_ht: 3200, decision: 'en_attente', description: 'Reprise d’enduit' }

  test('la ligne dit d’où elle vient et où elle va', () => {
    const l = ligneDeFtm(fiche, 'A1')
    assert.equal(l.reference, 'FTM-012')
    assert.match(l.intitule, /^FTM-012 — Reprise d’enduit/)
    assert.equal(l.lot_id, 'L2')
    assert.equal(l.categorie, 'aleas')
  })

  test('une décision en attente donne une ligne en attente', () => {
    assert.equal(ligneDeFtm(fiche, 'A1').statut, 'en_attente')
    assert.equal(ligneDeFtm({ ...fiche, decision: 'accepte' }, 'A1').statut, 'avenant_signe')
    assert.equal(ligneDeFtm({ ...fiche, decision: 'renonce' }, 'A1').statut, 'refuse')
  })

  test('une moins-value garde son signe', () => {
    assert.equal(ligneDeFtm({ ...fiche, montant_travaux_ht: -1500 }, 'A1').montant_ht, -1500)
  })

  test('sans montant encore saisi, la ligne existe à zéro', () => {
    assert.equal(ligneDeFtm({ ...fiche, montant_travaux_ht: null }, 'A1').montant_ht, 0)
  })

  test('l’origine décide de la colonne du tableau financier', () => {
    assert.equal(ligneDeFtm({ ...fiche, origine: 'moe' }, 'A1').categorie, 'adaptation_moe')
    assert.equal(ligneDeFtm({ ...fiche, origine: 'mo' }, 'A1').categorie, 'demande_mo')
  })

  test('sans description, l’intitulé reste lisible', () => {
    assert.equal(ligneDeFtm({ ...fiche, description: '' }, 'A1').intitule, 'FTM-012 — travaux modificatifs')
  })
})
