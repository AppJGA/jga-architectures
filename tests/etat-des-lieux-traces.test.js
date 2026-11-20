// État des lieux : liaisons interrupteur → luminaire et cotes entre angles
// (migration 084). Règles communes (tracesEdl.js) et file de la visite
// (fileEdlLogique.js). Pièces et points inventés : aucun plan réel dans le
// dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  SORTES_TRACE, TYPES_INTERRUPTEUR, TYPES_LUMINAIRE, TYPES_JOURNAL_TRACES, liaisonPossible, liaisonExiste,
  angleLePlusProche, longueurCote, valeurCote, texteValeur, traceValide, nouvelleTrace, tracesIndisponibles, lectureTraces,
  champsModificationTrace, tracesAExporter, typeEffectif, avecTypeEffectif,
} from '../src/modules/etude/etat-des-lieux/tracesEdl.js'
import {
  debutRelier, debutCoter, consigneMode, toucherRelier, toucherCoter, courbeCommande, traitsCote, traceProche,
  extremitesTrace, texteCote, libelleTrace, tracesDeLaPiece, gesteSuppressionPoint, FLECHE_COMMANDE,
  sensInterieurCote, placerValeurCote, COULEUR_TRAIT_COTE,
} from '../src/modules/etude/etat-des-lieux/visite/tracesVisiteLogique.js'
import { aideMemoire } from '../src/modules/etude/etat-des-lieux/visite/aideMemoireLogique.js'
import { typeEdl } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'
import {
  TYPES_EDL, operationEdl, appliquerOperationEdl, etatAvecFileEdl, operationInverse, envoyerTrace,
  erreurTracesIndisponibles, journalSansMigration, insererSansPieceDisparue, pointDisparu,
} from '../src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js'

const AFF = 'aff-1'
const pt = (id, numero, type) => ({ id, numero, type, visite_id: 'v1', affaire_id: AFF, niveau_id: 'n1', piece_id: 'p1', x: numero, y: 1 })
const inter = pt('i1', 1, 'interrupteur')
const lum = pt('l1', 2, 'luminaire')
const applique = pt('l2', 3, 'applique')
const prise = pt('pr', 4, 'prise')

describe('traces : sortes et types', () => {
  test('deux sortes ; les types d’interrupteur et de luminaire existent dans les calques', () => {
    assert.deepEqual(SORTES_TRACE, ['commande', 'cote'])
    for (const t of [...TYPES_INTERRUPTEUR, ...TYPES_LUMINAIRE]) assert.equal(typeEdl(t)?.calque, 'electricite', t)
    assert.deepEqual(TYPES_JOURNAL_TRACES, ['point-touche', 'angle-touche', 'trace', 'trace-supprimee'])
  })
})

describe('liaisons : interrupteur et luminaire', () => {
  test('dans un sens ou dans l’autre, rendus dans l’ordre interrupteur → luminaire', () => {
    assert.deepEqual(liaisonPossible(inter, lum), { interrupteur: inter, luminaire: lum })
    assert.deepEqual(liaisonPossible(lum, inter), { interrupteur: inter, luminaire: lum })
    assert.deepEqual(liaisonPossible(applique, inter), { interrupteur: inter, luminaire: applique })
    assert.deepEqual(liaisonPossible(inter, pt('d', 5, 'dalle')).luminaire.id, 'd')
    assert.deepEqual(liaisonPossible(pt('r', 6, 'reglette'), inter).luminaire.id, 'r')
  })
  test('refusée : deux interrupteurs, deux luminaires, une prise, un point sans type, le même point', () => {
    assert.equal(liaisonPossible(inter, pt('i2', 7, 'interrupteur')), null)
    assert.equal(liaisonPossible(lum, applique), null)
    assert.equal(liaisonPossible(inter, prise), null)
    assert.equal(liaisonPossible(prise, lum), null)
    assert.equal(liaisonPossible(inter, pt('x', 8, null)), null)
    assert.equal(liaisonPossible(inter, inter), null)
    assert.equal(liaisonPossible(inter, null), null)
  })
  test('une liaison déjà posée se reconnaît, dans les deux sens', () => {
    const traces = [{ id: 't', sorte: 'commande', point_a: 'i1', point_b: 'l1' }, { id: 'c', sorte: 'cote', xa: 0, ya: 0, xb: 1, yb: 0 }]
    assert.equal(liaisonExiste(traces, 'i1', 'l1'), true)
    assert.equal(liaisonExiste(traces, 'i1', 'l2'), false)
    assert.equal(liaisonExiste([], 'i1', 'l1'), false)
    // Dans l'autre sens aussi (point dont le type a changé depuis)
    assert.equal(liaisonExiste(traces, 'l1', 'i1'), true)
  })
})

describe('cotes : angles, longueur et valeur', () => {
  // Pièce en L inventée
  const contour = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 3], [0, 3]]
  test('l’angle le plus proche du toucher', () => {
    assert.deepEqual(angleLePlusProche(contour, [3.8, 0.3]), [4, 0])
    assert.deepEqual(angleLePlusProche(contour, [2.2, 2.1]), [2, 2])
    assert.deepEqual(angleLePlusProche(contour, [-1, 4]), [0, 3])
    assert.equal(angleLePlusProche([], [0, 0]), null)
    assert.equal(angleLePlusProche(null, [0, 0]), null)
  })
  test('l’angle rendu est une copie : le contour de la pièce ne bouge pas', () => {
    const a = angleLePlusProche(contour, [0.1, 0.1])
    a[0] = 99
    assert.deepEqual(contour[0], [0, 0])
  })
  test('longueur dessinée en mètres ; rien pour une liaison ou une cote incomplète', () => {
    assert.equal(longueurCote({ sorte: 'cote', xa: 0, ya: 0, xb: 3, yb: 4 }), 5)
    assert.equal(longueurCote({ sorte: 'cote', xa: '1', ya: '1', xb: '1', yb: '3.5' }), 2.5)
    assert.equal(longueurCote({ sorte: 'cote', xa: 0, ya: 0, xb: null, yb: 4 }), null)
    assert.equal(longueurCote({ sorte: 'commande', point_a: 'a', point_b: 'b' }), null)
  })
  test('valeur lue dans ce qui est dit ou tapé', () => {
    assert.equal(valeurCote('3,45'), 3.45)
    assert.equal(valeurCote('3.45 m'), 3.45)
    assert.equal(valeurCote(' 3,45 m '), 3.45)
    assert.equal(valeurCote('3,45 mètres'), 3.45)
    assert.equal(valeurCote('345 cm'), 3.45)
    assert.equal(valeurCote('3450 mm'), 3.45)
    assert.equal(valeurCote('3 m 45'), 3.45)
    assert.equal(valeurCote('3m45'), 3.45)
    assert.equal(valeurCote('3 m 5'), 3.05)
    assert.equal(valeurCote('3 mètres 50 cm'), 3.5)
    assert.equal(valeurCote('12'), 12)
    assert.equal(valeurCote(2.5), 2.5)
  })
  test('valeur illisible ou nulle : rien', () => {
    for (const v of ['', '  ', 'trois mètres', '0', '0 m', '-2 m', '3 m 455', 'environ 3 m', null, undefined, NaN, 0, {}]) {
      assert.equal(valeurCote(v), null, String(v))
    }
  })
  test('texte enregistré : « 3,45 m », deux décimales', () => {
    assert.equal(texteValeur(3.45), '3,45 m')
    assert.equal(texteValeur(3), '3,00 m')
    assert.equal(texteValeur(2.456), '2,46 m')
    assert.equal(texteValeur(valeurCote('345 cm')), '3,45 m')
    assert.equal(texteValeur(null), null)
    assert.equal(texteValeur(0), null)
    assert.equal(texteValeur('abc'), null)
  })
})

