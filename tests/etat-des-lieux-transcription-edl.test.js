/* global process, Buffer -- la fonction serveur est essayée sous Node */
// État des lieux, lot 3 : transcription horodatée des morceaux de la visite
// (ligne écrite, heure d'une phrase, morceaux orphelins) et mode horodaté de
// la fonction serveur, sans changement pour les comptes rendus. Données
// inventées.

import assert from 'node:assert/strict'
import { test, describe, beforeEach, afterEach } from 'node:test'

import {
  ligneTranscription, heureSegment, morceauxAPurger, segmentsNettoyes, debutMorceauMs,
  visitesCreeesSurLAppareil, visitePasEncoreEnvoyee, DELAI_PURGE_MS,
  ESPACEMENT_ECHECS_MS, statutPassager, refusCompte, refusPassager, ecriturePassagere, morceauTranscriptible,
  rienAEnvoyer, morceauxRefuses,
} from '../src/modules/etude/etat-des-lieux/analyse/transcriptionEdlLogique.js'
import { passeTranscriptionEdl } from '../src/modules/etude/etat-des-lieux/analyse/transcriptionEdlPasse.js'
import handler from '../api/transcrire.js'

const DEBUT = Date.UTC(2026, 10, 18, 9, 30, 0)
const morceau = (plus = {}) => ({
  id: 'm-1', rang: 2, debut: DEBUT, duree_s: 180.4, type: 'audio/mp4',
  edlVisiteId: 'v-1', affaireId: 'a-1', enregistrementId: 'e-1', debutEnregistrement: new Date(DEBUT - 180_000).toISOString(),
  ...plus,
})

describe('ligneTranscription', () => {
  test('identifiant du morceau, visite, affaire, début ISO, segments nettoyés', () => {
    const l = ligneTranscription(morceau(), {
      texte: ' Cuisine : carrelage fissuré. ',
      segments: [
        { debut_s: 12.345, fin_s: 15.5, texte: ' Carrelage fissuré. ' },
        { debut_s: 2, fin_s: 4, texte: 'Cuisine.' },
        { debut_s: 6, fin_s: 7, texte: '   ' },
      ],
    })
    assert.equal(l.id, 'm-1')
    assert.equal(l.visite_id, 'v-1')
    assert.equal(l.affaire_id, 'a-1')
    assert.equal(l.debut, new Date(DEBUT).toISOString())
    assert.equal(l.duree_s, 180.4)
    assert.equal(l.texte, 'Cuisine : carrelage fissuré.')
    assert.equal(l.horodate, true)
    assert.deepEqual(l.segments, [
      { debut_s: 2, fin_s: 4, texte: 'Cuisine.' },
      { debut_s: 12.35, fin_s: 15.5, texte: 'Carrelage fissuré.' },
    ])
  })

  test('segments bornés à la durée du morceau', () => {
    const l = ligneTranscription(morceau({ duree_s: 10 }), {
      texte: 'x', segments: [{ debut_s: -1, fin_s: 3, texte: 'a' }, { debut_s: 9, fin_s: 10.6, texte: 'b' }, { debut_s: 12, fin_s: 14, texte: 'c' }],
    })
    assert.deepEqual(l.segments.map((s) => [s.debut_s, s.fin_s]), [[0, 3], [9, 10], [10, 10]])
  })

  test('texte seul (horodatage refusé) : un segment couvre le morceau', () => {
    const l = ligneTranscription(morceau(), { texte: 'Séjour, parquet à poncer.', segments: null })
    assert.equal(l.horodate, false)
    assert.deepEqual(l.segments, [{ debut_s: 0, fin_s: 180.4, texte: 'Séjour, parquet à poncer.' }])
  })

  test('segments vides malgré un texte : traité comme sans horodatage', () => {
    const l = ligneTranscription(morceau(), { texte: 'Entrée.', segments: [] })
    assert.equal(l.horodate, false)
    assert.equal(l.segments.length, 1)
  })

  test('morceau muet : aucun segment, horodatage gardé', () => {
    const l = ligneTranscription(morceau(), { texte: '', segments: [] })
    assert.equal(l.horodate, true)
    assert.deepEqual(l.segments, [])
    assert.equal(l.texte, '')
  })

  test('texte reconstitué depuis les segments s’il manque', () => {
    const l = ligneTranscription(morceau(), { texte: '', segments: [{ start: 1, end: 2, text: 'Un.' }, { start: 3, end: 4, text: 'Deux.' }] })
    assert.equal(l.texte, 'Un. Deux.')
    assert.equal(l.horodate, true)
  })

  test('début : celui du morceau, à défaut celui de l’enregistrement ; sans heure, refus', () => {
    assert.equal(debutMorceauMs(morceau()), DEBUT)
    assert.equal(debutMorceauMs(morceau({ debut: undefined })), DEBUT - 180_000)
    assert.throws(() => ligneTranscription(morceau({ debut: undefined, debutEnregistrement: undefined }), { texte: 'x' }))
  })
})

