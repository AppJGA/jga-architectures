// État des lieux : murs touchés, finitions de murs, cotes sans bouton et
// textes d'aide (migration 085). Gestes de la visite (tracesVisiteLogique.js),
// règles communes (tracesEdl.js), frise, demande et lecture de l'analyse
// (analyseEdlLogique.js), lignes écrites (analyseDonneesLogique.js).
// Pièces, murs et phrases inventés : aucun plan ni transcription réels dans
// le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  angleSous, murLePlusProche, memeMur, FINITIONS_MUR, finitionMur, couleurFinition, finitionPropre,
  finitionsIndisponibles, lectureTracesEtFinitions, TYPES_JOURNAL_FINITIONS, SORTES_TRACE, SORTES_TRACE_FINITIONS,
  tracesAExporter,
} from '../src/modules/etude/etat-des-lieux/tracesEdl.js'
import {
  cibleToucher, toucherAngle, premierAngleActif, detailMurTouche, texteAide, decalageFinition, extremitesFinition,
  traceProche, sensInterieurCote, TOLERANCE_PILE_PX, DUREE_PREMIER_ANGLE_MS, DUREE_AIDE_MS,
} from '../src/modules/etude/etat-des-lieux/visite/tracesVisiteLogique.js'
import { aideMemoire } from '../src/modules/etude/etat-des-lieux/visite/aideMemoireLogique.js'
import { journalSansMigration } from '../src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js'
import { tracesRelecture } from '../src/modules/etude/etat-des-lieux/analyse/relectureAnalyseLogique.js'
import {
  friseDePiece, intervallesPiece, construireDemandeAnalyse, erreurDemandeAnalyse, lireAnalyse,
  SCHEMA_ANALYSE_TRACES, SCHEMA_ANALYSE_FINITIONS, CONSIGNES_TRACES, CONSIGNES_FINITIONS, consignesAnalyse, schemaAnalyse,
} from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js'
import { lignesTracesIa } from '../src/modules/etude/etat-des-lieux/analyse/analyseDonneesLogique.js'

// Une pièce de 4 m × 3 m, repère du plan (y vers le haut)
const contour = [[0, 0], [4, 0], [4, 3], [0, 3]]

describe('angle et mur sous le doigt', () => {
  test('angleSous : le sommet le plus proche, à la tolérance près', () => {
    const r = angleSous(contour, [3.95, 0.03], 0.1)
    assert.deepEqual([r.angle, r.index], [[4, 0], 1])
    assert.ok(Math.abs(r.distance - Math.hypot(0.05, 0.03)) < 1e-9)
    assert.equal(angleSous(contour, [3.8, 0], 0.1), null)
    assert.equal(angleSous(null, [0, 0], 1), null)
  })
  test('murLePlusProche : le côté le plus proche, le dernier referme le contour', () => {
    const m = murLePlusProche(contour, [2, 0.04], 0.1)
    assert.deepEqual([m.a, m.b, m.index, m.longueur], [[0, 0], [4, 0], 0, 4])
    assert.ok(Math.abs(m.distance - 0.04) < 1e-9)
    const ferme = murLePlusProche(contour, [-0.05, 1.5], 0.1)
    assert.deepEqual([ferme.a, ferme.b, ferme.index], [[0, 3], [0, 0], 3])
    assert.equal(murLePlusProche(contour, [2, 1.5], 0.1), null)
    // Un côté de longueur nulle n'est pas un mur
    assert.equal(murLePlusProche([[0, 0], [0, 0], [1, 1]], [0, 0], 0.1)?.index, 1)
  })
  test('memeMur : mêmes extrémités dans un sens ou dans l’autre, au millimètre', () => {
    const m = { xa: 0, ya: 0, xb: 4, yb: 0 }
    assert.equal(memeMur(m, { xa: 4, ya: 0, xb: 0, yb: 0 }), true)
    assert.equal(memeMur(m, { xa: 0.0002, ya: 0, xb: 4, yb: 0 }), true)
    assert.equal(memeMur(m, { xa: 0, ya: 0, xb: 4, yb: 3 }), false)
    assert.equal(memeMur(m, { xa: 0 }), false)
  })
})

