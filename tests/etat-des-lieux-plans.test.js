// État des lieux, onglet « Plans » : un seul plan (éditeur des pièces et
// relevés de la visite), la liste des pièces à côté. Adresse, priorité d'un
// toucher, cadrage, pièce suivante. Pièces et points inventés.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  lireVueEdl, ecrireVueEdl, choixPiece, ouvrirPiece, voirEtage, cadreAffiche, resoudreToucher,
  opacitePoint, traceDeLaPiece, pieceSuivante, pieceDeLiaison, VUE_LISTE, VUE_PLANS,
  debutPlacement, toucherPlacement, distanceContour, derniereVisite, nouveauPointBureau, pointAAnnuler, typeDuPoint,
} from '../src/modules/etude/etat-des-lieux/plansEdlLogique.js'
import { courbeCommande } from '../src/modules/etude/etat-des-lieux/visite/tracesVisiteLogique.js'

const rect = (x, y, l, h) => [[x, y], [x + l, y], [x + l, y + h], [x, y + h]]
// Un séjour qui contient un placard (la plus petite pièce l'emporte), une chambre à côté
const sejour = { id: 'sejour', contour: rect(0, 0, 6, 4) }
const placard = { id: 'placard', contour: rect(5, 3, 1, 1) }
const chambre = { id: 'chambre', contour: rect(6, 0, 4, 4) }
const pieces = [sejour, placard, chambre]
const pt = (id, piece_id, x, y, extra = {}) => ({ id, piece_id, x, y, numero: 1, ...extra })
const adresseDe = (chaine) => lireVueEdl(new URLSearchParams(chaine))

describe('adresse du module', () => {
  test('sans paramètre : le plan de l’étage, rien de choisi', () => {
    assert.deepEqual(adresseDe(''), { vue: VUE_PLANS, pieceId: null, cadreId: null })
  })
  test('pièce choisie et pièce cadrée', () => {
    assert.deepEqual(adresseDe('vue=plans&piece=a&cadre=b'), { vue: VUE_PLANS, pieceId: 'a', cadreId: 'b' })
    assert.deepEqual(adresseDe('piece=a&cadre=1'), { vue: VUE_PLANS, pieceId: 'a', cadreId: 'a' })
    assert.deepEqual(adresseDe('piece=a'), { vue: VUE_PLANS, pieceId: 'a', cadreId: null })
  })
  test('la liste des pièces', () => {
    assert.deepEqual(adresseDe('vue=liste&piece=a'), { vue: VUE_LISTE, pieceId: null, cadreId: null })
  })
  test('anciens liens de la relecture : la pièce ouverte sur le plan, cadrée ; sans pièce, la liste', () => {
    assert.deepEqual(adresseDe('vue=relecture&piece=a'), { vue: VUE_PLANS, pieceId: 'a', cadreId: 'a' })
    assert.deepEqual(adresseDe('vue=relecture'), { vue: VUE_LISTE, pieceId: null, cadreId: null })
  })
  test('écrire garde les autres paramètres et se relit à l’identique', () => {
    for (const a of [
      { vue: VUE_PLANS, pieceId: 'a', cadreId: 'a' },
      { vue: VUE_PLANS, pieceId: 'a', cadreId: null },
      { vue: VUE_PLANS, pieceId: null, cadreId: 'b' },
      { vue: VUE_PLANS, pieceId: null, cadreId: null },
      { vue: VUE_LISTE, pieceId: null, cadreId: null },
    ]) {
      const n = ecrireVueEdl(new URLSearchParams('visite=0&vue=relecture&piece=z'), a)
      assert.equal(n.get('visite'), '0')
      assert.deepEqual(lireVueEdl(n), a)
    }
    assert.equal(ecrireVueEdl(new URLSearchParams('piece=a&cadre=a'), { vue: VUE_PLANS }).toString(), '')
    assert.equal(ecrireVueEdl('', { vue: VUE_LISTE }).toString(), 'vue=liste')
  })
})

