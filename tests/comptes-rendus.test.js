// Comptes rendus de chantier : reprise de la visite précédente, compteurs et
// historique des participants.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  dateDuJour,
  compterPresents,
  compterPointsEnCours,
  preparerReprise,
  copiePresence,
  affichagePresence,
  statutNormalise,
  estEnRetard,
  historiqueRemarque,
  passeFiltre,
  FILTRE_VIDE,
} from '../src/modules/chantier/comptes-rendus/crLogique.js'

let n = 0
const id = () => `id-${++n}`

describe('dateDuJour', () => {
  test('juste après minuit en France, la date reste celle du jour local', () => {
    // 15 septembre 00 h 30 à Paris = 14 septembre 22 h 30 en UTC
    assert.equal(dateDuJour(new Date('2026-09-14T22:30:00Z')), '2026-09-15')
  })
})

describe('compteurs', () => {
  test('présents : P et retard, en minuscules comme en base', () => {
    const presences = [{ presence: 'p' }, { presence: 'r' }, { presence: 'a' }, { presence: 'na' }, { presence: 'e' }]
    assert.equal(compterPresents(presences), 2)
  })

  test('points en cours : remarques principales non closes, sans les suivis', () => {
    const remarques = [
      { id: 'a', est_clos: false, parent_id: null },
      { id: 'b', est_clos: true, parent_id: null },
      { id: 'c', est_clos: false, parent_id: 'a' },
    ]
    assert.equal(compterPointsEnCours(remarques), 1)
  })
})

describe('preparerReprise', () => {
  const precedent = {
    sections: [{ id: 'S1', numero_romain: 'I', titre: 'Général', ordre: 0, type_section: 'general' }],
    sousSections: [{ id: 'SS1', section_id: 'S1', code: '1', titre: 'Planning', ordre: 0 }],
    remarques: [
      { id: 'R1', sous_section_id: 'SS1', section_id: 'S1', description: 'Ouverte', est_clos: false, est_nouveau: true, statut: 'À faire', ordre: 0, copie_destinataire: 'Lot 2 — Gros œuvre', lot_id: 'L2' },
      { id: 'R2', sous_section_id: null, section_id: 'S1', description: 'Directe', est_clos: false, est_nouveau: false, ordre: 1 },
      { id: 'R3', sous_section_id: 'SS1', section_id: 'S1', description: 'Close', est_clos: true, ordre: 2 },
      { id: 'SR1', parent_id: 'R1', description: 'Suivi clos', est_clos: true, est_nouveau: true },
      { id: 'SR2', parent_id: 'R1', description: 'Suivi ouvert', est_clos: false },
      { id: 'SR3', parent_id: 'R3', description: 'Suivi d’une close', est_clos: false },
    ],
  }
  const reprise = preparerReprise({ ...precedent, crId: 'CR2', affaireId: 'AFF', nouvelId: id })

  test('sections et sous-sections copiées avec de nouveaux identifiants', () => {
    assert.equal(reprise.sections.length, 1)
    assert.equal(reprise.sections[0].cr_id, 'CR2')
    assert.notEqual(reprise.sections[0].id, 'S1')
    assert.equal(reprise.sousSections[0].section_id, reprise.sections[0].id)
  })

  test('seules les remarques principales non closes sont reprises', () => {
    assert.deepEqual(reprise.remarques.map((r) => r.description), ['Ouverte', 'Directe'])
    const ouverte = reprise.remarques[0]
    assert.equal(ouverte.sous_section_id, reprise.sousSections[0].id)
    assert.equal(ouverte.section_id, reprise.sections[0].id)
    assert.equal(ouverte.copie_destinataire, 'Lot 2 — Gros œuvre')
    assert.equal(reprise.remarques[1].sous_section_id, null)
  })

  test('une remarque reprise n’est pas « nouvelle »', () => {
    assert.ok(reprise.remarques.every((r) => r.est_nouveau === false))
    assert.ok(reprise.sousRemarques.every((r) => r.est_nouveau === false))
  })

  test('les suivis gardent leur état clos, et ceux d’une remarque close ne suivent pas', () => {
    assert.deepEqual(
      reprise.sousRemarques.map((r) => [r.description, r.est_clos]),
      [['Suivi clos', true], ['Suivi ouvert', false]],
    )
    assert.ok(reprise.sousRemarques.every((r) => r.parent_id === reprise.remarques[0].id))
  })
})

