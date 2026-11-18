// État des lieux, lot 4 (export) : rapport PDF pièce par pièce.
// Affaire, pièces et relevés inventés : aucun plan ni nom réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { CALQUES } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'
import {
  definitionRapportEdl, etagesDuRapport, groupesElements, hspPiece, HORS_LATIN, nombreFr, nomFichierRapportEdl,
  pieceVisitee, piedRapportEdl, pointsSansElement, surfacePiece, texteLatin,
} from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import {
  agrandir, cadragePiece, cadragePlan, dessinerPlanRapport, echelleSymbole, marquesElements, placementFond, PX_PLAN_ETAGE, PX_SYMBOLE_MIN,
} from '../src/modules/etude/etat-des-lieux/export/planRapportEdl.js'

const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]]

const affaire = { code_affaire: '9901', nom: 'Maison de l’essai', projet_adresse: '1 rue Imaginaire', projet_commune: 'Villefictive', moa_nom: 'Maître d’ouvrage inventé' }
const niveaux = [
  { id: 'n2', nom: 'R+1', ordre: 1, cadrage: { x0: 0, y0: 0, x1: 20, y1: 20, pxParMetre: 100, largeur: 2000, hauteur: 2000 } },
  { id: 'n1', nom: 'RDC', ordre: 0, cadrage: { x0: 0, y0: 0, x1: 20, y1: 20, pxParMetre: 100, largeur: 2000, hauteur: 2000 } },
]
const pieces = [
  { id: 'p1', niveau_id: 'n1', ordre: 0, numero: '01', nom: 'Séjour', contour: carre(0, 0, 5), surface_lue: 25, hsp_lue: 2.5, fiche: { sol: 'Parquet chêne', murs: 'Peinture blanche', plafond: '', plinthes: 'Bois', hsp: '', remarques: 'Fissure au droit de la fenêtre → à surveiller ✓' }, analyse_le: '2026-11-17T10:00:00Z' },
  { id: 'p2', niveau_id: 'n1', ordre: 1, numero: '02', nom: 'Salle d’eau', contour: carre(5, 0, 3), surface_lue: null, fiche: {} },
  { id: 'p3', niveau_id: 'n1', ordre: 2, numero: '03', nom: 'Cellier', contour: carre(8, 0, 2), fiche: {} },
  { id: 'p4', niveau_id: 'n2', ordre: 0, numero: '11', nom: 'Chambre', contour: carre(0, 0, 4), fiche: { hsp: '2,45 m' } },
]
const elementsExport = [
  { id: 'e1', pieceId: 'p1', x: 1, y: 1, calque: 'electricite', type: 'prise', libelle: 'Prise double', cotes: 'h 0,30', numero: 1, aValider: false },
  { id: 'e2', pieceId: 'p1', x: 2, y: 4.8, calque: 'menuiseries', type: 'fenetre', libelle: '', cotes: '1,20 × 1,35', numero: 2, aValider: false },
  { id: 'e3', pieceId: 'p1', x: 4, y: 1, calque: 'plomberie', type: null, libelle: 'Arrivée d’eau en attente', cotes: null, numero: 3, aValider: true },
  { id: 'e4', pieceId: 'p2', x: 6, y: 1, calque: 'plomberie', type: 'lavabo', libelle: 'Lavabo', cotes: null, numero: 4, aValider: false },
  { id: 'e5', pieceId: 'p2', x: null, y: null, calque: 'chauffage', type: 'radiateur', libelle: 'Sèche-serviettes', cotes: null, numero: null, aValider: false },
  { id: 'e6', pieceId: 'p1', x: 3, y: 3, calque: 'inconnu', type: null, libelle: 'Chose', cotes: null, numero: 5, aValider: false },
]
const points = [
  { id: 'pt1', niveau_id: 'n1', piece_id: 'p1', numero: 1, x: 1, y: 1, type: 'prise' },
  { id: 'pt2', niveau_id: 'n1', piece_id: 'p1', numero: 2, x: 2.5, y: 2.5, type: null },
  { id: 'pt3', niveau_id: 'n1', piece_id: 'p2', numero: 3, x: 6, y: 1, type: null },
]
const elementsBruts = [{ id: 'e4', point_id: 'pt3' }, { id: 'e1', point_id: 'pt1' }]
const photos = [
  { id: 'ph1', point_id: 'pt1', chemin: 'a/edl/photos/ph1.webp', prise_le: '2026-11-17T10:01:00Z' },
  { id: 'ph2', point_id: 'pt3', chemin: 'a/edl/photos/ph2.webp', prise_le: '2026-11-17T10:05:00Z' },
  { id: 'ph3', point_id: 'pt2', chemin: 'a/edl/photos/ph3.webp', prise_le: '2026-11-17T10:03:00Z' },
]
const IMG = 'data:image/jpeg;base64,AAAA'
const images = {
  logo: IMG,
  plans: new Map([['n1', IMG], ['n2', IMG]]),
  pieces: new Map([['p1', IMG]]),
  photos: new Map([['ph1', IMG], ['ph2', IMG], ['ph3', IMG]]),
}

