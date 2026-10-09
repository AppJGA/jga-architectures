import { Suspense, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ListChecks, Users } from 'lucide-react'
import { outilsGestion, ACCENT } from './manifest'

// ─── Gestion d'agence ────────────────────────────────────────────────────────
//
// Espace des associés (conception :
// docs/superpowers/specs/2026-10-09-gestion-agence-design.md) : une page de
// tuiles, puis chaque outil à son adresse (`/gestion-agence/<outil>`). La
// garde `AssocieSeul` est posée par le routeur.
// Le violet de la bulle d'accueil est passé aux composants partagés de la
// to-do list par les variables du cadre d'affaire.

const VARIABLES = {
  '--affaire-accent': ACCENT,
  '--affaire-accent-clair': 'rgba(122,78,156,0.10)',
  '--affaire-accent-bord': '#C4A3DE',
}
const ICONES = { CalendarDays, ListChecks, Users }

function Tuile({ outil, onClick }) {
  const [survol, setSurvol] = useState(false)
  const Icone = ICONES[outil.icon]
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: '20px 18px', textAlign: 'left',
        border: `0.5px solid ${survol ? ACCENT : 'rgba(0,0,0,0.08)'}`, background: survol ? 'rgba(122,78,156,0.06)' : 'white',
        cursor: 'pointer', transition: 'all 0.15s ease',
      }}>
      <span style={{ width: 48, height: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: survol ? ACCENT : 'rgba(122,78,156,0.10)', transition: 'background-color 0.15s ease' }}>
        {Icone && <Icone size={24} strokeWidth={1.25} color={survol ? 'white' : ACCENT} />}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>{outil.label}</span>
      <span style={{ fontSize: 12, color: '#5E5854', lineHeight: 1.45 }}>{outil.description}</span>
    </button>
  )
}

export default function GestionPage() {
  const { outil: idOutil } = useParams()
  const navigate = useNavigate()
  const outil = outilsGestion.find((o) => o.id === idOutil)
  if (idOutil && !outil) return <Navigate to="/gestion-agence" replace />

  return (
    <div style={{ ...VARIABLES, padding: '28px clamp(16px, 4vw, 40px) 40px' }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", margin: '0 0 4px' }}>
          {outil ? outil.label : 'Gestion d’agence'}
        </h1>
        <p style={{ fontSize: 13, color: '#5E5854', margin: 0 }}>
          {outil ? outil.description : 'Outils de pilotage réservés aux associés.'}
        </p>
      </header>

      {outil ? (
        <Suspense fallback={<p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>}>
          <outil.component />
        </Suspense>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, maxWidth: 1100 }}>
          {outilsGestion.map((o) => <Tuile key={o.id} outil={o} onClick={() => navigate(`/gestion-agence/${o.id}`)} />)}
        </div>
      )}
    </div>
  )
}
