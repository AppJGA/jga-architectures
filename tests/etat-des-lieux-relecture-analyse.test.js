// État des lieux, lot 3 : relecture au bureau des pièces analysées. Compte
// « à valider », ordre de la liste, éléments par calque, menus de la fiche
// d'un élément, saisie mise en colonnes (jamais de calque vide), fiche de la
// pièce et message d'une analyse demandée. Données inventées.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  resumePieceRelecture, piecesARelire, totalAValider, elementsParCalque, optionsType, valeurType, lireValeurType,
  pointsProposes, erreurSaisieElement, champsElementSaisis, saisieElement, titreElement, brouillonFiche,
  ficheDepuisBrouillon, ficheModifiee, rubriquesManquantes, messageLancement, suiteFicheRecue,
  tracesRelecture, lireSaisieCote, etatTrace, choixLiaisonRelecture, erreurLiaisonRelecture,
} from '../src/modules/etude/etat-des-lieux/analyse/relectureAnalyseLogique.js'
import { champsValidation } from '../src/modules/etude/etat-des-lieux/analyse/analyseDonneesLogique.js'
import { CALQUES_DE_POINT } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'

const FICHE_COMPLETE = { sol: 'parquet', murs: 'peinture', plafond: 'plâtre', plinthes: 'bois', hsp: '2,50', remarques: '' }
const piece = (id, champs = {}) => ({ id, nom: `Pièce ${id}`, fiche: {}, hsp_lue: null, analyse_le: null, analyse_erreur: null, fiche_a_valider: false, ...champs })
const element = (id, piece_id, champs = {}) => ({ id, piece_id, calque: 'electricite', type: 'prise', libelle: '', a_valider: true, origine: 'ia', ...champs })

describe('resumePieceRelecture', () => {
  test('compte les propositions de la pièce et la fiche à valider', () => {
    const p = piece('p1', { fiche_a_valider: true, analyse_le: '2026-11-18T10:00:00Z', fiche: FICHE_COMPLETE })
    const r = resumePieceRelecture(p, [element('e1', 'p1'), element('e2', 'p1', { a_valider: false }), element('e3', 'p2')])
    assert.equal(r.elements, 2)
    assert.equal(r.elementsAValider, 1)
    assert.equal(r.aValider, 2)
    assert.equal(r.rang, 0)
  })

  test('analysée et incomplète, ou en échec : rang 1 ; jamais analysée : rang 2', () => {
    assert.equal(resumePieceRelecture(piece('a', { analyse_le: '2026-11-18T10:00:00Z', fiche: { sol: 'carrelage' } })).rang, 1)
    assert.deepEqual(resumePieceRelecture(piece('a', { analyse_le: '2026-11-18T10:00:00Z', fiche: { sol: 'carrelage' } })).manquantes, ['murs', 'plafond', 'plinthes', 'hsp'])
    assert.equal(resumePieceRelecture(piece('b', { analyse_erreur: 'Claude indisponible' })).rang, 1)
    assert.equal(resumePieceRelecture(piece('c')).rang, 2)
    assert.equal(resumePieceRelecture(piece('d', { analyse_le: '2026-11-18T10:00:00Z', fiche: FICHE_COMPLETE })).rang, 2)
  })

  test('HSP lue sur le plan : la fiche peut s’en passer', () => {
    const fiche = { ...FICHE_COMPLETE, hsp: '' }
    assert.equal(resumePieceRelecture(piece('a', { analyse_le: '2026-11-18T10:00:00Z', fiche, hsp_lue: 2.6 })).complete, true)
    assert.equal(resumePieceRelecture(piece('a', { analyse_le: '2026-11-18T10:00:00Z', fiche })).complete, false)
  })
})

describe('piecesARelire', () => {
  const analyse = '2026-11-18T10:00:00Z'
  const pieces = [
    piece('relue', { analyse_le: analyse, fiche: FICHE_COMPLETE }),
    piece('jamais'),
    piece('incomplete', { analyse_le: analyse, fiche: { sol: 'béton' } }),
    piece('a-valider', { analyse_le: analyse, fiche: FICHE_COMPLETE }),
    piece('fiche', { analyse_le: analyse, fiche: FICHE_COMPLETE, fiche_a_valider: true }),
  ]
  const elements = [element('e1', 'a-valider')]

  test('à valider, puis incomplètes, puis le reste, dans l’ordre du plan', () => {
    const ids = piecesARelire(pieces, elements).map((l) => l.piece.id)
    assert.deepEqual(ids, ['a-valider', 'fiche', 'incomplete', 'relue', 'jamais'])
  })

  test('pièces jamais visitées en fin de liste', () => {
    const visitees = new Set(['relue', 'incomplete', 'a-valider', 'fiche'])
    const liste = piecesARelire([piece('loin'), ...pieces], elements, visitees)
    assert.deepEqual(liste.slice(-2).map((l) => [l.piece.id, l.visitee]), [['loin', false], ['jamais', false]])
  })

  test('total de l’affaire', () => {
    assert.equal(totalAValider(pieces, elements), 2)
  })
})

