// Décodage et encodage dans le navigateur. Rien ne quitte l'appareil : pas
// d'envoi vers Supabase, dont le stockage gratuit plafonne à 1 Go.

import { formatDe, dimensionsCible } from './conversionLogique'

// heic-to embarque libheif (~3 Mo) : il n'est chargé qu'au premier HEIC
let decodeurHeic = null
const chargerDecodeurHeic = () => (decodeurHeic ??= import('heic-to').then(m => m.heicTo))

export async function lireEntete(fichier) {
  return new Uint8Array(await fichier.slice(0, 16).arrayBuffer())
}

// libheif applique la rotation enregistrée par l'iPhone, createImageBitmap
// celle de l'EXIF : l'image arrive droite dans les deux cas.
async function decoder(fichier, format) {
  if (format.navigateur) return createImageBitmap(fichier, { imageOrientation: 'from-image' })
  const heicTo = await chargerDecodeurHeic()
  return heicTo({ blob: fichier, type: 'bitmap' })
}

// Repasser par un canvas laisse en route toutes les métadonnées (date, GPS,
// appareil) : c'est voulu, les photos partent chez des tiers.
export async function convertir(fichier, sortie, taille) {
  const format = formatDe(fichier.name, await lireEntete(fichier))
  if (!format) throw new Error('Format non reconnu')

  const image = await decoder(fichier, format)
  const { largeur, hauteur } = dimensionsCible(image.width, image.height, taille.coteMax)
  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  try {
    const ctx = canvas.getContext('2d')
    // Le JPEG n'a pas de transparence : sans fond, celle d'un PNG virerait au noir
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, largeur, hauteur)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, largeur, hauteur)
    const blob = await new Promise(res => canvas.toBlob(res, sortie.mime, taille.qualite))
    if (!blob) throw new Error('Image trop grande pour ce navigateur')
    return { blob, largeur, hauteur, formatEntree: format }
  } finally {
    image.close?.()
    // Libère tout de suite la mémoire de l'image : un lot de photos de 12 Mpx
    // saturerait sinon l'onglet avant la fin
    canvas.width = 0
    canvas.height = 0
  }
}

// Les JPEG sont déjà compressés : les recompresser dans le ZIP ne fait gagner
// que du temps perdu.
export async function fabriquerZip(fichiers) {
  const { zipSync } = await import('fflate')
  const contenu = {}
  for (const { nom, blob } of fichiers) {
    contenu[nom] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  return new Blob([zipSync(contenu)], { type: 'application/zip' })
}

export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