describe('priorité d’un toucher : angle > mur > point', () => {
  // 12 px sur 22 : la zone « pile » est plus fine que celle des points
  const pile = 0.12
  test('zone pile de 12 px, plus fine que les 22 px des points', () => {
    // Zone d'un point : 22 px (RAYON_TOUCHER_PX de DessinsPlanEdl.jsx)
    assert.equal(TOLERANCE_PILE_PX, 12)
    assert.ok(TOLERANCE_PILE_PX < 22)
  })
  test('pile sur un angle : l’angle, même s’il est aussi sur deux murs', () => {
    assert.deepEqual(cibleToucher({ contour, position: [0.05, 0.05], tolerance: pile }), { sorte: 'angle', angle: [0, 0], index: 0 })
  })
  test('pile sur un mur, loin des angles : le mur', () => {
    const r = cibleToucher({ contour, position: [2, 2.95], tolerance: pile })
    assert.equal(r.sorte, 'mur')
    assert.deepEqual([r.mur.a, r.mur.b], [[4, 3], [0, 3]])
  })
  test('ailleurs dans la pièce : le reste (point posé, trace)', () => {
    assert.deepEqual(cibleToucher({ contour, position: [2, 0.3], tolerance: pile }), { sorte: 'plan' })
  })
  test('sans la 084 : pas d’angle, le bout du mur va au mur', () => {
    assert.equal(cibleToucher({ contour, position: [0.05, 0.05], tolerance: pile, avecAngles: false }).sorte, 'mur')
  })
  test('plan de l’étage (aucune pièce ouverte) : ni angle ni mur', () => {
    assert.deepEqual(cibleToucher({ contour: null, position: [0, 0], tolerance: pile }), { sorte: 'plan' })
  })
  test('un point existant l’emporte seulement s’il est plus près du doigt que le mur ou l’angle', () => {
    const point = { id: 'p1' }
    // Doigt sur le centre d'un point posé à 8 cm du mur
    assert.deepEqual(cibleToucher({ contour, position: [2, 0.08], tolerance: pile, pointExistant: { point, distance: 0 } }), { sorte: 'point', point })
    // Doigt sur le mur, le point est à côté
    assert.equal(cibleToucher({ contour, position: [2, 0.01], tolerance: pile, pointExistant: { point, distance: 0.07 } }).sorte, 'mur')
    // Loin des murs : le point
    assert.equal(cibleToucher({ contour, position: [2, 1], tolerance: pile, pointExistant: { point, distance: 0.1 } }).sorte, 'point')
  })
  test('un point posé sur le mur même se choisit en touchant son centre', () => {
    const point = { id: 'p2' }
    // Point sur le mur du bas (y = 0) ; doigt à 4 cm de son centre, le long du mur :
    // le mur (0 cm) est plus près que le point, mais le doigt est sur le point
    assert.deepEqual(cibleToucher({ contour, position: [2.04, 0], tolerance: pile, pointExistant: { point, distance: 0.04 } }), { sorte: 'point', point })
    // Plus loin du centre (au-delà de la moitié de la zone pile) : le mur
    assert.equal(cibleToucher({ contour, position: [2.08, 0], tolerance: pile, pointExistant: { point, distance: 0.08 } }).sorte, 'mur')
    // Un angle reste à l'angle s'il est plus près que le point
    assert.equal(cibleToucher({ contour, position: [0.01, 0.01], tolerance: pile, pointExistant: { point, distance: 0.04 } }).sorte, 'angle')
  })
})

