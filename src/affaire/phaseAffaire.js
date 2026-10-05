// ─── Phase d'une affaire : étude ou chantier ─────────────────────────────────
//
// La phase enregistrée est fine (ESQ, AVP… Chantier, Livrée) ; la page de
// l'affaire n'en retient que la période — étude ou chantier — pour choisir les
// tuiles du tableau de bord et la couleur du cadre : on doit savoir d'un coup
// d'œil où en est l'affaire. Une affaire livrée reste au chantier (OPR, levée
// des réserves, décompte). Pur, pour être testé (tests/phase-affaire.test.js).

export const PHASES_AFFAIRE = [
  { value: 'esq', label: 'ESQ — Esquisse', court: 'Étude · ESQ' },
  { value: 'avp', label: 'AVP — Avant-Projet', court: 'Étude · AVP' },
  { value: 'pro', label: 'PRO — Projet', court: 'Étude · PRO' },
  { value: 'dce', label: 'DCE', court: 'Étude · DCE' },
  { value: 'chantier', label: 'Chantier', court: 'Chantier' },
  { value: 'livree', label: 'Livrée', court: 'Livrée' },
]

export function periodeAffaire(phase) {
  return phase === 'chantier' || phase === 'livree' ? 'chantier' : 'etude'
}

// Une ancienne valeur hors liste (« pc ») s'affiche telle quelle plutôt que
// de passer pour une esquisse
export function libellePhase(phase) {
  return PHASES_AFFAIRE.find((p) => p.value === phase)?.court ?? (phase ? String(phase).toUpperCase() : 'Étude')
}

const COULEURS = {
  etude: {
    '--affaire-accent': 'var(--jga-orange)',
    '--affaire-accent-clair': 'var(--jga-orange-light)',
    '--affaire-accent-survol': 'rgba(232,96,44,0.18)',
    '--affaire-accent-bord': 'var(--jga-orange-mid)',
    '--affaire-accent-ombre': 'rgba(232,96,44,0.9)',
  },
  chantier: {
    '--affaire-accent': 'var(--jga-green)',
    '--affaire-accent-clair': 'var(--jga-green-light)',
    '--affaire-accent-survol': 'rgba(42,138,78,0.20)',
    '--affaire-accent-bord': 'rgba(42,138,78,0.45)',
    '--affaire-accent-ombre': 'rgba(42,138,78,0.9)',
  },
}

/** Variables CSS posées sur la page : tout le cadre de l'affaire les lit. */
export function variablesPhase(phase) {
  return COULEURS[periodeAffaire(phase)]
}

/**
 * Les phases du manifeste à montrer en tuiles : celle de l'affaire seulement.
 * Si elle n'en a aucune (un intervenant extérieur ne voit que le chantier, sur
 * une affaire encore à l'étude), toutes plutôt qu'un tableau de bord vide.
 */
export function phasesDuTableau(phases, phase) {
  const retenues = phases.filter((p) => p.id === periodeAffaire(phase))
  return retenues.length > 0 ? retenues : phases
}
