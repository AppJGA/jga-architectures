import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Wrench, BookUser } from 'lucide-react'
import { useAuth } from '../core/auth/useAuth'
import { supabase } from '../core/supabase/client'

const BULLES = [
  {
    label: 'Affaires',
    description: 'Projets et suivi',
    path: '/dashboard',
    Icon: Building2,
    gradient: 'linear-gradient(135deg, #E8602C 0%, #F8B89A 100%)',
  },
  {
    label: 'Boîte à outils',
    description: 'Outils transversaux',
    path: '/tools',
    Icon: Wrench,
    gradient: 'linear-gradient(135deg, #2A8A4E 0%, #8BC34A 100%)',
  },
  {
    label: "Carnet d'adresses",
    description: 'Entreprises et contacts',
    path: '/carnet-adresses',
    Icon: BookUser,
    gradient: 'linear-gradient(135deg, #1B3A5C 0%, #60A5FA 100%)',
  },
]

function Bulle({ bulle, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}
      onClick={onClick}
    >
      <div
        style={{
          width: 100, height: 100, borderRadius: '50%',
          background: bulle.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: hovered ? 'translateY(-4px) scale(1.05)' : 'none',
          boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.15)' : '0 4px 20px rgba(0,0,0,0.10)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <bulle.Icon size={38} color="white" strokeWidth={1.25} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", marginBottom: 3 }}>
          {bulle.label}
        </div>
        <div style={{ fontSize: 11, color: '#9C9591', lineHeight: 1.4, maxWidth: 120 }}>
          {bulle.description}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [prenom, setPrenom] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('prenom')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.prenom && data.prenom !== 'Prénom') setPrenom(data.prenom)
      })
  }, [user])

  return (
    <div style={{
      minHeight: 'calc(100vh - 52px)',
      backgroundColor: '#FAF7F2',
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
        style={{ height: 80, width: 'auto', mixBlendMode: 'multiply', marginBottom: 40 }}
      />

      {/* Salutation */}
      <p style={{ fontSize: 18, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", textAlign: 'center', marginBottom: 8 }}>
        {prenom ? `Bonjour, ${prenom} 👋` : 'Bonjour 👋'}
      </p>
      <p style={{ fontSize: 13, color: '#9C9591', textAlign: 'center', marginBottom: 48 }}>
        Que souhaitez-vous faire ?
      </p>

      {/* Bulles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 40 }}>
        {BULLES.map(bulle => (
          <Bulle key={bulle.path} bulle={bulle} onClick={() => navigate(bulle.path)} />
        ))}
      </div>

      {/* Pied de page */}
      <p style={{ position: 'absolute', bottom: 24, fontSize: 10, color: '#9C9591', textAlign: 'center' }}>
        JGA Architectures · Espace collaborateur
      </p>
    </div>
  )
}
