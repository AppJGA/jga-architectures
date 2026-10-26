// ─── Aperçu des PDF de planning : calculs sans navigateur ────────────────────

export const PX_PAR_MM = 96 / 25.4

/**
 * Ce que l'aperçu annonce : le nombre de feuilles (exact, la page les fabrique
 * elle-même) et la réduction appliquée, quand elle se remarque.
 * @param mesure { pages, reduction } envoyé par la page de l'aperçu
 */
export function libelleApercu(mesure) {
  if (!mesure) return ''
  const n = mesure.pages ?? 1
  const morceaux = [n > 1 ? `${n} feuilles` : '1 feuille']
  const pourcent = Math.round((mesure.reduction ?? 1) * 100)
  if (pourcent < 100) morceaux.push(`réduit à ${pourcent} %`)
  return morceaux.join(' · ')
}
