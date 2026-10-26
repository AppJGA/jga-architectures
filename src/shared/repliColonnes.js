// ─── Écrire malgré une migration pas encore passée ───────────────────────────
//
// Les migrations se passent à la main : tant qu'une colonne manque, la base
// refuse toute la ligne. Chaque repli reconnaît son erreur et rend la ligne
// sans la colonne en cause ; ils s'enchaînent, une écriture pouvant attendre
// plusieurs migrations. Pur (tests/telephones.test.js).

/**
 * @param ecrire  (ligne) => Promise<{ data, error }>
 * @param replis  [[(error) => booléen, (ligne) => ligne], ...]
 */
export async function ecrireAvecReplis(ecrire, ligne, replis) {
  let donnees = ligne
  let resultat = await ecrire(donnees)
  const restants = [...replis]
  while (resultat.error) {
    const i = restants.findIndex(([reconnait]) => reconnait(resultat.error))
    if (i < 0) break
    const [[, retirer]] = restants.splice(i, 1)
    donnees = retirer(donnees)
    resultat = await ecrire(donnees)
  }
  return resultat
}
