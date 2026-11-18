// État des lieux : import d'un DXF avec le traitement des calques (analyse
// par fichier, choix de Claude et choix à la main, valeur enregistrée) et
// repli sans la migration 081. Plans inventés : aucun plan réel dans le dépôt.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  analyserNiveaux, parCalque, decisionsParDefaut, simplifierNiveau, encoderVecteurs, decoderVecteurs,
} from '../src/modules/etude/etat-des-lieux/simplificationPlan.js'
import {
  CALQUES_EN_ATTENTE, appliquerProposition, choisirTraitement, valeurCalques, reprendreDecisions,
} from '../src/modules/etude/etat-des-lieux/calquesIaLogique.js'
import { colonnesVecteursManquantes, edlIndisponible } from '../src/modules/etude/etat-des-lieux/edlConstantes.js'

const trait = (calque, pts, ferme = false) => ({ calque, ferme, pts })

// 600 petits traits de 8 cm serrés au centimètre : un remplissage, au-delà du seuil des défauts
function remplissage(calque, x0, n = 600) {
  return Array.from({ length: n }, (_, i) => trait(calque, [[x0 + i * 0.01, 0], [x0 + i * 0.01, 0.08]]))
}

function fichier() {
  const rdc = {
    nom: 'RDC', garde: true,
    traits: [...remplissage('MURS', 0), trait('CONTOURS', [[0, 0], [10, 0], [10, 8]])],
    textes: [{ texte: 'Séjour', calque: 'TEXTES', pos: [2, 2], hauteur: 0.2 }],
    boite: [0, 0, 10, 8],
  }
  const etage = {
    nom: 'R+1', garde: false,
    traits: [...remplissage('TUILES', 0), trait('CONTOURS', [[0, 0], [4, 0]])],
    textes: [],
    boite: [0, 0, 10, 8],
  }
  return [rdc, etage]
}

function preparation() {
  const niveaux = fichier()
  const analyse = analyserNiveaux(niveaux)
  return { niveaux, analyse, decisions: decisionsParDefaut(analyse), calques: CALQUES_EN_ATTENTE }
}

describe('analyse des calques par fichier', () => {
  test('réunit les traits et textes de tous les étages proposés, cochés ou non', () => {
    const analyse = analyserNiveaux(fichier())
    const parNom = Object.fromEntries(analyse.map((c) => [c.nom, c]))
    assert.deepEqual(Object.keys(parNom).sort(), ['CONTOURS', 'MURS', 'TEXTES', 'TUILES'])
    assert.equal(parNom.CONTOURS.traits, 2)
    assert.equal(parNom.TEXTES.textes, 1)
    assert.equal(parNom.TUILES.traits, 600)
  })

  test('décisions par défaut communes aux étages', () => {
    const { decisions } = preparation()
    assert.equal(decisions.MURS, 'masse')
    assert.equal(decisions.TUILES, 'masquer-motif')
    assert.equal(decisions.CONTOURS, 'garder')
  })

  test('parCalque range les éléments par calque', () => {
    const m = parCalque([trait('A', [[0, 0], [1, 0]]), trait('B', [[0, 0], [1, 0]]), trait('A', [[0, 0], [2, 0]])])
    assert.equal(m.get('A').length, 2)
    assert.equal(m.get('B').length, 1)
  })

  // Traits 100 fois plus longs : le fichier lu avec la mauvaise unité n'a
  // plus aucun trait court, tout est « garder »
  const agrandi = () => fichier().map((n) => ({ ...n, traits: n.traits.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x * 100, y * 100]) })) }))

  test('mauvaise unité puis la bonne, sans Claude : les défauts sont recalculés', () => {
    const analyseFausse = analyserNiveaux(agrandi())
    const faux = { niveaux: agrandi(), analyse: analyseFausse, decisions: decisionsParDefaut(analyseFausse), calques: CALQUES_EN_ATTENTE }
    assert.equal(faux.decisions.MURS, 'garder')
    assert.equal(faux.decisions.TUILES, 'garder')
    const juste = reprendreDecisions(faux, analyserNiveaux(fichier()))
    assert.equal(juste.MURS, 'masse')
    assert.equal(juste.TUILES, 'masquer-motif')
    assert.equal(juste.CONTOURS, 'garder')
  })

  test('changement d’unité : les choix de Claude et de la main restent, le reste suit les défauts', () => {
    let prep = appliquerProposition(preparation(), { proposees: { CONTOURS: 'masquer' }, raisons: {} })
    prep = choisirTraitement(prep, 'TUILES', 'garder')
    prep = { ...prep, decisions: { ...prep.decisions, DISPARU: 'masquer' } }
    const apres = reprendreDecisions(prep, analyserNiveaux(agrandi()))
    assert.equal(apres.CONTOURS, 'masquer', 'choix de Claude')
    assert.equal(apres.TUILES, 'garder', 'choix à la main')
    assert.equal(apres.MURS, 'garder', 'défaut de la nouvelle analyse (était « masse »)')
    assert.ok(!('DISPARU' in apres))
  })
})

