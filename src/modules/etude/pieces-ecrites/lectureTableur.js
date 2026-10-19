// ─── Lire un classeur Excel (.xls, .xlsx), sur l'appareil ────────────────────
//
// SheetJS est chargé à la demande, au premier fichier Excel. Chaque feuille
// devient une grille de cases { texte, valeur } : `texte` est ce qu'Excel
// affiche — un numéro d'article « 1.10 » saisi comme nombre vaut 1.1, mais
// s'affiche « 1.10 ». La lecture du DPGF se fait ensuite dans `dpgfLogique.js`.

const MAX_LIGNES = 5000
const MAX_COLONNES = 40

export function estTableur(fichier) {
  return /\.(xlsx?|xlsm)$/i.test(fichier?.name ?? '')
    || /spreadsheetml|ms-excel/.test(fichier?.type ?? '')
}

/** Feuilles d'un classeur SheetJS → [{ nom, grille: [[{ texte, valeur } | null]] }]. */
export function feuillesDuClasseur(classeur, XLSX) {
  return classeur.SheetNames.map((nom) => {
    const feuille = classeur.Sheets[nom]
    if (!feuille?.['!ref']) return { nom, grille: [] }
    const zone = XLSX.utils.decode_range(feuille['!ref'])
    const grille = []
    for (let r = zone.s.r; r <= Math.min(zone.e.r, zone.s.r + MAX_LIGNES); r++) {
      const ligne = []
      for (let c = 0; c <= Math.min(zone.e.c, MAX_COLONNES - 1); c++) {
        const cel = feuille[XLSX.utils.encode_cell({ r, c })]
        ligne.push(cel && cel.v != null && cel.v !== '' ? { texte: cel.w ?? String(cel.v), valeur: cel.v } : null)
      }
      grille.push(ligne)
    }
    return { nom, grille }
  })
}

export async function lireTableur(fichier) {
  const XLSX = await import('xlsx')
  let classeur
  try {
    classeur = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
  } catch {
    throw new Error('Ce fichier Excel n’a pas pu être ouvert (protégé ou endommagé ?).')
  }
  return { feuilles: feuillesDuClasseur(classeur, XLSX), nomFichier: fichier.name }
}
