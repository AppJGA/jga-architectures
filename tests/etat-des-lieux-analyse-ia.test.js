// État des lieux, lot 3 (analyse) : passages dans une pièce, frise, demande
// à Claude et lecture de sa réponse, complétude de la fiche. Journal,
// points et phrases inventés : aucune transcription réelle dans le dépôt.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  MODELE_ANALYSE, SCHEMA_ANALYSE, CONSIGNES_ANALYSE, LIGNES_MAX, DELAI_ABANDON_MS, RUBRIQUES_FICHE,
  intervallesPiece, aAnalyser, heureFrise, friseDePiece, construireDemandeAnalyse, erreurDemandeAnalyse,
  lireAnalyse, completudeFiche, etatAnalysePiece,
  SCHEMA_ANALYSE_TRACES, CONSIGNES_TRACES, TRACES_MAX, consignesAnalyse, schemaAnalyse, messageEchecAnalyse,
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

  test('sortie et entrée à la même milliseconde, dans les deux ordres', () => {
    for (const ordre of ['sortie-entree', 'entree-sortie']) {
      const sortie = ev('sortie', '09:04:00', { piece_id: 'cuisine' })
      const entree = dans('entree', '09:04:00')
      const paire = ordre === 'sortie-entree' ? [sortie, entree] : [entree, sortie]
      const evts = [ev('entree', '09:01:00', { piece_id: 'cuisine' }), ...paire, dans('sortie', '09:08:00')]
      const salon = intervallesPiece(evts, 'salon')
      assert.deepEqual(salon.map((i) => [i.debut, i.fin, i.motif]), [[ms('09:04:00'), ms('09:08:00'), 'sortie']], ordre)
      const cuisine = intervallesPiece(evts, 'cuisine')
      assert.deepEqual(cuisine.map((i) => [i.debut, i.fin, i.motif]), [[ms('09:01:00'), ms('09:04:00'), 'sortie']], ordre)
    }
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
      '— visite du 18/11/2026 —',
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
    assert.deepEqual(f.lignes, ['— visite du 18/11/2026 —', '[10:02:00] « parquet chêne »'])
  })

  test('une ligne sépare les visites et les jours', () => {
    const evts = [
      dans('entree', '09:01:00'), dans('sortie', '09:05:00'),
      // Le lendemain, plus tôt dans la journée : l'heure recule
      dans('entree', '07:00:00', { visite_id: 'v2', le: '2026-11-19T07:00:00.000Z' }),
      dans('sortie', '07:02:00', { visite_id: 'v2', le: '2026-11-19T07:02:00.000Z' }),
      // Même jour, autre visite
      dans('entree', '15:00:00', { visite_id: 'v3', le: '2026-11-19T15:00:00.000Z' }),
    ]
    const f = friseDePiece({ piece: { id: 'salon' }, intervalles: intervallesPiece(evts, 'salon'), evenements: evts })
    assert.deepEqual(f.lignes, [
      '— visite du 18/11/2026 —', '[10:01:00] entrée dans la pièce', '[10:05:00] sortie de la pièce',
      '— visite du 19/11/2026 —', '[08:00:00] entrée dans la pièce', '[08:02:00] sortie de la pièce',
      '— visite du 19/11/2026 —', '[16:00:00] entrée dans la pièce',
    ])
  })

  test('annulation notée depuis une autre pièce : gardée avec son point', () => {
    const evts = [
      dans('entree', '09:01:00'),
      dans('point', '09:01:10', { point_id: 'pt7', detail: { numero: 7 } }),
      dans('sortie', '09:02:00'),
      ev('entree', '09:02:00', { piece_id: 'cuisine' }),
      ev('point-supprime', '09:02:30', { piece_id: 'cuisine', point_id: 'pt7', detail: { annulation: true } }),
      ev('point', '09:02:40', { piece_id: 'cuisine', point_id: 'pt9', detail: { numero: 9 } }),
    ]
    const f = friseDePiece({ piece: { id: 'salon' }, intervalles: intervallesPiece(evts, 'salon'), evenements: evts, points: [] })
    assert.deepEqual(f.lignes, [
      '— visite du 18/11/2026 —',
      '[10:01:00] entrée dans la pièce',
      '[10:01:10] point P7 posé',
      '[10:02:00] sortie de la pièce',
      '[10:02:30] point P7 retiré (annulation de la pose)',
    ])
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
    assert.deepEqual(Object.keys(SCHEMA_ANALYSE.properties.fiche.properties), [...RUBRIQUES_FICHE, 'porte', 'statuts'])
  })

  test('fiche : bloc porte et statuts (null permis, jamais « a-preciser »)', () => {
    const fiche = SCHEMA_ANALYSE.properties.fiche.properties
    assert.deepEqual(fiche.porte.required, ['huisserie', 'vantail', 'quincaillerie'])
    assert.deepEqual(fiche.statuts.required, ['sol', 'murs', 'plafond', 'plinthes', 'porte'])
    for (const r of fiche.statuts.required) {
      assert.deepEqual(fiche.statuts.properties[r], { anyOf: [{ type: 'string', enum: ['conserver', 'rafraichir', 'deposer'] }, { type: 'null' }] })
    }
    assert.match(CONSIGNES_ANALYSE, /« à repeindre », « à reprendre », « reboucher »/)
    assert.match(CONSIGNES_ANALYSE, /"deposer" .*« hors service »/)
    assert.match(CONSIGNES_ANALYSE, /"conserver" .*« bon état », « à garder »/)
    assert.match(CONSIGNES_ANALYSE, /null si rien n'est dit sur l'état/)
    assert.match(CONSIGNES_ANALYSE, /« métallique » : huisserie métallique, vantail bois/)
    assert.match(CONSIGNES_ANALYSE, /garde-les, sauf si la frise les contredit clairement/)
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
    assert.doesNotMatch(texte, /Fiche actuelle/)
    assert.deepEqual(d.output_config, { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_ANALYSE } })
  })

  test('fiche actuelle envoyée, rubriques vides omises', () => {
    const d = construireDemandeAnalyse({
      piece: { nom: 'Salon' }, lignes: [],
      ficheActuelle: { sol: 'parquet chêne', murs: '', plafond: 'plâtre peint', remarques: null },
    })
    const texte = d.messages[0].content[0].text
    assert.match(texte, /Fiche actuelle \(déjà relevée ou corrigée par l’agence\) :\n- sol : parquet chêne\n- plafond : plâtre peint\n/)
    assert.doesNotMatch(texte, /- murs/)
    assert.equal(construireDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { sol: ' ' } }).messages[0].content[0].text.includes('Fiche actuelle'), false)
    assert.match(CONSIGNES_ANALYSE, /fiche actuelle/)
    assert.match(CONSIGNES_ANALYSE, /jamais un point supprimé/)
    // Porte et statuts de la fiche corrigée repartent chez Claude (statut d'une rubrique vide omis)
    const avecStatuts = construireDemandeAnalyse({
      piece: {}, lignes: [],
      ficheActuelle: { sol: 'carrelage', murs: '', porte: { huisserie: 'bois', vantail: '', quincaillerie: 'laiton' }, statuts: { sol: 'conserver', murs: 'deposer', porte: 'rafraichir', plafond: 'n-importe' } },
    }).messages[0].content[0].text
    assert.match(avecStatuts, /- sol : carrelage\n- porte : huisserie = bois, quincaillerie = laiton\n- statuts : sol = conserver, porte = rafraichir\n/)
    assert.match(CONSIGNES_ANALYSE, /n'en force pas un/)
  })

  test('contrôle de la demande reçue', () => {
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { sol: 'parquet' } }), null)
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: ['parquet'] }), 'fiche')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { sol: 3 } }), 'fiche')
    // Une fiche relue en relecture porte sa porte et ses statuts : recevable
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { sol: 'parquet', porte: { huisserie: 'bois' }, statuts: { sol: 'conserver', murs: null } } }), null)
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { statuts: { sol: 3 } } }), 'fiche')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { porte: ['bois'] } }), 'fiche')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], ficheActuelle: { sol: { a: 'b' } } }), 'fiche')
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
    fiche: {
      sol: ' parquet  chêne ', murs: 'papier peint', plafond: '', plinthes: 'bois', hsp: '2,60', remarques: 'x'.repeat(5000),
      porte: { huisserie: ' métallique ', vantail: 'bois', quincaillerie: 'y'.repeat(500) },
      statuts: { sol: 'conserver', murs: 'a-preciser', plafond: 'deposer', plinthes: 'inconnu', porte: 'rafraichir' },
    },
    elements: [
      { point: 'P7', calque: 'electricite', type: 'interrupteur', libelle: 'interrupteur simple', cotes: '', extrait: 'interrupteur simple', a_verifier: false },
      { point: '7', calque: 'electricite', type: 'prise', libelle: 'prise', cotes: '', extrait: '', a_verifier: false },
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

  test('porte nettoyée et bornée ; statut inconnu, « a-preciser » ou d’une rubrique vide → null', () => {
    assert.deepEqual([lu.fiche.porte.huisserie, lu.fiche.porte.vantail, lu.fiche.porte.quincaillerie.length], ['métallique', 'bois', 200])
    assert.deepEqual(lu.fiche.statuts, { sol: 'conserver', murs: null, plafond: null, plinthes: null, porte: 'rafraichir' })
  })

  test('point rattaché, écrit autrement (« 7 », « p 7 »)', () => {
    assert.deepEqual(lu.elements.slice(0, 3).map((e) => e.point_id), ['pt7', 'pt7', 'pt7'])
  })

  test('le type décide du calque', () => {
    assert.equal(lu.elements[2].calque, 'chauffage')
    assert.equal(lu.elements[2].a_verifier, true)
  })

  test('type inconnu → null, point inconnu → null', () => {
    assert.deepEqual([lu.elements[3].type, lu.elements[3].calque, lu.elements[3].point_id], [null, 'menuiseries', null])
  })

  test('élément sans calque valable écarté', () => {
    assert.equal(lu.elements.length, 4)
  })

  test('réponse vide', () => {
    assert.deepEqual(lireAnalyse(null), {
      fiche: {
        sol: '', murs: '', plafond: '', plinthes: '', hsp: '', remarques: '',
        porte: { huisserie: '', vantail: '', quincaillerie: '' },
        statuts: { sol: null, murs: null, plafond: null, plinthes: null, porte: null },
      },
      elements: [],
      // Sans traces lues (pas de contexte), rien des traces
      traces: null,
    })
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

// ─── Liaisons et cotes (migration 084) ──────────────────────────────────────

describe('liaisons et cotes : frise', () => {
  const points = [
    { id: 'i3', piece_id: 'salon', numero: 3, type: 'interrupteur' },
    { id: 'l7', piece_id: 'salon', numero: 7, type: 'luminaire' },
    { id: 'a8', piece_id: 'salon', numero: 8, type: 'applique' },
    { id: 'pr9', piece_id: 'salon', numero: 9, type: 'prise' },
    { id: 'l20', piece_id: 'cuisine', numero: 20, type: 'luminaire' },
  ]
  const cote = (id, champs = {}) => ({ id, sorte: 'cote', piece_id: 'salon', niveau_id: 'n1', xa: 0, ya: 0, xb: 3.42, yb: 0, valeur: null, a_valider: false, origine: 'main', ...champs })
  const traces = [
    cote('c-b', { created_at: '2026-11-18T09:03:00Z', valeur: '2,80 m' }),
    cote('c-a', { created_at: '2026-11-18T09:02:00Z' }),
    // Valeur seulement proposée : elle sera remplacée, la cote est « sans valeur »
    cote('c-c', { created_at: '2026-11-18T09:04:00Z', valeur: '4,00 m', a_valider: true }),
    // Cote d'une autre pièce : pas désignée ici
    cote('c-x', { piece_id: 'cuisine', created_at: '2026-11-18T09:00:00Z' }),
    { id: 't1', sorte: 'commande', piece_id: 'salon', point_a: 'i3', point_b: 'l7', a_valider: false, origine: 'main' },
    // Proposition pas encore relue de cette pièce : remplacée, pas « existante »
    { id: 't2', sorte: 'commande', piece_id: 'salon', point_a: 'i3', point_b: 'a8', a_valider: true, origine: 'ia' },
  ]
  const evenements = [
    dans('entree', '09:01:00'),
    dans('point-touche', '09:01:10', { point_id: 'i3', detail: { numero: 3, type: 'interrupteur' } }),
    dans('point-touche', '09:01:12', { point_id: 'l7', detail: { numero: 7, type: 'luminaire' } }),
    dans('trace', '09:01:13', { point_id: 'i3', detail: { traceId: 't1', sorte: 'commande', point_a: 'i3', point_b: 'l7' } }),
    dans('angle-touche', '09:02:00', { detail: { x: 0, y: 0, traceId: 'c-a' } }),
    dans('angle-touche', '09:02:02', { detail: { x: 3.42, y: 0, traceId: 'c-a' } }),
    dans('trace', '09:02:02', { detail: { traceId: 'c-a', sorte: 'cote', xa: 0, ya: 0, xb: 3.42, yb: 0, valeur: null } }),
    dans('trace', '09:03:10', { detail: { traceId: 'c-b', sorte: 'cote', modification: { valeur: '2,80 m', a_valider: false } } }),
    // Mode Coter quitté avant le second angle : aucune cote ne porte cet id
    dans('angle-touche', '09:03:30', { detail: { x: 1, y: 1, traceId: 'jamais' } }),
    dans('trace-supprimee', '09:03:40', { point_id: 'i3', detail: { traceId: 'gone', sorte: 'commande' } }),
    dans('trace-supprimee', '09:03:50', { detail: { annulation: true, traceId: 'c-c' } }),
    dans('sortie', '09:05:00'),
  ]
  const intervalles = intervallesPiece(evenements, 'salon')
  const frise = friseDePiece({ piece: { id: 'salon' }, intervalles, evenements, points, traces })

  test('touchers, angles et traces posées nommés dans la frise', () => {
    assert.deepEqual(frise.lignes, [
      '— visite du 18/11/2026 —',
      '[10:01:00] entrée dans la pièce',
      '[10:01:10] point P3 (Interrupteur) touché',
      '[10:01:12] point P7 (Luminaire) touché',
      '[10:01:13] liaison P3 → P7 posée à la main',
      '[10:02:00] angle touché (cote C1)',
      '[10:02:02] angle touché (cote C1)',
      '[10:02:02] cote C1 posée entre deux angles',
      '[10:03:10] cote C2 : valeur tapée 2,80 m',
      '[10:03:30] angle touché (cote abandonnée ou retirée depuis)',
      '[10:03:40] liaison supprimée',
      '[10:03:50] cote C3 retirée (annulation de la pose)',
      '[10:05:00] sortie de la pièce',
    ])
  })

  test('cotes désignées C<n> dans l’ordre de création, celles de la pièce seulement', () => {
    assert.deepEqual([...frise.contexteTraces.cotesSansValeur], [['C1', 'c-a'], ['C3', 'c-c']])
  })

  test('appareils, liaisons existantes et cotes décrits pour Claude', () => {
    assert.deepEqual(frise.lignesTraces, [
      'Interrupteurs et luminaires posés dans la pièce : P3 (Interrupteur), P7 (Luminaire), P8 (Point lumineux en applique).',
      'Liaisons existantes (1) :',
      '- P3 → P7',
      'Cotes posées dans la pièce (3) :',
      '- C1 : sans valeur (longueur dessinée ≈ 3,42 m)',
      '- C2 : valeur déjà donnée : 2,80 m (longueur dessinée ≈ 3,42 m)',
      '- C3 : sans valeur (longueur dessinée ≈ 3,42 m)',
    ])
  })

  test('pièce sans rien : tout est dit vide', () => {
    const vide = friseDePiece({ piece: { id: 'bureau' }, intervalles: [], evenements: [], points, traces: [] })
    assert.deepEqual(vide.lignesTraces, ['Aucun interrupteur ni luminaire posé dans la pièce.', 'Aucune liaison existante.', 'Aucune cote posée dans la pièce.'])
  })

  test('traces non lues (sans la 084, lecture ratée) : frise d’avant, rien à relire', () => {
    const sans = friseDePiece({ piece: { id: 'salon' }, intervalles, evenements, points, traces: null })
    assert.equal(sans.lignesTraces, null)
    assert.equal(sans.contexteTraces, null)
    // Les gestes restent nommés, sans numéro de cote ni « retirée depuis »
    assert.ok(sans.lignes.includes('[10:02:00] angle touché'))
    assert.ok(sans.lignes.includes('[10:02:02] cote posée entre deux angles'))
    // Sans traces passées du tout : pareil
    assert.equal(friseDePiece({ piece: { id: 'salon' }, intervalles, evenements, points }).lignesTraces, null)
  })
})

describe('liaisons et cotes : demande et schéma', () => {
  test('sans traces : consignes et schéma d’avant la 084, à l’identique', () => {
    const d = construireDemandeAnalyse({ piece: { nom: 'Salon' }, lignes: ['[10:01:00] entrée dans la pièce'] })
    assert.equal(d.system, CONSIGNES_ANALYSE)
    assert.equal(d.output_config.format.schema, SCHEMA_ANALYSE)
    assert.doesNotMatch(d.messages[0].content[0].text, /Liaisons et cotes/)
    assert.equal(consignesAnalyse(false), CONSIGNES_ANALYSE)
    assert.equal(schemaAnalyse(false), SCHEMA_ANALYSE)
    assert.ok(!('liaisons' in SCHEMA_ANALYSE.properties))
  })

  test('avec traces : consignes ajoutées, lignes avant la frise, schéma fermé', () => {
    const d = construireDemandeAnalyse({
      piece: { nom: 'Salon' }, lignes: ['[10:01:00] entrée dans la pièce'], traces: ['Aucune liaison existante.', '- C1 : sans valeur'],
    })
    assert.equal(d.system, `${CONSIGNES_ANALYSE}\n\n${CONSIGNES_TRACES}`)
    assert.equal(d.output_config.format.schema, SCHEMA_ANALYSE_TRACES)
    const texte = d.messages[0].content[0].text
    assert.match(texte, /Liaisons et cotes de la pièce :\nAucune liaison existante\.\n- C1 : sans valeur\nFrise de la pièce/)
    assert.deepEqual(SCHEMA_ANALYSE_TRACES.required, ['fiche', 'elements', 'liaisons', 'cotes'])
    const ouverts = []
    const parcourir = (s, chemin) => {
      if (!s || typeof s !== 'object') return
      if (s.type === 'object' && s.additionalProperties !== false) ouverts.push(chemin)
      if (s.type === 'object') assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), chemin)
      for (const [k, v] of Object.entries(s.properties ?? {})) parcourir(v, `${chemin}.${k}`)
      parcourir(s.items, `${chemin}[]`)
      for (const v of s.anyOf ?? []) parcourir(v, chemin)
    }
    parcourir(SCHEMA_ANALYSE_TRACES, '$')
    assert.deepEqual(ouverts, [])
    assert.deepEqual(SCHEMA_ANALYSE_TRACES.properties.liaisons.items.required, ['interrupteur', 'luminaire', 'extrait'])
    assert.deepEqual(SCHEMA_ANALYSE_TRACES.properties.cotes.items.required, ['cote', 'valeur', 'extrait'])
  })

  test('consignes : jamais une liaison existante, valeur seulement pour une cote sans valeur', () => {
    assert.match(CONSIGNES_TRACES, /Ne propose jamais une liaison déjà existante/)
    assert.match(CONSIGNES_TRACES, /touchés ou posés à peu d'écart/)
    assert.match(CONSIGNES_TRACES, /seulement pour une cote listée « sans valeur »/)
    assert.match(CONSIGNES_TRACES, /juste avant ou juste après ses deux angles/)
    assert.match(CONSIGNES_TRACES, /jamais d'après la longueur dessinée/)
  })

  test('contrôle de la demande : lignes des traces facultatives, bornées', () => {
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], tracesPiece: ['- C1 : sans valeur'] }), null)
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], tracesPiece: 'texte' }), 'traces')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], tracesPiece: [3] }), 'traces')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: [], tracesPiece: Array(TRACES_MAX + 1).fill('a') }), 'trop-de-traces')
    assert.equal(erreurDemandeAnalyse({ piece: {}, lignes: ['a'.repeat(200000)], tracesPiece: ['b'.repeat(200000)] }), 'trop-long')
    assert.match(messageEchecAnalyse({ code: 'demande', detail: 'trop-de-traces' }), /Trop de gestes/)
  })
})

