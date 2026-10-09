import { useState, useEffect, useContext } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { RetourCourant } from './RetourCourant'
import { TemoinEnvoi } from './TemoinEnvoi'
import { RetourContexte } from './retourContexte'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../supabase/client'
import { IconeGestionAgence } from '../../shared/icones/IconesAffaire'

export function Topbar() {
  const { user, signOut, estAssocie } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const dansGestion = pathname.startsWith('/gestion-agence')
  const [profile, setProfile] = useState(null)

  const { titre } = useContext(RetourContexte)

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
      {/* Le logo mène toujours à l'accueil ; à côté, le titre de la page
          (une affaire) ou, à défaut, le retour vers la page qui menait ici */}
      <button
        onClick={() => navigate('/home')}
        title="Accueil"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
      >
        <img
          src="/Logo_JGA_Archi.jpg"
          alt="JGA Architectures"
          style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0, mixBlendMode: 'multiply' }}
        />
      </button>
      {titre ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderLeft: '1px solid rgba(0,0,0,0.1)', paddingLeft: 12, minWidth: 0 }}>
          {titre.couleur && <div style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: titre.couleur, flexShrink: 0 }} />}
          {titre.code && (
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--jga-beige)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em', flexShrink: 0 }}>
              {titre.code}
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {titre.nom}
          </span>
          {titre.detail && <span style={{ fontSize: 12, color: 'var(--jga-beige)', flexShrink: 0 }}>{titre.detail}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid rgba(0,0,0,0.1)', paddingLeft: 12, minWidth: 0 }}>
          <RetourCourant />
        </div>
      )}
      <div style={{ flex: 1 }} />

      {/* Actions à droite */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TemoinEnvoi />
        {/* Associés seulement (migration 067) : retour en un geste au tableau
            de bord de Gestion d'agence, de n'importe quelle page — sauf
            depuis Gestion d'agence elle-même, où il n'a pas de sens */}
        {estAssocie === true && !dansGestion && (
          <button
            type="button"
            onClick={() => navigate('/gestion-agence')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
              border: '1px solid #7A4E9C', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              backgroundColor: 'rgba(122,78,156,0.10)', color: '#7A4E9C',
            }}
          >
            <IconeGestionAgence size={16} />
            <span>Revenir à la gestion d’agence</span>
          </button>
        )}
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 3,
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
