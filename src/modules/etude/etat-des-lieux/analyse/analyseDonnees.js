// ─── Lectures et écritures de l'analyse (migration 082) ──────────────────────
//
// Transcriptions horodatées, éléments relevés et fiche de chaque pièce. La
// 082 se passe à la main : sans elle, tout rend `indisponible` au lieu
// d'échouer (l'écran dit « L'analyse demande la migration 082 », la visite
// du lot 2 continue). Les autres erreurs remontent.
//
// Lectures fraîches seulement : l'alias `synchro_id` les exclut de la mémoire
// du service worker (vite.config.js) — elles décident d'écritures (ce qui
// reste à analyser, ce qu'une réanalyse remplace). Pagination par
// identifiant, 1 000 lignes par page, chaque page bornée (`bornerDelai`).
// Un refus RLS sur une modification ou une suppression ne rend pas d'erreur :
// on compte les lignes.

import { supabase } from '../../../../core/supabase/client'
import { bornerDelai, DELAI_LECTURE_MS } from '../visite/visiteLogique'
import { ecrireAvecReplis } from '../../../../shared/repliColonnes'
import {
  analyseIndisponible, ligneEnregistrement, lignesElementsIa, champsValidation,
  ligneElementMain, champsPieceAnalysee, messageErreurAnalyse, lignesTracesIa, champsValidationTrace, ecartTrace,
} from './analyseDonneesLogique'
import { memeFiche } from './analyseEdlLogique'
import { lectureTraces, tracesIndisponibles, MESSAGE_TRACES_INDISPONIBLES } from '../tracesEdl'

export { analyseIndisponible, MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonneesLogique'

const LECTURE_SEULE = 'Lecture seule : rien n’a été modifié.'
const PAGE = 1000
const COLONNES_PIECES = 'synchro_id:id, id, niveau_id, fiche, analyse_le, analyse_erreur, fiche_a_valider'
const INDISPONIBLE = { indisponible: true }

const propre = (ligne) => {
  const copie = { ...ligne }
  delete copie.synchro_id
  return copie
}

// Même parcours que la visite (visiteDonnees.js), recopié ici pour ne pas
// tirer la base locale et le verrou de la visite dans le bureau
async function toutes(table, colonnes, filtrer, delaiMs) {
  const lignes = []
  let dernier = null
  for (;;) {
    let requete = filtrer(supabase.from(table).select(colonnes)).order('id').limit(PAGE)
    if (dernier) requete = requete.gt('id', dernier)
    const { data, error } = await bornerDelai((signal) => requete.abortSignal(signal), delaiMs)
    if (error) throw error
    lignes.push(...(data ?? []).map(propre))
    if (!data || data.length < PAGE) return lignes
    dernier = data[data.length - 1].id
  }
}

/**
 * Tout ce qu'il faut pour analyser et relire une affaire. Sans la 082 :
 * `{ indisponible: true }` et des listes vides.
 */
export async function lireAnalyse(affaireId, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  try {
    const [enregistrements, elements, pieces] = await Promise.all([
      toutes('edl_enregistrements', 'synchro_id:id, *', deLAffaire, delaiMs),
      toutes('edl_elements', 'synchro_id:id, *', deLAffaire, delaiMs),
      toutes('edl_pieces', COLONNES_PIECES, deLAffaire, delaiMs),
    ])
    enregistrements.sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut))
    return { indisponible: false, enregistrements, elements, pieces }
  } catch (err) {
    if (analyseIndisponible(err)) return { ...INDISPONIBLE, enregistrements: [], elements: [], pieces: [] }
    throw err
  }
}

/**
 * Liaisons et cotes (migration 084) d'une affaire, ou d'une pièce
 * (`pieceId`) : { traces, tracesDisponibles }. Lues à part des autres
 * lectures : sans la 084, aucune trace et le drapeau faux, sans rendre
 * l'analyse indisponible.
 */
