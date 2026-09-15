// ─── Photos des remarques : logique pure ─────────────────────────────────────
//
// Sans navigateur ni base, pour être testée (tests/photos.test.js). La
// compression elle-même, qui a besoin d'un canevas, est dans compressionPhoto.js.

// Largeur (ou hauteur) maximale d'une photo : nette en plein écran sur une
// tablette, ~300 Ko en WebP. La miniature sert aux listes, pour ne pas
// télécharger la photo entière à chaque affichage.
export const TAILLE_PHOTO = 1920
export const TAILLE_MINIATURE = 400

// Offre gratuite de Supabase : 1 Go de stockage pour tout le projet
export const LIMITE_STOCKAGE = 1024 ** 3

// Dimensions après réduction, proportions gardées, jamais agrandies
export function dimensionsCible(largeur, hauteur, max) {
  const echelle = Math.min(1, max / Math.max(largeur, hauteur))
  return {
    largeur: Math.max(1, Math.round(largeur * echelle)),
    hauteur: Math.max(1, Math.round(hauteur * echelle)),
  }
}

// Rangement dans le stockage : un dossier par affaire
export function cheminsPhoto(affaireId, id, extension) {
  return {
    chemin: `${affaireId}/${id}.${extension}`,
    chemin_miniature: `${affaireId}/${id}-mini.${extension}`,
  }
}

/**
 * Fichiers à effacer du stockage après la suppression de lignes photo.
 * Une même photo est partagée par les copies d'une remarque reprise de visite
 * en visite : on n'efface que les fichiers qu'aucune ligne restante ne désigne.
 *
 * @param photosSupprimees lignes supprimées ({ chemin, chemin_miniature })
 * @param cheminsEncoreUtilises chemins encore présents dans cr_photos
 */
export function fichiersAEffacer(photosSupprimees, cheminsEncoreUtilises) {
  const utilises = new Set(cheminsEncoreUtilises)
  const fichiers = new Set()
  for (const p of photosSupprimees ?? []) {
    if (!p?.chemin || utilises.has(p.chemin)) continue
    fichiers.add(p.chemin)
    if (p.chemin_miniature) fichiers.add(p.chemin_miniature)
  }
  return [...fichiers]
}

export function formatOctets(octets) {
  const n = Number(octets) || 0
  const format = (v, unite) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unite}`
  if (n >= 1024 ** 3) return format(n / 1024 ** 3, 'Go')
  if (n >= 1024 ** 2) return format(n / 1024 ** 2, 'Mo')
  if (n >= 1024) return format(n / 1024, 'Ko')
  return `${n} o`
}

// Alerte à 80 % de l'espace gratuit ; au-delà de 98 %, plus d'envoi
export function niveauEspace(utilise, limite = LIMITE_STOCKAGE) {
  const ratio = limite > 0 ? utilise / limite : 0
  return { ratio, alerte: ratio >= 0.8, plein: ratio >= 0.98 }
}

// Les deux branches de la pointe d'une flèche tracée de (x1, y1) vers (x2, y2)
export function pointeFleche(x1, y1, x2, y2, longueur) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const ouverture = Math.PI / 7
  return [
    { x: x2 - longueur * Math.cos(angle - ouverture), y: y2 - longueur * Math.sin(angle - ouverture) },
    { x: x2 - longueur * Math.cos(angle + ouverture), y: y2 - longueur * Math.sin(angle + ouverture) },
  ]
}

// Fichiers inutilisés : une photo compte pour une, miniature comprise ; un
// plan pour un, aperçu compris
export function resumeOrphelines(fichiers) {
  const liste = fichiers ?? []
  const base = (f) => f.chemin.replace(/-(mini|apercu)(\.\w+)$/, '$2')
  const photos = new Set(liste.filter((f) => f.bucket !== 'cr-plans').map(base))
  const plans = new Set(liste.filter((f) => f.bucket === 'cr-plans').map(base))
  const taille = liste.reduce((s, f) => s + (Number(f.taille) || 0), 0)
  return { photos: photos.size, plans: plans.size, fichiers: liste.length, taille }
}

// Par paquets : l'API du stockage limite le nombre de fichiers par suppression
export function paquets(liste, taille = 100) {
  const resultat = []
  for (let i = 0; i < liste.length; i += taille) resultat.push(liste.slice(i, i + taille))
  return resultat
}

// « 2 photos, 1 plan »
export function libelleFichiers({ photos = 0, plans = 0 }) {
  const parts = []
  if (photos) parts.push(`${photos} photo${photos > 1 ? 's' : ''}`)
  if (plans) parts.push(`${plans} plan${plans > 1 ? 's' : ''}`)
  return parts.join(', ')
}
