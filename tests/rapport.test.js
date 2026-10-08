// Rapport PDF : sélection des remarques selon les réglages, nom du fichier,
// description du document.

process.env.TZ = 'Europe/Paris'

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  selectionnerSections, remarquesDesSections, nomFichierCr, definitionPdf, reglagesEffectifs, REGLAGES_DEFAUT,
} from '../src/modules/chantier/comptes-rendus/rapportLogique.js'

const sections = [
  { id: 'S1', numero_romain: 'I', titre: 'Général', sousSections: [
    { id: 'SS1', code: '1', titre: 'Planning', remarques: [
      { id: 'a', numero: 1, description: 'Enduit à reprendre', statut: 'urgent', lot_id: 'L2', date_echeance: '2026-09-01', sous_remarques: [{ id: 'sa', description: 'Échafaudage monté', est_clos: true }] },
      { id: 'b', numero: 2, description: 'Teintes validées', statut: 'fait', est_clos: true, date_cloture: '2026-09-08', sous_remarques: [] },
    ] },
  ], directRemarques: [
    { id: 'c', numero: 3, description: 'Nettoyage général', statut: 'a_faire', sous_remarques: [] },
  ] },
  { id: 'S2', numero_romain: 'II', titre: 'Lots', sousSections: [], directRemarques: [
    { id: 'd', numero: 4, description: 'Garde-corps', statut: 'a_prevoir', lot_id: 'L5', sous_remarques: [] },
    { id: 'e', numero: 5, description: 'Lot supprimé depuis', statut: 'a_faire', copie_destinataire: 'Lot 9 — Peinture', sous_remarques: [] },
  ] },
]
const ids = (s) => remarquesDesSections(s).map((r) => r.id)

describe('selectionnerSections', () => {
  test('réglages par défaut : tout, structure intacte', () => {
    const s = selectionnerSections(sections, REGLAGES_DEFAUT)
    assert.deepEqual(ids(s), ['a', 'b', 'c', 'd', 'e'])
    assert.equal(s.length, 2)
  })
  test('closes masquées', () => {
    assert.deepEqual(ids(selectionnerSections(sections, { closes: 'masquer' })), ['a', 'c', 'd', 'e'])
  })
  test('version par entreprise, avec ou sans remarques générales ; sections vides retirées', () => {
    assert.deepEqual(ids(selectionnerSections(sections, { destinataire: 'lot:L2' })), ['a', 'b', 'c'])
    const seul = selectionnerSections(sections, { destinataire: 'lot:L5', inclureGenerales: false })
    assert.deepEqual(ids(seul), ['d'])
    assert.deepEqual(seul.map((x) => x.id), ['S2'])
  })
  test('une remarque dont le destinataire a été supprimé n’est pas « générale »', () => {
    assert.ok(!ids(selectionnerSections(sections, { destinataire: 'lot:L2' })).includes('e'))
  })
  test('l’ancien choix « synthèse » n’a plus d’effet : suivis et grandes photos gardés', () => {
    const s = selectionnerSections(sections, { modele: 'synthese' })
    assert.equal(remarquesDesSections(s)[0].sous_remarques.length, 1)
    const r = reglagesEffectifs({ modele: 'synthese', photos: 'grandes' })
    assert.equal(r.photos, 'grandes')
    assert.equal(r.modele, undefined)
  })
  test('par défaut, tout est coché', () => {
    const r = reglagesEffectifs({})
    for (const cle of ['photoAffaire', 'presences', 'coordonnees', 'convocations', 'generalites', 'remarques']) assert.equal(r[cle], true, cle)
    assert.equal(r.avancement, 'oui')
    assert.equal(r.plans, 'les_deux')
  })
})

test('nomFichierCr : numéro sur deux chiffres, caractères interdits retirés', () => {
  assert.equal(nomFichierCr({ numero: 5, date_reunion: '2026-09-15' }, { nom: 'Groupe scolaire / Est' }), 'CR05 – Groupe scolaire Est – 2026-09-15.pdf')
  assert.equal(nomFichierCr({ numero: 12, date_reunion: '2026-09-15' }, { nom: 'A' }, 'Lot 2 — Gros œuvre'), 'CR12 – A – 2026-09-15 – Lot 2 — Gros œuvre.pdf')
})

// Tous les textes du document, pour vérifier son contenu
function textes(noeud, acc = []) {
  if (typeof noeud === 'string') acc.push(noeud)
  else if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, acc))
  else if (noeud && typeof noeud === 'object') {
    for (const [cle, valeur] of Object.entries(noeud)) if (cle !== 'image') textes(valeur, acc)
  }
  return acc
}

