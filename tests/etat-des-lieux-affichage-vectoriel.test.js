// État des lieux : affichage du plan vectoriel dans la visionneuse — rectangle
// de l'écran en mètres, tri de ce qui est à dessiner, dessin dans un contexte
// simulé, taille du canevas. Plans inventés : aucun plan réel dans le dépôt.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  rectangleVisible, elementsVisibles, boiteTexte, dessinerVecteurs,
  EPAISSEUR_TRAIT, EPAISSEUR_CONTOUR_MASSE, HAUTEUR_TEXTE_MIN,
  POINTS_GARDES_MAX, pointsVecteurs, cheminsAEcarter,
} from '../src/modules/etude/etat-des-lieux/vecteursEdlLogique.js'
import { encoderVecteurs, decoderVecteurs } from '../src/modules/etude/etat-des-lieux/simplificationPlan.js'
import { versPixels } from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import { tailleCanevas } from '../src/modules/chantier/comptes-rendus/plansLogique.js'

const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`)

// Étage de 40 m × 20 m, de (10, 5) à (50, 25), à 100 px par mètre : image de
// 4 000 × 2 000 px
const CADRAGE = { x0: 10, y0: 5, x1: 50, y1: 25, pxParMetre: 100, largeur: 4000, hauteur: 2000 }

// Vue de la visionneuse comme `peindreFond` la passe : conteneur 800 × 600,
// plan ajusté (0,2 px d'écran par px d'image), centré (oy = 100), zoom 4,
// décalé de (−400, −300)
function vue({ zoom = 4, dx = -400, dy = -300, ecran = { largeur: 800, hauteur: 600 } } = {}) {
  const echelleBase = Math.min(ecran.largeur / CADRAGE.largeur, ecran.hauteur / CADRAGE.hauteur)
  const ox = (ecran.largeur - CADRAGE.largeur * echelleBase) / 2
  const oy = (ecran.hauteur - CADRAGE.hauteur * echelleBase) / 2
  const k = echelleBase * zoom
  return {
    largeurImage: CADRAGE.largeur, hauteurImage: CADRAGE.hauteur,
    versEcran: (x, y) => [ox + dx + x * k, oy + dy + y * k],
    echelle: k, ecran,
  }
}

describe('rectangleVisible', () => {
  test('plan entier au zoom 1 : tout l’étage, plus la marge du conteneur', () => {
    const t = vue({ zoom: 1, dx: 0, dy: 0 })
    // 0,2 px d'écran par px d'image = 20 px par mètre ; le plan occupe
    // 800 × 400 px au milieu de 800 × 600 : 5 m de vide en haut et en bas
    const [x0, y0, x1, y1] = rectangleVisible(CADRAGE, t, 0)
    proche(x0, 10); proche(x1, 50)
    proche(y0, 0); proche(y1, 30)
  })

  test('zoom 4 décalé : un quart de l’étage, y vers le haut', () => {
    const t = vue()
    // 80 px par mètre. Coin haut gauche de l'écran : image (400 / 0,8,
    // (300 − 100) / 0,8) = (500, 250) px → (15 m, 22,5 m) ; coin bas droit :
    // (1 500, 1 000) px → (25 m, 15 m)
    const [x0, y0, x1, y1] = rectangleVisible(CADRAGE, t, 0)
    proche(x0, 15); proche(x1, 25)
    proche(y0, 15); proche(y1, 22.5)
  })

  test('la marge est en pixels d’écran : 8 px au zoom 4 = 10 cm', () => {
    const [x0, y0, x1, y1] = rectangleVisible(CADRAGE, vue(), 8)
    proche(x0, 14.9); proche(x1, 25.1)
    proche(y0, 14.9); proche(y1, 22.6)
  })

  test('cohérent avec versPixels : les coins de l’écran retombent sur ses bords', () => {
    const t = vue({ zoom: 2.5, dx: -123, dy: -45 })
    const [x0, y0, x1, y1] = rectangleVisible(CADRAGE, t, 0)
    const [hgx, hgy] = t.versEcran(...versPixels(CADRAGE, [x0, y1]))
    const [bdx, bdy] = t.versEcran(...versPixels(CADRAGE, [x1, y0]))
    proche(hgx, 0, 1e-6); proche(hgy, 0, 1e-6)
    proche(bdx, 800, 1e-6); proche(bdy, 600, 1e-6)
  })
})

describe('elementsVisibles', () => {
  const vecteurs = {
    traits: [
      { calque: 'A', ferme: false, pts: [[16, 16], [18, 16]], boite: [16, 16, 18, 16] }, // dedans
      { calque: 'A', ferme: false, pts: [[0, 0], [40, 40]], boite: [0, 0, 40, 40] }, // traverse l'écran
      { calque: 'A', ferme: false, pts: [[30, 16], [32, 16]], boite: [30, 16, 32, 16] }, // à droite
      { calque: 'A', ferme: false, pts: [[16, 23], [18, 23]], boite: [16, 23, 18, 23] }, // au-dessus
    ],
    masses: [
      { calque: 'M', anneaux: [[[14, 14], [16, 14], [16, 16], [14, 16]]], boite: [14, 14, 16, 16] }, // à cheval
      { calque: 'M', anneaux: [[[40, 6], [42, 6], [42, 8]]], boite: [40, 6, 42, 8] }, // hors écran
      { calque: 'M', anneaux: [], boite: [Infinity, Infinity, -Infinity, -Infinity] }, // vide
    ],
    textes: [
      { calque: 'T', texte: 'Séjour', pos: [20, 20], hauteur: 0.3 },
      // Ancré à gauche de l'écran, mais il s'écrit vers la droite et y entre
      { calque: 'T', texte: 'Dégagement', pos: [12.5, 18], hauteur: 0.4 },
      { calque: 'T', texte: 'Cave', pos: [45, 8], hauteur: 0.3 },
    ],
  }
  const rect = [15, 15, 25, 22.5]

  test('seuls les éléments dont la boîte croise l’écran', () => {
    const v = elementsVisibles(vecteurs, rect)
    assert.deepEqual(v.traits.map((t) => t.boite), [[16, 16, 18, 16], [0, 0, 40, 40]])
    assert.deepEqual(v.masses.map((m) => m.boite), [[14, 14, 16, 16]])
    assert.deepEqual(v.textes.map((t) => t.texte), ['Séjour', 'Dégagement'])
  })

  test('boîte d’un texte : vers la droite, lignes suivantes vers le bas', () => {
    const [x0, y0, x1, y1] = boiteTexte({ texte: 'AB\nCDEF', pos: [10, 10], hauteur: 1 })
    assert.equal(x0, 10)
    assert.ok(x1 > 12.5 && x1 < 14, `largeur ${x1 - 10}`)
    assert.ok(y0 < 8.8, 'la seconde ligne est sous la première')
    assert.equal(y1, 11)
  })

  test('sans vecteurs : rien', () => {
    assert.deepEqual(elementsVisibles(null, rect), { traits: [], masses: [], textes: [] })
  })
})

// Contexte 2D simulé : garde l'ordre des appels utiles
function contexte() {
  const appels = []
  const ctx = { appels }
  for (const nom of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill', 'fillText']) {
    ctx[nom] = (...args) => appels.push([nom, ...args, nom === 'stroke' ? ctx.lineWidth : undefined])
  }
  return ctx
}

describe('dessinerVecteurs', () => {
  // Passé par le vrai format de fichier : c'est ce que l'écran lira
  const vecteurs = decoderVecteurs(encoderVecteurs({
    traits: [
      { calque: 'Murs', ferme: false, pts: [[16, 16], [18, 16]] },
      { calque: 'Murs', ferme: true, pts: [[19, 19], [20, 19], [20, 20]] },
      { calque: 'Murs', ferme: false, pts: [[45, 6], [46, 6]] }, // hors écran
    ],
    masses: [
      { calque: 'Poché', anneaux: [[[16, 17], [18, 17], [18, 19], [16, 19]], [[16.5, 17.5], [17.5, 17.5], [17.5, 18.5], [16.5, 18.5]]] },
      { calque: 'Poché', anneaux: [[[21, 17], [22, 17], [22, 18]]] },
      { calque: 'Poteaux', anneaux: [[[23, 17], [24, 17], [24, 18]]] },
    ],
    textes: [
      { calque: 'Noms', texte: 'Séjour\n24 m²', pos: [20, 20], hauteur: 0.3 }, // 24 px à l'écran
      { calque: 'Noms', texte: 'cote', pos: [21, 21], hauteur: 0.05 }, // 4 px : ignoré
    ],
    boite: [10, 5, 50, 25],
  }))

  test('un chemin par famille, épaisseurs en pixels d’écran, hors écran ignoré', () => {
    const ctx = contexte()
    dessinerVecteurs(ctx, vecteurs, CADRAGE, vue())
    const noms = ctx.appels.map((a) => a[0])
    // Remplissage : un par calque de masses (2), puis un contour pour toutes
    // les masses, puis un pour tous les traits
    assert.equal(noms.filter((n) => n === 'fill').length, 2)
    assert.equal(noms.filter((n) => n === 'beginPath').length, 4)
    const traces = ctx.appels.filter((a) => a[0] === 'stroke').map((a) => a.at(-1))
    assert.deepEqual(traces, [EPAISSEUR_CONTOUR_MASSE, EPAISSEUR_TRAIT])
    assert.deepEqual(ctx.appels.filter((a) => a[0] === 'fill').map((a) => a[1]), ['evenodd', 'evenodd'])
    // 2 traits visibles (le troisième hors écran) : 2 moveTo après le contour
    const apresContour = noms.slice(noms.indexOf('stroke') + 1)
    assert.equal(apresContour.filter((n) => n === 'moveTo').length, 2)
  })

  test('coordonnées : versEcran(versPixels(p))', () => {
    const ctx = contexte()
    const t = vue()
    dessinerVecteurs(ctx, vecteurs, CADRAGE, t)
    const apresContour = ctx.appels.slice(ctx.appels.findIndex((a) => a[0] === 'stroke') + 1)
    const premier = apresContour.find((a) => a[0] === 'moveTo')
    const [sx, sy] = t.versEcran(...versPixels(CADRAGE, [16, 16]))
    proche(premier[1], sx, 1e-9); proche(premier[2], sy, 1e-9)
  })

  test('textes à leur hauteur réelle, ignorés sous 6 px, une ligne par ligne', () => {
    const ctx = contexte()
    const polices = []
    Object.defineProperty(ctx, 'font', { set: (v) => { polices.push(v) }, get: () => polices.at(-1) })
    dessinerVecteurs(ctx, vecteurs, CADRAGE, vue())
    const textes = ctx.appels.filter((a) => a[0] === 'fillText').map((a) => a[1])
    assert.deepEqual(textes, ['Séjour', '24 m²'])
    // 0,3 m × 100 px/m × 0,8 = 24 px
    assert.deepEqual(polices, ['24px Arial, sans-serif'])
    assert.ok(HAUTEUR_TEXTE_MIN === 6)
  })

  test('deux images de suite : mêmes appels (préparation gardée par fichier)', () => {
    const a = contexte()
    const b = contexte()
    dessinerVecteurs(a, vecteurs, CADRAGE, vue())
    dessinerVecteurs(b, vecteurs, CADRAGE, vue())
    assert.deepEqual(b.appels, a.appels)
  })

  test('zoom 1 : textes trop petits ignorés, hors écran rien de tracé', () => {
    const ctx = contexte()
    // 0,3 m × 100 px/m × 0,2 = 6 px : tout juste lisible ; « cote » non
    dessinerVecteurs(ctx, vecteurs, CADRAGE, vue({ zoom: 1, dx: 0, dy: 0 }))
    assert.deepEqual(ctx.appels.filter((x) => x[0] === 'fillText').map((x) => x[1]), ['Séjour', '24 m²'])
    const loin = contexte()
    dessinerVecteurs(loin, vecteurs, CADRAGE, vue({ zoom: 12, dx: -9000, dy: -100 }))
    assert.equal(loin.appels.filter((x) => x[0] === 'moveTo' || x[0] === 'fillText').length, 0)
  })

  test('sans échelle ou sans vecteurs : rien n’est dessiné', () => {
    const ctx = contexte()
    dessinerVecteurs(ctx, null, CADRAGE, vue())
    dessinerVecteurs(ctx, vecteurs, CADRAGE, { ...vue(), echelle: 0 })
    assert.equal(ctx.appels.length, 0)
  })
})

describe('tailleCanevas', () => {
  test('conteneur × devicePixelRatio', () => {
    assert.deepEqual(tailleCanevas(1024, 768, 2), { ratio: 2, largeur: 2048, hauteur: 1536 })
  })

  test('plafonné à 16 millions de pixels (iPad)', () => {
    const t = tailleCanevas(3000, 2000, 2)
    assert.ok(t.largeur * t.hauteur <= 16_000_000)
    assert.ok(t.ratio < 2 && t.ratio > 1.6)
  })

  test('conteneur pas encore mesuré : un pixel', () => {
    assert.deepEqual(tailleCanevas(0, 0, 2), { ratio: 1, largeur: 1, hauteur: 1 })
  })
})

describe('mémoire des étages décodés', () => {
  test('poids en points : traits, anneaux des masses, textes', () => {
    const v = {
      traits: [{ pts: [[0, 0], [1, 1]] }, { pts: [[0, 0], [1, 0], [1, 1]] }],
      masses: [{ anneaux: [[[0, 0], [1, 0], [1, 1], [0, 1]], [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4]]] }],
      textes: [{ texte: 'Séjour' }],
    }
    assert.equal(pointsVecteurs(v), 2 + 3 + 4 + 3 + 1)
    assert.equal(pointsVecteurs(null), 0)
  })

  test('budget d’environ 1,5 million de points', () => {
    assert.equal(POINTS_GARDES_MAX, 1_500_000)
  })

  test('les plus anciens partent jusqu’à tenir dans le budget', () => {
    const poids = new Map([['a', 400], ['b', 300], ['c', 500], ['d', 200]])
    assert.deepEqual(cheminsAEcarter(poids, 'd', 900), ['a', 'b'])
    assert.deepEqual(cheminsAEcarter(poids, 'd', 1000), ['a'])
    assert.deepEqual(cheminsAEcarter(poids, 'd', 1400), [])
  })

  test('l’étage affiché reste, même seul au-dessus du budget', () => {
    assert.deepEqual(cheminsAEcarter(new Map([['lourd', 2_000_000]]), 'lourd'), [])
    const poids = new Map([['lourd', 2_000_000], ['a', 10], ['b', 10]])
    assert.deepEqual(cheminsAEcarter(poids, 'lourd'), ['a', 'b'])
    // L'étage affiché en tête de liste est sauté, les suivants partent
    assert.deepEqual(cheminsAEcarter(new Map([['vu', 900], ['x', 900]]), 'vu', 1000), ['x'])
  })
})

describe('zoom maximal d’un plan vectoriel', async () => {
  const { zoomMaxVectoriel, PX_ECRAN_PAR_METRE_MAX } = await import('../src/modules/etude/etat-des-lieux/vecteursEdlLogique.js')
  test('une grande feuille va jusqu’au centimètre lisible', () => {
    // Feuille de 214 m en 6 000 px (28 px/m) affichée à 0,1 px d'écran par px d'image
    const z = zoomMaxVectoriel(0.1, 28, 12)
    assert.ok(Math.abs(z * 0.1 * 28 - PX_ECRAN_PAR_METRE_MAX) < 1e-6)
    assert.ok(z > 600)
  })
  test('jamais sous le plafond des images, ni sans cadrage', () => {
    assert.equal(zoomMaxVectoriel(5, 1000, 12), 12)
    assert.equal(zoomMaxVectoriel(0, 28, 60), 60)
    assert.equal(zoomMaxVectoriel(0.1, undefined, 60), 60)
  })
})