describe('heureSegment', () => {
  test('début du morceau + décalage de la phrase', () => {
    const ligne = { debut: new Date(DEBUT).toISOString() }
    assert.equal(heureSegment(ligne, { debut_s: 42.5 }), DEBUT + 42_500)
    assert.equal(heureSegment(ligne, {}), DEBUT)
    assert.equal(heureSegment({ debut: 'n’importe quoi' }, { debut_s: 1 }), null)
  })
})

describe('segmentsNettoyes', () => {
  test('liste absente ou durée inconnue', () => {
    assert.deepEqual(segmentsNettoyes(null, 10), [])
    assert.deepEqual(segmentsNettoyes([{ start: 500, end: 501, text: 'a' }], null), [{ debut_s: 500, fin_s: 501, texte: 'a' }])
  })
})

describe('morceauxAPurger', () => {
  const maintenant = DEBUT + DELAI_PURGE_MS + 1
  test('visite absente de la base et morceau de plus de 10 minutes', () => {
    const liste = [
      morceau({ id: 'vieux-orphelin', edlVisiteId: 'disparue' }),
      morceau({ id: 'recent-orphelin', edlVisiteId: 'disparue', debut: maintenant - 60_000 }),
      morceau({ id: 'connu', edlVisiteId: 'v-1' }),
      morceau({ id: 'compte-rendu', edlVisiteId: undefined, crId: 'cr-1' }),
      morceau({ id: 'sans-heure', edlVisiteId: 'disparue', debut: undefined, debutEnregistrement: undefined }),
    ]
    assert.deepEqual(morceauxAPurger(liste, ['v-1'], maintenant).map((m) => m.id), ['vieux-orphelin'])
    assert.deepEqual(morceauxAPurger(liste, new Set(['v-1', 'disparue']), maintenant), [])
  })

  test('une visite encore dans la file de l’appareil compte comme connue', () => {
    const ops = [
      { type: 'visite.creer', charge: { visite: { id: 'v-hors-ligne' } } },
      { type: 'point.poser', charge: { point: { id: 'p-1' } } },
    ]
    const locales = visitesCreeesSurLAppareil(ops)
    assert.deepEqual(locales, ['v-hors-ligne'])
    assert.deepEqual(morceauxAPurger([morceau({ edlVisiteId: 'v-hors-ligne' })], locales, maintenant), [])
  })

  test('23503 : la visite n’est pas encore dans la base', () => {
    assert.equal(visitePasEncoreEnvoyee({ code: '23503' }), true)
    assert.equal(visitePasEncoreEnvoyee({ code: '23505' }), false)
  })
})

// ─── Un passage de transcription, base et appareil simulés ───────────────────