describe('cote par deux angles, sans bouton', () => {
  test('premier angle allumé ~20 s, l’identifiant de la future cote décidé tout de suite', () => {
    const r = toucherAngle(null, [0, 0], { maintenant: 1000, traceId: 't-1' })
    assert.equal(r.action, 'premier')
    assert.deepEqual(r.premier, { angle: [0, 0], traceId: 't-1', jusqua: 1000 + DUREE_PREMIER_ANGLE_MS })
    assert.equal(DUREE_PREMIER_ANGLE_MS, 20_000)
    assert.match(toucherAngle(null, [0, 0], { maintenant: 0 }).premier.traceId, /^[0-9a-f-]{36}$/)
  })
  test('second angle : la cote se crée aussitôt, avec l’identifiant du premier', () => {
    const { premier } = toucherAngle(null, [0, 0], { maintenant: 0, traceId: 't-1' })
    assert.deepEqual(toucherAngle(premier, [4, 0], { maintenant: 5000 }), { action: 'creer', a: [0, 0], b: [4, 0], traceId: 't-1' })
  })
  test('deux fois le même angle : rien de créé, l’angle reste allumé (délai relancé)', () => {
    const { premier } = toucherAngle(null, [0, 0], { maintenant: 0, traceId: 't-1' })
    const r = toucherAngle(premier, [0, 0], { maintenant: 5000 })
    assert.equal(r.action, 'meme')
    assert.deepEqual(r.premier, { angle: [0, 0], traceId: 't-1', jusqua: 5000 + DUREE_PREMIER_ANGLE_MS })
  })
  test('premier angle éteint (délai passé) : le toucher suivant repart d’un premier angle', () => {
    const { premier } = toucherAngle(null, [0, 0], { maintenant: 0, traceId: 't-1' })
    assert.equal(premierAngleActif(premier, DUREE_PREMIER_ANGLE_MS - 1), true)
    assert.equal(premierAngleActif(premier, DUREE_PREMIER_ANGLE_MS), false)
    assert.equal(premierAngleActif(null, 0), false)
    const r = toucherAngle(premier, [4, 0], { maintenant: DUREE_PREMIER_ANGLE_MS + 1, traceId: 't-2' })
    assert.equal(r.action, 'premier')
    assert.equal(r.premier.traceId, 't-2')
  })
})

describe('mur touché : ce que le journal garde', () => {
  test('extrémités, côté et longueur, au millimètre', () => {
    const mur = murLePlusProche(contour, [2, 2.99], 0.1)
    assert.deepEqual(detailMurTouche(mur), { xa: 4, ya: 3, xb: 0, yb: 3, index: 2, longueur: 4 })
    assert.deepEqual(detailMurTouche({ a: [0.12345, 0], b: [1.00049, 0], index: 0, longueur: 0.87704 }), { xa: 0.123, ya: 0, xb: 1, yb: 0, index: 0, longueur: 0.877 })
  })
  test('le type de journal n’est noté qu’avec la 085 ; refusé par l’ancienne contrainte, il tombe sans bloquer la file', () => {
    assert.deepEqual(TYPES_JOURNAL_FINITIONS, ['mur-touche'])
    assert.equal(journalSansMigration({ type: 'mur-touche' }, { code: '23514' }), true)
    assert.equal(journalSansMigration({ type: 'entree' }, { code: '23514' }), false)
  })
})

describe('textes d’aide (validés par l’agence)', () => {
  const p7 = { numero: 7, type: 'interrupteur' }
  test('chaque geste a son texte', () => {
    assert.equal(texteAide({ sorte: 'entree', piece: 'Cuisine' }), 'Cuisine · touchez un angle, un mur, ou posez un point')
    assert.equal(texteAide({ sorte: 'angle' }), 'Angle choisi · touchez un 2ᵉ angle pour coter')
    assert.equal(texteAide({ sorte: 'cote' }), 'Cote créée · dites la dimension ou tapez-la')
    assert.equal(texteAide({ sorte: 'mur' }), 'Mur choisi · dites sa finition (ex. faïence toute hauteur) — sans rien dire, rien n’est enregistré')
    assert.equal(texteAide({ sorte: 'point-pose', point: p7 }), 'Point P7 posé · dites ce que c’est ou choisissez son type')
    assert.equal(texteAide({ sorte: 'point-touche', point: p7, relier: true }), 'P7 · Interrupteur · dites ce qui change, photographiez ou reliez')
    assert.equal(texteAide({ sorte: 'relier', attendu: 'luminaire' }), 'Touchez le luminaire commandé par cet interrupteur')
    assert.equal(texteAide({ sorte: 'relier', attendu: 'interrupteur' }), 'Touchez l’interrupteur qui commande ce luminaire')
    assert.equal(texteAide({ sorte: 'liaison', interrupteur: { numero: 3 }, luminaire: p7 }), 'Liaison P3 → P7 créée')
    assert.equal(texteAide({ sorte: 'hors-piece' }), 'Point posé hors pièce · il est rattaché à l’étage')
  })
  test('sans la 084, l’entrée ne propose pas d’angle ; un point qu’on ne relie pas ne dit pas « reliez »', () => {
    assert.equal(texteAide({ sorte: 'entree', piece: 'Cuisine', angles: false }), 'Cuisine · touchez un mur, ou posez un point')
    assert.equal(texteAide({ sorte: 'point-touche', point: { numero: 4, type: null } }), 'P4 · dites ce qui change ou photographiez')
  })
  test('rien d’autre, et un bandeau qui s’efface seul au bout de ~4 s', () => {
    assert.equal(texteAide({ sorte: 'inconnu' }), null)
    assert.equal(texteAide(null), null)
    assert.equal(DUREE_AIDE_MS, 4000)
  })
})

