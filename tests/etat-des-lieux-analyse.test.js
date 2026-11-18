// État des lieux, lot 3 (analyser) : lignes écrites par l'accès aux données
// et reconnaissance d'une base sans la migration 082. Données inventées.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  analyseIndisponible, ligneEnregistrement, lignesElementsIa, champsValidation,
  ligneElementMain, champsPieceAnalysee, messageErreurAnalyse, LONGUEUR_ERREUR,
} from '../src/modules/etude/etat-des-lieux/analyse/analyseDonneesLogique.js'

describe('analyseIndisponible', () => {
  test('table absente : codes PostgreSQL et PostgREST', () => {
    assert.equal(analyseIndisponible({ code: '42P01', message: 'relation "edl_elements" does not exist' }), true)
    assert.equal(analyseIndisponible({ code: 'PGRST205', message: "Could not find the table 'public.edl_enregistrements' in the schema cache" }), true)
    assert.equal(analyseIndisponible({ message: 'relation "public.edl_enregistrements" does not exist' }), true)
  })

  test('colonne de la 082 absente des pièces', () => {
    assert.equal(analyseIndisponible({ code: '42703', message: 'column edl_pieces.analyse_le does not exist' }), true)
    assert.equal(analyseIndisponible({ code: 'PGRST204', message: "Could not find the 'fiche_a_valider' column of 'edl_pieces' in the schema cache" }), true)
    assert.equal(analyseIndisponible({ code: '42703', message: 'column "analyse_erreur" of relation "edl_pieces" does not exist' }), true)
  })

  test('une autre colonne manquante reste une vraie erreur', () => {
    assert.equal(analyseIndisponible({ code: '42703', message: 'column edl_pieces.contour does not exist' }), false)
    assert.equal(analyseIndisponible({ code: '42703', message: 'column "contour" of relation "edl_pieces" does not exist' }), false)
    assert.equal(analyseIndisponible({ code: 'PGRST204', message: "Could not find the 'nom' column of 'edl_pieces' in the schema cache" }), false)
  })

  test('autres erreurs et absence d’erreur', () => {
    assert.equal(analyseIndisponible(null), false)
    assert.equal(analyseIndisponible(undefined), false)
    assert.equal(analyseIndisponible({ code: '42501', message: 'permission denied for table edl_elements' }), false)
    assert.equal(analyseIndisponible({ code: '23503', message: 'insert or update on table "edl_enregistrements" violates foreign key constraint' }), false)
    assert.equal(analyseIndisponible(new TypeError('Failed to fetch')), false)
  })
})

describe('ligneEnregistrement', () => {
  const base = {
    id: 'morceau-1', visite_id: 'v1', affaire_id: 'a1', debut: '2026-11-18T09:00:00.000Z',
    duree_s: 180, segments: [{ debut_s: 0, fin_s: 4.2, texte: 'Sol carrelage.' }], texte: 'Sol carrelage.', horodate: true,
  }

  test('garde les colonnes de la table, rien de plus', () => {
    const l = ligneEnregistrement({ ...base, synchro_id: 'morceau-1', blob: 'x', edlVisiteId: 'v1' })
    assert.deepEqual(Object.keys(l).sort(), ['affaire_id', 'debut', 'duree_s', 'horodate', 'id', 'segments', 'texte', 'visite_id'])
    assert.equal(l.id, 'morceau-1')
    assert.deepEqual(l.segments, base.segments)
  })

  test('valeurs par défaut prudentes', () => {
    const l = ligneEnregistrement({ id: 7, visite_id: 'v1', affaire_id: 'a1', debut: base.debut })
    assert.equal(l.id, '7')
    assert.equal(l.duree_s, null)
    assert.deepEqual(l.segments, [])
    assert.equal(l.texte, '')
    assert.equal(l.horodate, true)
    assert.equal(ligneEnregistrement({ ...base, horodate: false }).horodate, false)
  })

  test('sans identifiant : refus', () => {
    assert.throws(() => ligneEnregistrement({ ...base, id: undefined }), /identifiant/)
  })
})

