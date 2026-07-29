// ─── Phases du suivi financier d'étude ───────────────────────────────────────
//
// Le code d'une phase (`suivi_financier_etude.phase`) reste sa clé : c'est lui
// qui porte la contrainte d'unicité, qui relie les estimations de lots, et qui
// correspond au vocabulaire de `affaires.phase`. Seul le NOM est libre, stocké
// dans `nom_custom` ; à défaut, le libellé d'origine est affiché.
//
// Les cinq phases historiques existent toujours, même sans ligne en base — d'où
// la fusion faite ici entre la liste de référence et les lignes enregistrées.

export const PHASES_BASE = [
  { id: 'esq',      label: 'ESQ',      full: 'Esquisse',                color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'avp',      label: 'AVP',      full: 'Avant-Projet',            color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'pro',      label: 'PRO',      full: 'Projet',                  color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'dce',      label: 'DCE',      full: 'Dossier de Consultation', color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'chantier', label: 'Chantier', full: 'Chantier',                color: '#2A8A4E', bg: 'rgba(42,138,78,0.12)' },
]

const COULEUR_PERSO = { color: '#5E5854', bg: 'rgba(94,88,84,0.10)' }

// Colonnes qui font qu'une phase est « renseignée ». Ni `nom_custom` ni `ordre`
// n'en font partie : renommer ou déplacer une phase vide crée bien une ligne en
// base, mais ne doit pas la faire passer pour remplie à l'écran.
const CHAMPS_DONNEES = [
  'enveloppe_ttc', 'enveloppe_ht', 'honoraires_ttc', 'honoraires_ht',
  'motif_evolution', 'notes',
]

export function estRenseignee(entry) {
  if (!entry) return false
  return CHAMPS_DONNEES.some((c) => entry[c] != null && entry[c] !== '')
}

export const estPhaseBase = (code) => PHASES_BASE.some((p) => p.id === code)

// Liste affichée : les cinq phases de référence, plus celles ajoutées à la main,
// dans l'ordre choisi par l'utilisateur (`ordre`) ou, à défaut, l'ordre
// chronologique d'origine.
export function construirePhases(suiviParPhase = []) {
  const parCode = new Map(suiviParPhase.map((e) => [e.phase, e]))

  const base = PHASES_BASE.map((p, i) => ({
    ...p,
    personnalisee: false,
    rangDefaut: i,
    entry: parCode.get(p.id) ?? null,
  }))

  const perso = suiviParPhase
    .filter((e) => !estPhaseBase(e.phase))
    .map((e, i) => ({
      id: e.phase,
      label: e.nom_custom || 'Phase',
      full: e.nom_custom || 'Phase personnalisée',
      ...COULEUR_PERSO,
      personnalisee: true,
      rangDefaut: PHASES_BASE.length + i,
      entry: e,
    }))

  return [...base, ...perso]
    .map((p) => ({
      ...p,
      // Le nom libre l'emporte sur le libellé d'origine, partout où la phase
      // est affichée : badge, carte, ligne vide, listes déroulantes.
      label: p.entry?.nom_custom || p.label,
      full: p.entry?.nom_custom || p.full,
      ordre: p.entry?.ordre ?? p.rangDefaut,
    }))
    .sort((a, b) => (a.ordre - b.ordre) || (a.rangDefaut - b.rangDefaut))
}

// Code d'une nouvelle phase : jamais l'un des cinq codes de référence, et jamais
// un code déjà pris — c'est la clé d'unicité (affaire_id, phase).
export function prochainCodePhase(phases = []) {
  const pris = new Set(phases.map((p) => p.id ?? p.phase))
  let n = pris.size + 1
  while (pris.has(`perso_${n}`)) n++
  return `perso_${n}`
}

// Nom par défaut d'une nouvelle phase : « Phase 6 » si cinq existent déjà.
export function nomParDefaut(phases = []) {
  return `Phase ${phases.length + 1}`
}
