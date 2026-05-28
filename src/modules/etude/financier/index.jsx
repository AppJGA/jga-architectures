import { PlaceholderModule } from '../../PlaceholderModule'
import { BarChart2 } from 'lucide-react'

export default function FinancierEtudeModule() {
  return (
    <PlaceholderModule
      label="Suivi financier"
      description="Honoraires, avenants, enveloppe prévisionnelle"
      icon={BarChart2}
      phaseColor="#E05A1E"
    />
  )
}
