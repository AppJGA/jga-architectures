// État des lieux, lot 4 (export) : catalogue des symboles usuels.
// Contours inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { CALQUES } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'
import {
  SYMBOLES, boiteSymbole, boitePrimitives, libelleTailleSymbole, orientationPiece, primitivesPlacees,
  symboleSvg, typesSansSymbole,
} from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'

const proche = (a, b, ecart = 1e-9) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
const codesTypes = CALQUES.flatMap((c) => c.types.map((t) => t.code))

// Rectangle 4 × 2 centré en (cx, cy), tourné de `deg`
function rectangleTourne(deg, cx = 3, cy = 7) {
  const a = (deg * Math.PI) / 180
  return [[-2, -1], [2, -1], [2, 1], [-2, 1]].map(([u, v]) => [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)])
}

describe('symboles usuels : catalogue', () => {
  test('chaque type de calquesEdl a un symbole, et aucun symbole sans type', () => {
    assert.deepEqual(typesSansSymbole(), [])
    for (const code of codesTypes) assert.ok(SYMBOLES[code], `pas de symbole pour ${code}`)
    for (const code of Object.keys(SYMBOLES)) assert.ok(codesTypes.includes(code), `symbole sans type : ${code}`)
  })

  test('seules les primitives que le DXF R12 sait écrire, aux valeurs finies', () => {
    const fini = (v) => typeof v === 'number' && Number.isFinite(v)
    for (const [code, s] of Object.entries(SYMBOLES)) {
      assert.ok(['reelle', 'fixe'].includes(s.taille), code)
      assert.ok(s.primitives.length > 0 && s.primitives.length <= 20, `${code} : ${s.primitives.length} primitives`)
      for (const p of s.primitives) {
        const sortes = ['ligne', 'polyligne', 'cercle', 'arc', 'texte'].filter((k) => k in p)
        assert.equal(sortes.length, 1, `${code} : ${JSON.stringify(p)}`)
        if (p.ligne) assert.ok(p.ligne.length === 2 && p.ligne.flat().every(fini), code)
        if (p.polyligne) {
          assert.ok(p.polyligne.length >= 2 && p.polyligne.flat().every(fini), code)
          assert.equal(typeof p.ferme, 'boolean', code)
        }
        if (p.cercle) assert.ok(p.cercle.length === 3 && p.cercle.every(fini) && p.cercle[2] > 0, code)
        if (p.arc) assert.ok(p.arc.length === 5 && p.arc.every(fini) && p.arc[2] > 0, code)
        if ('texte' in p) {
          // Texte ASCII : passe tel quel en Windows-1252 et dans la police STANDARD
          assert.match(p.texte, /^[\x20-\x7e]+$/, code)
          assert.ok(p.pos.every(fini) && p.hauteur > 0, code)
        }
      }
    }
  })

  test('appareils à leur taille réelle (± 20 %)', () => {
    const attendu = {
      lavabo: [0.60, 0.45], evier: [1.20, 0.60], baignoire: [1.70, 0.70], douche: [0.90, 0.90],
      wc: [0.40, 0.65], 'ballon-eau-chaude': [0.55, 0.55], radiateur: [0.80, 0.10], chaudiere: [0.45, 0.35],
    }
    for (const [code, [l, h]] of Object.entries(attendu)) {
      assert.equal(SYMBOLES[code].taille, 'reelle', code)
      const b = boiteSymbole(code)
      assert.ok(Math.abs(b.largeur - l) <= 0.2 * l, `${code} : largeur ${b.largeur}`)
      assert.ok(Math.abs(b.hauteur - h) <= 0.2 * h, `${code} : hauteur ${b.hauteur}`)
    }
    const reels = Object.entries(SYMBOLES).filter(([, s]) => s.taille === 'reelle').map(([c]) => c).sort()
    assert.deepEqual(reels, Object.keys(attendu).sort())
  })

  test('symboles fixes lisibles et contenus : au plus 0,35 m, au moins 0,15 m', () => {
    for (const [code, s] of Object.entries(SYMBOLES)) {
      if (s.taille !== 'fixe') continue
      const b = boiteSymbole(code)
      assert.ok(Math.max(b.largeur, b.hauteur) <= 0.35 + 1e-9, `${code} : ${b.largeur} × ${b.hauteur}`)
      assert.ok(Math.max(b.largeur, b.hauteur) >= 0.15, `${code} trop petit`)
    }
  })

  test('symboles autour du point d’insertion', () => {
    for (const code of Object.keys(SYMBOLES)) {
      const b = boiteSymbole(code)
      assert.ok(b.xmin <= 0 && b.xmax >= 0 && b.ymin <= 0 && b.ymax >= 0, code)
    }
  })

  test('boîte d’un arc : seuls les quadrants parcourus comptent', () => {
    const b = boitePrimitives([{ arc: [0, 0, 1, 0, 90] }])
    proche(b.xmin, 0); proche(b.ymin, 0); proche(b.xmax, 1); proche(b.ymax, 1)
    const c = boitePrimitives([{ arc: [0, 0, 1, 180, 360] }])
    proche(c.ymin, -1); proche(c.ymax, 0); proche(c.xmin, -1); proche(c.xmax, 1)
    const d = boitePrimitives([{ arc: [0, 0, 1, 150, 30] }])
    proche(d.ymin, -1); proche(d.ymax, 0.5); proche(d.xmin, -1); proche(d.xmax, 1)
  })

  test('libellé de taille en français', () => {
    assert.equal(libelleTailleSymbole('lavabo'), '0,60 × 0,45 m · taille réelle')
    assert.match(libelleTailleSymbole('luminaire'), /^0,20 × 0,20 m · taille fixe$/)
    assert.equal(libelleTailleSymbole('inconnu'), '')
  })
})