describe('traces neuves et validité', () => {
  test('une liaison posée à la main : identifiant de l’appareil, interrupteur puis luminaire', () => {
    const t = nouvelleTrace({ sorte: 'commande', affaireId: AFF, visiteId: 'v1', niveauId: 'n1', pieceId: 'p1', interrupteur: inter, luminaire: lum })
    assert.match(t.id, /^[0-9a-f-]{36}$/)
    assert.equal(t.point_a, 'i1')
    assert.equal(t.point_b, 'l1')
    assert.equal(t.origine, 'main')
    assert.equal(t.a_valider, false)
    assert.equal(t.xa, null)
    assert.equal(traceValide(t), true)
    assert.equal(nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', interrupteur: 'i1', luminaire: 'l1' }).point_b, 'l1')
  })
  test('une cote : deux angles, valeur facultative', () => {
    const t = nouvelleTrace({ sorte: 'cote', affaireId: AFF, visiteId: 'v1', niveauId: 'n1', pieceId: 'p1', a: [0, 0], b: [3.45, 0] })
    assert.deepEqual([t.xa, t.ya, t.xb, t.yb], [0, 0, 3.45, 0])
    assert.equal(t.valeur, null)
    assert.equal(t.point_a, null)
    assert.equal(traceValide(t), true)
    assert.equal(nouvelleTrace({ sorte: 'cote', affaireId: AFF, niveauId: 'n1', a: [0, 0], b: [1, 0], valeur: '1,00 m' }).valeur, '1,00 m')
  })
  test('invalides : point manquant ou répété, angle manquant, même angle, sorte inconnue, sans étage', () => {
    const base = { id: 'x', affaire_id: AFF, niveau_id: 'n1' }
    assert.equal(traceValide({ ...base, sorte: 'commande', point_a: 'i1', point_b: null }), false)
    assert.equal(traceValide({ ...base, sorte: 'commande', point_a: 'i1', point_b: 'i1' }), false)
    assert.equal(traceValide({ ...base, sorte: 'cote', xa: 0, ya: 0, xb: 1, yb: null }), false)
    assert.equal(traceValide({ ...base, sorte: 'cote', xa: 1, ya: 1, xb: 1, yb: 1 }), false)
    assert.equal(traceValide({ ...base, sorte: 'fleche', point_a: 'a', point_b: 'b' }), false)
    assert.equal(traceValide({ ...base, sorte: 'commande', point_a: 'a', point_b: 'b', origine: 'autre' }), false)
    assert.equal(traceValide({ id: 'x', affaire_id: AFF, sorte: 'commande', point_a: 'a', point_b: 'b' }), false)
    assert.equal(traceValide(null), false)
  })
})

describe('base sans la migration 084', () => {
  test('table inconnue de PostgreSQL ou du cache de PostgREST', () => {
    assert.equal(tracesIndisponibles({ code: '42P01', message: 'relation "public.edl_traces" does not exist' }), true)
    assert.equal(tracesIndisponibles({ code: 'PGRST205', message: 'Could not find the table \'public.edl_traces\' in the schema cache' }), true)
    assert.equal(tracesIndisponibles({ code: 'PGRST205', message: '' }), true)
    assert.equal(tracesIndisponibles({ message: 'relation "edl_traces" does not exist' }), true)
  })
  test('une autre table manquante, une autre erreur : pas la 084', () => {
    assert.equal(tracesIndisponibles({ code: '42P01', message: 'relation "public.edl_points" does not exist' }), false)
    assert.equal(tracesIndisponibles({ code: '23505', message: 'duplicate key value violates unique constraint "edl_traces_pkey"' }), false)
    assert.equal(tracesIndisponibles({ code: '42501', message: 'permission denied for table edl_traces' }), false)
    assert.equal(tracesIndisponibles(null), false)
  })
  test('lecture : avec la table, les traces ; sans elle, aucune et le drapeau faux ; autre erreur, levée', async () => {
    const lignes = [{ id: 't1', sorte: 'commande' }]
    assert.deepEqual(await lectureTraces(async () => lignes), { traces: lignes, tracesDisponibles: true })
    assert.deepEqual(await lectureTraces(async () => null), { traces: [], tracesDisponibles: true })
    assert.deepEqual(
      await lectureTraces(async () => { throw { code: 'PGRST205', message: 'Could not find the table \'public.edl_traces\' in the schema cache' } }),
      { traces: [], tracesDisponibles: false },
    )
    await assert.rejects(lectureTraces(async () => { throw { code: '57014', message: 'délai' } }), (e) => e.code === '57014')
  })
  test('journal : un toucher refusé par l’ancienne contrainte de type est abandonné, pas une entrée', () => {
    const refus = { code: '23514', message: 'violates check constraint "edl_evenements_type_check"' }
    assert.equal(journalSansMigration({ type: 'point-touche' }, refus), true)
    assert.equal(journalSansMigration({ type: 'angle-touche' }, refus), true)
    assert.equal(journalSansMigration({ type: 'trace-supprimee' }, refus), true)
    assert.equal(journalSansMigration({ type: 'entree' }, refus), false)
    assert.equal(journalSansMigration({ type: 'point-touche' }, null), false)
    assert.equal(journalSansMigration({ type: 'point-touche' }, { code: '23505' }), false)
  })
})

// Une table edl_traces en mémoire, avec les mêmes réponses que la base :
// doublon 23505, lignes touchées comptées, table absente si `sansTable`.
function baseSimulee({ sansTable = false, refusEcriture = false, piecesConnues = null } = {}) {
  const lignes = new Map()
  const absente = { code: 'PGRST205', message: 'Could not find the table \'public.edl_traces\' in the schema cache' }
  const appels = []
  return {
    lignes,
    appels,
    inserer: async (ligne) => {
      appels.push(['inserer', ligne.id])
      if (sansTable) return absente
      if (piecesConnues && ligne.piece_id && !piecesConnues.has(ligne.piece_id)) {
        return { code: '23503', message: 'insert or update on table "edl_traces" violates foreign key constraint "edl_traces_piece_id_fkey"', details: 'Key (piece_id)=(x) is not present in table "edl_pieces".' }
      }
      if (lignes.has(ligne.id)) return { code: '23505', message: 'duplicate key value violates unique constraint "edl_traces_pkey"' }
      lignes.set(ligne.id, { ...ligne })
      return null
    },
    modifier: async (id, champs) => {
      appels.push(['modifier', id])
      if (sansTable) return { error: absente, nombre: 0 }
      if (refusEcriture || !lignes.has(id)) return { error: null, nombre: 0 }
      lignes.set(id, { ...lignes.get(id), ...champs })
      return { error: null, nombre: 1 }
    },
    supprimer: async (id) => {
      appels.push(['supprimer', id])
      if (sansTable) return { error: absente, nombre: 0 }
      if (refusEcriture) return { error: null, nombre: 0 }
      return { error: null, nombre: lignes.delete(id) ? 1 : 0 }
    },
    existe: async (id) => lignes.has(id),
  }
}

describe('file de la visite : traces', () => {
  const op = (type, charge, creeLe) => operationEdl(type, charge, { affaireId: AFF, creeLe })
  const vide = () => ({ etat: { id: 'e1' }, niveaux: [], pieces: [], visites: [], points: [inter, lum, applique], photos: [], entrees: [] })
  const commande = nouvelleTrace({ sorte: 'commande', affaireId: AFF, visiteId: 'v1', niveauId: 'n1', pieceId: 'p1', interrupteur: inter, luminaire: lum })
  const cote = nouvelleTrace({ sorte: 'cote', affaireId: AFF, visiteId: 'v1', niveauId: 'n1', pieceId: 'p1', a: [0, 0], b: [3.45, 0] })

  test('trois types d’opération de plus', () => {
    assert.equal(TYPES_EDL.traceCreer, 'trace.creer')
    assert.equal(TYPES_EDL.traceModifier, 'trace.modifier')
    assert.equal(TYPES_EDL.traceSupprimer, 'trace.supprimer')
  })
  test('hors ligne : créer, modifier, supprimer — l’écran suit la file', () => {
    const file = [
      op(TYPES_EDL.traceCreer, { trace: commande }, 1),
      op(TYPES_EDL.traceCreer, { trace: cote }, 2),
      op(TYPES_EDL.traceModifier, { id: cote.id, champs: { valeur: '3,45 m' } }, 3),
    ]
    let e = etatAvecFileEdl(vide(), file)
    assert.deepEqual(e.traces.map((t) => t.id), [commande.id, cote.id])
    assert.equal(e.traces[1].valeur, '3,45 m')
    e = etatAvecFileEdl(vide(), [...file, op(TYPES_EDL.traceSupprimer, { id: commande.id }, 4)])
    assert.deepEqual(e.traces.map((t) => t.id), [cote.id])
  })
  test('instantané d’avant la 084 (sans `traces`) : la file l’en dote ; sans trace, il reste tel quel', () => {
    const avant = vide()
    assert.equal('traces' in etatAvecFileEdl(avant, []), false)
    assert.equal(etatAvecFileEdl(avant, [op(TYPES_EDL.traceCreer, { trace: cote }, 1)]).traces.length, 1)
    assert.deepEqual(etatAvecFileEdl(avant, [op(TYPES_EDL.traceSupprimer, { id: 'rien' }, 1)]).traces, [])
  })
  test('créer deux fois la même trace (envoi rejoué) n’en fait qu’une', () => {
    const o = op(TYPES_EDL.traceCreer, { trace: commande }, 1)
    assert.equal(appliquerOperationEdl(appliquerOperationEdl(vide(), o), o).traces.length, 1)
  })
  test('supprimer un point emporte ses liaisons, pas les cotes ; le rendre par « Annuler » les rend', () => {
    const autre = nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', interrupteur: inter, luminaire: applique })
    const avec = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.traceCreer, { trace: commande }, 1),
      op(TYPES_EDL.traceCreer, { trace: autre }, 2),
      op(TYPES_EDL.traceCreer, { trace: cote }, 3),
    ])
    const sans = appliquerOperationEdl(avec, op(TYPES_EDL.pointSupprimer, { id: 'l1' }, 4))
    assert.deepEqual(sans.traces.map((t) => t.id), [autre.id, cote.id])
    const inverse = operationInverse({ type: 'suppression', point: lum, photos: [], traces: [commande] }, sans.points)
    assert.deepEqual(inverse.charge.traces, [commande])
    const rendu = appliquerOperationEdl(sans, op(inverse.type, inverse.charge, 5))
    assert.deepEqual(rendu.traces.map((t) => t.id).sort(), [autre.id, commande.id, cote.id].sort())
  })
  test('« Annuler » : une création se défait par une suppression, et inversement', () => {
    assert.deepEqual(operationInverse({ type: 'trace-creation', trace: commande }, []), {
      type: TYPES_EDL.traceSupprimer, charge: { id: commande.id }, evenement: 'trace-supprimee', traceId: commande.id,
    })
    assert.deepEqual(operationInverse({ type: 'trace-suppression', trace: cote }, []), {
      type: TYPES_EDL.traceCreer, charge: { trace: cote }, evenement: 'trace', traceId: cote.id,
    })
    assert.deepEqual(operationInverse({ type: 'trace-modification', id: cote.id, avant: { valeur: null } }, []), {
      type: TYPES_EDL.traceModifier, charge: { id: cote.id, champs: { valeur: null } }, evenement: 'trace', traceId: cote.id,
    })
  })
  test('« Annuler » d’une suppression de point sans liaison : charge inchangée', () => {
    const inv = operationInverse({ type: 'suppression', point: lum, photos: [] }, [])
    assert.equal('traces' in inv.charge, false)
  })

  test('envoi : la file part dans l’ordre, la base et l’instantané finissent d’accord', async () => {
    const base = baseSimulee()
    const file = [
      op(TYPES_EDL.traceCreer, { trace: commande }, 1),
      op(TYPES_EDL.traceCreer, { trace: cote }, 2),
      op(TYPES_EDL.traceModifier, { id: cote.id, champs: { valeur: '3,45 m' } }, 3),
      op(TYPES_EDL.traceSupprimer, { id: commande.id }, 4),
    ]
    let instantane = vide()
    for (const o of file) {
      await envoyerTrace(o, base)
      instantane = appliquerOperationEdl(instantane, o)
    }
    assert.deepEqual([...base.lignes.keys()], [cote.id])
    assert.equal(base.lignes.get(cote.id).valeur, '3,45 m')
    assert.deepEqual(instantane.traces, [{ ...cote, valeur: '3,45 m' }])
  })
  test('envoi rejoué : le doublon (23505) vaut succès, la suppression déjà faite aussi', async () => {
    const base = baseSimulee()
    const creer = op(TYPES_EDL.traceCreer, { trace: commande }, 1)
    await envoyerTrace(creer, base)
    await envoyerTrace(creer, base)
    assert.equal(base.lignes.size, 1)
    const supprimer = op(TYPES_EDL.traceSupprimer, { id: commande.id }, 2)
    await envoyerTrace(supprimer, base)
    await envoyerTrace(supprimer, base)
    assert.equal(base.lignes.size, 0)
  })
  test('refus silencieux : modification sans ligne touchée, suppression d’une trace encore là', async () => {
    const base = baseSimulee({ refusEcriture: true })
    await envoyerTrace(op(TYPES_EDL.traceCreer, { trace: cote }, 1), base)
    await assert.rejects(envoyerTrace(op(TYPES_EDL.traceModifier, { id: cote.id, champs: { valeur: '1,00 m' } }, 2), base), /rien modifié/)
    await assert.rejects(envoyerTrace(op(TYPES_EDL.traceSupprimer, { id: cote.id }, 3), base), /pas supprimé/)
  })
  test('point supprimé au bureau pendant l’attente : liaison et modification tenues pour faites', async () => {
    const base = baseSimulee()
    const inserer = base.inserer
    base.inserer = async (ligne) => (ligne.point_b === 'disparu'
      ? { code: '23503', message: 'insert or update on table "edl_traces" violates foreign key constraint "edl_traces_point_b_fkey"', details: 'Key (point_b)=(disparu) is not present in table "edl_points".' }
      : inserer(ligne))
    await envoyerTrace(op(TYPES_EDL.traceCreer, { trace: { ...commande, point_b: 'disparu' } }, 1), base)
    assert.equal(base.lignes.size, 0)
    // La trace est partie en cascade avec son point : rien à modifier
    await envoyerTrace(op(TYPES_EDL.traceModifier, { id: 'partie', champs: { valeur: '1,00 m' } }, 2), base)
    assert.equal(pointDisparu({ code: '23503', details: 'Key (point_a)=(x) is not present' }), true)
    assert.equal(pointDisparu({ code: '23503', details: 'Key (piece_id)=(x) is not present' }), false)
  })
  test('table absente (sans la 084) : refus définitif, l’opération est mise de côté d’emblée', async () => {
    const base = baseSimulee({ sansTable: true })
    for (const o of [
      op(TYPES_EDL.traceCreer, { trace: cote }, 1),
      op(TYPES_EDL.traceModifier, { id: cote.id, champs: { valeur: '1,00 m' } }, 2),
      op(TYPES_EDL.traceSupprimer, { id: cote.id }, 3),
    ]) {
      await assert.rejects(envoyerTrace(o, base), (e) => e.definitif === true && /migration 084/.test(e.message))
    }
    assert.equal(erreurTracesIndisponibles().definitif, true)
  })
  test('pièce supprimée au bureau pendant l’attente : la trace part sans pièce', async () => {
    const base = baseSimulee({ piecesConnues: new Set() })
    await envoyerTrace(op(TYPES_EDL.traceCreer, { trace: cote }, 1), base)
    assert.equal(base.lignes.get(cote.id).piece_id, null)
    // même règle que les points et le journal
    const err = await insererSansPieceDisparue('edl_traces', cote, base.inserer)
    assert.equal(err?.code, '23505')
  })
})

