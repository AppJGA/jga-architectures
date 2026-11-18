// État des lieux : simplification des plans par calque (masses des murs,
// motifs retirés) et format du fichier vectoriel. Plans inventés : aucun plan
// réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  TRAITEMENTS, LIBELLES_TRAITEMENT, LONGUEUR_MOTIF, longueurTrait, analyserCalques,
  decisionsParDefaut, simplifierNiveau, encoderVecteurs, decoderVecteurs,
} from '../src/modules/etude/etat-des-lieux/simplificationPlan.js'
import { aire, boite, pointDansPolygone } from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'

const trait = (calque, pts, ferme = false) => ({ calque, ferme, pts })

// Bande de mur horizontale remplie de traits en travers (comme un mur noir
// exporté en milliers de traits), plus ses deux contours longs.
function murHorizontal(calque, x0, y0, longueur, epaisseur, espacement = 0.01) {
  const hachures = []
  const n = Math.round(longueur / espacement)
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * espacement
    hachures.push(trait(calque, [[x, y0], [x, y0 + epaisseur]]))
  }
  const contours = [
    trait(calque, [[x0, y0], [x0 + longueur, y0]]),
    trait(calque, [[x0, y0 + epaisseur], [x0 + longueur, y0 + epaisseur]]),
  ]
  return { hachures, contours }
}

function murVertical(calque, x0, y0, hauteur, epaisseur, espacement = 0.01) {
  const hachures = []
  const n = Math.round(hauteur / espacement)
  for (let i = 0; i <= n; i++) {
    const y = y0 + i * espacement
    hachures.push(trait(calque, [[x0, y], [x0 + epaisseur, y]]))
  }
  return hachures
}

describe('vocabulaire des traitements', () => {
  test('quatre traitements, chacun son libellé', () => {
    assert.deepEqual(TRAITEMENTS, ['garder', 'masse', 'masquer-motif', 'masquer'])
    assert.equal(LONGUEUR_MOTIF, 0.1)
    for (const t of TRAITEMENTS) assert.equal(typeof LIBELLES_TRAITEMENT[t], 'string')
    assert.equal(LIBELLES_TRAITEMENT.masse, 'Pocher (murs)')
    assert.equal(LIBELLES_TRAITEMENT['masquer-motif'], 'Masquer le motif')
  })

  test('longueur d’un trait : somme des segments, fermeture comprise', () => {
    assert.equal(longueurTrait(trait('A', [[0, 0], [3, 4]])), 5)
    assert.equal(longueurTrait(trait('A', [[0, 0], [1, 0], [1, 1]])), 2)
    assert.equal(longueurTrait(trait('A', [[0, 0], [1, 0], [1, 1], [0, 1]], true)), 4)
    assert.equal(longueurTrait(trait('A', [[2, 2]])), 0)
  })
})

describe('analyse des calques', () => {
  test('compte, part de courts, fermés, textes et boîte', () => {
    const traits = [
      trait('MURS', [[0, 0], [0, 0.05]]),
      trait('MURS', [[1, 0], [1, 0.05]]),
      trait('MURS', [[0, 0], [5, 0]]),
      trait('MURS', [[0, 0], [0.02, 0], [0.02, 0.02]], true),
      trait('COTES', [[-2, 3], [8, 3]]),
    ]
    const textes = [
      { texte: 'Séjour', calque: 'NOMS', hauteur: 0.2, pos: [2, 2] },
      { texte: '3,20', calque: 'COTES', hauteur: 0.1, pos: [3, 3.1] },
    ]
    const analyse = analyserCalques(traits, textes)
    assert.deepEqual(analyse.map((c) => c.nom), ['MURS', 'COTES', 'NOMS'])
    const murs = analyse[0]
    assert.equal(murs.traits, 4)
    assert.equal(murs.courts, 3)
    assert.equal(murs.partCourts, 0.75)
    assert.equal(murs.fermes, 1)
    assert.equal(murs.textes, 0)
    assert.deepEqual(murs.boite, [0, 0, 5, 0.05])
    const cotes = analyse[1]
    assert.equal(cotes.textes, 1)
    assert.deepEqual(cotes.boite, [-2, 3, 8, 3.1])
    const noms = analyse[2]
    assert.equal(noms.traits, 0)
    assert.equal(noms.partCourts, 0)
    assert.deepEqual(noms.boite, [2, 2, 2, 2])
  })
})

describe('décisions par défaut', () => {
  const calque = (nom, traits, courts) => ({ nom, traits, courts, partCourts: courts / traits, fermes: 0, textes: 0, boite: [0, 0, 1, 1] })
  test('murs pleins de courts pochés, autres motifs masqués, le reste gardé', () => {
    const d = decisionsParDefaut([
      calque('MURS EXTÉRIEURS', 20000, 19900),
      calque('Cloisons', 3000, 2900),
      calque('TOITURE', 50000, 49000),
      calque('PORTES', 2000, 1200),
      calque('MOBILIER-MUR', 100, 100),
    ])
    assert.equal(d['MURS EXTÉRIEURS'], 'masse')
    assert.equal(d.Cloisons, 'masse')
    assert.equal(d.TOITURE, 'masquer-motif')
    assert.equal(d.PORTES, 'garder')
    assert.equal(d['MOBILIER-MUR'], 'garder')
  })
  test('« mûr » sans accent ni casse : reconnu aussi', () => {
    assert.equal(decisionsParDefaut([calque('a-mûrs porteurs', 600, 600)])['a-mûrs porteurs'], 'masse')
  })
})

