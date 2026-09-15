import { useState, createContext, useContext } from 'react'
import { useCr } from './CrContexte'
import { compresserPhoto } from './compressionPhoto'

// ─── Photos d'une remarque ───────────────────────────────────────────────────
//
// Données et opérations fournies par CrDetail via PhotosContexte :
// photos du compte rendu, liens des miniatures, envoi, annotation, légende,
// suppression. Une ligne de remarque utilise usePhotosRemarque pour partager
// l'état entre son bouton « Photo » et ses miniatures.

export const PhotosContexte = createContext({
  photos: [], liens: new Map(), espacePlein: false,
  ajouterPhotos: async () => {}, remplacerPhoto: async () => {},
  modifierLegendePhoto: async () => {}, supprimerPhoto: async () => {},
  liensPhotos: async () => new Map(),
})

export function usePhotosRemarque(remarque) {
  const ctx = useContext(PhotosContexte)
  const { signalerErreur } = useCr()
  const photos = ctx.photos.filter(p => p.remarque_id === remarque.id)
  const [annotation, setAnnotation] = useState(null) // { source, photo? }
  const [visionneuse, setVisionneuse] = useState(null) // index
  const [envoi, setEnvoi] = useState(null) // { total }
  const [enregistrement, setEnregistrement] = useState(false)

  const verifierEspace = () => {
    if (!ctx.espacePlein) return true
    signalerErreur(new Error('L’espace de stockage gratuit est presque plein : supprimez des photos inutiles avant d’en ajouter.'))
    return false
  }

  // Galerie : plusieurs photos envoyées d'un coup, à annoter ensuite si besoin
  const envoyerFichiers = async (fichiers) => {
    if (fichiers.length === 0 || !verifierEspace()) return
    setEnvoi({ total: fichiers.length })
    try {
      const compressions = []
      for (const f of fichiers) compressions.push(await compresserPhoto(f))
      await ctx.ajouterPhotos(remarque.id, compressions)
    } catch (err) {
      signalerErreur(err)
    }
    setEnvoi(null)
  }

  // Appareil photo : on annote tout de suite, sur place
  const annoterNouvelle = (fichier) => {
    if (fichier && verifierEspace()) setAnnotation({ source: fichier })
  }

  const annoterExistante = async (photo) => {
    try {
      const liens = await ctx.liensPhotos([photo.chemin])
      setVisionneuse(null)
      setAnnotation({ source: liens.get(photo.chemin), photo })
    } catch (err) { signalerErreur(err) }
  }

  const validerAnnotation = async (canvas) => {
    setEnregistrement(true)
    try {
      const compression = await compresserPhoto(canvas)
      if (annotation.photo) await ctx.remplacerPhoto(annotation.photo, compression)
      else await ctx.ajouterPhotos(remarque.id, [compression])
      setAnnotation(null)
    } catch (err) {
      signalerErreur(err)
    }
    setEnregistrement(false)
  }

  return {
    remarque, photos, liens: ctx.liens, envoi, annotation, visionneuse, enregistrement,
    envoyerFichiers, annoterNouvelle, annoterExistante, validerAnnotation,
    ouvrir: setVisionneuse, fermer: () => setVisionneuse(null),
    fermerAnnotation: () => setAnnotation(null),
    modifierLegende: (photo, legende) => ctx.modifierLegendePhoto(photo.id, legende).catch(signalerErreur),
    supprimer: async (photo) => {
      try {
        await ctx.supprimerPhoto(photo)
        setVisionneuse(null)
      } catch (err) { signalerErreur(err) }
    },
    liensPhotos: ctx.liensPhotos,
  }
}
