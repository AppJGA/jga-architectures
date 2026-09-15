// ─── Images du rapport PDF, préparées dans le navigateur ─────────────────────
//
// pdfmake n'accepte que du JPEG ou du PNG en data URL : les photos et plans
// (WebP) sont redessinés sur un canevas, réduits à la taille utile au PDF —
// c'est aussi ce qui garde l'archive légère.

import { chargerImage } from './compressionPhoto'
import { dimensionsCible } from './photosLogique'
import { cadrageExtrait } from './plansLogique'

const cache = new Map() // clé → Promise<dataURL>

async function blobDepuis(url) {
  const reponse = await fetch(url)
  if (!reponse.ok) throw new Error(`Image introuvable (${reponse.status})`)
  return reponse.blob()
}

function enJpeg(canvas, qualite) {
  return canvas.toDataURL('image/jpeg', qualite)
}

/** Image réduite à `max` px, en JPEG. Mise en cache pour la session. */
export function imagePourPdf(url, max = 1000, qualite = 0.72) {
  const cle = `${url}|${max}|${qualite}`
  if (!cache.has(cle)) {
    cache.set(cle, (async () => {
      const image = await chargerImage(await blobDepuis(url))
      const { largeur, hauteur } = dimensionsCible(image.naturalWidth, image.naturalHeight, max)
      const canvas = document.createElement('canvas')
      canvas.width = largeur
      canvas.height = hauteur
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, largeur, hauteur)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, largeur, hauteur)
      return enJpeg(canvas, qualite)
    })().catch((err) => { cache.delete(cle); throw err }))
  }
  return cache.get(cle)
}

function dessinerPastille(ctx, x, y, numero, couleur, rayon) {
  ctx.beginPath()
  ctx.arc(x, y, rayon, 0, Math.PI * 2)
  ctx.fillStyle = couleur
  ctx.fill()
  ctx.lineWidth = rayon * 0.22
  ctx.strokeStyle = 'white'
  ctx.stroke()
  ctx.fillStyle = 'white'
  ctx.font = `bold ${Math.round(rayon * (String(numero).length > 2 ? 0.8 : 1))}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(numero ?? ''), x, y + rayon * 0.05)
}

/** Extrait du plan centré sur la pastille, pastille dessinée, 600 × 400 px */
export async function extraitPlanPourPdf(urlApercu, { x, y, numero, couleur }) {
  const image = await chargerImage(await blobDepuis(urlApercu))
  const L = image.naturalWidth
  const H = image.naturalHeight
  const c = cadrageExtrait(x, y, H / L)
  const largeurFenetre = L * (100 / c.imageLargeur)
  const hauteurFenetre = largeurFenetre * (2 / 3)
  const gauche = (-c.imageGauche / 100) * largeurFenetre
  const haut = (-c.imageHaut / 100) * hauteurFenetre
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 400
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, 600, 400)
  ctx.drawImage(image, gauche, haut, largeurFenetre, hauteurFenetre, 0, 0, 600, 400)
  dessinerPastille(ctx, (c.pastilleX / 100) * 600, (c.pastilleY / 100) * 400, numero, couleur, 17)
  ctx.strokeStyle = '#D1D5DB'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 598, 398)
  return enJpeg(canvas, 0.8)
}

/** Plan entier avec toutes ses pastilles */
export async function plancheAvecPastilles(urlApercu, pastilles) {
  const image = await chargerImage(await blobDepuis(urlApercu))
  const { largeur, hauteur } = dimensionsCible(image.naturalWidth, image.naturalHeight, 2000)
  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, largeur, hauteur)
  ctx.drawImage(image, 0, 0, largeur, hauteur)
  const rayon = Math.max(14, Math.round(largeur / 90))
  for (const p of pastilles) dessinerPastille(ctx, p.x * largeur, p.y * hauteur, p.numero, p.couleur, rayon)
  return enJpeg(canvas, 0.8)
}
