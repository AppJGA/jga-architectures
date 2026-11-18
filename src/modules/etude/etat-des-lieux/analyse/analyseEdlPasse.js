// ─── Un passage d'analyse des pièces d'une affaire ───────────────────────────
//
// L'enchaînement seul (quoi lire, quelle pièce envoyer, que noter en cas
// d'échec), sans navigateur ni Supabase : tout ce qui touche l'extérieur
// arrive par `d`. Le branchement réel est dans analyseEdl.js (verrou du
// navigateur `jga-analyse-edl` autour de chaque passage) ; le passage est
// essayé avec une base, un appareil et un Claude simulés
// (tests/etat-des-lieux-analyse-lancement.test.js).
//
// Chaque appel à Claude se paie. D'où trois protections, à garder ensemble :
//   · la pièce est relue juste avant l'appel, sous le verrou, et la décision
//     refaite sur ces données (deux onglets n'analysent pas deux fois) ;
//   · un essai est noté sur l'appareil AVANT l'appel : un onglet fermé ou un
//     réseau coupé pendant l'appel compte comme un échec, avec son attente ;
//   · une même pièce n'est tentée qu'une fois par passage, quoi qu'il arrive.
// Une écriture « à blanc » sur la pièce (`reserver`) vérifie aussi, avant de
// payer, que la base acceptera le résultat (compte en lecture seule).

import {
  decisionAnalyse, suiviTentative, analyseLeApres, prochaineRelance, intervallesPiece, friseDePiece,
  erreurDemandeAnalyse, lireAnalyse, messageEchecAnalyse, pieceDemandee, CODES_SANS_APPEL,
} from './analyseEdlLogique'

// Après un arrêt (réseau, session, base qui refuse), l'affaire est revue au
// plus tôt dans 10 minutes par le moteur de synchro
export const RELANCE_APRES_ARRET_MS = 10 * 60 * 1000

/**
 * @param affaireId
 * @param options { seulement: pieceId, forcer, relancer } — une pièce seule
 *   (« Réessayer » : `forcer` passe outre l'attente après échec ; « Relancer
 *   l'analyse » : `relancer` réanalyse une pièce déjà faite)
 * @param d dépendances :
 *   enLigne() → booléen ; aSession() → booléen ;
 *   lireSuivi(affaireId) → { indisponible, pieces, evenements } (choix des pièces) ;
 *   lireFrise(affaireId, pieceId) → { indisponible, piece, evenements, points, enregistrements, elementsValides } ;
 *   audioLocal() → { morceaux, tranches } ; gestesEnAttente(affaireId) → [{ creeLe }] ;
 *   reserver(piece) → 'ok' | 'deja' | 'refus' | 'indisponible' ;
 *   appeler(corps) → résultat brut de Claude ; ecrire({ affaireId, piece, fiche, elements, analyseLe }) → { indisponible } ;
 *   noterErreur(pieceId, message) ; lireSuivis() → { pieceId: suivi } ; ecrireSuivi(pieceId, suivi | null) ;
 *   noterRelance(affaireId, ms | null) ; signaler(detail) ; maintenant() ;
 *   estCoupure(err) ; surfaceDessinee(piece) → m² ; echecsMax.
 * @returns { analysees, echecs, raison }
 */
