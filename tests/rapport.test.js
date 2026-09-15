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
  test('synthèse : suivis retirés, photos grandes ramenées à petites', () => {
    const s = selectionnerSections(sections, { modele: 'synthese' })
    assert.equal(remarquesDesSections(s)[0].sous_remarques.length, 0)
    assert.equal(reglagesEffectifs({ modele: 'synthese', photos: 'grandes' }).photos, 'petites')
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
    for (const attendu of ['Réunion n°05', 'Émis', 'Groupe scolaire', 'Enduit à reprendre', '(Lot 2 — Gros œuvre)', 'EN RETARD', 'Urgent', 'le 08/09/2026', '(Lot 9 — Peinture)', 'Échafaudage monté', 'a@lyon.fr', 'Oui 09:00']) {
      assert.ok(t.includes(attendu), `manque « ${attendu} »`)
    }
    const pied = def.footer(2, 7)
    assert.equal(pied.columns[1].text, 'Page 2 / 7')
  })

  test('synthèse : ni coordonnées ni suivis', () => {
    const def = definitionPdf({ ...base, sections: selectionnerSections(sections, { modele: 'synthese' }), reglages: { modele: 'synthese' } })
    const t = textes(def.content).join(' | ')
    assert.ok(!t.includes('a@lyon.fr'))
    assert.ok(!t.includes('Échafaudage monté'))
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
