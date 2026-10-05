// ─── Convocations du CR précédent ────────────────────────────────────────────
//
// Au CR n°2, l'agence note qui est convoqué à la prochaine réunion (et à
// quelle heure). À la visite n°3, au moment de pointer les présences, on doit
// voir tout de suite qui était attendu : la mention s'affiche à côté du
// participant, et les convoqués passent en tête de liste.
// Pur (tests/convocation.test.js).

/** Un même participant d'un CR à l'autre : par sa fiche d'interlocuteur ou son lot. */
export function cleParticipant(p) {
  if (p?.interlocuteur_id) return `i:${p.interlocuteur_id}`
  if (p?.lot_entreprise_id) return `l:${p.lot_entreprise_id}`
  return null
}

/** Les convoqués du CR précédent : clé du participant → { numero, heure }. */
export function convocationsDe(presencesPrecedentes = [], numero = null) {
  const resultat = new Map()
  for (const p of presencesPrecedentes) {
    const cle = cleParticipant(p)
    if (cle && p.convoque) resultat.set(cle, { numero, heure: p.heure_convocation ? String(p.heure_convocation).slice(0, 5) : null })
  }
  return resultat
}

export function convocationDe(presence, convocations) {
  return convocations?.get(cleParticipant(presence)) ?? null
}

/** « Convoqué au CR n°2 · 09:00 » */
export function libelleConvocation(c) {
  if (!c) return ''
  return [`Convoqué au CR n°${c.numero ?? '?'}`, c.heure ? c.heure.replace(':', 'h') : null].filter(Boolean).join(' · ')
}

/** Les convoqués d'abord, sans défaire l'ordre habituel entre eux ni entre les autres. */
export function convoquesDabord(liste = [], convocations) {
  return liste
    .map((p, rang) => ({ p, rang, attendu: convocationDe(p, convocations) ? 0 : 1 }))
    .sort((a, b) => a.attendu - b.attendu || a.rang - b.rang)
    .map((x) => x.p)
}
