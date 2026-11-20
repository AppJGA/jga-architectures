// État des lieux : liaisons interrupteur → luminaire et cotes entre angles
// (migration 084). Règles communes (tracesEdl.js) et file de la visite
// (fileEdlLogique.js). Pièces et points inventés : aucun plan réel dans le
// dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  SORTES_TRACE, TYPES_INTERRUPTEUR, TYPES_LUMINAIRE, TYPES_JOURNAL_TRACES, liaisonPossible, liaisonExiste,
  angleLePlusProche, longueurCote, valeurCote, texteValeur, traceValide, nouvelleTrace, tracesIndisponibles, lectureTraces,
} from '../src/modules/etude/etat-des-lieux/tracesEdl.js'
import { typeEdl } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'
import {
  TYPES_EDL, operationEdl, appliquerOperationEdl, etatAvecFileEdl, operationInverse, envoyerTrace,
  erreurTracesIndisponibles, journalSansMigration, insererSansPieceDisparue,
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
  test('une liaison déjà posée se reconnaît (sens de la base)', () => {
    const traces = [{ id: 't', sorte: 'commande', point_a: 'i1', point_b: 'l1' }, { id: 'c', sorte: 'cote', xa: 0, ya: 0, xb: 1, yb: 0 }]
    assert.equal(liaisonExiste(traces, 'i1', 'l1'), true)
    assert.equal(liaisonExiste(traces, 'i1', 'l2'), false)
    assert.equal(liaisonExiste([], 'i1', 'l1'), false)
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
