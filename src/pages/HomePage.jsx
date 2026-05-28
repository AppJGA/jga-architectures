import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Wrench } from 'lucide-react'
import { useAuth } from '../core/auth/useAuth'

function HomeCard({ icon: Icon, iconBg, iconColor, title, description, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        backgroundColor: hovered ? 'var(--jga-orange-light)' : 'white',
        borderRadius: 16,
        border: hovered ? '0.5px solid var(--jga-orange)' : '0.5px solid rgba(0,0,0,0.08)',
        padding: '36px 28px',
        textAlign: 'center',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.18s',
        boxShadow: hovered ? '0 8px 24px rgba(224,90,30,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto',
      }}>
        <Icon size={24} style={{ color: iconColor }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', margin: '16px 0 8px' }}>
        {title}
      </p>
      <p style={{ fontSize: 12, color: '#9B8F85', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const rawPrenom = user?.email?.split('@')[0]?.split('.')?.[0] ?? 'vous'
  const prenom = rawPrenom.charAt(0).toUpperCase() + rawPrenom.slice(1)

  return (
    <div style={{
      minHeight: 'calc(100vh - 52px)',
      backgroundColor: '#F5F2F0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '48px 24px',
    }}>
      {/* Logo */}
      <img
        src="/Logo_JGA_Archi.jpg"
        alt="JGA Architectures"
        style={{ height: 80, width: 'auto', objectFit: 'contain', marginBottom: 40 }}
      />

      {/* Welcome */}
      <p style={{ fontSize: 18, fontWeight: 500, color: '#1a1a1a', textAlign: 'center', marginBottom: 8 }}>
        Bonjour, {prenom}
      </p>
      <p style={{ fontSize: 13, color: '#9B8F85', textAlign: 'center', marginBottom: 48 }}>
        Que souhaitez-vous faire ?
      </p>

      {/* Cards */}
      <div style={{
        display: 'flex', gap: 20,
        maxWidth: 560, width: '100%',
        margin: '0 auto',
      }}>
        <HomeCard
          icon={Building2}
          iconBg="#FAF0EB"
          iconColor="var(--jga-orange)"
          title="Affaires"
          description="Gérez vos projets et suivez leur avancement"
          onClick={() => navigate('/dashboard')}
        />
        <HomeCard
          icon={Wrench}
          iconBg="#EAF3DE"
          iconColor="#639922"
          title="Boîte à outils"
          description="Outils transversaux disponibles pour tous les collaborateurs"
          onClick={() => navigate('/tools')}
        />
      </div>

      {/* Footer */}
      <p style={{
        position: 'absolute', bottom: 24,
        fontSize: 10, color: '#9B8F85',
        textAlign: 'center',
      }}>
        JGA Architectures · Espace collaborateur
      </p>
    </div>
  )
}
