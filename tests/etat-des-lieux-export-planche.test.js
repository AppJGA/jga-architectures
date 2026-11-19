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
import {
  POLICE_MULTIPLE_MM, PX_PAR_MM, TRAIT, dessinerLegende, dessinerPlanche, dessinerSymbole, taillePlanchePx, tailleImageLegende,
  tailleImageSymbole,
} from '../src/modules/etude/etat-des-lieux/export/dessinPlancheEdl.js'

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

// ─── Dessin (contexte enregistreur) ─────────────────────────────────────────

// Contexte 2D qui note chaque appel avec les styles du moment et ses
// coordonnées ramenées au canevas (translate et scale suivis ; rotate ne sert
// qu'autour d'un texte écrit en (0, 0))
function enregistreur() {
  const appels = []
  let t = { k: 1, dx: 0, dy: 0 }
  const pile = []
  const abs = (x, y) => [t.dx + x * t.k, t.dy + y * t.k]
  const cible = {}
  const ctx = new Proxy(cible, {
    get: (c, nom) => {
      if (nom in c) return c[nom]
      return (...args) => {
        if (nom === 'save') pile.push({ ...t })
        else if (nom === 'restore') t = pile.pop() ?? { k: 1, dx: 0, dy: 0 }
        else if (nom === 'translate') t = { ...t, dx: t.dx + args[0] * t.k, dy: t.dy + args[1] * t.k }
        else if (nom === 'scale') t = { ...t, k: t.k * args[0] }
        const pts = []
        if (['moveTo', 'lineTo', 'arc'].includes(nom)) pts.push(abs(args[0], args[1]))
        if (nom === 'arc') pts.push(abs(args[0] - args[2], args[1] - args[2]), abs(args[0] + args[2], args[1] + args[2]))
        if (['fillRect', 'strokeRect', 'rect'].includes(nom)) pts.push(abs(args[0], args[1]), abs(args[0] + args[2], args[1] + args[3]))
        if (nom === 'fillText') pts.push(abs(args[1], args[2]))
        if (nom === 'drawImage') pts.push(abs(args[1], args[2]), abs(args[1] + args[3], args[2] + args[4]))
        appels.push({ nom, args, pts, strokeStyle: c.strokeStyle, fillStyle: c.fillStyle, font: c.font, lineWidth: c.lineWidth })
        return nom === 'measureText' ? { width: 10 } : undefined
      }
    },
    set: (c, nom, valeur) => { c[nom] = valeur; return true },
  })
  return { ctx, appels }
}

const textes = (appels) => appels.filter((a) => a.nom === 'fillText').map((a) => a.args[0])
const boiteDes = (appels) => {
  const pts = appels.flatMap((a) => a.pts)
  return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }
}

