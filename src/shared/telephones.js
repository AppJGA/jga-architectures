// ─── Téléphones : fixe et portable ───────────────────────────────────────────
//
// Une personne ou une organisation a deux numéros (migration 076) : le fixe
// reste dans la colonne `telephone` d'origine, le portable a la sienne
// (`telephone_portable`, `moa_telephone_portable` pour le maître d'ouvrage).
// Un champ peut encore porter deux numéros (« 06 … / 04 … ») : saisi ainsi
// avant la migration, ou recopié dans un CR émis. Pur (tests/telephones.test.js).

/** 06 / 07 en France : un portable. */
export function estPortable(numero) {
  const chiffres = String(numero ?? '').replace(/[^\d+]/g, '')
  return /^(0[67]|\+33[67]|0033[67])/.test(chiffres)
}

/** Un champ peut porter plusieurs numéros (« 06 … / 04 … ») : un par morceau. */
export function decouperNumeros(texte) {
  return String(texte ?? '').split(/\s*[/;,\n]\s*|\s{2,}/).map((t) => t.trim()).filter((t) => t.replace(/\D/g, '').length >= 6)
}

/**
 * Le texte d'un ancien champ unique, réparti entre fixe et portable : les
 * numéros en 06 / 07 vont au portable, tout le reste au fixe — rien ne se
 * perd. Jumelle de `jga_tel_fixe` / `jga_tel_portable` (migration 076) :
 * modifier les deux ensemble.
 */
export function repartirNumeros(texte) {
  const morceaux = String(texte ?? '').split(/\s*[/;,\n]\s*|\s{2,}/).map((t) => t.trim()).filter(Boolean)
  const portable = (m) => estPortable(m) && m.replace(/\D/g, '').length >= 6
  const joindre = (liste) => (liste.length ? liste.join(' / ') : null)
  return {
    fixe: joindre(morceaux.filter((m) => !portable(m))),
    portable: joindre(morceaux.filter(portable)),
  }
}

/**
 * Tous les numéros d'une fiche, chacun avec sa nature. Un numéro en 06 / 07
 * resté dans le champ fixe (saisi avant la migration) compte pour un portable.
 * @returns [{ numero, portable }]
 */
export function numerosFiche(fixe, portable) {
  return [
    ...decouperNumeros(fixe).map((numero) => ({ numero, portable: estPortable(numero) })),
    ...decouperNumeros(portable).map((numero) => ({ numero, portable: true })),
  ]
}

/** Les deux champs en une ligne de texte (listes, PDF). */
export function texteTelephones(fixe, portable, separateur = ' · ') {
  return [fixe, portable].map((t) => String(t ?? '').trim()).filter(Boolean).join(separateur)
}

// ─── Base sans la migration 076 ──────────────────────────────────────────────

/** Écriture refusée parce qu'une colonne de portable manque. */
export function erreurPortable(error) {
  return !!error && /telephone_portable/.test(String(error.message ?? ''))
}

/**
 * La même écriture sans colonne de portable : le portable rejoint le fixe
 * (« 03 … / 06 … »), comme on l'écrivait avant — il n'est pas perdu.
 */
export function sansPortable(donnees) {
  const copie = { ...donnees }
  for (const cle of Object.keys(copie)) {
    if (!cle.endsWith('telephone_portable')) continue
    const fixe = cle.replace(/_portable$/, '')
    const joint = texteTelephones(copie[fixe], copie[cle], ' / ')
    if (fixe in copie || joint) copie[fixe] = joint || null
    delete copie[cle]
  }
  return copie
}
