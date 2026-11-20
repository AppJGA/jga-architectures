// État des lieux, lot 3 : quand une pièce part chez Claude. Son qui attend
// encore sur l'appareil, gestes pas envoyés, attente après échec, et le
// passage complet avec une base, un appareil et un Claude simulés — chaque
// appel se paie, aucun ne doit partir deux fois. Données inventées.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  morceauxQuiBloquent, gestesQuiBloquent, decisionAnalyse, suiviTentative, suiviValable, analyseLeApres,
  prochaineRelance, attenteApresEchecs, messageEchecAnalyse, pieceDemandee, DELAI_TRANCHE_VIVANTE_MS,
  DELAI_ABANDON_MS, MESSAGE_FRISE_TROP_LONGUE, LIGNES_MAX, sonTranscritJusquA, sonPret, suiviApresEchec,
  suiteConflitEcriture, ESSAIS_AUTO_MAX, MARGE_SON_MS, SUFFIXE_DEFINITIF, MARGE_HORLOGE_MS, motifEchec, echecDefinitifNote,
  intervallesPiece, TROU_SON_MS,
} from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js'
import { passeAnalyseEdl, RELANCE_APRES_ARRET_MS } from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlPasse.js'
import { etatPieceVisite, COULEURS_PIECE } from '../src/modules/etude/etat-des-lieux/visite/visiteLogique.js'
import { fermePassage, TYPES_EDL } from '../src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js'

const H = (hms) => `2026-11-18T${hms}.000Z`
const ms = (hms) => Date.parse(H(hms))
const MIN = 60 * 1000
let n = 0
const ev = (type, hms, champs = {}) => ({ id: `e${++n}`, visite_id: 'v1', type, niveau_id: 'n1', piece_id: null, point_id: null, le: H(hms), detail: {}, ...champs })

// Visite v1 : salon de 10:00 à 10:10, cuisine de 10:10 à 10:20, fin à 10:30
const journal = () => [
  ev('debut', '09:59:00'),
  ev('entree', '10:00:00', { piece_id: 'salon' }),
  ev('point', '10:01:00', { piece_id: 'salon', point_id: 'p1', detail: { numero: 1 } }),
  ev('sortie', '10:10:00', { piece_id: 'salon' }),
  ev('entree', '10:10:00', { piece_id: 'cuisine' }),
  ev('sortie', '10:20:00', { piece_id: 'cuisine' }),
  ev('fin', '10:30:00'),
]
const salon = (champs = {}) => ({ id: 'salon', niveau_id: 'n1', nom: 'Salon', numero: '1', fiche: {}, hsp_lue: null, analyse_le: null, analyse_erreur: null, ...champs })
const morceau = (debut, champs = {}) => ({ id: `m${++n}`, edlVisiteId: 'v1', affaireId: 'a1', debut, ...champs })
// Son de la visite v1 transcrit jusqu'à la fin (09:59 → 10:30)
const transcrit = () => [{ id: 'r1', visite_id: 'v1', debut: H('09:59:00'), duree_s: 31 * 60 }]

describe('morceauxQuiBloquent', () => {
  const iv = { debut: ms('10:00:00'), fin: ms('10:10:00'), visiteId: 'v1' }
  test('un morceau de la visite commencé avant la fin du passage bloque', () => {
    assert.equal(morceauxQuiBloquent(iv, { morceaux: [morceau(ms('10:08:00'))] }).length, 1)
    // Même commencé avant l'entrée : il couvre peut-être le début du passage
    assert.equal(morceauxQuiBloquent(iv, { morceaux: [morceau(ms('09:58:00'))] }).length, 1)
  })
  test('ne bloquent pas : autre visite, commencé après la fin, mis de côté, sans heure', () => {
    const libres = [
      morceau(ms('10:05:00'), { edlVisiteId: 'v2' }),
      morceau(ms('10:10:00')),
      morceau(ms('10:05:00'), { echecs: 3 }),
      morceau(null),
    ]
    assert.deepEqual(morceauxQuiBloquent(iv, { morceaux: libres, echecsMax: 3 }), [])
    // Refusé une ou deux fois, il sera retenté : il bloque encore
    assert.equal(morceauxQuiBloquent(iv, { morceaux: [morceau(ms('10:05:00'), { echecs: 2 })], echecsMax: 3 }).length, 1)
  })
  test('heure en texte ou début de l’enregistrement à défaut', () => {
    assert.equal(morceauxQuiBloquent(iv, { morceaux: [{ edlVisiteId: 'v1', debut: H('10:09:00') }] }).length, 1)
    assert.equal(morceauxQuiBloquent(iv, { morceaux: [{ edlVisiteId: 'v1', debutEnregistrement: H('09:59:00') }] }).length, 1)
  })
  test('tranches : celles d’un morceau tout juste coupé bloquent, les restes anciens non', () => {
    const tranche = { edlVisiteId: 'v1', debut: ms('10:07:00') }
    assert.equal(morceauxQuiBloquent(iv, { tranches: [tranche], maintenant: ms('10:10:01') }).length, 1)
    assert.equal(morceauxQuiBloquent(iv, { tranches: [tranche], maintenant: ms('10:07:00') + DELAI_TRANCHE_VIVANTE_MS }).length, 0)
  })
})

test('gestesQuiBloquent : notés avant la fin du passage', () => {
  const iv = { fin: ms('10:10:00') }
  assert.equal(gestesQuiBloquent(iv, [{ creeLe: ms('10:09:59') }, { creeLe: ms('10:12:00') }]).length, 1)
  assert.equal(gestesQuiBloquent(iv, [{ creeLe: ms('10:10:00') }]).length, 1)
  assert.equal(gestesQuiBloquent(iv, [{}]).length, 0)
})

test('attenteApresEchecs : 10 minutes, puis 1 heure', () => {
  assert.equal(attenteApresEchecs(1), 10 * MIN)
  assert.equal(attenteApresEchecs(2), 60 * MIN)
  assert.equal(attenteApresEchecs(9), 60 * MIN)
  assert.equal(attenteApresEchecs(0), 10 * MIN)
})

