// État des lieux, lot 2 (visite) : calques, logique de la visite, file
// d'attente. Plans et pièces inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { CALQUES, CALQUES_DE_POINT, calqueEdl, typeEdl, libellePoint } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'
import { cadrage } from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import {
  ZOOM_MAX_VISITE, penseBete, pieceSous, pointProche, cadrePiece, numeroSuivant, numeroPourRestauration,
  piecesVisitees, etatPiece, visiteEnCours, evenementPourEtat, messageArret, cheminsPhotoEdl,
  arrondirMetre, designationPiece,
} from '../src/modules/etude/etat-des-lieux/visite/visiteLogique.js'
import {
  TYPES_EDL, ESSAIS_MAX, operationEdl, horodatageSuivant, appliquerOperationEdl, etatAvecFileEdl,
  resumeFileEdl, evenementEdl, operationInverse,
} from '../src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js'

const proche = (a, b, ecart = 1e-9) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)

describe('calques de l’état des lieux', () => {
  test('tous préfixés EDL-, codes uniques', () => {
    assert.ok(CALQUES.every((c) => c.nom.startsWith('EDL-')))
    assert.equal(new Set(CALQUES.map((c) => c.code)).size, CALQUES.length)
  })
  test('un code de type ne désigne qu’un seul type, tous calques confondus', () => {
    const codes = CALQUES.flatMap((c) => c.types.map((t) => t.code))
    assert.equal(new Set(codes).size, codes.length)
  })
  test('la barre d’icônes ne propose que les calques qui ont des types', () => {
    assert.deepEqual(CALQUES_DE_POINT.map((c) => c.code), [
      'plomberie', 'electricite', 'chauffage', 'ventilation', 'menuiseries', 'occultations', 'compteurs', 'securite', 'desordres',
    ])
  })
  test('un type retrouve son calque', () => {
    assert.deepEqual(typeEdl('radiateur'), { code: 'radiateur', libelle: 'Radiateur', calque: 'chauffage' })
    assert.equal(typeEdl('inconnu'), null)
    assert.equal(typeEdl(null), null)
    assert.equal(calqueEdl('chauffage').nom, 'EDL-Chauffage')
    assert.equal(calqueEdl('rien'), null)
  })
  test('libellé d’un point : numéro et type, sinon le numéro seul', () => {
    assert.equal(libellePoint({ numero: 7, type: 'wc' }), 'P7 · WC')
    assert.equal(libellePoint({ numero: 8, type: null }), 'P8')
  })
})

describe('visite : pièces et cadrage', () => {
  // Étage inventé de 10 m × 5 m : séjour, placard, cuisine en L
  const c = cadrage([0, 0, 10, 5], { marge: 0, pxMax: 1000 })
  const niveau = { id: 'n1', cadrage: c, largeur: c.largeur, hauteur: c.hauteur }
  const sejour = { id: 'p1', nom: 'Séjour', numero: '01', contour: [[0, 0], [6, 0], [6, 5], [0, 5]] }
  const placard = { id: 'p2', nom: 'Placard', numero: '02', contour: [[6, 0], [7, 0], [7, 1], [6, 1]] }
  const cuisine = { id: 'p3', nom: 'Cuisine', contour: [[7, 0], [10, 0], [10, 5], [8, 5], [8, 2], [7, 2]] }
  const pieces = [sejour, placard, cuisine]

  test('le point touché désigne la pièce qui le contient', () => {
    assert.equal(pieceSous(pieces, [3, 2]).id, 'p1')
    assert.equal(pieceSous(pieces, [6.5, 0.5]).id, 'p2')
    assert.equal(pieceSous(pieces, [9, 4]).id, 'p3')
  })
  test('dans l’angle rentrant de la pièce en L : aucune pièce', () => {
    assert.equal(pieceSous(pieces, [7.5, 4]), null)
  })
  test('une pièce agrandie : son cadre en fractions de l’image (y vers le bas)', () => {
    const cadre = cadrePiece(placard, niveau)
    proche(cadre.x0, 0.6)
    proche(cadre.x1, 0.7)
    proche(cadre.y0, 0.8)
    proche(cadre.y1, 1)
  })
  test('le zoom de la visite va jusqu’à 60 (12 pour les plans de chantier)', () => {
    assert.equal(ZOOM_MAX_VISITE, 60)
  })
  test('toucher près d’un point le désigne ; trop loin, rien', () => {
    const points = [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 1.3, y: 1 }]
    assert.equal(pointProche(points, [1.25, 1], 0.2).id, 'b')
    assert.equal(pointProche(points, [1.05, 1.05], 0.2).id, 'a')
    assert.equal(pointProche(points, [3, 3], 0.2), null)
    assert.equal(pointProche([], [1, 1], 0.2), null)
  })
  test('désignation : numéro et nom, sinon « Pièce sans nom »', () => {
    assert.equal(designationPiece(sejour), '01 · Séjour')
    assert.equal(designationPiece({ nom: '', numero: null }), 'Pièce sans nom')
  })
})

