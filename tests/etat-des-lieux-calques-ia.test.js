// État des lieux : Claude choisit le traitement de chaque calque. Calques
// inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  MODELE_CALQUES, CALQUES_MAX, TEXTES_PAR_CALQUE, SCHEMA_CALQUES, CONSIGNES_CALQUES,
  construireDemandeCalques, lireDecisionsCalques, fusionnerDecisions, erreurDemandeCalques, cadreDense,
  calquesAEnvoyer, nomEnvoye,
} from '../src/modules/etude/etat-des-lieux/calquesIaLogique.js'
import { TRAITEMENTS } from '../src/modules/etude/etat-des-lieux/simplificationPlan.js'

const calque = (nom, extra = {}) => ({ nom, traits: 1200, partCourts: 0.95, fermes: 3, textes: ['Séjour'], extrait: 'QUJD', ...extra })

describe('schéma et consignes', () => {
  test('modèle et schéma fermé', () => {
    assert.equal(MODELE_CALQUES, 'claude-opus-5-5')
    assert.equal(SCHEMA_CALQUES.additionalProperties, false)
    const item = SCHEMA_CALQUES.properties.calques.items
    assert.equal(item.additionalProperties, false)
    assert.deepEqual(item.required, ['nom', 'traitement', 'raison'])
    assert.deepEqual(item.properties.traitement.enum, TRAITEMENTS)
  })

  test('consignes en français, avec chaque traitement, sans nom réel ni fichier', () => {
    assert.ok(CONSIGNES_CALQUES.length > 500)
    for (const t of TRAITEMENTS) assert.ok(CONSIGNES_CALQUES.includes(`« ${t} »`), t)
    assert.match(CONSIGNES_CALQUES, /Dans le doute, garder/)
    assert.match(CONSIGNES_CALQUES, /portes, fenêtres, escaliers, sanitaires, équipements, zones ou pièces/)
    assert.doesNotMatch(CONSIGNES_CALQUES, /\.(dxf|dwg|pdf)\b/i)
    assert.doesNotMatch(CONSIGNES_CALQUES, /JGA/)
  })
})

describe('construireDemandeCalques', () => {
  test('aperçu puis un bloc image par calque, statistiques dans le texte', () => {
    const d = construireDemandeCalques({
      apercu: 'APERCU',
      calques: [calque('MURS-A'), calque('TOITURE', { traits: 54000, partCourts: 0.998, fermes: 0, textes: [] })],
    })
    assert.equal(d.system, CONSIGNES_CALQUES)
    assert.deepEqual(d.output_config, { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_CALQUES } })
    const contenu = d.messages[0].content
    const images = contenu.filter((b) => b.type === 'image')
    assert.equal(images.length, 3)
    assert.equal(images[0].source.data, 'APERCU')
    assert.deepEqual(images[0].source, { type: 'base64', media_type: 'image/jpeg', data: 'APERCU' })
    const texte = contenu.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    assert.match(texte, /« MURS-A »/)
    assert.match(texte, /1200 traits, 95 % de traits courts \(< 10 cm\), 3 contours fermés/)
    assert.match(texte, /Textes : Séjour/)
    assert.match(texte, /54000 traits, 100 % de traits courts/)
    assert.match(texte, /Aucun texte\./)
    assert.match(texte, /2 calques à traiter/)
  })

  test('calque sans extrait : pas d’image, la demande le dit', () => {
    const d = construireDemandeCalques({ apercu: null, calques: [calque('COTES', { extrait: null })] })
    const contenu = d.messages[0].content
    assert.equal(contenu.filter((b) => b.type === 'image').length, 0)
    const texte = contenu.map((b) => b.text ?? '').join('\n')
    assert.match(texte, /Pas d’extrait/)
    assert.match(texte, /Pas d’aperçu/)
  })

  test('textes limités, nettoyés ; calques plafonnés', () => {
    const textes = Array.from({ length: 25 }, (_, i) => `  Bureau\n ${i}  `)
    const d = construireDemandeCalques({ calques: [calque('ZONES', { textes })] })
    const texte = d.messages[0].content.map((b) => b.text ?? '').join('\n')
    const ligne = texte.split('\n').find((l) => l.startsWith('Textes : '))
    assert.equal(ligne.split(' ; ').length, TEXTES_PAR_CALQUE)
    assert.ok(ligne.includes('Bureau 0'))
    const beaucoup = Array.from({ length: CALQUES_MAX + 5 }, (_, i) => calque(`C${i}`))
    const images = construireDemandeCalques({ calques: beaucoup }).messages[0].content.filter((b) => b.type === 'image')
    assert.equal(images.length, CALQUES_MAX)
  })
})