describe('decisionAnalyse', () => {
  const base = (champs = {}) => ({ piece: salon(), evenements: journal(), enregistrements: transcrit(), maintenant: ms('10:31:00'), ...champs })
  test('pièce visitée, passage fini, rien qui attend : on tente', () => {
    assert.deepEqual(decisionAnalyse(base()), { tenter: true, raison: 'a-analyser' })
  })
  test('jamais visitée, déjà analysée, ou passage en cours : chacun sa raison', () => {
    assert.equal(decisionAnalyse(base({ piece: salon({ id: 'chambre' }) })).raison, 'non-visitee')
    assert.equal(decisionAnalyse(base({ piece: salon({ analyse_le: H('10:11:00') }) })).raison, 'deja-fait')
    const enCours = journal().slice(0, 3)
    assert.equal(decisionAnalyse(base({ evenements: enCours })).raison, 'passage')
  })
  test('visite quittée par Retour : partie seulement après le délai d’abandon', () => {
    const quittee = journal().slice(0, 3) // dernier événement à 10:01
    assert.equal(decisionAnalyse(base({ evenements: quittee, maintenant: ms('11:00:00') })).tenter, false)
    assert.equal(decisionAnalyse(base({ evenements: quittee, maintenant: ms('10:01:00') + DELAI_ABANDON_MS })).tenter, true)
  })
  test('son ou geste qui attend sur l’appareil : la pièce attend', () => {
    assert.equal(decisionAnalyse(base({ morceaux: [morceau(ms('10:05:00'))] })).raison, 'son')
    assert.equal(decisionAnalyse(base({ gestes: [{ creeLe: ms('10:05:00') }] })).raison, 'gestes')
    // Gestes notés après la sortie (dans une autre pièce) : rien n'attend pour celle-ci
    assert.equal(decisionAnalyse(base({ gestes: [{ creeLe: ms('10:12:00') }] })).raison, 'a-analyser')
  })
  test('échec vu dans la base sans suivi sur l’appareil : attente, et suivi à garder', () => {
    const d = decisionAnalyse(base({ piece: salon({ analyse_erreur: 'Claude n’a pas répondu' }) }))
    assert.equal(d.tenter, false)
    assert.equal(d.raison, 'attente-echec')
    assert.equal(d.suivi.essais, 1)
    assert.equal(d.suivi.dernier, ms('10:31:00'))
  })
  test('après un échec : 10 minutes, puis 1 heure, jamais avant', () => {
    const piece = salon({ analyse_erreur: 'x' })
    const suivi = { essais: 1, dernier: ms('10:31:00'), couvert: ms('10:31:00'), analyseLe: null, definitif: false }
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('10:40:59') })).tenter, false)
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('10:41:00') })).raison, 'relance')
    const deuxieme = { ...suivi, essais: 2 }
    assert.equal(decisionAnalyse(base({ piece, suivi: deuxieme, maintenant: ms('11:30:59') })).tenter, false)
    assert.equal(decisionAnalyse(base({ piece, suivi: deuxieme, maintenant: ms('11:31:00') })).tenter, true)
  })
  test('un essai sans résultat (onglet fermé pendant l’appel) compte comme un échec', () => {
    const suivi = { essais: 1, dernier: ms('10:31:00'), couvert: ms('10:31:00'), analyseLe: null, definitif: false }
    assert.equal(decisionAnalyse(base({ suivi, maintenant: ms('10:32:00') })).raison, 'attente-echec')
  })
  test('une nouvelle visite de la pièce terminée après l’échec la fait repartir', () => {
    const piece = salon({ analyse_erreur: 'x' })
    const suivi = { essais: 2, dernier: ms('10:31:00'), couvert: ms('10:31:00'), analyseLe: null, definitif: false }
    const revue = [...journal(), ev('entree', '10:35:00', { visite_id: 'v2', piece_id: 'salon' }), ev('fin', '10:40:00', { visite_id: 'v2' })]
    const sons = [...transcrit(), { id: 'r2', visite_id: 'v2', debut: H('10:35:00'), duree_s: 300 }]
    assert.equal(decisionAnalyse(base({ piece, suivi, evenements: revue, enregistrements: sons, maintenant: ms('10:41:00') })).raison, 'nouvelle-visite')
    // Même après un échec définitif : une nouvelle visite, c'est une autre couverture
    const definitif = { ...suivi, essais: ESSAIS_AUTO_MAX, definitif: true }
    assert.equal(decisionAnalyse(base({ piece, suivi: definitif, evenements: revue, enregistrements: sons, maintenant: ms('10:41:00') })).raison, 'nouvelle-visite')
    // Les essais repartent de zéro pour cette couverture
    assert.equal(suiviTentative(definitif, piece, { maintenant: ms('10:41:00'), intervalles: [{ fin: ms('10:40:00') }] }).essais, 1)
  })
  test('horloge de la tablette en avance : la visite analysée ne passe pas pour nouvelle', () => {
    // Fin du passage à 10:10 (tablette), essai à 10:05 (bureau, en retard)
    const piece = salon({ analyse_erreur: 'x' })
    const suivi = suiviTentative(null, piece, { maintenant: ms('10:05:00'), intervalles: [{ fin: ms('10:10:00') }] })
    assert.equal(suivi.couvert, ms('10:10:00'))
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('10:06:00') })).tenter, false)
  })
  test('échec définitif (frise trop longue) : seulement sur demande', () => {
    const piece = salon({ analyse_erreur: MESSAGE_FRISE_TROP_LONGUE })
    const suivi = { essais: 1, dernier: ms('10:31:00'), couvert: ms('10:31:00'), analyseLe: null, definitif: true }
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('23:00:00') })).raison, 'echec-definitif')
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('10:32:00'), forcer: true })).raison, 'demande')
  })
  test('forcer n’envoie pas une pièce dont le son attend encore', () => {
    assert.equal(decisionAnalyse(base({ forcer: true, morceaux: [morceau(ms('10:05:00'))] })).raison, 'son')
  })
  test('relancer : pièce déjà analysée, tous ses passages finis', () => {
    const faite = salon({ analyse_le: H('10:31:00') })
    assert.equal(decisionAnalyse(base({ piece: faite, relancer: true })).raison, 'demande')
    assert.equal(decisionAnalyse(base({ piece: faite, relancer: true, evenements: journal().slice(0, 3), maintenant: ms('10:05:00') })).raison, 'passage')
  })
  test('un suivi d’avant une analyse réussie ne vaut plus', () => {
    const suivi = { essais: 2, dernier: ms('10:31:00'), analyseLe: null }
    assert.equal(suiviValable(suivi, salon()), true)
    assert.equal(suiviValable(suivi, salon({ analyse_le: H('10:31:00') })), false)
    assert.equal(suiviValable({ analyseLe: '2026-11-18T10:31:00+00:00' }, salon({ analyse_le: H('10:31:00') })), true)
  })
})

test('analyseLeApres : heure de lecture, jamais avant la fin des passages', () => {
  assert.equal(analyseLeApres(ms('10:31:00'), [{ fin: ms('10:10:00') }]), H('10:31:00'))
  // Tablette en avance sur le bureau
  assert.equal(analyseLeApres(ms('10:05:00'), [{ fin: ms('10:10:00') }]), H('10:10:00'))
})

test('suiviTentative : essais comptés tant que la pièce n’a pas été analysée', () => {
  const t1 = suiviTentative(null, salon(), { maintenant: ms('10:31:00') })
  assert.equal(t1.essais, 1)
  const t2 = suiviTentative(t1, salon(), { maintenant: ms('10:45:00') })
  assert.equal(t2.essais, 2)
  assert.equal(suiviTentative(t2, salon({ analyse_le: H('11:00:00') }), { maintenant: ms('12:00:00') }).essais, 1)
})

describe('prochaineRelance', () => {
  test('fin de l’attente après échec', () => {
    const suivis = { salon: { essais: 1, dernier: ms('10:31:00'), analyseLe: null } }
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), suivis, maintenant: ms('10:32:00') }), ms('10:41:00'))
  })
  test('délai d’abandon d’un passage resté ouvert', () => {
    const quittee = journal().slice(0, 3)
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: quittee, maintenant: ms('10:05:00') }), ms('10:01:00') + DELAI_ABANDON_MS)
  })
  test('rien à heure fixe : pièce analysée, échec définitif, échéance passée', () => {
    const enregistrements = transcrit()
    assert.equal(prochaineRelance({ pieces: [salon({ analyse_le: H('10:31:00') })], evenements: journal(), enregistrements, maintenant: ms('10:32:00') }), null)
    const definitif = { salon: { essais: 1, dernier: ms('10:31:00'), analyseLe: null, definitif: true } }
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), suivis: definitif, enregistrements, maintenant: ms('10:32:00') }), null)
    const plafond = { salon: { essais: ESSAIS_AUTO_MAX, dernier: ms('10:31:00'), analyseLe: null } }
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), suivis: plafond, enregistrements, maintenant: ms('10:32:00') }), null)
    const passe = { salon: { essais: 1, dernier: ms('10:31:00'), analyseLe: null } }
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), suivis: passe, enregistrements, maintenant: ms('11:00:00') }), null)
  })
  test('son attendu d’un autre appareil : revue passé le délai d’abandon', () => {
    // Salon fini à 10:10 (cuisine à 10:20), rien de transcrit dans la base
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), maintenant: ms('10:32:00') }), ms('10:10:00') + DELAI_ABANDON_MS + 1000)
  })
})

test('messageEchecAnalyse : motifs en français', () => {
  assert.equal(messageEchecAnalyse({ code: 'demande', detail: 'trop-de-lignes' }), MESSAGE_FRISE_TROP_LONGUE)
  assert.match(messageEchecAnalyse({ code: 'demande', detail: 'fiche' }), /refusée \(fiche\)/)
  assert.match(messageEchecAnalyse({ code: 'refus' }), /pas accepté/)
  assert.match(messageEchecAnalyse({ code: 'reponse-illisible' }), /illisible/)
  assert.equal(messageEchecAnalyse({ code: 'x', message: 'Lecture seule' }), 'Lecture seule')
  assert.equal(messageEchecAnalyse(null), 'Analyse impossible.')
})

test('pieceDemandee : surface lue, à défaut dessinée ; HSP lue', () => {
  assert.deepEqual(pieceDemandee(salon({ surface_lue: 12.5, hsp_lue: 2.6 })), { nom: 'Salon', numero: '1', surface: 12.5, hsp: 2.6 })
  assert.equal(pieceDemandee(salon(), 9.8).surface, 9.8)
  assert.equal(pieceDemandee(salon()).hsp, null)
})