describe('visite : numéros des points', () => {
  test('le suivant après le plus grand, toutes visites confondues', () => {
    assert.equal(numeroSuivant([]), 1)
    assert.equal(numeroSuivant([{ numero: 3 }, { numero: 7 }]), 8)
  })
  test('un point rendu par « Annuler » garde son numéro s’il est libre', () => {
    assert.equal(numeroPourRestauration({ id: 'a', numero: 7 }, [{ id: 'c', numero: 9 }]), 7)
    assert.equal(numeroPourRestauration({ id: 'a', numero: 7 }, [{ id: 'b', numero: 7 }, { id: 'c', numero: 9 }]), 10)
  })
  test('arrondi au millimètre', () => {
    assert.equal(arrondirMetre(1.23456), 1.235)
  })
})

describe('visite : pièces visitées, visite en cours', () => {
  test('une pièce est visitée dès sa première entrée', () => {
    const visitees = piecesVisitees([{ piece_id: 'p1' }, { piece_id: null }, { piece_id: 'p1' }])
    assert.equal(etatPiece({ id: 'p1' }, visitees), 'visitee')
    assert.equal(etatPiece({ id: 'p2' }, visitees), 'non-visitee')
  })
  test('la visite en cours est la plus récente sans fin', () => {
    const visites = [
      { id: 'v1', debut: '2026-11-10T09:00:00.000Z', fin: '2026-11-10T11:00:00.000Z' },
      { id: 'v2', debut: '2026-11-12T09:00:00.000Z', fin: null },
    ]
    assert.equal(visiteEnCours(visites).id, 'v2')
    assert.equal(visiteEnCours([visites[0]]), null)
    assert.equal(visiteEnCours(undefined), null)
  })
})

describe('visite : pense-bête, journal du micro, messages', () => {
  test('pense-bête coché d’après la fiche de la pièce', () => {
    const r = penseBete({ sol: 'Parquet chêne', hsp: 2.5, murs: '  ' })
    assert.deepEqual(r.map((x) => [x.cle, x.fait]), [['sol', true], ['murs', false], ['plafond', false], ['plinthes', false], ['hsp', true]])
    assert.ok(penseBete(null).every((x) => !x.fait))
    assert.deepEqual(penseBete({}).map((x) => x.libelle), ['Sol', 'Murs', 'Plafond', 'Plinthes', 'HSP'])
  })
  test('ce que le journal note quand l’état du micro change', () => {
    assert.equal(evenementPourEtat('enregistre', 'pause'), 'pause')
    assert.equal(evenementPourEtat('enregistre', 'coupe'), 'coupure')
    assert.equal(evenementPourEtat('enregistre', 'muet'), 'coupure')
    assert.equal(evenementPourEtat('enregistre', 'echec'), 'coupure')
    assert.equal(evenementPourEtat('pause', 'enregistre'), 'reprise')
    assert.equal(evenementPourEtat('coupe', 'enregistre'), 'reprise')
    assert.equal(evenementPourEtat('pret', 'enregistre'), null)
    assert.equal(evenementPourEtat('enregistre', 'pret'), null)
  })
  test('un message pour chaque arrêt', () => {
    assert.equal(messageArret('pause'), 'Enregistrement en pause')
    assert.equal(messageArret('muet'), 'Micro en sourdine : une autre application l’utilise peut-être')
    assert.equal(messageArret('coupe'), 'Micro coupé (écran verrouillé ou autre application)')
    assert.equal(messageArret('echec'), 'L’enregistrement a échoué sur cet appareil')
    assert.equal(messageArret('autre'), 'L’enregistrement est arrêté')
  })
  test('photos rangées par affaire dans le stockage de l’état des lieux', () => {
    assert.deepEqual(cheminsPhotoEdl('aff', 'id1', 'webp'), {
      chemin: 'aff/edl/photos/id1.webp', chemin_miniature: 'aff/edl/photos/id1-mini.webp',
    })
  })
})

