// Visite hors ligne : file d'attente, application locale des modifications,
// état affiché au retour dans l'application.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  TYPES, ESSAIS_MAX, ALERTE_PHOTOS, creerOperation, estEnEchec, aEnvoyer,
  resumeFile, appliquerOperation, etatAvecFile,
  resumeParVisite, temoinFile,
} from '../src/modules/chantier/comptes-rendus/horsLigne/fileLogique.js'

const CR = 'cr-1'
const op = (type, charge, creeLe) => creerOperation(type, charge, { crId: CR, creeLe })

const instantane = () => ({
  sections: [{
    id: 's1', titre: 'Généralités', numero_romain: 'I',
    sousSections: [{ id: 'ss1', code: 'A', titre: 'Accès', remarques: [] }],
    directRemarques: [{ id: 'r1', numero: 3, description: 'Fissure', statut: 'a_faire', est_clos: false, sous_remarques: [] }],
  }],
  presences: [{ id: 'p1', presence: 'na' }],
  photos: [],
  pastilles: [],
})

describe('file d’attente', () => {
  test('une opération part avec son identifiant et sa date', () => {
    const o = op(TYPES.remarqueModifier, { id: 'r1', champs: {} }, 10)
    assert.equal(o.crId, CR)
    assert.equal(o.essais, 0)
    assert.equal(typeof o.id, 'string')
  })

  test('l’ordre d’envoi est l’ordre de création', () => {
    const ops = [op(TYPES.remarqueModifier, {}, 30), op(TYPES.remarqueCreer, {}, 10), op(TYPES.photoAjouter, {}, 20)]
    assert.deepEqual(aEnvoyer(ops).map(o => o.creeLe), [10, 20, 30])
  })

  test('une opération en échec est mise de côté, sans bloquer la file', () => {
    const cassee = { ...op(TYPES.remarqueCreer, {}, 10), essais: ESSAIS_MAX }
    const suivante = op(TYPES.remarqueModifier, {}, 20)
    assert.equal(estEnEchec(cassee), true)
    assert.deepEqual(aEnvoyer([cassee, suivante]).map(o => o.creeLe), [20])
  })

  test('le bandeau annonce ce qui reste à envoyer', () => {
    const r = resumeFile([op(TYPES.remarqueCreer, {}, 1), op(TYPES.photoAjouter, {}, 2), op(TYPES.photoAjouter, {}, 3)])
    assert.equal(r.total, 3)
    assert.match(r.libelle, /3 modifications à envoyer \(dont 2 photos\)/)
  })

  test('file vide : rien à signaler', () => {
    assert.equal(resumeFile([]).libelle, 'Tout est enregistré')
    assert.equal(resumeFile([]).alertePhotos, false)
  })

  test('trop de photos en attente déclenche l’alerte', () => {
    const photos = Array.from({ length: ALERTE_PHOTOS }, (_, i) => op(TYPES.photoAjouter, {}, i))
    assert.equal(resumeFile(photos).alertePhotos, true)
  })

  test('les échecs sont comptés à part', () => {
    const r = resumeFile([{ ...op(TYPES.remarqueCreer, {}, 1), essais: ESSAIS_MAX }, op(TYPES.remarqueModifier, {}, 2)])
    assert.equal(r.echecs, 1)
    assert.equal(r.enAttente, 1)
  })
})