function simule({
  morceaux, enLigne = true, session = true, locales = [], enBase = [], migration = true, preuve = true,
  transcrire = null, enregistrer = null, maintenant = DEBUT + DELAI_PURGE_MS + 60_000,
}) {
  const journal = []
  const appareil = new Map(morceaux.map((m) => [m.id, { ...m }]))
  const d = {
    enLigne: () => enLigne,
    aSession: async () => session,
    lireMorceaux: async () => { journal.push(['lire']); return [...appareil.values()] },
    visitesLocales: async () => { if (locales === 'illisible') throw new Error('illisible'); return locales },
    migrationPassee: async () => { journal.push(['sonde']); return migration },
    visitesDansLaBase: async () => { journal.push(['base']); return new Set(enBase) },
    lecturesProuvees: async (affaireId) => { journal.push(['preuve', affaireId]); return preuve },
    transcrire: async (m) => {
      journal.push(['transcrire', m.id])
      return transcrire ? transcrire(m) : { texte: 'Texte inventé.', segments: [{ debut_s: 0, fin_s: 1, texte: 'Texte inventé.' }] }
    },
    enregistrer: async (ligne) => { journal.push(['enregistrer', ligne.id]); return enregistrer ? enregistrer(ligne) : { indisponible: false } },
    effacer: async (id) => { journal.push(['effacer', id]); appareil.delete(id) },
    marquerEchec: async (m, champs = {}) => { journal.push(['echec', m.id]); appareil.set(m.id, { ...m, ...champs, echecs: (m.echecs ?? 0) + 1 }) },
    signaler: (detail) => journal.push(['signal', detail]),
    maintenant: () => maintenant,
    estCoupure: (err) => err?.code === 'COUPURE',
    echecsMax: 3,
  }
  const actions = (type) => journal.filter((j) => j[0] === type).map((j) => j[1])
  return { d, journal, appareil, actions }
}

