const PHASE_COLORS = {
  esq:      'var(--jga-orange)',
  avp:      'var(--jga-orange)',
  pro:      'var(--jga-orange)',
  dce:      'var(--jga-orange)',
  pc:       'var(--jga-orange)',
  chantier: 'var(--jga-green)',
  livree:   'var(--jga-beige)',
}

export function ProgressBar({ value, phase = 'esq' }) {
  const color = PHASE_COLORS[phase] ?? 'var(--jga-orange)'
  return (
    <div
      style={{
        width: '100%',
        height: 3,
        borderRadius: 99,
        backgroundColor: 'rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          height: 3,
          borderRadius: 99,
          width: `${Math.min(100, Math.max(0, value))}%`,
          backgroundColor: color,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}
