// La façon d'écrire de l'agence : guide de rédaction et exemples pour l'IA.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { GUIDE_PAR_DEFAUT, guideEffectif, choisirExemples } from '../src/modules/chantier/comptes-rendus/enregistrement/styleAgenceLogique.js'

describe('guide de rédaction', () => {
  test('le guide de l’agence s’il existe, sinon celui de départ', () => {
    assert.equal(guideEffectif('Écrire court.'), 'Écrire court.')
    assert.equal(guideEffectif('   '), GUIDE_PAR_DEFAUT)
    assert.equal(guideEffectif(null), GUIDE_PAR_DEFAUT)
  })

  test('le guide de départ reste court et parle des statuts de l’app', () => {
    assert.ok(GUIDE_PAR_DEFAUT.length < 5000)
    for (const code of ['urgent', 'pour_memoire', 'a_prevoir', 'en_cours', 'en_attente', 'fait']) {
      assert.ok(GUIDE_PAR_DEFAUT.includes(code), code)
    }
  })
})

describe('exemples tirés des CR émis', () => {
  const r = (id, champs) => ({ id, cr_id: 'cr-x', lot_id: 'l', description: `Remarque ${id} assez longue`, ...champs })
  const lots = [{ nom: 'Gros œuvre' }, { nom: 'Plâtrerie' }]

  test('même affaire d’abord, puis les mêmes lots ailleurs, puis le reste', () => {
    const exemples = choisirExemples({
      affaireId: 'a1', lots,
      remarques: [
        r(1, { cr_affaire_id: 'a2', lot_nom: 'Electricité' }),
        r(2, { cr_affaire_id: 'a2', lot_nom: 'Gros oeuvre' }),
        r(3, { cr_affaire_id: 'a1', lot_nom: 'Plâtrerie' }),
      ],
    })
    assert.deepEqual(exemples, [
      'Plâtrerie : Remarque 3 assez longue',
      'Gros oeuvre : Remarque 2 assez longue',
      'Electricité : Remarque 1 assez longue',
    ])
  })

  test('ni proposition à valider, ni intervenant extérieur, ni le CR en cours, ni sans destinataire', () => {
    const exemples = choisirExemples({
      affaireId: 'a1', crId: 'cr-courant', auteursExterieurs: ['bet'],
      remarques: [
        r(1, { cr_affaire_id: 'a1', a_valider: true }),
        r(2, { cr_affaire_id: 'a1', created_by: 'bet' }),
        r(3, { cr_affaire_id: 'a1', cr_id: 'cr-courant' }),
        r(4, { cr_affaire_id: 'a1', lot_id: null }),
        r(5, { cr_affaire_id: 'a1', lot_id: null, interlocuteur_id: 'i1', copie_destinataire: 'Maître d’ouvrage' }),
      ],
    })
    assert.deepEqual(exemples, ['Maître d’ouvrage : Remarque 5 assez longue'])
  })

  test('une remarque recopiée de visite en visite ne compte qu’une fois', () => {
    const exemples = choisirExemples({
      affaireId: 'a1',
      remarques: [
        r(1, { cr_affaire_id: 'a1', suivi_id: 's1', description: 'Reprendre le joint du séjour' }),
        r(2, { cr_affaire_id: 'a1', suivi_id: 's1', description: 'Reprendre le joint du séjour.' }),
        r(3, { cr_affaire_id: 'a2', description: 'Reprendre  le joint du séjour' }),
      ],
    })
    assert.equal(exemples.length, 1)
  })

  test('trop courtes ou trop longues : écartées ; plafond respecté', () => {
    const remarques = [r(1, { description: 'Ok' }), r(2, { description: 'x'.repeat(500) })]
    for (let i = 0; i < 60; i++) remarques.push(r(10 + i, { cr_affaire_id: 'a2' }))
    const exemples = choisirExemples({ affaireId: 'a1', remarques })
    assert.equal(exemples.length, 40)
    assert.ok(!exemples.some((e) => e.includes('xxxxx')))
  })

  test('la même affaire ne prend pas toute la place', () => {
    const remarques = []
    for (let i = 0; i < 30; i++) remarques.push(r(i, { cr_affaire_id: 'a1' }))
    for (let i = 0; i < 30; i++) remarques.push(r(100 + i, { cr_affaire_id: 'a2' }))
    const exemples = choisirExemples({ affaireId: 'a1', remarques })
    assert.equal(exemples.filter((e) => /Remarque [0-9] |Remarque [12][0-9] /.test(e)).length, 15)
  })
})
