// État des lieux, lot 4 (export) : place des textes du DXF.
// Demande de l'agence (2026-11-18) : nom, surface, HSP et finitions dans un
// cadre, et aucun autre texte dedans ni sur un autre.
// Pièces, points et éléments inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { decoderDxf, lireDxf } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'
import { pointDansPolygone } from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import { largeurTexte } from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'
import { elementsAExporter, encoderDxf, etiquettesEtage, genererDxfEdl } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { placesDesignations } from '../src/modules/etude/etat-des-lieux/export/planRapportEdl.js'
import {
  aireIntersection, indexObstacles, placerCadre, placerLibelle, polygoneBoite, repere,
} from '../src/modules/etude/etat-des-lieux/export/placementEtiquettes.js'

// Rectangle l × h, coin bas gauche (x, y), tourné de `deg` autour de ce coin
function rectangle(x, y, l, h, deg = 0) {
  const a = (deg * Math.PI) / 180
  return [[0, 0], [l, 0], [l, h], [0, h]].map(([u, v]) => [x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a)])
}

const fiche = { sol: 'Carrelage grès cérame 30 × 30', murs: 'Faïence toute hauteur', plafond: 'Peinture', plinthes: '' }
const sejour = { id: 'sej', nom: 'Séjour', numero: '1.04', contour: rectangle(0, 0, 5, 4), surface_lue: 20, hsp_lue: 2.5, fiche }
// Petite salle de bain (4,4 m²) à côté, séparée par un mur de 0,2 m
const sdb = { id: 'sdb', nom: 'Salle de bain', numero: '1.05', contour: rectangle(5.2, 0, 2, 2.2), surface_lue: 4.4, hsp_lue: 2.5, fiche }

const points = [
  { id: 's1', numero: 1, x: 0.6, y: 0.2, type: 'radiateur', piece_id: 'sej' },
  { id: 's2', numero: 2, x: 2.5, y: 2, type: 'luminaire', piece_id: 'sej' },
  { id: 's3', numero: 3, x: 4.8, y: 3.7, type: 'prise', piece_id: 'sej' },
  // Quatre éléments dans la salle de bain, contre les murs, aux libellés
  // longs : de quoi obliger certains à s'écarter (traits de rappel)
  { id: 'b5', numero: 5, x: 5.55, y: 1.9, type: 'lavabo', piece_id: 'sdb' },
  { id: 'b7', numero: 7, x: 5.3, y: 0.25, type: 'interrupteur', piece_id: 'sdb' },
  { id: 'b8', numero: 8, x: 6.9, y: 0.2, type: 'prise', piece_id: 'sdb' },
  { id: 'b9', numero: 9, x: 6.9, y: 2.05, type: 'luminaire', piece_id: 'sdb' },
]
const elements = [
  { id: 'e1', point_id: 's1', type: 'radiateur', libelle: 'Radiateur fonte sous la fenêtre', cotes: 'largeur 120' },
  { id: 'e2', point_id: 's2', type: 'luminaire', libelle: 'Plafonnier' },
  { id: 'e3', point_id: 's3', type: 'prise', libelle: 'Prise double' },
  { id: 'e5', point_id: 'b5', type: 'lavabo', libelle: 'Lavabo sur colonne, mitigeur', cotes: 'h 0,85' },
  { id: 'e7', point_id: 'b7', type: 'interrupteur', libelle: 'Interrupteur double va-et-vient, plaque blanche' },
  { id: 'e8', point_id: 'b8', type: 'prise', libelle: 'Prise rasoir avec transformateur intégré', cotes: 'h 1,20' },
  { id: 'e9', point_id: 'b9', type: 'luminaire', libelle: 'Réglette au-dessus du miroir' },
].map((e) => ({ piece_id: points.find((p) => p.id === e.point_id).piece_id, calque: null, cotes: null, a_valider: false, ...e }))
const photos = [{ point_id: 'b5', numero: 1 }, { point_id: 's2', numero: 2 }, { point_id: 's2', numero: 3 }]

// Grappe serrée dans le séjour : neuf prises à 10 cm les unes des autres,
// leurs libellés ne tiennent pas tous au premier anneau (traits de rappel)
const grappe = Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, numero: 20 + i, x: 1.2 + (i % 3) * 0.1, y: 2.6 + Math.floor(i / 3) * 0.1, type: 'prise', piece_id: 'sej' }))
const elementsGrappe = grappe.map((g) => ({ id: `eg${g.numero}`, point_id: g.id, piece_id: 'sej', type: 'prise', calque: null, libelle: 'Prise double encastrée', cotes: null, a_valider: false }))

function etage({ pieces = [sejour, sdb], pts = points, els = elements, ph = photos } = {}) {
  const elementsExport = elementsAExporter({ pieces, points: pts, elements: els })
  return { pieces, elementsExport, points: pts, photos: ph }
}