describe('definitionPdf', () => {
  const base = {
    cr: { numero: 5, date_reunion: '2026-09-15', statut: 'emis', date_emission: '2026-09-15T16:02:00Z' },
    affaire: { nom: 'Groupe scolaire', code_affaire: 'GS-24' },
    lots: [{ id: 'L2', numero: 2, nom: 'Gros œuvre' }],
    interlocuteurs: [],
    presences: [
      { presence: 'p', convoque: true, heure_convocation: '09:00:00', copie_type: 'interlocuteur', copie_prenom: 'Anne', copie_nom: 'Martin', copie_email: 'a@lyon.fr', copie_ordre: 0 },
    ],
  }

  test('contenu : en-tête, remarques, destinataire, retard, statut, pied de page', () => {
    const def = definitionPdf({ ...base, sections: selectionnerSections(sections, {}), reglages: {} })
    const t = textes(def.content).join(' | ')
    for (const attendu of ['Réunion n°05', 'Émis', 'Groupe scolaire', 'Enduit à reprendre', '(02 - Gros œuvre)', 'EN RETARD', 'Urgent', 'le 08/09/2026', '(Lot 9 — Peinture)', 'Échafaudage monté', 'a@lyon.fr', 'Oui 09:00']) {
      assert.ok(t.includes(attendu), `manque « ${attendu} »`)
    }
    const pied = def.footer(2, 7)
    assert.equal(pied.columns[1].text, 'Page 2 / 7')
  })

  test('parties VI et VII : un intertitre par destinataire, suites avec leur statut', () => {
    const parties = [
      { id: 'S7', numero_romain: 'VII', titre: 'ENTREPRISES', type_section: 'entreprises', sousSections: [], directRemarques: [
        { id: 'p1', numero: 8, description: 'Raccorder la descente EP', statut: 'a_faire', lot_id: 'L2', sous_remarques: [
          { id: 'ps1', description: 'Regard posé', statut: 'a_prevoir', date_note: '2026-09-15', date_echeance: '2026-09-22' },
        ] },
      ] },
    ]
    const t = textes(definitionPdf({ ...base, sections: selectionnerSections(parties, {}), reglages: {} }).content).join(' | ')
    for (const attendu of ['02 - Gros œuvre', 'Raccorder la descente EP', 'Regard posé', 'À prévoir', '22/09/2026']) {
      assert.ok(t.includes(attendu), `manque « ${attendu} »`)
    }
    assert.ok(!t.includes('(02 - Gros œuvre)'), 'sous l’intertitre du lot, le destinataire n’est pas répété')
  })

  test('convoqués absents : case marquée « convoqué » et ligne qui les nomme', () => {
    const presences = [
      ...base.presences,
      { lot_entreprise_id: 'le-pl', presence: 'a', copie_type: 'entreprise', copie_entreprise: 'Plomberie Martin', copie_lot_numero: 3, copie_lot_nom: 'Plomberie' },
      { lot_entreprise_id: 'le-ch', presence: 'a', copie_type: 'entreprise', copie_entreprise: 'Chauffage Dumas', copie_lot_numero: 4, copie_lot_nom: 'Chauffage' },
    ]
    const convocations = new Map([['l:le-pl', { numero: 4, heure: '09:00' }]])
    const morceaux = textes(definitionPdf({ ...base, presences, convocations, sections: [], reglages: {} }).content)
    const avec = morceaux.join(' | ')
    assert.ok(avec.includes('1 convoqué absent (convocation du CR n°4) : '))
    assert.ok(avec.includes('Plomberie Martin (lot 3 Plomberie)'))
    assert.equal(morceaux.filter((t) => t === 'convoqué').length, 1, 'seule la case du convoqué absent')
    assert.ok(!avec.includes('Chauffage Dumas (lot'), 'absent sans convocation : rien de plus')
    const sans = textes(definitionPdf({ ...base, presences, sections: [], reglages: {} }).content).join(' | ')
    assert.ok(!sans.includes('convoqué absent'))
  })

  describe('contenu coché ou non', () => {
    const texte = (reglages, autres = {}) => textes(definitionPdf({ ...base, sections: selectionnerSections(sections, reglages), reglages, ...autres }).content).join(' | ')

    test('page de garde toujours là, même tout décoché', () => {
      const t = texte({ presences: false, convocations: false, generalites: false, remarques: false, avancement: 'non' })
      for (const attendu of ['Réunion n°05', 'Groupe scolaire', 'GS-24']) assert.ok(t.includes(attendu), attendu)
      for (const absent of ['PROCHAINE RÉUNION', 'Anne', 'Enduit à reprendre']) assert.ok(!t.includes(absent), absent)
    })
    test('photo de l’affaire sur la page de garde, si cochée', () => {
      const images = { photoAffaire: 'data:image/jpeg;base64,PHOTO' }
      const avec = JSON.stringify(definitionPdf({ ...base, sections: [], reglages: {}, images }).content)
      const sans = JSON.stringify(definitionPdf({ ...base, sections: [], reglages: { photoAffaire: false }, images }).content)
      assert.ok(avec.includes('PHOTO'))
      assert.ok(!sans.includes('PHOTO'))
    })
    test('présences sans coordonnées', () => {
      const t = texte({ coordonnees: false })
      assert.ok(t.includes('Personnes relatives au projet'))
      assert.ok(!t.includes('a@lyon.fr'))
    })
    test('sans convocations : ni prochaine réunion ni colonne « Convoqué »', () => {
      const t = texte({ convocations: false })
      assert.ok(!t.includes('PROCHAINE RÉUNION'))
      assert.ok(!t.includes('Convoqué'))
      assert.ok(!t.includes('Oui 09:00'))
    })
    test('convocations sans présences : la liste des convoqués à part', () => {
      const t = texte({ presences: false })
      assert.ok(t.includes('PROCHAINE RÉUNION'))
      assert.ok(t.includes('Convoqués à la prochaine réunion'))
      assert.ok(t.includes('09:00'))
      assert.ok(!t.includes('Personnes relatives au projet'))
    })
    test('généralités et remarques se retirent', () => {
      const generalites = { parties: [{ numero_romain: 'I', titre: 'Intervenants', paragraphes: [{ texte: 'Texte des généralités' }], rubriques: [] }] }
      assert.ok(texte({}, { generalites }).includes('Texte des généralités'))
      assert.ok(!texte({ generalites: false }, { generalites }).includes('Texte des généralités'))
      assert.ok(!texte({ remarques: false }).includes('Enduit à reprendre'))
    })
  })

  test('version par entreprise annoncée ; photos, extraits et planches selon les réglages', () => {
    const images = {
      photos: new Map([['a', [{ image: 'data:image/jpeg;base64,AAA', legende: 'Fissure' }]]]),
      extraits: new Map([['a', { image: 'data:image/jpeg;base64,BBB', legende: 'RDC · indice A' }]]),
      planches: [{ image: 'data:image/jpeg;base64,CCC', titre: 'RDC · indice A' }],
    }
    const avec = definitionPdf({ ...base, sections: selectionnerSections(sections, { destinataire: 'lot:L2' }), reglages: { destinataire: 'lot:L2' }, versionPour: 'Lot 2 — Gros œuvre', images })
    const json = JSON.stringify(avec.content)
    assert.ok(json.includes('Version pour : Lot 2 — Gros œuvre'))
    assert.ok(json.includes('AAA') && json.includes('BBB') && json.includes('CCC') && json.includes('Fissure'))
    const sans = JSON.stringify(definitionPdf({ ...base, sections: selectionnerSections(sections, {}), reglages: { photos: 'aucune', plans: 'aucun' }, images }).content)
    assert.ok(!sans.includes('AAA') && !sans.includes('BBB') && !sans.includes('CCC'))
  })
})