// ─── Visite : modes « Relier » et « Coter », dessin (tâche 2) ───────────────

const proche = (a, b, eps = 1e-9) => Math.abs(a - b) < eps
const procheP = (p, q, eps = 1e-9) => proche(p[0], q[0], eps) && proche(p[1], q[1], eps)

describe('mode « Relier »', () => {
  const points = [inter, lum, applique, prise]
  test('ouvert depuis un interrupteur ou un luminaire seulement', () => {
    assert.deepEqual(debutRelier(inter), { sorte: 'relier', depuis: 'i1', attendu: 'luminaire', raison: null })
    assert.equal(debutRelier(applique).attendu, 'interrupteur')
    assert.equal(debutRelier(prise), null)
    assert.equal(debutRelier(pt('x', 9, null)), null)
    assert.equal(consigneMode(debutRelier(inter)), 'Touchez le luminaire à relier')
    assert.equal(consigneMode(debutRelier(lum)), 'Touchez l’interrupteur à relier')
    assert.equal(consigneMode(null), null)
  })
  test('le toucher d’un point compatible crée la liaison, dans l’ordre interrupteur → luminaire', () => {
    const r = toucherRelier(debutRelier(lum), inter, { points, traces: [] })
    assert.equal(r.action, 'creer')
    assert.equal(r.interrupteur.id, 'i1')
    assert.equal(r.luminaire.id, 'l1')
  })
  test('ailleurs : rien de posé, la raison est dite et le mode reste', () => {
    const mode = debutRelier(inter)
    const vide = toucherRelier(mode, null, { points })
    assert.equal(vide.action, 'refus')
    assert.equal(vide.mode.depuis, 'i1')
    assert.match(consigneMode(vide.mode), /Aucun point ici.*luminaire/)
    assert.match(toucherRelier(mode, prise, { points }).mode.raison, /P4 \(prise de courant\) n’est pas un luminaire/)
    assert.match(toucherRelier(mode, inter, { points }).mode.raison, /point de départ/)
    assert.match(toucherRelier(debutRelier(lum), applique, { points }).mode.raison, /n’est pas un interrupteur/)
    assert.match(toucherRelier({ ...mode, depuis: 'disparu' }, lum, { points }).mode.raison, /n’existe plus/)
  })
  test('une liaison existante n’est pas doublée, dans un sens comme dans l’autre', () => {
    const existante = nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', interrupteur: inter, luminaire: lum })
    const r = toucherRelier(debutRelier(lum), inter, { points, traces: [existante] })
    assert.equal(r.action, 'refus')
    assert.match(r.mode.raison, /P1 et P2 sont déjà reliés/)
    assert.equal(toucherRelier(debutRelier(inter), applique, { points, traces: [existante] }).action, 'creer')
  })
})