describe('liaisons et cotes : lecture de la réponse', () => {
  const points = new Map([
    ['i3', { id: 'i3', piece_id: 'salon', numero: 3, type: 'interrupteur' }],
    ['i4', { id: 'i4', piece_id: 'salon', numero: 4, type: 'interrupteur' }],
    ['l7', { id: 'l7', piece_id: 'salon', numero: 7, type: 'luminaire' }],
    ['a8', { id: 'a8', piece_id: 'salon', numero: 8, type: 'applique' }],
    ['pr9', { id: 'pr9', piece_id: 'salon', numero: 9, type: 'prise' }],
  ])
  const references = new Map([['P3', 'i3'], ['P4', 'i4'], ['P7', 'l7'], ['P8', 'a8'], ['P9', 'pr9']])
  const contexte = {
    points,
    existantes: [{ sorte: 'commande', point_a: 'i3', point_b: 'l7' }],
    cotesSansValeur: new Map([['C1', 'c-a'], ['C3', 'c-c']]),
  }
  const resultat = {
    fiche: {},
    elements: [],
    liaisons: [
      { interrupteur: 'P3', luminaire: 'P8', extrait: 'il allume  l’applique' },
      // Sens inversé par Claude : rétabli
      { interrupteur: 'P7', luminaire: 'P4', extrait: 'le second interrupteur commande le plafonnier' },
      // Déjà existante, en double, types incompatibles, point inconnu : écartées
      { interrupteur: 'P3', luminaire: 'P7', extrait: '' },
      { interrupteur: 'p 3', luminaire: '8', extrait: '' },
      { interrupteur: 'P3', luminaire: 'P9', extrait: '' },
      { interrupteur: 'P3', luminaire: 'P4', extrait: '' },
      { interrupteur: 'P3', luminaire: 'P99', extrait: '' },
      null,
    ],
    cotes: [
      { cote: 'C1', valeur: 'trois mètres', extrait: 'illisible' },
      { cote: 'c 1', valeur: '3.45', extrait: 'trois quarante-cinq' },
      { cote: 'C1', valeur: '3,50 m', extrait: 'en double' },
      // Valeur déjà donnée (C2 absente des cotes sans valeur), cote inconnue
      { cote: 'C2', valeur: '2,90 m', extrait: '' },
      { cote: 'C9', valeur: '1 m', extrait: '' },
      { cote: '3', valeur: '345 cm', extrait: 'trois mètres quarante-cinq' },
    ],
  }
  const lu = lireAnalyse(resultat, references, contexte)

  test('liaisons : types compatibles, sens rétabli, ni existante ni en double', () => {
    assert.deepEqual(lu.traces.liaisons, [
      { point_a: 'i3', point_b: 'a8', extrait: 'il allume l’applique' },
      { point_a: 'i4', point_b: 'l7', extrait: 'le second interrupteur commande le plafonnier' },
    ])
  })

  test('cotes : sans valeur seulement, valeur lisible réécrite, une fois par cote', () => {
    assert.deepEqual(lu.traces.cotes, [
      { id: 'c-a', valeur: '3,45 m', extrait: 'trois quarante-cinq' },
      { id: 'c-c', valeur: '3,45 m', extrait: 'trois mètres quarante-cinq' },
    ])
  })

  test('réponse sans liaisons ni cotes : listes vides (les propositions seront retirées)', () => {
    assert.deepEqual(lireAnalyse({ fiche: {}, elements: [] }, references, contexte).traces, { liaisons: [], cotes: [] })
  })
})
