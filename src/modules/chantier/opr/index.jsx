import { PlaceholderModule } from '../../PlaceholderModule'
import { ClipboardCheck } from 'lucide-react'

export default function OprModule() {
  return (
    <PlaceholderModule
      label="OPR"
      description="Opérations Préalables à la Réception"
      icon={ClipboardCheck}
      phaseColor="#639922"
    />
  )
}