describe('elementsParCalque', () => {
  test('ordre des calques, propositions d’abord, calque inconnu en dernier', () => {
    const groupes = elementsParCalque([
      element('m', 'p', { calque: 'menuiseries', type: 'fenetre', a_valider: false, created_at: '1' }),
      element('x', 'p', { calque: 'inconnu', type: null }),
      element('pl', 'p', { calque: 'plomberie', type: 'wc' }),
      element('m2', 'p', { calque: 'menuiseries', type: 'porte', created_at: '2' }),
    ])
    assert.deepEqual(groupes.map((g) => g.code), ['plomberie', 'menuiseries', 'inconnu'])
    assert.deepEqual(groupes[1].elements.map((e) => e.id), ['m2', 'm'])
    assert.equal(groupes[0].libelle, 'Plomberie')
  })
})

describe('menu du type', () => {
  test('aller-retour calque | type', () => {
    assert.deepEqual(lireValeurType(valeurType('electricite', 'prise')), { calque: 'electricite', type: 'prise' })
    assert.deepEqual(lireValeurType(valeurType('chauffage', null)), { calque: 'chauffage', type: null })
    assert.deepEqual(lireValeurType(''), { calque: null, type: null })
  })

  test('le calque d’un type connu prime sur celui écrit à côté', () => {
    assert.deepEqual(lireValeurType('plomberie|prise'), { calque: 'electricite', type: 'prise' })
  })

  test('tous les calques à types, celui de l’élément en tête, « autre » dans chacun', () => {
    const groupes = optionsType('chauffage')
    assert.equal(groupes[0].code, 'chauffage')
    assert.equal(groupes.length, CALQUES_DE_POINT.length)
    for (const g of groupes) assert.equal(g.options.at(-1).valeur, valeurType(g.code, null))
  })

  test('un calque sans types reste proposé pour l’élément qui le porte', () => {
    const groupes = optionsType('finitions')
    assert.equal(groupes[0].code, 'finitions')
    assert.deepEqual(groupes[0].options.map((o) => o.valeur), ['finitions|'])
  })
})

describe('pointsProposes', () => {
  const points = [
    { id: 'a', piece_id: 'p1', numero: 12 },
    { id: 'b', piece_id: 'p1', numero: 3 },
    { id: 'c', piece_id: 'p2', numero: 7 },
  ]
  test('points de la pièce, par numéro, plus le point actuel s’il est ailleurs', () => {
    assert.deepEqual(pointsProposes(points, 'p1').map((p) => p.id), ['b', 'a'])
    assert.deepEqual(pointsProposes(points, 'p1', 'c').map((p) => p.id), ['b', 'c', 'a'])
  })
})

describe('saisie d’un élément', () => {
  test('saisie de départ depuis un élément', () => {
    assert.deepEqual(saisieElement(element('e', 'p', { libelle: 'Double', cotes: null, point_id: 'pt' })), {
      typeValeur: 'electricite|prise', libelle: 'Double', cotes: '', pointId: 'pt',
    })
    assert.deepEqual(saisieElement(), { typeValeur: '', libelle: '', cotes: '', pointId: '' })
  })

  test('type obligatoire, libellé obligatoire sans type', () => {
    assert.match(erreurSaisieElement({ typeValeur: '', libelle: 'x' }), /type/)
    assert.match(erreurSaisieElement({ typeValeur: 'chauffage|', libelle: '  ' }), /libellé/)
    assert.equal(erreurSaisieElement({ typeValeur: 'chauffage|', libelle: 'Poêle à bois' }), null)
    assert.equal(erreurSaisieElement({ typeValeur: 'chauffage|radiateur', libelle: '' }), null)
  })

  test('colonnes : textes nettoyés, point « aucun » = null', () => {
    assert.deepEqual(champsElementSaisis({ typeValeur: 'menuiseries|fenetre', libelle: ' Fenêtre ouest ', cotes: ' allège 90 ', pointId: '' }), {
      calque: 'menuiseries', type: 'fenetre', libelle: 'Fenêtre ouest', cotes: 'allège 90', point_id: null,
    })
  })

  test('jamais de calque vide envoyé', () => {
    const c = champsElementSaisis({ typeValeur: '', libelle: 'x', cotes: '', pointId: 'p' })
    assert.equal('calque' in c, false)
    // Et la validation ne transmet pas un calque vide à la base (NOT NULL)
    const v = champsValidation({ ...c, calque: '' }, new Date('2026-11-18T10:00:00Z'))
    assert.equal('calque' in v, false)
    assert.equal(champsValidation({ calque: null }).calque, undefined)
    assert.equal(champsValidation({ calque: 'plomberie' }).calque, 'plomberie')
    assert.equal(champsValidation({ point_id: '' }).point_id, null)
  })

  test('titre : libellé, sinon type, sinon calque', () => {
    assert.equal(titreElement({ libelle: ' Prise double ', type: 'prise' }), 'Prise double')
    assert.equal(titreElement({ libelle: '', type: 'prise' }), 'Prise de courant')
    assert.equal(titreElement({ libelle: '', type: null, calque: 'chauffage' }), 'Chauffage')
  })
})