const donnees = (plus = {}) => ({
  affaire, niveaux, pieces, elementsExport, photos, points, elements: elementsBruts,
  visitees: new Set(['p2']), images, redacteur: 'Rédacteur Inventé', date: '2026-11-18', ...plus,
})

// Tous les textes d'une description pdfmake, à toute profondeur
function textes(noeud, acc = []) {
  if (typeof noeud === 'string') acc.push(noeud)
  else if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, acc))
  else if (noeud && typeof noeud === 'object') {
    for (const [k, v] of Object.entries(noeud)) {
      if (k === 'image' || k === 'id' || k === 'layout' || k === 'color' || k === 'fillColor' || k === 'lineColor') continue
      if (k === 'text' || k === 'stack' || k === 'columns' || k === 'table' || k === 'body' || k === 'content') textes(v, acc)
    }
  }
  return acc
}
const texteDe = (n) => textes(n).join(' ')

describe('rapport PDF : structure', () => {
  const def = definitionRapportEdl(donnees())
  const ids = def.content.map((n) => n.id)

  test('page de garde, puis par étage (dans l’ordre) le plan et les fiches des pièces visitées', () => {
    assert.deepEqual(ids, ['garde', 'plan-n1', 'fiche-p1', 'fiche-p2', 'plan-n2', 'fiche-p4'])
    const garde = texteDe(def.content[0])
    for (const attendu of ['État des lieux', 'Maison de l’essai', '9901', '1 rue Imaginaire Villefictive', 'Rédacteur Inventé', '18 novembre 2026', 'RDC', 'R+1']) {
      assert.ok(garde.includes(attendu), `garde sans « ${attendu} »`)
    }
  })

  test('plans en paysage, fiches en portrait, chacun sur sa page', () => {
    for (const n of def.content.slice(1)) {
      assert.equal(n.pageBreak, 'before')
      assert.equal(n.pageOrientation, n.id.startsWith('plan-') ? 'landscape' : 'portrait')
    }
    assert.equal(def.pageSize, 'A4')
    const plan = def.content[1]
    assert.ok(plan.stack.some((x) => x.image === IMG), 'image du plan absente')
  })

  test('pièce non visitée : pas de fiche, signalée sous le plan de son étage', () => {
    assert.ok(!ids.includes('fiche-p3'))
    assert.match(texteDe(def.content[1]), /non visitée \(1, sans fiche\).*03 · Cellier/)
  })

  test('fiche : nom, surface, HSP, finitions, remarques', () => {
    const f1 = texteDe(def.content[2])
    for (const attendu of ['01 · Séjour', '25 m²', '2,50 m', 'Parquet chêne', 'Peinture blanche', 'Non relevé', 'Fissure au droit de la fenêtre -> à surveiller']) {
      assert.ok(f1.includes(attendu), `fiche sans « ${attendu} »`)
    }
    assert.ok(def.content[2].stack.some((x) => x.image === IMG), 'extrait de la pièce absent')
    // Surface mesurée sur le contour, sans extrait : rien ne casse
    const f2 = texteDe(def.content[3])
    assert.ok(f2.includes('9 m²') && f2.includes('(mesurée)'), f2)
    assert.ok(f2.includes('HSP non relevée'))
    assert.ok(texteDe(def.content[5]).includes('2,45 m'), 'HSP dite en visite')
  })

  test('éléments numérotés et groupés par calque, dans l’ordre de calquesEdl.js', () => {
    // Intertitres de calque (gras, corps 9), à toute profondeur des blocs
    const intertitres = []
    const parcourir = (n) => {
      if (Array.isArray(n)) return n.forEach(parcourir)
      if (!n || typeof n !== 'object') return
      if (typeof n.text === 'string' && n.bold && n.fontSize === 9) intertitres.push(n.text)
      if (n.stack) parcourir(n.stack)
    }
    parcourir(def.content[2].stack)
    assert.deepEqual(intertitres, ['Plomberie', 'Électricité', 'Menuiseries', 'Autres éléments'])
    const ordre = CALQUES.map((c) => c.libelle)
    const rangs = intertitres.slice(0, -1).map((t) => ordre.indexOf(t))
    assert.deepEqual(rangs, [...rangs].sort((a, b) => a - b))
    const t = texteDe(def.content[2])
    assert.ok(t.includes('Prise double') && t.includes('h 0,30'))
    // Fenêtre sans libellé : le type sert de libellé
    assert.ok(t.includes('Fenêtre') && t.includes('1,20 × 1,35'))
  })

  test('propositions marquées « à valider », élément sans point signalé', () => {
    const t1 = texteDe(def.content[2])
    assert.match(t1, /Arrivée d’eau en attente\s+\(à valider\)/)
    assert.ok(texteDe(def.content[0]).includes('1 élément marqué « à valider »'))
    const t2 = texteDe(def.content[3])
    assert.ok(t2.includes('Sèche-serviettes') && t2.includes('(sans point sur le plan)'))
  })

  test('points sans élément et photos rangées dans la pièce de leur point', () => {
    const t1 = texteDe(def.content[2])
    assert.ok(t1.includes('POINTS SANS ÉLÉMENT') && t1.includes('P2 :'), t1)
    assert.ok(t1.includes('PHOTOS (2)'))
    assert.ok(t1.includes('n° 1 · Prise double'), 'légende par l’élément du point')
    assert.ok(t1.includes('Point P2'), 'légende par le point')
    const t2 = texteDe(def.content[3])
    assert.ok(t2.includes('PHOTOS (1)') && t2.includes('n° 4 · Lavabo'))
    assert.ok(!t2.includes('POINTS SANS ÉLÉMENT'), 'P3 porte le lavabo')
  })

  test('pied de page « Affaire · État des lieux · page n / N »', () => {
    assert.equal(def.footer(3, 12).text, '9901 Maison de l’essai · État des lieux · page 3 / 12')
    assert.equal(piedRapportEdl(null)(1, 1).text, 'Affaire · État des lieux · page 1 / 1')
  })

  test('aucun caractère hors latin courant dans les textes produits', () => {
    const sale = donnees({
      affaire: { ...affaire, nom: 'Essai ▶ 🏠' },
      pieces: pieces.map((p) => (p.id === 'p1' ? { ...p, nom: 'Séjour ✓', fiche: { ...p.fiche, murs: 'Enduit ≈ 2 cm, e\u0301caille\u0301' } } : p)),
      elementsExport: elementsExport.map((e) => (e.id === 'e1' ? { ...e, libelle: 'Prise ⚡ 16 A', cotes: '≥ 0,30 m' } : e)),
    })
    const tout = textes(definitionRapportEdl(sale).content)
    const fautifs = tout.filter((t) => t.match(HORS_LATIN))
    assert.deepEqual(fautifs, [])
    assert.ok(tout.some((t) => t.includes('Enduit ~ 2 cm, écaillé')))
    assert.ok(tout.some((t) => t.includes('>= 0,30 m')))
  })

  test('image absente : texte de remplacement, pas d’erreur', () => {
    const d = definitionRapportEdl(donnees({ images: {} }))
    assert.ok(texteDe(d.content[1]).includes('Plan de l’étage indisponible'))
    assert.ok(!texteDe(d.content[2]).includes('PHOTOS'))
  })

  test('sans `edl_elements` : un élément à la même place rattache le point', () => {
    const s = pointsSansElement({ points, elements: null, elementsExport })
    assert.deepEqual(s.map((p) => p.id), ['pt2'])
  })
})

