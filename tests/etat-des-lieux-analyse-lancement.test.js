// État des lieux, lot 3 : quand une pièce part chez Claude. Son qui attend
// encore sur l'appareil, gestes pas envoyés, attente après échec, et le
// passage complet avec une base, un appareil et un Claude simulés — chaque
// appel se paie, aucun ne doit partir deux fois. Données inventées.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  morceauxQuiBloquent, gestesQuiBloquent, decisionAnalyse, suiviTentative, suiviValable, analyseLeApres,
  prochaineRelance, attenteApresEchecs, messageEchecAnalyse, pieceDemandee, DELAI_TRANCHE_VIVANTE_MS,
  DELAI_ABANDON_MS, MESSAGE_FRISE_TROP_LONGUE, LIGNES_MAX,
} from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js'
import { passeAnalyseEdl, RELANCE_APRES_ARRET_MS } from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlPasse.js'
import { etatPieceVisite, COULEURS_PIECE } from '../src/modules/etude/etat-des-lieux/visite/visiteLogique.js'

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
  const base = (champs = {}) => ({ piece: salon(), evenements: journal(), maintenant: ms('10:31:00'), ...champs })
  test('pièce visitée, passage fini, rien qui attend : on tente', () => {
    assert.deepEqual(decisionAnalyse(base()), { tenter: true, raison: 'a-analyser' })
  })
  test('jamais visitée, déjà analysée, ou passage en cours : rien', () => {
    assert.equal(decisionAnalyse(base({ piece: salon({ id: 'chambre' }) })).raison, 'rien')
    assert.equal(decisionAnalyse(base({ piece: salon({ analyse_le: H('10:11:00') }) })).raison, 'rien')
    const enCours = journal().slice(0, 3)
    assert.equal(decisionAnalyse(base({ evenements: enCours })).tenter, false)
  })
  test('visite quittée par Retour : partie seulement après le délai d’abandon', () => {
    const quittee = journal().slice(0, 3) // dernier événement à 10:01
    assert.equal(decisionAnalyse(base({ evenements: quittee, maintenant: ms('11:00:00') })).tenter, false)
    assert.equal(decisionAnalyse(base({ evenements: quittee, maintenant: ms('10:01:00') + DELAI_ABANDON_MS })).tenter, true)
  })
  test('son ou geste qui attend sur l’appareil : la pièce attend', () => {
    assert.equal(decisionAnalyse(base({ morceaux: [morceau(ms('10:05:00'))] })).raison, 'audio')
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
    assert.equal(decisionAnalyse(base({ piece, suivi, evenements: revue, maintenant: ms('10:41:00') })).raison, 'nouvelle-visite')
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
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('23:00:00') })).raison, 'definitif')
    assert.equal(decisionAnalyse(base({ piece, suivi, maintenant: ms('10:32:00'), forcer: true })).raison, 'demande')
  })
  test('forcer n’envoie pas une pièce dont le son attend encore', () => {
    assert.equal(decisionAnalyse(base({ forcer: true, morceaux: [morceau(ms('10:05:00'))] })).raison, 'audio')
  })
  test('relancer : pièce déjà analysée, tous ses passages finis', () => {
    const faite = salon({ analyse_le: H('10:31:00') })
    assert.equal(decisionAnalyse(base({ piece: faite, relancer: true })).raison, 'demande')
    assert.equal(decisionAnalyse(base({ piece: faite, relancer: true, evenements: journal().slice(0, 3), maintenant: ms('10:05:00') })).raison, 'en-cours')
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
    assert.equal(prochaineRelance({ pieces: [salon({ analyse_le: H('10:31:00') })], evenements: journal(), maintenant: ms('10:32:00') }), null)
    const definitif = { salon: { essais: 1, dernier: ms('10:31:00'), analyseLe: null, definitif: true } }
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), suivis: definitif, maintenant: ms('10:32:00') }), null)
    const passe = { salon: { essais: 1, dernier: ms('10:31:00'), analyseLe: null } }
    assert.equal(prochaineRelance({ pieces: [salon()], evenements: journal(), suivis: passe, maintenant: ms('11:00:00') }), null)
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
    base: { pieces: pieces.map((p) => ({ ...p })), evenements, points: [{ id: 'p1', piece_id: 'salon', numero: 1 }], enregistrements: [], elements: [] },
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
  }
  const piece = (id) => m.base.pieces.find((p) => p.id === id)
  m.d = {
    enLigne: () => m.enLigne,
    aSession: async () => m.session,
    lireSuivi: async () => (m.indisponible ? { indisponible: true } : { indisponible: false, pieces: m.base.pieces.map((p) => ({ ...p })), evenements: m.base.evenements }),
    lireFrise: async (_a, id) => ({
      indisponible: m.indisponible, piece: piece(id) ? { ...piece(id) } : null, evenements: m.base.evenements,
      points: m.base.points, enregistrements: m.base.enregistrements, elementsValides: [],
    }),
    audioLocal: async () => m.audio,
    gestesEnAttente: async () => m.gestes,
    reserver: async (p) => m.reservation(p),
    appeler: async (corps) => {
      m.appels.push(corps)
      m.enVol += 1
      m.maxEnVol = Math.max(m.maxEnVol, m.enVol)
      await new Promise((r) => setTimeout(r, 1))
      m.enVol -= 1
      return m.reponse(corps)
    },
    ecrire: async (x) => {
      m.ecritures.push(x)
      if (m.ecrireMarche) Object.assign(piece(x.piece.id), { fiche: x.fiche, analyse_le: x.analyseLe, analyse_erreur: null })
      return { indisponible: false }
    },
    noterErreur: async (id, message) => { m.erreursNotees.push({ id, message }); piece(id).analyse_erreur = message },
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
    m.reponse = () => { throw erreur('refus') }
    await m.passe()
    assert.equal(m.appels.length, 1)
    assert.match(m.erreursNotees[0].message, /pas accepté/)
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
    assert.equal(m.erreursNotees[0].message, MESSAGE_FRISE_TROP_LONGUE)
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