describe('application locale des modifications', () => {
  test('une remarque créée hors ligne apparaît dans sa section', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.remarqueCreer, {
      id: 'r2', affaireId: 'a1', sectionId: 's1', ordre: 1,
      champs: { description: 'Porte à reprendre', statut: 'a_faire' },
    }, 20))
    const rems = etat.sections[0].directRemarques
    assert.equal(rems.length, 2)
    assert.equal(rems[1].description, 'Porte à reprendre')
  })

  test('elle n’a pas encore de numéro : la base l’attribuera', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.remarqueCreer, {
      id: 'r2', affaireId: 'a1', sectionId: 's1', ordre: 1, champs: { description: 'X', statut: 'a_faire' },
    }, 20))
    assert.equal(etat.sections[0].directRemarques[1].numero, null)
  })

  test('une remarque créée dans une sous-section y va', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.remarqueCreer, {
      id: 'r3', affaireId: 'a1', sectionId: 's1', sousSectionId: 'ss1', ordre: 0, champs: { description: 'Y' },
    }, 20))
    assert.equal(etat.sections[0].sousSections[0].remarques.length, 1)
    assert.equal(etat.sections[0].directRemarques.length, 1)
  })

  test('un statut clos ferme la remarque, comme le fait la base', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.remarqueModifier, {
      id: 'r1', champs: { statut: 'fait' },
    }, 20))
    const r = etat.sections[0].directRemarques[0]
    assert.equal(r.statut, 'fait')
    assert.equal(r.est_clos, true)
  })

  test('une modification sans statut ne change pas la clôture', () => {
    const depart = instantane()
    depart.sections[0].directRemarques[0].est_clos = true
    const etat = appliquerOperation(depart, op(TYPES.remarqueModifier, { id: 'r1', champs: { description: 'Revue' } }, 20))
    assert.equal(etat.sections[0].directRemarques[0].est_clos, true)
  })

  test('un suivi se range sous sa remarque', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.suiviCreer, {
      id: 'sr1', parentId: 'r1', affaireId: 'a1', champs: { description: 'Relancé le maçon' },
    }, 20))
    assert.equal(etat.sections[0].directRemarques[0].sous_remarques.length, 1)
  })

  test('une présence se coche hors ligne', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.presenceDefinir, { presenceId: 'p1', presence: 'p' }, 20))
    assert.equal(etat.presences[0].presence, 'p')
  })

  test('une photo prise hors ligne s’affiche sous sa remarque', () => {
    const etat = appliquerOperation(instantane(), op(TYPES.photoAjouter, {
      remarqueId: 'r1', ordre: 0, cleFichier: 'f1',
      photo: { id: 'ph1', chemin: 'a1/ph1.webp', chemin_miniature: 'a1/ph1-mini.webp' },
    }, 20))
    assert.equal(etat.photos.length, 1)
    assert.equal(etat.photos[0].remarque_id, 'r1')
    assert.equal(etat.photos[0].locale, true)
  })

  test('une pastille remplace la précédente de la remarque', () => {
    const depart = { ...instantane(), pastilles: [{ id: 'pa0', remarque_id: 'r1', x: 0.1, y: 0.1 }] }
    const etat = appliquerOperation(depart, op(TYPES.pastillePoser, {
      id: 'pa1', remarqueId: 'r1', planId: 'pl1', versionId: 'v1', x: 0.5, y: 0.5,
    }, 20))
    assert.equal(etat.pastilles.length, 1)
    assert.equal(etat.pastilles[0].x, 0.5)
  })

  test('une opération inconnue laisse l’état intact', () => {
    const depart = instantane()
    assert.deepEqual(appliquerOperation(depart, op('inventée', {}, 20)), depart)
  })
})

describe('état affiché au retour dans l’application', () => {
  test('l’instantané est rejoué avec la file par-dessus', () => {
    const ops = [
      op(TYPES.remarqueCreer, { id: 'r2', affaireId: 'a1', sectionId: 's1', ordre: 1, champs: { description: 'Nouvelle', statut: 'a_faire' } }, 10),
      op(TYPES.remarqueModifier, { id: 'r2', champs: { statut: 'fait' } }, 20),
      op(TYPES.presenceDefinir, { presenceId: 'p1', presence: 'p' }, 30),
    ]
    const etat = etatAvecFile(instantane(), ops)
    const creee = etat.sections[0].directRemarques[1]
    assert.equal(creee.statut, 'fait')
    assert.equal(creee.est_clos, true)
    assert.equal(etat.presences[0].presence, 'p')
  })

  test('créer puis modifier ne s’inverse pas, même rangé à l’envers', () => {
    const ops = [
      op(TYPES.remarqueModifier, { id: 'r2', champs: { description: 'Corrigée' } }, 20),
      op(TYPES.remarqueCreer, { id: 'r2', affaireId: 'a1', sectionId: 's1', ordre: 1, champs: { description: 'Première' } }, 10),
    ]
    assert.equal(etatAvecFile(instantane(), ops).sections[0].directRemarques[1].description, 'Corrigée')
  })

  test('une modification refusée reste affichée, elle n’a pas disparu', () => {
    const refusee = {
      ...op(TYPES.remarqueCreer, { id: 'r2', affaireId: 'a1', sectionId: 's1', ordre: 1, champs: { description: 'Refusée' } }, 10),
      essais: ESSAIS_MAX,
    }
    assert.equal(etatAvecFile(instantane(), [refusee]).sections[0].directRemarques.length, 2)
  })

  test('sans file, l’instantané est rendu tel quel', () => {
    assert.deepEqual(etatAvecFile(instantane(), []), instantane())
  })
})

