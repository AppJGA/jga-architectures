// Portion d'une barre de planning en pause pendant une période bloquante,
// commune aux deux éditeurs (chantier, étude). La barre enjambe la période
// sans y être pochée : seul son contour reste, et les hachures de la période
// passent par-dessus. Une barre pleine laissait croire que la tâche avançait
// pendant les congés.

function rgba(hex, alpha) {
  const h = String(hex || '#B8412C').replace('#', '')
  const canal = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16)
    return Number.isNaN(c) ? 128 : c
  }
  return `rgba(${canal(0)},${canal(2)},${canal(4)},${alpha})`
}

/**
 * Masque CSS qui retire le remplissage d'une barre sur ses pauses.
 * @param pauses [{ x, largeur }] en px depuis le bord gauche de la barre
 * @returns la valeur de `mask-image`, ou `undefined` sans pause
 */
export function masquePauses(pauses) {
  if (!pauses?.length) return undefined
  const arrets = []
  for (const { x, largeur } of [...pauses].sort((a, b) => a.x - b.x)) {
    arrets.push(`#000 ${x}px`, `transparent ${x}px`, `transparent ${x + largeur}px`, `#000 ${x + largeur}px`)
  }
  return `linear-gradient(to right, #000 0px, ${arrets.join(', ')}, #000 100%)`
}

/** Les propriétés de masque, préfixe de Safari compris. */
export function styleMasque(pauses) {
  const masque = masquePauses(pauses)
  return masque ? { WebkitMaskImage: masque, maskImage: masque } : {}
}

/**
 * Style d'une pause : contour de la couleur de la barre (haut et bas, et le
 * bord s'il ferme la barre), hachures de la période, plus marquées que celles
 * du fond pour se lire « par-dessus ».
 */
export function stylePauseEcran(couleurBarre, couleurPeriode, { bordGauche = false, bordDroit = false } = {}) {
  const trait = `1.5px solid ${couleurBarre}`
  const p = couleurPeriode || '#B8412C'
  return {
    boxSizing: 'border-box',
    borderTop: trait,
    borderBottom: trait,
    borderLeft: bordGauche ? trait : 'none',
    borderRight: bordDroit ? trait : 'none',
    // Fond blanc sous les hachures : celles de la période, décalées, se
    // seraient croisées avec elles
    background: `repeating-linear-gradient(45deg, ${rgba(p, 0.10)} 0px, ${rgba(p, 0.10)} 4px, ${rgba(p, 0.32)} 4px, ${rgba(p, 0.32)} 8px), #FFFFFF`,
    pointerEvents: 'none',
  }
}
