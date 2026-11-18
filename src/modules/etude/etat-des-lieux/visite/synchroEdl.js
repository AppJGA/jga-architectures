// ─── Envoi de la file de la visite, depuis toute l'app ───────────────────────
//
// Un seul envoi à la fois (verrou du navigateur, à défaut une chaîne de
// promesses), la file relue sous le verrou : rien ne part deux fois. Après
// chaque envoi réussi, l'opération est reportée dans l'instantané avant
// d'être retirée de la file : l'écran (instantané + file) la garde. La
// préparation de l'instantané passe sous le même verrou : une lecture faite
// pendant un envoi ne peut pas effacer de l'écran ce qui vient de partir.

import { MAGASINS_EDL, lire, ecrire, effacer, tout, operationsDeLAffaire, disponible, oublierAffaire } from './baseEdl'
import { aEnvoyer, ESSAIS_MAX, appliquerOperationEdl, photosDesOperations } from './fileEdlLogique'
import { envoyerOperationEdl } from './envoiEdl'
import { erreurReseau } from '../../../chantier/comptes-rendus/horsLigne/envoi'

export const EVENEMENT_FILE_EDL = 'jga-file-edl'

export function signalerFileEdl() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_FILE_EDL))
}

let chaine = Promise.resolve()
export function sousVerrouEdl(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('jga-envoi-edl', action)
  }
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

async function reporterDansInstantane(affaireId, op) {
  const garde = await lire(MAGASINS_EDL.instantanes, affaireId).catch(() => null)
  if (garde?.donnees) await ecrire(MAGASINS_EDL.instantanes, { ...garde, donnees: appliquerOperationEdl(garde.donnees, op) })
}

/**
 * Envoie la file d'une affaire, dans l'ordre. Une coupure arrête l'envoi sans
 * compter d'échec ; un refus de la base est compté, et l'opération mise de
 * côté après trois tentatives (elle reste appliquée à l'écran).
 */
export function envoyerFileEdl(affaireId) {
  return sousVerrouEdl(async () => {
    let envoyees = 0
    let coupure = false
    const ops = aEnvoyer(await operationsDeLAffaire(affaireId).catch(() => []))
    for (const op of ops) {
      try {
        await envoyerOperationEdl(op)
        await reporterDansInstantane(affaireId, op)
        await effacer(MAGASINS_EDL.operations, op.id)
        envoyees++
      } catch (err) {
        if (erreurReseau(err)) { coupure = true; break }
        const essais = (op.essais ?? 0) + 1
        await ecrire(MAGASINS_EDL.operations, { ...op, essais, erreur: err?.message ?? String(err) })
        if (essais < ESSAIS_MAX) break // la suite dépend peut-être de celle-ci
      }
    }
    if (ops.length > 0) signalerFileEdl()
    return { envoyees, coupure }
  })
}

/**
 * Toutes les affaires qui ont des gestes en attente (moteur de synchro de
 * l'app), puis l'audio des visites : après les gestes, pour qu'une visite
 * créée hors ligne soit dans la base avant ses morceaux.
 */
export async function envoyerToutEdl() {
  if (!disponible()) return { envoyees: 0 }
  const ops = aEnvoyer(await tout(MAGASINS_EDL.operations).catch(() => []))
  let envoyees = 0
  let coupure = false
  for (const affaireId of [...new Set(ops.map((o) => o.affaireId))]) {
    const r = await envoyerFileEdl(affaireId)
    envoyees += r.envoyees
    if (r.coupure) { coupure = true; break }
  }
  if (!coupure) lancerTranscriptions()
  return { envoyees }
}

// Sans attendre : une transcription dure (un appel Mistral par morceau) et ne
// doit pas retenir le compte rendu de l'envoi des gestes. Chargé à la demande,
// comme ce module.
function lancerTranscriptions() {
  import('../analyse/transcriptionEdl')
    .then((m) => m.transcrireEdlEnAttente(null))
    .catch((err) => console.warn('Transcription des visites d’état des lieux :', err))
}

/**
 * Après « Remplacer les plans » : l'appareil oublie l'état des lieux de
 * l'affaire (instantané, gestes en attente et leurs photos). Sous le verrou
 * de l'envoi, pour qu'aucun de ces gestes ne parte pendant l'effacement.
 */
export function oublierEdlLocal(affaireId) {
  return sousVerrouEdl(async () => {
    const ops = await operationsDeLAffaire(affaireId)
    await oublierAffaire(affaireId, photosDesOperations(ops))
  }).finally(signalerFileEdl)
}