// Boîte de chaque ligne de texte écrite (hauteur du texte, largeur estimée) :
// centrée pour le cadre, calée à gauche pour les libellés
function boitesTextes(mise) {
  const boites = []
  const ajouter = (l, angle, centre, quoi) => {
    const L = largeurTexte(l.texte, l.hauteur)
    const x0 = centre ? -L / 2 : 0
    boites.push({ quoi: `${quoi} « ${l.texte} »`, poly: polygoneBoite({ xmin: x0, ymin: -l.hauteur / 2, xmax: x0 + L, ymax: l.hauteur / 2 }, repere(l.pos, angle).versPlan) })
  }
  for (const c of mise.cadres) for (const l of c.lignes) ajouter(l, c.angle, true, c.piece.nom)
  for (const r of mise.reperes) {
    for (const l of r.libelle?.lignes ?? []) ajouter(l, r.angle, false, r.cle)
    for (const l of r.photo?.lignes ?? []) ajouter(l, r.angle, false, `${r.cle} photo`)
  }
  return boites
}

const symbolesDe = (mise) => mise.reperes.filter((r) => r.symbole).map((r) => ({ cle: r.cle, poly: polygoneBoite(r.symbole, repere(r.origine, r.angle).versPlan) }))
const libellesDe = (mise) => mise.reperes.flatMap((r) => [r.libelle, r.photo?.coins ? r.photo : null].filter(Boolean).map((l) => ({ cle: r.cle, ...l })))
const dedans = (poly, contour) => poly.every((p) => pointDansPolygone(p, contour))

