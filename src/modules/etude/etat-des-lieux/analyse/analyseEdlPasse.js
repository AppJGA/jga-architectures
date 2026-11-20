// ─── Un passage d'analyse des pièces d'une affaire ───────────────────────────
//
// L'enchaînement seul (quoi lire, quelle pièce envoyer, que noter en cas
// d'échec), sans navigateur ni Supabase : tout ce qui touche l'extérieur
// arrive par `d`. Le branchement réel est dans analyseEdl.js (verrou du
// navigateur `jga-analyse-edl` autour de chaque passage) ; le passage est
// essayé avec une base, un appareil et un Claude simulés
// (tests/etat-des-lieux-analyse-lancement.test.js).
//
// Chaque appel à Claude se paie. D'où ces protections, à garder ensemble :
//   · la pièce est relue juste avant l'appel, sous le verrou, et la décision
//     refaite sur ces données (deux onglets n'analysent pas deux fois) ;
//   · un essai est noté sur l'appareil AVANT l'appel : un onglet fermé ou un
//     réseau coupé pendant l'appel compte comme un échec, avec son attente ;
//     trois essais automatiques ratés pour une même couverture, ou un refus
//     de Claude, rendent l'échec définitif (seuls « Réessayer » et une
//     nouvelle visite le font repartir) ;
//   · une même pièce n'est tentée qu'une fois par passage, quoi qu'il arrive.
// Une écriture « à blanc » sur la pièce (`reserver`) vérifie aussi, avant de
// payer, que la base acceptera le résultat (compte en lecture seule) et que
// la pièce n'a pas bougé depuis la frise ; elle rend l'`updated_at` sur
// lequel `ecrire` se conditionne. Avec la fonction edl_ecrire_analyse (082),
// éléments et pièce s'écrivent en une transaction, ou rien si la pièce a
// bougé : une fiche corrigée ou validée au bureau pendant l'appel n'est pas
// écrasée, et la fiche d'une analyse ne côtoie jamais les éléments d'une
// autre. Le repli sans la fonction (prise, éléments, pièce) réduit ce risque
// sans l'écarter.
//
// Limite connue : sans colonne de bail dans la base, un appareil peut
// réserver la pièce pendant tout l'appel d'un autre, et payer le sien. Avec
// la fonction, un seul des deux résultats s'écrit ; l'autre trouve la pièce
// analysée ('deja-fait') et n'écrit rien.

import {
  decisionAnalyse, suiviTentative, suiviApresEchec, analyseLeApres, prochaineRelance, intervallesPiece,
  friseDePiece, erreurDemandeAnalyse, lireAnalyse, messageEchecAnalyse, pieceDemandee, suiteConflitEcriture,
  motifEchec, CODES_SANS_APPEL,
} from './analyseEdlLogique'

// Après un arrêt (réseau, session, base qui refuse), l'affaire est revue au
// plus tôt dans 10 minutes par le moteur de synchro
export const RELANCE_APRES_ARRET_MS = 10 * 60 * 1000

/**
 * @param affaireId
 * @param options { seulement: pieceId, forcer, relancer } — une pièce seule
 *   (« Réessayer » : `forcer` passe outre l'attente et l'échec définitif ;
 *   « Relancer l'analyse » : `relancer` réanalyse une pièce déjà faite)
 * @param d dépendances :
 *   enLigne() → booléen ; aSession() → booléen ;
 *   lireSuivi(affaireId) → { indisponible, pieces, evenements, enregistrements } (choix des pièces) ;
 *   lireFrise(affaireId, pieceId) → { indisponible, piece, evenements, points, enregistrements, elementsValides, traces } ;
 *     (`traces` : liaisons et cotes de la 084, null ou absent si non lues) ;
 *   audioLocal() → { morceaux, tranches } ; gestesEnAttente(affaireId) → [{ creeLe }] ;
 *   reserver(piece) → { etat: 'ok' | 'deja' | 'relire' | 'refus' | 'indisponible', updatedAt } ;
 *   relirePiece(pieceId) → { id, fiche, fiche_a_valider, analyse_le, updated_at } | null ;
 *   appeler(corps) → résultat brut de Claude ;
 *   ecrire({ affaireId, piece, fiche, elements, traces, visiteId, analyseLe, siMisAJour, garderFiche })
 *     → { indisponible, conflit, elementsEcrits, attendu } : une transaction
 *     (edl_ecrire_analyse), à défaut prise, éléments, puis pièce (`conflit` :
 *     la pièce a bougé ; `elementsEcrits` : des éléments restent écrits) ;
 *   noterErreur(pieceId, message, { analyseLe }) ; lireSuivis() → { pieceId: suivi } ;
 *   ecrireSuivi(pieceId, suivi | null) ; noterRelance(affaireId, ms | null) ; signaler(detail) ;
 *   maintenant() ; estCoupure(err) ; surfaceDessinee(piece) → m² ; echecsMax.
 * @returns { analysees, echecs, raison } — pour une pièce seule qui n'est pas
 *   partie, `raison` dit pourquoi : 'son', 'passage', 'gestes',
 *   'echec-definitif', 'deja-fait', 'non-visitee', 'attente-echec'… ;
 *   après un double conflit d'écriture : 'conflit' (rien d'écrit) ou
 *   'conflit-elements' (éléments écrits, fiche et analyse_le non) — la pièce
 *   repart d'elle-même après l'attente, les autres pièces continuent.
 */