describe('passeTranscriptionEdl', () => {
  test('transcrit puis efface, dans l’ordre ; l’effacement suit l’écriture', async () => {
    const s = simule({ morceaux: [morceau({ id: 'a' }), morceau({ id: 'b', rang: 3 })], enBase: ['v-1'] })
    const r = await passeTranscriptionEdl({ edlVisiteId: 'v-1' }, s.d)
    assert.equal(r.erreur, null)
    assert.equal(r.transcrits, 2)
    const ordre = s.journal.filter((j) => ['enregistrer', 'effacer'].includes(j[0])).map((j) => j.join(':'))
    assert.deepEqual(ordre, ['enregistrer:a', 'effacer:a', 'enregistrer:b', 'effacer:b'])
    assert.equal(s.appareil.size, 0)
    assert.equal(s.actions('signal').filter((x) => x.transcrit).length, 2)
  })

  test('visite pas encore dans la base : attente, rien d’envoyé ni compté', async () => {
    const s = simule({
      morceaux: [morceau({ id: 'recent', debut: DEBUT + DELAI_PURGE_MS }), morceau({ id: 'en-file', edlVisiteId: 'v-locale' })],
      locales: ['v-locale'],
    })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur, null)
    assert.deepEqual(s.actions('transcrire'), [])
    assert.deepEqual(s.actions('echec'), [])
    assert.deepEqual(s.actions('effacer'), [])
    assert.equal(s.appareil.size, 2)
  })

  test('23503 : pas d’échec compté, morceaux gardés, la visite attend', async () => {
    const s = simule({
      morceaux: [morceau({ id: 'a' }), morceau({ id: 'b', rang: 3 })],
      enBase: ['v-1'],
      enregistrer: () => { throw Object.assign(new Error('fk'), { code: '23503' }) },
    })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur, null)
    assert.deepEqual(s.actions('echec'), [])
    assert.deepEqual(s.actions('effacer'), [])
    assert.deepEqual(s.actions('transcrire'), ['a'])
    assert.equal(s.appareil.size, 2)
  })

  test('hors ligne : rien de lu, rien d’effacé', async () => {
    const s = simule({ morceaux: [morceau({ edlVisiteId: 'disparue' })], enLigne: false })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur.code, 'reseau')
    assert.deepEqual(s.actions('lire'), [])
    assert.equal(s.appareil.size, 1)
  })

  test('sans session : lectures vides, mais rien d’effacé ni d’envoyé', async () => {
    const s = simule({ morceaux: [morceau({ edlVisiteId: 'disparue' })], session: false })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur.code, 'session')
    assert.deepEqual(s.actions('preuve'), [])
    assert.deepEqual(s.actions('transcrire'), [])
    assert.equal(s.appareil.size, 1)
  })

  test('orphelin : effacé seulement si une lecture de l’affaire rend quelque chose', async () => {
    const sansPreuve = simule({ morceaux: [morceau({ edlVisiteId: 'disparue' })], preuve: false })
    assert.equal((await passeTranscriptionEdl(null, sansPreuve.d)).purges, 0)
    assert.equal(sansPreuve.appareil.size, 1)

    const avecPreuve = simule({ morceaux: [morceau({ edlVisiteId: 'disparue' })], preuve: true })
    const r = await passeTranscriptionEdl(null, avecPreuve.d)
    assert.equal(r.purges, 1)
    assert.deepEqual(avecPreuve.actions('preuve'), ['a-1'])
    assert.deepEqual(avecPreuve.actions('transcrire'), [])
    assert.equal(avecPreuve.appareil.size, 0)
  })

  test('orphelin : file de l’appareil illisible ou morceau récent, rien d’effacé', async () => {
    const illisible = simule({ morceaux: [morceau({ edlVisiteId: 'disparue' })], locales: 'illisible' })
    await passeTranscriptionEdl(null, illisible.d)
    assert.equal(illisible.appareil.size, 1)
    const recent = simule({ morceaux: [morceau({ edlVisiteId: 'disparue' })], maintenant: DEBUT + 60_000 })
    await passeTranscriptionEdl(null, recent.d)
    assert.equal(recent.appareil.size, 1)
  })

  test('écriture refusée : échec compté, morceau gardé ; 082 absente : arrêt sans échec', async () => {
    const refus = simule({ morceaux: [morceau()], enBase: ['v-1'], enregistrer: () => { throw new Error('refus') } })
    await passeTranscriptionEdl(null, refus.d)
    assert.deepEqual(refus.actions('echec'), ['m-1'])
    assert.deepEqual(refus.actions('effacer'), [])

    const absente = simule({ morceaux: [morceau()], enBase: ['v-1'], enregistrer: () => ({ indisponible: true }) })
    const r = await passeTranscriptionEdl(null, absente.d)
    assert.equal(r.erreur.code, 'indisponible')
    assert.deepEqual(absente.actions('echec'), [])
    assert.equal(absente.appareil.size, 1)
  })

  test('082 absente à la sonde : aucun appel à Mistral', async () => {
    const s = simule({ morceaux: [morceau()], enBase: ['v-1'], migration: false })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur.code, 'indisponible')
    assert.deepEqual(s.actions('transcrire'), [])
  })

  test('refus de Mistral compté, la suite continue ; trois refus : le morceau reste, non retenté', async () => {
    const s = simule({
      morceaux: [morceau({ id: 'a' }), morceau({ id: 'b', rang: 3 }), morceau({ id: 'use', rang: 4, echecs: 3 })],
      enBase: ['v-1'],
      transcrire: (m) => { if (m.id === 'a') throw Object.assign(new Error('non'), { code: 'refus' }); return { texte: 'ok', segments: null } },
    })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.transcrits, 1)
    assert.deepEqual(s.actions('echec'), ['a'])
    assert.deepEqual(s.actions('transcrire'), ['a', 'b'])
    assert.ok(s.appareil.has('use'))
  })

  test('coupure pendant l’écriture : arrêt, rien de compté ni d’effacé', async () => {
    const s = simule({ morceaux: [morceau({ id: 'a' }), morceau({ id: 'b', rang: 3 })], enBase: ['v-1'], enregistrer: () => { throw Object.assign(new Error('x'), { code: 'COUPURE' }) } })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur.code, 'reseau')
    assert.deepEqual(s.actions('echec'), [])
    assert.deepEqual(s.actions('transcrire'), ['a'])
    assert.equal(s.appareil.size, 2)
  })
})