test('PDF regroupé par zone : un bloc par zone, section rappelée, sans zone à la fin', () => {
  const zones = [{ id: 'Z1', nom: 'Bâtiment A' }, { id: 'Z2', nom: 'Bâtiment B' }]
  const sectionsZonees = [
    { id: 'S1', numero_romain: 'I', titre: 'Général', sousSections: [
      { id: 'SS1', code: '1', titre: 'Planning', remarques: [
        { id: 'a', numero: 1, description: 'Enduit', statut: 'a_faire', zone_id: 'Z2', copie_zone: 'Bâtiment B', sous_remarques: [] },
        { id: 'b', numero: 2, description: 'Sans zone ici', statut: 'a_faire', sous_remarques: [] },
      ] },
    ], directRemarques: [{ id: 'c', numero: 3, description: 'Trémie', statut: 'a_faire', zone_id: 'Z1', copie_zone: 'Bâtiment A', sous_remarques: [] }] },
  ]
  const def = definitionPdf({
    cr: { numero: 1, date_reunion: '2026-09-15', statut: 'brouillon' }, affaire: { nom: 'GS' },
    sections: sectionsZonees, presences: [], lots: [], interlocuteurs: [], zones,
    reglages: { zones: 'grouper' },
  })
  const t = textes(def.content)
  const zonesAffichees = t.filter((x) => ['BÂTIMENT A', 'BÂTIMENT B', 'SANS ZONE'].includes(x))
  assert.deepEqual(zonesAffichees, ['BÂTIMENT A', 'BÂTIMENT B', 'SANS ZONE'])
  assert.ok(t.includes('I · 1'), 'la sous-section est rappelée')
  assert.ok(t.join(' | ').includes('Trémie'))
})

