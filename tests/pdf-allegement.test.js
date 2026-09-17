// Allègement vectoriel d'un plan PDF : fusion des traits, retrait du caché.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { reecrireFlux } from '../src/tools/rasterisation/vectoriel/fusion.js'
import { analyserPage } from '../src/tools/rasterisation/vectoriel/analyse.js'
import { lireInstructions } from '../src/tools/rasterisation/vectoriel/lexique.js'
import { estConvexe, dansConvexe, concat, appliquer } from '../src/tools/rasterisation/vectoriel/geometrie.js'

const octets = (t) => new TextEncoder().encode(t)
const texte = (o) => new TextDecoder('latin1').decode(o)
const operations = (t) => {
  const liste = []
  lireInstructions(octets(t), (op) => liste.push(op))
  return liste
}
const GS = { G1: { CA: 1 }, T: { CA: 0.5 }, M: { BM: 'Multiply', CA: 1 } }
const extGState = (nom) => GS[nom] ?? null

const bloc = (x, couleur = '0.36 0.45 0.25', gs = 'G1') => `q /${gs} gs ${couleur} RG ${x} 0 m ${x} 10 l S Q\n`

describe('fusion des blocs d’un trait isolé', () => {
  test('des blocs identiques qui se suivent deviennent un seul trait', () => {
    const avant = bloc(1) + bloc(2) + bloc(3)
    const { octets: apres, stats } = reecrireFlux(octets(avant), { extGState })
    const ops = operations(texte(apres))
    assert.equal(ops.filter(o => o === 'S').length, 1)
    assert.equal(ops.filter(o => o === 'm').length, 3, 'chaque tracé est conservé')
    assert.equal(stats.blocsFusionnes, 2)
  })

  test('une couleur différente coupe le groupe', () => {
    const avant = bloc(1) + bloc(2, '1 0 0') + bloc(3)
    const ops = operations(texte(reecrireFlux(octets(avant), { extGState }).octets))
    assert.equal(ops.filter(o => o === 'S').length, 3)
  })

  test('un trait semi-transparent n’est jamais fusionné : les croisements fonceraient', () => {
    const avant = bloc(1, '0 0 0', 'T') + bloc(2, '0 0 0', 'T')
    const ops = operations(texte(reecrireFlux(octets(avant), { extGState }).octets))
    assert.equal(ops.filter(o => o === 'S').length, 2)
  })

  test('un mode de fusion autre que normal empêche aussi la fusion', () => {
    const avant = bloc(1, '0 0 0', 'M') + bloc(2, '0 0 0', 'M')
    const ops = operations(texte(reecrireFlux(octets(avant), { extGState }).octets))
    assert.equal(ops.filter(o => o === 'S').length, 2)
  })

  test('un tracé fermé par « s » garde sa fermeture une fois fusionné', () => {
    const avant = 'q /G1 gs 0 0 0 RG 0 0 m 5 0 l 5 5 l s Q\n' + bloc(9, '0 0 0')
    const sortie = texte(reecrireFlux(octets(avant), { extGState }).octets)
    assert.match(sortie, /5 5 l h/)
  })

  test('un bloc contenant autre chose qu’un trait est recopié tel quel', () => {
    const avant = 'q /G1 gs 0 0 0 rg 0 0 5 5 re f Q\n' + bloc(1) + bloc(2)
    const sortie = texte(reecrireFlux(octets(avant), { extGState }).octets)
    assert.ok(sortie.startsWith('q /G1 gs 0 0 0 rg 0 0 5 5 re f Q\n'))
  })

  test('sans fusion demandée, les traits restent séparés (seul le caché part)', () => {
    const avant = bloc(1) + bloc(2) + bloc(3)
    const ops = operations(texte(reecrireFlux(octets(avant), { extGState, fusionner: false }).octets))
    assert.equal(ops.filter(o => o === 'S').length, 3)
  })

  test('tout ce qui n’est pas fusionné est recopié octet pour octet', () => {
    const avant = 'BT /F1 12 Tf (Plan de masse) Tj ET\n1 0 0 1 10 10 cm\n'
    assert.equal(texte(reecrireFlux(octets(avant), { extGState }).octets), avant)
  })
})

describe('fusion dans un symbole', () => {
  test('tracé S tracé S sans changement d’état devient un seul trait', () => {
    const avant = '/G1 gs 0 0 0 RG 1 w 0 0 m 1 1 l S 2 2 m 3 3 l S 4 4 m 5 5 l S'
    const ops = operations(texte(reecrireFlux(octets(avant), { extGState, opaqueAuDepart: true }).octets))
    assert.equal(ops.filter(o => o === 'S').length, 1)
  })

  test('symbole posé quelque part en transparence : pas de fusion', () => {
    const avant = '0 0 0 RG 0 0 m 1 1 l S 2 2 m 3 3 l S'
    const ops = operations(texte(reecrireFlux(octets(avant), { extGState, opaqueAuDepart: false }).octets))
    assert.equal(ops.filter(o => o === 'S').length, 2)
  })
})

