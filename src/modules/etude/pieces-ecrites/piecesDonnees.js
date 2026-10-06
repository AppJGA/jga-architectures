// ─── Pièces écrites : base et copie sur l'appareil ───────────────────────────
//
// La lecture des PDF se décide dans `piecesLogique.js`. Ici : les CCTP et
// leurs articles dans Supabase (migration 061), et une copie dans IndexedDB
// pour chercher pendant une visite sans réseau (base à part, `jga-pieces`,
// comme l'audio : la base de la visite garde sa version).

import { supabase } from '../../../core/supabase/client'

const PAQUET = 200 // articles par insertion

/**
 * Les CCTP d'une affaire et tous leurs articles.
 * @returns { disponible (migration 061 passée), pieces, articles }
 */
export async function listerPieces(affaireId) {
  const [{ data: pieces, error }, { data: articles, error: erreurArticles }] = await Promise.all([
    supabase.from('pieces_ecrites').select('*').eq('affaire_id', affaireId).order('lot_numero_lu', { nullsFirst: false }),
    // Toutes les colonnes : `styles` (migration 062) peut manquer encore
    supabase.from('pieces_articles').select('*').eq('affaire_id', affaireId).order('ordre'),
  ])
  if (error?.code === 'PGRST205' || error?.code === '42P01') return { disponible: false, pieces: [], articles: [] }
  if (error) throw error
  if (erreurArticles) throw erreurArticles
  // Chaque article porte le lot de sa pièce : la recherche filtre par lot
  const lotDe = new Map((pieces ?? []).map((p) => [p.id, p.lot_id]))
  return {
    disponible: true,
    pieces: pieces ?? [],
    articles: (articles ?? []).map((a) => ({ ...a, lot_id: lotDe.get(a.piece_id) ?? null })),
  }
}

/**
 * Enregistre un CCTP lu. Le CCTP déjà rattaché au même lot est remplacé
 * (ses articles partent avec lui). La pièce d'abord, puis ses articles par
 * paquets ; un échec en route retire la pièce incomplète.
 * @param lu résultat de `lirePiece` ({ lot, indice, articles, nbPages })
 */
export async function enregistrerPiece({ affaireId, lotId, lu, nomFichier, titre }) {
  if (lotId) {
    const { error } = await supabase.from('pieces_ecrites').delete().eq('affaire_id', affaireId).eq('lot_id', lotId)
    if (error) throw error
  }
  const { data: piece, error } = await supabase.from('pieces_ecrites').insert({
    affaire_id: affaireId, lot_id: lotId ?? null, type: 'cctp', titre,
    lot_numero_lu: lu.lot?.numero ?? null, lot_nom_lu: lu.lot?.nom ?? null,
    indice: lu.indice ?? null, nom_fichier: nomFichier ?? null,
    nb_pages: lu.nbPages ?? 0, nb_articles: lu.articles.length,
  }).select('id').single()
  if (error) throw error

  let lignes = lu.articles.map((a) => ({
    piece_id: piece.id, affaire_id: affaireId, ordre: a.ordre, numero: a.numero,
    niveau: a.niveau, titre: a.titre, texte: a.texte, page: a.page, styles: a.styles ?? [],
  }))
  for (let i = 0; i < lignes.length; i += PAQUET) {
    let { error: erreur } = await supabase.from('pieces_articles').insert(lignes.slice(i, i + PAQUET))
    // Sans la migration 062, pas de colonne `styles` : le texte part sans mise en forme
    if (erreur && /styles/.test(erreur.message ?? '') && ['PGRST204', '42703'].includes(erreur.code)) {
      lignes = lignes.map((l) => { const reste = { ...l }; delete reste.styles; return reste })
      ;({ error: erreur } = await supabase.from('pieces_articles').insert(lignes.slice(i, i + PAQUET)))
    }
    if (erreur) {
      await supabase.from('pieces_ecrites').delete().eq('id', piece.id)
      throw erreur
    }
  }
  return piece.id
}

export async function supprimerPiece(id) {
  const { error } = await supabase.from('pieces_ecrites').delete().eq('id', id)
  if (error) throw error
}

// ─── Copie sur l'appareil ────────────────────────────────────────────────────

const BASE = 'jga-pieces'
const MAGASIN = 'affaires'

function ouvrir() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Pas de stockage local')); return }
    const demande = indexedDB.open(BASE, 1)
    demande.onupgradeneeded = () => {
      if (!demande.result.objectStoreNames.contains(MAGASIN)) demande.result.createObjectStore(MAGASIN, { keyPath: 'affaireId' })
    }
    demande.onsuccess = () => resolve(demande.result)
    demande.onerror = () => reject(demande.error)
  })
}

function transaction(mode, action) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(MAGASIN, mode)
    const r = action(tx.objectStore(MAGASIN))
    tx.oncomplete = () => resolve(r?.result)
    tx.onerror = () => reject(tx.error)
  }))
}

/** Garde les CCTP d'une affaire sur l'appareil (visite sans réseau). */
export function garderCopie(affaireId, { pieces, articles }) {
  return transaction('readwrite', (m) => m.put({ affaireId, pieces, articles, copieLe: new Date().toISOString() }))
}

/** La copie gardée, ou null. */
export function lireCopie(affaireId) {
  return transaction('readonly', (m) => m.get(affaireId)).then((c) => c ?? null)
}

/**
 * Les CCTP de l'affaire : depuis la base (et la copie est rafraîchie), ou,
 * sans réseau, depuis la copie de l'appareil.
 * @returns { disponible, pieces, articles, horsLigne, copieLe }
 */
export async function piecesPourConsultation(affaireId) {
  try {
    const donnees = await listerPieces(affaireId)
    if (donnees.disponible) garderCopie(affaireId, donnees).catch(() => {})
    return { ...donnees, horsLigne: false }
  } catch (err) {
    const copie = await lireCopie(affaireId).catch(() => null)
    if (copie) return { disponible: true, pieces: copie.pieces, articles: copie.articles, horsLigne: true, copieLe: copie.copieLe }
    throw err
  }
}

/** Crée un lot de l'affaire (sans entreprise) et rend son identifiant. */
export async function creerLot(affaireId, { numero, nom }) {
  const { data, error } = await supabase.from('lots')
    .insert({ affaire_id: affaireId, numero, nom, ordre: numero }).select('id').single()
  if (error) throw error
  return data.id
}
