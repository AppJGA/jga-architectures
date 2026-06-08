const PHASE_CONFIG = {
  esq:      { label: 'Étude · ESQ', color: '#C44A1B', bg: 'rgba(248,184,154,0.18)' },
  avp:      { label: 'Étude · AVP', color: '#C44A1B', bg: 'rgba(248,184,154,0.18)' },
  pro:      { label: 'Étude · PRO', color: '#C44A1B', bg: 'rgba(248,184,154,0.18)' },
  dce:      { label: 'Étude · DCE', color: '#C44A1B', bg: 'rgba(248,184,154,0.18)' },
  pc:       { label: 'Étude · PC',  color: '#C44A1B', bg: 'rgba(248,184,154,0.18)' },
  chantier: { label: 'Chantier',    color: '#2A8A4E', bg: 'rgba(42,138,78,0.12)' },
  livree:   { label: 'Livrée',      color: '#5E5854', bg: '#E9E2D6' },
}

export function PhaseBadge({ phase }) {
  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG.esq
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
      }}
    >
      {config.label}
    </span>
  )
}

export function StatusBadge({ statut }) {
  const config = {
    ouverte:  { label: 'Ouverte',   color: '#B8412C', bg: 'rgba(184,65,44,0.10)' },
    en_cours: { label: 'En cours',  color: '#D97706', bg: '#FEF3C7' },
    levee:    { label: 'Levée',     color: '#2A8A4E', bg: 'rgba(42,138,78,0.12)' },
  }[statut] ?? { label: statut, color: '#5E5854', bg: '#F3F4F6' }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
      }}
    >
      {config.label}
    </span>
  )
}