describe('choix des calques dans la fenêtre', () => {
  test('la réponse de Claude remplace les défauts', () => {
    const prep = appliquerProposition(preparation(), {
      proposees: { TUILES: 'masquer', CONTOURS: 'garder' }, raisons: { TUILES: 'Couverture en tuiles.' },
    })
    assert.equal(prep.decisions.TUILES, 'masquer')
    assert.equal(prep.decisions.MURS, 'masse')
    assert.equal(prep.calques.etat, 'claude')
    assert.equal(prep.calques.raisons.TUILES, 'Couverture en tuiles.')
  })

  test('un calque changé à la main avant la réponse n’est pas écrasé', () => {
    let prep = choisirTraitement(preparation(), 'TUILES', 'garder')
    prep = appliquerProposition(prep, { proposees: { TUILES: 'masquer', MURS: 'masquer-motif' }, raisons: {} })
    assert.equal(prep.decisions.TUILES, 'garder')
    assert.equal(prep.decisions.MURS, 'masquer-motif')
    assert.deepEqual(prep.calques.touches, ['TUILES'])
  })

  test('un calque inconnu ou un traitement invalide de Claude est ignoré', () => {
    const prep = appliquerProposition(preparation(), { proposees: { INCONNU: 'masquer', MURS: 'effacer' }, raisons: {} })
    assert.ok(!('INCONNU' in prep.decisions))
    assert.equal(prep.decisions.MURS, 'masse')
  })

  test('Claude indisponible : décisions inchangées, avertissement gardé', () => {
    const depart = choisirTraitement(preparation(), 'CONTOURS', 'masquer')
    const prep = appliquerProposition(depart, { proposees: {}, raisons: {}, avertissement: 'Pas de réseau.' })
    assert.equal(prep.decisions, depart.decisions)
    assert.equal(prep.calques.etat, 'defaut')
    assert.equal(prep.calques.avertissement, 'Pas de réseau.')
  })

  test('choisirTraitement refuse un traitement inconnu et ne double pas les calques touchés', () => {
    const depart = preparation()
    assert.equal(choisirTraitement(depart, 'MURS', 'effacer'), depart)
    const prep = choisirTraitement(choisirTraitement(depart, 'MURS', 'garder'), 'MURS', 'masquer')
    assert.equal(prep.decisions.MURS, 'masquer')
    assert.deepEqual(prep.calques.touches, ['MURS'])
    assert.deepEqual(depart.calques.touches, [], 'l’état de départ commun n’est pas modifié')
  })
})

describe('valeur enregistrée de la colonne calques', () => {
  test('source : claude, main ou defaut', () => {
    const claude = appliquerProposition(preparation(), { proposees: { TUILES: 'masquer' }, raisons: { TUILES: 'Tuiles.' } })
    assert.deepEqual(valeurCalques(claude), { decisions: claude.decisions, raisons: { TUILES: 'Tuiles.' }, source: 'claude' })
    assert.equal(valeurCalques(choisirTraitement(claude, 'MURS', 'garder')).source, 'main')
    assert.equal(valeurCalques(preparation()).source, 'defaut', 'Claude n’a pas encore répondu : défauts')
    const sansClaude = appliquerProposition(preparation(), { proposees: {}, raisons: {}, avertissement: 'Refus.' })
    assert.equal(valeurCalques(sansClaude).source, 'defaut')
  })

  test('la valeur est une copie : changer le fichier ensuite ne la modifie pas', () => {
    const prep = preparation()
    const valeur = valeurCalques(prep)
    prep.decisions.MURS = 'masquer'
    assert.equal(valeur.decisions.MURS, 'masse')
  })
})

describe('étage allégé enregistré', () => {
  test('le fichier vectoriel garde la boîte de l’étage entier, même calque masqué', () => {
    const [rdc] = fichier()
    const allege = simplifierNiveau(rdc, { MURS: 'masse', CONTOURS: 'masquer', TEXTES: 'garder' })
    assert.equal(allege.traits.length, 0)
    assert.ok(allege.masses.length >= 1)
    const lu = decoderVecteurs(encoderVecteurs({ ...allege, boite: rdc.boite }))
    assert.deepEqual(lu.boite, [0, 0, 10, 8])
    assert.equal(lu.textes.length, 1)
  })
})

describe('repli sans la migration 081', () => {
  test('colonne absente reconnue', () => {
    assert.ok(colonnesVecteursManquantes({ code: '42703', message: 'column "chemin_vecteurs" of relation "edl_niveaux" does not exist' }))
    assert.ok(colonnesVecteursManquantes({ code: 'PGRST204', message: "Could not find the 'calques' column of 'edl_niveaux' in the schema cache" }))
    assert.ok(colonnesVecteursManquantes({ message: 'column edl_niveaux.chemin_vecteurs does not exist' }))
  })

  test('autres erreurs non confondues', () => {
    assert.ok(!colonnesVecteursManquantes({ code: '23505', message: 'duplicate key value' }))
    assert.ok(!colonnesVecteursManquantes({ code: '42501', message: 'new row violates row-level security policy' }))
    assert.ok(!colonnesVecteursManquantes(null))
    assert.ok(!colonnesVecteursManquantes({ code: '42703', message: 'column "source_page" of relation "edl_niveaux" does not exist' }), 'autre colonne')
    assert.ok(!colonnesVecteursManquantes({ code: 'PGRST204', message: "Could not find the 'echelle' column of 'edl_niveaux' in the schema cache" }), 'autre colonne')
    assert.ok(!edlIndisponible({ code: '42703', message: 'column "calques" does not exist' }))
  })
})
