import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Wrench, BookUser, ArrowRight } from 'lucide-react'
import { useAuth } from '../core/auth/useAuth'
import { supabase } from '../core/supabase/client'

// Entrées d'accueil. `accent` sert au liseré du haut, aux cercles pulsés et à
// la mention « Ouvrir » ; `bordure` est la couleur de bord au survol.
const MODULES = [
  {
    numero: '01',
    label: 'Affaires',
    description: 'Projets, chantiers et suivi des dossiers.',
    path: '/dashboard',
    Icon: Building2,
    accent: '#E8602C',
    bordure: '#F8B89A',
    gradient: 'linear-gradient(135deg, #E8602C 0%, #F8B89A 100%)',
    halo: 'rgba(232,96,44,0.14)',
  },
  {
    numero: '02',
    label: 'Boîte à outils',
    description: 'Rastérisation, analyseur, saisie des heures.',
    path: '/tools',
    Icon: Wrench,
    accent: '#2A8A4E',
    bordure: '#8BC34A',
    gradient: 'linear-gradient(135deg, #2A8A4E 0%, #8BC34A 100%)',
    halo: 'rgba(42,138,78,0.14)',
  },
  {
    numero: '03',
    label: "Carnet d'adresses",
    description: "Entreprises, bureaux d'études et contacts.",
    path: '/carnet-adresses',
    Icon: BookUser,
    accent: '#1B3A5C',
    bordure: '#60A5FA',
    gradient: 'linear-gradient(135deg, #1B3A5C 0%, #60A5FA 100%)',
    halo: 'rgba(27,58,92,0.14)',
  },
]

