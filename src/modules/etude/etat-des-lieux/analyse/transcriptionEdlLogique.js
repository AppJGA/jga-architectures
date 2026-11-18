// ─── Transcription horodatée des morceaux d'une visite : logique pure ────────
//
// Un morceau audio est continu (une pause en ouvre un nouveau) : l'heure d'une
// phrase est l'heure de début du morceau sur l'appareil plus son `debut_s`.
// C'est ce qui permet à l'analyse de rattacher chaque phrase à la pièce où
// l'on se trouvait. Pur, testé (tests/etat-des-lieux-transcription-edl.test.js).

import { TYPES_EDL } from '../visite/fileEdlLogique'

// Un morceau d'une visite inconnue de la base n'est effacé qu'après ce délai :
// la visite peut encore être en route (créée sur l'appareil, envoi en cours)
export const DELAI_PURGE_MS = 10 * 60 * 1000

const arrondi = (n) => Math.round(n * 100) / 100

/** Heure de début du morceau (ms epoch) : `debut` du moteur, à défaut celui de l'enregistrement. */
export function debutMorceauMs(morceau) {
  if (Number.isFinite(morceau?.debut)) return morceau.debut
  const lu = Date.parse(morceau?.debut ?? morceau?.debutEnregistrement ?? '')
  return Number.isFinite(lu) ? lu : null
}

/**
 * Segments rendus par Mistral, nettoyés : texte vide écarté, bornes ramenées
 * dans le morceau (Mistral peut dépasser de quelques dixièmes la durée
 * mesurée sur l'appareil), dans l'ordre. Accepte la forme de Mistral
 * (`start`, `end`, `text`) comme celle de l'app.
 */
export function segmentsNettoyes(segments, duree_s) {
  if (!Array.isArray(segments)) return []
  const fin = Number.isFinite(duree_s) && duree_s > 0 ? duree_s : Infinity
  const borner = (n) => Math.min(Math.max(n, 0), fin)
  return segments
    .map((s) => {
      const texte = String(s?.texte ?? s?.text ?? '').trim()
      const debutLu = Number(s?.debut_s ?? s?.start)
      const finLue = Number(s?.fin_s ?? s?.end)
      const debut = borner(Number.isFinite(debutLu) ? debutLu : 0)
      const finSeg = Math.max(debut, borner(Number.isFinite(finLue) ? finLue : debut))
      return { debut_s: arrondi(debut), fin_s: arrondi(finSeg), texte }
    })
    .filter((s) => s.texte)
    .sort((a, b) => a.debut_s - b.debut_s || a.fin_s - b.fin_s)
}

/**
 * Morceau rangé sur l'appareil + réponse de `api/transcrire` → ligne
 * `edl_enregistrements`. L'identifiant est celui du morceau : une
 * transcription rejouée réécrit la même ligne. Sans horodatage (refusé par
 * Mistral), le texte devient un segment qui couvre tout le morceau, et
 * `horodate` le dit : l'analyse le place moins finement.
 */
export function ligneTranscription(morceau, reponse) {
  const debut = debutMorceauMs(morceau)
  if (debut == null) throw new Error('Morceau sans heure de début : la transcription ne peut pas être placée dans la visite.')
  const duree = Number(morceau?.duree_s)
  const duree_s = Number.isFinite(duree) && duree >= 0 ? arrondi(duree) : null
  const horodates = Array.isArray(reponse?.segments) ? segmentsNettoyes(reponse.segments, duree_s) : null
  const texteLu = String(reponse?.texte ?? '').trim()
  const texte = texteLu || (horodates ?? []).map((s) => s.texte).join(' ')
  // Des segments rendus vides alors qu'il y a du texte : l'horodatage n'a
  // rien donné d'utilisable, on le traite comme refusé
  const horodate = horodates !== null && (horodates.length > 0 || !texte)
  const segments = horodate
    ? horodates
    : (texte ? [{ debut_s: 0, fin_s: duree_s ?? 0, texte }] : [])
  return {
    id: String(morceau.id),
    visite_id: morceau.edlVisiteId,
    affaire_id: morceau.affaireId,
    debut: new Date(debut).toISOString(),
    duree_s,
    segments,
    texte,
    horodate,
  }
}

/** Heure d'un segment (ms epoch) : début du morceau + son décalage. */
export function heureSegment(ligne, segment) {
  const debut = Date.parse(ligne?.debut ?? '')
  const decalage = Number(segment?.debut_s)
  if (!Number.isFinite(debut)) return null
  return debut + (Number.isFinite(decalage) ? decalage * 1000 : 0)
}

/** Visites créées sur l'appareil et pas encore envoyées (file `jga-edl`). */
export function visitesCreeesSurLAppareil(operations) {
  return (operations ?? [])
    .filter((op) => op?.type === TYPES_EDL.visiteCreer && op.charge?.visite?.id)
    .map((op) => op.charge.visite.id)
}