describe('ce qui attend sur l’appareil, visite par visite', () => {
  const ops = [
    { id: '1', crId: 'cr3', type: 'remarque.creer', creeLe: 20, essais: 0 },
    { id: '2', crId: 'cr3', type: 'photo.ajouter', creeLe: 30, essais: 0 },
    { id: '3', crId: 'cr2', type: 'remarque.modifier', creeLe: 10, essais: 3 },
  ]
  const visites = [
    { crId: 'cr3', donnees: { cr: { affaire_id: 'a1', numero: 3 } } },
    { crId: 'cr2', donnees: { cr: { affaire_id: 'a2', numero: 2 } } },
  ]

  test('une ligne par visite, la plus ancienne d’abord, avec affaire et numéro', () => {
    const lignes = resumeParVisite(ops, visites)
    assert.deepEqual(lignes.map((l) => [l.crId, l.affaireId, l.numero, l.enAttente, l.echecs, l.photos]), [
      ['cr2', 'a2', 2, 0, 1, 0],
      ['cr3', 'a1', 3, 2, 0, 1],
    ])
  })
  test('visite non emportée : affaire inconnue, rien ne casse', () => {
    assert.equal(resumeParVisite([ops[0]], [])[0].affaireId, null)
  })
  test('témoin : rien, en attente, envoi, refus', () => {
    assert.equal(temoinFile([], { enLigne: true }), null)
    const attente = resumeParVisite(ops.slice(0, 2), visites)
    assert.equal(temoinFile(attente, { enLigne: false, envoiEnCours: false }).libelle, '2 modifications en attente d’envoi')
    assert.equal(temoinFile(attente, { enLigne: true, envoiEnCours: true }).etat, 'envoi')
    const refus = temoinFile(resumeParVisite(ops, visites), { enLigne: true })
    assert.equal(refus.etat, 'refus')
    assert.equal(refus.cible.crId, 'cr2')
  })
})

describe('préparer pour le chantier', async () => {
  const { etapesPreparation, etatPreparation, pageCalme, FRAICHEUR_MS } = await import('../src/modules/chantier/comptes-rendus/horsLigne/preparationLogique.js')

  test('les pages utiles, la visite en mode Visite', () => {
    const etapes = etapesPreparation('a1', 'cr3')
    assert.deepEqual(etapes.map((e) => e.cle), ['visites', 'visite', 'lots', 'planning', 'cctp'])
    assert.equal(etapes[1].chemin, '/affaires/a1/comptes-rendus?cr=cr3&visite=1')
    assert.ok(etapes[1].visite)
  })
  test('sans visite, pas d’étape « visite »', () => {
    assert.ok(!etapesPreparation('a1', null).some((e) => e.cle === 'visite'))
  })
  test('état : jamais, prête, ancienne, incomplète', () => {
    const maintenant = new Date('2026-10-06T16:00:00+02:00').getTime()
    assert.equal(etatPreparation(null, maintenant).etat, 'jamais')
    const pret = etatPreparation({ le: new Date('2026-10-06T08:12:00+02:00').getTime(), numero: 3, echecs: [] }, maintenant)
    assert.equal(pret.etat, 'pret')
    assert.equal(pret.libelle, 'Prête pour le chantier · préparée aujourd’hui à 08 h 12 · visite n°03')
    const hier = etatPreparation({ le: maintenant - FRAICHEUR_MS - 60_000, echecs: [] }, maintenant)
    assert.equal(hier.etat, 'ancien')
    assert.match(hier.libelle, /^Préparée hier à .* — à mettre à jour avant de partir$/)
    assert.equal(etatPreparation({ le: maintenant - 1000, echecs: ['Planning chantier'] }, maintenant).etat, 'incomplet')
  })
  test('une page est chargée quand plus rien ne part', () => {
    assert.equal(pageCalme({ requetes: 12, depuisChangement: 2600, depuisOuverture: 4000 }), true)
    assert.equal(pageCalme({ requetes: 12, depuisChangement: 800, depuisOuverture: 4000 }), false)
    assert.equal(pageCalme({ requetes: 0, depuisChangement: 9000, depuisOuverture: 9000 }), false)
  })
})
