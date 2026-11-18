// ─── Envoi de la file de la visite, depuis toute l'app ───────────────────────
//
// Un seul envoi à la fois (verrou du navigateur, à défaut une chaîne de
// promesses), la file relue sous le verrou : rien ne part deux fois. Après
// chaque envoi réussi, l'opération est reportée dans l'instantané avant
// d'être retirée de la file : l'écran (instantané + file) la garde. La
// préparation de l'instantané passe sous le même verrou : une lecture faite
// pendant un envoi ne peut pas effacer de l'écran ce qui vient de partir.

import { MAGASINS_EDL, lire, ecrire, effacer, tout, operationsDeLAffaire, disponible, oublierAffaire } from './baseEdl'
import { aEnvoyer, ESSAIS_MAX, appliquerOperationEdl, photosDesOperations, fermePassage } from './fileEdlLogique'
import { envoyerOperationEdl } from './envoiEdl'
import { erreurReseau } from '../../../chantier/comptes-rendus/horsLigne/envoi'
import { effacerAudioEtatDesLieux } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'

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
    let fermetures = 0
    let coupure = false
    const ops = aEnvoyer(await operationsDeLAffaire(affaireId).catch(() => []))
    for (const op of ops) {
      try {
        await envoyerOperationEdl(op)
        await reporterDansInstantane(affaireId, op)
        await effacer(MAGASINS_EDL.operations, op.id)
        envoyees++
        if (fermePassage(op)) fermetures++
      } catch (err) {
        if (erreurReseau(err)) { coupure = true; break }
        const essais = (op.essais ?? 0) + 1
        await ecrire(MAGASINS_EDL.operations, { ...op, essais, erreur: err?.message ?? String(err) })
        if (essais < ESSAIS_MAX) break // la suite dépend peut-être de celle-ci
      }
    }
    if (ops.length > 0) signalerFileEdl()
    return { envoyees, coupure, fermetures }
  })
}

/**
 * Toutes les affaires qui ont des gestes en attente (moteur de synchro de
 * l'app), puis l'audio des visites : après les gestes, pour qu'une visite
 * créée hors ligne soit dans la base avant ses morceaux. Enfin l'analyse,
 * pour les seules affaires dont une sortie ou une fin de visite vient de
 * partir, dont un morceau vient d'être transcrit, ou dont une relance est
 * due : appelé toutes les minutes, il ne doit rien lire d'autre.
 */
export async function envoyerToutEdl() {
  if (!disponible()) return { envoyees: 0 }
  const ops = aEnvoyer(await tout(MAGASINS_EDL.operations).catch(() => []))
  let envoyees = 0
  let coupure = false
  const affairesEnvoyees = []
  for (const affaireId of [...new Set(ops.map((o) => o.affaireId))]) {
    const r = await envoyerFileEdl(affaireId)
    envoyees += r.envoyees
    // Une sortie ou une fin partie : une pièce est peut-être prête
    if (r.fermetures > 0) affairesEnvoyees.push(affaireId)
    if (r.coupure) { coupure = true; break }
  }
  if (!coupure) lancerTranscriptions(affairesEnvoyees)
  return { envoyees }
}

// Sans attendre : une transcription dure (un appel Mistral par morceau), une
// analyse aussi, et ni l'une ni l'autre ne doit retenir le compte rendu de
// l'envoi des gestes. Chargé à la demande, comme ce module.
function lancerTranscriptions(affaires) {
  import('../analyse/analyseEdl')
    .then((m) => m.transcrireEtAnalyserTout({ affaires }))
    .catch((err) => console.warn('Transcription et analyse des visites d’état des lieux :', err))
}

/**
 * Après « Remplacer les plans » : l'appareil oublie l'état des lieux de
 * l'affaire (instantané, gestes en attente et leurs photos, et le son pas
 * encore transcrit de ses visites). Sous le verrou de l'envoi, pour qu'aucun
 * de ces gestes ne parte pendant l'effacement. Appelé seulement après la
 * suppression réussie en base : ce geste explicite de l'utilisateur vaut
 * preuve, là où la purge automatique du son exige une lecture en ligne qui
 * peut ne jamais venir (le son restait alors sur l'appareil sans fin).
 */
export function oublierEdlLocal(affaireId) {
  return sousVerrouEdl(async () => {
    const ops = await operationsDeLAffaire(affaireId)
    await oublierAffaire(affaireId, photosDesOperations(ops))
    // Le son d'abord sous ce verrou, puis le signal : un écran qui recompte
    // ne le voit plus. Une base `jga-audio` illisible n'empêche pas le reste.
    await effacerAudioEtatDesLieux(affaireId).catch((err) => console.warn('Son de l’état des lieux :', err))
  }).finally(signalerFileEdl)
}