describe('cadrage', () => {
  test('ouvrir depuis la liste : choisie et cadrée ; « Voir tout l’étage » garde la pièce choisie', () => {
    assert.deepEqual(ouvrirPiece('a'), { vue: VUE_PLANS, pieceId: 'a', cadreId: 'a' })
    assert.deepEqual(voirEtage({ pieceId: 'a', cadreId: 'a' }), { vue: VUE_PLANS, pieceId: 'a', cadreId: null })
  })
  test('plan cadré : le cadre suit la pièce touchée, et reste hors des pièces', () => {
    assert.equal(choixPiece({ pieceId: 'a', cadreId: 'a' }, 'b').cadreId, 'b')
    assert.deepEqual(choixPiece({ pieceId: 'a', cadreId: 'a' }, null), { vue: VUE_PLANS, pieceId: null, cadreId: 'a' })
  })
  test('plan de l’étage : on choisit sans agrandir', () => {
    assert.deepEqual(choixPiece({ pieceId: null, cadreId: null }, 'b'), { vue: VUE_PLANS, pieceId: 'b', cadreId: null })
  })
  test('le cadre de la visionneuse : celui de la pièce, en fractions de l’image', () => {
    // Étage de 10 × 5 m à 20 px par mètre : image de 200 × 100 px
    const niveau = { largeur: 200, hauteur: 100, cadrage: { x0: 0, y1: 5, pxParMetre: 20 } }
    const cadre = cadreAffiche('chambre', pieces, niveau)
    // La chambre va de 6 à 10 m en x et de 0 à 4 m en y (y vers le haut)
    assert.deepEqual(cadre, { x0: 0.6, y0: 0.2, x1: 1, y1: 1 })
    assert.equal(cadreAffiche(null, pieces, niveau), null)
    assert.equal(cadreAffiche('disparue', pieces, niveau), null)
    assert.equal(cadreAffiche('nue', [{ id: 'nue', contour: [[0, 0]] }], niveau), null)
  })
})

describe('priorité d’un toucher sur le plan', () => {
  const points = [pt('p1', 'sejour', 1, 1), pt('p2', 'chambre', 7, 1), pt('p3', null, 12, 1)]
  const traces = [{ id: 'c1', sorte: 'cote', piece_id: 'sejour', xa: 0, ya: 2, xb: 0, yb: 4 }]
  const toucher = (position, extra = {}) => resoudreToucher({ position, tolerance: 0.3, points, traces, pieces, ...extra })

  test('un point sous le doigt l’emporte sur la pièce, et désigne sa pièce', () => {
    assert.deepEqual(toucher([1.1, 1]), { sorte: 'point', point: points[0], pieceId: 'sejour' })
    // Point d'une autre pièce (pâli) : touchable, il choisit sa pièce
    assert.equal(toucher([7, 1.2]).pieceId, 'chambre')
    // Hors des pièces : un point sans pièce
    assert.deepEqual(toucher([12, 1]), { sorte: 'point', point: points[2], pieceId: null })
  })
  test('puis une trace, puis la plus petite pièce qui contient l’appui', () => {
    const t = toucher([0.05, 3])
    assert.equal(t.sorte, 'trace')
    assert.equal(t.trace.id, 'c1')
    assert.equal(t.pieceId, 'sejour')
    assert.deepEqual(toucher([5.5, 3.5]), { sorte: 'piece', pieceId: 'placard' })
    assert.deepEqual(toucher([3, 2]), { sorte: 'piece', pieceId: 'sejour' })
    assert.deepEqual(toucher([20, 20]), { sorte: 'piece', pieceId: null })
  })
  test('pendant « Relier » : seulement le point visé, ou rien', () => {
    assert.deepEqual(toucher([7, 1], { relier: true }), { sorte: 'relier', point: points[1] })
    assert.deepEqual(toucher([3, 2], { relier: true }), { sorte: 'relier', point: null })
  })
  test('une liaison sans pièce prend celle d’un de ses bouts', () => {
    const lien = { id: 'l1', sorte: 'commande', piece_id: null, point_a: 'p1', point_b: 'p2' }
    const p = [pt('p1', 'sejour', 1, 1), pt('p2', 'chambre', 9, 1)]
    // Touchée en son milieu, loin des deux points
    const courbe = courbeCommande([1, 1], [9, 1]).points
    const milieu = courbe[Math.floor(courbe.length / 2)]
    const r = resoudreToucher({ position: milieu, tolerance: 0.3, points: p, traces: [lien], pieces })
    assert.equal(r.sorte, 'trace')
    assert.equal(r.pieceId, 'chambre')
  })
})

