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
 * @returns un tableau d'indices de voie (0 = première ligne), même ordre et même
 *          longueur que `positionsX`
 */
export function assignLabelLanes(positionsX, minGap) {
  const lanes = new Array(positionsX.length).fill(0)
  const derniereXParVoie = []

  positionsX
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x - b.x)
    .forEach(({ x, i }) => {
      let voie = 0
      while (voie < derniereXParVoie.length && x - derniereXParVoie[voie] < minGap) voie++
      lanes[i] = voie
      derniereXParVoie[voie] = x
    })

  return lanes
}
