// ─── Transcription des morceaux d'une visite d'état des lieux (navigateur) ───
//
// Les morceaux rangés sur l'appareil (base `jga-audio`, marqués `edlVisiteId`)
// partent un à un, dans l'ordre, à `api/transcrire` en mode horodaté ; la
// ligne `edl_enregistrements` est écrite, puis le son effacé de l'appareil
// (il n'est jamais gardé en ligne).
//
// Chaque appel à Mistral se paie : avant d'envoyer quoi que ce soit, on
// vérifie que la migration 082 est passée et que la visite est déjà dans la
// base. Une visite créée hors ligne arrive par la file des gestes : ses
// morceaux attendent sans qu'aucun échec soit compté.
//
// Un seul passage à la fois, même entre fenêtres (verrou du navigateur) : un
// morceau ne part jamais deux fois. L'enchaînement est dans
// transcriptionEdlPasse.js (testé) ; ici, seulement ce qu'il lit et écrit.

import { supabase } from '../../../../core/supabase/client'
import { appelerTranscription, ErreurTranscription, ECHECS_MAX, messageTranscription } from '../../../chantier/comptes-rendus/enregistrement/transcription'
import { morceauxEnAttente, morceauxEtatsDesLieux, effacerMorceau, marquerEchec } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { erreurReseau } from '../../../chantier/comptes-rendus/horsLigne/envoi'
import { bornerDelai, delaiDepasse } from '../visite/visiteLogique'
import { MAGASINS_EDL, tout, disponible } from '../visite/baseEdl'
import { enregistrerTranscription, analyseIndisponible, MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonnees'
import { visitesCreeesSurLAppareil } from './transcriptionEdlLogique'
import { passeTranscriptionEdl } from './transcriptionEdlPasse'

export const EVENEMENT_TRANSCRIPTION_EDL = 'jga-transcription-edl'

function signaler(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENEMENT_TRANSCRIPTION_EDL, { detail }))
}

export function messageTranscriptionEdl(err) {
  return err?.code === 'indisponible' ? MESSAGE_ANALYSE_INDISPONIBLE : messageTranscription(err)
}

const horsLigne = () => typeof navigator !== 'undefined' && navigator.onLine === false
const coupure = (err) => erreurReseau(err) || delaiDepasse(err)

let chaine = Promise.resolve()
function sousVerrou(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('jga-transcription-edl', action)
  }
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

// Lectures fraîches (`synchro_id`, hors mémoire du service worker) : elles
// décident d'un envoi payant et d'un effacement
async function visitesDansLaBase(ids) {
  const { data, error } = await bornerDelai(
    (signal) => supabase.from('edl_visites').select('synchro_id:id').in('id', ids).abortSignal(signal),
  )
  if (error) throw error
  return new Set((data ?? []).map((l) => l.synchro_id))
}

// Une table absente se dit par une erreur (42P01 / PGRST205) : les règles RLS
// filtrent des lignes, jamais une table. Une réponse vide sans erreur prouve
// donc que la 082 est passée — la session, elle, est vérifiée avant (sans
// elle, tout se lirait vide). Toute autre erreur remonte : ni « passée », ni
// « manquante ».
async function migrationPassee() {
  const { error } = await bornerDelai(
    (signal) => supabase.from('edl_enregistrements').select('synchro_id:id').limit(1).abortSignal(signal),
  )
  if (!error) return true
  if (analyseIndisponible(error)) return false
  throw error
}

async function aSession() {
  const { data } = await supabase.auth.getSession()
  return Boolean(data?.session?.access_token)
}

// Avant de croire une visite disparue : une lecture de la même affaire doit
// rendre quelque chose (une visite, ou son état des lieux). Une liste vide
// partout peut n'être qu'un refus silencieux des règles RLS.
async function lecturesProuvees(affaireId) {
  for (const table of ['edl_visites', 'edl_etats']) {
    const { data, error } = await bornerDelai(
      (signal) => supabase.from(table).select('synchro_id:id').eq('affaire_id', affaireId).limit(1).abortSignal(signal),
    )
    if (error) throw error
    if (data?.length) return true
  }
  return false
}

const dependances = (vocabulaire) => ({
  enLigne: () => !horsLigne(),
  aSession,
  lireMorceaux: (visite) => (visite ? morceauxEnAttente(visite) : morceauxEtatsDesLieux()),
  visitesLocales: async () => (disponible() ? visitesCreeesSurLAppareil(await tout(MAGASINS_EDL.operations)) : []),
  migrationPassee,
  visitesDansLaBase,
  lecturesProuvees,
  transcrire: (m) => appelerTranscription({ corps: m.blob, type: m.type, vocabulaire, horodatage: true }),
  enregistrer: enregistrerTranscription,
  effacer: effacerMorceau,
  marquerEchec,
  signaler,
  maintenant: () => Date.now(),
  estCoupure: coupure,
  erreur: (code, message) => new ErreurTranscription(code, message),
  messageIndisponible: MESSAGE_ANALYSE_INDISPONIBLE,
  echecsMax: ECHECS_MAX,
})

// Un passage qui attend déjà le verrou couvre les demandes suivantes pour la
// même visite : inutile d'en empiler un par morceau ou par minute
const enFile = new Map()

/**
 * Transcrit les morceaux d'une visite (`{ edlVisiteId }`), ou de toutes les
 * visites d'état des lieux (`null`). S'arrête au premier problème de réseau,
 * de session ou de configuration ; un morceau refusé est compté et la suite
 * continue.
 * @returns { transcrits, purges, erreur }
 */
export function transcrireEdlEnAttente(visite = null, { vocabulaire = [] } = {}) {
  const cle = visite?.edlVisiteId ?? '*'
  if (enFile.has(cle)) return enFile.get(cle)
  const travail = sousVerrou(() => {
    enFile.delete(cle)
    return passeTranscriptionEdl(visite?.edlVisiteId ? { edlVisiteId: visite.edlVisiteId } : null, dependances(vocabulaire))
  })
  enFile.set(cle, travail)
  // Un verrou qui échoue avant de lancer le passage ne doit pas bloquer les suivants
  travail.catch(() => {}).finally(() => { if (enFile.get(cle) === travail) enFile.delete(cle) })
  return travail
}