describe('finitions de murs : couleurs et géométrie', () => {
  test('faïence en rouge, palette fixe, « autre » à défaut', () => {
    assert.equal(couleurFinition('Faïence toute hauteur'), '#C62828')
    assert.equal(couleurFinition('FAIENCE'), '#C62828')
    assert.equal(finitionMur('Crédence inox').code, 'credence')
    assert.equal(finitionMur('lambris bois').code, 'lambris')
    assert.equal(finitionMur('carrelage mural 20 × 20').code, 'carrelage-mural')
    assert.equal(finitionMur('peinture lessivable').code, 'peinture')
    assert.equal(finitionMur('pierre apparente').code, 'autre')
    assert.equal(finitionMur(null).code, 'autre')
    // Une couleur par finition, toutes distinctes
    assert.equal(new Set(FINITIONS_MUR.map((f) => f.couleur)).size, FINITIONS_MUR.length)
  })
  test('finitionPropre : texte borné et en capitale, statut lu, mur complet exigé', () => {
    assert.deepEqual(finitionPropre({ xa: 0, ya: 0, xb: 4, yb: 0, valeur: '  faïence   toute hauteur ', statut: 'deposer', extrait: ' à  déposer ' }),
      { xa: 0, ya: 0, xb: 4, yb: 0, valeur: 'Faïence toute hauteur', statut: 'deposer', extrait: 'à déposer' })
    assert.equal(finitionPropre({ xa: 0, ya: 0, xb: 4, yb: 0, valeur: 'Lambris', statut: 'a-preciser' }).statut, null)
    assert.equal(finitionPropre({ xa: 0, ya: 0, xb: 4, yb: 0, valeur: '   ' }), null)
    assert.equal(finitionPropre({ xa: 0, ya: 0, xb: 0, yb: 0, valeur: 'Faïence' }), null)
    assert.equal(finitionPropre({ xa: 0, ya: 0, xb: null, yb: 0, valeur: 'Faïence' }), null)
  })
  test('trait décalé vers l’intérieur de la pièce, dans les deux repères', () => {
    // Mur du bas, parcouru de gauche à droite : l'intérieur est au-dessus (y vers le haut)
    const sens = sensInterieurCote([0, 0], [4, 0], contour)
    assert.deepEqual(decalageFinition([0, 0], [4, 0], { sens, ecart: 0.1 }), { a: [0, 0.1], b: [4, 0.1], normale: [0, 1] })
    // Le même mur à l'écran (y vers le bas : il est en bas de l'image, l'intérieur au-dessus)
    assert.deepEqual(decalageFinition([0, 300], [400, 300], { sens, ecart: 5, yVersLeBas: true }), { a: [0, 295], b: [400, 295], normale: [0, -1] })
    // Mur du haut, parcouru de droite à gauche
    const s2 = sensInterieurCote([4, 3], [0, 3], contour)
    assert.deepEqual(decalageFinition([4, 3], [0, 3], { sens: s2, ecart: 0.1 }).a, [4, 2.9])
    assert.equal(decalageFinition([1, 1], [1, 1]), null)
  })
  test('une finition se touche le long de son mur (onglet « Plans ») ; la relecture « liaisons et cotes » ne la montre pas', () => {
    const f = { id: 'f1', sorte: 'finition', affaire_id: 'a', niveau_id: 'n1', piece_id: 'p1', xa: 0, ya: 0, xb: 4, yb: 0, valeur: 'Faïence', a_valider: false }
    assert.deepEqual(extremitesFinition(f), [[0, 0], [4, 0]])
    assert.equal(extremitesFinition({ ...f, sorte: 'cote' }), null)
    assert.equal(traceProche([f], [], [2, 0.1], 0.2)?.id, 'f1')
    assert.equal(traceProche([f], [], [2, 1], 0.2), null)
    assert.deepEqual(SORTES_TRACE, ['commande', 'cote'])
    assert.deepEqual(SORTES_TRACE_FINITIONS, ['commande', 'cote', 'finition'])
    // La relecture « liaisons et cotes » ne les montre pas
    assert.deepEqual(tracesRelecture([f], 'p1', []), [])
  })
})