describe('placement des textes', () => {
  test('aucune boîte de texte EDL sur une autre', () => {
    const boites = boitesTextes(etiquettesEtage(etage()))
    assert.ok(boites.length > 20)
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        assert.ok(aireIntersection(boites[i].poly, boites[j].poly) < 1e-6, `${boites[i].quoi} sur ${boites[j].quoi}`)
      }
    }
  })

  test('aucun libellé d’élément ni de photo dans un cadre', () => {
    const mise = etiquettesEtage(etage())
    const libelles = libellesDe(mise)
    assert.equal(libelles.length, 9)
    for (const l of libelles) {
      for (const c of mise.cadres) assert.ok(aireIntersection(l.coins, c.coins) < 1e-6, `${l.cle} dans le cadre de ${c.piece.nom}`)
    }
  })

  test('pièce de 5 × 4 m : cadre entier dans la pièce, sur aucun symbole, textes pleine taille', () => {
    const mise = etiquettesEtage(etage())
    const cadre = mise.cadres.find((c) => c.piece.id === 'sej')
    assert.equal(cadre.echelle, 1)
    assert.equal(cadre.dedans, true)
    assert.ok(dedans(cadre.coins, sejour.contour))
    for (const s of symbolesDe(mise)) assert.ok(aireIntersection(cadre.coins, s.poly) < 1e-6, `cadre sur ${s.cle}`)
    // Nom, surface, HSP et finitions, rien d'autre
    assert.deepEqual(cadre.lignes.map((l) => l.texte), ['Séjour (1.04)', '20 m²', 'HSP 2,50 m', 'Sol : Carrelage grès cérame 30 ×', '30', 'Murs : Faïence toute hauteur', 'Plafond : Peinture'])
    assert.ok(cadre.lignes.every((l) => l.texte.length <= 32))
    // Le luminaire est au centre : le cadre s'en écarte, au plus près
    assert.ok(!pointDansPolygone([2.5, 2], cadre.coins))
  })

  test('grappe serrée : des libellés s’écartent avec un trait de rappel qui part du symbole', () => {
    const mise = etiquettesEtage(etage({ pts: [...points, ...grappe], els: [...elements, ...elementsGrappe] }))
    const libelles = libellesDe(mise).filter((l) => l.cle.startsWith('g'))
    assert.ok(libelles.some((l) => l.rappel), 'aucun trait de rappel')
    for (const l of libelles.filter((x) => x.rappel)) {
      const [, b] = l.rappel
      const bord = enveloppe(l.coins)
      assert.ok(b[0] >= bord.xmin - 1e-6 && b[0] <= bord.xmax + 1e-6 && b[1] >= bord.ymin - 1e-6 && b[1] <= bord.ymax + 1e-6)
    }
  })

  test('salle de bain de 2 × 2,2 m et quatre éléments : cadre réduit, traits de rappel', () => {
    const mise = etiquettesEtage(etage())
    const cadre = mise.cadres.find((c) => c.piece.id === 'sdb')
    assert.ok(cadre.echelle < 1 && cadre.echelle >= 0.6 - 1e-9, `réduction ${cadre.echelle}`)
    assert.equal(cadre.dedans, true)
    assert.ok(dedans(cadre.coins, sdb.contour))
    for (const s of symbolesDe(mise)) assert.ok(aireIntersection(cadre.coins, s.poly) < 1e-6, `cadre sur ${s.cle}`)
    const libelles = libellesDe(mise).filter((l) => l.cle.startsWith('b'))
    // Un trait de rappel part du bord du symbole et touche le libellé
    for (const l of libelles.filter((x) => x.rappel)) {
      const [, b] = l.rappel
      const bord = enveloppe(l.coins)
      assert.ok(b[0] >= bord.xmin - 1e-6 && b[0] <= bord.xmax + 1e-6 && b[1] >= bord.ymin - 1e-6 && b[1] <= bord.ymax + 1e-6)
    }
  })

  test('pièce tournée de 10° : cadre tourné comme elle, entier dedans', () => {
    const piece = { ...sejour, id: 'rot', contour: rectangle(20, 5, 4, 3, 10) }
    const pts = [{ id: 'r1', numero: 1, x: 22, y: 6.8, type: 'radiateur', piece_id: 'rot' }]
    const els = [{ id: 'r', point_id: 'r1', piece_id: 'rot', type: 'radiateur', calque: null, libelle: 'Radiateur', cotes: null, a_valider: false }]
    const mise = etiquettesEtage(etage({ pieces: [piece], pts, els, ph: [] }))
    const [cadre] = mise.cadres
    assert.equal(cadre.dedans, true)
    assert.ok(dedans(cadre.coins, piece.contour))
    const [a, b] = cadre.coins
    assert.ok(Math.abs((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI - 10) < 1e-6)
    for (const s of symbolesDe(mise)) assert.ok(aireIntersection(cadre.coins, s.poly) < 1e-6)
  })

  test('pièce en L : le cadre ne passe pas par l’angle rentrant', () => {
    const contour = [[0, 0], [6, 0], [6, 1.2], [1.2, 1.2], [1.2, 6], [0, 6]]
    const lignes = [{ texte: 'Couloir (1.01)', hauteur: 0.2 }, { texte: 'Sol : Parquet', hauteur: 0.12 }]
    const cadre = placerCadre({ contour, lignes })
    assert.equal(cadre.dedans, true)
    assert.ok(dedans(cadre.coins, contour))
    // Aucun côté du contour ne traverse le cadre (l'angle (1,2 ; 1,2) en dehors)
    assert.ok(!pointDansPolygone([1.2, 1.2], cadre.coins))
  })

  test('rien ne tient : place la plus dans la pièce, sans couvrir le symbole', () => {
    const contour = rectangle(0, 0, 0.8, 0.8)
    const obstacle = rectangle(0.05, 0.05, 0.2, 0.2)
    const lignes = [{ texte: 'Placard technique (0.12)', hauteur: 0.2 }, { texte: 'Sol : Carrelage', hauteur: 0.12 }]
    const cadre = placerCadre({ contour, lignes, obstacles: [obstacle] })
    assert.equal(cadre.dedans, false)
    assert.equal(cadre.echelle, 0.6)
    assert.ok(aireIntersection(cadre.coins, obstacle) < 1e-6)
  })

  test('libellé : à droite d’abord, sinon les autres places, puis plus loin avec un trait', () => {
    const ancre = { xmin: -0.1, ymin: -0.1, xmax: 0.1, ymax: 0.1 }
    const lignes = [{ texte: 'P1 · Prise', hauteur: 0.12 }]
    const libre = placerLibelle({ origine: [0, 0], ancre, lignes, index: indexObstacles() })
    assert.equal(libre.anneau, 1)
    assert.ok(Math.abs(libre.boite.xmin - 0.18) < 1e-9)
    assert.equal(libre.rappel, null)
    // Un cadre tout autour du premier anneau : le libellé s'écarte, un trait le relie
    const index = indexObstacles()
    for (const [x0, y0, x1, y1] of [[-1.3, 0.12, 1.3, 0.45], [-1.3, -0.45, 1.3, -0.12], [-1.3, -0.12, -0.12, 0.12], [0.12, -0.12, 1.3, 0.12]]) {
      index.ajouter(polygoneBoite({ xmin: x0, ymin: y0, xmax: x1, ymax: y1 }, (p) => p), 'cadre')
    }
    const loin = placerLibelle({ origine: [0, 0], ancre, lignes, index })
    assert.ok(loin.anneau >= 2 || !loin.libre)
    assert.ok(loin.rappel)
  })

  test('même entrée, même sortie (DXF compris)', () => {
    const a = etiquettesEtage(etage())
    const b = etiquettesEtage(etage())
    assert.deepEqual(a, b)
    const { pieces, elementsExport, points: pts, photos: ph } = etage()
    assert.equal(genererDxfEdl({ pieces, elementsExport, points: pts, photos: ph, unitesParMetre: 1 }), genererDxfEdl({ pieces, elementsExport, points: pts, photos: ph, unitesParMetre: 1 }))
  })

  test('relu par lireDxf : un cadre fermé sur EDL-Pièces dans chaque pièce, traits de rappel sur le calque de l’élément', () => {
    const { pieces, elementsExport, points: pts, photos: ph } = etage({ pts: [...points, ...grappe], els: [...elements, ...elementsGrappe] })
    const texte = genererDxfEdl({ pieces, elementsExport, points: pts, photos: ph, unitesParMetre: 100 })
    const l = lireDxf(decoderDxf(encoderDxf(texte)))
    const fermes = l.traits.filter((t) => t.calque === 'EDL-Pièces' && t.ferme && !t.bloc)
    for (const piece of pieces) {
      const contour = piece.contour.map(([x, y]) => [x * 100, y * 100])
      const cadres = fermes.filter((t) => t.pts.length === 4 && t.pts.every((p) => pointDansPolygone(p, contour)) && Math.abs(t.pts[0][0] - contour[0][0]) > 1e-6)
      assert.equal(cadres.length, 1, `cadre de ${piece.nom}`)
    }
    const rappels = l.traits.filter((t) => !t.bloc && !t.ferme && t.pts.length === 2 && t.calque.startsWith('EDL-'))
    assert.ok(rappels.length >= 1)
    const calquesElements = ['EDL-Plomberie', 'EDL-Électricité', 'EDL-Chauffage', 'EDL-Photos']
    assert.ok(rappels.every((t) => calquesElements.includes(t.calque)), rappels.map((t) => t.calque).join(', '))
  })

  test('un étage de 200 pièces et 1 000 éléments reste rapide', () => {
    const pieces = []
    const pts = []
    const els = []
    for (let i = 0; i < 200; i++) {
      const x = (i % 20) * 4.2
      const y = Math.floor(i / 20) * 3.7
      pieces.push({ id: `p${i}`, nom: `Pièce ${i}`, numero: String(i), contour: rectangle(x, y, i % 3 ? 4 : 1.5, 3.5), surface_lue: 14, hsp_lue: 2.5, fiche })
      for (let k = 0; k < 5; k++) {
        const id = `q${i}-${k}`
        pts.push({ id, numero: i * 5 + k + 1, x: x + 0.2 + k * 0.25, y: y + 0.2 + (k % 2) * 3, type: 'prise', piece_id: `p${i}` })
        els.push({ id: `e${id}`, point_id: id, piece_id: `p${i}`, type: 'prise', calque: null, libelle: 'Prise double encastrée', cotes: null, a_valider: false })
      }
    }
    const donnees = etage({ pieces, pts, els, ph: [] })
    const t0 = performance.now()
    const mise = etiquettesEtage(donnees)
    const duree = performance.now() - t0
    assert.equal(mise.cadres.length, 200)
    assert.equal(mise.reperes.length, 1000)
    assert.ok(duree < 1500, `${Math.round(duree)} ms`)
  })
})

