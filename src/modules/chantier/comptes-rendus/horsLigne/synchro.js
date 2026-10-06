// ─── Envoi des modifications faites sans réseau, depuis toute l'app ─────────
//
// Les modifications d'une visite faites sans réseau attendent sur l'appareil.
// Elles ne partaient que lorsque la visite était rouverte ; une visite fermée
// sur le chantier et oubliée gardait ses remarques sur la tablette. Désormais
// la file entière part au retour du réseau et à l'ouverture de l'app, quelle
// que soit la page (`MoteurSynchro`, dans AppShell).
//
// Un seul envoi à la fois, même entre la page et l'aperçu de préparation
// (cadre caché) : verrou du navigateur (Web Locks), à défaut une chaîne de
// promesses. Chaque envoi relit la file sous le verrou : une opération déjà
// partie n'est pas renvoyée.

import { MAGASINS, ecrire, effacer, lire, tout, operationsDuCr, disponible } from './baseLocale'
import { aEnvoyer, ESSAIS_MAX, TYPES, etatAvecFile, creerOperation } from './fileLogique'
import { envoyerOperation, erreurReseau } from './envoi'

export const EVENEMENT_FILE = 'jga-file-hors-ligne'

/** Prévient les écrans que la file a changé (ajout, envoi, abandon). */
export function signalerFile() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_FILE))
}

// Envoi en cours dans cette fenêtre (le témoin l'affiche)
let actifs = 0
export function envoiEnCours() { return actifs > 0 }

let chaine = Promise.resolve()
function avecVerrou(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('jga-envoi-file', action)
  }
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

/**
 * Envoie la file d'une visite, dans l'ordre. Une coupure arrête l'envoi sans
 * compter d'échec ; un refus de la base est compté, et l'opération mise de
 * côté après trois tentatives.
 * @returns { envoyees, coupure } — `coupure` : le réseau est reparti
 */
export function envoyerFileDuCr(crId) {
  return avecVerrou(async () => {
    let envoyees = 0
    let coupure = false
    const ops = aEnvoyer(await operationsDuCr(crId).catch(() => []))
    for (const op of ops) {
      try {
        await envoyerOperation(op)
        await effacer(MAGASINS.operations, op.id)
        envoyees++
      } catch (err) {
        if (erreurReseau(err)) { coupure = true; break }
        const essais = (op.essais ?? 0) + 1
        await ecrire(MAGASINS.operations, { ...op, essais, erreur: err?.message ?? String(err) })
        if (essais < ESSAIS_MAX) break // la suite dépend peut-être de celle-ci
      }
    }
    if (envoyees > 0 || ops.length > 0) signalerFile()
    return { envoyees, coupure }
  })
}

/** Toutes les opérations gardées sur l'appareil */
export async function toutesOperations() {
  if (!disponible()) return []
  return tout(MAGASINS.operations).catch(() => [])
}

/** Les visites emportées (pour retrouver l'affaire et le numéro d'une file) */
export async function visitesEmportees() {
  if (!disponible()) return []
  return tout(MAGASINS.visites).catch(() => [])
}

/** Envoie la file de chaque visite, la plus ancienne d'abord. */
export async function envoyerTout() {
  const ops = aEnvoyer(await toutesOperations())
  if (ops.length === 0) return { envoyees: 0 }
  const visites = [...new Set(ops.map((o) => o.crId))]
  let envoyees = 0
  actifs++
  signalerFile()
  try {
    for (const crId of visites) {
      const r = await envoyerFileDuCr(crId)
      envoyees += r.envoyees
      if (r.coupure) break
    }
  } finally {
    actifs--
    signalerFile()
  }
  return { envoyees }
}

// ─── Visites démarrées sans réseau ───────────────────────────────────────────

/** Les visites d'une affaire créées sur l'appareil, pas encore envoyées */
export async function visitesEnAttente(affaireId) {
  const ops = await toutesOperations()
  return ops
    .filter((o) => o.type === TYPES.crCreer && o.charge?.cr?.affaire_id === affaireId)
    .map((o) => ({ ...o.charge.cr, horsLigne: true, pointsEnCours: 0 }))
}

/** Une visite emportée, avec ses modifications en attente ; null si absente */
export async function etatVisiteEmportee(crId) {
  if (!disponible()) return null
  const gardee = await lire(MAGASINS.visites, crId).catch(() => null)
  if (!gardee?.donnees) return null
  return etatAvecFile(gardee.donnees, await operationsDuCr(crId).catch(() => []))
}

/** Range la visite créée sur l'appareil : son instantané, puis sa création en file */
export async function garderVisiteCreee({ cr, reprise, instantane }) {
  await ecrire(MAGASINS.visites, { crId: cr.id, donnees: instantane, prepareLe: Date.now() })
  await ecrire(MAGASINS.operations, creerOperation(TYPES.crCreer, { cr, reprise }, { crId: cr.id }))
  signalerFile()
}