describe('lecture des traces avec la sonde de la 085', () => {
  const lignes = [{ id: 't1', sorte: 'cote', sonde_finitions: null }]
  test('avec la 085 : traces sans la colonne de sonde, finitions disponibles', async () => {
    assert.deepEqual(await lectureTracesEtFinitions(async () => lignes, async () => { throw new Error('pas appelé') }),
      { traces: [{ id: 't1', sorte: 'cote' }], tracesDisponibles: true, finitionsDisponibles: true })
  })
  test('sans la 085 : relues sans la sonde, finitions indisponibles', async () => {
    const manque = { code: '42703', message: 'column edl_traces.statut does not exist' }
    assert.equal(finitionsIndisponibles(manque), true)
    assert.equal(finitionsIndisponibles({ code: '42703', message: 'column edl_traces.autre does not exist' }), false)
    assert.deepEqual(await lectureTracesEtFinitions(async () => { throw manque }, async () => [{ id: 't1' }]),
      { traces: [{ id: 't1' }], tracesDisponibles: true, finitionsDisponibles: false })
  })
  test('sans la 084 : ni traces ni finitions ; une autre erreur remonte', async () => {
    const table = { code: '42P01', message: 'relation "edl_traces" does not exist' }
    assert.deepEqual(await lectureTracesEtFinitions(async () => { throw table }, async () => []),
      { traces: [], tracesDisponibles: false, finitionsDisponibles: false })
    await assert.rejects(lectureTracesEtFinitions(async () => { throw { code: '57014' } }, async () => []), (e) => e.code === '57014')
  })
})

describe('aide-mémoire : la rubrique des murs', () => {
  const piece = { id: 'p1', fiche: {} }
  const murs = (r) => r.groupes.flatMap((g) => g.rubriques).find((x) => x.cle === 'murs')
  test('avec la 085 : dit de toucher le mur, et une finition de mur la coche', () => {
    const f = { id: 'f1', sorte: 'finition', piece_id: 'p1', xa: 0, ya: 0, xb: 4, yb: 0, valeur: 'Faïence' }
    const sans = aideMemoire(piece, { traces: [], tracesDisponibles: true, finitionsDisponibles: true })
    assert.equal(murs(sans).aide, 'revêtement, état ; finitions particulières (faïence…) : touchez le mur et dites-la')
    assert.equal(murs(sans).fait, false)
    const avec = aideMemoire(piece, { traces: [f], tracesDisponibles: true, finitionsDisponibles: true })
    assert.equal(murs(avec).fait, true)
    // Une finition ne coche pas « liaisons et cotes »
    assert.equal(avec.groupes.find((g) => g.cle === 'traces').rubriques[0].fait, false)
  })
  test('sans la 085 : le texte d’avant', () => {
    assert.equal(murs(aideMemoire(piece, { tracesDisponibles: true })).aide, 'revêtement, faïence, état')
  })
})

// ─── Analyse ─────────────────────────────────────────────────────────────────

// 18 novembre 2026 : heure d'hiver, Paris = UTC + 1
const H = (hms) => `2026-11-18T${hms}.000Z`
let n = 0
const dans = (type, hms, champs = {}) => ({ id: `e${++n}`, visite_id: 'v1', type, niveau_id: 'n1', piece_id: 'sdb', point_id: null, le: H(hms), detail: {}, ...champs })
const murBas = { xa: 0, ya: 0, xb: 4, yb: 0, index: 0, longueur: 4 }
const murHaut = { xa: 4, ya: 3, xb: 0, yb: 3, index: 2, longueur: 4 }
const murDroit = { xa: 4, ya: 0, xb: 4, yb: 3.2, index: 1, longueur: 3.2 }

