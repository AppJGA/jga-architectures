// ─── Choisir une affaire en tapant ───────────────────────────────────────────
//
// Le champ de recherche d'affaire (`ChoixAffaire.jsx`) : quelques lettres du
// code ou du nom suffisent, sans majuscules ni accents. Chaque mot tapé doit
// se trouver dans le code, le nom ou le maître d'ouvrage ; les réponses dont
// le code commence par la saisie viennent d'abord, puis celles dont un mot du
// nom commence par elle. Pur (tests/choix-affaire.test.js).

/** Minuscules, sans accents ni ligatures (« Œuvre » → « oeuvre »). */
export function normaliser(texte) {
  return String(texte ?? '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

export const libelleAffaire = (a) => (a ? [a.code_affaire, a.nom].filter(Boolean).join(' · ') : '')

const parCode = (a, b) => (a.code_affaire ?? '').localeCompare(b.code_affaire ?? '') || (a.nom ?? '').localeCompare(b.nom ?? '')

/**
 * @returns les affaires qui conviennent à la saisie, les meilleures d'abord,
 *   `limite` au plus (toutes, par code, si la saisie est vide)
 */
export function filtrerAffaires(affaires, saisie, limite = 50) {
  const mots = normaliser(saisie).split(' ').filter(Boolean)
  if (mots.length === 0) return [...(affaires ?? [])].sort(parCode).slice(0, limite)

  const notees = []
  for (const a of affaires ?? []) {
    const code = normaliser(a.code_affaire)
    const nom = normaliser(a.nom)
    const moa = normaliser(a.moa_nom)
    if (!mots.every((m) => code.includes(m) || nom.includes(m) || moa.includes(m))) continue
    const premier = mots[0]
    const motsNom = nom.split(/[\s'’-]+/)
    const note = code.startsWith(premier) ? 0
      : code.includes(premier) ? 1
        : motsNom.some((m) => m.startsWith(premier)) ? 2
          : nom.includes(premier) ? 3
            : 4
    notees.push({ a, note })
  }
  return notees.sort((x, y) => x.note - y.note || parCode(x.a, y.a)).slice(0, limite).map((x) => x.a)
}
