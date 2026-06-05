import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function PlaceholderModule({ label, description, icon: Icon, phaseColor }) {
  const navigate = useNavigate()
  const { affaireId } = useParams()

  const lightBg = phaseColor === '#2A8A4E' ? 'rgba(42,138,78,0.12)' : 'rgba(232,96,44,0.10)'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 320,
      textAlign: 'center',
      padding: 40,
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: lightBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
      }}>
        {Icon && <Icon size={28} style={{ color: phaseColor }} />}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 500, color: '#1F1B17', marginBottom: 8 }}>
        {label}
      </h2>

      <p style={{ fontSize: 13, color: 'var(--jga-beige)', marginBottom: 20, maxWidth: 320 }}>
        {description}
      </p>

      <span style={{
        fontSize: 11,
        backgroundColor: '#F1EFE8',
        color: 'var(--jga-beige)',
        borderRadius: 20,
        padding: '4px 12px',
        marginBottom: 28,
        display: 'inline-block',
      }}>
        En cours de développement
      </span>

      <button
        onClick={() => navigate(`/affaires/${affaireId}`)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          borderRadius: 8,
          border: '0.5px solid var(--jga-orange)',
          backgroundColor: 'transparent',
          color: 'var(--jga-orange)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={13} />
        Retour à l'affaire
      </button>
    </div>
  )
}
