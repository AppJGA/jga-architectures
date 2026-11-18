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
export const colonnesVecteursManquantes = (error) =>
  error?.code === '42703' || error?.code === 'PGRST204' ||
  /(chemin_vecteurs|calques).*(does not exist|schema cache)|column .*(chemin_vecteurs|calques)/i.test(error?.message ?? '')