// ─── Pannes passagères, refus espacés, passages sans rien à envoyer ──────────

describe('échecs de transcription : panne ou refus', () => {
  const refus = (statut) => Object.assign(new Error('x'), { code: 'refus', statut })
  test('statuts passagers : 408, 429, 5xx', () => {
    for (const s of [408, 429, 500, 502, 503, 504]) assert.equal(statutPassager(s), true, String(s))
    for (const s of [400, 401, 403, 413, 422, NaN]) assert.equal(statutPassager(s), false, String(s))
  })
  test('seul un vrai 4xx compte contre le morceau ; statut inconnu : compté comme avant', () => {
    assert.equal(refusCompte(refus(400)), true)
    assert.equal(refusCompte(refus(413)), true)
    assert.equal(refusCompte(refus(422)), true)
    assert.equal(refusCompte(refus(undefined)), true)
    for (const s of [401, 403, 408, 429, 500, 503]) assert.equal(refusCompte(refus(s)), false, String(s))
    assert.equal(refusCompte(Object.assign(new Error('x'), { code: 'reseau' })), false)
    assert.equal(refusPassager(refus(429)), true)
    assert.equal(refusPassager(refus(503)), true)
    assert.equal(refusPassager(refus(400)), false)
  })
  test('écriture : 5xx et délais de la base passagers, refus de la base non', () => {
    assert.equal(ecriturePassagere({ statut: 503 }), true)
    assert.equal(ecriturePassagere({ code: 'PGRST003' }), true)
    assert.equal(ecriturePassagere({ code: '57014' }), true)
    assert.equal(ecriturePassagere({ code: '08006' }), true)
    assert.equal(ecriturePassagere({ code: '40001' }), true)
    assert.equal(ecriturePassagere({ code: '42501', statut: 403 }), false)
    assert.equal(ecriturePassagere({ code: '23514', statut: 400 }), false)
    assert.equal(ecriturePassagere(new Error('Lecture seule')), false)
  })
  test('morceau refusé : pas renvoyé avant 10 minutes ; trois refus : mis de côté', () => {
    const t = DEBUT + 3_600_000
    assert.equal(ESPACEMENT_ECHECS_MS, 10 * 60 * 1000)
    assert.equal(morceauTranscriptible(morceau(), { maintenant: t }), true)
    assert.equal(morceauTranscriptible(morceau({ echecs: 1, dernierEchec: t - 60_000 }), { maintenant: t }), false)
    assert.equal(morceauTranscriptible(morceau({ echecs: 1, dernierEchec: t - ESPACEMENT_ECHECS_MS }), { maintenant: t }), true)
    // Compté avant que l'espacement existe : renvoyé comme avant
    assert.equal(morceauTranscriptible(morceau({ echecs: 1 }), { maintenant: t }), true)
    assert.equal(morceauTranscriptible(morceau({ echecs: 3 }), { maintenant: t, echecsMax: 3 }), false)
    assert.equal(morceauTranscriptible(morceau({ debut: null, debutEnregistrement: null }), { maintenant: t }), false)
  })
  test('rienAEnvoyer : morceaux mis de côté, en attente ou sans heure', () => {
    const t = DEBUT + 3_600_000
    assert.equal(rienAEnvoyer([morceau({ echecs: 3 }), morceau({ id: 'b', echecs: 1, dernierEchec: t - 1000 })], { maintenant: t }), true)
    assert.equal(rienAEnvoyer([morceau({ debut: null, debutEnregistrement: null })], { maintenant: t }), true)
    assert.equal(rienAEnvoyer([morceau({ echecs: 3 }), morceau({ id: 'b' })], { maintenant: t }), false)
  })
  test('morceauxRefuses : ceux de l’affaire, mis de côté, état des lieux seulement', () => {
    const l = [
      morceau({ id: 'a', echecs: 3 }), morceau({ id: 'b', echecs: 2 }), morceau({ id: 'c', echecs: 3, affaireId: 'a-2' }),
      { id: 'cr', crId: 'cr-1', affaireId: 'a-1', echecs: 3 },
    ]
    assert.deepEqual(morceauxRefuses(l, 'a-1', 3).map((m) => m.id), ['a'])
    assert.deepEqual(morceauxRefuses(l, null, 3), [])
  })
})

