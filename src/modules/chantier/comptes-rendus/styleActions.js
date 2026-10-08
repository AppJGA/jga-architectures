// ─── Boutons d'action d'une remarque, dans l'éditeur de bureau ───────────────
//
// Modifier, photo, plan, suite, ordre : à la demande de l'agence, des cibles
// d'au moins 32 px (28 pour une suite), même à la souris — les boutons de
// 18 px d'avant se manquaient. Fond au survol : classe `jga-action`
// (index.css).

export function styleAction({ couleur = '#5E5854', actif = false, hauteur = 32, desactive = false } = {}) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    height: hauteur, minWidth: hauteur, padding: '0 9px', boxSizing: 'border-box',
    border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 3,
    background: actif ? '#FFF4EE' : 'white',
    color: desactive ? '#D1D5DB' : actif ? '#E8602C' : couleur,
    fontSize: hauteur >= 32 ? 12 : 11, fontWeight: 500, whiteSpace: 'nowrap',
    cursor: desactive ? 'default' : 'pointer',
  }
}

export const TAILLE_ICONE_ACTION = 16
