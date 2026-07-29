// ─── Compression d'image avant envoi ────────────────────────────────────────
//
// Redimensionne et réencode en WebP dans un canvas, côté navigateur : une photo
// de chantier de 8 Mo part à quelques dizaines de kilo-octets, sans passer par
// le réseau ni par un service tiers.

// Réglages des photos de couverture d'affaire.
export const COVER_OPTIONS = {
  maxWidth: 1200,
  maxHeight: 800,
  quality: 0.82,
  format: 'image/webp',
}

// Garde-fou avant décodage : au-delà, le navigateur peut saturer sa mémoire en
// dépliant l'image. Ce n'est pas une limite d'usage — une photo d'appareil
// reflex dépasse rarement 30 Mo — mais un filet contre un fichier aberrant.
export const TAILLE_MAX_OCTETS = 50 * 1024 * 1024

// Dimensions cibles à ratio constant : on ne réduit jamais une image déjà plus
// petite que le cadre (l'agrandir n'ajouterait aucun détail et alourdirait le
// fichier).
export function dimensionsCibles(largeur, hauteur, maxLargeur, maxHauteur) {
  if (!largeur || !hauteur) return { largeur: 0, hauteur: 0 }
  if (largeur <= maxLargeur && hauteur <= maxHauteur) {
    return { largeur: Math.round(largeur), hauteur: Math.round(hauteur) }
  }
  const facteur = Math.min(maxLargeur / largeur, maxHauteur / hauteur)
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  }
}

// Nom de fichier avec l'extension du format produit.
export function nomCompresse(nom, format = 'image/webp') {
  const ext = format.split('/')[1] ?? 'webp'
  const base = (nom || 'image').replace(/\.[^./\\]*$/, '')
  return `${base}.${ext}`
}

export function compressImage(file, options = {}) {
  const {
    maxWidth = COVER_OPTIONS.maxWidth,
    maxHeight = COVER_OPTIONS.maxHeight,
    quality = COVER_OPTIONS.quality,
    format = COVER_OPTIONS.format,
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const { largeur, hauteur } = dimensionsCibles(
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        maxWidth, maxHeight
      )
      if (!largeur || !hauteur) {
        reject(new Error('Image de dimensions nulles'))
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = largeur
      canvas.height = hauteur

      const ctx = canvas.getContext('2d')
      // Fond blanc : un PNG transparent réencodé en WebP sans fond ressortirait
      // en noir sur la carte d'affaire.
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, largeur, hauteur)
      ctx.drawImage(img, 0, 0, largeur, hauteur)

      canvas.toBlob(
        (blob) => {
          // `toBlob` rend null si le format n'est pas gérable : mieux vaut le
          // dire que renvoyer le fichier d'origine, qui serait alors envoyé
          // sous une étiquette WebP mensongère.
          if (!blob) {
            reject(new Error('Format d’image non pris en charge par le navigateur'))
            return
          }
          resolve(new File([blob], nomCompresse(file.name, format), { type: format }))
        },
        format,
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Fichier illisible — ce n’est pas une image valide'))
    }

    img.src = url
  })
}