export function lireTracesAffaire(affaireId, { pieceId = null, delaiMs = DELAI_LECTURE_MS } = {}) {
  const filtrer = (q) => (pieceId ? q.eq('affaire_id', affaireId).eq('piece_id', pieceId) : q.eq('affaire_id', affaireId))
  return lectureTraces(() => toutes('edl_traces', 'synchro_id:id, *', filtrer, delaiMs))
}

// Ce que la visite et le tableau des pièces affichent : fiche, état de
// l'analyse, HSP lue (la complétude en dépend)
const COLONNES_ETAT_PIECES = 'synchro_id:id, id, niveau_id, fiche, hsp_lue, analyse_le, analyse_erreur, fiche_a_valider, updated_at'

/** État de l'analyse d'une affaire, léger (ni transcriptions ni journal) : pièces et éléments. */
export async function lireEtatAnalyse(affaireId, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  try {
    const [pieces, elements] = await Promise.all([
      toutes('edl_pieces', COLONNES_ETAT_PIECES, deLAffaire, delaiMs),
      toutes('edl_elements', 'synchro_id:id, *', deLAffaire, delaiMs),
    ])
    return { indisponible: false, pieces, elements }
  } catch (err) {
    if (analyseIndisponible(err)) return { ...INDISPONIBLE, pieces: [], elements: [] }
    throw err
  }
}

/**
 * Choix des pièces à analyser : leur état, les entrées / sorties du journal,
 * et jusqu'où va le son transcrit de chaque visite (sans le texte).
 */
export async function lireSuiviAnalyse(affaireId, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  try {
    const [pieces, evenements, enregistrements] = await Promise.all([
      toutes('edl_pieces', COLONNES_ETAT_PIECES, deLAffaire, delaiMs),
      toutes('edl_evenements', 'synchro_id:id, id, visite_id, niveau_id, piece_id, point_id, type, le', deLAffaire, delaiMs),
      toutes('edl_enregistrements', 'synchro_id:id, id, visite_id, debut, duree_s', deLAffaire, delaiMs),
    ])
    return { indisponible: false, pieces, evenements, enregistrements }
  } catch (err) {
    if (analyseIndisponible(err)) return { ...INDISPONIBLE, pieces: [], evenements: [], enregistrements: [] }
    throw err
  }
}

/**
 * Tout ce que la frise d'une pièce demande, relu juste avant l'appel à
 * Claude : la pièce, le journal et les points de l'affaire (un point d'une
 * autre pièce peut y avoir été rattaché), les transcriptions des visites de
 * la pièce, ses éléments déjà validés, et les liaisons et cotes de l'affaire
 * (`traces`, migration 084). `traces` vaut null si elles n'ont pas été lues
 * — base sans la 084, ou lecture ratée : l'analyse se fait alors comme
 * avant, sans rien proposer ni retirer des traces (envoyer une liste vide
 * effacerait des propositions que personne n'a relues).
 */
export async function lireFriseAnalyse(affaireId, pieceId, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  try {
    const [pieces, evenements, points, elementsValides, lectureT] = await Promise.all([
      toutes('edl_pieces', 'synchro_id:id, *', (q) => q.eq('id', pieceId), delaiMs),
      toutes('edl_evenements', 'synchro_id:id, *', deLAffaire, delaiMs),
      toutes('edl_points', 'synchro_id:id, *', deLAffaire, delaiMs),
      toutes('edl_elements', 'synchro_id:id, *', (q) => q.eq('piece_id', pieceId).eq('a_valider', false), delaiMs),
      lireTracesAffaire(affaireId, { delaiMs }).catch(() => null),
    ])
    const traces = lectureT?.tracesDisponibles ? lectureT.traces : null
    const piece = pieces[0] ?? null
    // `select('*')` sans la 082 ne dit rien : la colonne manquerait en silence
    if (piece && !('analyse_le' in piece)) return { ...INDISPONIBLE }
    const visites = [...new Set(evenements.filter((e) => e.piece_id === pieceId).map((e) => e.visite_id))]
    const enregistrements = visites.length
      ? await toutes('edl_enregistrements', 'synchro_id:id, *', (q) => deLAffaire(q).in('visite_id', visites), delaiMs)
      : []
    return { indisponible: false, piece, evenements, points, enregistrements, elementsValides, traces }
  } catch (err) {
    if (analyseIndisponible(err)) return { ...INDISPONIBLE }
    throw err
  }
}

