// ─── Constantes de l'état des lieux sans dépendance lourde ───────────────────
//
// À part d'`edlDonnees.js` (qui tire fflate) : la synchro de la visite est
// montée dans la coquille de l'app et ne doit pas alourdir le premier chargement.

export const BUCKET_EDL = 'edl'

export const edlIndisponible = (error) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /edl_\w+.*(does not exist|schema cache)/i.test(error?.message ?? '')

// Base sans la migration 081 : la colonne manque (42703 de PostgreSQL, ou
// PGRST204 quand le cache de PostgREST ne la connaît pas). L'étage s'enregistre
// alors sans son fichier vectoriel et s'affiche par son image, comme avant.
// Le nom de la colonne est exigé : une autre colonne manquante ne doit pas
// faire perdre le fichier vectoriel en silence.
export function colonnesVecteursManquantes(error) {
  const texte = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`
  if (!/chemin_vecteurs|calques/i.test(texte)) return false
  return error?.code === '42703' || error?.code === 'PGRST204' || /does not exist|schema cache/i.test(texte)
}
