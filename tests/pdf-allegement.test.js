// Allègement vectoriel d'un plan PDF : fusion des traits, retrait du caché.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { reecrireFlux } from '../src/tools/rasterisation/vectoriel/fusion.js'
import { analyserPage } from '../src/tools/rasterisation/vectoriel/analyse.js'
import { lireInstructions } from '../src/tools/rasterisation/vectoriel/lexique.js'
import { concat, appliquer } from '../src/tools/rasterisation/vectoriel/geometrie.js'
import {
  zoneDe, ligneDeZone, fusionnerIntervalles, intersecterIntervalles, soustraireIntervalles, Occultation,
} from '../src/tools/rasterisation/vectoriel/trame.js'

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

  test('un aplat non convexe cache ce qui est sous lui, pas ce qui est dans son encoche', () => {
    const L = 'q 1 1 1 rg 0 0 m 50 0 l 50 20 l 20 20 l 20 50 l 0 50 l h f Q\n'
    const sousLeBras = 'q 0 0 0 RG 30 5 m 40 5 l S Q\n'
    const dansLEncoche = 'q 0 0 0 RG 30 30 m 40 30 l S Q\n'
    assert.equal(analyserPage(octets(sousLeBras + L), ressources).stats.traitsCaches, 1)
    assert.equal(analyserPage(octets(dansLEncoche + L), ressources).stats.traitsCaches, 0)
  })

  test('un aplat troué (pair-impair) ne cache pas ce qui est dans le trou', () => {
    const troue = 'q 1 1 1 rg 0 0 m 100 0 l 100 100 l 0 100 l h 40 40 m 60 40 l 60 60 l 40 60 l h f* Q\n'
    assert.equal(analyserPage(octets('q 0 0 0 RG 45 50 m 55 50 l S Q\n' + troue), ressources).stats.traitsCaches, 0)
    assert.equal(analyserPage(octets('q 0 0 0 RG 10 10 m 20 10 l S Q\n' + troue), ressources).stats.traitsCaches, 1)
  })

  test('deux aplats qui se chevauchent cachent ensemble ce qu’aucun ne cache seul', () => {
    // bord contre bord, la jointure resterait incertaine (et se voit parfois à l'écran)
    const page = 'q 0 0 0 RG 10 10 m 90 10 l S Q\nq 1 1 1 rg 0 0 55 20 re f Q\nq 1 1 1 rg 45 0 55 20 re f Q\n'
    assert.equal(analyserPage(octets(page), ressources).stats.traitsCaches, 1)
  })

  test('un aplat courbe cache ce qui est bien à l’intérieur', () => {
    // disque de rayon 40 centré en (50, 50)
    const k = 22.09
    const cercle = `q 1 1 1 rg 90 50 m 90 ${50 + k} ${50 + k} 90 50 90 c ${50 - k} 90 10 ${50 + k} 10 50 c 10 ${50 - k} ${50 - k} 10 50 10 c ${50 + k} 10 90 ${50 - k} 90 50 c f Q\n`
    assert.equal(analyserPage(octets('q 0 0 0 RG 45 50 m 55 50 l S Q\n' + cercle), ressources).stats.traitsCaches, 1)
    assert.equal(analyserPage(octets('q 0 0 0 RG 85 85 m 88 88 l S Q\n' + cercle), ressources).stats.traitsCaches, 0)
  })

  test('un motif posé hors de sa découpe est retiré, même sans aucun aplat', () => {
    const forme = { id: 'F', bbox: [0, 0, 5, 5], matrice: [1, 0, 0, 1, 0, 0], octets: octets('0 0 m 5 5 l S'), ressources: null }
    const res = { extGState, forme: (n) => (n === 'Fm1' ? forme : null) }
    // découpe en L : la pose en (30, 30) tombe dans l'encoche
    const page = 'q 0 0 m 50 0 l 50 20 l 20 20 l 20 50 l 0 50 l h W n '
      + 'q 1 0 0 1 5 5 cm /Fm1 Do Q q 1 0 0 1 30 30 cm /Fm1 Do Q Q\n'
    const { stats, suppressions } = analyserPage(octets(page), res)
    assert.equal(stats.posesCachees, 1)
    const sortie = texte(reecrireFlux(octets(page), { extGState, suppressions }).octets)
    assert.match(sortie, /5 5 cm \/Fm1 Do/)
    assert.ok(!/30 30 cm \/Fm1 Do/.test(sortie))
  })

  test('les aplats d’un symbole ne cachent pas sa propre pose', () => {
    const forme = { id: 'F', bbox: [0, 0, 10, 10], matrice: [1, 0, 0, 1, 0, 0], octets: octets('0 0 0 RG 1 1 m 9 9 l S 1 1 1 rg 0 0 10 10 re f'), ressources: null }
    const res = { extGState, forme: (n) => (n === 'Fm1' ? forme : null) }
    assert.equal(analyserPage(octets('/Fm1 Do\n'), res).stats.posesCachees, 0)
  })

  test('un trait sous un aplat d’une autre découpe partielle reste', () => {
    // l'aplat couvre tout, mais sa découpe s'arrête à x = 50 : le bout droit du trait se voit
    const page = 'q 0 0 0 RG 40 10 m 60 10 l S Q\nq 0 0 50 100 re W n 1 1 1 rg 0 0 100 100 re f Q\n'
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

describe('géométrie et trame', () => {
  test('une transformation « cm » s’applique après la matrice courante', () => {
    const ctm = concat([1, 0, 0, -1, 0, 100], [2, 0, 0, 2, 5, 5])
    assert.deepEqual(appliquer(ctm, 1, 1), [7, 93])
  })

  test('opérations sur intervalles', () => {
    assert.deepEqual(fusionnerIntervalles([5, 8, 0, 2, 3, 4]), [0, 8])
    assert.deepEqual(intersecterIntervalles([0, 10, 20, 30], [5, 25]), [5, 10, 20, 25])
    assert.deepEqual(soustraireIntervalles([0, 10], [3, 4, 8, 12]), [0, 2, 5, 7])
  })

  test('un carré : sûr à l’intérieur, possible jusqu’au bord, rien au-delà', () => {
    const z = zoneDe([[[2, 2], [8, 2], [8, 8], [2, 8]]], false)
    assert.deepEqual(ligneDeZone(z, 5, 'sur'), [3, 6])
    assert.deepEqual(ligneDeZone(z, 5, 'possible'), [1, 8])
    assert.deepEqual(ligneDeZone(z, 0, 'possible'), [])
  })

  test('un trait fin dans une zone plus étroite qu’un pixel reste possible', () => {
    const z = zoneDe([[[3.2, 0], [3.4, 0], [3.4, 10], [3.2, 10]]], false)
    assert.deepEqual(ligneDeZone(z, 5, 'possible'), [2, 3])
    assert.deepEqual(ligneDeZone(z, 5, 'sur'), [])
  })

  test('occultation par blocs', () => {
    const o = new Occultation()
    o.marquer(100, 60, 200)
    assert.equal(o.libreDans(100, 60, 200), false)
    assert.equal(o.libreDans(100, 59, 200), true)
    assert.equal(o.libreDans(101, 60, 61), true)
  })
})