/**
 * Écriture « à blanc » sur la pièce avant de payer un appel à Claude : le
 * motif d'échec est réécrit tel quel, à condition que `analyse_le` n'ait pas
 * bougé depuis la lecture. Aucune ligne touchée : soit la pièce vient d'être
 * analysée ailleurs ('deja'), soit la base refuse d'y écrire ('refus' — un
 * refus RLS ne rend pas d'erreur), et le résultat ne pourrait pas s'écrire.
 * Conditionnée aussi sur l'`updated_at` lu avec la frise : la pièce modifiée
 * entre-temps (fiche corrigée au bureau, motif d'un autre appareil), la
 * demande serait déjà fausse ('relire', rien n'est payé), et le motif réécrit
 * effacerait celui d'un autre appareil. La fiche relue est vérifiée en plus.
 *
 * Ce n'est pas un bail : pendant tout l'appel d'un appareil, un autre peut
 * encore réserver la même pièce et payer le sien. Avec la fonction
 * edl_ecrire_analyse, un seul des deux résultats s'écrit, en entier ; avec
 * le repli sans transaction, presque toujours. Empêcher le second paiement
 * demanderait une colonne de bail dans la base.
 * @returns { etat: 'ok' | 'deja' | 'relire' | 'refus' | 'indisponible', updatedAt }
 */
export async function reserverAnalyse(piece) {
  let requete = supabase.from('edl_pieces').update({ analyse_erreur: piece.analyse_erreur ?? null }).eq('id', piece.id)
  requete = piece.analyse_le ? requete.eq('analyse_le', piece.analyse_le) : requete.is('analyse_le', null)
  // Version lue avec la frise : le motif réécrit est celui de cette version,
  // jamais un motif plus récent (suffixe définitif d'un autre appareil)
  if (piece.updated_at) requete = requete.eq('updated_at', piece.updated_at)
  // `updated_at` après l'écriture (le déclencheur edl_pieces_touche l'a
  // avancé) : la prise d'ecrireResultatAnalyse se conditionne dessus
  const { data, error } = await requete.select('id, updated_at, fiche')
  if (error) {
    if (analyseIndisponible(error)) return { etat: 'indisponible' }
    throw error
  }
  if (data?.length) {
    if (!memeFiche(data[0].fiche, piece.fiche)) return { etat: 'relire' }
    return { etat: 'ok', updatedAt: data[0].updated_at ?? null }
  }
  const { data: relue, error: erreurRelue } = await bornerDelai((signal) => supabase
    .from('edl_pieces').select('synchro_id:id, analyse_le, updated_at').eq('id', piece.id).abortSignal(signal).maybeSingle())
  if (erreurRelue) throw erreurRelue
  if (!relue) return { etat: 'deja' }
  const heure = (v) => (v ? Date.parse(v) : null)
  if (heure(relue.analyse_le) !== heure(piece.analyse_le)) return { etat: 'deja' }
  // Autre écriture depuis la frise (fiche, motif) : relire avant de payer
  if (piece.updated_at && heure(relue.updated_at) !== heure(piece.updated_at)) return { etat: 'relire' }
  return { etat: 'refus' }
}

/** Upsert par identifiant du morceau : une transcription rejouée réécrit la même ligne. */
export async function enregistrerTranscription(ligne) {
  const { data, error, status } = await supabase
    .from('edl_enregistrements').upsert(ligneEnregistrement(ligne), { onConflict: 'id' }).select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    // Le statut HTTP dit si la base était en panne (5xx) : la transcription
    // n'est alors pas comptée contre le morceau (ecriturePassagere)
    throw Object.assign(error, { statut: status })
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { indisponible: false }
}

