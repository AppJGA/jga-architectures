import { CalendarCheck, CalendarX } from 'lucide-react'
import { libelleConvocation, libelleConvoquesAbsents } from './convocationLogique'

export const ROUGE_ABSENT = '#B8412C'
export const FOND_ABSENT = 'rgba(184,65,44,0.07)'

/**
 * « Convoqué au CR n°2 · 09h00 », à côté d'un participant attendu à cette
 * réunion ; en rouge, suivi de « absent », s'il a été pointé absent.
 */
export function MentionConvocation({ convocation, absent = false, petite = false }) {
  if (!convocation) return null
  const Icone = absent ? CalendarX : CalendarCheck
  return (
    <span title={absent ? 'Convoqué à cette réunion dans le compte rendu précédent, et absent' : 'Convoqué à cette réunion dans le compte rendu précédent'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3,
      fontSize: petite ? 10 : 12, fontWeight: 600,
      color: absent ? 'white' : '#1B3A5C', background: absent ? ROUGE_ABSENT : 'rgba(27,58,92,0.10)',
      borderRadius: 3, padding: petite ? '1px 6px' : '2px 8px', whiteSpace: 'nowrap',
    }}>
      <Icone size={petite ? 11 : 13} /> {libelleConvocation(convocation)}{absent ? ' — absent' : ''}
    </span>
  )
}

/** Bandeau rouge « 2 convoqués absents » en tête des présences. */
export function CompteurConvoquesAbsents({ nombre, grand = false }) {
  if (!nombre) return null
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: grand ? 12 : 16,
      padding: grand ? '10px 14px' : '8px 14px', background: FOND_ABSENT,
      borderLeft: `3px solid ${ROUGE_ABSENT}`, color: ROUGE_ABSENT,
      fontSize: grand ? 15 : 12, fontWeight: 600,
    }}>
      <CalendarX size={grand ? 18 : 15} /> {libelleConvoquesAbsents(nombre)}
    </div>
  )
}