describe('etatPieceVisite (couleurs de la visite)', () => {
  const visitees = new Set(['salon'])
  const entrees = [{ piece_id: 'salon', le: H('10:00:00') }]
  test('chaque état a sa couleur', () => {
    for (const e of ['non-visitee', 'visitee', 'attente', 'complete', 'incomplete', 'echec']) assert.ok(COULEURS_PIECE[e]?.trait, e)
  })
  test('non visitée, sans la 082, attente, échec', () => {
    assert.equal(etatPieceVisite(salon({ id: 'cuisine' }), { visitees, entrees }), 'non-visitee')
    const sans082 = { id: 'salon', fiche: {} }
    assert.equal(etatPieceVisite(sans082, { visitees, entrees }), 'visitee')
    assert.equal(etatPieceVisite(salon(), { visitees, entrees }), 'attente')
    assert.equal(etatPieceVisite(salon({ analyse_erreur: 'x', analyse_le: H('09:00:00') }), { visitees, entrees }), 'echec')
  })
  test('complète, incomplète, et de nouveau en attente si l’on y revient', () => {
    const fiche = { sol: 'parquet', murs: 'peints', plafond: 'plâtre', plinthes: 'bois', hsp: '2,60' }
    const faite = salon({ analyse_le: H('10:31:00'), fiche })
    assert.equal(etatPieceVisite(faite, { visitees, entrees }), 'complete')
    assert.equal(etatPieceVisite(salon({ analyse_le: H('10:31:00'), fiche: { sol: 'parquet' } }), { visitees, entrees }), 'incomplete')
    assert.equal(etatPieceVisite(faite, { visitees, entrees: [...entrees, { piece_id: 'salon', le: H('11:00:00') }] }), 'attente')
    assert.equal(etatPieceVisite(faite, { visitees, entrees, enCours: 'salon' }), 'attente')
  })
})

// ─── Le passage, avec une base, un appareil et Claude simulés ───────────────

function monde({ pieces = [salon()], evenements = journal(), maintenant = ms('10:31:00') } = {}) {
  const m = {
    enLigne: true,
    session: true,
    indisponible: false,
    maintenant,
    base: { pieces: pieces.map((p) => ({ updated_at: H('09:00:00'), ...p })), evenements, points: [{ id: 'p1', piece_id: 'salon', numero: 1 }], enregistrements: transcrit(), elements: [] },
    audio: { morceaux: [], tranches: [] },
    gestes: [],
    suivis: {},
    relances: {},
    appels: [],
    ecritures: [],
    erreursNotees: [],
    signaux: [],
    reponse: () => ({ fiche: { sol: 'parquet' }, elements: [] }),
    reservation: () => 'ok',
    enVol: 0,
    maxEnVol: 0,
    ecrireMarche: true,
    transaction: true,
    rpc: 0,
  }
  const piece = (id) => m.base.pieces.find((p) => p.id === id)
  // Le déclencheur edl_pieces_touche : chaque écriture avance updated_at
  // (heure du serveur : celle de l'appareil qui écrit, toujours croissante)
  const toucher = (ligne) => { ligne.updated_at = new Date(Math.max(Date.parse(ligne.updated_at) + 1000, m.maintenant)).toISOString() }
  m.d = {
    enLigne: () => m.enLigne,
    aSession: async () => m.session,
    lireSuivi: async () => (m.indisponible ? { indisponible: true } : {
      indisponible: false, pieces: m.base.pieces.map((p) => ({ ...p })), evenements: m.base.evenements, enregistrements: m.base.enregistrements,
    }),
    lireFrise: async (_a, id) => ({
      indisponible: m.indisponible, piece: piece(id) ? { ...piece(id) } : null, evenements: m.base.evenements,
      points: m.base.points, enregistrements: m.base.enregistrements, elementsValides: [],
    }),
    audioLocal: async () => m.audio,
    gestesEnAttente: async () => m.gestes,
    // Écriture « à blanc », comme reserverAnalyse : conditionnée sur
    // analyse_le et sur l'updated_at lu avec la frise, elle avance
    // updated_at (déclencheur) et rend la fiche
    reserver: async (p) => {
      const etat = m.reservation(p)
      if (etat !== 'ok') return { etat }
      const ligne = piece(p.id)
      if (!ligne || (ligne.analyse_le ?? null) !== (p.analyse_le ?? null)) return { etat: 'deja' }
      if (p.updated_at && ligne.updated_at !== p.updated_at) return { etat: 'relire' }
      toucher(ligne)
      if (JSON.stringify(ligne.fiche ?? {}) !== JSON.stringify(p.fiche ?? {})) return { etat: 'relire' }
      return { etat, updatedAt: ligne.updated_at }
    },
    relirePiece: async (id) => (piece(id) ? { ...piece(id) } : null),
    appeler: async (corps) => {
      m.appels.push(corps)
      m.enVol += 1
      m.maxEnVol = Math.max(m.maxEnVol, m.enVol)
      await new Promise((r) => setTimeout(r, 1))
      m.enVol -= 1
      return await m.reponse(corps)
    },
    // Comme ecrireResultatAnalyse. `m.transaction` (défaut) : la fonction
    // edl_ecrire_analyse, tout ou rien sous verrou. Sinon le repli : prise
    // conditionnée sur siMisAJour, éléments, puis pièce conditionnée sur la
    // version prise. `m.entreEtapes(etape)` laisse un autre appareil (ou le
    // bureau) agir entre deux étapes.
    ecrire: async (x) => {
      m.ecritures.push(x)
      const ligne = piece(x.piece.id)
      const marque = JSON.stringify(x.fiche)
      const ecrireElements = () => {
        m.base.elements = m.base.elements.filter((e) => e.piece_id !== ligne.id)
        m.base.elements.push({ piece_id: ligne.id, de: marque })
      }
      const ecrirePiece = () => {
        if (!m.ecrireMarche) return
        Object.assign(ligne, { analyse_le: x.analyseLe, analyse_erreur: null })
        if (!x.garderFiche) Object.assign(ligne, { fiche: x.fiche, fiche_a_valider: true, ficheDe: marque })
        toucher(ligne)
      }
      const conflit = (elementsEcrits, attendu) => ({ indisponible: false, conflit: true, elementsEcrits, attendu })
      if (m.transaction) {
        m.rpc += 1
        await m.entreEtapes?.('transaction', x)
        // Rien entre ces lignes ne rend la main : c'est la transaction
        if (m.ecritureRefusee || !ligne || ligne.updated_at !== x.siMisAJour) return conflit(false, x.siMisAJour)
        ecrireElements()
        ecrirePiece()
        return { indisponible: false, transaction: true }
      }
      let version = x.siMisAJour
      if (x.siMisAJour !== undefined) {
        await m.entreEtapes?.('prise', x)
        if (m.ecritureRefusee || ligne.updated_at !== x.siMisAJour) return conflit(false, x.siMisAJour)
        toucher(ligne)
        version = ligne.updated_at
      }
      ecrireElements()
      await m.entreEtapes?.('elements', x)
      await m.entreEtapes?.('piece', x)
      if (version !== undefined && ligne.updated_at !== version) return conflit(true, version)
      ecrirePiece()
      return { indisponible: false, elementsEcrits: true }
    },
    noterErreur: async (id, message, { analyseLe } = {}) => {
      const ligne = piece(id)
      if ((ligne.analyse_le ?? null) !== (analyseLe ?? null)) return { ignoree: true }
      m.erreursNotees.push({ id, message })
      ligne.analyse_erreur = message
      toucher(ligne)
      return {}
    },
    lireSuivis: () => m.suivis,
    ecrireSuivi: (id, s) => { if (s) m.suivis[id] = s; else delete m.suivis[id] },
    noterRelance: (a, t) => { if (t == null) delete m.relances[a]; else m.relances[a] = t },
    signaler: (detail) => m.signaux.push(detail),
    maintenant: () => m.maintenant,
    estCoupure: (err) => err?.coupure === true,
    echecsMax: 3,
  }
  m.passe = (options) => passeAnalyseEdl('a1', options, m.d)
  return m
}

const erreur = (code, message = code) => Object.assign(new Error(message), { code })

