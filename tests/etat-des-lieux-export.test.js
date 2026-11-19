// État des lieux, lot 4 (export) : catalogue des symboles usuels.
// Contours inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { CALQUES } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'
import {
  DISTANCE_MUR, ECART_SYMBOLES, RAYON_SANS_SYMBOLE, SYMBOLES, TYPES_MURAUX, boiteSymbole, boitePrimitives, decalagesSymboles,
  libelleTailleSymbole, orientationElement, orientationPiece, primitivesPlacees, quantiteElement, symboleSvg, typesSansSymbole,
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
      reglette: [0.90, 0.15], goulotte: [0.90, 0.06], 'baie-brassage': [0.60, 0.60],
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

describe('symboles usuels : types de la légende de l’agence', () => {
  const calqueDe = (code) => CALQUES.find((c) => c.types.some((t) => t.code === code))
  const libelle = (code) => calqueDe(code).types.find((t) => t.code === code).libelle

  test('types ajoutés à l’électricité, avec les libellés de la légende', () => {
    const attendus = {
      rj45: 'Prise informatique RJ45', applique: 'Point lumineux en applique', dalle: 'Luminaire plafond carré (dalle)',
      reglette: 'Luminaire linéaire (réglette)', goulotte: 'Goulotte électrique', 'baie-brassage': 'Baie de brassage',
      luminaire: 'Luminaire',
    }
    for (const [code, texte] of Object.entries(attendus)) {
      assert.equal(calqueDe(code).code, 'electricite', code)
      assert.equal(libelle(code), texte)
    }
    assert.equal(calqueDe('detecteur-fumee').code, 'securite')
  })

  test('codes de type uniques, tous calques confondus', () => {
    assert.equal(new Set(codesTypes).size, codesTypes.length)
  })

  test('détecteur : rond à point central, plus aucun texte', () => {
    const p = SYMBOLES['detecteur-fumee'].primitives
    assert.ok(p.every((q) => !('texte' in q)))
    assert.ok(p.every((q) => q.cercle && q.cercle[0] === 0 && q.cercle[1] === 0))
    assert.ok(p.filter((q) => q.cercle[2] <= 0.05).length >= 2, 'point central rempli')
  })

  test('dessins de la légende', () => {
    assert.ok(SYMBOLES.rj45.primitives.some((q) => q.texte === 'RJ'))
    assert.ok(SYMBOLES.rj45.primitives.some((q) => q.polyligne && q.ferme))
    const dalle = boiteSymbole('dalle')
    proche(dalle.largeur, dalle.hauteur)
    assert.equal(SYMBOLES.dalle.primitives.filter((q) => q.ligne).length, 2)
    assert.equal(SYMBOLES.reglette.primitives.filter((q) => q.ligne).length, 2)
    const goulotte = SYMBOLES.goulotte.primitives
    assert.equal(goulotte.length, 2)
    for (const q of goulotte) proche(Math.abs(q.ligne[1][0] - q.ligne[0][0]), 0.9)
    assert.ok(SYMBOLES['baie-brassage'].primitives.filter((q) => q.ligne).length >= 3, 'baie hachurée')
  })
})

describe('symboles usuels : contre le mur (dos en −y local)', () => {
  test('TYPES_MURAUX : seulement des codes de calquesEdl', () => {
    for (const code of TYPES_MURAUX) assert.ok(codesTypes.includes(code), code)
    for (const code of ['prise', 'rj45', 'applique', 'goulotte', 'baie-brassage', 'lavabo', 'wc', 'radiateur', 'extincteur']) {
      assert.ok(TYPES_MURAUX.has(code), code)
    }
    for (const code of ['luminaire', 'dalle', 'reglette', 'detecteur-fumee', 'fenetre', 'fissure']) assert.ok(!TYPES_MURAUX.has(code), code)
  })

  test('chaque symbole mural dissymétrique a son dos côté −y', () => {
    // Prise : trait jusqu'au mur en −y, demi-cercle vers la pièce
    const prise = SYMBOLES.prise.primitives
    assert.ok(prise.some((q) => q.ligne && Math.min(q.ligne[0][1], q.ligne[1][1]) < -0.05 && q.ligne[0][0] === 0 && q.ligne[1][0] === 0))
    const arcPrise = prise.find((q) => q.arc).arc
    assert.deepEqual([arcPrise[3], arcPrise[4]], [0, 180])
    // Applique : petit trait vers le mur
    assert.ok(SYMBOLES.applique.primitives.some((q) => q.ligne && q.ligne[0][0] === 0 && q.ligne[1][0] === 0 && q.ligne[1][1] < -0.09))
    // Lavabo et évier : robinet côté mur
    assert.ok(SYMBOLES.lavabo.primitives.some((q) => q.ligne && q.ligne.every(([, y]) => y < 0)))
    assert.ok(SYMBOLES.evier.primitives.some((q) => q.cercle && q.cercle[0] === 0 && q.cercle[1] < 0))
    // WC : réservoir (rectangle) contre le mur
    const reservoir = boitePrimitives([SYMBOLES.wc.primitives.find((q) => q.polyligne && q.polyligne.length === 4)])
    assert.ok(reservoir.ymax < 0)
    // Extincteur : la base du triangle côté mur, la pointe vers la pièce
    const tri = SYMBOLES.extincteur.primitives.find((q) => q.polyligne).polyligne
    assert.ok(tri.filter(([, y]) => y < 0).length === 2)
  })

  // Pièce de 4 × 3, sommets dans le sens trigonométrique (ou inverse)
  const salle = (sens = 1) => {
    const c = [[0, 0], [4, 0], [4, 3], [0, 3]]
    return { id: 'p', contour: sens > 0 ? c : [...c].reverse() }
  }
  const versInterieur = (angle) => {
    const a = (angle * Math.PI) / 180
    return [-Math.sin(a), Math.cos(a)]
  }

  test('type mural près d’un mur : dos au mur, +y vers l’intérieur, quel que soit le sens du contour', () => {
    for (const sens of [1, -1]) {
      const p = salle(sens)
      const cas = [
        [[2, 0.3], [0, 1]], // mur du bas : +y vers le haut
        [[2, 2.6], [0, -1]], // mur du haut
        [[0.2, 1.5], [1, 0]], // mur de gauche
        [[3.5, 1.5], [-1, 0]], // mur de droite
      ]
      for (const [[x, y], [nx, ny]] of cas) {
        const angle = orientationElement({ type: 'prise', x, y }, p)
        const [vx, vy] = versInterieur(angle)
        proche(vx, nx, 1e-9)
        proche(vy, ny, 1e-9)
        assert.ok(angle > -180 && angle <= 180, `${angle}`)
      }
    }
  })

  test('le mur le plus proche l’emporte ; au-delà de 0,8 m, la pièce', () => {
    const p = salle()
    // À 0,3 m du mur de droite, 0,7 m du bas
    proche(orientationElement({ type: 'radiateur', x: 3.7, y: 0.7 }, p), 90)
    assert.equal(DISTANCE_MUR, 0.8)
    assert.equal(orientationElement({ type: 'prise', x: 2, y: 1.5 }, p), orientationPiece(p.contour))
    assert.equal(orientationElement({ type: 'prise', x: 2, y: 0.85 }, p), orientationPiece(p.contour))
  })

  test('pièce tournée de 30° : le symbole suit son mur', () => {
    const a = (30 * Math.PI) / 180
    const tourne = ([u, v]) => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)]
    const p = { id: 'p', contour: salle().contour.map(tourne) }
    const [x, y] = tourne([2, 0.2])
    proche(orientationElement({ type: 'lavabo', x, y }, p), 30, 1e-6)
    const [x2, y2] = tourne([2, 2.8])
    proche(orientationElement({ type: 'lavabo', x: x2, y: y2 }, p), -150, 1e-6)
  })

  test('type non mural : la pièce ; sans pièce : 0', () => {
    const p = { id: 'p', contour: rectangleTourne(20) }
    proche(orientationElement({ type: 'luminaire', x: 3, y: 6.1 }, p), 20, 1e-6)
    proche(orientationElement({ type: null, x: 3, y: 6.1 }, p), 20, 1e-6)
    assert.equal(orientationElement({ type: 'prise', x: 1, y: 1 }, null), 0)
    assert.equal(orientationElement({ type: 'prise', x: 1, y: 1 }), 0)
    assert.equal(orientationElement({ type: 'prise', x: 1, y: 1 }, { contour: null }), 0)
    // Point sans position : la pièce
    proche(orientationElement({ type: 'prise' }, p), 20, 1e-6)
  })

  test('un texte de symbole reste lisible, même tourné de 180°', () => {
    const rj = primitivesPlacees('rj45', { x: 1, y: 1, angle: 180 }).find((q) => 'texte' in q)
    assert.equal(rj.rotation, 0)
    assert.deepEqual(rj.pos, [1, 1])
    assert.equal(primitivesPlacees('rj45', { angle: -90 }).find((q) => 'texte' in q).rotation, 90)
    assert.equal(primitivesPlacees('rj45', { angle: 135 }).find((q) => 'texte' in q).rotation, -45)
  })

  test('décalages : boîte tournée du symbole mural', () => {
    // Radiateur tourné de 90° dans le repère : 0,10 de large
    const { emplacements } = decalagesSymboles(['radiateur', 'prise'], { angle: (t) => (t === 'radiateur' ? 90 : 0) })
    proche(emplacements[0].boite.xmax - emplacements[0].boite.xmin, 0.10)
    proche(emplacements[1].dx + boiteSymbole('prise').xmin - emplacements[0].boite.xmax, ECART_SYMBOLES)
  })
})