describe('planche : dessin', () => {
  const salle = piece('p1', rect(0, 0, 30, 20))
  const pts = [point('a', 'p1', 1, 15, 10), point('b', 'p1', 2, 29.7, 10), point('c', 'p1', 3, 5, 5)]
  const els = [
    element('e1', 'p1', 'a', 'electricite', 'luminaire', 'Plafonnier'),
    element('e2', 'p1', 'b', 'electricite', 'prise', 'Prise triple'),
    element('e3', 'p1', 'c', 'desordres', 'fissure', 'Fissure', true),
  ]
  const vecteurs = {
    traits: [{ pts: [[0, 0], [30, 0], [30, 20], [0, 20]], ferme: true, boite: [0, 0, 30, 20] }],
    masses: [{ calque: 'MUR', anneaux: [[[0, 0], [0.2, 0], [0.2, 20], [0, 20]]], boite: [0, 0, 0.2, 20] }],
    textes: [{ texte: 'SÉJOUR', pos: [10, 10], hauteur: 0.3, calque: 'TXT' }],
  }

  test('symboles à leur position, absents sur demande', () => {
    const m = mise({ pieces: [salle], points: pts, elements: els, inclurePropositions: true })
    const p = PX_PAR_MM
    const { ctx, appels } = enregistreur()
    dessinerPlanche(ctx, m, { vecteurs, avecLegende: false })
    const bleu = couleurCalque('electricite')
    for (const code of ['luminaire', 'prise']) {
      const s = m.symboles.find((x) => x.code === code)
      // Les traits de ce symbole : ceux de sa couleur près de son point
      const siens = appels.filter((a) => ['moveTo', 'lineTo', 'arc'].includes(a.nom) && a.strokeStyle === bleu
        && Math.hypot(a.pts[0][0] - s.xMm * p, a.pts[0][1] - s.yMm * p) < 10 * p)
      assert.ok(siens.length, `${code} non dessiné`)
      const b = boiteDes(siens)
      // La boîte tracée est celle de la mise, posée par son ancre
      proche(b.x0, (s.xMm - s.tailleMm.ancre[0]) * p, 1)
      proche(b.y0, (s.yMm - s.tailleMm.ancre[1]) * p, 1)
      proche(b.x1 - b.x0, s.tailleMm.largeur * p, 1)
      proche(b.y1 - b.y0, s.tailleMm.hauteur * p, 1)
      // Centre attendu ± 1 px
      proche((b.x0 + b.x1) / 2, (s.xMm - s.tailleMm.ancre[0] + s.tailleMm.largeur / 2) * p, 1)
      proche((b.y0 + b.y1) / 2, (s.yMm - s.tailleMm.ancre[1] + s.tailleMm.hauteur / 2) * p, 1)
    }
    assert.ok(textes(appels).includes('×3'), '« ×3 » non écrit pour la prise triple')
    // Proposition : sa famille, et un cercle pointillé de la couleur des propositions
    assert.ok(appels.some((a) => a.strokeStyle === couleurCalque('desordres') && a.nom === 'stroke'))
    assert.ok(appels.some((a) => a.nom === 'arc' && a.strokeStyle === COULEUR_PROPOSITION))
    assert.ok(appels.some((a) => a.nom === 'setLineDash' && a.args[0].length === 2))

    const sans = enregistreur()
    dessinerPlanche(sans.ctx, m, { vecteurs, avecSymboles: false, avecLegende: false })
    assert.ok(!sans.appels.some((a) => a.strokeStyle === bleu && ['moveTo', 'lineTo', 'arc'].includes(a.nom)))
    assert.ok(!textes(sans.appels).includes('×3'))
  })

  test('plan existant sans contour de pièce ni désignation, coupé à sa zone', () => {
    const m = mise({ pieces: [salle], points: pts, elements: els })
    const { ctx, appels } = enregistreur()
    dessinerPlanche(ctx, m, { vecteurs })
    // Le texte du plan d'origine, pas la désignation de la pièce
    assert.ok(textes(appels).includes('SÉJOUR'))
    assert.ok(!textes(appels).some((t) => String(t).includes('Pièce p1')))
    // Aucun contour de pièce en couleur (l'orange du plan du rapport)
    assert.ok(!appels.some((a) => a.nom === 'stroke' && a.strokeStyle === '#E8602C'))
    assert.ok(appels.some((a) => a.nom === 'clip'))
    // Le plan au 1/100 : le trait du contour du bâtiment fait 300 mm de large
    const traits = appels.filter((a) => a.nom === 'lineTo' && a.strokeStyle === '#3A3633')
    const b = boiteDes(traits)
    proche(b.x1 - b.x0, 300 * PX_PAR_MM, 1)
    const [gauche, haut] = versMmPlanche(m.transform, [0, 20])
    const premier = appels.find((a) => a.nom === 'moveTo' && a.strokeStyle === '#3A3633')
    // Premier point du contour (0, 0) : en bas à gauche du bâtiment
    proche(premier.pts[0][0], gauche * PX_PAR_MM, 1)
    proche(premier.pts[0][1], (haut + 200) * PX_PAR_MM, 1)
  })

  test('sans vecteurs : l’image de l’étage placée par son cadrage', () => {
    const m = mise({ pieces: [salle] })
    const { ctx, appels } = enregistreur()
    const image = { width: 300, height: 200 }
    dessinerPlanche(ctx, m, { fond: { image, niveauCadrage: { x0: 0, y0: 0, x1: 30, y1: 20 } } })
    const d = appels.find((a) => a.nom === 'drawImage' && a.args[0] === image)
    assert.ok(d)
    const [x, y] = versMmPlanche(m.transform, [0, 20])
    proche(d.args[1], x * PX_PAR_MM, 1)
    proche(d.args[2], y * PX_PAR_MM, 1)
    proche(d.args[3], 300 * PX_PAR_MM, 1)
  })

  test('légende et cartouche écrits ; légende absente sur demande', () => {
    const m = mise({ pieces: [salle], points: pts, elements: els, inclurePropositions: true })
    const { ctx, appels } = enregistreur()
    dessinerPlanche(ctx, m, { vecteurs })
    const ecrits = textes(appels)
    assert.ok(ecrits.includes('LÉGENDE – ÉTAT DES LIEUX RDC'))
    assert.ok(ecrits.includes('Électricité'))
    assert.ok(ecrits.includes('Prise de courant (×n : nb de prises)'))
    assert.ok(ecrits.includes(m.legende.note))
    assert.ok(ecrits.includes('EXISTANT - Plan RDC'))
    for (const t of ['Bureaux de l’essai', '9902', '1:100', 'A3', 'EDL', '18/11/2026', '10-1', 'JGA']) assert.ok(ecrits.includes(t), `« ${t} » absent du cartouche`)
    // Titre de la légende en blanc gras sur le bandeau noir
    const titre = appels.find((a) => a.nom === 'fillText' && a.args[0] === m.legende.titre)
    assert.equal(titre.fillStyle, '#FFFFFF')
    assert.match(titre.font, /^bold [\d.]+px Arial, Helvetica, sans-serif$/)
    const c = m.legende.cadreMm
    assert.ok(appels.some((a) => a.nom === 'strokeRect' && Math.abs(a.args[0] - c.x * PX_PAR_MM) < 1e-6 && Math.abs(a.args[2] - c.largeur * PX_PAR_MM) < 1e-6))
    // L'entrée « à valider » : le cercle pointillé des propositions
    assert.ok(ecrits.includes('Proposition de l’analyse, à valider'))

    const sans = enregistreur()
    dessinerPlanche(sans.ctx, m, { vecteurs, avecLegende: false })
    assert.ok(!textes(sans.appels).includes(m.legende.titre))
    assert.ok(textes(sans.appels).includes('EXISTANT - Plan RDC'))
  })

  test('logo fourni : posé dans sa case, sans « JGA »', () => {
    const m = mise({ pieces: [salle] })
    const { ctx, appels } = enregistreur()
    const logo = { width: 400, height: 200 }
    dessinerPlanche(ctx, m, { logo })
    const d = appels.find((a) => a.nom === 'drawImage' && a.args[0] === logo)
    const k = m.cartouche.cases.find((x) => x.cle === 'logo')
    assert.ok(d)
    assert.ok(d.args[1] >= k.x * PX_PAR_MM && d.args[1] + d.args[3] <= (k.x + k.largeur) * PX_PAR_MM + 1e-6)
    proche(d.args[3] / d.args[4], 2)
    assert.ok(!textes(appels).includes('JGA'))
  })

  test('aucun appel hors du canevas', () => {
    const m = mise({ pieces: [salle], points: pts, elements: els, inclurePropositions: true })
    const { largeur, hauteur } = taillePlanchePx(m)
    assert.equal(largeur, Math.round(420 * PX_PAR_MM))
    assert.equal(hauteur, Math.round(297 * PX_PAR_MM))
    // Moins de 16 Mpx (iPad)
    assert.ok(largeur * hauteur <= 16_000_000)
    const { ctx, appels } = enregistreur()
    dessinerPlanche(ctx, m, { vecteurs })
    const pts2 = appels.flatMap((a) => a.pts)
    assert.ok(pts2.length > 50)
    for (const [x, y] of pts2) {
      assert.ok(x >= -1e-6 && x <= largeur + 1e-6 && y >= -1e-6 && y <= hauteur + 1e-6, `(${x}, ${y}) hors du canevas`)
    }
  })

  test('symbole seul : losange sans type, « ×n », police Arial', () => {
    const { ctx, appels } = enregistreur()
    const s = { code: null, angle: 0, quantite: 1, aValider: false, couleur: '#8E44AD', tailleMm: { largeur: 3, hauteur: 3, ancre: [1.5, 1.5] } }
    dessinerSymbole(ctx, s, { centrePx: [100, 100], pxParMm: 10 })
    const b = boiteDes(appels.filter((a) => ['moveTo', 'lineTo'].includes(a.nom)))
    assert.deepEqual(b, { x0: 85, y0: 85, x1: 115, y1: 115 })
    assert.ok(appels.some((a) => a.nom === 'fill' && a.fillStyle === '#8E44AD'))

    const prise = mise({ pieces: [salle], points: [point('a', 'p1', 1, 15, 10)], elements: [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise x4')] }).symboles[0]
    const r = enregistreur()
    dessinerSymbole(r.ctx, prise, { centrePx: [200, 200], pxParMm: 10 })
    const ecrit = r.appels.find((a) => a.nom === 'fillText')
    assert.equal(ecrit.args[0], '×4')
    assert.equal(ecrit.font, `bold ${POLICE_MULTIPLE_MM * 10}px Arial, Helvetica, sans-serif`)
    assert.equal(ecrit.fillStyle, prise.couleur)
    // À droite du symbole, non tourné
    assert.ok(ecrit.args[1] > 200 + (prise.tailleMm.largeur - prise.tailleMm.ancre[0]) * 10)
    assert.ok(!r.appels.some((a) => a.nom === 'rotate'))
    // Trait de 0,35 mm
    assert.ok(r.appels.some((a) => a.nom === 'stroke' && Math.abs(a.lineWidth - 3.5) < 1e-9 && a.strokeStyle === prise.couleur))
  })

  test('texte d’un symbole tourné : toujours lisible', () => {
    // RJ45 contre le mur du haut : tourné de 180°, son « RJ » reste à l'endroit
    const m = mise({ pieces: [salle], points: [point('a', 'p1', 1, 15, 19.7)], elements: [element('e1', 'p1', 'a', 'electricite', 'rj45', 'RJ45')] })
    const [s] = m.symboles
    assert.equal(Math.abs(s.angle), 180)
    const { ctx, appels } = enregistreur()
    dessinerSymbole(ctx, s, { centrePx: [500, 500] })
    const rot = appels.find((a) => a.nom === 'rotate')
    assert.ok(Math.abs(rot.args[0]) < 1e-9)
    assert.ok(textes(appels).includes('RJ'))
  })

  describe('ancre de la mise pour un symbole non carré tourné (image du Word)', () => {
    // Goulotte et radiateur (muraux) contre le mur de droite : un quart de
    // tour ; réglette (non murale) dans une pièce tournée de 30°
    const tournee = (deg) => {
      const a = (deg * Math.PI) / 180
      return rect(0, 0, 30, 20).map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])
    }
    const cas = [
      ['goulotte', 'electricite', salle, [29.8, 10], 90],
      ['radiateur', 'chauffage', salle, [29.8, 10], 90],
      ['reglette', 'electricite', piece('p1', tournee(30)), [5, 12], 30],
    ]
    for (const [code, calque, pc, [x, y], angle] of cas) {
      test(`${code} tourné de ${angle}° : le point d’insertion tombe sur (xMm, yMm)`, () => {
        const m = mise({ pieces: [pc], points: [point('a', 'p1', 1, x, y)], elements: [element('e1', 'p1', 'a', calque, code, code)] })
        const [s] = m.symboles
        proche(s.angle, angle, 1e-6)
        if (angle === 90) assert.ok(s.tailleMm.hauteur > s.tailleMm.largeur, 'tourné : plus haut que large')
        const p = 10
        const { ctx, appels } = enregistreur()
        dessinerSymbole(ctx, s, { centrePx: [s.xMm * p, s.yMm * p], pxParMm: p })
        const b = boiteDes(appels.filter((a) => ['moveTo', 'lineTo'].includes(a.nom)))
        // La boîte de la mise posée en (xMm − ancre[0], yMm − ancre[1]) recouvre le dessin
        proche(b.x0, (s.xMm - s.tailleMm.ancre[0]) * p, 1)
        proche(b.y0, (s.yMm - s.tailleMm.ancre[1]) * p, 1)
        proche(b.x1, (s.xMm - s.tailleMm.ancre[0] + s.tailleMm.largeur) * p, 1)
        proche(b.y1, (s.yMm - s.tailleMm.ancre[1] + s.tailleMm.hauteur) * p, 1)

        // Même chose dans l'image seule : dessinée à `centre`, posée par lui
        const img = tailleImageSymbole(s, p)
        const r = enregistreur()
        dessinerSymbole(r.ctx, s, { centrePx: img.centre, pxParMm: p })
        const bi = boiteDes(r.appels.filter((a) => ['moveTo', 'lineTo'].includes(a.nom)))
        assert.ok(bi.x0 >= 0 && bi.y0 >= 0 && bi.x1 <= img.largeur && bi.y1 <= img.hauteur)
        proche(bi.x0 - img.centre[0], -s.tailleMm.ancre[0] * p, 1)
        proche(bi.y0 - img.centre[1], -s.tailleMm.ancre[1] * p, 1)
      })
    }
  })

  test('tailleImageSymbole : « ×n » et cercle de proposition compris', () => {
    const p = 10
    const base = mise({ pieces: [salle], points: [point('a', 'p1', 1, 15, 10)], elements: [element('e1', 'p1', 'a', 'electricite', 'prise', 'Prise')] }).symboles[0]
    const simple = tailleImageSymbole(base, p)
    // La boîte du symbole et un peu d'air pour le trait
    assert.ok(simple.largeur >= base.tailleMm.largeur * p && simple.largeur <= (base.tailleMm.largeur + 1.5) * p)
    assert.ok(simple.centre[0] >= base.tailleMm.ancre[0] * p && simple.centre[1] >= base.tailleMm.ancre[1] * p)
    const triple = tailleImageSymbole({ ...base, quantite: 3 }, p)
    assert.ok(triple.largeur > simple.largeur + 2 * p)
    assert.deepEqual(triple.centre, simple.centre)
    // Le « ×3 » dessiné tient dans l'image
    const r = enregistreur()
    dessinerSymbole(r.ctx, { ...base, quantite: 3 }, { centrePx: triple.centre, pxParMm: p })
    const ecrit = r.appels.find((a) => a.nom === 'fillText')
    assert.ok(ecrit.args[1] + 2 * 0.65 * POLICE_MULTIPLE_MM * p <= triple.largeur)
    // Proposition : le cercle pointillé tient dans l'image
    const prop = tailleImageSymbole({ ...base, aValider: true }, p)
    const rp = enregistreur()
    dessinerSymbole(rp.ctx, { ...base, aValider: true }, { centrePx: prop.centre, pxParMm: p })
    const bp = boiteDes(rp.appels.filter((a) => a.nom === 'arc' && a.strokeStyle === COULEUR_PROPOSITION))
    assert.ok(bp.x0 >= 0 && bp.y0 >= 0 && bp.x1 <= prop.largeur && bp.y1 <= prop.hauteur)
    assert.ok(Number.isInteger(prop.largeur) && Number.isInteger(prop.hauteur))
  })

  test('dessinerLegende à une autre origine', () => {
    const m = mise({ pieces: [salle], points: pts, elements: els })
    const { ctx, appels } = enregistreur()
    dessinerLegende(ctx, m.legende, { origineMm: [0, 0], pxParMm: 10 })
    const cadre = appels.filter((a) => a.nom === 'strokeRect').at(-1)
    assert.deepEqual(cadre.args, [0, 0, m.legende.cadreMm.largeur * 10, m.legende.cadreMm.hauteur * 10])
    const b = boiteDes(appels)
    assert.ok(b.x0 >= -1e-6 && b.y0 >= -1e-6 && b.x1 <= m.legende.cadreMm.largeur * 10 + 1e-6 && b.y1 <= m.legende.cadreMm.hauteur * 10 + 1e-6)
  })

  test('tailleImageLegende : le cadre et son trait tiennent dans l’image, posée par `origine`', () => {
    const m = mise({ pieces: [salle], points: pts, elements: els })
    const p = 10
    const img = tailleImageLegende(m.legende, p)
    assert.ok(Number.isInteger(img.largeur) && Number.isInteger(img.hauteur))
    const { ctx, appels } = enregistreur()
    dessinerLegende(ctx, m.legende, { origineMm: img.origine.map((v) => v / p), pxParMm: p })
    const cadre = appels.filter((a) => a.nom === 'strokeRect').at(-1)
    // Le trait du cadre déborde de moitié : il reste dans l'image
    const demiTrait = (TRAIT.cadreLegende / 2) * p
    assert.ok(cadre.args[0] - demiTrait >= 0 && cadre.args[1] - demiTrait >= 0)
    assert.ok(cadre.args[0] + cadre.args[2] + demiTrait <= img.largeur && cadre.args[1] + cadre.args[3] + demiTrait <= img.hauteur)
    // Posée en (cadreMm − origine), l'image recouvre la légende de la planche
    proche(cadre.args[0], img.origine[0])
    proche(cadre.args[1], img.origine[1])
  })
})