describe('plan du rapport PDF', () => {
  test('désignation posée comme le cadre du DXF : sur aucun symbole ni bulle', () => {
    // Un symbole (agrandi) et sa bulle au centre de la pièce
    const obstacles = [{ xmin: 2.2, ymin: 1.7, xmax: 2.8, ymax: 2.3 }, { xmin: 2.8, ymin: 2.3, xmax: 3.1, ymax: 2.6 }]
    const [place] = placesDesignations([sejour], { hauteur: 0.25, obstacles })
    assert.equal(place.texte, '1.04 · Séjour')
    const l = largeurTexte(place.texte, 0.25)
    const boite = polygoneBoite({ xmin: -l / 2, ymin: -0.125, xmax: l / 2, ymax: 0.125 }, (p) => [p[0] + place.pos[0], p[1] + place.pos[1]])
    assert.ok(dedans(boite, sejour.contour))
    for (const b of obstacles) assert.ok(aireIntersection(boite, polygoneBoite(b, (p) => p)) < 1e-6)
    // Sans obstacle : au centre visuel
    const [libre] = placesDesignations([sejour], { hauteur: 0.25 })
    assert.ok(Math.hypot(libre.pos[0] - 2.5, libre.pos[1] - 2) < 1e-9)
    // Extrait d'une pièce : sa seule désignation
    assert.deepEqual(placesDesignations([sejour, sdb], { hauteur: 0.25, pieceMiseEnAvant: sdb }).map((x) => x.piece.id), ['sdb'])
  })
})

function enveloppe(pts) {
  return {
    xmin: Math.min(...pts.map((p) => p[0])), xmax: Math.max(...pts.map((p) => p[0])),
    ymin: Math.min(...pts.map((p) => p[1])), ymax: Math.max(...pts.map((p) => p[1])),
  }
}