describe('généralités dans le PDF', async () => {
  const { definitionPdf: def } = await import('../src/modules/chantier/comptes-rendus/rapportLogique.js')
  const base = {
    cr: { numero: 30, date_reunion: '2025-11-27', statut: 'brouillon' },
    affaire: { nom: 'Boulangerie' }, lots: [], interlocuteurs: [], presences: [],
  }
  const generalites = { parties: [
    { id: 'p', numero_romain: 'I', titre: 'Mise au point administrative', paragraphes: [], rubriques: [
      { id: 'r', code: '1-1', titre: 'Réunion de chantier', paragraphes: [
        { id: 'a', date: '2025-03-27', texte: 'Réunion fixée tous les jeudis à 9h00' },
        { id: 'b', date: '2025-03-27', texte: 'Code de la boîte à clés : 2405', suite: true },
      ] },
      { id: 'vide', code: '1-2', titre: 'Rubrique vide', paragraphes: [] },
    ] },
  ] }

  test('les généralités s’impriment avant les remarques, les rubriques vides non', () => {
    const sections = [
      { id: 'S1', numero_romain: 'I', titre: 'Ancien modèle', type_section: 'general', sousSections: [{ id: 'x', code: '1-1', titre: 'Vide', remarques: [] }], directRemarques: [] },
      { id: 'S7', numero_romain: 'VII', titre: 'ENTREPRISES', type_section: 'entreprises', sousSections: [], directRemarques: [{ id: 'r1', description: 'Joints à reprendre', statut: 'a_faire', sous_remarques: [] }] },
    ]
    const t = textes(def({ ...base, sections, generalites, reglages: {} }).content).join(' | ')
    for (const attendu of ['MISE AU POINT ADMINISTRATIVE', '1-1-Réunion de chantier', 'Réunion fixée tous les jeudis à 9h00', 'Code de la boîte à clés : 2405', 'ENTREPRISES', 'Joints à reprendre']) {
      assert.ok(t.includes(attendu), `manque « ${attendu} »`)
    }
    assert.ok(!t.includes('Rubrique vide'))
    assert.ok(!t.includes('ANCIEN MODÈLE'), 'une ancienne section générale vide n’est plus imprimée')
    assert.ok(t.indexOf('Réunion fixée') < t.indexOf('Joints à reprendre'))
  })
})

test('PDF : les photos d’une suite s’impriment sous elle', () => {
  const parties = [
    { id: 'S7', numero_romain: 'VII', titre: 'ENTREPRISES', type_section: 'entreprises', sousSections: [], directRemarques: [
      { id: 'p1', numero: 8, description: 'Raccorder la descente EP', statut: 'a_faire', lot_id: 'L2', sous_remarques: [
        { id: 'ps1', description: 'Regard posé', statut: 'a_prevoir', date_note: '2026-09-15' },
      ] },
    ] },
  ]
  const images = { photos: new Map([['ps1', [{ image: 'data:image/jpeg;base64,SUITE', legende: 'Regard' }]]]) }
  const base = { cr: { numero: 5, date_reunion: '2026-09-15', statut: 'emis' }, affaire: { nom: 'A' }, lots: [{ id: 'L2', numero: 2, nom: 'GO' }], interlocuteurs: [], presences: [] }
  const avec = JSON.stringify(definitionPdf({ ...base, sections: selectionnerSections(parties, {}), reglages: {}, images }).content)
  assert.ok(avec.includes('SUITE') && avec.includes('Regard'))
  const sans = JSON.stringify(definitionPdf({ ...base, sections: selectionnerSections(parties, {}), reglages: { photos: 'aucune' }, images }).content)
  assert.ok(!sans.includes('SUITE'))
})