/**
 * Résultat d'une analyse pour une pièce. Rejouable avec le même résultat :
 * seules les propositions de Claude encore à valider sont remplacées, les
 * éléments validés (ou ajoutés à la main) ne sont jamais touchés.
 *
 * Avec `siMisAJour` (updated_at rendu par la réservation) :
 * - **par la fonction `edl_ecrire_analyse`** (migration 082) : pièce
 *   verrouillée, propositions remplacées et pièce écrite dans une seule
 *   transaction, ou rien si la pièce a bougé (`conflit`, `elementsEcrits:
 *   false`). La fiche d'une analyse ne côtoie jamais les éléments d'une
 *   autre ;
 * - **à défaut** (base où la fonction manque) : prise conditionnée sur
 *   `siMisAJour` (rien d'écrit si la pièce a bougé), éléments, puis pièce
 *   conditionnée sur la version prise (`conflit`, `elementsEcrits: true`).
 *   Sans transaction, ce repli réduit le risque sans l'écarter : un autre
 *   appareil peut écrire ses éléments entre la prise et la pièce. Toute
 *   nouvelle tentative refait les trois étapes.
 * `attendu` : l'updated_at sur lequel portait la condition ratée.
 * Sans `siMisAJour` : écriture directe (pas de transaction, un arrêt en
 * route laisse `analyse_le` inchangé et la passe suivante refait tout).
 *
 * `traces` (liaisons et valeurs de cotes proposées, `lireAnalyse`) ne
 * s'écrivent que par la fonction, dans la même transaction (migration
 * 084) ; null : le paramètre n'est pas envoyé. Le repli sans fonction ne les
 * écrit pas (base d'avant la 082 : elle n'a pas la 084 non plus).
 */
export async function ecrireResultatAnalyse({
  affaireId, piece, fiche, elements, traces = null, visiteId = null, analyseLe = new Date(), siMisAJour = undefined, garderFiche = false,
}) {
  if (siMisAJour !== undefined) {
    const r = await ecrireParFonction({ affaireId, piece, fiche, elements, traces, visiteId, analyseLe, siMisAJour, garderFiche })
    if (r) return r
  }
  const champs = champsPieceAnalysee(fiche, analyseLe)
  // Fiche modifiée ou validée au bureau pendant l'appel : elle reste, et sa marque aussi
  if (garderFiche) {
    delete champs.fiche
    delete champs.fiche_a_valider
  }

  let version = siMisAJour
  if (siMisAJour !== undefined) {
    const prise = await prendrePiece(piece, siMisAJour)
    if (prise.indisponible || prise.conflit) return prise
    version = prise.updatedAt
  }

  const propositions = (q) => q.eq('piece_id', piece.id).eq('origine', 'ia').eq('a_valider', true)

  const supprime = await propositions(supabase.from('edl_elements').delete()).select('id')
  if (supprime.error) {
    if (analyseIndisponible(supprime.error)) return INDISPONIBLE
    throw supprime.error
  }
  // Rien de supprimé : première analyse, ou refus silencieux de la base.
  // Une relecture tranche : s'il en reste, la suppression a été refusée.
  if (!supprime.data?.length) {
    const reste = await propositions(supabase.from('edl_elements').select('synchro_id:id')).limit(1)
    if (reste.error) throw reste.error
    if (reste.data?.length) throw new Error(LECTURE_SEULE)
  }

  const lignes = lignesElementsIa({ affaireId, piece, elements })
  if (lignes.length) {
    // Un identifiant déjà en base (élément validé entre deux essais) est
    // laissé tel quel : un insert pur le refuserait (23505), un upsert
    // complet le ramènerait « à valider »
    const { error } = await supabase
      .from('edl_elements').upsert(lignes, { onConflict: 'id', ignoreDuplicates: true })
    if (error) {
      if (analyseIndisponible(error)) return INDISPONIBLE
      throw error
    }
  }

  return ecrirePieceAnalysee(piece.id, champs, version, { remplaces: supprime.data?.length ?? 0, ajoutes: lignes.length, elementsEcrits: true })
}

