// État des lieux, relecture : symbole des planches à la place de la pastille
// pour un point typé, et « Relier » en touchant deux symboles. Pièces et
// points inventés.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  dessinPointRelecture, symboleEcran, TAILLE_SYMBOLE_PX, RAYON_DISQUE_PX, RAYON_PASTILLE_PX, TEXTE_COTE_PX,
  pxParMetreEcran, taillesPointEcran, texteCoteEcran,
} from '../src/modules/etude/etat-des-lieux/analyse/symbolesRelectureLogique.js'
import {
  TAILLES_SYMBOLE_MM, TAILLE_SYMBOLE_DEFAUT_MM, tailleSymboleMm, tailleSymboleMetres, boiteSymbole, SYMBOLES,
} from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'
import { libellePointRelecture } from '../src/modules/etude/etat-des-lieux/analyse/relectureAnalyseLogique.js'
import { orientationElement, boitePrimitives } from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'
import { couleurCalque } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'
import { debutRelier, toucherRelier, consigneMode } from '../src/modules/etude/etat-des-lieux/visite/tracesVisiteLogique.js'

const rect = (x, y, l, h) => [[x, y], [x + l, y], [x + l, y + h], [x, y + h]]
const chambre = { id: 'ch', contour: rect(0, 0, 4, 3) }
const pt = (id, numero, type, x, y) => ({ id, piece_id: 'ch', numero, type, x, y })
const el = (point_id, type, calque, a_valider = false, libelle = '') => ({ id: `e-${point_id}-${type}`, point_id, type, calque, a_valider, libelle })

describe('ce que la relecture dessine pour un point', () => {
  test('point sans type ni élément typé : la pastille numérotée', () => {
    assert.deepEqual(dessinPointRelecture(pt('p5', 5, null, 2, 1.5), { elements: [], piece: chambre }), { sorte: 'pastille', numero: 5 })
    // Élément sans type (désordre non classé) : pastille aussi
    assert.equal(dessinPointRelecture(pt('p5', 5, null, 2, 1.5), { elements: [el('p5', null, 'desordres')] }).sorte, 'pastille')
  })

  test('type de l’élément validé, couleur de sa famille, angle des planches', () => {
    const p = pt('p3', 3, null, 0.1, 1.5)
    const d = dessinPointRelecture(p, { elements: [el('p3', 'applique', 'electricite', true), el('p3', 'interrupteur', 'electricite')], piece: chambre })
    assert.equal(d.sorte, 'symbole')
    assert.equal(d.code, 'interrupteur')
    assert.equal(d.couleur, couleurCalque('electricite'))
    // Contre le mur de gauche : tourné comme sur la planche
    assert.equal(d.angle, orientationElement({ type: 'interrupteur', x: 0.1, y: 1.5 }, chambre))
    assert.equal(d.proposition, false)
    assert.equal(d.numero, 3)
  })

  test('seulement une proposition : symbole marqué à valider ; type choisi au geste sans élément : pas de marque', () => {
    const prop = dessinPointRelecture(pt('p4', 4, null, 2, 2.9), { elements: [el('p4', 'radiateur', 'chauffage', true)], piece: chambre })
    assert.equal(prop.code, 'radiateur')
    assert.equal(prop.couleur, couleurCalque('chauffage'))
    assert.equal(prop.proposition, true)
    const geste = dessinPointRelecture(pt('p6', 6, 'prise', 3.9, 1), { elements: [], piece: chambre })
    assert.equal(geste.code, 'prise')
    assert.equal(geste.proposition, false)
  })
})

describe('symbole en pixels d’écran', () => {
  test('taille constante quel que soit l’angle, y vers le bas', () => {
    for (const angle of [0, 90, -37]) {
      const e = symboleEcran('radiateur', angle)
      const xs = []
      const ys = []
      for (const x of e) {
        if (x.type === 'line') { xs.push(x.x1, x.x2); ys.push(x.y1, x.y2) }
        if (x.points) for (const q of x.points.split(' ')) { const [a, b] = q.split(',').map(Number); xs.push(a); ys.push(b) }
      }
      const etendue = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      assert.ok(etendue <= TAILLE_SYMBOLE_PX * 1.42 + 0.1, `${angle} : ${etendue}`)
      assert.ok(etendue >= TAILLE_SYMBOLE_PX * 0.7, `${angle} : ${etendue}`)
    }
  })

  test('mêmes primitives que le catalogue : cercle plein gardé, arc en chemin', () => {
    const detecteur = symboleEcran('detecteur-fumee', 0)
    assert.ok(detecteur.some((e) => e.type === 'circle' && e.plein))
    const interrupteur = symboleEcran('interrupteur', 0)
    assert.deepEqual(interrupteur.map((e) => e.type), ['circle', 'line', 'line'])
    // Le trait monte à droite sur le plan : vers le haut de l'écran
    const trait = interrupteur[1]
    assert.ok(trait.x2 > trait.x1 && trait.y2 < trait.y1)
    assert.deepEqual(symboleEcran('inconnu', 0), [])
    assert.ok(boitePrimitives([{ cercle: [0, 0, 1] }]))
  })
})

