// ─── Statuts des matériaux et bloc porte d'une fiche de pièce ────────────────
//
// L'agence lit son état des lieux en tableaux : chaque matériau (sol, murs,
// plafond, plinthes, bloc porte) porte un statut — Conserver, Rafraîchir
// (remise en état sans dépose : peinture, reprise, rebouchage), Déposer
// (dépose, remplacement, suppression) ou À préciser (rien n'est dit). Claude
// le propose, l'agence le corrige en relecture. Seule liste des statuts :
// analyse, relecture, DXF, PDF et Word la lisent ici.
//
// Forme dans `edl_pieces.fiche` (jsonb, aucune migration) :
//   porte:   { huisserie, vantail, quincaillerie }   textes courts, "" si rien
//   statuts: { sol, murs, plafond, plinthes, porte } code, ou null
// « À préciser » n'est jamais enregistré : c'est l'absence de statut (null),
// d'où `statutDe` qui ramène tout le reste (ancienne fiche sans ces clés,
// code inconnu, rubrique vide) à 'a-preciser'.
//
// Pur, sans import : le serveur (api/analyser-edl.js) le charge sous Node.
// Testé (tests/etat-des-lieux-statuts.test.js).

// Couleurs des étiquettes, calées sur la synthèse montrée par l'agence
// (2026-11-19) : `cerne` = trait autour de l'étiquette.
export const STATUTS = [
  { code: 'conserver', libelle: 'Conserver', sens: 'En bon état, gardé tel quel', texte: '#3F7D3A', fond: null, trait: '#3F7D3A', cerne: 'plein' },
  { code: 'rafraichir', libelle: 'Rafraîchir', sens: 'Remise en état sans dépose : peinture, reprise, rebouchage', texte: '#8E5508', fond: null, trait: '#B7700A', cerne: 'pointille' },
  { code: 'deposer', libelle: 'Déposer', sens: 'Dépose, remplacement ou suppression', texte: '#FFFFFF', fond: '#B9481B', trait: '#B9481B', cerne: 'plein' },
  { code: 'a-preciser', libelle: 'À préciser', sens: 'Rien n’a été dit sur son état', texte: '#5A554F', fond: null, trait: '#938980', cerne: 'tirete' },
]

export const STATUT_A_PRECISER = 'a-preciser'

/** Statuts que l'analyse (et la relecture) enregistrent : « À préciser » = null. */
export const CODES_STATUTS_ENREGISTRES = STATUTS.map((s) => s.code).filter((c) => c !== STATUT_A_PRECISER)

/** Rubriques qui portent un statut. HSP et remarques n'en ont pas. */
export const RUBRIQUES_STATUT = ['sol', 'murs', 'plafond', 'plinthes', 'porte']

/** Parties du bloc porte, dans l'ordre d'écriture. */
export const CHAMPS_PORTE = ['huisserie', 'vantail', 'quincaillerie']

export const LIBELLES_PORTE = { huisserie: 'Huisserie', vantail: 'Vantail', quincaillerie: 'Quincaillerie' }

const PAR_CODE = new Map(STATUTS.map((s) => [s.code, s]))

const propre = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** Code enregistrable ou null : 'a-preciser', inconnu, vide → null. */
export function codeStatut(v) {
  return typeof v === 'string' && CODES_STATUTS_ENREGISTRES.includes(v) ? v : null
}

/** Bloc porte de la fiche, toujours complet (textes, "" si rien). */
export function porteDe(fiche) {
  const p = fiche?.porte && typeof fiche.porte === 'object' && !Array.isArray(fiche.porte) ? fiche.porte : {}
  return Object.fromEntries(CHAMPS_PORTE.map((c) => [c, propre(p[c])]))
}

/** Vrai si une rubrique de la fiche dit quelque chose (porte : une de ses parties). */
export function rubriqueRenseignee(fiche, rubrique) {
  if (rubrique === 'porte') return CHAMPS_PORTE.some((c) => porteDe(fiche)[c] !== '')
  return propre(fiche?.[rubrique] == null ? '' : String(fiche[rubrique])) !== ''
}

/**
 * Statut d'une rubrique : celui de la fiche s'il est connu et que la
 * rubrique dit quelque chose, sinon 'a-preciser'.
 */
export function statutDe(fiche, rubrique) {
  if (!RUBRIQUES_STATUT.includes(rubrique) || !rubriqueRenseignee(fiche, rubrique)) return STATUT_A_PRECISER
  const s = fiche?.statuts && typeof fiche.statuts === 'object' ? fiche.statuts[rubrique] : null
  return codeStatut(s) ?? STATUT_A_PRECISER
}

/** Statut décrit (libellé, couleurs) ; un code inconnu se lit « À préciser ». */
export const infosStatut = (code) => PAR_CODE.get(code) ?? PAR_CODE.get(STATUT_A_PRECISER)

export const libelleStatut = (code) => infosStatut(code).libelle

/**
 * Bloc porte en une ligne : « huisserie bois, vantail bois, quincaillerie
 * laiton ». Une partie déjà écrite avec son nom (« Huisserie métallique »)
 * ne le reçoit pas deux fois. "" si rien n'est dit.
 */
export function textePorte(fiche) {
  const p = porteDe(fiche)
  return CHAMPS_PORTE
    .filter((c) => p[c])
    .map((c) => (p[c].toLowerCase().startsWith(c) ? p[c] : `${c} ${p[c]}`))
    .join(', ')
}