describe('file de la visite', () => {
  const AFF = 'aff-1'
  const op = (type, charge, creeLe) => operationEdl(type, charge, { affaireId: AFF, creeLe })
  const vide = () => ({ etat: { id: 'e1' }, niveaux: [], pieces: [], visites: [], points: [], photos: [], entrees: [] })
  const pt = (id, numero, extra = {}) => ({
    id, numero, visite_id: 'v1', affaire_id: AFF, niveau_id: 'n1', piece_id: 'p1', x: 1, y: 2,
    type: null, calque: null, pose_le: '2026-11-17T10:00:00.000Z', ...extra,
  })
  const ph = (id, pointId) => ({ id, point_id: pointId, visite_id: 'v1', affaire_id: AFF, chemin: `${AFF}/edl/photos/${id}.webp`, chemin_miniature: `${AFF}/edl/photos/${id}-mini.webp` })

  test('une opération porte son affaire, son heure, aucun échec', () => {
    const o = op(TYPES_EDL.pointSupprimer, { id: 'x' }, 42)
    assert.equal(o.affaireId, AFF)
    assert.equal(o.creeLe, 42)
    assert.equal(o.essais, 0)
    assert.match(o.id, /^[0-9a-f-]{36}$/)
  })
  test('deux gestes dans la même milliseconde gardent leur ordre', () => {
    assert.equal(horodatageSuivant(100, 100), 101)
    assert.equal(horodatageSuivant(100, 250), 250)
    assert.equal(horodatageSuivant(0, 5), 5)
  })
  test('poser deux fois le même point (envoi rejoué) n’en fait qu’un', () => {
    const o = op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1)
    const e = appliquerOperationEdl(appliquerOperationEdl(vide(), o), o)
    assert.equal(e.points.length, 1)
  })
  test('l’ordre de création est rétabli, même si la file est lue dans le désordre', () => {
    const poser = op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1)
    const supprimer = op(TYPES_EDL.pointSupprimer, { id: 'a' }, 2)
    assert.equal(etatAvecFileEdl(vide(), [supprimer, poser]).points.length, 0)
  })
  test('modifier un point : type et calque, ou position', () => {
    const e = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1),
      op(TYPES_EDL.pointModifier, { id: 'a', champs: { type: 'radiateur', calque: 'chauffage' } }, 2),
      op(TYPES_EDL.pointModifier, { id: 'a', champs: { x: 3.5 } }, 3),
    ])
    assert.equal(e.points[0].type, 'radiateur')
    assert.equal(e.points[0].calque, 'chauffage')
    assert.equal(e.points[0].x, 3.5)
    assert.equal(e.points[0].y, 2)
  })
  test('supprimer un point emporte ses photos ; le reposer les rend', () => {
    const avec = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1),
      op(TYPES_EDL.photoAjouter, { photo: ph('f1', 'a') }, 2),
      op(TYPES_EDL.photoAjouter, { photo: ph('f2', 'b') }, 3),
    ])
    const sans = appliquerOperationEdl(avec, op(TYPES_EDL.pointSupprimer, { id: 'a' }, 4))
    assert.deepEqual(sans.photos.map((p) => p.id), ['f2'])
    const rendu = appliquerOperationEdl(sans, op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [ph('f1', 'a')] }, 5))
    assert.deepEqual(rendu.photos.map((p) => p.id).sort(), ['f1', 'f2'])
  })
  test('le journal : seules les entrées dans une pièce sont gardées sur l’appareil', () => {
    const entree = evenementEdl('entree', { visiteId: 'v1', affaireId: AFF, niveauId: 'n1', pieceId: 'p1' }, '2026-11-17T10:00:00Z')
    const point = evenementEdl('point', { visiteId: 'v1', affaireId: AFF, pointId: 'a' })
    const e = etatAvecFileEdl(vide(), [op(TYPES_EDL.evenement, { evenement: entree }, 1), op(TYPES_EDL.evenement, { evenement: point }, 2)])
    assert.deepEqual(e.entrees.map((x) => x.piece_id), ['p1'])
  })
  test('une ligne de journal : heure ISO, détail vide par défaut', () => {
    const ev = evenementEdl('sortie', { visiteId: 'v1', affaireId: AFF, niveauId: 'n1', pieceId: 'p1' }, '2026-11-17T10:00:00Z')
    assert.equal(ev.le, '2026-11-17T10:00:00.000Z')
    assert.deepEqual(ev.detail, {})
    assert.equal(ev.point_id, null)
    assert.equal(ev.visite_id, 'v1')
  })
  test('visite commencée puis terminée', () => {
    const e = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.visiteCreer, { visite: { id: 'v1', etat_id: 'e1', affaire_id: AFF, debut: '2026-11-17T09:00:00.000Z', fin: null } }, 1),
      op(TYPES_EDL.visiteTerminer, { id: 'v1', fin: '2026-11-17T11:00:00.000Z' }, 2),
    ])
    assert.equal(e.visites[0].fin, '2026-11-17T11:00:00.000Z')
  })
  test('résumé : en attente et refusées', () => {
    const ok = op(TYPES_EDL.pointSupprimer, { id: 'a' }, 1)
    const refusee = { ...op(TYPES_EDL.pointSupprimer, { id: 'b' }, 2), essais: ESSAIS_MAX, erreur: 'refus' }
    const r = resumeFileEdl([ok, refusee])
    assert.equal(r.total, 2)
    assert.equal(r.enAttente, 1)
    assert.equal(r.echecs, 1)
    assert.equal(r.premierEchec.id, refusee.id)
    assert.equal(resumeFileEdl([]).premierEchec, null)
  })
})