export async function passeAnalyseEdl(affaireId, options = {}, d) {
  const { seulement = null, forcer = false, relancer = false } = options
  const echecsMax = d.echecsMax ?? 3
  let analysees = 0
  let echecs = 0
  // Pourquoi la pièce demandée n'est pas partie (dernière décision la concernant)
  let raisonSeule = null
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
  const decider = (piece, evenements, enregistrements, maintenant) => {
    const decision = decisionAnalyse({
      piece, evenements, enregistrements, ...audio, gestes, suivi: suivis[piece.id] ?? null, maintenant,
      forcer: forcer && piece.id === seulement, relancer: relancer && piece.id === seulement, echecsMax,
    })
    if (piece.id === seulement && !decision.tenter) raisonSeule = decision.raison
    return decision
  }

  const tentees = new Set()
  const candidates = (selection.pieces ?? []).filter((p) => !seulement || p.id === seulement)
  if (seulement && !candidates.length) raisonSeule = 'non-visitee'
  for (;;) {
    const maintenant = d.maintenant()
    let choisie = null
    for (const piece of candidates) {
      if (tentees.has(piece.id)) continue
      const decision = decider(piece, selection.evenements, selection.enregistrements ?? [], maintenant)
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
    ...audio, enregistrements: selection.enregistrements ?? [], echecsMax,
  }))
  return fin(seulement && !analysees && !echecs ? raisonSeule : null)

  // Rend 'faite' | 'echec' | 'passee' (rien à faire, finalement), ou le
  // motif d'un arrêt du passage. `relue` : seconde lecture, la fiche ayant
  // changé entre la frise et la réservation (une seule fois)
  async function analyserUne(pieceId, relue = false) {
    let lu
    try {
      lu = await d.lireFrise(affaireId, pieceId)
    } catch (err) {
      return d.estCoupure(err) ? 'reseau' : 'lecture'
    }
    if (lu.indisponible) return 'indisponible'
    const piece = lu.piece
    if (!piece) {
      if (pieceId === seulement) raisonSeule = 'non-visitee'
      return 'passee'
    }
    // Les données sont lues : l'analyse les couvre jusqu'à cet instant au moins
    const luLe = d.maintenant()
    const decision = decider(piece, lu.evenements, lu.enregistrements, luLe)
    if (decision.suivi) garderSuivi(piece.id, decision.suivi)
    if (!decision.tenter) return 'passee'

    const intervalles = intervallesPiece(lu.evenements, piece.id)
    const { lignes, references, dejaReleves, lignesTraces, contexteTraces } = friseDePiece({
      piece, intervalles, evenements: lu.evenements, points: lu.points,
      enregistrements: lu.enregistrements, elementsValides: lu.elementsValides,
      // Liaisons et cotes (084) : null si elles n'ont pas été lues
      traces: Array.isArray(lu.traces) ? lu.traces : null,
    })
    const corps = {
      piece: pieceDemandee(piece, d.surfaceDessinee?.(piece)),
      lignes,
      dejaReleves,
      // Une réanalyse garde ce que l'agence a corrigé au bureau
      ficheActuelle: piece.fiche && typeof piece.fiche === 'object' ? piece.fiche : null,
      // Absent sans traces lues : la demande est exactement celle d'avant la 084
      ...(lignesTraces ? { tracesPiece: lignesTraces } : {}),
    }
    const avant = suivis[piece.id] ?? null
    const tentative = suiviTentative(avant, piece, { maintenant: luLe, intervalles })

    // Demande que le serveur refuserait (frise trop longue) : notée sans
    // appel, et jamais relancée d'elle-même
    const motif = erreurDemandeAnalyse(corps)
    if (motif) return echouer(piece, { code: 'demande', detail: motif }, tentative)

    let reservation
    try {
      reservation = await d.reserver(piece)
    } catch (err) {
      return d.estCoupure(err) ? 'reseau' : 'refus'
    }
    if (reservation?.etat === 'indisponible') return 'indisponible'
    // Fiche changée au bureau depuis la lecture : la frise est refaite avant
    // de payer, avec la fiche à jour
    if (reservation?.etat === 'relire') {
      if (!relue) return analyserUne(pieceId, true)
      if (pieceId === seulement) raisonSeule = 'fiche-modifiee'
      return 'passee'
    }
    if (reservation?.etat === 'deja') {
      if (pieceId === seulement) raisonSeule = 'deja-fait'
      return 'passee'
    }
    if (reservation?.etat !== 'ok') return 'refus'

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
        // Coupure pendant l'appel : peut-être payé quand même. L'essai reste
        // compté (attente), sans motif sur la pièce : elle n'y est pour rien
        if (err?.code === 'reseau' || d.estCoupure(err)) return 'reseau'
        return await echouer(piece, err, tentative)
      }
      const { fiche, elements, traces } = lireAnalyse(resultat, references, contexteTraces)
      // Une liaison proposée est rattachée à la dernière visite de la pièce
      const visiteId = intervalles[intervalles.length - 1]?.visiteId ?? null
      const ecriture = { affaireId, piece, fiche, elements, traces, visiteId, analyseLe: analyseLeApres(luLe, intervalles) }
      let ecrit
      try {
        ecrit = await d.ecrire({ ...ecriture, siMisAJour: reservation.updatedAt })
        if (ecrit?.conflit) ecrit = await apresConflit(piece, ecriture, ecrit)
      } catch (err) {
        if (d.estCoupure(err)) return 'reseau'
        return await echouer(piece, err, tentative)
      }
      if (typeof ecrit === 'string') return ecrit
      if (ecrit?.indisponible) return 'indisponible'
      garderSuivi(piece.id, null)
      return 'faite'
    } finally {
      d.signaler({ affaireId, pieceId: piece.id, etape: 'fin' })
    }
  }

  // La pièce a bougé pendant l'appel : relue, puis une seule nouvelle
  // écriture complète sur la version relue (fiche de l'agence gardée si
  // elle a été corrigée ou validée), jamais une boucle.
  // `conflit.elementsEcrits` : le repli sans transaction a laissé des
  // éléments écrits.
  async function apresConflit(piece, ecriture, conflit) {
    const dejaEcrits = conflit.elementsEcrits === true
    const relue = await d.relirePiece(piece.id)
    const suite = suiteConflitEcriture({ piece, reserve: conflit.attendu, relue })
    if (suite === 'disparue' || suite === 'deja-fait') {
      garderSuivi(piece.id, null)
      if (piece.id === seulement) raisonSeule = 'deja-fait'
      return 'passee'
    }
    // Rien n'a bougé et l'écriture échoue : la base refuse (essai compté,
    // payé). Sans élément écrit, c'est bien « Lecture seule »
    if (suite === 'lecture-seule' && !dejaEcrits) return 'refus'
    let ecrit = null
    if (suite !== 'lecture-seule') {
      ecrit = await d.ecrire({ ...ecriture, siMisAJour: relue.updated_at, garderFiche: suite === 'fiche-agence' })
      if (!ecrit?.conflit) return ecrit
    }
    // Encore un conflit : la pièce passe son tour (l'essai compté la fera
    // repartir après l'attente), les autres pièces continuent. On dit ce
    // qui est resté écrit.
    if (piece.id === seulement) raisonSeule = dejaEcrits || ecrit?.elementsEcrits ? 'conflit-elements' : 'conflit'
    return 'passee'
  }

  async function echouer(piece, err, suiviEssai) {
    const suivi = suiviApresEchec(suiviEssai, err)
    garderSuivi(piece.id, suivi)
    // Le suivi de l'appareil suffit à empêcher la boucle : un motif qui ne
    // s'écrit pas (réseau, droits) ne change rien à l'attente. Conditionné
    // sur `analyse_le` lu : une pièce analysée ailleurs entre-temps ne passe
    // pas en échec.
    try {
      // Définitif : le motif le dit, pour que tout appareil le tienne pour tel
      await d.noterErreur(piece.id, motifEchec(messageEchecAnalyse(err), { definitif: suivi.definitif }), { analyseLe: piece.analyse_le ?? null })
    } catch { /* attente gardée */ }
    return 'echec'
  }
}
