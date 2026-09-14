// ─── Anti-collision des labels de jalons ──────────────────────────────────────
//
// Deux jalons proches voient leurs libellés se chevaucher. Plutôt qu'une simple
// alternance haut/bas (qui recolle dès trois jalons rapprochés), on attribue à
// chaque label la première « voie » verticale libre : une voie est libre si le
// dernier label qu'elle contient est à plus de `minGap` sur sa gauche.
//
// Partagé par la timeline interactive et l'export PDF pour que les deux rendus
// se comportent de la même façon.

/**
 * @param positionsX positions horizontales des jalons (px ou mm), dans l'ordre
 *                   du tableau source
 * @param minGap     écart minimal en dessous duquel deux labels se chevauchent
 * @param largeurs   largeur estimée de chaque label (même unité, même ordre),
 *                   optionnelle : un long libellé déborde bien au-delà de
 *                   `minGap`, qui ne suffit alors plus à séparer deux jalons
 * @returns un tableau d'indices de voie (0 = première ligne), même ordre et même
 *          longueur que `positionsX`
 */
export function assignLabelLanes(positionsX, minGap, largeurs = null) {
  const lanes = new Array(positionsX.length).fill(0)
  // Bord droit occupé par le dernier label de chaque voie
  const finParVoie = []

  positionsX
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x - b.x)
    .forEach(({ x, i }) => {
      let voie = 0
      while (voie < finParVoie.length && x < finParVoie[voie]) voie++
      lanes[i] = voie
      finParVoie[voie] = x + Math.max(minGap, largeurs?.[i] ?? 0)
    })

  return lanes
}
