// ─── Mémoire de l'appareil (IndexedDB) ───────────────────────────────────────
//
// Une visite de chantier se fait souvent sans réseau. Trois magasins :
//   · visites    — l'instantané du compte rendu emporté (un par CR) ;
//   · operations — les modifications qui attendent d'être envoyées ;
//   · fichiers   — les photos prises hors ligne, en attendant leur envoi.
//
// Pas de bibliothèque : IndexedDB brut, enveloppé dans des promesses. Tout
// échec (navigation privée, quota, stockage refusé) est remonté à l'appelant,
// qui retombe alors sur le fonctionnement en ligne.

const BASE = 'jga-visite'
const VERSION = 1
export const MAGASINS = { visites: 'visites', operations: 'operations', fichiers: 'fichiers' }

let ouverture = null

export function disponible() {
  return typeof indexedDB !== 'undefined'
}

function ouvrir() {
  if (ouverture) return ouverture
  ouverture = new Promise((resolve, reject) => {
    if (!disponible()) { reject(new Error('Ce navigateur ne garde rien hors ligne.')); return }
    const demande = indexedDB.open(BASE, VERSION)
    demande.onupgradeneeded = () => {
      const db = demande.result
      if (!db.objectStoreNames.contains(MAGASINS.visites)) db.createObjectStore(MAGASINS.visites, { keyPath: 'crId' })
      if (!db.objectStoreNames.contains(MAGASINS.operations)) {
        const magasin = db.createObjectStore(MAGASINS.operations, { keyPath: 'id' })
        magasin.createIndex('crId', 'crId')
      }
      if (!db.objectStoreNames.contains(MAGASINS.fichiers)) db.createObjectStore(MAGASINS.fichiers, { keyPath: 'id' })
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

// Opérations d'un compte rendu, dans leur ordre de création
export async function operationsDuCr(crId) {
  const toutes = await tout(MAGASINS.operations)
  return toutes.filter((o) => o.crId === crId).sort((a, b) => a.creeLe - b.creeLe)
}
