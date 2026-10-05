// ─── Couleur des propositions de l'IA ────────────────────────────────────────
//
// Mise en surbrillance, pas surlignée (choix de l'agence) : c'est toute la
// carte qui ressort, d'une couleur réservée à l'IA — le jaune « surligné »
// reste celui de la mise en forme d'une remarque (migration 056).

export const COULEUR_IA = '#2F6FB5'

export const styleProposition = {
  borderTop: `2px solid ${COULEUR_IA}`,
  borderRight: `2px solid ${COULEUR_IA}`,
  borderBottom: `2px solid ${COULEUR_IA}`,
  borderLeft: `4px solid ${COULEUR_IA}`,
  boxShadow: '0 0 0 4px rgba(47,111,181,0.15)',
  background: '#F6F9FD',
}
