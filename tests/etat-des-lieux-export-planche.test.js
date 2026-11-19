// État des lieux : mise en page des planches A3 « report relevé ».
// Affaire, pièces et relevés inventés : aucun plan ni nom réel dans le dépôt (public).
// Les éléments passent par le vrai `elementsAExporter`, comme pour le DXF et le PDF.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { elementsAExporter } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { orientationElement, quantiteElement } from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'
import { COULEUR_PROPOSITION, couleurCalque } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import {
  DPI_PLANCHE, ECHELLES, FORMAT_A3, HAUTEUR_CARTOUCHE, MARGE_PLANCHE, TAILLE_SYMBOLE_MM,
  dateCartouche, echellePlanche, misePlanche, versMmPlanche,
} from '../src/modules/etude/etat-des-lieux/export/plancheEdl.js'

const proche = (a, b, ecart = 1e-6) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
const rect = (x, y, l, h) => [[x, y], [x + l, y], [x + l, y + h], [x, y + h]]

const niveau = { id: 'n1', nom: 'RDC' }
const affaire = { code_affaire: '9902', nom: 'Bureaux de l’essai', projet_adresse: '2 allée Inventée', projet_commune: 'Villefictive' }
const piece = (id, contour, extra = {}) => ({ id, niveau_id: 'n1', numero: id, nom: `Pièce ${id}`, contour, ...extra })
const point = (id, pieceId, numero, x, y, type = null) => ({ id, niveau_id: 'n1', piece_id: pieceId, numero, x, y, type })
const element = (id, pieceId, pointId, calque, type, libelle, aValider = false) => ({
  id, piece_id: pieceId, point_id: pointId, calque, type, libelle, cotes: null, a_valider: aValider,
})

function mise({ pieces, points = [], elements = [], inclurePropositions = false, ...reste }) {
  const elementsExport = elementsAExporter({ pieces, points, elements, inclurePropositions })
  return misePlanche({ niveau, pieces, elementsExport, affaire, date: '2026-11-18', redacteur: 'Rédacteur inventé', numero: '10-1', indice: '', inclurePropositions, ...reste })
}

describe('planche : format, zone, échelle', () => {
  test('A3 paysage, zone au-dessus du cartouche', () => {
    const m = mise({ pieces: [piece('p1', rect(0, 0, 30, 20))] })
    assert.deepEqual(m.format, { nom: 'A3', largeur: 420, hauteur: 297 })
    assert.deepEqual(FORMAT_A3, m.format)
    assert.deepEqual(m.zone, { x: 8, y: 8, largeur: 404, hauteur: 297 - 16 - HAUTEUR_CARTOUCHE })
    assert.equal(m.cartouche.cadreMm.y, m.zone.y + m.zone.hauteur)
    assert.equal(m.cartouche.cadreMm.y + m.cartouche.cadreMm.hauteur, FORMAT_A3.hauteur - MARGE_PLANCHE)
    assert.equal(DPI_PLANCHE, 200)
    assert.deepEqual(ECHELLES, [100, 200, 250, 500, 1000])
  })

  test('1/100 pour 30 × 20 m, 1/200 pour 60 × 40 m, 1/500 pour 150 m', () => {
    assert.equal(mise({ pieces: [piece('p1', rect(0, 0, 30, 20))] }).echelle, 100)
    assert.equal(mise({ pieces: [piece('p1', rect(0, 0, 60, 40))] }).echelle, 200)
    assert.equal(mise({ pieces: [piece('p1', rect(0, 0, 150, 20))] }).echelle, 500)
    // Plusieurs pièces : leur emprise commune
    assert.equal(mise({ pieces: [piece('p1', rect(0, 0, 10, 10)), piece('p2', rect(50, 30, 10, 10))] }).echelle, 200)
    // Trop grand pour tout : la dernière
    assert.equal(echellePlanche([0, 0, 2000, 10], { largeur: 404, hauteur: 257 }), 1000)
  })

  test('les pièces d’un autre étage ne comptent pas', () => {
    const autre = { ...piece('p9', rect(0, 0, 200, 200)), niveau_id: 'n2' }
    assert.equal(mise({ pieces: [piece('p1', rect(0, 0, 30, 20)), autre] }).echelle, 100)
  })

  test('sans pièce, l’emprise du plan vectoriel', () => {
    assert.equal(mise({ pieces: [], boiteVecteurs: [0, 0, 60, 40] }).echelle, 200)
    assert.equal(mise({ pieces: [], boiteVecteurs: { x0: 0, y0: 0, x1: 30, y1: 20 } }).echelle, 100)
  })

  test('rien du tout : 1/100, centré dans la zone', () => {
    const m = misePlanche({ niveau })
    assert.equal(m.echelle, 100)
    assert.deepEqual(m.symboles, [])
    assert.deepEqual(m.transform.origineMm, [m.zone.x + m.zone.largeur / 2, m.zone.y + m.zone.hauteur / 2])
  })

  test('plan centré dans la zone, y du papier vers le bas', () => {
    const m = mise({ pieces: [piece('p1', rect(10, 5, 30, 20))] })
    const { zone, transform } = m
    assert.equal(transform.mmParMetre, 10)
    const [gx, haut] = versMmPlanche(transform, [10, 25])
    const [dx, bas] = versMmPlanche(transform, [40, 5])
    proche((gx + dx) / 2, zone.x + zone.largeur / 2)
    proche((haut + bas) / 2, zone.y + zone.hauteur / 2)
    proche(dx - gx, 300)
    proche(bas - haut, 200)
    // Le haut du plan (y grand) est en haut du papier (y petit)
    assert.ok(haut < bas)
  })

  test('versMmPlanche', () => {
    const t = { mmParMetre: 5, origineM: [100, 50], origineMm: [210, 140] }
    assert.deepEqual(versMmPlanche(t, [100, 50]), [210, 140])
    assert.deepEqual(versMmPlanche(t, [102, 51]), [220, 135])
    assert.deepEqual(versMmPlanche(t, [98, 49]), [200, 145])
  })
})

