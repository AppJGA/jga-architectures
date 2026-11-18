// État des lieux, lot 3 (analyse) : passages dans une pièce, frise, demande
// à Claude et lecture de sa réponse, complétude de la fiche. Journal,
// points et phrases inventés : aucune transcription réelle dans le dépôt.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  MODELE_ANALYSE, SCHEMA_ANALYSE, CONSIGNES_ANALYSE, LIGNES_MAX, DELAI_ABANDON_MS, RUBRIQUES_FICHE,
  intervallesPiece, aAnalyser, heureFrise, friseDePiece, construireDemandeAnalyse, erreurDemandeAnalyse,
  lireAnalyse, completudeFiche, etatAnalysePiece,
} from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js'
import { CALQUES_DE_POINT } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'

// 18 novembre 2026 : heure d'hiver, Paris = UTC + 1
const H = (hms) => `2026-11-18T${hms}.000Z`
const ms = (hms) => Date.parse(H(hms))
let n = 0
const ev = (type, hms, champs = {}) => ({ id: `e${++n}`, visite_id: 'v1', type, niveau_id: 'n1', piece_id: null, point_id: null, le: H(hms), detail: {}, ...champs })
const dans = (type, hms, champs = {}) => ev(type, hms, { piece_id: 'salon', ...champs })

describe('intervallesPiece', () => {
  test('entrée puis sortie', () => {
    const iv = intervallesPiece([ev('debut', '09:00:00'), dans('entree', '09:01:00'), dans('sortie', '09:05:00')], 'salon')
    assert.equal(iv.length, 1)
    assert.deepEqual([iv[0].debut, iv[0].fin, iv[0].clos, iv[0].motif], [ms('09:01:00'), ms('09:05:00'), true, 'sortie'])
  })

  test('plusieurs entrées, dans plusieurs visites', () => {
    const evts = [
      dans('entree', '09:01:00'), dans('sortie', '09:05:00'),
      dans('entree', '09:20:00'), dans('sortie', '09:22:00'),
      dans('entree', '14:00:00', { visite_id: 'v2' }), dans('sortie', '14:03:00', { visite_id: 'v2' }),
    ]
    const iv = intervallesPiece(evts, 'salon')
    assert.deepEqual(iv.map((i) => [i.debut, i.fin, i.visiteId]), [
      [ms('09:01:00'), ms('09:05:00'), 'v1'], [ms('09:20:00'), ms('09:22:00'), 'v1'], [ms('14:00:00'), ms('14:03:00'), 'v2'],
    ])
  })

  test('sortie manquante : l’entrée dans une autre pièce ferme le passage', () => {
    const iv = intervallesPiece([dans('entree', '09:01:00'), ev('entree', '09:04:00', { piece_id: 'cuisine' })], 'salon')
    assert.deepEqual([iv[0].fin, iv[0].clos, iv[0].motif], [ms('09:04:00'), true, 'ailleurs'])
  })

  test('sortie manquante : la fin de la visite ferme le passage', () => {
    const iv = intervallesPiece([dans('entree', '09:01:00'), dans('point', '09:02:00'), ev('fin', '09:30:00')], 'salon')
    assert.deepEqual([iv[0].fin, iv[0].clos, iv[0].motif], [ms('09:30:00'), true, 'fin'])
  })

  test('sortie manquante, rien après : jusqu’au dernier événement, pas clos', () => {
    const iv = intervallesPiece([dans('entree', '09:01:00'), dans('point', '09:03:00')], 'salon')
    assert.deepEqual([iv[0].fin, iv[0].clos, iv[0].motif, iv[0].dernier], [ms('09:03:00'), false, 'ouvert', ms('09:03:00')])
  })

  test('reprise après une interruption (hors pièce) ferme le passage', () => {
    const iv = intervallesPiece([dans('entree', '09:01:00'), ev('reprise', '10:00:00', { detail: { apresInterruption: true } })], 'salon')
    assert.deepEqual([iv[0].fin, iv[0].clos], [ms('10:00:00'), true])
  })

  test('pause reprise : le passage continue', () => {
    const iv = intervallesPiece([
      dans('entree', '09:01:00'), dans('pause', '09:02:00'), dans('reprise', '09:10:00'), dans('sortie', '09:12:00'),
    ], 'salon')
    assert.deepEqual([iv[0].fin, iv[0].motif], [ms('09:12:00'), 'sortie'])
  })

  test('pause non reprise : le passage s’arrête à la pause', () => {
    const ouvert = intervallesPiece([dans('entree', '09:01:00'), dans('pause', '09:02:00')], 'salon')
    assert.deepEqual([ouvert[0].fin, ouvert[0].clos, ouvert[0].motif], [ms('09:02:00'), false, 'pause'])
    const ferme = intervallesPiece([dans('entree', '09:01:00'), dans('coupure', '09:02:00'), dans('sortie', '09:40:00')], 'salon')
    assert.deepEqual([ferme[0].fin, ferme[0].clos], [ms('09:02:00'), true])
  })

  test('événements dans le désordre : relus par heure', () => {
    const iv = intervallesPiece([dans('sortie', '09:05:00'), dans('entree', '09:01:00')], 'salon')
    assert.deepEqual([iv[0].debut, iv[0].fin], [ms('09:01:00'), ms('09:05:00')])
  })
})