describe('lireDecisionsCalques', () => {
  const noms = ['MURS-A', 'TOITURE', 'PORTES']

  test('noms connus et traitements valides seulement ; oubli absent', () => {
    const { decisions, raisons } = lireDecisionsCalques({
      calques: [
        { nom: 'MURS-A', traitement: 'masse', raison: '  Remplissage des murs. ' },
        { nom: 'TOITURE', traitement: 'effacer', raison: 'Tuiles.' },
        { nom: 'INCONNU', traitement: 'masquer', raison: 'Cartouche.' },
        { nom: 'MURS-A', traitement: 'garder', raison: 'Doublon.' },
      ],
    }, noms)
    assert.deepEqual(decisions, { 'MURS-A': 'masse' })
    assert.deepEqual(raisons, { 'MURS-A': 'Remplissage des murs.' })
    assert.ok(!('PORTES' in decisions))
  })

  test('réponse vide ou mal formée : rien', () => {
    assert.deepEqual(lireDecisionsCalques(null, noms), { decisions: {}, raisons: {} })
    assert.deepEqual(lireDecisionsCalques({ calques: 'x' }, noms), { decisions: {}, raisons: {} })
    assert.deepEqual(lireDecisionsCalques({ calques: [null, { traitement: 'masse' }] }, noms), { decisions: {}, raisons: {} })
  })
})

describe('noms des calques', () => {
  test('calques sans nom écartés de la demande, plafond appliqué aux autres', () => {
    const analyse = [calque(''), calque('MURS'), calque('   '), calque('PORTES')]
    assert.deepEqual(calquesAEnvoyer(analyse).map((c) => c.nom), ['MURS', 'PORTES'])
    const beaucoup = [calque(''), ...Array.from({ length: CALQUES_MAX + 5 }, (_, i) => calque(`C${i}`))]
    const envoyes = calquesAEnvoyer(beaucoup)
    assert.equal(envoyes.length, CALQUES_MAX)
    assert.equal(envoyes[0].nom, 'C0')
    assert.deepEqual(calquesAEnvoyer(undefined), [])
  })

  test('nom à espaces doubles ou trop long : la réponse revient au nom d’origine', () => {
    const espaces = 'A-MUR  PORTEUR '
    const long = `Z-${'x'.repeat(240)}`
    const demande = construireDemandeCalques({ calques: [calque(espaces), calque(long)] })
    const textes = demande.messages[0].content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    assert.ok(textes.includes(`« ${nomEnvoye(espaces)} »`))
    assert.ok(textes.includes(`« ${nomEnvoye(long)} »`))
    assert.equal(nomEnvoye(long).length, 200)
    const { decisions, raisons } = lireDecisionsCalques({
      calques: [
        { nom: 'A-MUR PORTEUR', traitement: 'masse', raison: 'Pochage des murs.' },
        { nom: nomEnvoye(long), traitement: 'masquer-motif', raison: 'Gravier.' },
      ],
    }, [espaces, long])
    assert.deepEqual(decisions, { [espaces]: 'masse', [long]: 'masquer-motif' })
    assert.equal(raisons[espaces], 'Pochage des murs.')
  })

  test('deux calques confondus par la réduction : aucun des deux n’est décidé', () => {
    const { decisions } = lireDecisionsCalques({
      calques: [{ nom: 'A B', traitement: 'masquer', raison: '' }, { nom: 'C', traitement: 'garder', raison: '' }],
    }, ['A B', 'A  B', 'C'])
    assert.deepEqual(decisions, { C: 'garder' })
  })

  test('nom hérité d’Object (« constructor ») : pas pris pour une décision déjà lue', () => {
    const { decisions } = lireDecisionsCalques({
      calques: [{ nom: 'constructor', traitement: 'masquer', raison: '' }, { nom: 'toString', traitement: 'garder', raison: '' }],
    }, ['constructor', 'toString'])
    assert.deepEqual(decisions, { constructor: 'masquer', toString: 'garder' })
  })
})

