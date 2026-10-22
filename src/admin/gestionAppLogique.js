// ─── « Gestion de l'application » : calculs (purs) ───────────────────────────
//
// Conception : docs/superpowers/specs/2026-10-22-gestion-application-design.md.
// Les limites sont celles de l'offre gratuite de Supabase : un seul endroit à
// changer le jour d'une autre offre. Testé (tests/gestion-application.test.js).

const MO = 1024 * 1024

export const LIMITES = { fichiers: 1024 * MO, base: 500 * MO }
export const SEUIL_ALERTE = 0.8

/** Place occupée par rapport à une limite. */
export function jauge(octets, limite) {
  const o = Math.max(0, Number(octets) || 0)
  const part = limite > 0 ? o / limite : 0
  return { octets: o, limite, part, alerte: part >= SEUIL_ALERTE }
}

const SORTES = [
  { sorte: 'photos', libelle: 'Photos des visites', buckets: ['cr-photos'] },
  { sorte: 'plans', libelle: 'Plans', buckets: ['cr-plans'] },
  { sorte: 'archives', libelle: 'PDF archivés', buckets: ['cr-archives'] },
  { sorte: 'audio', libelle: 'Audio en attente de transcription', buckets: ['audio-temporaire'] },
  { sorte: 'couvertures', libelle: 'Photos des affaires', buckets: ['affaires-photos'] },
]

/**
 * Fichiers regroupés par sorte, du plus lourd au plus léger ; un dossier de
 * stockage inconnu tombe dans « Autres fichiers ».
 * @param lignes [{ bucket, affaire_id, fichiers, octets }] (admin_stockage)
 */
export function parSorte(lignes = []) {
  const totaux = new Map()
  for (const l of lignes) {
    const s = SORTES.find((x) => x.buckets.includes(l.bucket)) ?? { sorte: 'autres', libelle: 'Autres fichiers' }
    const t = totaux.get(s.sorte) ?? { sorte: s.sorte, libelle: s.libelle, octets: 0, fichiers: 0 }
    t.octets += Number(l.octets) || 0
    t.fichiers += Number(l.fichiers) || 0
    totaux.set(s.sorte, t)
  }
  return [...totaux.values()].sort((a, b) => b.octets - a.octets)
}

/**
 * Les affaires qui pèsent le plus, tous dossiers confondus. Les fichiers hors
 * affaire, ou d'une affaire disparue, sont regroupés à part.
 * @param affaires [{ id, code, nom }]
 * @returns [{ affaireId, libelle, octets, fichiers }]
 */
export function parAffaire(lignes = [], affaires = [], n = 10) {
  const noms = new Map(affaires.map((a) => [a.id, [a.code, a.nom].filter(Boolean).join(' · ') || 'Affaire sans nom']))
  const totaux = new Map()
  for (const l of lignes) {
    const connue = l.affaire_id && noms.has(l.affaire_id)
    const cle = connue ? l.affaire_id : null
    const t = totaux.get(cle) ?? {
      affaireId: cle,
      libelle: connue ? noms.get(cle) : 'Hors affaire (ou affaire supprimée)',
      octets: 0,
      fichiers: 0,
    }
    t.octets += Number(l.octets) || 0
    t.fichiers += Number(l.fichiers) || 0
    totaux.set(cle, t)
  }
  const tries = [...totaux.values()].sort((a, b) => b.octets - a.octets)
  const affairesSeules = tries.filter((t) => t.affaireId).slice(0, n)
  const hors = tries.find((t) => !t.affaireId)
  return hors ? [...affairesSeules, hors] : affairesSeules
}

/**
 * L'avertissement de la bulle d'accueil : le plus rempli des deux, s'il
 * dépasse le seuil.
 * @param fichiers, base : octets (null si inconnu)
 */
export function alerteAccueil({ fichiers = null, base = null } = {}) {
  const candidats = [
    fichiers != null && { quoi: 'fichiers', ...jauge(fichiers, LIMITES.fichiers) },
    base != null && { quoi: 'base', ...jauge(base, LIMITES.base) },
  ].filter((j) => j && j.alerte).sort((a, b) => b.part - a.part)
  if (!candidats.length) return null
  const j = candidats[0]
  const pct = Math.round(j.part * 100)
  return { part: j.part, texte: `${j.quoi === 'base' ? 'Base de données' : 'Stockage des fichiers'} à ${pct} % de l’offre gratuite` }
}

/** Les comptes en chiffres ; un compte sans profil ne voit rien. */
export function etatComptes(comptes = []) {
  return {
    total: comptes.length,
    agence: comptes.filter((c) => c.a_un_profil && c.type_compte === 'agence').length,
    exterieurs: comptes.filter((c) => c.a_un_profil && c.type_compte !== 'agence').length,
    associes: comptes.filter((c) => c.est_associe).length,
    sansProfil: comptes.filter((c) => !c.a_un_profil).length,
  }
}

/** « 512 Ko », « 3,4 Mo », « 1,02 Go ». */
export function formatTaille(octets) {
  const o = Number(octets) || 0
  if (o < MO) return `${Math.round(o / 1024)} Ko`
  if (o < 1024 * MO) return `${(o / MO).toLocaleString('fr-FR', { maximumFractionDigits: o < 10 * MO ? 1 : 0 })} Mo`
  return `${(o / (1024 * MO)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`
}