describe('analyse : murs touchés dans la frise', () => {
  const evenements = [
    dans('entree', '09:00:00'),
    dans('mur-touche', '09:00:10', { detail: murDroit }),
    dans('mur-touche', '09:00:30', { detail: murBas }),
    // Le même mur, touché dans l'autre sens : même nom
    dans('mur-touche', '09:00:40', { detail: { ...murDroit, xa: 4, ya: 3.2, xb: 4, yb: 0 } }),
    dans('mur-touche', '09:00:50', { piece_id: 'cuisine', detail: murHaut }),
    dans('sortie', '09:02:00'),
  ]
  const enregistrements = [{ visite_id: 'v1', debut: H('09:00:00'), segments: [{ debut_s: 11, fin_s: 14, texte: 'faïence toute hauteur, à déposer' }] }]
  const intervalles = intervallesPiece(evenements, 'sdb')
  const traces = [
    { id: 'f-ok', sorte: 'finition', piece_id: 'sdb', ...murBas, valeur: 'Crédence inox', statut: 'conserver', a_valider: false },
    // Proposition pas encore relue : remplacée, pas « déjà relevée »
    { id: 'f-ia', sorte: 'finition', piece_id: 'sdb', ...murDroit, valeur: 'Faïence', a_valider: true, origine: 'ia' },
    // Relevée sur un mur jamais touché
    { id: 'f-main', sorte: 'finition', piece_id: 'sdb', xa: 0, ya: 3, xb: 0, yb: 0, valeur: 'Lambris', a_valider: false },
  ]
  const frise = friseDePiece({ piece: { id: 'sdb' }, intervalles, evenements, enregistrements, traces, finitions: true })

  test('M<n> dans l’ordre du premier toucher, longueur du mur', () => {
    assert.deepEqual(frise.lignes, [
      '— visite du 18/11/2026 —',
      '[10:00:00] entrée dans la pièce',
      '[10:00:10] mur M1 touché (3,20 m)',
      '[10:00:11] « faïence toute hauteur, à déposer »',
      '[10:00:30] mur M2 touché (4,00 m)',
      '[10:00:40] mur M1 touché (3,20 m)',
      '[10:02:00] sortie de la pièce',
    ])
    assert.deepEqual([...frise.contexteTraces.murs.keys()], ['M1', 'M2'])
  })
  test('murs touchés et finitions déjà relevées décrits pour Claude', () => {
    assert.deepEqual(frise.lignesTraces.slice(-4), [
      'Murs touchés dans la pièce : M1 (3,20 m), M2 (4,00 m).',
      'Finitions de murs déjà relevées (2) :',
      '- M2 : Crédence inox (statut : conserver)',
      '- mur de 3,00 m : Lambris',
    ])
  })
  test('sans la 085 (ou sans traces lues) : frise et lignes de la 084, à l’identique', () => {
    const sans = friseDePiece({ piece: { id: 'sdb' }, intervalles, evenements, enregistrements, traces })
    assert.ok(!sans.lignes.some((l) => l.includes('mur')))
    assert.equal(sans.contexteTraces.murs, undefined)
    assert.ok(!sans.lignesTraces.some((l) => l.includes('Murs')))
    const sansTraces = friseDePiece({ piece: { id: 'sdb' }, intervalles, evenements, enregistrements, traces: null, finitions: true })
    assert.equal(sansTraces.contexteTraces, null)
    assert.ok(!sansTraces.lignes.some((l) => l.includes('mur')))
  })
  test('pièce sans mur touché', () => {
    const vide = friseDePiece({ piece: { id: 'bureau' }, intervalles: [], evenements: [], traces: [], finitions: true })
    assert.equal(vide.lignesTraces.at(-1), 'Aucun mur touché dans la pièce.')
  })

  describe('lecture de `finitionsMurs`', () => {
    const lire = (finitionsMurs) => lireAnalyse({ fiche: {}, elements: [], liaisons: [], cotes: [], finitionsMurs }, frise.references, frise.contexteTraces).traces.finitions
    test('mur connu, finition non vide, statut lu', () => {
      assert.deepEqual(lire([{ mur: 'M1', finition: 'faïence toute hauteur', statut: 'deposer', extrait: 'faïence toute hauteur, à déposer' }]), [
        { xa: 4, ya: 0, xb: 4, yb: 3.2, valeur: 'Faïence toute hauteur', statut: 'deposer', extrait: 'faïence toute hauteur, à déposer' },
      ])
      // « m1 », « 1 » : même mur ; statut inconnu → null
      assert.equal(lire([{ mur: 'm1', finition: 'Faïence', statut: 'a-preciser', extrait: '' }])[0].statut, null)
      assert.equal(lire([{ mur: '1', finition: 'Faïence', statut: null, extrait: '' }]).length, 1)
    })
    test('écartées : mur inconnu, finition vide, doublon, déjà relevée', () => {
      assert.deepEqual(lire([
        { mur: 'M9', finition: 'Faïence', statut: null, extrait: '' },
        { mur: 'M1', finition: '  ', statut: null, extrait: '' },
        { mur: 'M1', finition: 'Faïence', statut: null, extrait: '' },
        { mur: 'M1', finition: 'faïence', statut: 'deposer', extrait: '' },
        { mur: 'M2', finition: 'crédence inox', statut: null, extrait: '' },
        null,
      ]).map((f) => f.valeur), ['Faïence'])
      assert.deepEqual(lire(undefined), [])
    })
    test('sans la 085 : pas de clé `finitions`', () => {
      const sans = friseDePiece({ piece: { id: 'sdb' }, intervalles, evenements, enregistrements, traces })
      const r = lireAnalyse({ fiche: {}, elements: [], finitionsMurs: [{ mur: 'M1', finition: 'Faïence' }] }, sans.references, sans.contexteTraces)
      assert.equal('finitions' in r.traces, false)
    })
    test('lignes de `p_traces` : extrémités du mur, finition, statut, visite', () => {
      const finitions = lire([{ mur: 'M1', finition: 'faïence', statut: 'rafraichir', extrait: 'faïence' }])
      assert.deepEqual(lignesTracesIa({ traces: { liaisons: [], cotes: [], finitions }, visiteId: 'v1', nouvelId: () => 'id-1' }), [
        { id: 'id-1', sorte: 'finition', visite_id: 'v1', xa: 4, ya: 0, xb: 4, yb: 3.2, valeur: 'Faïence', statut: 'rafraichir', extrait: 'faïence' },
      ])
    })
  })
})