describe('mode « Coter »', () => {
  const contour = [[0, 0], [4, 0], [4, 3], [0, 3]]
  test('l’identifiant de la cote est décidé à l’ouverture ; consignes des deux angles', () => {
    const m = debutCoter('t-1')
    assert.deepEqual(m, { sorte: 'coter', traceId: 't-1', angles: [], raison: null })
    assert.match(debutCoter().traceId, /^[0-9a-f-]{36}$/)
    assert.equal(consigneMode(m), 'Touchez le premier angle de la cote')
    assert.equal(consigneMode({ ...m, angles: [[0, 0]] }), 'Touchez le second angle de la cote')
  })
  test('deux touchers accrochés aux angles les plus proches donnent la cote', () => {
    const r1 = toucherCoter(debutCoter('t'), contour, [0.1, -0.05], 0.3)
    assert.equal(r1.action, 'angle')
    assert.deepEqual(r1.angle, [0, 0])
    assert.deepEqual(r1.mode.angles, [[0, 0]])
    const r2 = toucherCoter(r1.mode, contour, [3.9, 0.2], 0.3)
    assert.equal(r2.action, 'creer')
    assert.deepEqual([r2.a, r2.b], [[0, 0], [4, 0]])
    // la trace qui en sort est valide, longueur 4 m
    const t = nouvelleTrace({ id: 't', sorte: 'cote', affaireId: AFF, niveauId: 'n1', a: r2.a, b: r2.b })
    assert.equal(t.id, 't')
    assert.equal(traceValide(t), true)
    assert.equal(longueurCote(t), 4)
  })
  test('refus : deux fois le même angle, trop loin de tout angle, pièce sans contour', () => {
    const r1 = toucherCoter(debutCoter('t'), contour, [0, 0])
    const meme = toucherCoter(r1.mode, contour, [0.05, 0.05])
    assert.equal(meme.action, 'refus')
    assert.match(meme.mode.raison, /même angle/)
    assert.deepEqual(meme.mode.angles, [[0, 0]])
    const loin = toucherCoter(debutCoter('t'), contour, [2, 1.5], 0.3)
    assert.equal(loin.action, 'refus')
    assert.deepEqual(loin.mode.angles, [])
    assert.match(toucherCoter(debutCoter('t'), [], [0, 0]).mode.raison, /pas de contour/)
    // sans tolérance : l'angle le plus proche, quel qu'il soit
    assert.deepEqual(toucherCoter(debutCoter('t'), contour, [2.1, 1.6]).angle, [4, 3])
  })
})