describe('passeTranscriptionEdl : pannes et relances bornées', () => {
  const refus = (statut) => () => { throw Object.assign(new Error('x'), { code: 'refus', statut }) }
  test('Mistral saturé (429) ou en panne (5xx) : arrêt, rien de compté, rien d’effacé', async () => {
    for (const statut of [429, 503]) {
      const s = simule({ morceaux: [morceau({ id: 'a' }), morceau({ id: 'b', rang: 3 })], enBase: ['v-1'], transcrire: refus(statut) })
      const r = await passeTranscriptionEdl(null, s.d)
      assert.equal(r.erreur.code, 'passager')
      assert.deepEqual(s.actions('echec'), [])
      assert.deepEqual(s.actions('transcrire'), ['a'])
      assert.equal(s.appareil.size, 2)
    }
  })
  test('vrai refus (400) : compté avec son heure, la suite continue', async () => {
    const maintenant = DEBUT + DELAI_PURGE_MS + 60_000
    const s = simule({ morceaux: [morceau({ id: 'a' }), morceau({ id: 'b', rang: 3 })], enBase: ['v-1'], maintenant, transcrire: (m) => (m.id === 'a' ? refus(400)() : { texte: 'ok', segments: null }) })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.transcrits, 1)
    assert.deepEqual(s.actions('echec'), ['a'])
    assert.equal(s.appareil.get('a').dernierEchec, maintenant)
    assert.equal(s.appareil.get('a').echecs, 1)
  })
  test('base en panne à l’écriture (5xx, délai) : arrêt sans échec compté', async () => {
    for (const err of [{ statut: 503 }, { code: 'PGRST003' }]) {
      const s = simule({ morceaux: [morceau()], enBase: ['v-1'], enregistrer: () => { throw Object.assign(new Error('x'), err) } })
      const r = await passeTranscriptionEdl(null, s.d)
      assert.equal(r.erreur.code, 'passager')
      assert.deepEqual(s.actions('echec'), [])
      assert.equal(s.appareil.size, 1)
    }
  })
  test('refus récent : pas renvoyé ; 10 minutes après : renvoyé', async () => {
    const maintenant = DEBUT + DELAI_PURGE_MS + 60_000
    const recent = simule({ morceaux: [morceau({ echecs: 1, dernierEchec: maintenant - 60_000 })], enBase: ['v-1'], maintenant })
    await passeTranscriptionEdl(null, recent.d)
    assert.deepEqual(recent.actions('transcrire'), [])
    const ancien = simule({ morceaux: [morceau({ echecs: 1, dernierEchec: maintenant - ESPACEMENT_ECHECS_MS })], enBase: ['v-1'], maintenant })
    await passeTranscriptionEdl(null, ancien.d)
    assert.deepEqual(ancien.actions('transcrire'), ['m-1'])
  })
  test('rien d’envoyable ni de purgeable : aucune lecture en ligne', async () => {
    const maintenant = DEBUT + DELAI_PURGE_MS + 60_000
    const s = simule({
      morceaux: [
        morceau({ id: 'use', echecs: 3 }),
        morceau({ id: 'attend', echecs: 1, dernierEchec: maintenant - 1000 }),
        morceau({ id: 'sans-heure', debut: null, debutEnregistrement: null }),
      ],
      enBase: ['v-1'], maintenant,
    })
    const r = await passeTranscriptionEdl(null, s.d)
    assert.equal(r.erreur, null)
    assert.deepEqual(s.journal.filter((j) => ['sonde', 'base', 'preuve', 'transcrire'].includes(j[0])), [])
    assert.equal(s.appareil.size, 3)
  })
})

