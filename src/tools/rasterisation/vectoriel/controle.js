// ─── Contrôle au pixel d'un plan allégé ──────────────────────────────────────
//
// Chaque page de l'original et de la version allégée est rendue par pdf.js à
// la même résolution, puis comparée. Une page où un trait apparaît ou
// disparaît est signalée : l'outil la laisse alors intacte.
//
// Résolution 1:1 (72 points par pouce) : un trait fin manquant s'y voit encore,
// et le rendu de l'original — justement lent — reste de l'ordre de la seconde.

import * as pdfjs from 'pdfjs-dist'
import { comparerPixels, pageConforme } from './comparaison'

export const ECHELLE_CONTROLE = 1
// Au-delà de cette part de pixels légèrement différents, on se méfie : un
// trait très fin manquant peut ne produire que des écarts légers
export const PART_LEGERS_MAX = 0.001

async function rendrePage(doc, numero, echelle) {
  const page = await doc.getPage(numero)
  const vue = page.getViewport({ scale: echelle })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(vue.width))
  canvas.height = Math.max(1, Math.floor(vue.height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vue }).promise
  page.cleanup()
  const donnees = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  // Le canevas peut être libéré tout de suite : seules les données servent
  canvas.width = 0
  canvas.height = 0
  return { donnees, largeur: Math.max(1, Math.floor(vue.width)) }
}

/**
 * @returns [{ page (1…n), conforme, francs, legers, total }]
 */
export async function controlerAllegement(original, allege, { echelle = ECHELLE_CONTROLE, progression = () => {} } = {}) {
  const docA = await pdfjs.getDocument({ data: new Uint8Array(original).slice() }).promise
  const docB = await pdfjs.getDocument({ data: new Uint8Array(allege).slice() }).promise
  const resultats = []
  try {
    const n = Math.min(docA.numPages, docB.numPages)
    for (let p = 1; p <= n; p++) {
      progression((p - 1) / n, `Contrôle de la page ${p} sur ${n}`)
      const a = await rendrePage(docA, p, echelle)
      const b = await rendrePage(docB, p, echelle)
      const ecarts = a.donnees.length === b.donnees.length
        ? comparerPixels(a.donnees, b.donnees, a.largeur)
        : { francs: Infinity, legers: 0, total: a.donnees.length / 4 }
      const conforme = pageConforme(ecarts) && ecarts.legers <= ecarts.total * PART_LEGERS_MAX
      resultats.push({ page: p, conforme, francs: ecarts.francs, legers: ecarts.legers, total: ecarts.total })
    }
  } finally {
    docA.destroy()
    docB.destroy()
  }
  progression(1, 'Contrôle terminé')
  return resultats
}