describe('dessin : courbe d’une liaison', () => {
  test('flèche de 20 % de la longueur, à gauche du sens interrupteur → luminaire (y vers le haut)', () => {
    const c = courbeCommande([0, 0], [10, 0])
    assert.equal(FLECHE_COMMANDE, 0.2)
    assert.ok(procheP(c.sommet, [5, 2]))
    assert.ok(procheP(c.controle, [5, 4]))
    // Le milieu de la courbe (t = 0,5) est bien le sommet
    assert.equal(c.points.length, 17)
    assert.ok(procheP(c.points[8], c.sommet))
    assert.ok(procheP(c.points[0], [0, 0]) && procheP(c.points[16], [10, 0]))
    // Sens inverse : de l'autre côté de la corde (toujours à gauche du sens)
    assert.ok(procheP(courbeCommande([10, 0], [0, 0]).sommet, [5, -2]))
    // Vers le haut : la gauche est à x négatif
    assert.ok(procheP(courbeCommande([0, 0], [0, 5]).sommet, [-1, 2.5]))
  })
  test('points confondus : pas de courbe ; nombre de traits réglable', () => {
    assert.equal(courbeCommande([1, 1], [1, 1]), null)
    assert.equal(courbeCommande([0, 0], [1, 1], { segments: 4 }).points.length, 5)
  })
})

describe('dessin : ligne de cote', () => {
  test('ligne, obliques à 45° centrées sur chaque bout, texte au milieu décalé vers son haut', () => {
    const t = traitsCote([0, 0], [4, 0], { tic: 2, decalage: 0.5 })
    assert.deepEqual(t.ligne, [[0, 0], [4, 0]])
    assert.equal(t.longueur, 4)
    const [o1, o2] = t.obliques
    // longueur du trait oblique = tic, à 45° de la ligne, même orientation aux deux bouts
    assert.ok(proche(Math.hypot(o1[1][0] - o1[0][0], o1[1][1] - o1[0][1]), 2))
    assert.ok(proche(Math.abs(Math.atan2(o1[1][1] - o1[0][1], o1[1][0] - o1[0][0])), Math.PI / 4))
    assert.ok(procheP([(o2[0][0] + o2[1][0]) / 2, (o2[0][1] + o2[1][1]) / 2], [4, 0]))
    assert.ok(procheP([o2[1][0] - o2[0][0], o2[1][1] - o2[0][1]], [o1[1][0] - o1[0][0], o1[1][1] - o1[0][1]]))
    assert.equal(t.texte.angle, 0)
    // « / » à l'écran comme sur le DXF : vers le haut en y vers le haut, vers y négatif en y vers le bas
    assert.ok(o1[1][1] - o1[0][1] > 0 && o1[1][0] - o1[0][0] > 0)
    const [e1] = traitsCote([0, 0], [4, 0], { tic: 2, yVersLeBas: true }).obliques
    assert.ok(e1[1][1] - e1[0][1] < 0 && e1[1][0] - e1[0][0] > 0)
    assert.ok(procheP(t.texte.position, [2, 0.5])) // y vers le haut : au-dessus
    assert.ok(procheP(traitsCote([0, 0], [4, 0], { decalage: 0.5, yVersLeBas: true }).texte.position, [2, -0.5]))
  })
  test('jamais à l’envers : de droite à gauche, le texte est retourné', () => {
    const t = traitsCote([4, 0], [0, 0], { decalage: 1 })
    assert.equal(t.texte.angle, 0)
    assert.ok(procheP(t.texte.position, [2, 1]))
    for (const [a, b] of [[[0, 0], [-3, 1]], [[0, 0], [-3, -1]], [[2, 2], [-1, 5]], [[0, 0], [3, -3]]]) {
      for (const yVersLeBas of [false, true]) {
        const { angle } = traitsCote(a, b, { yVersLeBas }).texte
        assert.ok(Math.cos((angle * Math.PI) / 180) >= -1e-9, `${a}→${b} ${yVersLeBas} : ${angle}`)
      }
    }
  })
  test('cote verticale : lue de la droite (de bas en haut) dans les deux repères', () => {
    assert.equal(traitsCote([0, 0], [0, 3]).texte.angle, 90)
    assert.equal(traitsCote([0, 3], [0, 0]).texte.angle, 90)
    assert.equal(traitsCote([0, 0], [0, 3], { yVersLeBas: true }).texte.angle, -90)
    assert.equal(traitsCote([0, 3], [0, 0], { yVersLeBas: true }).texte.angle, -90)
    // le haut du texte est à gauche de la ligne
    assert.ok(traitsCote([0, 0], [0, 3], { decalage: 1 }).texte.position[0] < 0)
    assert.ok(traitsCote([0, 0], [0, 3], { decalage: 1, yVersLeBas: true }).texte.position[0] < 0)
  })
  test('angles confondus : rien', () => {
    assert.equal(traitsCote([1, 1], [1, 1]), null)
  })
})