// ─── api/transcrire.js, fetch simulé ─────────────────────────────────────────

describe('api/transcrire : mode horodaté', () => {
  const env = { ...process.env }
  const fetchOrigine = globalThis.fetch
  let envois
  let reponsesMistral

  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://exemple.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'cle-publique'
    process.env.MISTRAL_API_KEY = 'cle-mistral'
    envois = []
    reponsesMistral = []
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/auth/v1/user')) return new Response('{}', { status: 200 })
      if (String(url).endsWith('/rpc/est_agence')) return new Response('true', { status: 200 })
      if (String(url).includes('api.mistral.ai')) {
        envois.push([...options.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : 'fichier']))
        const r = reponsesMistral.shift() ?? { status: 200, corps: { text: 'Bonjour.' } }
        return new Response(JSON.stringify(r.corps), { status: r.status })
      }
      throw new Error(`appel inattendu : ${url}`)
    }
  })
  afterEach(() => {
    globalThis.fetch = fetchOrigine
    process.env = env
  })

  const appeler = async (entetes = {}) => {
    const req = { method: 'POST', headers: { authorization: 'Bearer jeton', 'x-type-audio': 'audio/mp4', ...entetes }, body: Buffer.from('audio'), query: {} }
    const res = { statut: 0, corps: null, status(s) { this.statut = s; return this }, json(c) { this.corps = c; return this } }
    await handler(req, res)
    return res
  }

  test('sans en-tête : formulaire et réponse des comptes rendus', async () => {
    const res = await appeler({ 'x-vocabulaire': encodeURIComponent(JSON.stringify(['Placo'])) })
    assert.equal(res.statut, 200)
    assert.deepEqual(res.corps, { texte: 'Bonjour.' })
    assert.deepEqual(envois, [[['model', 'voxtral-mini-latest'], ['language', 'fr'], ['file', 'fichier'], ['context_bias', 'Placo']]])
  })

  test('X-Horodatage: segment : sans language, segments rendus', async () => {
    reponsesMistral.push({ status: 200, corps: { text: ' Cuisine. ', segments: [{ start: 1.5, end: 3, text: ' Cuisine. ' }] } })
    const res = await appeler({ 'x-horodatage': 'segment' })
    assert.equal(res.statut, 200)
    assert.deepEqual(res.corps, { texte: 'Cuisine.', segments: [{ debut_s: 1.5, fin_s: 3, texte: 'Cuisine.' }] })
    assert.deepEqual(envois, [[['model', 'voxtral-mini-latest'], ['timestamp_granularities', 'segment'], ['file', 'fichier']]])
  })

  test('horodatage refusé : texte seul, en français', async () => {
    reponsesMistral.push({ status: 422, corps: { detail: 'non' } }, { status: 200, corps: { text: 'Texte seul.' } })
    const res = await appeler({ 'x-horodatage': 'segment' })
    assert.deepEqual(res.corps, { texte: 'Texte seul.', segments: null })
    assert.deepEqual(envois.map((e) => e[1]), [['timestamp_granularities', 'segment'], ['language', 'fr']])
  })

  test('segments sans heures lisibles écartés', async () => {
    reponsesMistral.push({ status: 200, corps: { text: 'a b', segments: [{ start: 0, end: 1, text: 'a' }, { start: null, end: 'x', text: 'b' }] } })
    const res = await appeler({ 'x-horodatage': 'segment' })
    assert.deepEqual(res.corps.segments, [{ debut_s: 0, fin_s: 1, texte: 'a' }])
  })

  test('panne de Mistral (5xx) : pas de repli, erreur rendue', async () => {
    reponsesMistral.push({ status: 503, corps: { detail: 'indisponible' } })
    const res = await appeler({ 'x-horodatage': 'segment' })
    assert.equal(res.statut, 502)
    assert.equal(envois.length, 1)
  })
})
