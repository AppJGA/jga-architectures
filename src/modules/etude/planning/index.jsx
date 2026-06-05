import { useParams } from 'react-router-dom'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { GanttEtude } from './GanttEtude'

export default function PlanningEtudeModule() {
  const { affaireId } = useParams()
  const { affaire } = useAffaire(affaireId)

  return (
    <GanttEtude
      affaireId={affaireId}
      affaireNumero={affaire?.numero ?? ''}
      affaireTitre={affaire?.nom ?? ''}
      affaire={affaire ?? {}}
    />
  )
}
