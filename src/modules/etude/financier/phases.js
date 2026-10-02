// ─── Phases du suivi financier d'étude ───────────────────────────────────────
//
// Les phases ne sont plus pré-enregistrées : on tape le nom de celle où l'on se
// trouve en renseignant ses montants. Seules les lignes enregistrées
// apparaissent.
//
// Le code d'une phase (`suivi_financier_etude.phase`) reste sa clé : il porte
// la contrainte d'unicité et relie les estimations de lots. Une nouvelle phase
// reçoit un code `perso_N` et son nom dans `nom_custom`. Les lignes plus
// anciennes gardent leur code d'origine (`esq`, `avp`…), dont le libellé sert
// de nom tant qu'aucun nom libre n'a été saisi.

export const PHASES_BASE = [
  { id: 'esq',      label: 'ESQ',      full: 'Esquisse',                color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'avp',      label: 'AVP',      full: 'Avant-Projet',            color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'pro',      label: 'PRO',      full: 'Projet',                  color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'dce',      label: 'DCE',      full: 'Dossier de Consultation', color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'chantier', label: 'Chantier', full: 'Chantier',                color: '#2A8A4E', bg: 'rgba(42,138,78,0.12)' },
]

// Proposées pendant la saisie du nom ; on peut écrire n'importe quoi d'autre
export const SUGGESTIONS_PHASES = [
  'ESQ', 'APS', 'APD', 'AVP', 'PRO', 'DCE', 'ACT', 'VISA', 'DET', 'AOR', 'Chantier',
]

const COULEUR_PHASE = { color: '#E8602C', bg: 'rgba(232,96,44,0.10)' }

// Rang d'une ligne : celui choisi par glisser-déposer, sinon (ligne créée avant
// la migration 036) l'ordre chronologique de son code d'origine
const RANG_BASE = Object.fromEntries(PHASES_BASE.map((p, i) => [p.id, i]))
const rangDe = (e) => e.ordre ?? RANG_BASE[e.phase] ?? 99

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

/** Nom affiché d'une ligne : nom libre, sinon libellé d'origine, sinon le code. */
export function nomPhase(entry) {
  if (entry?.nom_custom) return entry.nom_custom
  return PHASES_BASE.find((p) => p.id === entry?.phase)?.label ?? entry?.phase ?? ''
}

// Liste affichée : les phases enregistrées, dans l'ordre choisi
export function construirePhases(suiviParPhase = []) {
  return [...suiviParPhase]
    .sort((a, b) => rangDe(a) - rangDe(b))
    .map((e, i) => {
      const base = PHASES_BASE.find((p) => p.id === e.phase)
      return {
        id: e.phase,
        label: nomPhase(e),
        full: e.nom_custom || base?.full || nomPhase(e),
        color: base?.color ?? COULEUR_PHASE.color,
        bg: base?.bg ?? COULEUR_PHASE.bg,
        ordre: e.ordre ?? i,
        entry: e,
      }
    })
}

const normaliser = (nom) => String(nom ?? '').trim().toLocaleLowerCase('fr')

/** Phase qui porte déjà ce nom (hors `saufCode`, la phase qu'on renomme), ou null. */
export function phaseDuMemeNom(phases, nom, saufCode = null) {
  const cherche = normaliser(nom)
  if (!cherche) return null
  return phases.find((p) => p.id !== saufCode && normaliser(p.label) === cherche) ?? null
}

/** La dernière phase de la liste qui porte un montant ou un commentaire. */
export function dernierePhaseRenseignee(suiviParPhase = []) {
  const remplies = [...suiviParPhase].filter(estRenseignee).sort((a, b) => rangDe(a) - rangDe(b))
  return remplies[remplies.length - 1] ?? null
}

// Code d'une nouvelle phase : jamais l'un des cinq codes d'origine, et jamais
// un code déjà pris — c'est la clé d'unicité (affaire_id, phase).
export function prochainCodePhase(phases = []) {
  const pris = new Set(phases.map((p) => p.id ?? p.phase))
  let n = pris.size + 1
  while (pris.has(`perso_${n}`)) n++
  return `perso_${n}`
}

/** Rang d'une nouvelle phase : à la suite de la dernière. */
export function prochainOrdre(phases = []) {
  return phases.reduce((max, p) => Math.max(max, p.ordre ?? -1), -1) + 1
}
