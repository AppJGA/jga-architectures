// ─── Montants : le HT prime ──────────────────────────────────────────────────
//
// À l'agence, un montant se lit et se saisit en HT ; le TTC suit, en petit.
// Le HT est enregistré (affaires : migration 064 ; suivi d'étude, marchés et
// lignes financières l'avaient déjà) ; à défaut — données d'avant, migration
// pas encore passée — il se déduit du TTC. Pur (tests/montants.test.js).

const arrondi = (n) => Math.round(n * 100) / 100
const vide = (v) => v === null || v === undefined || v === ''

/** Taux de TVA de l'affaire, multiplicateur (1,20 pour 20 %). */
export function tvaAffaire(affaire) {
  const t = Number(affaire?.taux_tva)
  return t > 0 ? t : 1.2
}

/** Le HT enregistré, sinon déduit du TTC ; null si rien. */
export function htDe(ht, ttc, tva = 1.2) {
  if (!vide(ht) && Number.isFinite(Number(ht))) return Number(ht)
  if (vide(ttc) || !Number.isFinite(Number(ttc))) return null
  return arrondi(Number(ttc) / tva)
}

/** Le TTC d'un HT ; null si rien. */
export function ttcDe(ht, tva = 1.2) {
  if (vide(ht) || !Number.isFinite(Number(ht))) return null
  return arrondi(Number(ht) * tva)
}

/** Les trois montants d'une affaire, en HT. */
export function montantsAffaire(affaire) {
  const tva = tvaAffaire(affaire)
  return {
    tva,
    enveloppe: htDe(affaire?.enveloppe_ht, affaire?.enveloppe_ttc, tva),
    travaux: htDe(affaire?.montant_travaux_ht, affaire?.montant_travaux_ttc, tva),
    honoraires: htDe(affaire?.honoraires_ht, affaire?.honoraires_ttc, tva),
  }
}

export const COLONNES_HT = ['enveloppe_ht', 'montant_travaux_ht', 'honoraires_ht']

/** Une écriture refusée parce que les colonnes HT manquent (migration 064 pas passée). */
export function erreurColonnesHT(error) {
  return !!error && COLONNES_HT.some((c) => String(error.message ?? '').includes(c))
}

/** La même écriture sans les colonnes HT (le TTC, lui, existe toujours). */
export function sansColonnesHT(donnees) {
  const copie = { ...donnees }
  for (const c of COLONNES_HT) delete copie[c]
  return copie
}