describe('fiche de la pièce', () => {
  test('brouillon : toutes les rubriques, en texte', () => {
    assert.deepEqual(brouillonFiche({ sol: 'parquet', hsp: 2.5 }), {
      sol: 'parquet', murs: '', plafond: '', plinthes: '', hsp: '2.5', remarques: '',
      porte: { huisserie: '', vantail: '', quincaillerie: '' },
      statuts: { sol: '', murs: '', plafond: '', plinthes: '', porte: '' },
    })
  })

  test('brouillon : porte et statuts de la fiche, statut inconnu ou « a-preciser » → vide', () => {
    const b = brouillonFiche({ sol: 'parquet', porte: { huisserie: 'bois', vantail: 3 }, statuts: { sol: 'conserver', murs: 'a-preciser', porte: 'zzz' } })
    assert.deepEqual(b.porte, { huisserie: 'bois', vantail: '', quincaillerie: '' })
    assert.deepEqual(b.statuts, { sol: 'conserver', murs: '', plafond: '', plinthes: '', porte: '' })
  })

  test('enregistrement : rubriques nettoyées, autres clés gardées', () => {
    const fiche = { sol: 'parquet', autre: 'gardé' }
    assert.deepEqual(ficheDepuisBrouillon(fiche, { ...brouillonFiche(fiche), murs: ' toile de verre ' }), {
      sol: 'parquet', autre: 'gardé', murs: 'toile de verre', plafond: '', plinthes: '', hsp: '', remarques: '',
      porte: { huisserie: '', vantail: '', quincaillerie: '' },
      statuts: { sol: null, murs: null, plafond: null, plinthes: null, porte: null },
    })
  })

  test('enregistrement : porte et statuts, « À préciser » → null, clés inconnues gardées', () => {
    const fiche = { sol: 'parquet', porte: { huisserie: 'bois', ferme_porte: 'oui' }, statuts: { sol: 'conserver', fenetres: 'deposer' } }
    const b = brouillonFiche(fiche)
    const saisi = { ...b, porte: { ...b.porte, vantail: ' bois  ' }, statuts: { ...b.statuts, sol: '', porte: 'rafraichir' } }
    const f = ficheDepuisBrouillon(fiche, saisi)
    assert.deepEqual(f.porte, { huisserie: 'bois', ferme_porte: 'oui', vantail: 'bois', quincaillerie: '' })
    assert.deepEqual(f.statuts, { sol: null, fenetres: 'deposer', murs: null, plafond: null, plinthes: null, porte: 'rafraichir' })
  })

  test('changer un statut ou la porte modifie la fiche (l’enregistrement la valide)', () => {
    const fiche = { sol: 'parquet', statuts: { sol: 'conserver' } }
    const b = brouillonFiche(fiche)
    assert.equal(ficheModifiee(fiche, b), false)
    assert.equal(ficheModifiee(fiche, { ...b, statuts: { ...b.statuts, sol: 'deposer' } }), true)
    assert.equal(ficheModifiee(fiche, { ...b, porte: { ...b.porte, quincaillerie: 'laiton' } }), true)
    // Ancienne fiche sans porte ni statuts : rien de changé tant qu'on n'y touche pas
    assert.equal(ficheModifiee({ sol: 'parquet' }, brouillonFiche({ sol: 'parquet' })), false)
  })

  test('modifiée seulement si une rubrique change (espaces ignorés)', () => {
    const fiche = { sol: 'parquet' }
    assert.equal(ficheModifiee(fiche, brouillonFiche(fiche)), false)
    assert.equal(ficheModifiee(fiche, { ...brouillonFiche(fiche), sol: 'parquet ' }), false)
    assert.equal(ficheModifiee(fiche, { ...brouillonFiche(fiche), sol: 'parquet chêne' }), true)
  })

  test('fiche reçue pendant la relecture : brouillon propre remplacé, brouillon modifié gardé', () => {
    const avant = { sol: 'parquet' }
    const recue = { sol: 'parquet chêne', murs: 'peinture' }
    // Rien touché : la nouvelle analyse s'affiche
    assert.equal(suiteFicheRecue({ precedente: avant, brouillon: brouillonFiche(avant), recue }), 'remplacer')
    // Saisie en cours : elle n'est pas perdue
    const saisi = { ...brouillonFiche(avant), murs: 'toile de verre' }
    assert.equal(suiteFicheRecue({ precedente: avant, brouillon: saisi, recue }), 'garder')
    // Notre propre enregistrement relu : identique au brouillon, rien à garder
    assert.equal(suiteFicheRecue({ precedente: avant, brouillon: saisi, recue: ficheDepuisBrouillon(avant, saisi) }), 'remplacer')
    // Un statut choisi en cours de relecture n'est pas perdu non plus
    const statutSaisi = { ...brouillonFiche(avant), statuts: { ...brouillonFiche(avant).statuts, sol: 'rafraichir' } }
    assert.equal(suiteFicheRecue({ precedente: avant, brouillon: statutSaisi, recue }), 'garder')
  })

  test('rubriques manquantes signalées une fois la pièce analysée', () => {
    assert.deepEqual(rubriquesManquantes(piece('p'), brouillonFiche({})), [])
    const analysee = piece('p', { analyse_le: '2026-11-18T10:00:00Z', hsp_lue: 2.5 })
    assert.deepEqual(rubriquesManquantes(analysee, brouillonFiche({ sol: 'x', murs: 'y' })), ['plafond', 'plinthes'])
  })
})