describe('traces : toucher, libellés, pièce', () => {
  const points = [inter, lum, applique] // i1 (1,1), l1 (2,1), l2 (3,1)
  const liaison = nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', pieceId: 'p1', interrupteur: inter, luminaire: lum })
  const cote = nouvelleTrace({ sorte: 'cote', affaireId: AFF, niveauId: 'n1', pieceId: 'p1', a: [0, 5], b: [4, 5], valeur: '3,45 m' })
  test('extrémités : points de la liaison, angles de la cote ; point disparu : rien', () => {
    assert.deepEqual(extremitesTrace(liaison, points), [[1, 1], [2, 1]])
    assert.deepEqual(extremitesTrace(cote, points), [[0, 5], [4, 5]])
    assert.equal(extremitesTrace(liaison, [inter]), null)
  })
  test('toucher une trace : sur la courbe d’une liaison ou la ligne d’une cote, à la tolérance près', () => {
    // sommet de la courbe i1 → l1 : (1,5 ; 1,2)
    assert.equal(traceProche([liaison, cote], points, [1.5, 1.21], 0.05)?.id, liaison.id)
    // sur la corde, pas sur la courbe : trop loin
    assert.equal(traceProche([liaison], points, [1.5, 1], 0.05), null)
    assert.equal(traceProche([liaison, cote], points, [2, 5.03], 0.05)?.id, cote.id)
    assert.equal(traceProche([liaison, cote], points, [2, 3], 0.05), null)
  })
  test('libellés : « Liaison P1 → P2 », « Cote 3,45 m », « Cote à préciser » ; « ? » sans valeur', () => {
    assert.equal(libelleTrace(liaison, points), 'Liaison P1 → P2')
    assert.equal(libelleTrace(cote, points), 'Cote 3,45 m')
    assert.equal(libelleTrace({ ...cote, valeur: null }, points), 'Cote à préciser')
    assert.equal(texteCote({ ...cote, valeur: null }), '?')
    assert.equal(texteCote({ ...cote, valeur: '345 cm' }), '3,45 m')
  })
  test('traces d’une pièce : la sienne, ou une liaison dont un bout y est posé', () => {
    const ailleurs = { ...pt('i9', 9, 'interrupteur'), piece_id: 'p2' }
    const traversante = nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', pieceId: 'p2', interrupteur: ailleurs, luminaire: lum })
    const autre = nouvelleTrace({ sorte: 'cote', affaireId: AFF, niveauId: 'n1', pieceId: 'p2', a: [0, 0], b: [1, 0] })
    const tous = [...points, ailleurs]
    assert.deepEqual(tracesDeLaPiece([liaison, traversante, autre], 'p1', tous).map((t) => t.id), [liaison.id, traversante.id])
    assert.deepEqual(tracesDeLaPiece([liaison, traversante, autre], 'p2', tous).map((t) => t.id), [traversante.id, autre.id])
    assert.deepEqual(tracesDeLaPiece([liaison], null, tous), [])
  })
  test('aide-mémoire : rubrique « Commandes d’éclairage et cotes » avec la 084 seulement, cochée dès une trace', () => {
    const piece = { id: 'p1', fiche: null }
    const rubrique = (aide) => aide.groupes.flatMap((g) => g.rubriques).find((r) => r.cle === 'traces')
    const sans = aideMemoire(piece, { points, traces: [liaison] })
    assert.equal(rubrique(sans), undefined)
    const vide = aideMemoire(piece, { points, traces: [], tracesDisponibles: true })
    assert.equal(rubrique(vide).libelle, 'Commandes d’éclairage et cotes')
    assert.equal(rubrique(vide).fait, false)
    assert.equal(vide.total, sans.total + 1)
    assert.equal(rubrique(aideMemoire(piece, { points, traces: [cote], tracesDisponibles: true })).fait, true)
    assert.equal(rubrique(aideMemoire({ id: 'p3' }, { points, traces: [cote], tracesDisponibles: true })).fait, false)
  })
})

describe('visite : règles de l’agence sur les traces', () => {
  test('une valeur donnée à la main vaut validation (une analyse ne l’effacera pas)', () => {
    assert.deepEqual(champsModificationTrace({ valeur: '3,45 m' }), { valeur: '3,45 m', a_valider: false })
    assert.deepEqual(champsModificationTrace({ valeur: null, a_valider: true }), { valeur: null, a_valider: false })
    assert.deepEqual(champsModificationTrace({ extrait: 'x' }), { extrait: 'x' })
    // la file l'applique telle quelle : la proposition devient une valeur relue
    const proposee = { ...nouvelleTrace({ sorte: 'cote', affaireId: AFF, niveauId: 'n1', a: [0, 0], b: [2, 0] }), valeur: '2,10 m', a_valider: true, origine: 'main' }
    const e = appliquerOperationEdl({ traces: [proposee] }, operationEdl(TYPES_EDL.traceModifier, { id: proposee.id, champs: champsModificationTrace({ valeur: '2,00 m' }) }, { affaireId: AFF }))
    assert.equal(e.traces[0].valeur, '2,00 m')
    assert.equal(e.traces[0].a_valider, false)
  })
  test('supprimer un point puis « Annuler » : ses photos et ses liaisons reviennent (aller-retour)', () => {
    const liaison = nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', interrupteur: inter, luminaire: lum })
    const autre = nouvelleTrace({ sorte: 'commande', affaireId: AFF, niveauId: 'n1', interrupteur: inter, luminaire: applique })
    const cote = nouvelleTrace({ sorte: 'cote', affaireId: AFF, niveauId: 'n1', a: [0, 0], b: [1, 0] })
    const photo = { id: 'ph1', point_id: 'l1' }
    const depart = { points: [inter, lum, applique], photos: [photo, { id: 'ph2', point_id: 'i1' }], traces: [liaison, autre, cote] }
    const geste = gesteSuppressionPoint(lum, depart)
    assert.deepEqual(geste.traces, [liaison])
    assert.deepEqual(geste.photos, [photo])
    const o = { affaireId: AFF }
    const sans = appliquerOperationEdl(depart, operationEdl(TYPES_EDL.pointSupprimer, { id: lum.id }, o))
    assert.deepEqual(sans.traces.map((t) => t.id), [autre.id, cote.id])
    const inverse = operationInverse(geste, sans.points)
    const rendu = appliquerOperationEdl(sans, operationEdl(inverse.type, inverse.charge, o))
    assert.deepEqual(rendu.traces.map((t) => t.id).sort(), [liaison.id, autre.id, cote.id].sort())
    assert.deepEqual(rendu.photos.map((p) => p.id).sort(), ['ph1', 'ph2'])
    assert.equal(rendu.points.find((p) => p.id === 'l1').numero, lum.numero)
  })
})

