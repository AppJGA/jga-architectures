// ─── Pages d'un PDF en images, pour l'aperçu dans la page ────────────────────
//
// Chargé à la demande avec pdf.js. Le tampon est copié : pdf.js le transfère
// à son worker et le laisserait vide (« detached ArrayBuffer »).

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Chaque page du PDF en image JPEG (URL d'objet), `largeur` pixels de large
 * — ou `largeur(page)` d'après la page à l'échelle 1 (`{ width, height }` en
 * points), quand un document mêle des formats (planches A3 de l'état des
 * lieux et pages A4).
 * `abandonne()` vrai : arrêt entre deux pages (aperçu devenu périmé), rend
 * null. `surPage(image, i, total)` : chaque page dès qu'elle est prête, pour
 * un long document (export de l'état des lieux) — l'appelant possède alors
 * chaque image reçue et la libère lui-même ; sans `surPage`, un abandon
 * libère les images déjà faites.
 */
export async function pagesEnImages(blob, largeur, { abandonne = () => false, surPage = null } = {}) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  try {
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      if (abandonne()) {
        if (!surPage) for (const p of pages) URL.revokeObjectURL(p.url)
        return null
      }
      const page = await doc.getPage(i)
      const unite = page.getViewport({ scale: 1 })
      const cible = typeof largeur === 'function' ? largeur(unite) : largeur
      const vue = page.getViewport({ scale: cible / unite.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vue.width)
      canvas.height = Math.round(vue.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise
      const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
      const rendue = { url: URL.createObjectURL(image), largeur: canvas.width, hauteur: canvas.height }
      pages.push(rendue)
      // Mémoire de canevas rendue tout de suite : l'iPad la plafonne
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
      surPage?.(rendue, i, doc.numPages)
    }
    return pages
  } finally {
    doc.destroy()
  }
}