describe('passeAnalyseEdl', () => {
  test('pièce prête : un appel, résultat écrit, et plus rien au passage suivant', async () => {
    const m = monde({ pieces: [salon({ fiche: { murs: 'corrigé au bureau' } })] })
    const r = await m.passe()
    assert.deepEqual(r, { analysees: 1, echecs: 0, raison: null })
    assert.equal(m.appels.length, 1)
    assert.deepEqual(m.appels[0].ficheActuelle, { murs: 'corrigé au bureau' })
    assert.equal(m.appels[0].piece.nom, 'Salon')
    assert.ok(m.appels[0].lignes.some((l) => l.includes('point P1 posé')))
    // analyse_le = heure de lecture (10:31), au moins la fin du passage
    assert.equal(m.ecritures[0].analyseLe, H('10:31:00'))
    assert.deepEqual(m.suivis, {})
    assert.deepEqual(m.signaux.map((s) => s.etape), ['debut', 'fin'])
    m.maintenant = ms('12:00:00')
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('plusieurs pièces : une à la fois', async () => {
    const m = monde({ pieces: [salon(), salon({ id: 'cuisine', nom: 'Cuisine' })] })
    const r = await m.passe()
    assert.equal(r.analysees, 2)
    assert.equal(m.appels.length, 2)
    assert.equal(m.maxEnVol, 1)
  })

  test('une pièce n’est tentée qu’une fois par passage, même si son état ne bouge pas', async () => {
    const m = monde()
    m.ecrireMarche = false // écriture « réussie » sans effet visible
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('échec : motif noté, pas de nouvel essai avant 10 minutes, puis 1 heure', async () => {
    const m = monde()
    m.reponse = () => { throw erreur('anthropic') }
    await m.passe()
    assert.equal(m.appels.length, 1)
    assert.match(m.erreursNotees[0].message, /pas répondu/)
    assert.equal(m.relances.a1, ms('10:41:00'))
    m.maintenant = ms('10:35:00')
    await m.passe()
    await m.passe()
    assert.equal(m.appels.length, 1)
    m.maintenant = ms('10:41:00')
    await m.passe()
    assert.equal(m.appels.length, 2)
    m.maintenant = ms('11:00:00')
    await m.passe()
    assert.equal(m.appels.length, 2)
    m.maintenant = ms('11:41:00')
    await m.passe()
    assert.equal(m.appels.length, 3)
  })

  test('« Réessayer » passe outre l’attente', async () => {
    const m = monde()
    m.reponse = () => { throw erreur('reponse-illisible') }
    await m.passe()
    m.reponse = () => ({ fiche: { sol: 'carrelage' }, elements: [] })
    m.maintenant = ms('10:32:00')
    await m.passe()
    assert.equal(m.appels.length, 1)
    const r = await m.passe({ seulement: 'salon', forcer: true })
    assert.equal(r.analysees, 1)
    assert.equal(m.appels.length, 2)
    assert.deepEqual(m.suivis, {})
  })

  test('coupure pendant l’appel : rien de noté sur la pièce, mais l’essai compte', async () => {
    const m = monde()
    m.reponse = () => { throw Object.assign(new Error('Réseau'), { code: 'reseau' }) }
    const r = await m.passe()
    assert.equal(r.raison, 'reseau')
    assert.equal(m.erreursNotees.length, 0)
    assert.equal(m.relances.a1, ms('10:31:00') + RELANCE_APRES_ARRET_MS)
    m.maintenant = ms('10:32:00')
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('Claude pas appelé (configuration, session) : l’essai ne compte pas', async () => {
    const m = monde()
    m.reponse = () => { throw erreur('analyse-non-configuree') }
    const r = await m.passe()
    assert.equal(r.raison, 'analyse-non-configuree')
    assert.deepEqual(m.suivis, {})
    assert.equal(m.erreursNotees.length, 0)
  })

  test('frise trop longue : notée sans appel, jamais relancée d’elle-même', async () => {
    const m = monde()
    const longue = [ev('entree', '10:00:00', { piece_id: 'salon' })]
    for (let i = 0; i <= LIGNES_MAX; i++) {
      longue.push(ev('photo', '10:05:00', { piece_id: 'salon', point_id: 'p1' }))
    }
    longue.push(ev('fin', '10:30:00'))
    m.base.evenements = longue
    await m.passe()
    assert.equal(m.appels.length, 0)
    assert.equal(m.erreursNotees[0].message, MESSAGE_FRISE_TROP_LONGUE + SUFFIXE_DEFINITIF)
    m.maintenant = ms('23:00:00')
    await m.passe()
    assert.equal(m.erreursNotees.length, 1)
    assert.equal(m.appels.length, 0)
  })

  test('erreur venue du serveur (400 demande) : définitive aussi', async () => {
    const m = monde()
    m.reponse = () => { throw Object.assign(erreur('demande'), { detail: 'trop-long' }) }
    await m.passe()
    m.maintenant = ms('23:00:00')
    await m.passe()
    assert.equal(m.appels.length, 1)
    assert.equal(m.suivis.salon.definitif, true)
  })

  test('base qui refuse d’écrire, ou pièce analysée ailleurs : pas d’appel', async () => {
    const refus = monde()
    refus.reservation = () => 'refus'
    assert.equal((await refus.passe()).raison, 'refus')
    assert.equal(refus.appels.length, 0)
    const ailleurs = monde({ pieces: [salon(), salon({ id: 'cuisine', nom: 'Cuisine' })] })
    ailleurs.reservation = (p) => (p.id === 'salon' ? 'deja' : 'ok')
    const r = await ailleurs.passe()
    assert.equal(ailleurs.appels.length, 1)
    assert.equal(ailleurs.appels[0].piece.nom, 'Cuisine')
    assert.equal(r.analysees, 1)
  })

  test('relue avant l’appel : une pièce analysée entre-temps ne repart pas', async () => {
    const m = monde()
    const lireFrise = m.d.lireFrise
    m.d.lireFrise = async (a, id) => {
      m.base.pieces[0].analyse_le = H('10:30:30') // un autre onglet vient de la faire
      return lireFrise(a, id)
    }
    const r = await m.passe()
    assert.equal(m.appels.length, 0)
    assert.equal(r.analysees, 0)
  })

  test('son de la pièce encore sur l’appareil : elle attend, puis part', async () => {
    const m = monde()
    m.audio = { morceaux: [morceau(ms('10:09:00'))], tranches: [] }
    await m.passe()
    assert.equal(m.appels.length, 0)
    m.audio = { morceaux: [], tranches: [] }
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('hors ligne, sans session, sans la 082 : rien, en silence', async () => {
    const hors = monde()
    hors.enLigne = false
    assert.equal((await hors.passe()).raison, 'hors-ligne')
    const sans = monde()
    sans.session = false
    assert.equal((await sans.passe()).raison, 'session')
    const sans082 = monde()
    sans082.indisponible = true
    assert.equal((await sans082.passe()).raison, 'indisponible')
    for (const x of [hors, sans, sans082]) {
      assert.equal(x.appels.length, 0)
      assert.equal(x.erreursNotees.length, 0)
    }
  })

  test('appareil illisible : dans le doute, rien ne part', async () => {
    const m = monde()
    m.d.audioLocal = async () => { throw new Error('IndexedDB') }
    assert.equal((await m.passe()).raison, 'appareil')
    assert.equal(m.appels.length, 0)
  })

  test('« seulement » : les autres pièces ne partent pas', async () => {
    const m = monde({ pieces: [salon(), salon({ id: 'cuisine', nom: 'Cuisine' })] })
    await m.passe({ seulement: 'cuisine' })
    assert.equal(m.appels.length, 1)
    assert.equal(m.appels[0].piece.nom, 'Cuisine')
  })
})

describe('Correctifs (tour 1)', () => {
  test('sonTranscritJusquA : dernier debut + duree_s, à 30 s près', () => {
    const iv = { fin: ms('10:10:00'), visiteId: 'v1' }
    const enr = (debut, duree_s, visite_id = 'v1') => ({ visite_id, debut: H(debut), duree_s })
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 600)]), true)
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 600 - MARGE_SON_MS / 1000)]), true)
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 560)]), false)
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 900, 'v2')]), false)
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', null)]), false)
    assert.equal(sonTranscritJusquA(iv, []), false)
  })

  test('sonTranscritJusquA : un morceau manquant au milieu d’un long passage bloque', () => {
    const iv = { debut: ms('10:00:00'), fin: ms('10:09:00'), visiteId: 'v1' }
    const enr = (debut, duree_s) => ({ visite_id: 'v1', debut: H(debut), duree_s })
    // Trois morceaux de 3 minutes, tous transcrits : couvert
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 180), enr('10:03:00', 180), enr('10:06:00', 180)]), true)
    // Celui du milieu attend encore sur la tablette : pas couvert
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 180), enr('10:06:00', 180)]), false)
    // Coupure d'iOS de quelques secondes entre deux morceaux : toléré
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 175), enr('10:03:05', 360)]), true)
    // Rien au début du passage : pas couvert
    assert.equal(sonTranscritJusquA(iv, [enr('10:03:00', 360)]), false)
  })

  test('sonPret : sans morceau de la visite, il faut la transcription ou le délai d’abandon', () => {
    const iv = { fin: ms('10:10:00'), visiteId: 'v1' }
    // Bureau : rien sur l'appareil, rien dans la base
    assert.equal(sonPret(iv, { maintenant: ms('10:31:00') }), false)
    assert.equal(sonPret(iv, { enregistrements: transcrit(), maintenant: ms('10:31:00') }), true)
    assert.equal(sonPret(iv, { maintenant: ms('10:10:00') + DELAI_ABANDON_MS + 1 }), true)
    // Tablette qui tient un morceau de la visite (autre pièce, après) : règle locale
    assert.equal(sonPret(iv, { morceaux: [morceau(ms('10:15:00'))], maintenant: ms('10:31:00') }), true)
    assert.equal(sonPret(iv, { morceaux: [morceau(ms('10:05:00'))], enregistrements: transcrit(), maintenant: ms('10:31:00') }), false)
  })

  test('decisionAnalyse : un autre appareil n’analyse pas avant la transcription', () => {
    const d = decisionAnalyse({ piece: salon(), evenements: journal(), enregistrements: [], maintenant: ms('10:31:00') })
    assert.equal(d.raison, 'son')
  })

  test('échec vu dans la base, visite terminée après lui : essai tout de suite', () => {
    const piece = salon({ analyse_erreur: 'x', updated_at: H('10:05:00') }) // échec noté avant la fin de la cuisine…
    const salonApres = [...journal(), ev('entree', '10:21:00', { piece_id: 'salon' }), ev('sortie', '10:25:00', { piece_id: 'salon' })]
    const d = decisionAnalyse({ piece, evenements: salonApres, enregistrements: transcrit(), maintenant: ms('10:31:00') })
    assert.equal(d.raison, 'nouvelle-visite')
    // Échec noté après la dernière visite : attente
    const tard = salon({ analyse_erreur: 'x', updated_at: H('10:30:30') })
    assert.equal(decisionAnalyse({ piece: tard, evenements: salonApres, enregistrements: transcrit(), maintenant: ms('10:31:00') }).raison, 'attente-echec')
  })

  test('suiviApresEchec : refus, demande trop longue, dernier essai → définitif', () => {
    assert.equal(suiviApresEchec({ essais: 1 }, { code: 'refus' }).definitif, true)
    assert.equal(suiviApresEchec({ essais: 1 }, { code: 'demande' }).definitif, true)
    assert.equal(suiviApresEchec({ essais: ESSAIS_AUTO_MAX }, { code: 'anthropic' }).definitif, true)
    assert.equal(suiviApresEchec({ essais: 1 }, { code: 'anthropic' }).definitif, false)
  })

  test('suiteConflitEcriture', () => {
    const piece = salon({ fiche: { sol: 'parquet' }, analyse_le: null })
    const reserve = H('10:31:01')
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: null }), 'disparue')
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, analyse_le: H('10:31:30'), updated_at: H('10:31:30') } }), 'deja-fait')
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, updated_at: '2026-11-18T10:31:01+00:00' } }), 'lecture-seule')
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, fiche: { sol: 'carrelage' }, updated_at: H('10:31:20') } }), 'fiche-agence')
    // Seul un statut ou la porte changés au bureau : c'est aussi une fiche de l'agence
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, fiche: { sol: 'parquet', statuts: { sol: 'deposer' } }, updated_at: H('10:31:20') } }), 'fiche-agence')
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, fiche: { sol: 'parquet', porte: { vantail: 'bois' } }, updated_at: H('10:31:20') } }), 'fiche-agence')
    // Clés vides ajoutées par un enregistrement : même fiche
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, fiche: { sol: 'parquet', porte: { huisserie: '' }, statuts: { sol: null } }, analyse_erreur: 'x', updated_at: H('10:31:20') } }), 'reessayer')
    assert.equal(suiteConflitEcriture({ piece, reserve, relue: { ...piece, analyse_erreur: 'x', updated_at: H('10:31:20') } }), 'reessayer')
  })

  test('fermePassage : sortie, fin, visite terminée ; pas un point posé', () => {
    const op = (type, evenement) => ({ type, charge: evenement ? { evenement: { type: evenement } } : {} })
    assert.equal(fermePassage(op(TYPES_EDL.evenement, 'sortie')), true)
    assert.equal(fermePassage(op(TYPES_EDL.evenement, 'fin')), true)
    assert.equal(fermePassage(op(TYPES_EDL.visiteTerminer)), true)
    assert.equal(fermePassage(op(TYPES_EDL.evenement, 'point')), false)
    assert.equal(fermePassage(op(TYPES_EDL.pointPoser)), false)
  })

  test('trois essais automatiques ratés : plus jamais d’elle-même, sauf « Réessayer »', async () => {
    const m = monde()
    m.reponse = () => { throw erreur('anthropic') }
    for (const t of ['10:31:00', '10:41:00', '11:41:00']) {
      m.maintenant = ms(t)
      await m.passe()
    }
    assert.equal(m.appels.length, ESSAIS_AUTO_MAX)
    assert.equal(m.suivis.salon.definitif, true)
    for (const t of ['13:00:00', '18:00:00', '23:59:00']) {
      m.maintenant = ms(t)
      await m.passe()
    }
    assert.equal(m.appels.length, ESSAIS_AUTO_MAX)
    assert.equal(m.relances.a1, undefined)
    const r = await m.passe({ seulement: 'salon' })
    assert.equal(r.raison, 'echec-definitif')
    m.reponse = () => ({ fiche: {}, elements: [] })
    await m.passe({ seulement: 'salon', forcer: true })
    assert.equal(m.appels.length, ESSAIS_AUTO_MAX + 1)
  })

  test('refus de Claude : définitif tout de suite', async () => {
    const m = monde()
    m.reponse = () => { throw erreur('refus') }
    await m.passe()
    assert.match(m.erreursNotees[0].message, /pas accepté/)
    assert.equal(m.suivis.salon.definitif, true)
    m.maintenant = ms('23:00:00')
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('autre appareil : pas d’analyse tant que le son de la tablette n’est pas transcrit', async () => {
    const m = monde()
    m.base.enregistrements = []
    const r = await m.passe({ seulement: 'salon' })
    assert.equal(r.raison, 'son')
    assert.equal(m.appels.length, 0)
    m.base.enregistrements = transcrit()
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('raisons précises de « seulement » : passage, gestes, deja-fait', async () => {
    const ouvert = monde({ evenements: journal().slice(0, 3), maintenant: ms('10:05:00') })
    assert.equal((await ouvert.passe({ seulement: 'salon' })).raison, 'passage')
    const gestes = monde()
    gestes.gestes = [{ creeLe: ms('10:05:00') }]
    assert.equal((await gestes.passe({ seulement: 'salon' })).raison, 'gestes')
    const fait = monde({ pieces: [salon({ analyse_le: H('10:31:00') })] })
    assert.equal((await fait.passe({ seulement: 'salon' })).raison, 'deja-fait')
  })

  test('fiche modifiée au bureau pendant l’appel : la fiche de l’agence reste, l’analyse est notée', async () => {
    const m = monde({ pieces: [salon({ fiche: { sol: 'parquet' } })] })
    m.reponse = () => {
      const ligne = m.base.pieces[0]
      ligne.fiche = { sol: 'parquet chêne (corrigé)' }
      ligne.updated_at = H('10:31:30')
      return { fiche: { sol: 'parquet', murs: 'peints' }, elements: [] }
    }
    const r = await m.passe()
    assert.equal(r.analysees, 1)
    assert.deepEqual(m.base.pieces[0].fiche, { sol: 'parquet chêne (corrigé)' })
    assert.equal(m.base.pieces[0].analyse_le, H('10:31:00'))
    assert.equal(m.ecritures.length, 2)
    assert.equal(m.ecritures[1].garderFiche, true)
    // Premier essai refusé en entier : les éléments sont ceux du second
    assert.equal(m.base.elements.length, 1)
    assert.equal(m.base.elements[0].de, JSON.stringify(m.ecritures[1].fiche))
  })

  test('autre écriture sans toucher la fiche : le résultat s’écrit sur la version relue', async () => {
    const m = monde()
    m.reponse = () => {
      m.base.pieces[0].updated_at = H('10:31:30')
      return { fiche: { sol: 'parquet' }, elements: [] }
    }
    await m.passe()
    assert.equal(m.base.pieces[0].fiche.sol, 'parquet')
    assert.equal(m.ecritures[1].garderFiche, false)
  })

  test('base qui refuse l’écriture finale : « Lecture seule », pas de boucle', async () => {
    const m = monde()
    m.ecritureRefusee = true
    const r = await m.passe()
    assert.equal(r.raison, 'refus')
    assert.equal(m.ecritures.length, 1)
    m.maintenant = ms('10:32:00')
    await m.passe()
    assert.equal(m.appels.length, 1)
  })

  test('analysée ailleurs pendant l’appel : son résultat reste, aucun échec noté', async () => {
    const m = monde()
    m.reponse = () => {
      Object.assign(m.base.pieces[0], { analyse_le: H('10:31:20'), updated_at: H('10:31:20'), fiche: { sol: 'tomettes' } })
      return { fiche: { sol: 'parquet' }, elements: [] }
    }
    await m.passe()
    assert.deepEqual(m.base.pieces[0].fiche, { sol: 'tomettes' })
    assert.equal(m.erreursNotees.length, 0)
    assert.deepEqual(m.suivis, {})
  })

  test('échec noté seulement si la pièce n’a pas été analysée ailleurs', async () => {
    const m = monde()
    m.reponse = () => {
      m.base.pieces[0].analyse_le = H('10:31:20')
      throw erreur('anthropic')
    }
    await m.passe()
    assert.equal(m.erreursNotees.length, 0)
    assert.equal(m.base.pieces[0].analyse_erreur, null)
  })
})

describe('Correctifs (tour 2)', () => {
  test('couverture : le morceau transcrit de la pièce suivante ne couvre pas celle-ci', () => {
    // Morceau du salon (10:00-10:10) refusé une fois, encore sur la tablette ;
    // celui de la cuisine (10:10-10:20) transcrit. Vu du bureau.
    const cuisine = [{ visite_id: 'v1', debut: H('10:10:00'), duree_s: 600 }]
    const iv = { debut: ms('10:00:00'), fin: ms('10:10:00'), visiteId: 'v1', clos: true }
    assert.equal(sonTranscritJusquA(iv, cuisine), false)
    assert.equal(sonPret(iv, { enregistrements: cuisine, maintenant: ms('10:21:00') }), false)
    const d = decisionAnalyse({ piece: salon(), evenements: journal(), enregistrements: cuisine, maintenant: ms('10:21:00') })
    assert.equal(d.raison, 'son')
    // Le morceau du salon arrive : couvert
    const tout = [{ visite_id: 'v1', debut: H('10:00:00'), duree_s: 600 }, ...cuisine]
    assert.equal(sonTranscritJusquA(iv, tout), true)
  })

  test('motifEchec : suffixe des échecs définitifs, reconnu partout, jamais doublé', () => {
    const m1 = motifEchec('Claude n’a pas accepté d’analyser cette pièce.', { definitif: true })
    assert.equal(m1, `Claude n’a pas accepté d’analyser cette pièce${SUFFIXE_DEFINITIF}`)
    assert.equal(echecDefinitifNote(m1), true)
    assert.equal(motifEchec(m1, { definitif: true }), m1)
    assert.equal(echecDefinitifNote(motifEchec('Le service de Claude n’a pas répondu.')), false)
    assert.ok(motifEchec('x'.repeat(2000), { definitif: true }).length <= 500)
    assert.equal(echecDefinitifNote(motifEchec('x'.repeat(2000), { definitif: true })), true)
  })

  test('échec définitif noté dans la base : un appareil neuf ne relance pas', () => {
    const piece = salon({ analyse_erreur: motifEchec('Le service de Claude n’a pas répondu.', { definitif: true }), updated_at: H('10:31:00') })
    const base = { evenements: journal(), enregistrements: transcrit() }
    assert.equal(decisionAnalyse({ ...base, piece, maintenant: ms('23:00:00') }).raison, 'echec-definitif')
    assert.equal(decisionAnalyse({ ...base, piece, maintenant: ms('23:00:00'), forcer: true }).raison, 'demande')
    // Suivi local valable mais motif définitif écrit par un autre appareil
    const suivi = { essais: 1, dernier: ms('10:31:00'), couvert: ms('10:31:00'), analyseLe: null }
    assert.equal(decisionAnalyse({ ...base, piece, suivi, maintenant: ms('23:00:00') }).raison, 'echec-definitif')
  })

  test('règle 7 : marge de 5 minutes et analyse_le comptée', () => {
    const avec = (fin) => [...journal(), ev('entree', '10:21:00', { piece_id: 'salon' }), ev('sortie', fin, { piece_id: 'salon' })]
    const base = { enregistrements: [{ visite_id: 'v1', debut: H('09:59:00'), duree_s: 3600 }], maintenant: ms('11:00:00') }
    const piece = salon({ analyse_erreur: 'x', updated_at: H('10:20:00') })
    // Fin à 10:24 : dans la marge (10:20 + 5 min) → attente
    assert.equal(decisionAnalyse({ ...base, piece, evenements: avec('10:24:00') }).raison, 'attente-echec')
    // Fin à 10:26 : au-delà → essai tout de suite
    assert.equal(decisionAnalyse({ ...base, piece, evenements: avec('10:26:00') }).raison, 'nouvelle-visite')
    // analyse_le plus tard que updated_at : c'est lui qui compte
    const analysee = salon({ analyse_erreur: 'x', updated_at: H('10:00:00'), analyse_le: H('10:22:00') })
    assert.equal(decisionAnalyse({ ...base, piece: analysee, evenements: avec('10:26:00') }).raison, 'attente-echec')
    assert.equal(MARGE_HORLOGE_MS, 5 * 60 * 1000)
  })

  test('plafond atteint : le motif porte le suffixe, un autre appareil s’abstient', async () => {
    const tablette = monde()
    tablette.reponse = () => { throw erreur('anthropic') }
    for (const t of ['10:31:00', '10:41:00', '11:41:00']) {
      tablette.maintenant = ms(t)
      await tablette.passe()
    }
    assert.equal(echecDefinitifNote(tablette.base.pieces[0].analyse_erreur), true)
    assert.equal(echecDefinitifNote(tablette.erreursNotees[0].message), false)
    const bureau = monde()
    bureau.base = tablette.base
    bureau.maintenant = ms('23:00:00')
    await bureau.passe()
    assert.equal(bureau.appels.length, 0)
  })

  test('deux appareils : un seul résultat s’écrit, fiche et éléments ensemble', async () => {
    const a = monde()
    const b = monde()
    b.base = a.base
    b.reponse = () => ({ fiche: { sol: 'tomettes (B)' }, elements: [] })
    // Pendant l'appel de A, B fait toute son analyse
    a.reponse = async () => {
      await b.passe()
      return { fiche: { sol: 'parquet (A)' }, elements: [] }
    }
    await a.passe()
    assert.equal(a.appels.length, 1)
    assert.equal(b.appels.length, 1)
    const ligne = a.base.pieces[0]
    assert.equal(ligne.fiche.sol, 'tomettes (B)')
    assert.equal(a.base.elements.length, 1)
    assert.equal(a.base.elements[0].de, ligne.ficheDe)
    // A n'a rien écrit et ne note aucun échec
    assert.equal(a.ecritures.length, 1)
    assert.equal(a.erreursNotees.length, 0)
  })

  test('deux appareils : B réserve pendant l’appel de A, A écrit, B trouve la pièce faite', async () => {
    const a = monde()
    const b = monde()
    b.base = a.base
    let ouvrir
    const porte = new Promise((r) => { ouvrir = r })
    b.reponse = async () => { await porte; return { fiche: { sol: 'tomettes (B)' }, elements: [] } }
    let passeB
    a.reponse = async () => {
      passeB = b.passe() // B réserve et part chez Claude
      await new Promise((r) => setTimeout(r, 5))
      return { fiche: { sol: 'parquet (A)' }, elements: [] }
    }
    await a.passe()
    ouvrir()
    const rb = await passeB
    const ligne = a.base.pieces[0]
    assert.equal(ligne.fiche.sol, 'parquet (A)')
    assert.equal(a.base.elements[0].de, ligne.ficheDe)
    assert.equal(rb.analysees, 0)
    assert.equal(b.erreursNotees.length, 0)
    // Les deux ont payé : limite connue, sans colonne de bail
    assert.equal(a.appels.length + b.appels.length, 2)
  })

  test('« Valider la fiche » pendant l’appel : la fiche reste validée', async () => {
    const m = monde({ pieces: [salon({ fiche: { sol: 'parquet' }, fiche_a_valider: true, analyse_le: H('10:05:00') })] })
    m.base.evenements = [...journal(), ev('entree', '10:21:00', { piece_id: 'salon' }), ev('sortie', '10:25:00', { piece_id: 'salon' })]
    m.reponse = () => {
      const ligne = m.base.pieces[0]
      ligne.fiche_a_valider = false
      ligne.updated_at = H('10:31:30')
      return { fiche: { sol: 'parquet ciré' }, elements: [] }
    }
    const r = await m.passe()
    assert.equal(r.analysees, 1)
    assert.equal(m.base.pieces[0].fiche_a_valider, false)
    assert.deepEqual(m.base.pieces[0].fiche, { sol: 'parquet' })
    assert.equal(m.ecritures[1].garderFiche, true)
  })

  test('second conflit dans « reessayer » : rien d’écrit → « conflit »', async () => {
    const m = monde()
    m.reponse = () => {
      m.base.pieces[0].updated_at = H('10:31:30') // autre écriture, fiche inchangée
      return { fiche: { sol: 'parquet' }, elements: [] }
    }
    let n2 = 0
    m.entreEtapes = (etape) => {
      if (etape === 'transaction' && ++n2 === 2) m.base.pieces[0].updated_at = H('10:31:50')
    }
    const r = await m.passe({ seulement: 'salon' })
    assert.equal(r.raison, 'conflit')
    assert.equal(m.base.elements.length, 0)
    assert.equal(m.base.pieces[0].analyse_le, null)
    assert.equal(m.erreursNotees.length, 0)
  })

  test('repli sans transaction : second conflit après les éléments → « conflit-elements », jamais « Lecture seule »', async () => {
    const m = monde()
    m.transaction = false
    // Une écriture concurrente juste avant la pièce, aux deux essais
    m.entreEtapes = (etape) => {
      if (etape === 'piece') m.base.pieces[0].updated_at = new Date(Date.parse(m.base.pieces[0].updated_at) + 5000).toISOString()
    }
    const r = await m.passe({ seulement: 'salon' })
    assert.equal(r.raison, 'conflit-elements')
    assert.equal(m.base.elements.length, 1)
  })

  test('fiche changée au bureau entre la frise et la réservation : frise refaite avant de payer', async () => {
    const m = monde({ pieces: [salon({ fiche: { sol: 'parquet' } })] })
    const lireFrise = m.d.lireFrise
    let lectures = 0
    m.d.lireFrise = async (a, id) => {
      const lu = await lireFrise(a, id)
      if (++lectures === 1) m.base.pieces[0].fiche = { sol: 'parquet chêne' }
      return lu
    }
    await m.passe()
    assert.equal(lectures, 2)
    assert.equal(m.appels.length, 1)
    assert.deepEqual(m.appels[0].ficheActuelle, { sol: 'parquet chêne' })
  })

  test('réservation : pièce analysée entre-temps (analyse_le), rien n’est payé', async () => {
    const m = monde()
    const lireFrise = m.d.lireFrise
    m.d.lireFrise = async (a, id) => {
      const lu = await lireFrise(a, id)
      m.base.pieces[0].analyse_le = H('10:30:59')
      return lu
    }
    const r = await m.passe({ seulement: 'salon' })
    assert.equal(r.raison, 'deja-fait')
    assert.equal(m.appels.length, 0)
  })
})

describe('Correctifs (tour 3)', () => {
  // Salon : entrée 10:00, arrêt à 10:03, reprise à 10:07, sortie 10:12
  const avecArret = (type, arret = '10:03:00', reprise = '10:07:00') => [
    ev('debut', '09:59:00'),
    ev('entree', '10:00:00', { piece_id: 'salon' }),
    ev(type, arret, { piece_id: 'salon' }),
    ev('reprise', reprise, { piece_id: 'salon' }),
    ev('sortie', '10:12:00', { piece_id: 'salon' }),
    ev('fin', '10:12:01'),
  ]
  const enr = (debut, duree_s) => ({ visite_id: 'v1', debut: H(debut), duree_s })

  test('intervallesPiece rend les arrêts repris dans la pièce', () => {
    const [iv] = intervallesPiece(avecArret('pause'), 'salon')
    assert.deepEqual(iv.arrets, [[ms('10:03:00'), ms('10:07:00')]])
    assert.equal(iv.fin, ms('10:12:00'))
    const [sans] = intervallesPiece(journal(), 'salon')
    assert.deepEqual(sans.arrets, [])
  })

  test('pause reprise dans la pièce : le trou du son est normal, la pièce part', () => {
    const evenements = avecArret('pause')
    const sons = [enr('10:00:00', 180), enr('10:07:00', 300)]
    const [iv] = intervallesPiece(evenements, 'salon')
    assert.equal(sonTranscritJusquA(iv, sons), true)
    const d = decisionAnalyse({ piece: salon(), evenements, enregistrements: sons, maintenant: ms('10:13:00') })
    assert.equal(d.raison, 'a-analyser')
    // Le morceau d'après la reprise manque : la pièce attend
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 180)]), false)
    // Un trou hors de l'arrêt reste un trou
    assert.equal(sonTranscritJusquA(iv, [enr('10:00:00', 60), enr('10:07:00', 300)]), false)
  })

  test('coupure d’iOS (écran verrouillé) puis reprise : la pièce part', () => {
    const evenements = avecArret('coupure', '10:04:04', '10:05:30')
    const sons = [enr('10:00:00', 180), enr('10:03:00', 64), enr('10:05:30', 390)]
    assert.equal(decisionAnalyse({ piece: salon(), evenements, enregistrements: sons, maintenant: ms('10:13:00') }).raison, 'a-analyser')
    // Sans le morceau d'avant la coupure : trou de 64 s > TROU_SON_MS
    assert.ok(64_000 > TROU_SON_MS)
    assert.equal(decisionAnalyse({ piece: salon(), evenements, enregistrements: [sons[0], sons[2]], maintenant: ms('10:13:00') }).raison, 'son')
  })

  test('écriture transactionnelle : fonction appelée, deux appareils ne se mélangent pas', async () => {
    const a = monde()
    const b = monde()
    b.base = a.base
    a.reponse = () => ({ fiche: { sol: 'parquet (A)' }, elements: [] })
    b.reponse = () => ({ fiche: { sol: 'tomettes (B)' }, elements: [] })
    let premiere = true
    // A est retenu juste avant sa transaction ; B fait toute son analyse
    a.entreEtapes = async (etape) => {
      if (etape === 'transaction' && premiere) {
        premiere = false
        b.maintenant = a.maintenant
        await b.passe()
      }
    }
    const ra = await a.passe()
    const ligne = a.base.pieces[0]
    assert.equal(a.rpc, 1)
    assert.equal(ra.analysees, 0)
    assert.equal(ligne.fiche.sol, 'tomettes (B)')
    assert.equal(a.base.elements.length, 1)
    assert.equal(a.base.elements[0].de, ligne.ficheDe)
  })

  test('repli sans transaction : le scénario du relecteur reste cohérent (tout refait)', async () => {
    const a = monde()
    const b = monde()
    a.transaction = false
    b.transaction = false
    b.base = a.base
    a.reponse = () => ({ fiche: { sol: 'parquet (A)' }, elements: [] })
    b.reponse = () => ({ fiche: { sol: 'tomettes (B)' }, elements: [] })
    let bArrive
    let ouvrir
    const bAuPiece = new Promise((r) => { bArrive = r })
    const porteB = new Promise((r) => { ouvrir = r })
    let passeB
    let premiere = true
    a.entreEtapes = async (etape) => {
      if (etape === 'piece' && premiere) {
        premiere = false
        b.maintenant = a.maintenant
        passeB = b.passe()
        await bAuPiece
      }
    }
    b.entreEtapes = async (etape) => {
      if (etape === 'piece') { bArrive(); await porteB }
    }
    await a.passe()
    ouvrir()
    await passeB
    const ligne = a.base.pieces[0]
    assert.equal(a.base.elements.length, 1)
    assert.equal(a.base.elements[0].de, ligne.ficheDe)
    // Le second essai de A refait la prise et les éléments
    assert.equal(a.ecritures.length, 2)
    assert.equal(a.ecritures[1].elementsEcrits, undefined)
  })

  test('réservation : pièce modifiée depuis la frise (updated_at) → frise relue, motif d’un autre appareil gardé', async () => {
    const m = monde()
    const lireFrise = m.d.lireFrise
    let lectures = 0
    m.d.lireFrise = async (a, id) => {
      const lu = await lireFrise(a, id)
      // Un autre appareil note un échec définitif juste après la lecture
      if (++lectures === 1) Object.assign(m.base.pieces[0], { analyse_erreur: `x${SUFFIXE_DEFINITIF}`, updated_at: H('10:30:50') })
      return lu
    }
    const r = await m.passe({ seulement: 'salon' })
    assert.equal(lectures, 2)
    // Relue, la pièce est en échec définitif : rien n'est payé, le motif reste
    assert.equal(m.appels.length, 0)
    assert.equal(r.raison, 'echec-definitif')
    assert.equal(echecDefinitifNote(m.base.pieces[0].analyse_erreur), true)
  })

  test('double conflit sur une pièce : les autres pièces continuent', async () => {
    const m = monde({ pieces: [salon(), salon({ id: 'cuisine', nom: 'Cuisine' })] })
    let conflits = 0
    m.entreEtapes = (etape, x) => {
      if (etape === 'transaction' && x.piece.id === 'salon' && conflits < 2) {
        conflits += 1
        const ligne = m.base.pieces.find((p) => p.id === 'salon')
        ligne.updated_at = new Date(Date.parse(ligne.updated_at) + 5000).toISOString()
      }
    }
    const r = await m.passe()
    assert.equal(m.appels.length, 2)
    assert.equal(r.analysees, 1)
    assert.equal(r.raison, null)
    assert.ok(m.base.pieces.find((p) => p.id === 'cuisine').analyse_le)
    // Le salon repartira de lui-même après l'attente
    assert.equal(m.relances.a1, ms('10:41:00'))
    const seul = monde()
    let n3 = 0
    seul.entreEtapes = (etape) => {
      if (etape === 'transaction' && n3++ < 2) seul.base.pieces[0].updated_at = new Date(Date.parse(seul.base.pieces[0].updated_at) + 5000).toISOString()
    }
    assert.equal((await seul.passe({ seulement: 'salon' })).raison, 'conflit')
  })
})