describe('symboles usuels : quantité des prises', () => {
  const q = (libelle, type = 'prise') => quantiteElement({ type, libelle })
  test('multiplicateurs écrits', () => {
    assert.equal(q('Prise ×3'), 3)
    assert.equal(q('prise x3'), 3)
    assert.equal(q('Prise X 3 sous la fenêtre'), 3)
    assert.equal(q('3 prises'), 3)
    assert.equal(q('4 PRISES au-dessus du plan de travail'), 4)
  })
  test('en lettres, double, triple, quadruple', () => {
    assert.equal(q('trois prises'), 3)
    assert.equal(q('Deux prises'), 2)
    assert.equal(q('six prises'), 6)
    assert.equal(q('Prise double'), 2)
    assert.equal(q('prise triple'), 3)
    assert.equal(q('Prise QUADRUPLE'), 4)
    assert.equal(q('Bloc de prises triplé'), 3, 'accent ignoré')
  })
  test('RJ45 : le « 45 » ne compte pas', () => {
    assert.equal(q('Prise RJ45', 'rj45'), 1)
    assert.equal(q('RJ45 ×2', 'rj45'), 2)
    assert.equal(q('2 RJ45', 'rj45'), 2)
    assert.equal(q('deux RJ 45', 'rj45'), 2)
    assert.equal(q('RJ45 double', 'rj45'), 2)
  })
  test('sinon 1 ; autres types toujours 1', () => {
    assert.equal(q('Prise de courant'), 1)
    assert.equal(q(''), 1)
    assert.equal(quantiteElement({ type: 'prise' }), 1)
    assert.equal(q('Prise x0'), 1)
    assert.equal(q('Prise 16 A'), 1)
    assert.equal(q('Interrupteur double', 'interrupteur'), 1)
    assert.equal(q('3 radiateurs', 'radiateur'), 1)
    assert.equal(quantiteElement(null), 1)
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

  test('texte décalé tourné de 90° : sa position tourne autour du point, sa rotation suit', () => {
    // « EX » de l'extincteur, posé en (0 ; -0,025) dans le catalogue
    const texte = primitivesPlacees('extincteur', { x: 1, y: 2, angle: 90 }).find((p) => 'texte' in p)
    assert.equal(texte.texte, 'EX')
    proche(texte.pos[0], 1.025)
    proche(texte.pos[1], 2)
    assert.equal(texte.rotation, 90)
  })

  test('cercle décentré tourné : seul son centre bouge', () => {
    // Bonde de la baignoire en (0,64 ; 0), rayon 0,03
    const bonde = primitivesPlacees('baignoire', { x: 5, y: 5, angle: 90 }).find((p) => p.cercle)
    proche(bonde.cercle[0], 5)
    proche(bonde.cercle[1], 5.64)
    assert.equal(bonde.cercle[2], 0.03)
  })

  test('polyligne tournée : chaque sommet tourne, la fermeture reste', () => {
    const origine = SYMBOLES.douche.primitives.find((p) => p.polyligne)
    const i = SYMBOLES.douche.primitives.indexOf(origine)
    const placee = primitivesPlacees('douche', { x: 1, y: 1, angle: 30 })[i]
    const a = (30 * Math.PI) / 180
    assert.equal(placee.ferme, origine.ferme)
    origine.polyligne.forEach(([u, v], k) => {
      proche(placee.polyligne[k][0], 1 + u * Math.cos(a) - v * Math.sin(a))
      proche(placee.polyligne[k][1], 1 + u * Math.sin(a) + v * Math.cos(a))
    })
  })

  test('bornes d’un arc posé ramenées dans [0, 360[', () => {
    // Prise : arc de 180° à 360°
    for (const angle of [0, -30, 300, 45]) {
      const [, , , debut, fin] = primitivesPlacees('prise', { angle }).find((p) => p.arc).arc
      for (const b of [debut, fin]) assert.ok(b >= 0 && b < 360, `${angle} : ${b}`)
      // Toujours un demi-cercle, dans le sens trigonométrique
      proche((((fin - debut) % 360) + 360) % 360, 180)
    }
    const [, , , d, f] = primitivesPlacees('prise', { angle: -30 }).find((p) => p.arc).arc
    assert.deepEqual([d, f], [330, 150])
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

  test('texte tourné de 30° : rotation SVG inversée (y retourné)', () => {
    // Le catalogue n'a pas (encore) de texte tourné : un symbole d'essai, retiré après
    SYMBOLES['essai-texte-tourne'] = { taille: 'fixe', primitives: [{ texte: 'A', pos: [0.1, 0.2], hauteur: 0.05, rotation: 30 }] }
    try {
      const [texte] = symboleSvg('essai-texte-tourne').elements
      assert.deepEqual([texte.type, texte.x, texte.y, texte.rotation], ['text', 0.1, -0.2, -30])
    } finally {
      delete SYMBOLES['essai-texte-tourne']
    }
  })

  test('type inconnu : null', () => {
    assert.equal(symboleSvg('inconnu'), null)
  })
})

describe('symboles usuels : plusieurs sur un même point', () => {
  test('côte à côte, ECART_SYMBOLES entre deux boîtes ; un type compté une fois', () => {
    const { emplacements, boite } = decalagesSymboles(['fenetre', 'volet', 'fenetre'])
    assert.deepEqual(emplacements.map((e) => e.type), ['fenetre', 'volet'])
    assert.equal(emplacements[0].dx, 0)
    const f = boiteSymbole('fenetre')
    const v = boiteSymbole('volet')
    proche(emplacements[1].dx + v.xmin - f.xmax, ECART_SYMBOLES)
    proche(boite.xmax, emplacements[1].dx + v.xmax)
  })

  test('sans type : un rond ; agrandissement pris en compte (rapport)', () => {
    const { emplacements } = decalagesSymboles([null, 'prise'], { echelle: (t) => (t ? 2 : 1) })
    const p = boiteSymbole('prise')
    proche(emplacements[1].dx, RAYON_SANS_SYMBOLE + ECART_SYMBOLES - 2 * p.xmin)
    assert.deepEqual(decalagesSymboles([]).emplacements, [])
  })
})