describe('messageLancement', () => {
  test('rien à dire quand l’analyse a abouti ou échoué (motif noté sur la pièce)', () => {
    assert.equal(messageLancement({ analysees: 1, echecs: 0, raison: null }), null)
    assert.equal(messageLancement({ analysees: 0, echecs: 1, raison: null }), null)
    assert.equal(messageLancement(null), null)
  })

  test('analyse pas partie : la raison en clair', () => {
    assert.match(messageLancement({ analysees: 0, echecs: 0, raison: 'rien' }), /pas partie/)
    assert.match(messageLancement({ analysees: 0, echecs: 0, raison: 'hors-ligne' }), /réseau/)
    assert.match(messageLancement({ analysees: 0, echecs: 0, raison: 'refus' }), /Lecture seule/)
    assert.match(messageLancement({ analysees: 0, echecs: 0, raison: 'indisponible' }), /migration 082/)
    assert.match(messageLancement({ analysees: 0, echecs: 0, raison: 'bizarre' }), /bizarre/)
  })
})

describe('liaisons et cotes à la relecture (084)', () => {
  const points = [
    { id: 'i3', piece_id: 'salon', numero: 3, type: 'interrupteur' },
    { id: 'l7', piece_id: 'salon', numero: 7, type: 'luminaire' },
    { id: 'l20', piece_id: 'cuisine', numero: 20, type: 'luminaire' },
  ]
  const traces = [
    { id: 'c1', sorte: 'cote', piece_id: 'salon', a_valider: false, valeur: null, created_at: '2026-11-18T09:01:00Z' },
    { id: 't1', sorte: 'commande', piece_id: 'salon', point_a: 'i3', point_b: 'l7', a_valider: false, origine: 'main', created_at: '2026-11-18T09:00:00Z' },
    { id: 't2', sorte: 'commande', piece_id: 'salon', point_a: 'i3', point_b: 'l7', a_valider: true, origine: 'ia', created_at: '2026-11-18T09:05:00Z' },
    { id: 'c2', sorte: 'cote', piece_id: 'salon', a_valider: true, valeur: '3,45 m', extrait: 'trois quarante-cinq', created_at: '2026-11-18T09:02:00Z' },
    // Liaison rangée dans la cuisine, mais dont l'interrupteur est au salon
    { id: 't3', sorte: 'commande', piece_id: 'cuisine', point_a: 'i3', point_b: 'l20', a_valider: false, origine: 'main', created_at: '2026-11-18T09:03:00Z' },
    { id: 'c9', sorte: 'cote', piece_id: 'cuisine', a_valider: true, valeur: '2 m', created_at: '2026-11-18T09:00:00Z' },
  ]

  test('traces de la pièce : propositions d’abord, liaisons avant cotes', () => {
    assert.deepEqual(tracesRelecture(traces, 'salon', points).map((t) => t.id), ['t2', 'c2', 't1', 't3', 'c1'])
  })

  test('une proposition de liaison ou de valeur compte « à valider » dans sa pièce', () => {
    const p = piece('salon')
    const r = resumePieceRelecture(p, [], traces)
    assert.equal(r.tracesAValider, 2)
    assert.equal(r.aValider, 2)
    assert.equal(r.rang, 0)
    assert.equal(resumePieceRelecture(p, []).aValider, 0)
    assert.equal(totalAValider([piece('salon'), piece('cuisine')], [], traces), 3)
    assert.deepEqual(piecesARelire([piece('cuisine'), piece('salon'), piece('bureau')], [], null, traces).map((l) => l.piece.id), ['cuisine', 'salon', 'bureau'])
  })

  test('valeur saisie lue comme à la visite', () => {
    assert.deepEqual(lireSaisieCote('3,4'), { valeur: '3,40 m' })
    assert.deepEqual(lireSaisieCote('345 cm'), { valeur: '3,45 m' })
    assert.deepEqual(lireSaisieCote('3,45 m'), { valeur: '3,45 m' })
    assert.ok(lireSaisieCote('trois mètres').erreur)
    assert.ok(lireSaisieCote('').erreur)
  })

  test('état dit de chaque trace', () => {
    assert.equal(etatTrace(traces[2]), 'proposée')
    assert.equal(etatTrace(traces[3]), 'valeur proposée')
    assert.equal(etatTrace(traces[0]), 'valeur à préciser')
    assert.equal(etatTrace(traces[1]), 'posée à la main')
    assert.equal(etatTrace({ sorte: 'commande', origine: 'ia', a_valider: false }), 'validée')
    assert.equal(etatTrace({ sorte: 'cote', valeur: '3,45 m', extrait: 'trois quarante-cinq', a_valider: false }), 'valeur validée')
    assert.equal(etatTrace({ sorte: 'cote', valeur: '3,45 m', a_valider: false, origine: 'main' }), 'posée à la main')
  })
})

