// ─── Constantes de l'état des lieux sans dépendance lourde ───────────────────
//
// À part d'`edlDonnees.js` (qui tire fflate) : la synchro de la visite est
// montée dans la coquille de l'app et ne doit pas alourdir le premier chargement.

export const BUCKET_EDL = 'edl'

export const edlIndisponible = (error) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /edl_\w+.*(does not exist|schema cache)/i.test(error?.message ?? '')
