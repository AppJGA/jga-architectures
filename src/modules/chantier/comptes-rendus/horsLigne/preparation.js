// ─── « Préparer pour le chantier » ───────────────────────────────────────────
//
// Pour qu'une affaire reste utilisable sans réseau, chaque page utile doit
// avoir été ouverte une fois avec du réseau : c'est ce qui la fait garder
// (service worker) et, pour la visite en mode Visite, ce qui l'emporte
// (remarques, photos, plans). Plutôt que de recopier ici les requêtes de
// chaque page — elles changeraient sans que la préparation suive —, la
// préparation ouvre les vraies pages, une à une, dans un cadre caché : les
// requêtes sont exactement celles que la page fera sans réseau.

import { etapesPreparation, pageCalme } from './preparationLogique'
import { MAGASINS, lire } from './baseLocale'
import { listerPieces, garderCopie } from '../../../etude/pieces-ecrites/piecesDonnees'

const CLE = (affaireId) => `jga.preparation.${affaireId}`
const ATTENTE_MAX_MS = 45_000

export function lirePreparation(affaireId) {
  try { return JSON.parse(localStorage.getItem(CLE(affaireId)) ?? 'null') } catch { return null }
}

function ecrirePreparation(affaireId, valeur) {
  try { localStorage.setItem(CLE(affaireId), JSON.stringify(valeur)) } catch { /* navigation privée */ }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

// Ouvre une page dans le cadre et attend qu'elle ait fini de charger
async function ouvrirPage(cadre, chemin) {
  const ouverture = Date.now()
  await new Promise((resolve) => {
    cadre.addEventListener('load', resolve, { once: true })
    cadre.src = chemin
  })
  let requetes = -1
  let changement = Date.now()
  while (Date.now() - ouverture < ATTENTE_MAX_MS) {
    await pause(400)
    let n
    try { n = cadre.contentWindow.performance.getEntriesByType('resource').length } catch { n = 0 }
    if (n !== requetes) { requetes = n; changement = Date.now() }
    if (pageCalme({ requetes, depuisChangement: Date.now() - changement, depuisOuverture: Date.now() - ouverture })) return true
  }
  return false
}

/**
 * Prépare l'affaire pour le chantier.
 * @param cr visite en cours, sinon la dernière (ou null)
 * @param surEtape ({ index, total, libelle }) → avancement à l'écran
 * @returns la préparation enregistrée { le, crId, numero, echecs }
 */
export async function preparerChantier({ affaireId, cr = null, surEtape }) {
  const etapes = etapesPreparation(affaireId, cr?.id ?? null)
  const debut = Date.now()
  const echecs = []
  const cadre = document.createElement('iframe')
  cadre.setAttribute('aria-hidden', 'true')
  cadre.tabIndex = -1
  // Hors de l'écran mais à taille d'écran : les pages se dessinent comme
  // d'habitude (un cadre de 0 px pourrait ne pas tout charger)
  Object.assign(cadre.style, { position: 'fixed', left: '-12000px', top: '0', width: '1280px', height: '900px', border: '0', visibility: 'hidden', pointerEvents: 'none' })
  document.body.appendChild(cadre)
  try {
    for (const [index, etape] of etapes.entries()) {
      surEtape?.({ index, total: etapes.length, libelle: etape.libelle })
      const chargee = await ouvrirPage(cadre, etape.chemin)
      if (etape.visite) {
        // La visite est emportée quand son instantané est plus récent que le début
        const emportee = await lire(MAGASINS.visites, cr.id).catch(() => null)
        if (!emportee || (emportee.prepareLe ?? 0) < debut) echecs.push(etape.libelle)
      } else if (etape.cctp) {
        // La copie des CCTP pour la recherche hors ligne, attendue jusqu'au bout
        try {
          const donnees = await listerPieces(affaireId)
          if (donnees.disponible) await garderCopie(affaireId, donnees)
        } catch { echecs.push(etape.libelle) }
      } else if (!chargee) {
        echecs.push(etape.libelle)
      }
    }
  } finally {
    cadre.remove()
  }
  const preparation = { le: Date.now(), crId: cr?.id ?? null, numero: cr?.numero ?? null, echecs }
  ecrirePreparation(affaireId, preparation)
  surEtape?.({ index: etapes.length, total: etapes.length, libelle: 'Terminé' })
  return preparation
}
