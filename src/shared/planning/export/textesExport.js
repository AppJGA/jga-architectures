// Textes d'en-tête et de pied des PDF de planning, mémorisés par affaire sur
// l'appareil : on retrouve la dernière mention saisie à l'export suivant.

const cle = (type, affaireId) => `jga-planning-textes-${type}-${affaireId ?? 'sans-affaire'}`

/** @param type 'chantier' | 'etude' */
export function lireTextesExport(type, affaireId) {
  try {
    const lu = JSON.parse(localStorage.getItem(cle(type, affaireId)) ?? '{}')
    return { entete: typeof lu.entete === 'string' ? lu.entete : '', pied: typeof lu.pied === 'string' ? lu.pied : '' }
  } catch {
    return { entete: '', pied: '' }
  }
}

export function ecrireTextesExport(type, affaireId, { entete = '', pied = '' }) {
  try { localStorage.setItem(cle(type, affaireId), JSON.stringify({ entete, pied })) } catch { /* navigation privée */ }
}
