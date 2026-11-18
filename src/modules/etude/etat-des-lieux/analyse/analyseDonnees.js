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
 */
export async function ecrireResultatAnalyse({ affaireId, piece, fiche, elements, analyseLe = new Date() }) {
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

  const { data, error } = await supabase
    .from('edl_pieces').update(champsPieceAnalysee(fiche, analyseLe)).eq('id', piece.id).select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
  return { indisponible: false, remplaces: supprime.data?.length ?? 0, ajoutes: lignes.length }
}

/** Le motif d'un échec, montré à la relecture avec « Réessayer ». */
export async function noterErreurAnalyse(pieceId, message) {
  const { data, error } = await supabase
    .from('edl_pieces').update({ analyse_erreur: messageErreurAnalyse(message) }).eq('id', pieceId).select('id')
  if (error) {
    if (analyseIndisponible(error)) return INDISPONIBLE
    throw error
  }
  if (!data?.length) throw new Error(LECTURE_SEULE)
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