describe('planche : symboles', () => {
  const salle = piece('p1', rect(0, 0, 30, 20))

  test('symbole à taille fixe : 4,5 mm à toutes les échelles ; réglette à l’échelle', () => {
    for (const [cote, echelle] of [[30, 100], [60, 200], [150, 500]]) {
      const pc = piece('p1', rect(0, 0, cote, 20))
      const m = mise({
        pieces: [pc],
        points: [point('a', 'p1', 1, cote / 2, 10), point('b', 'p1', 2, cote / 3, 10)],
        elements: [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise'), element('e2', 'p1', 'b', 'electricite', 'reglette', 'Réglette')],
      })
      assert.equal(m.echelle, echelle)
      const prise = m.symboles.find((s) => s.code === 'prise')
      assert.equal(prise.angle, 0)
      proche(Math.max(prise.tailleMm.largeur, prise.tailleMm.hauteur), TAILLE_SYMBOLE_MM, 1e-3)
      const reglette = m.symboles.find((s) => s.code === 'reglette')
      proche(reglette.tailleMm.largeur, (0.9 * 1000) / echelle, 1e-3)
      proche(reglette.tailleMm.hauteur, (0.15 * 1000) / echelle, 1e-3)
    }
  })

  test('position, ancre, couleur, nom, clé', () => {
    const m = mise({ pieces: [salle], points: [point('a', 'p1', 1, 15, 10)], elements: [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise')] })
    const [s] = m.symboles
    const [x, y] = versMmPlanche(m.transform, [15, 10])
    proche(s.xMm, x)
    proche(s.yMm, y)
    assert.equal(s.elementId, 'e1')
    assert.equal(s.nom, 'Prise de courant')
    assert.equal(s.calque, 'electricite')
    assert.equal(s.couleur, couleurCalque('electricite'))
    assert.equal(s.cle, 'prise|0|1|0')
    // Prise : demi-cercle de 0,09 m au-dessus, trait de 0,10 m dessous
    const f = TAILLE_SYMBOLE_MM / 0.19
    proche(s.tailleMm.ancre[0], 0.09 * f, 1e-3)
    proche(s.tailleMm.ancre[1], 0.09 * f, 1e-3)
  })

  test('quantité et angle de Task 1 : prise triple contre le mur de droite', () => {
    const pts = [point('a', 'p1', 1, 29.7, 10), point('b', 'p1', 2, 10, 0.3)]
    const els = [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise triple'), element('e2', 'p1', 'b', 'electricite', 'interrupteur', 'Interrupteur')]
    const m = mise({ pieces: [salle], points: pts, elements: els })
    const prise = m.symboles.find((s) => s.code === 'prise')
    assert.equal(prise.quantite, 3)
    assert.equal(prise.quantite, quantiteElement({ type: 'prise', libelle: 'Prise triple' }))
    assert.equal(prise.angle, orientationElement({ type: 'prise', x: 29.7, y: 10 }, salle))
    assert.equal(prise.angle, 90)
    assert.equal(prise.cle, 'prise|90|3|0')
    // Tournée d'un quart de tour : sa boîte aussi
    proche(prise.tailleMm.largeur, TAILLE_SYMBOLE_MM, 1e-3)
    const inter = m.symboles.find((s) => s.code === 'interrupteur')
    assert.equal(inter.angle, 0)
    assert.equal(inter.quantite, 1)
  })

  test('plusieurs éléments au même point : côte à côte, comme le DXF', () => {
    const m = mise({
      pieces: [salle],
      points: [point('a', 'p1', 1, 15, 10)],
      elements: [element('e1', 'p1', 'a', 'menuiseries', 'fenetre', 'Fenêtre'), element('e2', 'p1', 'a', 'occultations', 'volet', 'Volet')],
    })
    assert.equal(m.symboles.length, 2)
    const [fenetre, volet] = m.symboles
    assert.equal(fenetre.code, 'fenetre')
    assert.equal(volet.code, 'volet')
    assert.equal(fenetre.yMm, volet.yMm)
    // Le second à droite du premier, sans chevauchement
    assert.ok(volet.xMm - volet.tailleMm.ancre[0] > fenetre.xMm - fenetre.tailleMm.ancre[0] + fenetre.tailleMm.largeur - 1e-6)
  })

  test('deux prises dites au même point : un symbole « ×2 »', () => {
    const m = mise({
      pieces: [salle],
      points: [point('a', 'p1', 1, 15, 10)],
      elements: [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise'), element('e2', 'p1', 'a', 'electricite', 'prise', 'Prise')],
    })
    assert.equal(m.symboles.length, 1)
    assert.equal(m.symboles[0].quantite, 2)
    assert.deepEqual(m.symboles[0].elementIds, ['e1', 'e2'])
  })

  test('élément sans type : losange, nom du calque ; élément sans point : absent', () => {
    const m = mise({
      pieces: [salle],
      points: [point('a', 'p1', 1, 15, 10)],
      elements: [element('e1', 'p1', 'a', 'desordres', null, 'Tache'), element('e2', 'p1', null, 'chauffage', 'radiateur', 'Radiateur')],
    })
    assert.equal(m.symboles.length, 1)
    assert.equal(m.symboles[0].code, null)
    assert.equal(m.symboles[0].nom, 'Désordres')
    assert.deepEqual(m.symboles[0].tailleMm, { largeur: 3, hauteur: 3, ancre: [1.5, 1.5] })
  })

  test('propositions : seulement si demandées', () => {
    const args = { pieces: [salle], points: [point('a', 'p1', 1, 15, 10)], elements: [element('e1', 'p1', 'a', 'desordres', 'fissure', 'Fissure', true)] }
    assert.equal(mise(args).symboles.length, 0)
    // Même si l'export les contient, la planche suit son réglage
    const elementsExport = elementsAExporter({ ...args, inclurePropositions: true })
    assert.equal(misePlanche({ niveau, pieces: args.pieces, elementsExport }).symboles.length, 0)
    const [s] = mise({ ...args, inclurePropositions: true }).symboles
    assert.equal(s.aValider, true)
    assert.equal(s.couleur, couleurCalque('desordres'))
    assert.equal(s.cle, 'fissure|0|1|1')
  })
})

describe('planche : légende', () => {
  const salle = piece('p1', rect(0, 0, 30, 20))
  const pts = [
    point('a', 'p1', 1, 5, 5), point('b', 'p1', 2, 10, 5), point('c', 'p1', 3, 15, 5),
    point('d', 'p1', 4, 20, 5), point('e', 'p1', 5, 25, 5),
  ]
  const els = [
    element('e1', 'p1', 'a', 'desordres', 'humidite', 'Humidité'),
    element('e2', 'p1', 'b', 'electricite', 'luminaire', 'Plafonnier'),
    element('e3', 'p1', 'c', 'electricite', 'prise', 'Prise double'),
    element('e4', 'p1', 'd', 'plomberie', 'lavabo', 'Lavabo'),
    element('e5', 'p1', 'e', 'desordres', 'fissure', 'Fissure', true),
  ]

  test('seulement les types présents, dans l’ordre des calques', () => {
    const { legende } = mise({ pieces: [salle], points: pts, elements: els })
    assert.equal(legende.titre, 'LÉGENDE – ÉTAT DES LIEUX RDC')
    assert.deepEqual(legende.groupes.map((g) => g.calque), ['plomberie', 'electricite', 'desordres'])
    const elec = legende.groupes[1]
    assert.equal(elec.libelle, 'Électricité')
    assert.equal(elec.couleur, couleurCalque('electricite'))
    assert.deepEqual(elec.entrees.map((e) => e.code), ['prise', 'luminaire'])
    assert.deepEqual(legende.groupes[2].entrees.map((e) => e.code), ['humidite'])
  })

  test('entrée ×n pour une prise multiple', () => {
    const { legende } = mise({ pieces: [salle], points: pts, elements: els })
    const prise = legende.groupes[1].entrees[0]
    assert.equal(prise.libelle, 'Prise de courant (×n : nb de prises)')
    assert.equal(prise.multiple, true)
    const simple = mise({ pieces: [salle], points: pts.slice(2, 3), elements: [element('e3', 'p1', 'c', 'electricite', 'prise', 'Prise')] })
    assert.equal(simple.legende.groupes[0].entrees[0].libelle, 'Prise de courant')
  })

  test('entrée « à valider » quand une proposition est sur la planche', () => {
    const sans = mise({ pieces: [salle], points: pts, elements: els })
    assert.ok(!sans.legende.groupes.some((g) => g.calque === 'a-valider'))
    const avec = mise({ pieces: [salle], points: pts, elements: els, inclurePropositions: true })
    const dernier = avec.legende.groupes.at(-1)
    assert.equal(dernier.calque, 'a-valider')
    assert.equal(dernier.couleur, COULEUR_PROPOSITION)
    assert.equal(dernier.entrees[0].proposition, true)
    assert.deepEqual(avec.legende.groupes.find((g) => g.calque === 'desordres').entrees.map((e) => e.code), ['fissure', 'humidite'])
  })

  test('note, cadre estimé', () => {
    const { legende } = mise({ pieces: [salle], points: pts, elements: els })
    assert.equal(legende.note, 'Relevé du 18/11/2026 (Rédacteur inventé). Positions relevées sur site, à vérifier.')
    // 3 groupes, 4 entrées : 7 lignes → deux colonnes de 150 mm
    assert.equal(legende.cadreMm.largeur, 150)
    assert.equal(legende.colonnes.length, 2)
    assert.deepEqual(legende.colonnes.flat().sort(), [0, 1, 2])
    const lignes = legende.colonnes.map((c) => c.reduce((s, i) => s + 1 + legende.groupes[i].entrees.length, 0))
    assert.equal(legende.cadreMm.hauteur, 9 + Math.max(...lignes) * 5 + 7)
    // Une seule colonne suffit : plus étroite
    const court = mise({ pieces: [salle], points: pts.slice(0, 1), elements: els.slice(0, 1) })
    assert.equal(court.legende.colonnes.length, 1)
    assert.ok(court.legende.cadreMm.largeur < 150)
    assert.equal(court.legende.cadreMm.hauteur, 9 + 2 * 5 + 7)
  })

  test('en haut à droite par défaut', () => {
    const { legende, zone } = mise({ pieces: [salle], points: pts, elements: els })
    assert.equal(legende.coin, 'haut-droite')
    assert.equal(legende.cadreMm.x + legende.cadreMm.largeur, zone.x + zone.largeur)
    assert.equal(legende.cadreMm.y, zone.y)
  })

  test('évite un bâtiment posé en haut à droite', () => {
    // Le bâtiment monte jusqu'en haut de la zone, dans le coin de droite
    const pieces = [piece('p1', rect(20, 10, 10, 12.5)), piece('p2', rect(0, 0, 4, 4))]
    const { legende, zone } = mise({ pieces, points: [point('a', 'p1', 1, 25, 20)], elements: [element('e1', 'p1', 'a', 'electricite', 'luminaire', 'Plafonnier')] })
    assert.equal(legende.coin, 'haut-gauche')
    assert.equal(legende.cadreMm.x, zone.x)
    assert.equal(legende.cadreMm.y, zone.y)
  })
})

describe('planche : cartouche', () => {
  test('textes et cases', () => {
    const m = mise({ pieces: [piece('p1', rect(0, 0, 60, 40))] })
    const c = m.cartouche
    assert.equal(c.affaire, 'Bureaux de l’essai')
    assert.equal(c.adresse, '2 allée Inventée Villefictive')
    assert.equal(c.code, '9902')
    assert.equal(c.echelle, '1:200')
    assert.equal(c.format, 'A3')
    assert.equal(c.phase, 'EDL')
    assert.equal(c.date, '18/11/2026')
    assert.equal(c.indice, '18/11/2026')
    assert.equal(c.numero, '10-1')
    assert.equal(c.titre, 'EXISTANT - Plan RDC')
    const cles = c.cases.map((k) => k.cle)
    assert.deepEqual(cles, ['affaire', 'code', 'echelle', 'format', 'phase', 'date', 'indice', 'numero', 'titre', 'logo'])
    // Toute la largeur utile, toute la hauteur du cartouche
    const gauche = Math.min(...c.cases.map((k) => k.x))
    const droite = Math.max(...c.cases.map((k) => k.x + k.largeur))
    proche(gauche, MARGE_PLANCHE)
    proche(droite, FORMAT_A3.largeur - MARGE_PLANCHE)
    for (const k of c.cases) {
      assert.ok(k.y >= c.cadreMm.y - 1e-9 && k.y + k.hauteur <= c.cadreMm.y + c.cadreMm.hauteur + 1e-9)
    }
    // Deux lignes de trois colonnes
    const parCle = Object.fromEntries(c.cases.map((k) => [k.cle, k]))
    assert.equal(parCle.code.y, parCle.echelle.y)
    assert.equal(parCle.phase.x, parCle.code.x)
    assert.ok(parCle.phase.y > parCle.code.y)
    assert.equal(parCle.date.valeur, '18/11/2026')
    assert.equal(parCle.affaire.detail, '2 allée Inventée Villefictive')
    assert.equal(parCle.numero.grand, true)
  })

  test('indice saisi, date en Date, textes hors latin nettoyés', () => {
    const m = misePlanche({ niveau: { id: 'n1', nom: 'R+1 ✓' }, affaire: { nom: 'Essai' }, date: new Date(2026, 0, 5), indice: 'B' })
    assert.equal(m.cartouche.date, '05/01/2026')
    assert.equal(m.cartouche.indice, 'B')
    assert.ok(!m.cartouche.titre.includes('✓'))
    assert.equal(dateCartouche(null), '')
    assert.equal(dateCartouche('2026-11-18T10:00:00Z'), '18/11/2026')
  })
})

test('même entrée → même sortie, données simples', () => {
  const args = {
    pieces: [piece('p1', rect(0, 0, 30, 20))],
    points: [point('a', 'p1', 1, 29.7, 10), point('b', 'p1', 2, 15, 10)],
    elements: [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise x2'), element('e2', 'p1', 'b', 'securite', 'detecteur-fumee', 'DAAF')],
  }
  const a = mise(args)
  const b = mise(args)
  assert.deepEqual(a, b)
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a)
})
