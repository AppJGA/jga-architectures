// ─── Numéro d'un lot, tel que saisi ──────────────────────────────────────────
//
// `lots.numero` est un nombre (tri, unicité par affaire) : « 060 » y devient
// 60. Le texte saisi est gardé à côté (`numero_affiche`, migration 063) et
// c'est lui qui s'affiche partout. Un lot saisi sans zéro devant n'en a pas
// besoin : le nombre suffit. Pur (tests/numero-lot.test.js).

/**
 * Le numéro à afficher : le texte saisi, sinon le nombre — complété de zéros
 * jusqu'à `minimum` chiffres là où l'écran le faisait déjà (planning : 01-3).
 */
export function numeroLot(lot, { minimum = 0 } = {}) {
  const saisi = String(lot?.numero_affiche ?? '').trim()
  if (saisi) return saisi
  if (lot?.numero == null || lot.numero === '') return ''
  return String(lot.numero).padStart(minimum, '0')
}

/** « Lot 060 — Menuiseries », ou le nom seul sans numéro. */
export function libelleNumeroLot(lot, separateur = ' — ') {
  const numero = numeroLot(lot)
  return numero ? `Lot ${numero}${lot?.nom ? `${separateur}${lot.nom}` : ''}` : (lot?.nom ?? '')
}

/**
 * Un numéro tapé → ce qu'on enregistre. Des chiffres seulement ; le texte
 * n'est gardé que s'il diffère du nombre (zéros devant).
 * @returns { numero, numero_affiche } ou null si la saisie n'est pas un numéro
 */
export function lireNumeroSaisi(saisie) {
  const texte = String(saisie ?? '').trim()
  if (!/^\d{1,4}$/.test(texte)) return null
  const numero = Number(texte)
  return { numero, numero_affiche: texte === String(numero) ? null : texte }
}
