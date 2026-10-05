// ─── Fiche de travaux modificatifs : du formulaire à la base ─────────────────
//
// Les colonnes à liste fermée de `ftm` (type de demande, motivation, unité de
// délai, décision) acceptent une valeur connue ou rien. Un champ laissé vide
// dans le formulaire vaut chaîne vide : envoyée telle quelle, la base refuse
// toute la fiche (« violates check constraint »). C'est ici que la chaîne vide
// redevient « rien ».

const ouRien = (v) => (v === '' || v === undefined ? null : v)
const nombre = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// Le formulaire saisit un montant positif et son sens : une moins-value
// tapée sans signe partait en plus-value dans le suivi financier.
function montantSigne(valeur, sens) {
  const n = nombre(valeur)
  if (n === null || !sens) return n
  return sens === 'moins' ? -Math.abs(n) : Math.abs(n)
}

/** Sens d'un montant enregistré, pour le formulaire. */
export function sensMontant(valeur) {
  return Number(valeur) < 0 ? 'moins' : 'plus'
}

/** Message qui empêche l'enregistrement, ou null. */
export function erreurFtm(form) {
  // Une fiche pèse toujours sur un lot du suivi financier
  if (!form?.lot_id) return 'Choisissez le lot concerné : la fiche s’inscrit dans le suivi financier de ce lot.'
  return null
}

/** Ligne prête pour la table `ftm`, à partir de l'état du formulaire. */
export function payloadFtm(form) {
  // `sens_montant` n'existe qu'à l'écran : envoyé, la base refuserait la fiche
  const { sens_montant, ...champs } = form
  return {
    ...champs,
    origine: form.origine || 'mo',
    lot_id: form.lot_id || null,
    type_demande: ouRien(form.type_demande),
    motivation: ouRien(form.motivation),
    // Le texte libre ne se garde que si la motivation est « autre »
    motivation_autre: form.motivation === 'autre' ? (form.motivation_autre || null) : null,
    incidence_delai_unite: ouRien(form.incidence_delai_unite),
    incidence_delai_valeur: nombre(form.incidence_delai_valeur),
    montant_travaux_ht: montantSigne(form.montant_travaux_ht, sens_montant),
    montant_honoraires_ht: nombre(form.montant_honoraires_ht),
    decision: ouRien(form.decision),
    date_decision: form.date_decision || null,
    date_emission: form.date_emission || null,
    reference_chantier: form.reference_chantier || null,
  }
}
