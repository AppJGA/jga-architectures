// ─── Enregistrement gardé sur l'appareil ─────────────────────────────────────
//
// Deux niveaux, pour qu'une page fermée par Safari ne perde presque rien :
// - chaque **tranche** d'une seconde est rangée dès qu'elle arrive ;
// - chaque **morceau** terminé (5 minutes) est rangé, puis ses tranches
//   effacées.
// Au retour, les tranches restées seules sont recollées en un morceau
// « récupéré » (`recupererMorceaux`). Base à part (`jga-audio`) : celle de la
// visite hors ligne (`baseLocale.js`) n'a pas à changer de version pour cela.

import { regrouperTranches } from './enregistrementLogique'

const NOM = 'jga-audio'
const MORCEAUX = 'morceaux'
const TRANCHES = 'tranches'

let ouverture = null
function base() {
  if (!ouverture) {
    ouverture = new Promise((resoudre, rejeter) => {
      const req = indexedDB.open(NOM, 2)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const nom of [MORCEAUX, TRANCHES]) {
          if (!db.objectStoreNames.contains(nom)) {
            db.createObjectStore(nom, { keyPath: 'id' }).createIndex('enregistrement', 'enregistrementId')
          }
        }
      }
      req.onsuccess = () => resoudre(req.result)
      req.onerror = () => { ouverture = null; rejeter(req.error) }
    })
  }
  return ouverture
}

function transaction(magasin, mode, travail) {
  return base().then((db) => new Promise((resoudre, rejeter) => {
    const tx = db.transaction(magasin, mode)
    const resultat = travail(tx.objectStore(magasin))
    tx.oncomplete = () => resoudre(resultat?.result ?? resultat)
    tx.onerror = () => rejeter(tx.error)
    tx.onabort = () => rejeter(tx.error)
  }))
}

const parEnregistrement = (magasin, id) =>
  transaction(magasin, 'readonly', (m) => m.index('enregistrement').getAll(id)).then((l) => l ?? [])

export function rangerTranche(tranche) {
  return transaction(TRANCHES, 'readwrite', (m) => { m.put(tranche) }).then(() => undefined)
}

/** Range un morceau terminé et efface ses tranches, devenues inutiles. */
export async function rangerMorceau(morceau) {
  await transaction(MORCEAUX, 'readwrite', (m) => { m.put(morceau) })
  const tranches = await parEnregistrement(TRANCHES, morceau.enregistrementId)
  const siennes = tranches.filter((t) => t.rang === morceau.rang)
  if (siennes.length) await transaction(TRANCHES, 'readwrite', (m) => { for (const t of siennes) m.delete(t.id) })
}

export async function lireMorceaux(enregistrementId) {
  return (await parEnregistrement(MORCEAUX, enregistrementId)).sort((a, b) => a.rang - b.rang)
}

/**
 * Tranches restées sans morceau (page fermée en plein enregistrement) :
 * recollées en morceaux « récupérés », rangés comme les autres.
 * @returns les morceaux récupérés
 */
export async function recupererMorceaux(enregistrementId) {
  const tranches = await parEnregistrement(TRANCHES, enregistrementId)
  // La dernière tranche d'un morceau peut s'écrire juste après lui : ce
  // morceau-là est complet, ses restes ne se recollent pas
  const complets = new Set((await parEnregistrement(MORCEAUX, enregistrementId)).map((m) => m.rang))
  const recuperes = []
  for (const g of regrouperTranches(tranches).filter((x) => !complets.has(x.rang))) {
    const blob = new Blob(g.tranches.map((t) => t.blob), { type: g.type })
    const morceau = {
      id: crypto.randomUUID(), enregistrementId, rang: g.rang, debut: g.debut,
      duree_s: g.duree_s, type: g.type, taille: blob.size, blob, recupere: true,
    }
    await rangerMorceau(morceau)
    recuperes.push(morceau)
  }
  // Appelé hors enregistrement : tout ce qui reste est inutilisable
  const restes = await parEnregistrement(TRANCHES, enregistrementId)
  if (restes.length) await transaction(TRANCHES, 'readwrite', (m) => { for (const t of restes) m.delete(t.id) })
  return recuperes
}

export async function dernierEnregistrement() {
  const [morceaux, tranches] = await Promise.all([
    transaction(MORCEAUX, 'readonly', (m) => m.getAll()),
    transaction(TRANCHES, 'readonly', (m) => m.getAll()),
  ])
  const tous = [...(morceaux ?? []), ...(tranches ?? [])]
  if (!tous.length) return null
  return tous.reduce((a, b) => (b.debut > a.debut ? b : a)).enregistrementId
}

export async function effacerEnregistrement(enregistrementId) {
  for (const magasin of [MORCEAUX, TRANCHES]) {
    const lignes = await parEnregistrement(magasin, enregistrementId)
    if (lignes.length) await transaction(magasin, 'readwrite', (m) => { for (const x of lignes) m.delete(x.id) })
  }
}
