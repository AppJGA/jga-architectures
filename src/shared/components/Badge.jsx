const PHASE_CONFIG = {
  esq:      { label: 'Étude · ESQ', color: '#993C1D', bg: '#FAF0EB' },
  avp:      { label: 'Étude · AVP', color: '#993C1D', bg: '#FAF0EB' },
  pro:      { label: 'Étude · PRO', color: '#993C1D', bg: '#FAF0EB' },
  dce:      { label: 'Étude · DCE', color: '#993C1D', bg: '#FAF0EB' },
  pc:       { label: 'Étude · PC',  color: '#993C1D', bg: '#FAF0EB' },
  chantier: { label: 'Chantier',    color: '#3B6D11', bg: '#EAF3DE' },
  livree:   { label: 'Livrée',      color: '#5F5E5A', bg: '#F1EFE8' },
}

export function PhaseBadge({ phase }) {
  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG.esq
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
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
    ouverte:  { label: 'Ouverte',   color: '#DC2626', bg: '#FEE2E2' },
    en_cours: { label: 'En cours',  color: '#D97706', bg: '#FEF3C7' },
    levee:    { label: 'Levée',     color: '#059669', bg: '#D1FAE5' },
  }[statut] ?? { label: statut, color: '#6B7280', bg: '#F3F4F6' }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
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