describe('ce qui se pâlit autour de la pièce choisie', () => {
  const points = [pt('p1', 'sejour', 1, 1), pt('p2', 'chambre', 7, 1)]
  test('points', () => {
    assert.equal(opacitePoint(points[0], null), 1)
    assert.equal(opacitePoint(points[0], 'sejour'), 1)
    assert.ok(opacitePoint(points[1], 'sejour') < 1)
  })
  test('traces : sa pièce, ou l’un de ses points', () => {
    const lien = { id: 'l', sorte: 'commande', piece_id: 'chambre', point_a: 'p1', point_b: 'p2' }
    assert.equal(traceDeLaPiece(lien, 'sejour', points), true)
    assert.equal(traceDeLaPiece(lien, 'chambre', points), true)
    assert.equal(traceDeLaPiece(lien, 'placard', points), false)
    assert.equal(traceDeLaPiece(lien, null, points), true)
  })
})

describe('« Pièce suivante »', () => {
  const ordre = ['a', 'b', 'c']
  test('dans l’ordre de la liste ; rien de choisi : la première ; la dernière : aucune', () => {
    assert.equal(pieceSuivante(ordre, 'a'), 'b')
    assert.equal(pieceSuivante(ordre, null), 'a')
    assert.equal(pieceSuivante(ordre, 'hors-liste'), 'a')
    assert.equal(pieceSuivante(ordre, 'c'), null)
    assert.equal(pieceSuivante([], null), null)
  })
})

describe('pièce d’une liaison posée sur le plan', () => {
  test('celle du luminaire, à défaut de l’interrupteur, sinon la pièce choisie', () => {
    assert.equal(pieceDeLiaison({ interrupteur: { piece_id: 'couloir' }, luminaire: { piece_id: 'chambre' } }, 'x'), 'chambre')
    assert.equal(pieceDeLiaison({ interrupteur: { piece_id: 'couloir' }, luminaire: { piece_id: null } }, 'x'), 'couloir')
    assert.equal(pieceDeLiaison({ interrupteur: {}, luminaire: {} }, 'x'), 'x')
    assert.equal(pieceDeLiaison({ interrupteur: {}, luminaire: {} }), null)
  })
})

