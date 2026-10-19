// ─── Pièces écrites : base et copie sur l'appareil ───────────────────────────
//
// La lecture des fichiers se décide dans `piecesLogique.js` et
// `dpgfLogique.js`. Ici : les pièces et les articles des CCTP (migration
// 061), les lignes des DPGF (073) dans Supabase, et une copie dans IndexedDB
// pour chercher pendant une visite sans réseau (base à part, `jga-pieces`,
// comme l'audio : la base de la visite garde sa version).

import { supabase } from '../../../core/supabase/client'

const PAQUET = 200 // articles ou lignes par insertion

const TABLE_ABSENTE = ['PGRST205', '42P01']

/**
 * Les pièces d'une affaire (CCTP et DPGF), les articles des CCTP et les
 * lignes des DPGF.
 * @returns { disponible (migration 061 passée), dpgfDisponible (073), pieces, articles, lignes }
 */
export async function listerPieces(affaireId) {
  const [{ data: pieces, error }, { data: articles, error: erreurArticles }, { data: lignes, error: erreurLignes }] = await Promise.all([
    supabase.from('pieces_ecrites').select('*').eq('affaire_id', affaireId).order('lot_numero_lu', { nullsFirst: false }),
    // Toutes les colonnes : `styles` (migration 062) peut manquer encore
    supabase.from('pieces_articles').select('*').eq('affaire_id', affaireId).order('ordre'),
    supabase.from('pieces_dpgf_lignes').select('*').eq('affaire_id', affaireId).order('ordre'),
  ])
  if (TABLE_ABSENTE.includes(error?.code)) return { disponible: false, dpgfDisponible: false, pieces: [], articles: [], lignes: [] }
  if (error) throw error
  if (erreurArticles) throw erreurArticles
  // Sans la migration 073, pas de DPGF : le module marche comme avant
  const dpgfDisponible = !TABLE_ABSENTE.includes(erreurLignes?.code)
  if (erreurLignes && dpgfDisponible) throw erreurLignes
  // Articles et lignes portent le lot de leur pièce : la recherche filtre par lot
  const lotDe = new Map((pieces ?? []).map((p) => [p.id, p.lot_id]))
  return {
    disponible: true,
    dpgfDisponible,
    pieces: pieces ?? [],
    articles: (articles ?? []).map((a) => ({ ...a, lot_id: lotDe.get(a.piece_id) ?? null })),
    lignes: (dpgfDisponible ? lignes ?? [] : []).map((l) => ({ ...l, lot_id: lotDe.get(l.piece_id) ?? null })),
  }
}

/**
 * Enregistre une pièce lue. La pièce **du même type** déjà rattachée au lot
 * est remplacée (ses articles ou lignes partent avec elle) : un DPGF ne
 * remplace jamais le CCTP de son lot. La pièce d'abord, puis son contenu par
 * paquets ; un échec en route retire la pièce incomplète.
 * @param type 'cctp' | 'dpgf'
 * @param lu CCTP : { lot, indice, nbPages, articles } ; DPGF : { lot, indice, nbPages, lignes }
 */
export async function enregistrerPiece({ affaireId, lotId, type = 'cctp', lu, nomFichier, titre }) {
  if (lotId) {
    const { error } = await supabase.from('pieces_ecrites').delete().eq('affaire_id', affaireId).eq('lot_id', lotId).eq('type', type)
    if (error) throw error
  }
  const contenu = type === 'dpgf' ? lu.lignes : lu.articles
  const { data: piece, error } = await supabase.from('pieces_ecrites').insert({
    affaire_id: affaireId, lot_id: lotId ?? null, type, titre,
    lot_numero_lu: lu.lot?.numero ?? null, lot_nom_lu: lu.lot?.nom ?? null,
    indice: lu.indice ?? null, nom_fichier: nomFichier ?? null,
    nb_pages: lu.nbPages ?? 0, nb_articles: contenu.length,
  }).select('id').single()
  if (error) throw error

  const echec = async (erreur) => {
    await supabase.from('pieces_ecrites').delete().eq('id', piece.id)
    throw erreur
  }

  if (type === 'dpgf') {
    const lignes = lu.lignes.map((l) => ({
      piece_id: piece.id, affaire_id: affaireId, ordre: l.ordre, numero: l.numero, article: l.article,
      niveau: l.niveau, designation: l.designation, unite: l.unite, quantite: l.quantite,
      quantite_texte: l.quantiteTexte, titre: l.titre, page: l.page,
    }))
    for (let i = 0; i < lignes.length; i += PAQUET) {
      const { error: erreur } = await supabase.from('pieces_dpgf_lignes').insert(lignes.slice(i, i + PAQUET))
      if (erreur) await echec(erreur)
    }
    return piece.id
  }

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
    if (erreur) await echec(erreur)
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

/** Garde les pièces écrites d'une affaire sur l'appareil (visite sans réseau). */
export function garderCopie(affaireId, { pieces, articles, lignes = [] }) {
  return transaction('readwrite', (m) => m.put({ affaireId, pieces, articles, lignes, copieLe: new Date().toISOString() }))
}

/** La copie gardée, ou null. */
export function lireCopie(affaireId) {
  return transaction('readonly', (m) => m.get(affaireId)).then((c) => c ?? null)
}

/**
 * Les CCTP de l'affaire : depuis la base (et la copie est rafraîchie), ou,
 * sans réseau, depuis la copie de l'appareil.
 * @returns { disponible, pieces, articles, lignes, horsLigne, copieLe }
 */
export async function piecesPourConsultation(affaireId) {
  try {
    const donnees = await listerPieces(affaireId)
    if (donnees.disponible) garderCopie(affaireId, donnees).catch(() => {})
    return { ...donnees, horsLigne: false }
  } catch (err) {
    const copie = await lireCopie(affaireId).catch(() => null)
    // Une copie gardée avant les DPGF n'a pas de lignes
    if (copie) return { disponible: true, pieces: copie.pieces, articles: copie.articles, lignes: copie.lignes ?? [], horsLigne: true, copieLe: copie.copieLe }
    throw err
  }
}

/**
 * Crée un lot de l'affaire (sans entreprise) et rend son identifiant. Le
 * numéro saisi (« 060 », migration 063) part s'il y en a un ; sans la
 * migration, le lot est créé sans lui.
 */
export async function creerLot(affaireId, { numero, numero_affiche = null, nom }) {
  const inserer = (avecTexte) => supabase.from('lots')
    .insert({ affaire_id: affaireId, numero, nom, ordre: numero, ...(avecTexte && numero_affiche ? { numero_affiche } : {}) })
    .select('id').single()
  let { data, error } = await inserer(true)
  if (error && /numero_affiche/.test(error.message ?? '')) ({ data, error } = await inserer(false))
  if (error) throw error
  return data.id
}
