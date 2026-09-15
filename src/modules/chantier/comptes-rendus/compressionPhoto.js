// ─── Compression des photos, sur l'appareil ──────────────────────────────────
//
// Une photo de téléphone pèse 3 à 5 Mo ; le stockage gratuit de Supabase est
// de 1 Go. Chaque photo est donc redessinée sur un canevas avant l'envoi :
// réduite à TAILLE_PHOTO, réencodée en WebP (JPEG si le navigateur ne sait pas
// produire du WebP, comme d'anciens Safari). Le réencodage retire au passage
// les métadonnées de la photo, dont la position GPS.

import { dimensionsCible, TAILLE_PHOTO, TAILLE_MINIATURE } from './photosLogique'

const QUALITE_PHOTO = 0.8
const QUALITE_MINIATURE = 0.7

// Ouvre un fichier image. Passer par <img> applique l'orientation enregistrée
// par l'appareil (photo prise en portrait) dans tous les navigateurs récents.
export function chargerImage(source) {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      reject(new Error('Ce format de photo n’est pas lu par le navigateur (HEIC par exemple). Exportez-la en JPEG, ou prenez-la depuis l’application.'))
    }
    img.src = url
  })
}

function encoder(canvas, type, qualite) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, qualite))
}

// WebP, ou JPEG si le navigateur ne sait pas en produire (il rendrait du PNG,
// bien plus lourd)
export async function encoderImage(canvas, qualite) {
  let blob = await encoder(canvas, 'image/webp', qualite)
  if (!blob || blob.type !== 'image/webp') blob = await encoder(canvas, 'image/jpeg', Math.min(0.92, qualite + 0.02))
  if (!blob) throw new Error('L’image n’a pas pu être compressée (mémoire de l’appareil insuffisante ?).')
  return blob
}

async function redessiner(image, largeurSource, hauteurSource, max, qualite) {
  const { largeur, hauteur } = dimensionsCible(largeurSource, hauteurSource, max)
  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, largeur, hauteur)
  return { blob: await encoderImage(canvas, qualite), largeur, hauteur }
}

/**
 * Photo prête à l'envoi et sa miniature.
 * @param source File, Blob, ou canevas (photo annotée)
 * @returns { photo: { blob, largeur, hauteur }, miniature: { blob, largeur, hauteur }, extension }
 */
export async function compresserPhoto(source) {
  const image = source instanceof HTMLCanvasElement ? source : await chargerImage(source)
  const l = image.naturalWidth ?? image.width
  const h = image.naturalHeight ?? image.height
  const photo = await redessiner(image, l, h, TAILLE_PHOTO, QUALITE_PHOTO)
  const miniature = await redessiner(image, l, h, TAILLE_MINIATURE, QUALITE_MINIATURE)
  return { photo, miniature, extension: photo.blob.type === 'image/webp' ? 'webp' : 'jpg' }
}
