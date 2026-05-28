import { PlaceholderModule } from '../../PlaceholderModule'
import { CheckSquare } from 'lucide-react'

export default function TodoModule() {
  return (
    <PlaceholderModule
      label="To-do list"
      description="Tâches par phase d'étude"
      icon={CheckSquare}
      phaseColor="#E05A1E"
    />
  )
}