describe('Correctifs (vague finale)', () => {
  test('réponse tronquée : définitive (même frise, même longueur) ; illisible : relancée', () => {
    assert.equal(suiviApresEchec({ essais: 1 }, { code: 'reponse-tronquee' }).definitif, true)
    assert.equal(suiviApresEchec({ essais: 1 }, { code: 'reponse-illisible' }).definitif, false)
  })

  test('échec définitif noté par un autre appareil : passe avant le suivi de celui-ci', () => {
    // La tablette a échoué une fois (couverture 10:11). Le salon est revisité
    // de 10:21 à 10:26, puis le bureau échoue définitivement à 10:40 sur
    // cette visite-là. La tablette ne doit pas repayer à son tour.
    const revisite = [...journal(), ev('entree', '10:21:00', { piece_id: 'salon' }), ev('sortie', '10:26:00', { piece_id: 'salon' })]
    const sons = [{ visite_id: 'v1', debut: H('09:59:00'), duree_s: 3600 }]
    const suivi = { essais: 1, dernier: ms('10:11:00'), couvert: ms('10:11:00'), analyseLe: null, definitif: false }
    const piece = salon({ analyse_erreur: motifEchec('Le service de Claude n’a pas répondu.', { definitif: true }), updated_at: H('10:40:00') })
    const base = { piece, suivi, enregistrements: sons, maintenant: ms('11:00:00') }
    assert.equal(decisionAnalyse({ ...base, evenements: revisite }).raison, 'echec-definitif')
    // Le même motif sans suffixe : la visite nouvelle pour cet appareil repart
    assert.equal(decisionAnalyse({ ...base, piece: salon({ analyse_erreur: 'x', updated_at: H('10:40:00') }), evenements: revisite }).raison, 'nouvelle-visite')
    // Une visite finie après l'échec (base + 5 min) lève le définitif, sur tout appareil
    const apres = [...revisite, ev('entree', '10:44:00', { piece_id: 'salon' }), ev('sortie', '10:46:00', { piece_id: 'salon' })]
    assert.equal(decisionAnalyse({ ...base, evenements: apres }).raison, 'nouvelle-visite')
    assert.equal(decisionAnalyse({ ...base, suivi: null, evenements: apres }).raison, 'nouvelle-visite')
    // Dans la marge de 5 minutes : encore définitif
    const marge = [...revisite, ev('entree', '10:41:00', { piece_id: 'salon' }), ev('sortie', '10:44:00', { piece_id: 'salon' })]
    assert.equal(decisionAnalyse({ ...base, evenements: marge }).raison, 'echec-definitif')
  })
})

