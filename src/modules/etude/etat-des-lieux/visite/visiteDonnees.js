// ─── L'état des lieux emporté pour la visite ─────────────────────────────────
//
// Tout ce que la visite affiche, lu d'un coup et gardé sur l'appareil
// (`preparerVisite`) : étages, pièces, visites, points, photos, entrées dans
// les pièces. Étages et pièces en colonnes nommées : ni les textes du plan
// ni la relecture (lourds, inutiles en visite) ; toutes existent depuis la
// 077, la visite ne dépend donc d'aucune colonne plus récente. Lectures
// fraîches seulement : l'alias `synchro_id` les exclut de la mémoire du
// service worker (vite.config.js), sans quoi un réseau lent ferait garder un
// état ancien. Pagination par identifiant (1 000 lignes par page) : un grand
// bâtiment dépasse vite 1 000 points.

import { supabase } from '../../../../core/supabase/client'
import { edlIndisponible } from '../edlConstantes'
import { MAGASINS_EDL, ecrire, lire, disponible } from './baseEdl'
import { sousVerrouEdl } from './synchroEdl'

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

async function toutes(table, colonnes, filtrer) {
  const lignes = []
  let dernier = null
  for (;;) {
    let requete = filtrer(supabase.from(table).select(colonnes)).order('id').limit(PAGE)
    if (dernier) requete = requete.gt('id', dernier)
    const { data, error } = await requete
    if (error) throw error
    lignes.push(...(data ?? []).map(propre))
    if (!data || data.length < PAGE) return lignes
    dernier = data[data.length - 1].id
  }
}

export async function lireToutEdl(affaireId) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  let visites
  try {
    visites = await toutes('edl_visites', FRAIS, deLAffaire)
  } catch (err) {
    if (edlIndisponible(err)) return { indisponible: true }
    throw err
  }
  const { data: etat, error } = await supabase.from('edl_etats').select(COLONNES_ETAT).eq('affaire_id', affaireId).maybeSingle()
  if (error) throw error
  const [niveaux, pieces, points, photos, entrees] = await Promise.all([
    toutes('edl_niveaux', COLONNES_NIVEAUX, deLAffaire),
    toutes('edl_pieces', COLONNES_PIECES, deLAffaire),
    toutes('edl_points', FRAIS, deLAffaire),
    toutes('edl_photos', FRAIS, deLAffaire),
    toutes('edl_evenements', 'synchro_id:id, id, visite_id, niveau_id, piece_id, type, le', (q) => deLAffaire(q).eq('type', 'entree')),
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
    },
  }
}

/** Lit tout et le garde sur l'appareil ; une erreur (réseau) laisse l'ancien instantané en place. */
export function preparerVisite(affaireId) {
  return sousVerrouEdl(async () => {
    const lu = await lireToutEdl(affaireId)
    if (lu.indisponible) return { indisponible: true }
    const prepareLe = Date.now()
    await ecrire(MAGASINS_EDL.instantanes, { affaireId, donnees: lu.donnees, prepareLe })
    return { indisponible: false, prepareLe }
  })
}

export async function instantaneGarde(affaireId) {
  if (!disponible()) return null
  return (await lire(MAGASINS_EDL.instantanes, affaireId).catch(() => null)) ?? null
}
