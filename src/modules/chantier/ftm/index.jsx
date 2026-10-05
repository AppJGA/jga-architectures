import { Navigate, useParams, useSearchParams } from 'react-router-dom'

// Les fiches de travaux modificatifs se consultent et s'éditent depuis le
// suivi financier : une FTM, c'est toujours de l'argent sur un lot. Cette
// adresse reste pour les liens déjà donnés (?ftm=… ouvre la fiche là-bas).
export default function FtmModule() {
  const { affaireId } = useParams()
  const [params] = useSearchParams()
  const ftm = params.get('ftm')
  return <Navigate replace to={`/affaires/${affaireId}/financier-chantier${ftm ? `?ftm=${encodeURIComponent(ftm)}` : ''}`} />
}