describe('analyse : demande et schéma', () => {
  const base = { piece: { nom: 'Salle de bains' }, lignes: ['[10:00:10] mur M1 touché (3,20 m)'], traces: ['Murs touchés dans la pièce : M1 (3,20 m).'] }
  test('avec la 085 : consignes et schéma des finitions en plus de ceux de la 084', () => {
    const d = construireDemandeAnalyse({ ...base, finitions: true })
    assert.equal(d.system, consignesAnalyse(true, true))
    assert.ok(d.system.endsWith(CONSIGNES_FINITIONS))
    assert.ok(d.system.includes(CONSIGNES_TRACES))
    assert.match(CONSIGNES_FINITIONS, /juste avant ou juste après un mur touché/)
    assert.match(CONSIGNES_FINITIONS, /Jamais sans mur touché/)
    assert.equal(d.output_config.format.schema, SCHEMA_ANALYSE_FINITIONS)
    assert.deepEqual(SCHEMA_ANALYSE_FINITIONS.required, [...SCHEMA_ANALYSE_TRACES.required, 'finitionsMurs'])
    const item = SCHEMA_ANALYSE_FINITIONS.properties.finitionsMurs.items
    assert.equal(item.additionalProperties, false)
    assert.deepEqual(item.required, ['mur', 'finition', 'statut', 'extrait'])
    assert.deepEqual(item.properties.statut, { anyOf: [{ type: 'string', enum: ['conserver', 'rafraichir', 'deposer'] }, { type: 'null' }] })
  })
  test('sans la 085, ou sans traces : la demande d’avant, à l’identique', () => {
    assert.deepEqual(construireDemandeAnalyse(base), construireDemandeAnalyse({ ...base, finitions: false }))
    assert.equal(construireDemandeAnalyse(base).output_config.format.schema, SCHEMA_ANALYSE_TRACES)
    const sansTraces = construireDemandeAnalyse({ piece: base.piece, lignes: base.lignes, finitions: true })
    assert.equal(sansTraces.system, consignesAnalyse(false))
    assert.equal(sansTraces.output_config.format.schema, schemaAnalyse(false))
  })
  test('le serveur accepte `finitionsMurs` booléen ou absent', () => {
    const corps = { piece: { nom: 'Salle de bains' }, lignes: [], tracesPiece: [] }
    assert.equal(erreurDemandeAnalyse(corps), null)
    assert.equal(erreurDemandeAnalyse({ ...corps, finitionsMurs: true }), null)
    assert.equal(erreurDemandeAnalyse({ ...corps, finitionsMurs: 'oui' }), 'finitions')
  })
})
