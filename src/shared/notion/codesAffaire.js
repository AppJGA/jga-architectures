// ─── Codes d'affaire, côté Notion et côté app ────────────────────────────────
//
// Seuls les 4 chiffres relient une affaire de l'app à une carte Notion : les
// lettres diffèrent parfois d'un côté à l'autre. Aucun import : ce module est
// lu par la gestion d'agence comme par la synchronisation.

export const COULEUR_NOTION = '#6B7280'

// Une année de date (« 16/10/2026 ») n'est pas un numéro d'affaire
export function numeroAffaire(texte) {
  const m = /(?:^|[^\d/])(\d{4})(?![\d/])/.exec(String(texte ?? ''))
  return m ? m[1] : null
}

/** « 2699-ABC » ou « 2697 - Exemple Long » → « 2699 ABC », « 2697 Exemple ». */
export function codeCarte(code) {
  const t = String(code ?? '').trim()
  const m = /^(\d{4})[\s\-–]*(\S+)?/.exec(t)
  if (!m) return t
  return m[2] ? `${m[1]} ${m[2]}` : m[1]
}