export async function passeAnalyseEdl(affaireId, options = {}, d) {
  const { seulement = null, forcer = false, relancer = false } = options
  const echecsMax = d.echecsMax ?? 3
  let analysees = 0
  let echecs = 0
  const fin = (raison = null) => ({ analysees, echecs, raison })
  const arreter = (raison) => {
    d.noterRelance(affaireId, d.maintenant() + RELANCE_APRES_ARRET_MS)
    return fin(raison)
  }

  // Hors ligne : rien n'est lu, et la relance prévue reste telle quelle
  if (!d.enLigne()) return fin('hors-ligne')
  if (!(await d.aSession())) return fin('session')

  let selection
  try {
    selection = await d.lireSuivi(affaireId)
  } catch (err) {
    return d.estCoupure(err) ? fin('reseau') : arreter('lecture')
  }
  // Sans la 082 : silencieux, rien à relancer
  if (selection.indisponible) {
    d.noterRelance(affaireId, null)
    return fin('indisponible')
  }

  // Ce qui attend sur l'appareil : illisible, dans le doute, on n'envoie rien
  let audio
  let gestes
  try {
    audio = await d.audioLocal()
    gestes = await d.gestesEnAttente(affaireId)
  } catch {
    return arreter('appareil')
  }

  const suivis = { ...(d.lireSuivis() ?? {}) }
  const garderSuivi = (id, suivi) => {
    if (suivi) suivis[id] = suivi
    else delete suivis[id]
    d.ecrireSuivi(id, suivi)
  }
  const decider = (piece, evenements, maintenant) => decisionAnalyse({
    piece, evenements, ...audio, gestes, suivi: suivis[piece.id] ?? null, maintenant,
    forcer: forcer && piece.id === seulement, relancer: relancer && piece.id === seulement, echecsMax,
  })

  const tentees = new Set()
  const candidates = (selection.pieces ?? []).filter((p) => !seulement || p.id === seulement)
  for (;;) {
    const maintenant = d.maintenant()
    let choisie = null
    for (const piece of candidates) {
      if (tentees.has(piece.id)) continue
      const decision = decider(piece, selection.evenements, maintenant)
      if (decision.suivi) garderSuivi(piece.id, decision.suivi)
      if (decision.tenter) { choisie = piece; break }
    }
    if (!choisie) break
    tentees.add(choisie.id)
    const r = await analyserUne(choisie.id)
    if (r === 'faite') analysees += 1
    else if (r === 'echec') echecs += 1
    else if (r !== 'passee') return arreter(r)
  }

  d.noterRelance(affaireId, prochaineRelance({
    pieces: selection.pieces, evenements: selection.evenements, suivis, maintenant: d.maintenant(),
  }))
  return fin(seulement && !tentees.size ? 'rien' : null)

  // Rend 'faite' | 'echec' | 'passee' (rien à faire, finalement), ou le
  // motif d'un arrêt du passage
  async function analyserUne(pieceId) {
    let lu
    try {
      lu = await d.lireFrise(affaireId, pieceId)
    } catch (err) {
      return d.estCoupure(err) ? 'reseau' : 'lecture'
    }
    if (lu.indisponible) return 'indisponible'
    const piece = lu.piece
    if (!piece) return 'passee'
    // Les données sont lues : l'analyse les couvre jusqu'à cet instant au moins
    const luLe = d.maintenant()
    const decision = decider(piece, lu.evenements, luLe)
    if (decision.suivi) garderSuivi(piece.id, decision.suivi)
    if (!decision.tenter) return 'passee'

    const intervalles = intervallesPiece(lu.evenements, piece.id)
    const { lignes, references, dejaReleves } = friseDePiece({
      piece, intervalles, evenements: lu.evenements, points: lu.points,
      enregistrements: lu.enregistrements, elementsValides: lu.elementsValides,
    })
    const corps = {
      piece: pieceDemandee(piece, d.surfaceDessinee?.(piece)),
      lignes,
      dejaReleves,
      // Une réanalyse garde ce que l'agence a corrigé au bureau
      ficheActuelle: piece.fiche && typeof piece.fiche === 'object' ? piece.fiche : null,
    }
    const avant = suivis[piece.id] ?? null
    const tentative = suiviTentative(avant, piece, { maintenant: luLe, intervalles })

    // Demande que le serveur refuserait (frise trop longue) : notée sans
    // appel, et jamais relancée d'elle-même
    const motif = erreurDemandeAnalyse(corps)
    if (motif) return echouer(piece, { code: 'demande', detail: motif }, { ...tentative, definitif: true })

    let reservation
    try {
      reservation = await d.reserver(piece)
    } catch (err) {
      return d.estCoupure(err) ? 'reseau' : 'refus'
    }
    if (reservation === 'indisponible') return 'indisponible'
    if (reservation === 'deja') return 'passee'
    if (reservation !== 'ok') return 'refus'

    garderSuivi(piece.id, tentative)
    d.signaler({ affaireId, pieceId: piece.id, etape: 'debut' })
    try {
      let resultat
      try {
        resultat = await d.appeler(corps)
      } catch (err) {
        if (CODES_SANS_APPEL.includes(err?.code)) {
          // Claude n'a pas été appelé : rien n'est compté contre la pièce
          garderSuivi(piece.id, avant)
          return err.code
        }
        if (err?.code === 'demande') return await echouer(piece, err, { ...tentative, definitif: true })
        // Coupure pendant l'appel : peut-être payé quand même. L'essai reste
        // compté (attente), sans motif sur la pièce : elle n'y est pour rien
        if (err?.code === 'reseau' || d.estCoupure(err)) return 'reseau'
        return await echouer(piece, err, tentative)
      }
      const { fiche, elements } = lireAnalyse(resultat, references)
      let ecrit
      try {
        ecrit = await d.ecrire({ affaireId, piece, fiche, elements, analyseLe: analyseLeApres(luLe, intervalles) })
      } catch (err) {
        if (d.estCoupure(err)) return 'reseau'
        return await echouer(piece, err, tentative)
      }
      if (ecrit?.indisponible) return 'indisponible'
      garderSuivi(piece.id, null)
      return 'faite'
    } finally {
      d.signaler({ affaireId, pieceId: piece.id, etape: 'fin' })
    }
  }

  async function echouer(piece, err, suivi) {
    garderSuivi(piece.id, suivi)
    // Le suivi de l'appareil suffit à empêcher la boucle : un motif qui ne
    // s'écrit pas (réseau, droits) ne change rien à l'attente
    try { await d.noterErreur(piece.id, messageEchecAnalyse(err)) } catch { /* attente gardée */ }
    return 'echec'
  }
}