describe('« Relier » en touchant deux symboles', () => {
  const p3 = pt('p3', 3, null, 0.1, 1.5)
  const p4 = pt('p4', 4, null, 2, 2.9)
  const p6 = pt('p6', 6, 'prise', 3.9, 1)
  const elements = [el('p3', 'interrupteur', 'electricite', false, 'Interrupteur à l’entrée de la pièce'), el('p4', 'applique', 'electricite', true)]
  const points = [p3, p4, p6]

  test('panneau du point : libellé de l’élément, sinon le type, sinon « sans type »', () => {
    assert.equal(libellePointRelecture(p3, elements), 'P3 · Interrupteur à l’entrée de la pièce')
    assert.match(libellePointRelecture(p4, elements), /^P4 · /)
    assert.equal(libellePointRelecture(pt('p9', 9, null, 1, 1), elements), 'P9 · sans type')
  })

  test('interrupteur puis luminaire : liaison dans l’ordre de la base ; incompatible ou existante : rien', () => {
    const mode = debutRelier(p3, elements)
    assert.equal(consigneMode(mode), 'Touchez le luminaire à relier')
    const ok = toucherRelier(mode, p4, { points, traces: [], elements })
    assert.deepEqual([ok.action, ok.interrupteur.id, ok.luminaire.id], ['creer', 'p3', 'p4'])
    const prise = toucherRelier(mode, p6, { points, traces: [], elements })
    assert.equal(prise.action, 'refus')
    assert.match(consigneMode(prise.mode), /P6 \(prise de courant\) n’est pas un luminaire/)
    const deja = toucherRelier(mode, p4, { points, traces: [{ sorte: 'commande', point_a: 'p3', point_b: 'p4' }], elements })
    assert.match(deja.mode.raison, /déjà reliés/)
    assert.equal(toucherRelier(mode, null, { points, traces: [], elements }).action, 'refus')
    assert.equal(debutRelier(p6, elements), null)
  })
})

describe('tailles des symboles : le tableau de l’exemple de l’agence', () => {
  test('les tailles relevées au 1/100, 3,8 mm pour les autres symboles fixes', () => {
    assert.deepEqual(TAILLES_SYMBOLE_MM, { interrupteur: 3.2, rj45: 3.2, prise: 3.1, 'detecteur-fumee': 3.8, applique: 4.1, dalle: 4.5 })
    assert.equal(TAILLE_SYMBOLE_DEFAUT_MM, 3.8)
    assert.equal(tailleSymboleMm('thermostat'), 3.8)
    assert.equal(tailleSymboleMm('inconnu'), null)
  })

  test('chaque code du tableau a un symbole à taille fixe', () => {
    for (const code of Object.keys(TAILLES_SYMBOLE_MM)) {
      assert.ok(SYMBOLES[code], code)
      assert.equal(SYMBOLES[code].taille, 'fixe', code)
    }
  })

  test('dans le plan : mm du 1/100 → mètres ; taille réelle gardée', () => {
    assert.equal(tailleSymboleMetres('interrupteur'), 0.32)
    assert.equal(tailleSymboleMetres('dalle'), 0.45)
    assert.equal(tailleSymboleMm('reglette'), null)
    const b = boiteSymbole('reglette')
    assert.equal(tailleSymboleMetres('reglette'), Math.max(b.largeur, b.hauteur))
    assert.equal(tailleSymboleMetres('inconnu'), null)
  })
})

describe('tailles à l’écran : à l’échelle du plan', () => {
  // 50 px d'écran par mètre (le calque est à la taille de l'écran)
  const enCalque = ([x, y]) => [100 + 50 * x, 400 - 50 * y]

  test('pixels d’écran par mètre lus sur la conversion mètres → calque', () => {
    assert.equal(pxParMetreEcran(enCalque), 50)
    assert.equal(pxParMetreEcran(([x, y]) => [x * 0.5 * 3, y]), 1.5)
  })

  test('sans échelle fiable (pxParMetre absent : NaN) : null', () => {
    assert.equal(pxParMetreEcran(() => [NaN, NaN]), null)
    assert.equal(pxParMetreEcran(() => [0, 0]), null)
    assert.equal(pxParMetreEcran(null), null)
  })

  test('symbole, disque de 1,5 fois, pastille de 0,35 m', () => {
    const t = taillesPointEcran('interrupteur', 50)
    assert.ok(Math.abs(t.symbole - 16) < 1e-9)
    assert.ok(Math.abs(t.rayonDisque - 12) < 1e-9)
    assert.ok(Math.abs(t.rayonPastille - 8.75) < 1e-9)
    // Le double de pixels par mètre (zoom ×2) : tout double
    const z = taillesPointEcran('interrupteur', 100)
    assert.ok(Math.abs(z.symbole - 32) < 1e-9 && Math.abs(z.rayonDisque - 24) < 1e-9)
  })

  test('un appareil à taille réelle garde sa taille, sous le disque d’un symbole de 3,8 mm', () => {
    const b = boiteSymbole('baignoire')
    const t = taillesPointEcran('baignoire', 50)
    assert.ok(Math.abs(t.symbole - Math.max(b.largeur, b.hauteur) * 50) < 1e-9)
    assert.ok(Math.abs(t.rayonDisque - (1.5 * 0.38 * 50) / 2) < 1e-9)
  })

  test('sans échelle : les tailles d’écran d’avant', () => {
    assert.deepEqual(taillesPointEcran('prise', null), { symbole: TAILLE_SYMBOLE_PX, rayonDisque: RAYON_DISQUE_PX, rayonPastille: RAYON_PASTILLE_PX })
    assert.equal(texteCoteEcran(null), TEXTE_COTE_PX)
  })

  test('valeur d’une cote : 0,22 m du plan', () => {
    assert.ok(Math.abs(texteCoteEcran(50) - 11) < 1e-9)
  })
})