describe('aAnalyser', () => {
  const passage = [dans('entree', '09:01:00'), dans('sortie', '09:05:00')]
  test('jamais analysée, passage clos', () => {
    assert.equal(aAnalyser({ id: 'salon', analyse_le: null }, passage), true)
  })
  test('déjà analysée après le passage', () => {
    assert.equal(aAnalyser({ id: 'salon', analyse_le: H('09:06:00') }, passage), false)
  })
  test('revenue dans la pièce après l’analyse', () => {
    const evts = [...passage, dans('entree', '09:30:00'), dans('sortie', '09:31:00')]
    assert.equal(aAnalyser({ id: 'salon', analyse_le: H('09:06:00') }, evts), true)
  })
  test('passage en cours : on attend', () => {
    const evts = [...passage, dans('entree', '09:30:00')]
    assert.equal(aAnalyser({ id: 'salon', analyse_le: H('09:06:00') }, evts), false)
    assert.equal(aAnalyser({ id: 'salon', analyse_le: null }, evts), false)
  })
  test('jamais visitée', () => {
    assert.equal(aAnalyser({ id: 'cuisine', analyse_le: null }, passage), false)
  })
  test('visite abandonnée : passage tenu pour fini après le délai', () => {
    const evts = [dans('entree', '09:01:00'), dans('point', '09:03:00')]
    const piece = { id: 'salon', analyse_le: null }
    assert.equal(aAnalyser(piece, evts, { maintenant: ms('09:03:00') + DELAI_ABANDON_MS - 1 }), false)
    assert.equal(aAnalyser(piece, evts, { maintenant: ms('09:03:00') + DELAI_ABANDON_MS }), true)
  })
  test('analysée avant la fin du passage : réanalysée quand il s’allonge', () => {
    const evts = [dans('entree', '09:01:00'), dans('pause', '09:02:00'), dans('reprise', '12:00:00'), dans('sortie', '12:05:00')]
    assert.equal(aAnalyser({ id: 'salon', analyse_le: H('11:30:00') }, evts), true)
  })
})