describe('passeAnalyseEdl : liaisons et cotes (084)', () => {
  const avecTraces = (m, traces) => {
    const lire = m.d.lireFrise
    m.d.lireFrise = async (...args) => ({ ...(await lire(...args)), traces })
    m.base.points = [
      { id: 'p1', piece_id: 'salon', numero: 1, type: 'interrupteur' },
      { id: 'p2', piece_id: 'salon', numero: 2, type: 'luminaire' },
    ]
  }

  test('sans traces lues : demande et écriture d’avant la 084', async () => {
    const m = monde()
    await m.passe()
    assert.equal('tracesPiece' in m.appels[0], false)
    assert.equal(m.ecritures[0].traces, null)
  })

  test('traces lues : décrites à Claude, propositions relues puis écrites avec la visite', async () => {
    const m = monde()
    const cote = { id: 'c1', sorte: 'cote', piece_id: 'salon', niveau_id: 'n1', xa: 0, ya: 0, xb: 3, yb: 0, valeur: null, a_valider: false, origine: 'main' }
    avecTraces(m, [cote])
    m.reponse = () => ({
      fiche: { sol: 'parquet' }, elements: [],
      liaisons: [{ interrupteur: 'P2', luminaire: 'P1', extrait: 'il allume le plafonnier' }, { interrupteur: 'P1', luminaire: 'P1', extrait: '' }],
      cotes: [{ cote: 'C1', valeur: '3,05', extrait: 'trois mètres cinq' }],
    })
    await m.passe()
    assert.deepEqual(m.appels[0].tracesPiece, [
      'Interrupteurs et luminaires posés dans la pièce : P1 (Interrupteur), P2 (Luminaire).',
      'Aucune liaison existante.',
      'Cotes posées dans la pièce (1) :',
      '- C1 : sans valeur (longueur dessinée ≈ 3,00 m)',
    ])
    assert.deepEqual(m.ecritures[0].traces, {
      liaisons: [{ point_a: 'p1', point_b: 'p2', extrait: 'il allume le plafonnier' }],
      cotes: [{ id: 'c1', valeur: '3,05 m', extrait: 'trois mètres cinq' }],
    })
    assert.equal(m.ecritures[0].visiteId, 'v1')
  })

  test('traces lues, rien de proposé : listes vides écrites (propositions remplacées)', async () => {
    const m = monde()
    avecTraces(m, [])
    await m.passe()
    assert.deepEqual(m.ecritures[0].traces, { liaisons: [], cotes: [] })
  })

  test('après un conflit, la seconde écriture garde les traces', async () => {
    const m = monde()
    avecTraces(m, [])
    let une = true
    m.entreEtapes = async (etape) => {
      // Le bureau corrige la fiche pendant l'appel : la fiche de l'agence est gardée
      if (etape === 'transaction' && une) { une = false; Object.assign(m.base.pieces[0], { fiche: { sol: 'corrigé' }, updated_at: H('10:40:00') }) }
    }
    m.reponse = () => ({ fiche: {}, elements: [], liaisons: [{ interrupteur: 'P1', luminaire: 'P2', extrait: '' }], cotes: [] })
    await m.passe()
    assert.equal(m.ecritures.length, 2)
    assert.equal(m.ecritures[1].garderFiche, true)
    assert.deepEqual(m.ecritures[1].traces, { liaisons: [{ point_a: 'p1', point_b: 'p2', extrait: '' }], cotes: [] })
  })
})
