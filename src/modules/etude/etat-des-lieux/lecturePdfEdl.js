// ─── Plans en PDF : pages, rendu, textes, découpe d'un étage ─────────────────

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { dimensionsPlan } from '../../chantier/comptes-rendus/plansLogique'
import { estVectoriel, lireEchelle } from './pdfPlanLogique'
import { canevasBlanc, encoderRendu } from './renduNiveau'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// pdf.js transfère le tampon à son worker : on lui en donne une copie, le
// fichier sert encore ensuite (envoi de la source)
export const ouvrirPdfEdl = (octets) => pdfjs.getDocument({ data: octets.slice() }).promise

export async function examinerPages(doc) {
  const pages = []
  for (let numero = 1; numero <= doc.numPages; numero++) {
    const page = await doc.getPage(numero)
    const ops = await page.getOperatorList()
    const contenu = await page.getTextContent()
    const textes = contenu.items.map((i) => i.str).filter(Boolean)
    pages.push({ numero, vectoriel: estVectoriel(ops.fnArray, pdfjs.OPS), echelle: lireEchelle([...textes, textes.join(' ')]) })
  }
  return pages
}

export async function rendrePage(doc, numero) {
  const page = await doc.getPage(numero)
  const base = page.getViewport({ scale: 1 })
  const cible = dimensionsPlan(base.width * 100, base.height * 100)
  const viewport = page.getViewport({ scale: cible.largeur / base.width })
  const { canvas, ctx } = canevasBlanc(Math.floor(viewport.width), Math.floor(viewport.height))
  await page.render({ canvasContext: ctx, viewport }).promise
  const contenu = await page.getTextContent()
  const textes = contenu.items
    .filter((i) => i.str?.trim())
    .map((i) => {
      const [x, y] = viewport.convertToViewportPoint(i.transform[4], i.transform[5])
      return { texte: i.str, x, y }
    })
  return { canvas, viewport, textes }
}

export function pointPdfEnMetres(viewport, [px, py], mpp) {
  const [x, y] = viewport.convertToPdfPoint(px, py)
  return [x * mpp, y * mpp]
}

export async function decouperNiveau(page, cadrePx, mpp) {
  const [x0, y0, x1, y1] = cadrePx.map((v) => Math.round(v))
  const { canvas, ctx } = canevasBlanc(x1 - x0, y1 - y0)
  ctx.drawImage(page.canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0)
  const basGauche = pointPdfEnMetres(page.viewport, [x0, y1], mpp)
  const hautDroit = pointPdfEnMetres(page.viewport, [x1, y0], mpp)
  const cadrage = {
    x0: Math.min(basGauche[0], hautDroit[0]), y0: Math.min(basGauche[1], hautDroit[1]),
    x1: Math.max(basGauche[0], hautDroit[0]), y1: Math.max(basGauche[1], hautDroit[1]),
    largeur: canvas.width, hauteur: canvas.height,
  }
  cadrage.pxParMetre = canvas.width / (cadrage.x1 - cadrage.x0)
  const rendu = await encoderRendu(canvas)
  canvas.width = 0
  canvas.height = 0
  return { cadrage, rendu }
}
