import { useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../auth/useAuth'

export function Topbar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const isHome = location.pathname === '/home'

  const initials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'JG'

  return (
    <header
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 14,
        borderBottom: '0.5px solid rgba(0,0,0,0.1)',
        backgroundColor: 'white',
        flexShrink: 0,
      }}
    >
      {/* Logo image */}
      <img
        src="/Logo_JGA_Archi.jpg"
        alt="JGA Architectures"
        style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
      />

      {/* Fixed app name — hidden on home page */}
      {!isHome && (
        <>
          <div style={{ width: 1, height: 20, backgroundColor: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#1a1a1a',
            borderLeft: 'none',
            flex: 1,
          }}>
            Gestionnaire d'affaire
          </span>
        </>
      )}

      {isHome && <div style={{ flex: 1 }} />}

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* TODO: Système de notifications
         * Déclencher sur : échéance phase planning étude,
         * jalon planning chantier, FTM en attente de décision */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 20,
            border: '0.5px solid rgba(0,0,0,0.12)',
            backgroundColor: 'white',
            cursor: 'default',
            fontSize: 12,
            color: '#6b7280',
          }}
          tabIndex={-1}
        >
          <Bell size={14} style={{ color: '#6b7280' }} />
          <span>0</span>
        </button>

        <button
          onClick={signOut}
          title="Se déconnecter"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            backgroundColor: 'var(--jga-orange)',
            color: 'white',
            fontSize: 11,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {initials}
        </button>
      </div>
    </header>
  )
}
