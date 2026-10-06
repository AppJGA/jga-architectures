// ─── Lire le texte d'un PDF, sur l'appareil ──────────────────────────────────
//
// pdf.js rend, page par page, des fragments de texte positionnés ; ils sont
// remis en lignes par `lignesDePage`. Le PDF ne quitte pas l'appareil : seul
// le texte découpé sera enregistré. Le module des pièces écrites est chargé à
// la demande, pdf.js avec lui.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { lignesDePage, styleDePolice, traitsHorizontaux, fragmentSouligne } from './piecesLogique'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export function estPdf(fichier) {
  return fichier?.type === 'application/pdf' || /\.pdf$/i.test(fichier?.name ?? '')
}

/**
 * @returns { pages: [{ numero, lignes: [{ texte, taille }] }], nomFichier }
 */
export async function lirePdf(fichier, { surProgression } = {}) {
  let doc
  try {
    doc = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise
  } catch {
    throw new Error('Ce PDF n’a pas pu être ouvert (fichier protégé ou endommagé ?).')
  }
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const contenu = await page.getTextContent()
    // La liste d'opérations charge les polices (gras, italique d'après leur
    // nom) et donne les traits de la page (soulignés)
    let traits = []
    try {
      const ops = await page.getOperatorList()
      traits = traitsHorizontaux(ops.fnArray, ops.argsArray, pdfjs.OPS)
    } catch { /* mise en forme perdue, texte intact */ }
    const polices = new Map()
    const police = (nom) => {
      if (!polices.has(nom)) {
        let style = { gras: false, italique: false }
        try { style = styleDePolice(page.commonObjs.get(nom)?.name ?? '') } catch { /* police non chargée */ }
        polices.set(nom, style)
      }
      return polices.get(nom)
    }
    const items = contenu.items.map((it) => (it.str?.trim()
      ? { ...it, style: { ...police(it.fontName), souligne: fragmentSouligne(it, traits) } }
      : it))
    pages.push({ numero: i, lignes: lignesDePage(items) })
    surProgression?.(i / doc.numPages)
  }
  doc.destroy?.()
  if (!pages.some((p) => p.lignes.length > 0)) {
    throw new Error('Ce PDF ne contient pas de texte (document scanné ?) : il ne peut pas être lu.')
  }
  return { pages, nomFichier: fichier.name }
}
