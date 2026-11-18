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
// morceau ne part jamais deux fois.

import { supabase } from '../../../../core/supabase/client'
import { appelerTranscription, ErreurTranscription, ECHECS_MAX, messageTranscription } from '../../../chantier/comptes-rendus/enregistrement/transcription'
import { morceauxEnAttente, morceauxEtatsDesLieux, effacerMorceau, marquerEchec } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { erreurReseau } from '../../../chantier/comptes-rendus/horsLigne/envoi'
import { bornerDelai, delaiDepasse } from '../visite/visiteLogique'
import { MAGASINS_EDL, tout, disponible } from '../visite/baseEdl'
import { enregistrerTranscription, analyseIndisponible, MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonnees'
import {
  ligneTranscription, morceauxAPurger, visitesCreeesSurLAppareil, visitePasEncoreEnvoyee, debutMorceauMs,
} from './transcriptionEdlLogique'

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

async function migrationPassee() {
  const { error } = await bornerDelai(
    (signal) => supabase.from('edl_enregistrements').select('synchro_id:id').limit(1).abortSignal(signal),
  )
  if (!error) return true
  if (analyseIndisponible(error)) return false
  throw error
}

async function passe(visite, vocabulaire) {
  let transcrits = 0
  let purges = 0
  const fin = (erreur = null) => ({ transcrits, purges, erreur })
  // Hors ligne, on ne lit rien et surtout on n'efface rien
  if (horsLigne()) return fin(new ErreurTranscription('reseau', 'hors ligne'))

  const morceaux = (visite ? await morceauxEnAttente(visite) : await morceauxEtatsDesLieux())
    .filter((m) => m.edlVisiteId != null)
  if (!morceaux.length) return fin()

  // La file de l'appareil d'abord, la base ensuite : une visite qui quitte la
  // file entre les deux lectures est déjà dans la base, elle est vue d'un côté
  // ou de l'autre. Dans l'ordre inverse, elle pouvait échapper aux deux et ses
  // morceaux être effacés.
  let locales
  try { locales = disponible() ? visitesCreeesSurLAppareil(await tout(MAGASINS_EDL.operations)) : [] } catch { locales = null }

  let enBase
  try {
    const [passee, ids] = await Promise.all([migrationPassee(), visitesDansLaBase([...new Set(morceaux.map((m) => m.edlVisiteId))])])
    if (!passee) return fin(new ErreurTranscription('indisponible', MESSAGE_ANALYSE_INDISPONIBLE))
    enBase = ids
  } catch (err) {
    return fin(coupure(err) ? new ErreurTranscription('reseau', err?.message ?? 'réseau') : err)
  }

  // File de l'appareil illisible : dans le doute, rien n'est effacé
  if (locales !== null) {
    for (const m of morceauxAPurger(morceaux, new Set([...enBase, ...locales]), Date.now())) {
      await effacerMorceau(m.id)
      purges += 1
      signaler({ morceauId: m.id, visiteId: m.edlVisiteId, purge: true })
    }
  }

  const pasEncore = new Set()
  for (const m of morceaux) {
    if (!enBase.has(m.edlVisiteId) || pasEncore.has(m.edlVisiteId)) continue
    if ((m.echecs ?? 0) >= ECHECS_MAX) continue
    // Sans heure, le morceau ne se placerait dans aucune pièce : il reste
    if (debutMorceauMs(m) == null) continue
    let ligne
    try {
      const reponse = await appelerTranscription({ corps: m.blob, type: m.type, vocabulaire, horodatage: true })
      ligne = ligneTranscription(m, reponse)
    } catch (err) {
      if (err instanceof ErreurTranscription && err.code === 'refus') {
        await marquerEchec(m)
        signaler({ morceauId: m.id, visiteId: m.edlVisiteId, refus: true })
        continue
      }
      return fin(err)
    }
    try {
      const ecrit = await enregistrerTranscription(ligne)
      if (ecrit?.indisponible) return fin(new ErreurTranscription('indisponible', MESSAGE_ANALYSE_INDISPONIBLE))
    } catch (err) {
      // Visite supprimée ou pas encore arrivée depuis la lecture : on attend
      if (visitePasEncoreEnvoyee(err)) { pasEncore.add(m.edlVisiteId); continue }
      if (coupure(err)) return fin(new ErreurTranscription('reseau', err?.message ?? 'réseau'))
      await marquerEchec(m)
      signaler({ morceauId: m.id, visiteId: m.edlVisiteId, refus: true })
      continue
    }
    await effacerMorceau(m.id)
    transcrits += 1
    signaler({ morceauId: m.id, visiteId: m.edlVisiteId, transcrit: true })
  }
  return fin()
}

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
    return passe(visite?.edlVisiteId ? { edlVisiteId: visite.edlVisiteId } : null, vocabulaire)
  })
  enFile.set(cle, travail)
  // Un verrou qui échoue avant de lancer le passage ne doit pas bloquer les suivants
  travail.catch(() => {}).finally(() => { if (enFile.get(cle) === travail) enFile.delete(cle) })
  return travail
}