describe('retrait de ce qui est caché', () => {
  const ressources = { extGState, forme: () => null }

  test('un trait sous un aplat blanc posé après lui disparaît', () => {
    const page = bloc(10) + 'q 1 1 1 rg 0 -5 m 50 -5 l 50 50 l 0 50 l h f Q\n'
    const { suppressions, stats } = analyserPage(octets(page), ressources)
    assert.equal(stats.traitsCaches, 1)
    const sortie = texte(reecrireFlux(octets(page), { extGState, suppressions }).octets)
    assert.equal(operations(sortie).filter(o => o === 'S').length, 0)
    assert.match(sortie, / f Q/, 'l’aplat reste')
  })

  test('un trait posé APRÈS l’aplat reste visible', () => {
    const page = 'q 1 1 1 rg 0 -5 m 50 -5 l 50 50 l 0 50 l h f Q\n' + bloc(10)
    assert.equal(analyserPage(octets(page), ressources).stats.traitsCaches, 0)
  })

  test('un aplat trop petit pour couvrir l’épaisseur du trait ne le cache pas', () => {
    const page = 'q 0 0 0 RG 20 w 10 0 m 10 10 l S Q\nq 1 1 1 rg 5 -1 m 15 -1 l 15 11 l 5 11 l h f Q\n'
    assert.equal(analyserPage(octets(page), ressources).stats.traitsCaches, 0)
  })

  test('un aplat transparent ne cache rien', () => {
    const page = bloc(10) + 'q /T2 gs 1 1 1 rg 0 -5 m 50 -5 l 50 50 l 0 50 l h f Q\n'
    const res = { extGState: (n) => (n === 'T2' ? { ca: 0.4 } : extGState(n)), forme: () => null }
    assert.equal(analyserPage(octets(page), res).stats.traitsCaches, 0)
  })

  test('un aplat découpé ne cache que dans sa zone de découpe', () => {
    // la découpe s'arrête avant le trait : l'aplat n'y est pas peint
    const page = bloc(40) + 'q 0 0 30 60 re W n 1 1 1 rg 0 -5 m 50 -5 l 50 50 l 0 50 l h f Q\n'
    assert.equal(analyserPage(octets(page), ressources).stats.traitsCaches, 0)
  })

  test('un aplat d’un autre calque ne cache pas : masquer ce calque ferait un trou', () => {
    const page = '/OC /oc1 BDC ' + bloc(10) + 'EMC /OC /oc2 BDC q 1 1 1 rg 0 -5 m 50 -5 l 50 50 l 0 50 l h f Q EMC\n'
    assert.equal(analyserPage(octets(page), ressources).stats.traitsCaches, 0)
    assert.equal(analyserPage(octets(page), ressources, { respecterCalques: false }).stats.traitsCaches, 1)
  })

  test('un aplat non convexe n’est pas utilisé comme masque', () => {
    // forme en L : un trait dans l'encoche serait visible
    const page = bloc(10) + 'q 1 1 1 rg 0 0 m 50 0 l 50 20 l 20 20 l 20 50 l 0 50 l h f Q\n'
    assert.equal(analyserPage(octets(page), ressources).stats.traitsCaches, 0)
  })

  test('un symbole posé sous un aplat est retiré, son contenu n’étant plus visible', () => {
    const forme = { id: 'F', bbox: [0, 0, 5, 5], matrice: [1, 0, 0, 1, 0, 0], octets: octets('0 0 m 5 5 l S'), ressources: null }
    const res = { extGState, forme: (n) => (n === 'Fm1' ? forme : null) }
    const page = 'q 1 0 0 1 10 10 cm /Fm1 Do Q\nq 1 1 1 rg 0 0 m 50 0 l 50 50 l 0 50 l h f Q\n'
    const { stats, suppressions } = analyserPage(octets(page), res)
    assert.equal(stats.posesCachees, 1)
    const sortie = texte(reecrireFlux(octets(page), { extGState, suppressions }).octets)
    assert.ok(!sortie.includes('Do'))
  })
})

describe('géométrie', () => {
  test('convexité', () => {
    assert.equal(estConvexe([[0, 0], [10, 0], [10, 10], [0, 10]]), true)
    assert.equal(estConvexe([[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]), false)
  })

  test('point dans un polygone convexe, bord compris', () => {
    const carre = [[0, 0], [10, 0], [10, 10], [0, 10]]
    assert.equal(dansConvexe([5, 5], carre), true)
    assert.equal(dansConvexe([10, 5], carre), true)
    assert.equal(dansConvexe([11, 5], carre), false)
  })

  test('une transformation « cm » s’applique après la matrice courante', () => {
    const ctm = concat([1, 0, 0, -1, 0, 100], [2, 0, 0, 2, 5, 5])
    assert.deepEqual(appliquer(ctm, 1, 1), [7, 93])
  })
})
