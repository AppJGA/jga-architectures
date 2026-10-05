import { CalendarCheck } from 'lucide-react'
import { libelleConvocation } from './convocationLogique'

/** « Convoqué au CR n°2 · 09h00 », à côté d'un participant attendu à cette réunion. */
export function MentionConvocation({ convocation, petite = false }) {
  if (!convocation) return null
  return (
    <span title="Convoqué à cette réunion dans le compte rendu précédent" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3,
      fontSize: petite ? 10 : 12, fontWeight: 600, color: '#1B3A5C', background: 'rgba(27,58,92,0.10)',
      borderRadius: 3, padding: petite ? '1px 6px' : '2px 8px', whiteSpace: 'nowrap',
    }}>
      <CalendarCheck size={petite ? 11 : 13} /> {libelleConvocation(convocation)}
    </span>
  )
}