describe('annuler un geste de la visite', () => {
  const p7 = { id: 'a', numero: 7, piece_id: 'p1', x: 1, y: 2, type: null, calque: null }
  test('un point posé est retiré', () => {
    assert.deepEqual(operationInverse({ type: 'pose', point: p7 }, [p7]), {
      type: TYPES_EDL.pointSupprimer, charge: { id: 'a' }, evenement: 'point-supprime',
    })
  })
  test('un point supprimé revient avec ses photos et son numéro, s’il est libre', () => {
    const photos = [{ id: 'f1', point_id: 'a' }]
    const inv = operationInverse({ type: 'suppression', point: p7, photos }, [{ id: 'c', numero: 9 }])
    assert.equal(inv.type, TYPES_EDL.pointPoser)
    assert.equal(inv.charge.point.numero, 7)
    assert.deepEqual(inv.charge.photos, photos)
    assert.equal(inv.evenement, 'point')
    const pris = operationInverse({ type: 'suppression', point: p7, photos: [] }, [{ id: 'b', numero: 7 }])
    assert.equal(pris.charge.point.numero, 8)
  })
  test('une modification revient aux valeurs d’avant', () => {
    assert.deepEqual(operationInverse({ type: 'modification', id: 'a', avant: { type: null, calque: null } }, [p7]), {
      type: TYPES_EDL.pointModifier, charge: { id: 'a', champs: { type: null, calque: null } }, evenement: 'point-modifie',
    })
  })
  test('geste inconnu : rien', () => {
    assert.equal(operationInverse({ type: 'autre' }, []), null)
  })
})
