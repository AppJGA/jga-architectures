// ─── Analyse des pièces par Claude, depuis le navigateur ─────────────────────
//
// Une pièce part chez Claude quand ses passages sont finis et que tout ce qui
// y a été dit est transcrit (analyseEdlLogique.js décide, analyseEdlPasse.js
// enchaîne). Un seul passage à la fois, même entre onglets (verrou du
// navigateur `jga-analyse-edl`), une pièce à la fois. Silencieux hors ligne
// ou sans la migration 082.
//
// Déclencheurs, et eux seuls (chaque appel se paie) : sortie d'une pièce et
// fin de la visite (après l'envoi des gestes et la transcription), morceau
// transcrit pendant la visite, ouverture du module ou de la visite avec du
// réseau, et le moteur de synchro de l'app (envoyerToutEdl) pour les seules
// affaires dont une sortie ou une fin de visite vient de partir, dont un
// morceau vient d'être transcrit, ou dont une relance est due. Jamais au
// rendu.
//
// Sur l'appareil (localStorage, à défaut en mémoire) : le suivi des essais
// par pièce (attente après échec) et la relance prévue par affaire.

import { supabase } from '../../../../core/supabase/client'
import { erreurReseau } from '../../../chantier/comptes-rendus/horsLigne/envoi'
import { morceauxEtatsDesLieux, tranchesEtatsDesLieux } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { ECHECS_MAX } from '../../../chantier/comptes-rendus/enregistrement/transcription'
import { delaiDepasse } from '../visite/visiteLogique'
import { disponible, operationsDeLAffaire } from '../visite/baseEdl'
import { aEnvoyer } from '../visite/fileEdlLogique'
import { envoyerFileEdl } from '../visite/synchroEdl'
import { aire } from '../geometrieEdl'
import { appelerClaude } from '../piecesIa'
import {
  lireSuiviAnalyse, lireFriseAnalyse, reserverAnalyse, relirePieceAnalyse, ecrireResultatAnalyse, noterErreurAnalyse,
} from './analyseDonnees'
import { transcrireEdlEnAttente } from './transcriptionEdl'
import { passeAnalyseEdl } from './analyseEdlPasse'

export const EVENEMENT_ANALYSE_EDL = 'jga-analyse-edl'
const CLE_SUIVIS = 'jga.analyse-edl.suivis'
const CLE_RELANCES = 'jga.analyse-edl.relances'

const horsLigne = () => typeof navigator !== 'undefined' && navigator.onLine === false
const coupure = (err) => erreurReseau(err) || delaiDepasse(err)

function signaler(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENEMENT_ANALYSE_EDL, { detail }))
}

// ─── Mémoire de l'appareil ──────────────────────────────────────────────────
// Navigation privée ou stockage refusé : la copie en mémoire suffit à
// empêcher une boucle pendant la séance. Après une écriture ratée (quota),
// localStorage garde une valeur périmée : la mémoire fait alors foi pour
// cette clé. Sinon localStorage est relu, pour voir les essais d'un autre
// onglet (le verrou est commun aux onglets, la mémoire non).

const memoire = new Map()
const ecritureRatee = new Set()
function lireCle(cle) {
  if (memoire.has(cle) && ecritureRatee.has(cle)) return memoire.get(cle)
  try {
    const brut = localStorage.getItem(cle)
    return brut != null ? (JSON.parse(brut) ?? {}) : {}
  } catch {
    return memoire.get(cle) ?? {}
  }
}
function ecrireCle(cle, valeur) {
  memoire.set(cle, valeur)
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
    ecritureRatee.delete(cle)
  } catch {
    ecritureRatee.add(cle)
  }
}
function modifierCle(cle, id, valeur) {
  const tout = { ...lireCle(cle) }
  if (valeur == null) delete tout[id]
  else tout[id] = valeur
  ecrireCle(cle, tout)
}

/** Affaires dont une relance (attente après échec, abandon) est due. */
export function relancesDues(maintenant = Date.now()) {
  return Object.entries(lireCle(CLE_RELANCES)).filter(([, t]) => Number.isFinite(t) && t <= maintenant).map(([a]) => a)
}

// ─── Branchement du passage ─────────────────────────────────────────────────

async function aSession() {
  const { data } = await supabase.auth.getSession()
  return Boolean(data?.session?.access_token)
}

async function gestesEnAttente(affaireId) {
  if (!disponible()) return []
  return aEnvoyer(await operationsDeLAffaire(affaireId))
}

// Les tranches d'abord : un morceau tout juste coupé est rangé AVANT que ses
// tranches soient effacées. Lues dans cet ordre, il est vu d'un côté ou de
// l'autre ; dans l'ordre inverse, il pouvait échapper aux deux.
async function audioLocal() {
  const tranches = await tranchesEtatsDesLieux()
  const morceaux = await morceauxEtatsDesLieux()
  return { morceaux, tranches }
}

