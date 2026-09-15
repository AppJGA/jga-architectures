import { REGLAGES_DEFAUT } from './rapportLogique'

const CLE_REGLAGES = (affaireId) => `jga-rapport-reglages-${affaireId}`

/** Réglages du rapport, mémorisés par affaire sur l'appareil (sans le destinataire) */
export function lireReglagesRapport(affaireId) {
  try {
    return { ...REGLAGES_DEFAUT, ...JSON.parse(localStorage.getItem(CLE_REGLAGES(affaireId)) ?? '{}'), destinataire: '' }
  } catch {
    return { ...REGLAGES_DEFAUT }
  }
}

export function ecrireReglagesRapport(affaireId, reglages) {
  const memo = { ...reglages }
  delete memo.destinataire
  try { localStorage.setItem(CLE_REGLAGES(affaireId), JSON.stringify(memo)) } catch { /* navigation privée */ }
}
