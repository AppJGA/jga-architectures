// ─── Mémoire de l'appareil pour la visite d'un état des lieux ────────────────
//
// Base à part (`jga-edl`), comme `jga-audio` : celle des CR (`jga-visite`)
// n'a pas à changer de version. Trois magasins :
//   · instantanes — l'état des lieux emporté (un par affaire) ;
//   · operations  — les gestes qui attendent d'être envoyés ;
//   · fichiers    — les photos prises, en attendant leur envoi.
// Les images des étages restent dans la mémoire des visites de CR
// (`horsLigne/images.js`), relues par leur chemin comme au lot 1.

const BASE = 'jga-edl'
const VERSION = 1
export const MAGASINS_EDL = { instantanes: 'instantanes', operations: 'operations', fichiers: 'fichiers' }

let ouverture = null

export function disponible() {
  return typeof indexedDB !== 'undefined'
}

function ouvrir() {
  if (ouverture) return ouverture
  ouverture = new Promise((resolve, reject) => {
    if (!disponible()) { reject(new Error('Ce navigateur ne garde rien sur l’appareil.')); return }
    const demande = indexedDB.open(BASE, VERSION)
    demande.onupgradeneeded = () => {
      const db = demande.result
      if (!db.objectStoreNames.contains(MAGASINS_EDL.instantanes)) db.createObjectStore(MAGASINS_EDL.instantanes, { keyPath: 'affaireId' })
      if (!db.objectStoreNames.contains(MAGASINS_EDL.operations)) {
        db.createObjectStore(MAGASINS_EDL.operations, { keyPath: 'id' }).createIndex('affaireId', 'affaireId')
      }
      if (!db.objectStoreNames.contains(MAGASINS_EDL.fichiers)) db.createObjectStore(MAGASINS_EDL.fichiers, { keyPath: 'id' })
    }
    demande.onsuccess = () => resolve(demande.result)
    demande.onerror = () => reject(demande.error)
    demande.onblocked = () => reject(new Error('Une autre fenêtre de l’application bloque la mise à jour du stockage.'))
  })
  // Un échec ne doit pas condamner les tentatives suivantes
  ouverture.catch(() => { ouverture = null })
  return ouverture
}

function transaction(magasin, mode, action) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(magasin, mode)
    const resultat = action(tx.objectStore(magasin))
    tx.oncomplete = () => resolve(resultat?.result ?? resultat)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const lire = (magasin, cle) => transaction(magasin, 'readonly', (m) => m.get(cle))
export const ecrire = (magasin, valeur) => transaction(magasin, 'readwrite', (m) => m.put(valeur))
export const effacer = (magasin, cle) => transaction(magasin, 'readwrite', (m) => m.delete(cle))

export function tout(magasin) {
  return transaction(magasin, 'readonly', (m) => m.getAll()).then((r) => r ?? [])
}

/** Les gestes d'une affaire, dans leur ordre de création. */
export async function operationsDeLAffaire(affaireId) {
  if (!disponible()) return []
  const ops = await transaction(MAGASINS_EDL.operations, 'readonly', (m) => m.index('affaireId').getAll(affaireId)).then((r) => r ?? [])
  return ops.sort((a, b) => a.creeLe - b.creeLe)
}

/**
 * L'instantané d'une affaire et ses gestes, lus dans une même transaction.
 * Report dans l'instantané puis retrait de la file sont deux écritures
 * successives : une lecture d'un seul tenant voit l'un des états qu'elles
 * traversent, jamais l'ancien instantané avec la file déjà vidée (et
 * l'application d'une opération est idempotente). D'où une vue cohérente sans
 * attendre le verrou de l'envoi, qu'un réseau faible peut tenir longtemps.
 */
export function instantaneEtOperations(affaireId) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([MAGASINS_EDL.instantanes, MAGASINS_EDL.operations], 'readonly')
    const garde = tx.objectStore(MAGASINS_EDL.instantanes).get(affaireId)
    const ops = tx.objectStore(MAGASINS_EDL.operations).index('affaireId').getAll(affaireId)
    tx.oncomplete = () => resolve([garde.result ?? null, (ops.result ?? []).sort((a, b) => a.creeLe - b.creeLe)])
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

/**
 * Tout ce que l'appareil garde de l'état des lieux d'une affaire (instantané,
 * gestes en attente, photos de ces gestes), effacé d'un seul tenant : après
 * « Remplacer les plans », ces gestes visent des lignes qui n'existent plus.
 */
export function oublierAffaire(affaireId, idsPhotos) {
  if (!disponible()) return Promise.resolve()
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([MAGASINS_EDL.instantanes, MAGASINS_EDL.operations, MAGASINS_EDL.fichiers], 'readwrite')
    tx.objectStore(MAGASINS_EDL.instantanes).delete(affaireId)
    const ops = tx.objectStore(MAGASINS_EDL.operations)
    const cles = ops.index('affaireId').getAllKeys(affaireId)
    cles.onsuccess = () => { for (const cle of cles.result ?? []) ops.delete(cle) }
    for (const id of idsPhotos ?? []) tx.objectStore(MAGASINS_EDL.fichiers).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}