describe('fusionnerDecisions', () => {
  test('les propositions valides remplacent les défauts', () => {
    const defauts = { 'MURS-A': 'masquer-motif', TOITURE: 'garder', PORTES: 'garder' }
    const r = fusionnerDecisions(defauts, { 'MURS-A': 'masse', TOITURE: 'masquer-motif', PORTES: 'n-importe', AUTRE: 'masquer' })
    assert.deepEqual(r, { 'MURS-A': 'masse', TOITURE: 'masquer-motif', PORTES: 'garder' })
    assert.equal(defauts['MURS-A'], 'masquer-motif')
  })

  test('sans proposition : les défauts', () => {
    const defauts = { A: 'garder' }
    assert.deepEqual(fusionnerDecisions(defauts, null), defauts)
    assert.deepEqual(fusionnerDecisions(defauts, {}), defauts)
  })
})

describe('erreurDemandeCalques', () => {
  test('demande recevable', () => {
    assert.equal(erreurDemandeCalques({ apercu: 'QUJD', calques: [calque('A')] }), null)
    assert.equal(erreurDemandeCalques({ calques: [calque('A', { extrait: null })] }), null)
  })

  test('un calque au nom vide ne fait plus refuser toute la demande', () => {
    assert.equal(erreurDemandeCalques({ calques: [calque(''), calque('MURS')] }), null)
    assert.equal(erreurDemandeCalques({ calques: [calque('A', { nom: 3 })] }), 'calques')
  })

  test('refus : sans calques, trop de calques, images mal typées', () => {
    assert.equal(erreurDemandeCalques({}), 'calques')
    assert.equal(erreurDemandeCalques({ calques: [] }), 'calques')
    assert.equal(erreurDemandeCalques({ calques: [{ traits: 3 }] }), 'calques')
    const trop = Array.from({ length: CALQUES_MAX + 1 }, (_, i) => calque(`C${i}`))
    assert.equal(erreurDemandeCalques({ calques: trop }), 'trop-de-calques')
    assert.equal(erreurDemandeCalques({ apercu: 12, calques: [calque('A')] }), 'apercu')
    assert.equal(erreurDemandeCalques({ apercu: '', calques: [calque('A')] }), 'apercu')
    assert.equal(erreurDemandeCalques({ calques: [calque('A', { extrait: { x: 1 } })] }), 'extrait')
  })
})

describe('cadreDense', () => {
  test('carré de 12 m centré sur la cellule de 10 m la plus chargée', () => {
    const traits = [
      { pts: [[1, 1], [2, 2]] },
      ...Array.from({ length: 5 }, (_, i) => ({ pts: [[23 + i * 0.1, 14], [23 + i * 0.1, 14.05]] })),
    ]
    assert.deepEqual(cadreDense(traits), [19, 9, 31, 21])
  })

  test('coordonnées négatives et calque vide', () => {
    assert.deepEqual(cadreDense([{ pts: [[-3, -3]] }]), [-11, -11, 1, 1])
    assert.equal(cadreDense([]), null)
  })
})