describe('« Ajouter une liaison » à la relecture', () => {
  const points = [
    { id: 'p3', piece_id: 'sejour', numero: 3, type: null },
    { id: 'p4', piece_id: 'sejour', numero: 4, type: null },
    { id: 'p5', piece_id: 'sejour', numero: 5, type: null },
    { id: 'p6', piece_id: 'sejour', numero: 6, type: 'luminaire' },
    { id: 'p1', piece_id: 'couloir', numero: 1, type: 'interrupteur' },
    { id: 'p2', piece_id: 'couloir', numero: 2, type: 'luminaire' },
  ]
  const elements = [
    { id: 'e3', point_id: 'p3', piece_id: 'sejour', type: 'interrupteur', libelle: 'Interrupteur à l’entrée de la pièce', a_valider: false },
    { id: 'e4', point_id: 'p4', piece_id: 'sejour', type: 'applique', libelle: '', a_valider: true },
  ]

  test('interrupteurs de l’étage (la pièce d’abord), luminaires de la pièce, d’après le type effectif', () => {
    const choix = choixLiaisonRelecture({ points, elements, pieceId: 'sejour' })
    assert.deepEqual(choix.interrupteurs, [
      { id: 'p3', libelle: 'P3 · Interrupteur à l’entrée de la pièce' },
      { id: 'p1', libelle: 'P1 · Interrupteur' },
    ])
    assert.deepEqual(choix.luminaires.map((o) => o.id), ['p4', 'p6'])
    assert.match(choix.luminaires[0].libelle, /^P4 · /)
  })

  test('rien de typé : listes vides', () => {
    const choix = choixLiaisonRelecture({ points: points.filter((p) => p.piece_id === 'sejour' && !p.type), elements: [], pieceId: 'sejour' })
    assert.deepEqual(choix, { interrupteurs: [], luminaires: [] })
  })

  test('choix incomplet ou liaison existante refusés', () => {
    assert.match(erreurLiaisonRelecture('', 'p4', []), /Choisissez/)
    assert.match(erreurLiaisonRelecture('p3', 'p4', [{ sorte: 'commande', point_a: 'p4', point_b: 'p3' }]), /déjà reliés/)
    assert.equal(erreurLiaisonRelecture('p3', 'p4', [{ sorte: 'cote', point_a: null, point_b: null }]), null)
  })
})