describe('« Ajouter un élément » au bureau : toucher la pièce', () => {
  const mode = debutPlacement('sejour')

  test('le mode commence en attente du toucher, sans motif', () => {
    assert.deepEqual(mode, { etape: 'toucher', pieceId: 'sejour', raison: null })
  })

  test('un toucher dans la pièce choisie pose le point, au millimètre', () => {
    const r = toucherPlacement(mode, { position: [2.12345, 1.98765], tolerance: 0.1, pieces })
    assert.equal(r.action, 'poser')
    assert.deepEqual(r.position, [2.123, 1.988])
    assert.deepEqual(r.mode, { etape: 'pose', pieceId: 'sejour' })
  })

  test('un toucher sur le mur de la pièce, juste dehors, compte pour elle', () => {
    const r = toucherPlacement(mode, { position: [3, -0.05], tolerance: 0.1, pieces })
    assert.equal(r.action, 'poser')
  })

  test('hors des pièces : refus, rien posé, la consigne dit pourquoi', () => {
    const r = toucherPlacement(mode, { position: [3, -2], tolerance: 0.1, pieces })
    assert.equal(r.action, 'refus')
    assert.equal(r.mode.etape, 'toucher')
    assert.match(r.mode.raison, /hors des pièces/)
  })

  test('dans une autre pièce (même enclavée dans la pièce choisie) : refus', () => {
    assert.match(toucherPlacement(mode, { position: [8, 2], tolerance: 0.1, pieces }).mode.raison, /autre pièce/)
    assert.equal(toucherPlacement(mode, { position: [5.5, 3.5], tolerance: 0.1, pieces }).action, 'refus')
  })

  test('sur la cloison commune, à portée du doigt : la pièce choisie l’emporte', () => {
    assert.equal(toucherPlacement(mode, { position: [6.05, 2], tolerance: 0.1, pieces }).action, 'poser')
  })

  test('pendant l’écriture ou le formulaire, un toucher ne fait rien', () => {
    assert.equal(toucherPlacement({ etape: 'pose', pieceId: 'sejour' }, { position: [2, 2], pieces }).action, 'rien')
    assert.equal(toucherPlacement({ etape: 'formulaire', pieceId: 'sejour', point: { id: 'p' } }, { position: [2, 2], pieces }).action, 'rien')
    assert.equal(toucherPlacement(null, { position: [2, 2], pieces }).action, 'rien')
  })

  test('une pièce sans contour ne reçoit rien', () => {
    const r = toucherPlacement(debutPlacement('vide'), { position: [2, 2], pieces: [...pieces, { id: 'vide', contour: [] }] })
    assert.equal(r.action, 'refus')
  })

  test('distance au contour', () => {
    assert.equal(distanceContour([3, -1], sejour.contour), 1)
    assert.equal(distanceContour([3, 2], sejour.contour), 2)
  })
})

describe('point posé au bureau', () => {
  const visites = [
    { id: 'v1', debut: '2026-03-02T09:00:00.000Z' },
    { id: 'v2', debut: '2026-03-09T09:00:00.000Z', fin: '2026-03-09T11:00:00.000Z' },
  ]
  const points = [pt('a', 'sejour', 1, 1, { numero: 4 }), pt('b', 'chambre', 7, 1, { numero: 11 })]

  test('la dernière visite de l’affaire, par son début', () => {
    assert.equal(derniereVisite(visites).id, 'v2')
    assert.equal(derniereVisite([]), null)
    assert.equal(derniereVisite(undefined), null)
  })

  test('rattaché à la dernière visite, numéro suivant de l’affaire, sans type', () => {
    const p = nouveauPointBureau({
      affaireId: 'aff', niveauId: 'rdc', pieceId: 'sejour', position: [2, 3], visites, points,
      maintenant: new Date('2026-03-20T10:00:00.000Z'), nouvelId: () => 'nouveau',
    })
    assert.deepEqual(p, {
      id: 'nouveau', visite_id: 'v2', affaire_id: 'aff', niveau_id: 'rdc', piece_id: 'sejour',
      numero: 12, x: 2, y: 3, calque: null, type: null, pose_le: '2026-03-20T10:00:00.000Z',
    })
  })

  test('premier point de l’affaire : P1 ; sans visite : rien', () => {
    const base = { affaireId: 'aff', niveauId: 'rdc', pieceId: 'sejour', position: [2, 3], nouvelId: () => 'n' }
    assert.equal(nouveauPointBureau({ ...base, visites, points: [] }).numero, 1)
    assert.equal(nouveauPointBureau({ ...base, visites: [], points }), null)
  })

  test('annuler : le point posé est retiré, rien avant qu’il soit posé', () => {
    assert.equal(pointAAnnuler({ etape: 'formulaire', pieceId: 'sejour', point: { id: 'p9' } }), 'p9')
    assert.equal(pointAAnnuler({ etape: 'pose', pieceId: 'sejour' }), null)
    assert.equal(pointAAnnuler(debutPlacement('sejour')), null)
    assert.equal(pointAAnnuler(null), null)
  })

  test('le point prend le calque et le type de son élément', () => {
    assert.deepEqual(typeDuPoint({ calque: 'electricite', type: 'interrupteur', libelle: 'x' }), { calque: 'electricite', type: 'interrupteur' })
    assert.deepEqual(typeDuPoint({ calque: 'remarques', type: null }), { calque: 'remarques', type: null })
  })
})