describe('historique des participants', () => {
  const interlocuteur = {
    interlocuteur_id: 'I1', presence: 'p',
    affaire_interlocuteurs: { categorie: 'moa', categorie_label: null, prenom: 'Anne', nom: 'Martin', fonction: 'Cheffe de projet', organisation: 'Ville de Lyon', adresse: '1 place Bellecour', email: 'a@lyon.fr', telephone: '04', ordre: 2 },
  }
  const entreprise = {
    lot_entreprise_id: 'LE1', presence: 'a',
    lot_entreprises: { lots: { numero: 2, nom: 'Gros œuvre' }, entreprises: { raison_sociale: 'Dupont', email: 'c@dupont.fr' }, interlocuteurs: { prenom: 'Paul', nom: 'Dupont', telephone: '06' } },
  }

  test('copiePresence reprend le participant lié', () => {
    assert.deepEqual(copiePresence(interlocuteur), {
      copie_type: 'interlocuteur', copie_categorie: 'moa', copie_categorie_label: null,
      copie_prenom: 'Anne', copie_nom: 'Martin', copie_fonction: 'Cheffe de projet',
      copie_organisation: 'Ville de Lyon', copie_adresse: '1 place Bellecour',
      copie_email: 'a@lyon.fr', copie_telephone: '04', copie_ordre: 2,
      copie_lot_numero: null, copie_lot_nom: null, copie_entreprise: null,
    })
    const c = copiePresence(entreprise)
    assert.equal(c.copie_type, 'entreprise')
    assert.equal(c.copie_entreprise, 'Dupont')
    assert.equal(c.copie_email, 'c@dupont.fr')
    assert.equal(c.copie_telephone, '06')
  })

  test('affichagePresence : une fiche supprimée s’affiche depuis sa copie', () => {
    const orpheline = { presence: 'a', interlocuteur_id: null, lot_entreprise_id: null, ...copiePresence(entreprise) }
    const vue = affichagePresence(orpheline)
    assert.equal(vue.type, 'entreprise')
    assert.equal(vue.entreprise, 'Dupont')
    assert.equal(vue.lotNumero, 2)
    assert.equal(vue.contact, 'Paul Dupont')
  })

  test('affichagePresence : sans copie (données anciennes), le lien suffit', () => {
    const vue = affichagePresence(interlocuteur)
    assert.equal(vue.type, 'interlocuteur')
    assert.equal(vue.nom, 'Anne Martin')
    assert.equal(vue.adresse, '1 place Bellecour')
  })
})

// ─── Étape 2 : statuts, report, retards, historique, filtres ────────────────

describe('statutNormalise', () => {
  test('anciens statuts en texte libre', () => {
    const cas = {
      'Fait': 'fait', 'faits': 'fait', 'Soldé': 'fait', 'Levée': 'fait', 'Relevé à faire': 'a_faire', 'Annulé': 'annule',
      'À faire': 'a_faire', 'a faire': 'a_faire', 'URGENT': 'urgent', 'À prévoir': 'a_prevoir',
      'En cours': 'en_cours', 'en attente BET': 'en_attente', 'Pour mémoire': 'pour_memoire',
      'Pour info': 'pour_memoire', 'bizarre': 'en_cours', '': 'en_cours',
    }
    for (const [texte, code] of Object.entries(cas)) assert.equal(statutNormalise({ statut: texte }), code, texte)
    assert.equal(statutNormalise({ statut: null }), 'en_cours')
  })

  test('codes déjà normalisés conservés', () => {
    assert.equal(statutNormalise({ statut: 'en_attente' }), 'en_attente')
    assert.equal(statutNormalise({ statut: 'annule', est_clos: true }), 'annule')
  })

  test('ancienne case « Clôturé » cochée : la remarque est faite', () => {
    assert.equal(statutNormalise({ statut: 'En cours', est_clos: true }), 'fait')
    assert.equal(statutNormalise({ statut: 'en_cours', est_clos: true }), 'fait')
  })
})

describe('preparerReprise : une remarque close revient une fois', () => {
  const base = { sections: [{ id: 'S1', numero_romain: 'I', titre: 'G' }], sousSections: [], crId: 'CR2', affaireId: 'A', nouvelId: id }
  const rem = (x) => ({ section_id: 'S1', sous_section_id: null, parent_id: null, description: x.id, suivi_id: x.id, numero: 1, cloture_reportee: false, ...x })

  test('close pendant la visite : reprise barrée, marquée pour ne plus revenir', () => {
    const r = preparerReprise({ ...base, remarques: [rem({ id: 'R1', statut: 'fait', est_clos: true, date_cloture: '2026-09-08' })] })
    assert.equal(r.remarques.length, 1)
    assert.equal(r.remarques[0].statut, 'fait')
    assert.equal(r.remarques[0].est_clos, true)
    assert.equal(r.remarques[0].cloture_reportee, true)
    assert.equal(r.remarques[0].date_cloture, '2026-09-08')
  })

  test('déjà reprise une fois close : ne revient plus', () => {
    const r = preparerReprise({ ...base, remarques: [rem({ id: 'R1', statut: 'annule', est_clos: true, cloture_reportee: true })] })
    assert.equal(r.remarques.length, 0)
  })

  test('ouverte : numéro et suivi conservés', () => {
    const r = preparerReprise({ ...base, remarques: [rem({ id: 'R1', statut: 'Urgent', numero: 7, suivi_id: 'ORIG' })] })
    assert.equal(r.remarques[0].statut, 'urgent')
    assert.equal(r.remarques[0].numero, 7)
    assert.equal(r.remarques[0].suivi_id, 'ORIG')
    assert.equal(r.remarques[0].cloture_reportee, false)
  })

  test('avant la migration 038 (colonnes absentes) : close non reprise, rien de nouveau envoyé', () => {
    const r = preparerReprise({ ...base, remarques: [
      { id: 'R1', section_id: 'S1', description: 'a', statut: 'Fait', est_clos: false },
      { id: 'R2', section_id: 'S1', description: 'b', statut: 'En cours' },
    ] })
    assert.deepEqual(r.remarques.map((x) => x.description), ['b'])
    assert.equal('suivi_id' in r.remarques[0], false)
  })
})