describe('simplification d’un étage', () => {
  test('un mur rempli de hachures devient une seule masse, ses contours longs restent', () => {
    const { hachures, contours } = murHorizontal('MURS', 10, 20, 4, 0.08)
    assert.ok(hachures.every((t) => longueurTrait(t) < LONGUEUR_MOTIF))
    const r = simplifierNiveau({ traits: [...hachures, ...contours], textes: [] }, { MURS: 'masse' })
    assert.equal(r.masses.length, 1)
    const m = r.masses[0]
    assert.equal(m.calque, 'MURS')
    assert.equal(m.anneaux.length, 1)
    const exterieur = m.anneaux[0]
    const a = aire(exterieur)
    assert.ok(Math.abs(a - 4 * 0.08) <= 4 * 0.08 * 0.15, `aire ${a}`)
    const [x0, y0, x1, y1] = boite(exterieur)
    for (const [v, attendu] of [[x0, 10], [y0, 20], [x1, 14], [y1, 20.08]]) {
      assert.ok(Math.abs(v - attendu) <= 0.03, `${v} loin de ${attendu}`)
    }
    // Le contour simplifié d'un rectangle tient en quelques sommets.
    assert.ok(exterieur.length <= 8, `${exterieur.length} sommets`)
    assert.equal(r.traits.length, 2)
    assert.deepEqual(r.traits, contours)
    assert.equal(r.retires, hachures.length)
  })

  test('un mur fermé sur lui-même : un anneau extérieur et un trou', () => {
    const traits = [
      ...murHorizontal('MURS', 0, 0, 4, 0.08).hachures,
      ...murHorizontal('MURS', 0, 3.92, 4, 0.08).hachures,
      ...murVertical('MURS', 0, 0, 4, 0.08),
      ...murVertical('MURS', 3.92, 0, 4, 0.08),
    ]
    const r = simplifierNiveau({ traits, textes: [] }, { MURS: 'masse' })
    assert.equal(r.masses.length, 1)
    const [exterieur, trou] = r.masses[0].anneaux
    assert.equal(r.masses[0].anneaux.length, 2)
    assert.ok(Math.abs(aire(exterieur) - 16) < 0.3, `extérieur ${aire(exterieur)}`)
    assert.ok(Math.abs(aire(trou) - 3.84 * 3.84) < 0.3, `trou ${aire(trou)}`)
    assert.ok(trou.every((p) => pointDansPolygone(p, exterieur)))
    assert.ok(pointDansPolygone([2, 2], exterieur))
    assert.ok(pointDansPolygone([2, 2], trou))
    assert.equal(r.traits.length, 0)
    assert.equal(r.retires, traits.length)
  })

  test('motif masqué, calque masqué, calque inconnu gardé', () => {
    const tuiles = [trait('TUILES', [[0, 0], [0.05, 0]]), trait('TUILES', [[0, 1], [0.05, 1]])]
    const rive = trait('TUILES', [[0, 0], [10, 0]])
    const cotes = [trait('COTES', [[0, 0], [5, 0]]), trait('COTES', [[0, 0], [0.02, 0]])]
    const portes = [trait('PORTES', [[0, 0], [0.9, 0]]), trait('PORTES', [[0, 0], [0.03, 0]])]
    const textes = [
      { texte: '5,00', calque: 'COTES', hauteur: 0.1, pos: [2.5, 0.1] },
      { texte: 'Tuiles', calque: 'TUILES', hauteur: 0.1, pos: [1, 1] },
      { texte: 'Entrée', calque: 'NOMS', hauteur: 0.2, pos: [1, 2] },
    ]
    const r = simplifierNiveau(
      { traits: [...tuiles, rive, ...cotes, ...portes], textes },
      { TUILES: 'masquer-motif', COTES: 'masquer', NOMS: 'garder' },
    )
    assert.deepEqual(r.traits, [rive, ...portes])
    assert.deepEqual(r.textes.map((t) => t.texte), ['Tuiles', 'Entrée'])
    assert.deepEqual(r.masses, [])
    assert.equal(r.retires, 2 + 2)
  })

  test('grille creuse : deux murs à 150 m l’un de l’autre donnent deux masses', () => {
    const a = murHorizontal('MURS', 0, 0, 2, 0.06).hachures
    const b = murHorizontal('MURS', 150, 120, 2, 0.06).hachures
    const r = simplifierNiveau({ traits: [...a, ...b], textes: [] }, { MURS: 'masse' })
    assert.equal(r.masses.length, 2)
    const boites = r.masses.map((m) => boite(m.anneaux[0])).sort((p, q) => p[0] - q[0])
    assert.ok(Math.abs(boites[0][0]) < 0.03 && Math.abs(boites[0][2] - 2) < 0.03)
    assert.ok(Math.abs(boites[1][0] - 150) < 0.03 && Math.abs(boites[1][1] - 120) < 0.03)
    for (const m of r.masses) assert.ok(Math.abs(aire(m.anneaux[0]) - 0.12) < 0.12 * 0.15)
  })

  test('un mur en biais : l’escalier des cellules est redressé', () => {
    const a = Math.PI / 6
    const [ux, uy, nx, ny] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)]
    const hachures = []
    for (let s = 0; s <= 3; s += 0.005) hachures.push(trait('CLOISONS', [[5 + s * ux, 5 + s * uy], [5 + s * ux + 0.08 * nx, 5 + s * uy + 0.08 * ny]]))
    const r = simplifierNiveau({ traits: hachures, textes: [] }, { CLOISONS: 'masse' })
    assert.equal(r.masses.length, 1)
    const exterieur = r.masses[0].anneaux[0]
    assert.ok(Math.abs(aire(exterieur) - 0.24) < 0.24 * 0.15, `aire ${aire(exterieur)}`)
    assert.ok(exterieur.length <= 10, `${exterieur.length} sommets`)
  })

  test('des miettes isolées ne font pas de masse', () => {
    const r = simplifierNiveau({ traits: [trait('MURS', [[0, 0], [0.015, 0]])], textes: [] }, { MURS: 'masse' })
    assert.deepEqual(r.masses, [])
    assert.equal(r.retires, 1)
  })

  test('un mur en coordonnées lointaines (Lambert) se poche aussi', () => {
    const { hachures } = murHorizontal('MURS', 1654321.2, 6543210.4, 1, 0.07)
    const r = simplifierNiveau({ traits: hachures, textes: [] }, { MURS: 'masse' })
    assert.equal(r.masses.length, 1)
    assert.ok(Math.abs(aire(r.masses[0].anneaux[0]) - 0.07) < 0.07 * 0.15)
  })
})