// ─── Export (tâche 4) ────────────────────────────────────────────────────────

describe('tracesAExporter : ce qui part dans le DXF et les planches', () => {
  const points = [
    { id: 'i1', niveau_id: 'n1', numero: 1, type: 'interrupteur', x: 1, y: 1 },
    { id: 'l1', niveau_id: 'n1', numero: 2, type: 'luminaire', x: 3, y: 2 },
    { id: 'l9', niveau_id: 'n2', numero: 9, type: 'luminaire', x: 3, y: 2 },
  ]
  const commande = (id, extra = {}) => ({ id, sorte: 'commande', niveau_id: 'n1', piece_id: 'p1', point_a: 'i1', point_b: 'l1', a_valider: false, ...extra })
  const cote = (id, extra = {}) => ({ id, sorte: 'cote', niveau_id: 'n1', piece_id: 'p1', xa: 0, ya: 0, xb: 4, yb: 0, valeur: '4,00 m', a_valider: false, ...extra })

  test('liaison et cote validées, en mètres', () => {
    const [c, k] = tracesAExporter({ traces: [commande('t1'), cote('t2')], points })
    assert.deepEqual(c, { id: 't1', sorte: 'commande', niveauId: 'n1', pieceId: 'p1', a: [1, 1], b: [3, 2], valeur: null, aValider: false })
    assert.deepEqual(k, { id: 't2', sorte: 'cote', niveauId: 'n1', pieceId: 'p1', a: [0, 0], b: [4, 0], valeur: '4,00 m', aValider: false })
  })

  test('liaison proposée : écartée par défaut, marquée si demandée', () => {
    const traces = [commande('t1', { a_valider: true, origine: 'ia' })]
    assert.deepEqual(tracesAExporter({ traces, points }), [])
    const [c] = tracesAExporter({ traces, points, inclurePropositions: true })
    assert.equal(c.aValider, true)
  })

  test('liaison dont un point manque ou est sur un autre étage : omise', () => {
    assert.deepEqual(tracesAExporter({ traces: [commande('t1', { point_b: 'disparu' })], points }), [])
    assert.deepEqual(tracesAExporter({ traces: [commande('t1', { point_b: 'l9' })], points }), [])
    // Point sans position
    assert.deepEqual(tracesAExporter({ traces: [commande('t1')], points: [points[0], { ...points[1], x: null }] }), [])
  })

  test('cote à la valeur proposée : la cote part, la valeur seulement si demandée', () => {
    const traces = [cote('t2', { valeur: '3,45 m', a_valider: true })]
    const [sans] = tracesAExporter({ traces, points })
    assert.equal(sans.valeur, null)
    assert.equal(sans.aValider, false)
    const [avec] = tracesAExporter({ traces, points, inclurePropositions: true })
    assert.equal(avec.valeur, '3,45 m')
    assert.equal(avec.aValider, true)
  })

  test('valeur réécrite si lisible, gardée telle quelle sinon ; cote sans valeur ou incomplète', () => {
    assert.equal(tracesAExporter({ traces: [cote('t', { valeur: '345 cm' })], points })[0].valeur, '3,45 m')
    assert.equal(tracesAExporter({ traces: [cote('t', { valeur: 'environ trois' })], points })[0].valeur, 'environ trois')
    assert.equal(tracesAExporter({ traces: [cote('t', { valeur: null })], points })[0].valeur, null)
    assert.deepEqual(tracesAExporter({ traces: [cote('t', { xb: 0 }), cote('u', { yb: null })], points }), [])
    assert.deepEqual(tracesAExporter({ traces: [{ id: 'x', sorte: 'autre' }, null], points }), [])
    assert.deepEqual(tracesAExporter(), [])
  })
})

// ─── Cote décalée dans la pièce (retour du contrôleur, tâche 4) ─────────────