// Le composant d'origine exposait une case « animations » ; côté application,
// c'est le réglage système qui fait foi.
function useMouvementReduit() {
  const [reduit, setReduit] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = (e) => setReduit(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduit
}

// ─── Carte de module ─────────────────────────────────────────────────────────

function CarteModule({ module, rang, reduit, onOpen }) {
  const [survol, setSurvol] = useState(false)
  const { Icon } = module

  // Les boucles décoratives sont décalées d'une carte à l'autre pour éviter un
  // effet de métronome.
  const boucle = (nom, duree, decalage) =>
    reduit ? 'none' : `${nom} ${duree} ${decalage} infinite`

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)}
      onBlur={() => setSurvol(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        padding: '30px 28px 26px',
        textAlign: 'left',
        font: 'inherit',
        background: '#FFFFFF',
        border: `1px solid ${survol ? module.bordure : '#E9E2D6'}`,
        overflow: 'hidden',
        cursor: 'pointer',
        transform: survol ? 'translateY(-8px)' : 'none',
        boxShadow: survol
          ? '0 22px 44px -18px rgba(31,27,23,0.28)'
          : '0 1px 2px rgba(31,27,23,0.03)',
        transition:
          'transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease',
        animation: reduit
          ? 'none'
          : `jga-rise 0.7s cubic-bezier(0.22,1,0.36,1) ${0.2 + rang * 0.12}s both`,
      }}
    >
      {/* Liseré balayé en haut de carte */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: module.gradient,
          animation: boucle('jga-sweep', '5.2s cubic-bezier(0.65,0,0.35,1)', `${rang * 0.5}s`),
        }}
      />
      {/* Carré incliné en filigrane */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: -70, right: -70, width: 190, height: 190,
          border: `1px solid ${module.halo}`, transform: 'rotate(45deg)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative', width: 66, height: 66,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: boucle('jga-float', '6s ease-in-out', `${rang * 0.8}s`),
          }}
        >
          {/* Deux ondes concentriques, déphasées d'une demi-période */}
          {[0, 1.7].map((retard) => (
            <span
              key={retard}
              aria-hidden="true"
              style={{
                position: 'absolute', inset: 0,
                border: `1px solid ${module.accent}`,
                animation: boucle('jga-ring', '3.4s ease-out', `${rang * 0.6 + retard}s`),
              }}
            />
          ))}
          <span
            style={{
              position: 'relative', width: 66, height: 66,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: module.gradient,
            }}
          >
            <Icon size={30} color="#FFFFFF" strokeWidth={1.25} />
          </span>
        </div>
        <span
          style={{
            position: 'absolute', top: 24, right: 24,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: '0.12em', color: '#C9C4C0',
          }}
        >
          {module.numero}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 18, fontWeight: 500, color: '#1F1B17' }}>
          {module.label}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: '#9C9591', textWrap: 'pretty' }}>
          {module.description}
        </div>
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #F0EBE3',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: module.accent,
        }}
      >
        <span>Ouvrir</span>
        <ArrowRight
          size={13}
          strokeWidth={1.5}
          style={{ animation: boucle('jga-arrow', '2.4s ease-in-out', `${rang * 0.3}s`) }}
        />
      </div>
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [prenom, setPrenom] = useState('')
  const reduit = useMouvementReduit()

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

  const enPause = reduit ? 'paused' : 'running'

  return (
    <div
      style={{
        minHeight: 'calc(100svh - 52px)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '56px 24px 72px',
        backgroundColor: '#FAF7F2',
      }}
    >
      {/* Trame qui dérive lentement, estompée sur les bords par un dégradé radial */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: -60, pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(31,27,23,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(31,27,23,0.045) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          animation: 'jga-drift 24s linear infinite',
          animationPlayState: enPause,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(70% 55% at 50% 38%, rgba(250,247,242,0) 0%, #FAF7F2 78%)',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: '12%', left: '50%',
          width: 620, height: 620, marginLeft: -310, pointerEvents: 'none',
          border: '1px solid rgba(232,96,44,0.09)',
          transform: 'rotate(45deg)',
          animation: 'jga-orbit 90s linear infinite',
          animationPlayState: enPause,
        }}
      />

      {/* `position: relative` SANS z-index : suffisant pour passer au-dessus du
          décor (positionné, plus haut dans le DOM) sans créer de contexte
          d'empilement — lequel isolerait le mix-blend-mode du logo et laisserait
          son fond blanc visible sur le crème. */}
      <div
        style={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: '100%', maxWidth: 1040,
        }}
      >
        <img
          src="/Logo_JGA_Archi.jpg"
          alt="JGA Architectures"
          style={{
            height: 76, width: 'auto', marginBottom: 34,
            mixBlendMode: 'multiply',
            animation: reduit ? 'none' : 'jga-fade 0.7s ease both',
          }}
        />

        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            marginBottom: 12,
            animation: reduit ? 'none' : 'jga-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9C9591',
            }}
          >
            <span style={{ width: 22, height: 1, background: '#C9C4C0' }} />
            <span>Espace collaborateur</span>
            <span style={{ width: 22, height: 1, background: '#C9C4C0' }} />
          </div>
          <h1
            style={{
              fontFamily: "'Archivo', sans-serif", fontSize: 38, lineHeight: 1.12,
              fontWeight: 400, letterSpacing: '-0.02em', color: '#1F1B17', textAlign: 'center',
            }}
          >
            Bonjour{prenom && <>, <span style={{ fontWeight: 600 }}>{prenom}</span></>}
          </h1>
        </div>

        <p
          style={{
            fontSize: 14, color: '#9C9591', textAlign: 'center', marginBottom: 52,
            animation: reduit ? 'none' : 'jga-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.12s both',
          }}
        >
          Par où souhaitez-vous commencer ?
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))',
            gap: 24,
            width: '100%',
          }}
        >
          {MODULES.map((module, rang) => (
            <CarteModule
              key={module.path}
              module={module}
              rang={rang}
              reduit={reduit}
              onOpen={() => navigate(module.path)}
            />
          ))}
        </div>
      </div>

      <p
        style={{
          position: 'absolute', bottom: 22, left: 0, right: 0,
          textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: '0.12em', color: '#C9C4C0',
        }}
      >
        JGA ARCHITECTURES · ESPACE COLLABORATEUR
      </p>
    </div>
  )
}