/**
 * Morceaux à effacer de l'appareil : leur visite n'existe ni dans la base ni
 * dans la file de l'appareil (démarrage refusé, visite supprimée), et ils ont
 * plus de 10 minutes. `visitesConnues` doit venir d'une lecture fraîche, en
 * ligne : hors ligne, on n'appelle pas cette fonction. Un morceau sans heure
 * n'est jamais effacé.
 */
export function morceauxAPurger(morceaux, visitesConnues, maintenant = Date.now()) {
  const connues = visitesConnues instanceof Set ? visitesConnues : new Set(visitesConnues ?? [])
  return (morceaux ?? []).filter((m) => {
    if (m?.edlVisiteId == null || connues.has(m.edlVisiteId)) return false
    const debut = debutMorceauMs(m)
    return debut != null && maintenant - debut > DELAI_PURGE_MS
  })
}

/** La visite n'est pas encore dans la base (clé étrangère) : on attend, ce n'est pas un refus. */
export function visitePasEncoreEnvoyee(err) {
  return err?.code === '23503'
}

// ─── Échecs : ce qui compte contre un morceau, ce qui n'est qu'une panne ─────
//
// Chaque essai se paie, et un morceau compté trois fois quitte l'analyse
// (il n'est plus retenté de lui-même). Une panne passagère — Mistral saturé
// (429), en panne (5xx), trop lent (408), ou la base qui ne répond pas — ne
// dit rien du morceau : le passage s'arrête sans rien compter, comme sur une
// coupure de réseau, et repart au déclencheur suivant.

// Après un refus compté, le morceau attend avant d'être renvoyé : trois
// refus en trois minutes (moteur de synchro) ne prouvent rien de plus qu'un
export const ESPACEMENT_ECHECS_MS = 10 * 60 * 1000

/** Statut HTTP d'une panne passagère (rien à reprocher à la demande). */
export const statutPassager = (s) => s === 408 || s === 429 || (Number.isFinite(s) && s >= 500)

/**
 * Refus de la transcription qui compte contre le morceau : un vrai 4xx
 * (audio illisible, trop gros…). Ni une panne passagère, ni 401 / 403
 * (compte ou clé : le morceau n'y est pour rien). Statut inconnu : compté.
 */
export function refusCompte(err) {
  if (err?.code !== 'refus') return false
  const s = Number(err?.statut)
  if (!Number.isFinite(s) || s <= 0) return true
  return s >= 400 && s < 500 && ![401, 403, 408, 429].includes(s)
}

/** Panne passagère de Mistral ou de la fonction serveur. */
export const refusPassager = (err) => err?.code === 'refus' && statutPassager(Number(err?.statut))

// Codes de la base (PostgREST, PostgreSQL) d'une écriture qui pourrait
// passer plus tard : connexion, ressources, délai dépassé, verrou, conflit
// de sérialisation
const CODES_BASE_PASSAGERS = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '40001', '40P01', '55P03'])

/** L'écriture d'une transcription a échoué pour une raison passagère (5xx, délai). */
export function ecriturePassagere(err) {
  if (statutPassager(Number(err?.statut ?? err?.status))) return true
  const code = String(err?.code ?? '')
  return CODES_BASE_PASSAGERS.has(code) || /^(08|53|57)/.test(code)
}

/**
 * Morceau à envoyer à ce passage : d'une visite d'état des lieux, avec une
 * heure (sinon il ne se placerait dans aucune pièce), pas mis de côté
 * (`echecsMax` refus), et pas refusé il y a moins de ESPACEMENT_ECHECS_MS.
 */
export function morceauTranscriptible(m, { maintenant = Date.now(), echecsMax = 3 } = {}) {
  if (m?.edlVisiteId == null || debutMorceauMs(m) == null) return false
  const echecs = m.echecs ?? 0
  if (echecs >= echecsMax) return false
  return !(echecs > 0 && Number.isFinite(m.dernierEchec) && maintenant - m.dernierEchec < ESPACEMENT_ECHECS_MS)
}

/**
 * Rien à faire en ligne pour ces morceaux : aucun à envoyer, et aucun que la
 * purge pourrait viser. Un morceau déjà refusé a été envoyé, donc sa visite
 * était dans la base : il n'est pas candidat (sinon un seul morceau mis de
 * côté relançait les lectures à chaque minute du moteur de synchro, sans
 * fin). Il reste repris par « Réessayer le son refusé ».
 */
export function rienAEnvoyer(morceaux, { maintenant = Date.now(), echecsMax = 3 } = {}) {
  return !(morceaux ?? []).some((m) => {
    if (morceauTranscriptible(m, { maintenant, echecsMax })) return true
    const debut = debutMorceauMs(m)
    return m?.edlVisiteId != null && !(m.echecs > 0) && debut != null && maintenant - debut > DELAI_PURGE_MS
  })
}

/** Morceaux de l'affaire mis de côté sur cet appareil (`echecsMax` refus comptés). */
export function morceauxRefuses(morceaux, affaireId, echecsMax = 3) {
  if (!affaireId) return []
  return (morceaux ?? []).filter((m) => m?.edlVisiteId != null && m.affaireId === affaireId && (m.echecs ?? 0) >= echecsMax)
}