describe('estEnRetard', () => {
  test('échéance dépassée à la date de la visite, remarque ouverte', () => {
    assert.equal(estEnRetard({ statut: 'a_faire', date_echeance: '2026-09-10' }, '2026-09-15'), true)
    assert.equal(estEnRetard({ statut: 'a_faire', date_echeance: '2026-09-15' }, '2026-09-15'), false)
    assert.equal(estEnRetard({ statut: 'fait', date_echeance: '2026-09-10' }, '2026-09-15'), false)
    assert.equal(estEnRetard({ statut: 'a_faire' }, '2026-09-15'), false)
  })
})

describe('historiqueRemarque', () => {
  test('parcours de visite en visite, texte modifié repéré', () => {
    const crs = [{ id: 'C1', numero: 1, date_reunion: '2026-09-01' }, { id: 'C2', numero: 2 }, { id: 'C3', numero: 3 }]
    const remarques = [
      { id: 'c', cr_id: 'C3', suivi_id: 'a', description: 'Enduit repris', statut: 'fait' },
      { id: 'a', cr_id: 'C1', suivi_id: 'a', description: 'Enduit', statut: 'a_faire' },
      { id: 'b', cr_id: 'C2', suivi_id: 'a', description: 'Enduit', statut: 'en_cours' },
      { id: 'x', cr_id: 'C2', suivi_id: 'x', description: 'Autre', statut: 'a_faire' },
    ]
    const h = historiqueRemarque(remarques[0], remarques, crs)
    assert.deepEqual(h.map((e) => [e.crNumero, e.statut.code, e.texteModifie]), [[1, 'a_faire', false], [2, 'en_cours', false], [3, 'fait', true]])
  })
})

describe('passeFiltre', () => {
  const r = { numero: 12, statut: 'urgent', description: 'Reprendre l’étanchéité', pour: 'SAR', lot_id: 'L1', date_echeance: '2026-09-01' }
  const f = (x) => ({ ...FILTRE_VIDE, ...x })
  test('famille de statut, destinataire, retard', () => {
    assert.equal(passeFiltre(r, f({ familles: ['rouge'] }), '2026-09-15'), true)
    assert.equal(passeFiltre(r, f({ familles: ['vert'] }), '2026-09-15'), false)
    assert.equal(passeFiltre(r, f({ destinataire: 'lot:L1' }), '2026-09-15'), true)
    assert.equal(passeFiltre(r, f({ destinataire: 'aucun' }), '2026-09-15'), false)
    assert.equal(passeFiltre(r, f({ enRetard: true }), '2026-09-15'), true)
    assert.equal(passeFiltre(r, f({ enRetard: true }), '2026-08-15'), false)
  })
  test('recherche sans accents, par mots ou par numéro', () => {
    assert.equal(passeFiltre(r, f({ recherche: 'ETANCHEITE reprendre' })), true)
    assert.equal(passeFiltre(r, f({ recherche: 'sar' })), true)
    assert.equal(passeFiltre(r, f({ recherche: 'n°12' })), true)
    assert.equal(passeFiltre(r, f({ recherche: '1' })), false)
    assert.equal(passeFiltre(r, f({ recherche: 'plâtre' })), false)
  })
})

describe('zones (migration 047)', () => {
  test('filtre par zone et recherche sur le nom de zone', () => {
    const r = { statut: 'a_faire', description: 'Enduit', zone_id: 'Z1', copie_zone: 'Bâtiment A' }
    assert.equal(passeFiltre(r, { ...FILTRE_VIDE, zone: 'Z1' }), true)
    assert.equal(passeFiltre(r, { ...FILTRE_VIDE, zone: 'Z2' }), false)
    assert.equal(passeFiltre({ statut: 'a_faire', description: 'x' }, { ...FILTRE_VIDE, zone: 'sans-zone' }), true)
    assert.equal(passeFiltre(r, { ...FILTRE_VIDE, zone: 'sans-zone' }), false)
    assert.equal(passeFiltre(r, { ...FILTRE_VIDE, recherche: 'batiment a' }), true)
  })
  test('la reprise garde la zone', () => {
    let n = 0
    const r = preparerReprise({
      sections: [{ id: 'S1', numero_romain: 'I', titre: 'G' }], sousSections: [], crId: 'CR2', affaireId: 'A', nouvelId: () => `z-${++n}`,
      remarques: [{ id: 'R1', section_id: 'S1', description: 'ouverte', statut: 'a_faire', zone_id: 'Z1', copie_zone: 'Bâtiment A' }],
    })
    assert.equal(r.remarques[0].zone_id, 'Z1')
  })
})