describe('friseDePiece', () => {
  const points = [
    { id: 'pt7', piece_id: 'salon', numero: 7, type: 'interrupteur', calque: 'electricite' },
    { id: 'pt8', piece_id: 'salon', numero: 8, type: null, calque: null },
    { id: 'pt9', piece_id: 'cuisine', numero: 9, type: null, calque: null },
  ]
  const evenements = [
    dans('entree', '09:01:00'),
    dans('point', '09:01:10', { point_id: 'pt7', detail: { numero: 7, x: 1, y: 2 } }),
    dans('point-modifie', '09:01:12', { point_id: 'pt7', detail: { type: 'interrupteur', calque: 'electricite' } }),
    dans('point', '09:02:00', { point_id: 'pt8', detail: { numero: 8, x: 3, y: 2 } }),
    dans('point-modifie', '09:02:30', { point_id: 'pt8', detail: { x: 3.5, y: 2 } }),
    dans('photo', '09:02:40', { point_id: 'pt8', detail: { photoId: 'ph1' } }),
    dans('point', '09:03:00', { point_id: 'pt5', detail: { numero: 5, x: 0, y: 0 } }),
    dans('point-supprime', '09:03:05', { point_id: 'pt5', detail: { numero: 5 } }),
    dans('sortie', '09:05:00'),
    ev('point', '09:06:00', { piece_id: 'cuisine', point_id: 'pt9', detail: { numero: 9 } }),
  ]
  const enregistrements = [
    // Morceau commencé à 09:00:50 (heure de l'appareil)
    {
      id: 'm1', visite_id: 'v1', debut: H('09:00:50'), duree_s: 300, horodate: true,
      segments: [
        { debut_s: 22, fin_s: 25, texte: 'interrupteur  simple   à côté de la porte' },
        { debut_s: 75, fin_s: 80, texte: 'prise double, hauteur trente' },
        // À cheval sur la sortie (09:04:58 → 09:05:06) : milieu après la sortie
        { debut_s: 248, fin_s: 256, texte: 'on passe à la cuisine' },
        // À cheval sur l'entrée (09:00:58 → 09:01:04) : milieu après l'entrée
        { debut_s: 8, fin_s: 14, texte: 'nous voilà dans le salon' },
      ],
    },
    // Autre visite : jamais dans ce passage
    { id: 'm2', visite_id: 'v2', debut: H('09:00:50'), duree_s: 60, segments: [{ debut_s: 30, fin_s: 32, texte: 'phrase d’une autre visite' }] },
  ]
  const intervalles = intervallesPiece(evenements, 'salon')
  const frise = friseDePiece({
    piece: { id: 'salon' }, intervalles, evenements, points, enregistrements,
    elementsValides: [{ point_id: 'pt7', calque: 'electricite', type: 'interrupteur', libelle: 'interrupteur simple', cotes: '' }],
  })

  test('heures locales de l’agence', () => {
    assert.equal(heureFrise(ms('09:01:10')), '10:01:10')
  })

  test('gestes et phrases dans l’ordre des heures', () => {
    assert.deepEqual(frise.lignes, [
      '[10:00:58] « nous voilà dans le salon »',
      '[10:01:00] entrée dans la pièce',
      '[10:01:10] point P7 posé (type choisi : Interrupteur)',
      '[10:01:12] point P7 : type choisi Interrupteur',
      '[10:01:12] « interrupteur simple à côté de la porte »',
      '[10:02:00] point P8 posé',
      '[10:02:05] « prise double, hauteur trente »',
      '[10:02:30] point P8 déplacé',
      '[10:02:40] photo du point P8',
      '[10:03:00] point P5 posé',
      '[10:03:05] point P5 supprimé',
      '[10:05:00] sortie de la pièce',
    ])
  })

  test('phrase à cheval gardée d’après son milieu', () => {
    assert.ok(frise.lignes.some((l) => l.includes('nous voilà dans le salon')))
    assert.ok(!frise.lignes.some((l) => l.includes('on passe à la cuisine')))
    assert.ok(!frise.lignes.some((l) => l.includes('autre visite')))
  })

  test('références : points encore dans la pièce seulement', () => {
    assert.deepEqual([...frise.references], [['P7', 'pt7'], ['P8', 'pt8']])
  })

  test('éléments déjà validés listés à part', () => {
    assert.deepEqual(frise.dejaReleves, ['déjà relevé : P7 · Interrupteur — interrupteur simple'])
  })

  test('morceau sans horodatage : le texte couvre tout le morceau', () => {
    const f = friseDePiece({
      piece: { id: 'salon' }, intervalles, evenements: [],
      enregistrements: [{ visite_id: 'v1', debut: H('09:02:00'), duree_s: 60, segments: [], texte: 'parquet chêne' }],
    })
    assert.deepEqual(f.lignes, ['[10:02:00] « parquet chêne »'])
  })
})

describe('demande à Claude', () => {
  test('modèle et schéma fermés partout', () => {
    assert.equal(MODELE_ANALYSE, 'claude-opus-5-5')
    const ouverts = []
    const parcourir = (s, chemin) => {
      if (!s || typeof s !== 'object') return
      if (s.type === 'object' && s.additionalProperties !== false) ouverts.push(chemin)
      if (s.type === 'object') assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), chemin)
      for (const [k, v] of Object.entries(s.properties ?? {})) parcourir(v, `${chemin}.${k}`)
      parcourir(s.items, `${chemin}[]`)
      for (const v of s.anyOf ?? []) parcourir(v, chemin)
    }
    parcourir(SCHEMA_ANALYSE, '$')
    assert.deepEqual(ouverts, [])
    assert.deepEqual(Object.keys(SCHEMA_ANALYSE.properties.fiche.properties), RUBRIQUES_FICHE)
  })

  test('calques et types du schéma = ceux de calquesEdl.js', () => {
    const item = SCHEMA_ANALYSE.properties.elements.items.properties
    assert.deepEqual(item.calque.enum, CALQUES_DE_POINT.map((c) => c.code))
    assert.deepEqual(item.type.anyOf[0].enum, CALQUES_DE_POINT.flatMap((c) => c.types.map((t) => t.code)))
    assert.deepEqual(item.type.anyOf[1], { type: 'null' })
    assert.ok(CONSIGNES_ANALYSE.includes('radiateur = Radiateur'))
  })

  test('demande : consignes, pièce, déjà relevés, frise, sortie structurée', () => {
    const d = construireDemandeAnalyse({
      piece: { nom: 'Salon', numero: '12', surface: 18.456, hsp: 2.6 },
      lignes: ['[10:01:00] entrée dans la pièce'],
      dejaReleves: ['déjà relevé : P7 · Interrupteur'],
    })
    assert.equal(d.system, CONSIGNES_ANALYSE)
    const texte = d.messages[0].content[0].text
    assert.match(texte, /Pièce : Salon, n° 12 \(lu sur le plan : surface 18,46 m², hauteur sous plafond 2,6 m\)/)
    assert.match(texte, /déjà relevé : P7 · Interrupteur/)
    assert.match(texte, /\[10:01:00\] entrée dans la pièce/)
    assert.deepEqual(d.output_config, { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_ANALYSE } })
  })

  test('contrôle de la demande reçue', () => {
    assert.equal(erreurDemandeAnalyse({ piece: { nom: 'Salon' }, lignes: [] }), null)
    assert.equal(erreurDemandeAnalyse({ lignes: [] }), 'piece')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: 'texte' }), 'lignes')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [3] }), 'lignes')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: Array(LIGNES_MAX + 1).fill('a') }), 'trop-de-lignes')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: ['a'.repeat(400000)] }), 'trop-long')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], dejaReleves: [1] }), 'deja-releves')
  })
})

