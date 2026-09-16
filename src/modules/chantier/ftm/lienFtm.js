// ─── Lien entre une remarque (ou une réserve) et une fiche de travaux ────────
//
// Une FTM garde l'origine dont elle est issue (migration 048) : le suivi de la
// remarque, stable d'une visite à l'autre, ou la réserve d'OPR.

export const DECISIONS_FTM = {
  accepte: { libelle: 'Acceptée', couleur: '#2A8A4E', fond: 'rgba(42,138,78,0.12)' },
  renonce: { libelle: 'Renoncée', couleur: '#5E5854', fond: '#F1EFE8' },
  refuse: { libelle: 'Refusée', couleur: '#B8412C', fond: 'rgba(184,65,44,0.10)' },
  en_attente: { libelle: 'En attente', couleur: '#C2610C', fond: 'rgba(217,119,6,0.12)' },
}

export function infosDecisionFtm(ftm) {
  return DECISIONS_FTM[ftm?.decision] ?? DECISIONS_FTM.en_attente
}

/** « FTM n°3 · En attente » */
export function resumeFtm(ftm) {
  const d = infosDecisionFtm(ftm)
  return { texte: `FTM n°${ftm.numero} · ${d.libelle}`, ...d }
}

export function ftmDeRemarque(ftms, remarque) {
  const cle = remarque?.suivi_id
  if (!cle) return null
  return (ftms ?? []).find((f) => f.source_suivi_id === cle) ?? null
}

export function ftmDeReserve(ftms, reserve) {
  if (!reserve?.id) return null
  return (ftms ?? []).find((f) => f.source_reserve_id === reserve.id) ?? null
}

export function libelleSourceRemarque(remarque, cr) {
  return `Remarque${remarque?.numero != null ? ` n°${remarque.numero}` : ''}${cr?.numero != null ? ` (CR n°${String(cr.numero).padStart(2, '0')})` : ''}`
}

export function libelleSourceReserve(reserve, visite) {
  const type = visite?.type === 'levee' ? 'Levée' : 'OPR'
  return `Réserve${reserve?.numero != null ? ` n°${reserve.numero}` : ''}${visite?.numero != null ? ` (${type} n°${String(visite.numero).padStart(2, '0')})` : ''}`
}

/**
 * Champs d'une FTM créée depuis une remarque ou une réserve. L'intitulé reprend
 * le début du texte ; l'origine « aléas » est le cas le plus courant sur le
 * chantier et reste modifiable dans la fiche.
 */
export function ftmDepuisElement({ type, element, contexte, lotId }) {
  const texte = String(element?.description ?? '').trim()
  const intitule = texte.length > 70 ? `${texte.slice(0, 67).trimEnd()}…` : texte || 'Travaux modificatifs'
  return {
    lot_id: lotId ?? element?.lot_id ?? null,
    intitule,
    description: texte,
    origine: 'aleas',
    decision: 'en_attente',
    source_type: type,
    source_libelle: type === 'remarque' ? libelleSourceRemarque(element, contexte) : libelleSourceReserve(element, contexte),
    ...(type === 'remarque' ? { source_suivi_id: element.suivi_id ?? null } : { source_reserve_id: element.id }),
  }
}
