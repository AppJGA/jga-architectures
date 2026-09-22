// ─── Zoom au pincement (calcul pur) ──────────────────────────────────────────
//
// Pendant un pincement, la valeur de zoom suit le rapport entre l'écart des
// doigts et leur écart au départ ; le point du planning qui était sous le
// milieu des doigts y reste. Les largeurs du planning étant proportionnelles
// à la valeur de zoom (week-ends compris), une position dans le contenu
// s'étire dans le même rapport.

const borner = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * @param depart       valeur de zoom au début du pincement
 * @param ecartDepart  écart des doigts au début (px)
 * @param ecart        écart des doigts maintenant (px)
 * @param min, max     bornes de la valeur
 * @param pas          arrondi de la valeur (facultatif)
 * @param pointContenu position, dans le contenu défilant, du point qui était
 *                     sous le milieu des doigts au départ (scrollLeft + milieu)
 * @param milieuX      milieu des doigts maintenant, depuis le bord du volet
 * @returns { valeur, scrollLeft }
 */
export function zoomPincement({ depart, ecartDepart, ecart, min, max, pas, pointContenu, milieuX }) {
  if (!(ecartDepart > 0) || !(ecart > 0) || !(depart > 0)) {
    return { valeur: depart, scrollLeft: Math.max(0, pointContenu - milieuX) }
  }
  let valeur = borner(depart * (ecart / ecartDepart), min, max)
  if (pas) valeur = borner(Math.round(valeur / pas) * pas, min, max)
  // Évite les queues de flottants (0.30000000000000004) dans les réglages mémorisés
  valeur = Math.round(valeur * 1000) / 1000
  return { valeur, scrollLeft: Math.max(0, pointContenu * (valeur / depart) - milieuX) }
}