// Fonction absente du cache de PostgREST (PGRST202) ou de la base (42883) :
// base où la 082 a été passée avant que la fonction y soit ajoutée
const fonctionAbsente = (error) => error?.code === 'PGRST202' || error?.code === '42883'

// Écriture transactionnelle ; null si la fonction manque (repli)
async function ecrireParFonction({ affaireId, piece, fiche, elements, traces, visiteId, analyseLe, siMisAJour, garderFiche }) {
  const lignes = lignesElementsIa({ affaireId, piece, elements })
  const parametres = {
    p_piece: piece.id,
    p_version: siMisAJour,
    p_fiche: fiche ?? {},
    p_elements: lignes,
    p_analyse_le: new Date(analyseLe).toISOString(),
    p_garder_fiche: garderFiche === true,
  }
  // Sans traces lues, le paramètre n'est pas envoyé du tout : une base sans
  // la 084 ne connaît pas `p_traces` et refuserait l'appel entier
  const pTraces = lignesTracesIa({ traces, visiteId })
  if (pTraces) parametres.p_traces = pTraces
  const { data, error } = await supabase.rpc('edl_ecrire_analyse', parametres)
  if (error) {
    if (fonctionAbsente(error)) return null
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  const statut = data?.statut
  if (statut === 'ok') {
    return {
      indisponible: false, remplaces: data.remplaces ?? 0, ajoutes: data.ajoutes ?? 0, transaction: true,
      tracesAjoutees: data.traces_ajoutees ?? 0, cotesLues: data.cotes_lues ?? 0,
    }
  }
  // 'conflit' ou 'introuvable' (supprimée, ou refusée par les règles) :
  // rien d'écrit, l'appelant relit la pièce pour savoir laquelle
  if (statut === 'conflit' || statut === 'introuvable') {
    return { indisponible: false, conflit: true, elementsEcrits: false, attendu: siMisAJour, transaction: true }
  }
  throw new Error(`Écriture de l’analyse : réponse inattendue (${JSON.stringify(data)}).`)
}

// La prise : motif réécrit tel quel, si la pièce est encore à la version
// réservée. Le déclencheur avance updated_at : la version rendue est à nous.
async function prendrePiece(piece, siMisAJour) {
  let requete = supabase.from('edl_pieces').update({ analyse_erreur: piece.analyse_erreur ?? null }).eq('id', piece.id)
  requete = siMisAJour ? requete.eq('updated_at', siMisAJour) : requete.is('updated_at', null)
  const { data, error } = await requete.select('id, updated_at')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) return { indisponible: false, conflit: true, elementsEcrits: false, attendu: siMisAJour }
  return { indisponible: false, updatedAt: data[0].updated_at ?? null }
}

// Aucune ligne touchée → `conflit`, et l'appelant relit la pièce pour savoir
// pourquoi (suiteConflitEcriture). Sans condition, aucune ligne touchée =
// refus silencieux de la base.
async function ecrirePieceAnalysee(pieceId, champs, siMisAJour, compte) {
  let requete = supabase.from('edl_pieces').update(champs).eq('id', pieceId)
  if (siMisAJour !== undefined) requete = siMisAJour ? requete.eq('updated_at', siMisAJour) : requete.is('updated_at', null)
  const { data, error } = await requete.select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) {
    if (siMisAJour !== undefined) return { indisponible: false, conflit: true, elementsEcrits: compte.elementsEcrits === true, attendu: siMisAJour }
    throw new Error(LECTURE_SEULE)
  }
  return { indisponible: false, ...compte }
}

/** La pièce relue après un conflit d'écriture (lecture fraîche). */
export async function relirePieceAnalyse(pieceId) {
  const { data, error } = await bornerDelai((signal) => supabase
    .from('edl_pieces').select('synchro_id:id, id, fiche, fiche_a_valider, analyse_le, analyse_erreur, updated_at').eq('id', pieceId)
    .abortSignal(signal).maybeSingle())
  if (error) throw error
  return data ? propre(data) : null
}