describe('rapport PDF : calculs', () => {
  test('texteLatin', () => {
    assert.equal(texteLatin('Mur → fissuré ✓'), 'Mur -> fissuré ')
    assert.equal(texteLatin('Œil-de-bœuf « ok » – 3 €'), 'Œil-de-bœuf « ok » – 3 €')
    assert.equal(texteLatin(null), '')
  })

  test('nombreFr sans espace fine', () => {
    assert.equal(nombreFr(12.5), '12,5')
    assert.equal(nombreFr(1234.567), '1 234,57')
    assert.equal(nombreFr(2.5, 2, { fixe: true }), '2,50')
    assert.equal(nombreFr(12), '12')
  })

  test('surface écrite, sinon mesurée ; HSP dite, sinon lue', () => {
    assert.deepEqual(surfacePiece({ surface_lue: 12.5, contour: [] }), { texte: '12,5 m²', mesuree: false })
    assert.deepEqual(surfacePiece({ contour: carre(0, 0, 2) }), { texte: '4 m²', mesuree: true })
    assert.equal(surfacePiece({ contour: [] }), null)
    assert.equal(hspPiece({ fiche: { hsp: '2,60' }, hsp_lue: 2.5 }), '2,60')
    assert.equal(hspPiece({ fiche: {}, hsp_lue: 2.5 }), '2,50 m')
    assert.equal(hspPiece({}), null)
  })

  test('pièce visitée : entrée notée, élément, point, fiche ou analyse', () => {
    assert.equal(pieceVisitee({ id: 'x' }, {}), false)
    assert.equal(pieceVisitee({ id: 'x' }, { visitees: ['x'] }), true)
    assert.equal(pieceVisitee({ id: 'x', fiche: { sol: ' ' } }, {}), false)
    assert.equal(pieceVisitee({ id: 'x', fiche: { sol: 'Carrelage' } }, {}), true)
    assert.equal(pieceVisitee({ id: 'x' }, { points: [{ piece_id: 'x' }] }), true)
    const etages = etagesDuRapport({ niveaux, pieces, elementsExport, points, visitees: null })
    assert.deepEqual(etages.map((e) => e.niveau.id), ['n1', 'n2'])
    assert.deepEqual(etages[0].nonVisitees.map((p) => p.id), ['p3'])
  })

  test('groupesElements : ordre des calques puis des numéros, inconnu en dernier', () => {
    const g = groupesElements([
      { calque: 'desordres', numero: 9 }, { calque: 'plomberie', numero: 7 }, { calque: 'plomberie', numero: 2 }, { calque: 'zzz', numero: 1 },
    ])
    assert.deepEqual(g.map((x) => x.calque), ['plomberie', 'desordres', null])
    assert.deepEqual(g[0].elements.map((e) => e.numero), [2, 7])
  })

  test('nom du fichier', () => {
    assert.equal(nomFichierRapportEdl(affaire, '2026-11-18'), '2026-11-18-9901-etat-des-lieux.pdf')
    assert.equal(nomFichierRapportEdl({}, new Date(2026, 0, 5)), '2026-01-05-etat-des-lieux.pdf')
  })
})

