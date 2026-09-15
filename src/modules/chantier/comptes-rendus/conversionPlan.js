// ─── Conversion d'un plan en image, sur l'appareil ───────────────────────────
//
// Un plan PDF pèse souvent 5 à 30 Mo : il est rendu en image (plansLogique :
// 6 000 px et 16 millions de pixels au plus), puis compressé. Seules l'image
// et son aperçu sont envoyés ; le PDF d'origine reste sur l'appareil.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { chargerImage, encoderImage } from './compressionPhoto'
import { dimensionsPlan, TAILLE_APERCU_PLAN } from './plansLogique'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Traits fins d'un plan : une compression plus douce que pour une photo
const QUALITE_PLAN = 0.85
const QUALITE_APERCU = 0.78

export function estPdf(fichier) {
  return fichier?.type === 'application/pdf' || /\.pdf$/i.test(fichier?.name ?? '')
}

export async function ouvrirPdf(fichier) {
  try {
    return await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise
  } catch {
    throw new Error('Ce PDF n’a pas pu être ouvert (fichier protégé ou endommagé ?).')
  }
}

// Petite image d'une page, pour choisir la bonne dans un PDF de plusieurs pages
export async function vignettePage(doc, numero, largeur = 240) {
  const page = await doc.getPage(numero)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: largeur / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.7)
}

function canevasBlanc(largeur, hauteur) {
  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, largeur, hauteur)
  return { canvas, ctx }
}

/**
 * @param source { doc, page } pour un PDF, ou un fichier image
 * @returns { plan: { blob, largeur, hauteur }, apercu: { blob, largeur, hauteur }, extension }
 */
export async function convertirPlan(source) {
  let grand
  if (source.doc) {
    const page = await source.doc.getPage(source.page)
    const base = page.getViewport({ scale: 1 })
    // Un PDF est vectoriel : on le rend aussi grand que le plafond le permet
    const cible = dimensionsPlan(base.width * 100, base.height * 100)
    const viewport = page.getViewport({ scale: cible.largeur / base.width })
    grand = canevasBlanc(Math.floor(viewport.width), Math.floor(viewport.height))
    await page.render({ canvasContext: grand.ctx, viewport }).promise
  } else {
    const image = await chargerImage(source)
    const cible = dimensionsPlan(image.naturalWidth, image.naturalHeight)
    grand = canevasBlanc(cible.largeur, cible.hauteur)
    grand.ctx.imageSmoothingQuality = 'high'
    grand.ctx.drawImage(image, 0, 0, cible.largeur, cible.hauteur)
  }

  const echelle = Math.min(1, TAILLE_APERCU_PLAN / Math.max(grand.canvas.width, grand.canvas.height))
  const petit = canevasBlanc(Math.round(grand.canvas.width * echelle), Math.round(grand.canvas.height * echelle))
  petit.ctx.imageSmoothingQuality = 'high'
  petit.ctx.drawImage(grand.canvas, 0, 0, petit.canvas.width, petit.canvas.height)

  const { width: largeur, height: hauteur } = grand.canvas
  const planBlob = await encoderImage(grand.canvas, QUALITE_PLAN)
  const apercuBlob = await encoderImage(petit.canvas, QUALITE_APERCU)
  // Libère la mémoire du grand canevas tout de suite (iPad)
  grand.canvas.width = 0
  grand.canvas.height = 0
  return {
    plan: { blob: planBlob, largeur, hauteur },
    apercu: { blob: apercuBlob, largeur: petit.canvas.width, hauteur: petit.canvas.height },
    extension: planBlob.type === 'image/webp' ? 'webp' : 'jpg',
  }
}
