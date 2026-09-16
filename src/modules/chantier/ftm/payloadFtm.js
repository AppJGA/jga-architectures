// ─── Fiche de travaux modificatifs : du formulaire à la base ─────────────────
//
// Les colonnes à liste fermée de `ftm` (type de demande, motivation, unité de
// délai, décision) acceptent une valeur connue ou rien. Un champ laissé vide
// dans le formulaire vaut chaîne vide : envoyée telle quelle, la base refuse
// toute la fiche (« violates check constraint »). C'est ici que la chaîne vide
// redevient « rien ».

const ouRien = (v) => (v === '' || v === undefined ? null : v)
const nombre = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

/** Ligne prête pour la table `ftm`, à partir de l'état du formulaire. */
export function payloadFtm(form) {
  return {
    ...form,
    origine: form.origine || 'mo',
    lot_id: form.lot_id || null,
    type_demande: ouRien(form.type_demande),
    motivation: ouRien(form.motivation),
    // Le texte libre ne se garde que si la motivation est « autre »
    motivation_autre: form.motivation === 'autre' ? (form.motivation_autre || null) : null,
    incidence_delai_unite: ouRien(form.incidence_delai_unite),
    incidence_delai_valeur: nombre(form.incidence_delai_valeur),
    montant_travaux_ht: nombre(form.montant_travaux_ht),
    montant_honoraires_ht: nombre(form.montant_honoraires_ht),
    decision: ouRien(form.decision),
    date_decision: form.date_decision || null,
    date_emission: form.date_emission || null,
    reference_chantier: form.reference_chantier || null,
  }
}
