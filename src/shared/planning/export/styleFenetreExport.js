// ─── Mise en page des fenêtres d'export PDF des plannings ────────────────────
//
// Réglages à gauche, aperçu à droite ; sur un écran étroit, l'aperçu passe
// dessous. Seul le corps défile, l'aperçu reste en vue à côté des réglages.
export const STYLE_FENETRE = {
  backgroundColor: 'white', borderRadius: 0, padding: 28, width: 'min(1320px, 96vw)',
  height: '92vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
  boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
}
export const STYLE_CORPS = {
  flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap',
  alignItems: 'flex-start', gap: 24,
}
export const STYLE_REGLAGES = {
  flex: '1 1 380px', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20,
}
export const STYLE_COLONNE_APERCU = {
  flex: '999 1 440px', minWidth: 0, height: '100%', minHeight: 420,
  position: 'sticky', top: 0,
}
