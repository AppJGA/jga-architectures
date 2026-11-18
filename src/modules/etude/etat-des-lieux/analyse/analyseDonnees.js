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
  ligneElementMain, champsPieceAnalysee, messageErreurAnalyse,
} from './analyseDonneesLogique'
import { memeFiche } from './analyseEdlLogique'

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
 * la pièce, ses éléments déjà validés.
 */
export async function lireFriseAnalyse(affaireId, pieceId, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  try {
    const [pieces, evenements, points, elementsValides] = await Promise.all([
      toutes('edl_pieces', 'synchro_id:id, *', (q) => q.eq('id', pieceId), delaiMs),
      toutes('edl_evenements', 'synchro_id:id, *', deLAffaire, delaiMs),
      toutes('edl_points', 'synchro_id:id, *', deLAffaire, delaiMs),
      toutes('edl_elements', 'synchro_id:id, *', (q) => q.eq('piece_id', pieceId).eq('a_valider', false), delaiMs),
    ])
    const piece = pieces[0] ?? null
    // `select('*')` sans la 082 ne dit rien : la colonne manquerait en silence
    if (piece && !('analyse_le' in piece)) return { ...INDISPONIBLE }
    const visites = [...new Set(evenements.filter((e) => e.piece_id === pieceId).map((e) => e.visite_id))]
    const enregistrements = visites.length
      ? await toutes('edl_enregistrements', 'synchro_id:id, *', (q) => deLAffaire(q).in('visite_id', visites), delaiMs)
      : []
    return { indisponible: false, piece, evenements, points, enregistrements, elementsValides }
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
 * La fiche relue avec l'écriture doit être celle de la frise : modifiée
 * entre-temps au bureau, la demande serait déjà fausse ('relire', rien n'est
 * payé).
 *
 * Ce n'est pas un bail : pendant tout l'appel d'un appareil, un autre peut
 * encore réserver la même pièce et payer le sien. Un seul des deux résultats
 * s'écrit (la « prise » d'ecrireResultatAnalyse). Empêcher le second
 * paiement demanderait une colonne de bail dans la base.
 * @returns { etat: 'ok' | 'deja' | 'relire' | 'refus' | 'indisponible', updatedAt }
 */
export async function reserverAnalyse(piece) {
  let requete = supabase.from('edl_pieces').update({ analyse_erreur: piece.analyse_erreur ?? null }).eq('id', piece.id)
  requete = piece.analyse_le ? requete.eq('analyse_le', piece.analyse_le) : requete.is('analyse_le', null)
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
    .from('edl_pieces').select('synchro_id:id, analyse_le').eq('id', piece.id).abortSignal(signal).maybeSingle())
  if (erreurRelue) throw erreurRelue
  if (!relue) return { etat: 'deja' }
  const heure = (v) => (v ? Date.parse(v) : null)
  return { etat: heure(relue.analyse_le) === heure(piece.analyse_le) ? 'refus' : 'deja' }
}

/** Upsert par identifiant du morceau : une transcription rejouée réécrit la même ligne. */
export async function enregistrerTranscription(ligne) {
  const { data, error } = await supabase
    .from('edl_enregistrements').upsert(ligneEnregistrement(ligne), { onConflict: 'id' }).select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { indisponible: false }
}

/**
 * Résultat d'une analyse pour une pièce. Rejouable avec le même résultat :
 * seules les propositions de Claude encore à valider sont remplacées, les
 * éléments validés (ou ajoutés à la main) ne sont jamais touchés. Pas de
 * transaction : un arrêt en route laisse `analyse_le` inchangé, la pièce
 * reste à analyser et la passe suivante refait tout.
 *
 * Avec `siMisAJour` (updated_at rendu par la réservation), l'ordre est :
 * 1. la **prise** — écriture à blanc conditionnée sur `siMisAJour`, qui rend
 *    le nouvel updated_at : si la pièce a bougé (autre appareil, bureau),
 *    rien n'est écrit, pas même un élément (`conflit`, `elementsEcrits:
 *    false`). Deux appareils ne peuvent pas prendre la même version : les
 *    éléments de l'un ne côtoient jamais la fiche de l'autre ;
 * 2. les éléments ;
 * 3. la pièce, conditionnée sur l'updated_at de la prise (`conflit`,
 *    `elementsEcrits: true` si elle a bougé entre-temps).
 * `attendu` : l'updated_at sur lequel portait la condition ratée.
 * `elementsEcrits` en entrée : seconde écriture après un conflit, les
 * éléments sont déjà en place.
 */
export async function ecrireResultatAnalyse({
  affaireId, piece, fiche, elements, analyseLe = new Date(), siMisAJour = undefined, garderFiche = false, elementsEcrits = false,
}) {
  const champs = champsPieceAnalysee(fiche, analyseLe)
  // Fiche modifiée ou validée au bureau pendant l'appel : elle reste, et sa marque aussi
  if (garderFiche) {
    delete champs.fiche
    delete champs.fiche_a_valider
  }
  if (elementsEcrits) return ecrirePieceAnalysee(piece.id, champs, siMisAJour, { remplaces: 0, ajoutes: 0, elementsEcrits: true })

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