describe('lireAnalyse', () => {
  const references = new Map([['P7', 'pt7']])
  const resultat = {
    fiche: { sol: ' parquet  chêne ', murs: 'papier peint', plafond: '', plinthes: 'bois', hsp: '2,60', remarques: 'x'.repeat(5000) },
    elements: [
      { point: 'P7', calque: 'electricite', type: 'interrupteur', libelle: 'interrupteur simple', cotes: '', extrait: 'interrupteur simple', a_verifier: false },
      { point: 'p 7', calque: 'plomberie', type: 'radiateur', libelle: 'radiateur fonte', cotes: '80 de large', extrait: 'radiateur', a_verifier: true },
      { point: 'P99', calque: 'menuiseries', type: 'hublot', libelle: 'fenêtre ronde', cotes: '', extrait: '', a_verifier: false },
      { point: null, calque: 'inconnu', type: 'inconnu', libelle: 'rien', cotes: '', extrait: '', a_verifier: false },
    ],
  }
  const lu = lireAnalyse(resultat, references)

  test('fiche nettoyée et bornée', () => {
    assert.equal(lu.fiche.sol, 'parquet chêne')
    assert.equal(lu.fiche.plafond, '')
    assert.equal(lu.fiche.remarques.length, 2000)
  })

  test('point rattaché, écrit autrement', () => {
    assert.equal(lu.elements[0].point_id, 'pt7')
    assert.equal(lu.elements[1].point_id, 'pt7')
  })

  test('le type décide du calque', () => {
    assert.equal(lu.elements[1].calque, 'chauffage')
    assert.equal(lu.elements[1].a_verifier, true)
  })

  test('type inconnu → null, point inconnu → null', () => {
    assert.deepEqual([lu.elements[2].type, lu.elements[2].calque, lu.elements[2].point_id], [null, 'menuiseries', null])
  })

  test('élément sans calque valable écarté', () => {
    assert.equal(lu.elements.length, 3)
  })

  test('réponse vide', () => {
    assert.deepEqual(lireAnalyse(null), { fiche: { sol: '', murs: '', plafond: '', plinthes: '', hsp: '', remarques: '' }, elements: [] })
  })
})

describe('complétude et état', () => {
  const pleine = { sol: 'carrelage', murs: 'peinture', plafond: 'plâtre', plinthes: 'carrelage', hsp: '2,50' }

  test('fiche complète', () => {
    assert.deepEqual(completudeFiche(pleine), { complete: true, manquantes: [] })
  })
  test('rubriques manquantes, dans l’ordre', () => {
    assert.deepEqual(completudeFiche({ sol: 'carrelage', murs: ' ' }), { complete: false, manquantes: ['murs', 'plafond', 'plinthes', 'hsp'] })
  })
  test('HSP facultative quand le plan la donne', () => {
    assert.deepEqual(completudeFiche({ ...pleine, hsp: '' }, { hspLue: 2.5 }), { complete: true, manquantes: [] })
    assert.deepEqual(completudeFiche({ ...pleine, hsp: '' }).manquantes, ['hsp'])
  })
  test('états de la pièce', () => {
    const analysee = { analyse_le: H('10:00:00'), fiche: pleine }
    assert.equal(etatAnalysePiece(analysee, { visitee: false }), 'non-visitee')
    assert.equal(etatAnalysePiece(analysee, { visitee: true, attente: true }), 'attente')
    assert.equal(etatAnalysePiece({ analyse_le: null, fiche: {} }, { visitee: true }), 'attente')
    assert.equal(etatAnalysePiece(analysee, { visitee: true }), 'complete')
    assert.equal(etatAnalysePiece({ ...analysee, fiche: { sol: 'carrelage' } }, { visitee: true }), 'incomplete')
    assert.equal(etatAnalysePiece({ ...analysee, hsp_lue: 2.5, fiche: { ...pleine, hsp: '' } }, { visitee: true }), 'complete')
    assert.equal(etatAnalysePiece({ ...analysee, analyse_erreur: 'reseau' }, { visitee: true, attente: true }), 'echec')
  })
})
