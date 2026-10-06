// ─── Pages d'un PDF en images, pour l'aperçu dans la page ────────────────────
//
// Chargé à la demande avec pdf.js. Le tampon est copié : pdf.js le transfère
// à son worker et le laisserait vide (« detached ArrayBuffer »).

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Chaque page du PDF en image JPEG (URL d'objet), `largeur` pixels de large */
export async function pagesEnImages(blob, largeur) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  try {
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const unite = page.getViewport({ scale: 1 })
      const vue = page.getViewport({ scale: largeur / unite.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vue.width)
      canvas.height = Math.round(vue.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise
      const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
      pages.push({ url: URL.createObjectURL(image), largeur: canvas.width, hauteur: canvas.height })
      page.cleanup()
    }
    return pages
  } finally {
    doc.destroy()
  }
}