const dependances = () => ({
  enLigne: () => !horsLigne(),
  aSession,
  lireSuivi: (affaireId) => lireSuiviAnalyse(affaireId),
  lireFrise: (affaireId, pieceId) => lireFriseAnalyse(affaireId, pieceId),
  audioLocal,
  gestesEnAttente,
  reserver: reserverAnalyse,
  relirePiece: relirePieceAnalyse,
  appeler: (corps) => appelerClaude('/api/analyser-edl', corps),
  ecrire: ecrireResultatAnalyse,
  noterErreur: noterErreurAnalyse,
  lireSuivis: () => lireCle(CLE_SUIVIS),
  ecrireSuivi: (pieceId, suivi) => modifierCle(CLE_SUIVIS, pieceId, suivi),
  noterRelance: (affaireId, t) => modifierCle(CLE_RELANCES, affaireId, t),
  signaler,
  maintenant: () => Date.now(),
  estCoupure: coupure,
  surfaceDessinee: (piece) => (Array.isArray(piece?.contour) && piece.contour.length >= 3 ? aire(piece.contour) : null),
  echecsMax: ECHECS_MAX,
})

let chaine = Promise.resolve()
function sousVerrou(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('jga-analyse-edl', action)
  }
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

// Un passage qui attend déjà le verrou couvre les demandes suivantes pour la
// même affaire : sortie de pièce, morceau transcrit et moteur de synchro
// arrivent souvent ensemble
const enFile = new Map()

/** Analyse les pièces de l'affaire qui l'attendent, une à une. */
export function analyserEnAttente(affaireId) {
  if (!affaireId) return Promise.resolve({ analysees: 0, echecs: 0, raison: 'rien' })
  if (enFile.has(affaireId)) return enFile.get(affaireId)
  const travail = sousVerrou(() => {
    enFile.delete(affaireId)
    return passeAnalyseEdl(affaireId, {}, dependances())
  })
  enFile.set(affaireId, travail)
  travail.catch(() => {}).finally(() => { if (enFile.get(affaireId) === travail) enFile.delete(affaireId) })
  return travail
}

/**
 * Une pièce seule, si elle attend. `forcer` (« Réessayer ») passe outre
 * l'attente et l'échec définitif ; `relancer` réanalyse une pièce déjà faite.
 * Rend `{ analysees, echecs, raison }`. Rien de parti (`analysees` et
 * `echecs` à 0) : `raison` dit pourquoi — 'son', 'passage', 'gestes',
 * 'echec-definitif', 'deja-fait', 'non-visitee', 'fiche-modifiee',
 * 'conflit', 'conflit-elements', ou un arrêt ('hors-ligne', 'refus'…).
 * Messages : `messageLancement` (relectureAnalyseLogique.js).
 */
export function analyserPiece(affaireId, pieceId, { forcer = false, relancer = false } = {}) {
  return sousVerrou(() => passeAnalyseEdl(affaireId, { seulement: pieceId, forcer, relancer }, dependances()))
}

const avertir = (err) => { console.warn('Analyse de l’état des lieux :', err) }

/** Transcription des morceaux (d'une visite, ou de toutes), puis analyse de l'affaire. */
export function transcrireEtAnalyser(affaireId, { edlVisiteId = null } = {}) {
  if (horsLigne() || !affaireId) return Promise.resolve(null)
  return transcrireEdlEnAttente(edlVisiteId ? { edlVisiteId } : null)
    .catch(avertir)
    .then(() => analyserEnAttente(affaireId))
    .catch(avertir)
}

/**
 * Sortie d'une pièce (ou fin de la visite) : les gestes partent d'abord — la
 * sortie notée ferme le passage dans la base —, puis le son, puis l'analyse.
 */
export function apresSortieDePiece(affaireId, edlVisiteId) {
  if (horsLigne() || !affaireId) return Promise.resolve(null)
  return envoyerFileEdl(affaireId)
    .catch(avertir)
    .then(() => transcrireEtAnalyser(affaireId, { edlVisiteId }))
}

/**
 * Moteur de synchro de l'app : transcription de toutes les visites, puis
 * analyse des seules affaires qui ont bougé — sortie ou fin de visite
 * envoyée (`affaires`), morceaux partis de l'appareil, relance due. Toutes
 * les minutes, rien d'autre ne se lit.
 */
export async function transcrireEtAnalyserTout({ affaires = [] } = {}) {
  if (horsLigne()) return
  const avant = await morceauxEtatsDesLieux().catch(() => [])
  await transcrireEdlEnAttente(null).catch(avertir)
  // Un morceau parti (transcrit, par ce passage ou par celui d'un autre
  // déclencheur) : son affaire a peut-être une pièce prête
  const restants = new Set((await morceauxEtatsDesLieux().catch(() => avant)).map((m) => m.id))
  const aRevoir = new Set(affaires)
  for (const m of avant) if (m.affaireId && !restants.has(m.id)) aRevoir.add(m.affaireId)
  for (const a of relancesDues()) aRevoir.add(a)
  for (const affaireId of aRevoir) await analyserEnAttente(affaireId).catch(avertir)
}
