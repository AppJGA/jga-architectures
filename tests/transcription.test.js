// Visite enregistrée, lot 1 : segments transcrits, texte, état, vocabulaire.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  fusionnerSegment, texteTranscription, resumeEnregistrement, vocabulaireAffaire,
} from '../src/modules/chantier/comptes-rendus/enregistrement/transcriptionLogique.js'

describe('segments', () => {
  test('rangés par morceau ; un morceau retranscrit remplace l’ancien', () => {
    let s = fusionnerSegment([], { rang: 2, duree_s: 180, texte: 'deux' })
    s = fusionnerSegment(s, { rang: 1, duree_s: 180, texte: 'un' })
    s = fusionnerSegment(s, { rang: 2, duree_s: 180, texte: 'deux, corrigé' })
    assert.deepEqual(s.map((x) => [x.rang, x.texte]), [[1, 'un'], [2, 'deux, corrigé']])
  })

  test('le texte à relire, dans l’ordre, sans les morceaux muets', () => {
    const s = [{ rang: 3, texte: ' fin ' }, { rang: 1, texte: 'début' }, { rang: 2, texte: '' }]
    assert.equal(texteTranscription(s), 'début\n\nfin')
    assert.equal(texteTranscription(null), '')
  })

  test('état : prêt quand tout est transcrit', () => {
    const s = [{ rang: 1, duree_s: 180 }, { rang: 2, duree_s: 95.6 }]
    assert.deepEqual(resumeEnregistrement(s, 0), { transcrits: 2, enAttente: 0, duree_s: 276, pret: true })
    assert.equal(resumeEnregistrement(s, 1).pret, false)
    assert.equal(resumeEnregistrement([], 0).pret, false)
  })
})

describe('vocabulaire de l’affaire', () => {
  test('entreprises, lots, personnes, zones ; sans doublon ni terme trop court', () => {
    const v = vocabulaireAffaire({
      lots: [{ nom: 'Gros-Œuvre', raison_sociale: 'RENAUD SAS' }, { nom: 'Charpente', raison_sociale: 'renaud sas' }, { nom: 'VRD' }],
      interlocuteurs: [{ prenom: 'Damien', nom: 'Vinot', organisation: 'Apave' }, { organisation: 'ICT' }, { nom: 'Li' }],
      zones: [{ nom: 'Bâtiment A' }, { nom: '' }],
    })
    assert.deepEqual(new Set(v), new Set(['Gros-Œuvre', 'RENAUD SAS', 'Charpente', 'VRD', 'Damien Vinot', 'Apave', 'ICT', 'Bâtiment A']))
    assert.ok(!v.includes('Li'))
  })

  test('100 termes au plus, les plus longs d’abord', () => {
    const lots = Array.from({ length: 150 }, (_, i) => ({ nom: `Lot numéro ${i}` }))
    const v = vocabulaireAffaire({ lots })
    assert.equal(v.length, 100)
    assert.ok(v[0].length >= v.at(-1).length)
  })
})