/**
 * Le motif d'un échec, montré à la relecture avec « Réessayer ». Avec
 * `analyseLe` (l'`analyse_le` lu avant l'essai), l'écriture ne passe que si
 * la pièce n'a pas été analysée depuis : une analyse faite ailleurs
 * entre-temps ne passe pas en échec (`ignoree`, sans erreur).
 */
export async function noterErreurAnalyse(pieceId, message, options = {}) {
  let requete = supabase.from('edl_pieces').update({ analyse_erreur: messageErreurAnalyse(message) }).eq('id', pieceId)
  const conditionnee = 'analyseLe' in options
  if (conditionnee) requete = options.analyseLe ? requete.eq('analyse_le', options.analyseLe) : requete.is('analyse_le', null)
  const { data, error } = await requete.select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) {
    if (conditionnee) return { indisponible: false, ignoree: true }
    throw new Error(LECTURE_SEULE)
  }
  return { indisponible: false }
}

/** Valider, avec ou sans modification : modifier vaut validation. */
export async function validerElement(id, champs = {}) {
  const { data, error } = await supabase
    .from('edl_elements').update(champsValidation(champs)).eq('id', id).select('*')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { indisponible: false, element: data[0] }
}

export async function ecarterElement(id) {
  const { data, error } = await supabase.from('edl_elements').delete().eq('id', id).select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { indisponible: false }
}

/**
 * Élément ajouté à la main, déjà validé. Un envoi rejoué avec le même
 * identifiant ne crée pas de doublon (et un refus RLS d'insertion, lui,
 * rend bien une erreur).
 */
export async function ajouterElement(ligne) {
  const element = ligneElementMain(ligne)
  const { error } = await supabase
    .from('edl_elements').upsert(element, { onConflict: 'id', ignoreDuplicates: true })
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  return { indisponible: false, element }
}

/**
 * Fiche modifiée au bureau ; `valider` la marque relue. Sans la 082, la fiche
 * (colonne de la 077) s'enregistre quand même, sans sa marque : le retour
 * le dit par `indisponible`.
 */
export async function modifierFiche(pieceId, fiche, { valider = false } = {}) {
  let sansMarque = false
  const champs = valider ? { fiche, fiche_a_valider: false } : { fiche }
  const { data, error } = await ecrireAvecReplis(
    (l) => supabase.from('edl_pieces').update(l).eq('id', pieceId).select('id'),
    champs,
    [[analyseIndisponible, (l) => {
      sansMarque = true
      const copie = { ...l }
      delete copie.fiche_a_valider
      return copie
    }]],
  )
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { indisponible: sansMarque }
}

// ─── Liaisons et cotes à la relecture (migration 084) ───────────────────────
// Au bureau, en ligne : écrites directement, comme les éléments (le journal
// de la visite ne peut rien noter hors d'une visite). Sans la 084, le
// message le dit ; un refus (0 ligne) rend « Lecture seule ».

function erreurTraces(error) {
  if (tracesIndisponibles(error)) return Object.assign(new Error(MESSAGE_TRACES_INDISPONIBLES), { indisponible: true })
  return error
}

/** Valider une liaison ou une cote proposée ; `champs.valeur` change la valeur d'une cote (modifier vaut validation). */
export async function validerTrace(trace, champs = {}) {
  const { data, error } = await supabase
    .from('edl_traces').update(champsValidationTrace(trace, champs)).eq('id', trace.id).select('*')
  if (error) throw erreurTraces(error)
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { trace: data[0] }
}

/**
 * Écarter une proposition ou supprimer une trace validée : une liaison
 * proposée et toute trace validée disparaissent ; une cote dont seule la
 * valeur était proposée garde son tracé et perd la valeur (`ecartTrace`).
 */
export async function ecarterTrace(trace) {
  const ecart = ecartTrace(trace)
  const requete = ecart.supprimer
    ? supabase.from('edl_traces').delete().eq('id', trace.id)
    : supabase.from('edl_traces').update(ecart.champs).eq('id', trace.id)
  const { data, error } = await requete.select('id')
  if (error) throw erreurTraces(error)
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { supprimee: ecart.supprimer === true }
}
