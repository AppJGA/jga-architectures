import { useNavigate } from 'react-router-dom'
import { Button } from './Button'

export function PlaceholderModule({ icon: Icon, label }) {
  const navigate = useNavigate()
  return (
    <div
      className="flex flex-col items-center justify-center min-h-96 p-8 text-center"
      style={{ color: 'var(--jga-beige)' }}
    >
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
        style={{ backgroundColor: 'var(--jga-orange-light)' }}
      >
        {Icon && <Icon size={32} style={{ color: 'var(--jga-orange)' }} />}
      </div>
      <h2 className="text-base font-medium text-gray-700 mb-1">Module {label}</h2>
      <p className="text-sm mb-6">en cours de développement</p>
      <p className="text-xs mb-6">Ce module sera disponible prochainement.</p>
      <Button variant="secondary" onClick={() => navigate('/dashboard')}>
        Retour au tableau de bord
      </Button>
    </div>
  )
}