describe('lignesElementsIa', () => {
  const piece = { id: 'p1', niveau_id: 'n1' }
  let compteur = 0
  const nouvelId = () => `id-${++compteur}`

  test('propositions de Claude, à valider, rattachées à la pièce', () => {
    compteur = 0
    const lignes = lignesElementsIa({
      affaireId: 'a1', piece, nouvelId,
      elements: [
        { id: 'e1', point_id: 'pt7', calque: 'electricite', type: 'prise', libelle: ' Prise double ', cotes: 'h 30', extrait: 'une prise double à 30', a_verifier: true, point: 'P7' },
        { calque: 'menuiseries', type: '', libelle: 'Fenêtre', cotes: '  ', extrait: null },
      ],
    })
    assert.equal(lignes.length, 2)
    assert.deepEqual(lignes[0], {
      id: 'e1', affaire_id: 'a1', niveau_id: 'n1', piece_id: 'p1', point_id: 'pt7', calque: 'electricite',
      type: 'prise', libelle: 'Prise double', cotes: 'h 30', extrait: 'une prise double à 30',
      a_valider: true, a_verifier: true, origine: 'ia', valide_le: null,
    })
    assert.equal(lignes[1].id, 'id-1')
    assert.equal(lignes[1].type, null)
    assert.equal(lignes[1].cotes, null)
    assert.equal(lignes[1].point_id, null)
    assert.equal(lignes[1].a_verifier, false)
    assert.ok(!('point' in lignes[0]), 'la référence « P7 » ne part pas en base')
  })

  test('même résultat, mêmes lignes : un essai relancé réécrit les mêmes identifiants', () => {
    const elements = [{ id: 'e1', calque: 'electricite', libelle: 'Prise' }, { id: 'e2', calque: 'menuiseries', libelle: 'Porte' }]
    const a = lignesElementsIa({ affaireId: 'a1', piece, elements })
    const b = lignesElementsIa({ affaireId: 'a1', piece, elements })
    assert.deepEqual(a, b)
  })

  test('aucun élément', () => {
    assert.deepEqual(lignesElementsIa({ affaireId: 'a1', piece, elements: [] }), [])
    assert.deepEqual(lignesElementsIa({ affaireId: 'a1', piece, elements: undefined }), [])
  })

  test('identifiant par défaut : un UUID', () => {
    const [l] = lignesElementsIa({ affaireId: 'a1', piece, elements: [{ calque: 'electricite', libelle: 'Prise' }] })
    assert.match(l.id, /^[0-9a-f-]{36}$/)
  })
})

describe('champsValidation', () => {
  const maintenant = new Date('2026-11-18T10:00:00Z')

  test('valider sans modifier', () => {
    assert.deepEqual(champsValidation(undefined, maintenant), { a_valider: false, valide_le: '2026-11-18T10:00:00.000Z' })
  })

  test('modifier vaut validation, seuls les champs modifiables passent', () => {
    const c = champsValidation({ libelle: ' Prise triple ', cotes: '', type: 'prise', point_id: null, origine: 'main', piece_id: 'autre', a_verifier: 1 }, maintenant)
    assert.deepEqual(c, {
      libelle: 'Prise triple', cotes: null, type: 'prise', point_id: null, a_verifier: false,
      a_valider: false, valide_le: '2026-11-18T10:00:00.000Z',
    })
  })
})

describe('ligneElementMain', () => {
  test('origine main, déjà validé, sans extrait', () => {
    const l = ligneElementMain(
      { id: 'm1', affaire_id: 'a1', niveau_id: 'n1', piece_id: 'p1', calque: 'electricite', type: 'interrupteur', libelle: 'Va-et-vient', extrait: 'ignoré', a_valider: true, origine: 'ia' },
      { maintenant: new Date('2026-11-18T11:00:00Z') },
    )
    assert.equal(l.origine, 'main')
    assert.equal(l.a_valider, false)
    assert.equal(l.extrait, null)
    assert.equal(l.valide_le, '2026-11-18T11:00:00.000Z')
    assert.equal(l.id, 'm1')
    assert.equal(l.point_id, null)
  })
})

describe('pièce analysée et échec', () => {
  test('fiche à relire, erreur effacée', () => {
    const fiche = { sol: 'Parquet', murs: 'Peinture', plafond: '', plinthes: 'Bois', hsp: '2,50', remarques: '' }
    assert.deepEqual(champsPieceAnalysee(fiche, '2026-11-18T09:30:00Z'), {
      fiche, fiche_a_valider: true, analyse_le: '2026-11-18T09:30:00.000Z', analyse_erreur: null,
    })
    assert.deepEqual(champsPieceAnalysee(null, new Date('2026-11-18T09:30:00Z')).fiche, {})
  })

  test('motif d’échec borné', () => {
    assert.equal(messageErreurAnalyse(''), 'Analyse impossible.')
    assert.equal(messageErreurAnalyse(' Délai dépassé '), 'Délai dépassé')
    const long = messageErreurAnalyse('x'.repeat(2000))
    assert.equal(long.length, LONGUEUR_ERREUR)
    assert.ok(long.endsWith('…'))
  })
})
