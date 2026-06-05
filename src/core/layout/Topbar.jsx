import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../supabase/client'

export function Topbar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const isHome = location.pathname === '/home'
  const [profile, setProfile] = useState(null)

  const PAGE_TITLES = {
    '/dashboard':       'Tableau de bord',
    '/tools':           'Boîte à outils',
    '/carnet-adresses': "Carnet d'adresses",
  }

  const getPageTitle = (pathname) => {
    if (PAGE_TITLES[pathname] !== undefined) return PAGE_TITLES[pathname]
    if (pathname.startsWith('/affaires/')) return "Gestionnaire d'affaire"
    if (pathname.startsWith('/tools/')) return 'Boîte à outils'
    return "Gestionnaire d'affaire"
  }

  const pageTitle = getPageTitle(location.pathname)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('prenom, nom')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => { setProfile(data ?? null) })
  }, [user?.id])

  const initials = profile
    ? ([(profile.prenom ?? '')[0], (profile.nom ?? '')[0]].filter(Boolean).join('').toUpperCase() || user?.email?.[0].toUpperCase() || 'JG')
    : (user?.email?.[0].toUpperCase() ?? 'JG')

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
      {/* Logo + titre — cliquable sauf sur /home */}
      {isHome ? (
        <>
          <img
            src="/Logo_JGA_Archi.jpg"
            alt="JGA Architectures"
            style={{ height: 28, width: 'auto', objectFit: 'contain', flexShrink: 0, mixBlendMode: 'multiply' }}
          />
          <div style={{ flex: 1 }} />
        </>
      ) : (
        <>
          <button
            onClick={() => navigate('/home')}
            title="Retour à l'accueil"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onMouseEnter={e => { e.currentTarget.querySelector('span').style.color = 'var(--jga-orange)' }}
            onMouseLeave={e => { e.currentTarget.querySelector('span').style.color = '#1F1B17' }}
          >
            <img
              src="/Logo_JGA_Archi.jpg"
              alt="JGA Architectures"
              style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
            />
            {pageTitle && (
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", borderLeft: '1px solid rgba(0,0,0,0.1)', paddingLeft: 12, transition: 'color 0.15s' }}>
                {pageTitle}
              </span>
            )}
          </button>
          <div style={{ flex: 1 }} />
        </>
      )}

      {/* Actions à droite */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20,
            border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white',
            cursor: 'default', fontSize: 12, color: '#5E5854',
          }}
          tabIndex={-1}
        >
          <Bell size={14} strokeWidth={1.25} style={{ color: '#5E5854' }} />
          <span>0</span>
        </button>

        <button
          onClick={signOut}
          title={profile ? `${profile.prenom} ${profile.nom} · Se déconnecter` : 'Se déconnecter'}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            backgroundColor: 'var(--jga-orange)', color: 'white',
            fontSize: 11, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer',
          }}
        >
          {initials}
        </button>
      </div>
    </header>
  )
}