describe('fichier vectoriel', () => {
  test('aller-retour : calques, fermés, coordonnées au millimètre, textes, boîtes', () => {
    const entree = {
      traits: [
        trait('MURS', [[1.23456, 2.0004], [5.5, 2]]),
        trait('PORTES', [[0, 0], [1, 0], [1, 1]], true),
      ],
      masses: [{ calque: 'MURS', anneaux: [[[0, 0], [4, 0], [4, 0.0801], [0, 0.08]], [[1, 0.01], [1, 0.02], [2, 0.02]]] }],
      textes: [{ texte: 'Séjour', calque: 'NOMS', hauteur: 0.25, pos: [2.0001, 3.5] }],
      boite: [0, 0, 5.5, 3.5],
    }
    const octets = encoderVecteurs(entree)
    assert.ok(octets instanceof Uint8Array)
    assert.equal(octets[0], 0x1f)
    assert.equal(octets[1], 0x8b)
    const v = decoderVecteurs(octets)
    assert.deepEqual(v.calques, ['MURS', 'PORTES', 'NOMS'])
    assert.equal(v.traits.length, 2)
    assert.deepEqual(v.traits[0], { calque: 'MURS', ferme: false, pts: [[1.235, 2], [5.5, 2]], boite: [1.235, 2, 5.5, 2] })
    assert.deepEqual(v.traits[1], { calque: 'PORTES', ferme: true, pts: [[0, 0], [1, 0], [1, 1]], boite: [0, 0, 1, 1] })
    assert.deepEqual(v.masses, [{
      calque: 'MURS',
      anneaux: [[[0, 0], [4, 0], [4, 0.08], [0, 0.08]], [[1, 0.01], [1, 0.02], [2, 0.02]]],
      boite: [0, 0, 4, 0.08],
    }])
    assert.deepEqual(v.textes, [{ calque: 'NOMS', texte: 'Séjour', pos: [2, 3.5], hauteur: 0.25 }])
    assert.deepEqual(v.boite, [0, 0, 5.5, 3.5])
  })

  test('sans boîte fournie, elle est calculée ; version inconnue refusée', () => {
    const v = decoderVecteurs(encoderVecteurs({ traits: [trait('A', [[-1, 2], [3, 4]])], masses: [], textes: [] }))
    assert.deepEqual(v.boite, [-1, 2, 3, 4])
    assert.throws(() => decoderVecteurs(new Uint8Array([1, 2, 3])))
  })

  test('fichier déjà décompressé en route (Content-Encoding: gzip) : lu tel quel', async () => {
    const { gunzipSync } = await import('fflate')
    const octets = encoderVecteurs({ traits: [trait('A', [[0, 0], [1, 2]])], masses: [], textes: [] })
    assert.deepEqual([octets[0], octets[1]], [0x1f, 0x8b])
    const clair = gunzipSync(octets)
    assert.deepEqual(decoderVecteurs(clair), decoderVecteurs(octets))
    assert.throws(() => decoderVecteurs(new TextEncoder().encode('{"v":2}')), /version inconnue/)
  })
})
