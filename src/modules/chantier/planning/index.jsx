import { useParams } from 'react-router-dom'
import { GanttChart } from './GanttChart'
import { useAffaire } from '../../../shared/hooks/useAffaires'

export default function PlanningChantierModule({ lectureSeule = false, peutModifierFiche = true }) {
  const { affaireId } = useParams()
  const { affaire, updateAffaire } = useAffaire(affaireId)
  return (
    <GanttChart
      affaireId={affaireId}
      affaireNumero={affaire?.code_affaire ?? ''}
      affaireTitre={affaire?.nom ?? ''}
      affaire={affaire ?? {}}
      // Les dates de l'affaire suivent un décalage : un champ de la fiche,
      // donc au responsable ou à l'administrateur seulement
      onModifierAffaire={peutModifierFiche ? updateAffaire : undefined}
      lectureSeule={lectureSeule}
    />
  )
}
