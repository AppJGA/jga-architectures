// État des lieux : statuts des matériaux (Conserver, Rafraîchir, Déposer,
// À préciser) et bloc porte de la fiche d'une pièce, et leur passage dans
// l'export (règle « fiche proposée écartée »). Données inventées.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  STATUTS, STATUT_A_PRECISER, CODES_STATUTS_ENREGISTRES, RUBRIQUES_STATUT, CHAMPS_PORTE,
  statutDe, libelleStatut, infosStatut, codeStatut, porteDe, rubriqueRenseignee, textePorte,
} from '../src/modules/etude/etat-des-lieux/statutsEdl.js'
import { porteExport, statutExport } from '../src/modules/etude/etat-des-lieux/export/ficheExportEdl.js'
import { memeFiche } from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js'

describe('STATUTS', () => {
  test('quatre statuts, dans l’ordre, aux couleurs de l’agence', () => {
    assert.deepEqual(STATUTS.map((s) => s.code), ['conserver', 'rafraichir', 'deposer', 'a-preciser'])
    assert.deepEqual(STATUTS.map((s) => s.libelle), ['Conserver', 'Rafraîchir', 'Déposer', 'À préciser'])
    const par = Object.fromEntries(STATUTS.map((s) => [s.code, s]))
    assert.deepEqual([par.conserver.texte, par.conserver.trait, par.conserver.cerne], ['#3F7D3A', '#3F7D3A', 'plein'])
    assert.deepEqual([par.rafraichir.texte, par.rafraichir.trait, par.rafraichir.cerne], ['#8E5508', '#B7700A', 'pointille'])
    assert.deepEqual([par.deposer.texte, par.deposer.fond], ['#FFFFFF', '#B9481B'])
    assert.deepEqual([par['a-preciser'].texte, par['a-preciser'].trait, par['a-preciser'].cerne], ['#5A554F', '#938980', 'tirete'])
  })

  test('« À préciser » n’est jamais enregistré', () => {
    assert.deepEqual(CODES_STATUTS_ENREGISTRES, ['conserver', 'rafraichir', 'deposer'])
    assert.equal(codeStatut('a-preciser'), null)
    assert.equal(codeStatut('deposer'), 'deposer')
    assert.equal(codeStatut('Déposer'), null)
    assert.equal(codeStatut(3), null)
  })

  test('rubriques à statut et parties de la porte', () => {
    assert.deepEqual(RUBRIQUES_STATUT, ['sol', 'murs', 'plafond', 'plinthes', 'porte'])
    assert.deepEqual(CHAMPS_PORTE, ['huisserie', 'vantail', 'quincaillerie'])
  })

  test('libellé et infos : un code inconnu se lit « À préciser »', () => {
    assert.equal(libelleStatut('rafraichir'), 'Rafraîchir')
    assert.equal(libelleStatut('n-importe'), 'À préciser')
    assert.equal(libelleStatut(null), 'À préciser')
    assert.equal(infosStatut(undefined).code, STATUT_A_PRECISER)
  })
})

describe('statutDe', () => {
  const fiche = {
    sol: 'Carrelage', murs: 'Peinture', plafond: '  ', plinthes: 'Bois',
    porte: { huisserie: 'bois', vantail: '', quincaillerie: '' },
    statuts: { sol: 'conserver', murs: 'inconnu', plafond: 'deposer', plinthes: null, porte: 'rafraichir' },
  }

  test('statut connu d’une rubrique renseignée', () => {
    assert.equal(statutDe(fiche, 'sol'), 'conserver')
    assert.equal(statutDe(fiche, 'porte'), 'rafraichir')
  })

  test('inconnu, absent, rubrique vide ou sans statut → à préciser', () => {
    assert.equal(statutDe(fiche, 'murs'), 'a-preciser')
    assert.equal(statutDe(fiche, 'plinthes'), 'a-preciser')
    // Plafond vide : son statut ne dit rien
    assert.equal(statutDe(fiche, 'plafond'), 'a-preciser')
    assert.equal(statutDe(fiche, 'hsp'), 'a-preciser')
    assert.equal(statutDe(fiche, 'remarques'), 'a-preciser')
  })

  test('ancienne fiche sans porte ni statuts, fiche absente', () => {
    assert.equal(statutDe({ sol: 'Parquet' }, 'sol'), 'a-preciser')
    assert.equal(statutDe(null, 'sol'), 'a-preciser')
    assert.equal(statutDe({ sol: 'Parquet', statuts: 'conserver' }, 'sol'), 'a-preciser')
    assert.deepEqual(porteDe({ sol: 'Parquet' }), { huisserie: '', vantail: '', quincaillerie: '' })
    assert.deepEqual(porteDe({ porte: ['bois'] }), { huisserie: '', vantail: '', quincaillerie: '' })
    assert.equal(rubriqueRenseignee({ sol: 'Parquet' }, 'porte'), false)
  })
})

describe('textePorte', () => {
  test('parties dites, dans l’ordre, nom de la partie devant', () => {
    assert.equal(textePorte({ porte: { huisserie: 'métallique', vantail: ' bois ', quincaillerie: 'béquille laiton' } }), 'huisserie métallique, vantail bois, quincaillerie béquille laiton')
    assert.equal(textePorte({ porte: { vantail: 'bois' } }), 'vantail bois')
  })

  test('partie déjà écrite avec son nom : pas répété', () => {
    assert.equal(textePorte({ porte: { huisserie: 'Huisserie bois', vantail: 'Vantail isoplane' } }), 'Huisserie bois, Vantail isoplane')
  })

  test('rien de dit : texte vide', () => {
    assert.equal(textePorte({}), '')
    assert.equal(textePorte({ porte: { huisserie: '  ' } }), '')
  })
})

describe('export : la règle « fiche proposée écartée »', () => {
  const fiche = { sol: 'Moquette', porte: { huisserie: 'bois', vantail: 'bois' }, statuts: { sol: 'deposer', porte: 'conserver' } }
  const relue = { fiche, fiche_a_valider: false }
  const proposee = { fiche, fiche_a_valider: true }

  test('fiche relue : statuts et porte exportés', () => {
    assert.equal(statutExport(relue, 'sol'), 'deposer')
    assert.deepEqual(porteExport(relue), { huisserie: 'bois', vantail: 'bois', quincaillerie: '', texte: 'huisserie bois, vantail bois', statut: 'conserver' })
  })

  test('fiche proposée : écartée sauf si les propositions sont incluses', () => {
    assert.equal(statutExport(proposee, 'sol'), 'a-preciser')
    assert.equal(porteExport(proposee), null)
    assert.equal(statutExport(proposee, 'sol', { inclurePropositions: true }), 'deposer')
    assert.equal(porteExport(proposee, { inclurePropositions: true }).statut, 'conserver')
  })

  test('porte non dite : null', () => {
    assert.equal(porteExport({ fiche: { sol: 'Parquet' } }), null)
  })
})

describe('memeFiche : statuts et porte comptent', () => {
  test('un statut ou une partie de porte changés : autre fiche', () => {
    const a = { sol: 'Parquet', statuts: { sol: 'conserver' } }
    assert.equal(memeFiche(a, { ...a, statuts: { sol: 'deposer' } }), false)
    assert.equal(memeFiche(a, { ...a, porte: { huisserie: 'bois' } }), false)
  })

  test('clés vides ou « a-preciser » ajoutées : même fiche', () => {
    const ancienne = { sol: 'Parquet' }
    assert.equal(memeFiche(ancienne, { sol: 'Parquet ', porte: { huisserie: '' }, statuts: { sol: null, murs: 'a-preciser' } }), true)
  })
})
