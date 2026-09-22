import { useParams } from 'react-router-dom'
import { GanttChart } from './GanttChart'
import { useAffaire } from '../../../shared/hooks/useAffaires'

export default function PlanningChantierModule() {
  const { affaireId } = useParams()
  const { affaire, updateAffaire } = useAffaire(affaireId)
  return (
    <GanttChart
      affaireId={affaireId}
      affaireNumero={affaire?.code_affaire ?? ''}
      affaireTitre={affaire?.nom ?? ''}
      affaire={affaire ?? {}}
      onModifierAffaire={updateAffaire}
    />
  )
}