describe('plan du rapport', () => {
  test('cadrage sur les pièces (et pas sur toute la feuille), ~2 400 px sur le long côté', () => {
    const c = cadragePlan(pieces.filter((p) => p.niveau_id === 'n1'), { repli: niveaux[0].cadrage })
    assert.equal(Math.max(c.largeur, c.hauteur), PX_PLAN_ETAGE)
    // Pièces de 0 à 10 m sur 0 à 5 m, marge de 1,5 m : la feuille de 20 m est ignorée
    assert.ok(Math.abs(c.x0 + 1.5) < 1e-9 && Math.abs(c.x1 - 11.5) < 1e-9, JSON.stringify(c))
    const repli = cadragePlan([], { repli: niveaux[0].cadrage })
    assert.ok(repli.x1 - repli.x0 > 20)
    assert.equal(cadragePlan([], {}), null)
    const cp = cadragePiece(pieces[1])
    assert.ok(Math.abs(cp.x0 - 4) < 1e-9 && Math.max(cp.largeur, cp.hauteur) === 1400)
  })

  test('symboles à taille fixe agrandis sur un grand étage, appareils à leur taille', () => {
    assert.equal(echelleSymbole('lavabo', 10), 1)
    assert.equal(echelleSymbole('prise', 1000), 1)
    const k = echelleSymbole('prise', 20)
    assert.ok(Math.abs(k * 0.3 * 20 - PX_SYMBOLE_MIN) < 1e-9)
    const a = agrandir([{ cercle: [1, 1, 0.1] }, { texte: 'T', pos: [2, 1], hauteur: 0.1 }], [1, 1], 2)
    assert.deepEqual(a, [{ cercle: [1, 1, 0.2] }, { texte: 'T', pos: [3, 1], hauteur: 0.2 }])
  })

  test('image d’étage posée d’après son cadrage', () => {
    const c = { x0: 5, y0: 0, x1: 10, y1: 10, pxParMetre: 10 }
    assert.deepEqual(placementFond({ x0: 0, y0: 0, x1: 20, y1: 20 }, c), { x: -50, y: -100, largeur: 200, hauteur: 200 })
    assert.equal(placementFond(null, c), null)
  })

  test('une bulle par numéro et par point, couleur des propositions', () => {
    const m = marquesElements([
      ...elementsExport,
      { id: 'e7', pieceId: 'p1', x: 1, y: 1, calque: 'electricite', type: 'interrupteur', libelle: '', numero: 1, aValider: false },
    ], pieces, 100)
    assert.equal(m.length, 6, 'l’élément sans point n’est pas dessiné')
    assert.equal(m.filter((x) => x.numero === '1').length, 1)
    assert.equal(m.find((x) => x.element.id === 'e3').couleur, '#2F6FB5')
    assert.deepEqual(m.find((x) => x.element.id === 'e3').primitives, [])
  })

  test('dessin sur un contexte quelconque : pièces, symboles, bulles', () => {
    const appels = []
    const ctx = new Proxy({}, {
      get: (cible, nom) => (nom in cible ? cible[nom] : (...args) => { appels.push([nom, ...args]); return nom === 'measureText' ? { width: 10 } : undefined }),
      set: (cible, nom, valeur) => { cible[nom] = valeur; return true },
    })
    const etage = pieces.filter((p) => p.niveau_id === 'n1')
    const c = cadragePlan(etage)
    dessinerPlanRapport(ctx, {
      cadrage: c, vecteurs: { traits: [{ pts: [[0, 0], [10, 0]], ferme: false, boite: [0, 0, 10, 0] }], masses: [], textes: [] },
      pieces: etage, elementsExport: elementsExport.filter((e) => e.pieceId !== 'p4'), pointsSeuls: [points[1]], visitees: new Set(['p1', 'p2']),
    })
    const textesDessines = appels.filter((a) => a[0] === 'fillText').map((a) => a[1])
    for (const t of ['01 · Séjour', '1', '2', '3', '4', '5', 'P2']) assert.ok(textesDessines.includes(t), `« ${t} » non dessiné`)
    assert.ok(appels.some((a) => a[0] === 'setLineDash' && a[1].length === 2), 'pièce non visitée en pointillés')
  })
})