describe('cote décalée dans la pièce', () => {
  const pres = (p, q, e = 1e-9) => Math.abs(p[0] - q[0]) < e && Math.abs(p[1] - q[1]) < e
  const rectangle = [[0, 0], [5, 0], [5, 4], [0, 4]]
  // L : bras bas 10 × 4, bras gauche 4 × 10
  const enL = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]

  test('rectangle : chaque mur coté, dans les deux sens, du côté de la pièce', () => {
    assert.equal(sensInterieurCote([0, 0], [5, 0], rectangle), 1)
    assert.equal(sensInterieurCote([5, 0], [0, 0], rectangle), -1)
    assert.equal(sensInterieurCote([0, 0], [0, 4], rectangle), -1)
    assert.equal(sensInterieurCote([5, 4], [5, 0], rectangle), -1)
    for (const [a, b] of [[[0, 0], [5, 0]], [[5, 0], [0, 0]], [[0, 0], [0, 4]], [[5, 4], [5, 0]], [[5, 4], [0, 4]]]) {
      const t = traitsCote(a, b, { sens: sensInterieurCote(a, b, rectangle), ecart: 0.6, jeu: 0.1, decalage: 0.05, hauteurTexte: 0.12 })
      const milieu = [(t.ligne[0][0] + t.ligne[1][0]) / 2, (t.ligne[0][1] + t.ligne[1][1]) / 2]
      assert.ok(milieu[0] > 0 && milieu[0] < 5 && milieu[1] > 0 && milieu[1] < 4, `ligne hors de la pièce pour ${a} → ${b}`)
      const [x, y] = t.texte.position
      assert.ok(x > 0 && x < 5 && y > 0 && y < 4, `valeur hors de la pièce pour ${a} → ${b}`)
    }
  })

  test('pièce en L : côtés rentrants et sortants', () => {
    assert.equal(sensInterieurCote([0, 0], [0, 10], enL), -1)
    assert.equal(sensInterieurCote([10, 4], [4, 4], enL), 1)
    assert.equal(sensInterieurCote([4, 4], [4, 10], enL), 1)
    assert.equal(sensInterieurCote([4, 10], [4, 4], enL), -1)
    // Le côté rentrant du coude : la ligne de cote va dans le bras, pas dans le vide
    const t = traitsCote([4, 4], [4, 10], { sens: sensInterieurCote([4, 4], [4, 10], enL), ecart: 0.6 })
    assert.ok(pres(t.ligne[0], [3.4, 4]) && pres(t.ligne[1], [3.4, 10]))
    // Diagonale à travers la pièce ou pièce inconnue : à gauche
    assert.equal(sensInterieurCote([0, 0], [4, 10], enL), 1)
    assert.equal(sensInterieurCote([0, 0], [5, 0], null), 1)
  })

  test('lignes d’attache et obliques, y vers le haut et y vers le bas', () => {
    const t = traitsCote([0, 0], [4, 0], { sens: 1, ecart: 0.6, jeu: 0.1, tic: 0.2 })
    assert.ok(pres(t.ligne[0], [0, 0.6]) && pres(t.ligne[1], [4, 0.6]))
    assert.ok(pres(t.attaches[0][0], [0, 0.1]) && pres(t.attaches[0][1], [0, 0.7]))
    assert.ok(pres(t.attaches[1][0], [4, 0.1]) && pres(t.attaches[1][1], [4, 0.7]))
    const [o1] = t.obliques
    assert.ok(pres([(o1[0][0] + o1[1][0]) / 2, (o1[0][1] + o1[1][1]) / 2], [0, 0.6]))
    // Papier (y vers le bas) : le même côté « gauche » vu sur le plan, soit y négatif
    const p = traitsCote([0, 0], [4, 0], { sens: 1, ecart: 6, jeu: 1, yVersLeBas: true })
    assert.ok(pres(p.ligne[0], [0, -6]))
    assert.ok(pres(p.attaches[0][0], [0, -1]) && pres(p.attaches[0][1], [0, -7]))
    // Sans `sens` : le tracé d'avant, sans attache
    assert.deepEqual(traitsCote([0, 0], [4, 0], { ecart: 6 }).attaches, [])
    assert.ok(pres(traitsCote([0, 0], [4, 0], { ecart: 6 }).ligne[0], [0, 0]))
  })

  test('valeur du côté de la pièce, jamais collée à la ligne', () => {
    // Mur du bas, pièce au-dessus : le haut du texte regarde la pièce
    const bas = traitsCote([0, 0], [4, 0], { sens: 1, ecart: 0.6, decalage: 0.05, hauteurTexte: 0.12 })
    assert.ok(pres(bas.texte.position, [2, 0.65]))
    // Mur du haut, pièce en dessous : le texte se lit toujours à l'endroit, sa
    // ligne de base s'écarte de sa hauteur
    const haut = traitsCote([4, 4], [0, 4], { sens: 1, ecart: 0.6, decalage: 0.05, hauteurTexte: 0.12 })
    assert.equal(haut.texte.angle, 0)
    assert.ok(pres(haut.texte.position, [2, 4 - 0.6 - 0.05 - 0.12]))
  })

  test('placerValeurCote : centrée si libre, glissée par pas sinon, centrée si rien n’est libre', () => {
    const c = traitsCote([0, 0], [10, 0], { sens: 1, ecart: 1, decalage: 0.1 })
    const libre = placerValeurCote(c, { largeur: 2, hauteur: 0.3, obstacles: [], pas: 0.5 })
    assert.equal(libre.glisse, 0)
    assert.ok(pres(libre.position, [5, 1.1]))
    const gene = placerValeurCote(c, { largeur: 2, hauteur: 0.3, obstacles: [{ xmin: 4.8, xmax: 5.2, ymin: 1, ymax: 1.6 }], pas: 0.5 })
    assert.equal(gene.glisse, 1.5)
    assert.ok(pres(gene.position, [6.5, 1.1]))
    const plein = placerValeurCote(c, { largeur: 2, hauteur: 0.3, obstacles: [{ xmin: -1, xmax: 11, ymin: 0, ymax: 3 }], pas: 0.5 })
    assert.equal(plein.glisse, 0)
    assert.equal(plein.coins.length, 4)
  })

  test('toucher une cote sur sa ligne décalée ; trait d’encre', () => {
    const cote = { id: 'c', sorte: 'cote', piece_id: 'p1', xa: 0, ya: 0, xb: 5, yb: 0 }
    const contourDe = () => rectangle
    assert.equal(traceProche([cote], [], [2.5, 0.6], 0.1), null)
    assert.equal(traceProche([cote], [], [2.5, 0.6], 0.1, { ecartCote: 0.6, contourDe })?.id, 'c')
    assert.equal(traceProche([cote], [], [2.5, 0.05], 0.1, { ecartCote: 0.6, contourDe })?.id, 'c')
    assert.equal(COULEUR_TRAIT_COTE, '#3A3632')
  })
})

// ─── Type effectif : point posé sans type, typé par l'analyse ───────────────

describe('type effectif d’un point', () => {
  const sansType = { id: 'p3', piece_id: 'sejour', numero: 3, type: null }
  const element = (point_id, type, a_valider = false) => ({ id: `e-${point_id}-${type}`, point_id, type, a_valider })

  test('le type du geste d’abord, puis l’élément validé, puis la proposition', () => {
    assert.equal(typeEffectif({ ...sansType, type: 'prise' }, [element('p3', 'interrupteur')]), 'prise')
    assert.equal(typeEffectif(sansType, [element('p3', 'applique', true), element('p3', 'interrupteur')]), 'interrupteur')
    assert.equal(typeEffectif(sansType, [element('p3', 'applique', true)]), 'applique')
    // Tout type est rendu, pas seulement ceux des liaisons
    assert.equal(typeEffectif(sansType, [element('p3', 'radiateur')]), 'radiateur')
    assert.equal(typeEffectif(sansType, [element('p9', 'interrupteur'), { point_id: 'p3', type: null }]), null)
    assert.equal(typeEffectif(null, []), null)
  })

  test('avecTypeEffectif : copies, seul le type change', () => {
    const points = [sansType, { id: 'p4', numero: 4, type: 'luminaire' }, { id: 'p5', numero: 5, type: null }]
    const elements = [element('p3', 'applique', true), element('p3', 'interrupteur'), element('p4', 'interrupteur')]
    const r = avecTypeEffectif(points, elements)
    assert.deepEqual(r.map((p) => p.type), ['interrupteur', 'luminaire', null])
    assert.equal(r[0].numero, 3)
    assert.notEqual(r[0], sansType)
    assert.equal(sansType.type, null)
  })

  test('« Relier » sur des points typés par l’analyse seulement', () => {
    const p3 = { id: 'p3', piece_id: 'sejour', numero: 3, type: null }
    const p4 = { id: 'p4', piece_id: 'sejour', numero: 4, type: null }
    const p5 = { id: 'p5', piece_id: 'sejour', numero: 5, type: null }
    const elements = [element('p3', 'interrupteur'), element('p4', 'applique', true)]
    assert.equal(debutRelier(p3), null)
    assert.equal(debutRelier(p3, elements).attendu, 'luminaire')
    assert.equal(debutRelier(p5, elements), null)
    const r = toucherRelier(debutRelier(p4, elements), p3, { points: [p3, p4, p5], traces: [], elements })
    assert.equal(r.action, 'creer')
    assert.deepEqual([r.interrupteur.id, r.luminaire.id], ['p3', 'p4'])
    // Un point resté sans type ne se relie pas
    const refus = toucherRelier(debutRelier(p3, elements), p5, { points: [p3, p4, p5], traces: [], elements })
    assert.equal(refus.action, 'refus')
    assert.match(refus.mode.raison, /P5 \(sans type\) n’est pas un luminaire/)
  })
})