describe('symboles usuels : orientation de la pièce', () => {
  test('angle du plus long côté, ramené dans ]-45°, 45°]', () => {
    proche(orientationPiece(rectangleTourne(0)), 0, 1e-6)
    proche(orientationPiece(rectangleTourne(10)), 10, 1e-6)
    proche(orientationPiece(rectangleTourne(100)), 10, 1e-6)
    proche(orientationPiece(rectangleTourne(-50)), 40, 1e-6)
    proche(orientationPiece(rectangleTourne(45)), 45, 1e-6)
    proche(orientationPiece(rectangleTourne(-45)), 45, 1e-6)
    proche(orientationPiece(rectangleTourne(190)), 10, 1e-6)
  })
  test('le sens de parcours du contour ne change rien', () => {
    proche(orientationPiece(rectangleTourne(20).reverse()), 20, 1e-6)
  })
  test('contour vide ou dégénéré : 0', () => {
    assert.equal(orientationPiece([]), 0)
    assert.equal(orientationPiece(null), 0)
    assert.equal(orientationPiece([[1, 1]]), 0)
  })
})

describe('symboles usuels : placement', () => {
  test('translation seule', () => {
    const [cercle] = primitivesPlacees('luminaire', { x: 10, y: 5 })
    assert.deepEqual(cercle.cercle, [10, 5, 0.10])
  })

  test('rotation de 90° puis translation', () => {
    const placees = primitivesPlacees('porte', { x: 10, y: 5, angle: 90 })
    const origine = SYMBOLES.porte.primitives
    // (u, v) tourné de 90° → (-v, u), puis posé en (10, 5)
    origine.forEach((p, i) => {
      if (!p.ligne) return
      p.ligne.forEach(([u, v], k) => {
        proche(placees[i].ligne[k][0], 10 - v)
        proche(placees[i].ligne[k][1], 5 + u)
      })
    })
    const arcOrigine = origine.find((p) => p.arc).arc
    const arcPlace = placees.find((p) => p.arc).arc
    proche(arcPlace[0], 10 - arcOrigine[1]); proche(arcPlace[1], 5 + arcOrigine[0])
    assert.equal(arcPlace[2], arcOrigine[2])
    assert.equal(arcPlace[3], arcOrigine[3] + 90)
    assert.equal(arcPlace[4], arcOrigine[4] + 90)
  })

  test('un texte tourne avec le symbole', () => {
    const texte = primitivesPlacees('thermostat', { x: 2, y: 3, angle: 30 }).find((p) => 'texte' in p)
    assert.equal(texte.texte, 'T')
    assert.deepEqual(texte.pos, [2, 3])
    assert.equal(texte.rotation, 30)
  })

  test('la boîte suit la rotation : un radiateur tourné de 90° est vertical', () => {
    const b = boitePrimitives(primitivesPlacees('radiateur', { angle: 90 }))
    proche(b.largeur, 0.10, 1e-9)
    proche(b.hauteur, 0.80, 1e-9)
  })

  test('type inconnu : rien', () => {
    assert.deepEqual(primitivesPlacees('inconnu', { x: 1, y: 1 }), [])
  })

  test('le catalogue n’est pas modifié par un placement', () => {
    const avant = JSON.stringify(SYMBOLES.lavabo)
    primitivesPlacees('lavabo', { x: 3, y: 4, angle: 33 })
    assert.equal(JSON.stringify(SYMBOLES.lavabo), avant)
  })
})

describe('symboles usuels : SVG', () => {
  test('un élément par primitive, y retourné', () => {
    for (const code of codesTypes) {
      const svg = symboleSvg(code)
      assert.equal(svg.elements.length, SYMBOLES[code].primitives.length, code)
      assert.equal(svg.viewBox.split(' ').length, 4, code)
    }
    const porte = symboleSvg('porte')
    const vantail = porte.elements[2]
    assert.equal(vantail.type, 'line')
    assert.equal(vantail.y2, -0.30)
  })

  test('la boîte de vue englobe le symbole retourné', () => {
    for (const code of codesTypes) {
      const [x, y, l, h] = symboleSvg(code).viewBox.split(' ').map(Number)
      const b = boiteSymbole(code)
      assert.ok(x <= b.xmin && x + l >= b.xmax, code)
      assert.ok(y <= -b.ymax && y + h >= -b.ymin, code)
    }
  })

  test('arc : sens trigonométrique du plan → balayage négatif du SVG', () => {
    const arc = symboleSvg('porte').elements.find((e) => e.type === 'path')
    // De (0,15 ; 0) à (-0,15 ; 0,30) sur l'écran : (0.15,0) → (-0.15,-0.3)
    assert.equal(arc.d, 'M 0.15,0 A 0.3 0.3 0 0 0 -0.15,-0.3')
  })

  test('texte centré au point, y retourné', () => {
    const texte = symboleSvg('extincteur').elements.find((e) => e.type === 'text')
    assert.deepEqual([texte.x, texte.y, texte.texte, texte.rotation], [0, 0.025, 'EX', 0])
  })

  test('type inconnu : null', () => {
    assert.equal(symboleSvg('inconnu'), null)
  })
})
