// ─── Références cadastrales d'une affaire ────────────────────────────────────
//
// Autant de sections que le terrain en compte, chacune avec ses parcelles et
// sa superficie (migration 076, `affaires.cadastre_references`, jsonb
// [{ section, parcelles, superficie }]). Les anciennes colonnes
// (`cadastre_section`, `cadastre_parcelle`, `cadastre_superficie`) restent
// écrites — première section, superficie totale — : une base sans la
// migration garde ainsi l'essentiel. Pur (tests/cadastre.test.js).

const texte = (v) => String(v ?? '').trim()
const nombre = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Les références enregistrées, sinon celles des anciennes colonnes. */
export function referencesCadastre(affaire) {
  const liste = Array.isArray(affaire?.cadastre_references) ? affaire.cadastre_references : []
  const propres = liste
    .map((r) => ({ section: texte(r?.section), parcelles: texte(r?.parcelles), superficie: nombre(r?.superficie) }))
    .filter((r) => r.section || r.parcelles || r.superficie != null)
  if (propres.length) return propres
  const ancienne = {
    section: texte(affaire?.cadastre_section),
    parcelles: texte(affaire?.cadastre_parcelle),
    superficie: nombre(affaire?.cadastre_superficie),
  }
  return ancienne.section || ancienne.parcelles || ancienne.superficie != null ? [ancienne] : []
}

/** Lignes du formulaire (texte), au moins une, vide. */
export function lignesCadastre(affaire) {
  const refs = referencesCadastre(affaire)
  const lignes = refs.map((r) => ({ section: r.section, parcelles: r.parcelles, superficie: r.superficie == null ? '' : String(r.superficie) }))
  return lignes.length ? lignes : [ligneVide()]
}

export const ligneVide = () => ({ section: '', parcelles: '', superficie: '' })

/** Somme des superficies renseignées ; null si aucune. */
export function superficieTotale(refs) {
  const valeurs = refs.map((r) => nombre(r.superficie)).filter((n) => n != null)
  return valeurs.length ? Math.round(valeurs.reduce((s, n) => s + n, 0) * 100) / 100 : null
}

/** Ce qui s'enregistre dans `affaires` : la liste, et les anciennes colonnes tenues à jour. */
export function colonnesCadastre(lignes) {
  const refs = (lignes ?? [])
    .map((l) => ({ section: texte(l.section).toUpperCase(), parcelles: texte(l.parcelles), superficie: nombre(l.superficie) }))
    .filter((r) => r.section || r.parcelles || r.superficie != null)
  return {
    cadastre_references: refs,
    cadastre_section: refs[0]?.section || null,
    cadastre_parcelle: refs[0]?.parcelles || null,
    cadastre_superficie: superficieTotale(refs),
  }
}

/** « AB 142, 143 · AC 12 » */
export function texteCadastre(refs) {
  return refs.map((r) => [r.section, r.parcelles].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
}

/** Écriture refusée parce que la colonne manque (migration 076 pas passée). */
export function erreurCadastre(error) {
  return !!error && /cadastre_references/.test(String(error.message ?? ''))
}

export function sansReferences(donnees) {
  const copie = { ...donnees }
  delete copie.cadastre_references
  return copie
}
