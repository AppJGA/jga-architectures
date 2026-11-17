// ─── Photos des points, sur l'appareil ───────────────────────────────────────
//
// Compressées comme celles des comptes rendus (1 920 px, WebP, miniature),
// rangées dans la base `jga-edl` jusqu'à leur envoi (envoiEdl.js), puis
// effacées de l'appareil. La miniature locale sert tant que la photo n'est
// pas partie.

import { compresserPhoto } from '../../../chantier/comptes-rendus/compressionPhoto'
import { cheminsPhotoEdl } from './visiteLogique'
import { MAGASINS_EDL, ecrire, lire } from './baseEdl'

export async function preparerPhoto(affaireId, fichier) {
  const c = await compresserPhoto(fichier)
  const id = crypto.randomUUID()
  await ecrire(MAGASINS_EDL.fichiers, { id, photo: c.photo.blob, miniature: c.miniature.blob })
  return {
    id, ...cheminsPhotoEdl(affaireId, id, c.extension),
    largeur: c.photo.largeur, hauteur: c.photo.hauteur,
    poids_octets: c.photo.blob.size + c.miniature.blob.size,
  }
}

const urls = new Map() // id → object URL, le temps de la session

export async function miniatureLocale(id) {
  if (urls.has(id)) return urls.get(id)
  const fichier = await lire(MAGASINS_EDL.fichiers, id).catch(() => null)
  if (!fichier?.miniature) return undefined
  const url = URL.createObjectURL(fichier.miniature)
  urls.set(id, url)
  return url
}
