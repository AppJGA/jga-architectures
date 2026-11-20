// ─── L'état des lieux emporté pour la visite ─────────────────────────────────
//
// Tout ce que la visite affiche, lu d'un coup et gardé sur l'appareil
// (`preparerVisite`) : étages, pièces, visites, points, photos, entrées dans
// les pièces, liaisons et cotes (`traces`, 084). Étages et pièces en colonnes nommées : ni les textes du plan
// ni la relecture (lourds, inutiles en visite) ; toutes existent depuis la
// 077, sauf `chemin_vecteurs` (081, plan vectoriel), relu sans elle quand la
// base ne l'a pas : la visite affiche alors l'image. Lectures
// fraîches seulement : l'alias `synchro_id` les exclut de la mémoire du
// service worker (vite.config.js), sans quoi un réseau lent ferait garder un
// état ancien. Pagination par identifiant (1 000 lignes par page) : un grand
// bâtiment dépasse vite 1 000 points.
//
// Chaque requête est bornée (`bornerDelai`) : ces lectures échappent au
// repli de 6 s du service worker, et un réseau faible (l'appareil se croit en
// ligne, rien ne répond) tenait le verrou de l'envoi près d'une minute.

import { supabase } from '../../../../core/supabase/client'
import { edlIndisponible, colonnesVecteursManquantes } from '../edlConstantes'
import { MAGASINS_EDL, ecrire } from './baseEdl'
import { sousVerrouEdl } from './synchroEdl'
import { bornerDelai, DELAI_LECTURE_MS } from './visiteLogique'
import { analyseIndisponible } from '../analyse/analyseDonneesLogique'
import { lectureTraces } from '../tracesEdl'

const FRAIS = 'synchro_id:id, *'
const COLONNES_ETAT = 'synchro_id:id, id, affaire_id'
const COLONNES_NIVEAUX = 'synchro_id:id, id, etat_id, affaire_id, nom, ordre, chemin, chemin_apercu, largeur, hauteur, cadrage'
const COLONNES_PIECES = 'synchro_id:id, id, niveau_id, affaire_id, nom, numero, contour, surface_lue, hsp_lue, ordre, fiche'
const PAGE = 1000

// L'alias ne doit pas repartir dans une écriture (point rendu par « Annuler »)
const propre = (ligne) => {
  const copie = { ...ligne }
  delete copie.synchro_id
  return copie
}

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

// État de l'analyse (migration 082) emporté avec les pièces : sans réseau,
// la visite garde les couleurs et le pense-bête de la dernière lecture.
// Relu sans lui quand la base n'a pas la 082.
async function lirePieces(filtrer, delaiMs) {
  try {
    return await toutes('edl_pieces', `${COLONNES_PIECES}, analyse_le, analyse_erreur, fiche_a_valider`, filtrer, delaiMs)
  } catch (err) {
    if (!analyseIndisponible(err)) throw err
    return toutes('edl_pieces', COLONNES_PIECES, filtrer, delaiMs)
  }
}

async function lireNiveaux(filtrer, delaiMs) {
  try {
    return await toutes('edl_niveaux', `${COLONNES_NIVEAUX}, chemin_vecteurs`, filtrer, delaiMs)
  } catch (err) {
    if (!colonnesVecteursManquantes(err)) throw err
    return toutes('edl_niveaux', COLONNES_NIVEAUX, filtrer, delaiMs)
  }
}

export async function lireToutEdl(affaireId, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  let visites
  try {
    visites = await toutes('edl_visites', FRAIS, deLAffaire, delaiMs)
  } catch (err) {
    if (edlIndisponible(err)) return { indisponible: true }
    throw err
  }
  const { data: etat, error } = await bornerDelai(
    (signal) => supabase.from('edl_etats').select(COLONNES_ETAT).eq('affaire_id', affaireId).abortSignal(signal).maybeSingle(),
    delaiMs,
  )
  if (error) throw error
  // Traces (084) lues à part : sans la migration, aucune trace et
  // `tracesDisponibles` faux (« Relier » et « Coter » masqués), le reste intact
  const [niveaux, pieces, points, photos, entrees, { traces, tracesDisponibles }] = await Promise.all([
    lireNiveaux(deLAffaire, delaiMs),
    lirePieces(deLAffaire, delaiMs),
    toutes('edl_points', FRAIS, deLAffaire, delaiMs),
    toutes('edl_photos', FRAIS, deLAffaire, delaiMs),
    toutes('edl_evenements', 'synchro_id:id, id, visite_id, niveau_id, piece_id, type, le', (q) => deLAffaire(q).eq('type', 'entree'), delaiMs),
    lectureTraces(() => toutes('edl_traces', FRAIS, deLAffaire, delaiMs)),
  ])
  return {
    indisponible: false,
    donnees: {
      etat: etat ? propre(etat) : null,
      niveaux: niveaux.sort((a, b) => a.ordre - b.ordre),
      pieces: pieces.sort((a, b) => a.ordre - b.ordre),
      visites,
      points: points.sort((a, b) => a.numero - b.numero),
      photos,
      entrees,
      traces,
      tracesDisponibles,
    },
  }
}

/**
 * Lit tout et le garde sur l'appareil ; une erreur (réseau, délai dépassé)
 * laisse l'ancien instantané en place. L'écriture reste sous le verrou : un
 * envoi ne peut pas reporter une opération dans un instantané qu'on écrase.
 */
export function preparerVisite(affaireId, options) {
  return sousVerrouEdl(async () => {
    const lu = await lireToutEdl(affaireId, options)
    if (lu.indisponible) return { indisponible: true }
    const prepareLe = Date.now()
    await ecrire(MAGASINS_EDL.instantanes, { affaireId, donnees: lu.donnees, prepareLe })
    return { indisponible: false, prepareLe }
  })
}
