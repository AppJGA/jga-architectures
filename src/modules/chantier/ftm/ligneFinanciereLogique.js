// ─── Une fiche de travaux modificatifs pèse sur le budget : logique pure ────
//
// Toute FTM, d'où qu'elle vienne (module FTM, remarque de compte rendu,
// réserve d'OPR), a sa ligne dans le suivi financier du chantier : c'est là
// que l'argent se lit. La ligne porte la référence de la fiche, son montant —
// plus-value comme moins-value — et l'état de la décision.
//
// Les deux restent liés : `ftm.ligne_financiere_id` d'un côté,
// `lignes_financieres.ftm_id` de l'autre, ce qui permet à l'écran financier
// d'ouvrir la fiche d'un clic.

// L'origine de la fiche décide de la colonne du tableau financier
const CATEGORIES = { moe: 'adaptation_moe', mo: 'demande_mo', aleas: 'aleas' }
// La décision décide de l'état de la ligne
const STATUTS = { accepte: 'avenant_signe', renonce: 'refuse', en_attente: 'en_attente' }

export function referenceFtm(numero) {
  return `FTM-${String(numero).padStart(3, '0')}`
}

/** Ligne financière décrivant une fiche. */
export function ligneDeFtm(ftm, affaireId) {
  const ref = referenceFtm(ftm?.numero)
  const description = String(ftm?.description ?? '').trim()
  return {
    affaire_id: affaireId ?? ftm?.affaire_id ?? null,
    lot_id: ftm?.lot_id ?? null,
    categorie: CATEGORIES[ftm?.origine] ?? 'adaptation_moe',
    // La référence est portée par l'étiquette de la ligne : la répéter ici
    // ne ferait que tronquer la description dans une colonne étroite.
    intitule: (description || 'Travaux modificatifs').slice(0, 200),
    montant_ht: ftm?.montant_travaux_ht ?? 0,
    statut: STATUTS[ftm?.decision ?? 'en_attente'] ?? 'en_attente',
    reference: ref,
  }
}
