import { Suspense, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { IconeTableauDeBord } from '../shared/icones/IconesAffaire'
import { outilsGestion, ACCENT } from './manifest'
import { TableauBordGestion } from './TableauBordGestion'

// ─── Gestion d'agence ────────────────────────────────────────────────────────
//
// Espace des associés (conception :
// docs/superpowers/specs/2026-10-09-gestion-agence-design.md), présenté comme
// une affaire à la demande de l'agence : colonne latérale (tableau de bord mis
// en évidence, puis les outils), tableau de bord à tuiles au milieu, chaque
// outil à son adresse (`/gestion-agence/<outil>`). Les outils viennent du
// manifeste : la liste s'allongera sans toucher à cette page. La garde
// `AssocieSeul` est posée par le routeur.
// Le violet de la bulle d'accueil est passé aux composants partagés de la
// to-do list par les variables du cadre d'affaire.

const VARIABLES = {
  '--affaire-accent': ACCENT,
  '--affaire-accent-clair': 'rgba(122,78,156,0.10)',
  '--affaire-accent-bord': '#C4A3DE',
}

function EntreeOutil({ outil, actif, onClick }) {
  const [survol, setSurvol] = useState(false)
  const { Icone } = outil
  const montre = actif || survol
  return (
    <button type="button" onClick={onClick} aria-current={actif ? 'page' : undefined}
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '7px 12px', borderRadius: 2, fontSize: 12, border: 'none', cursor: 'pointer',
        backgroundColor: montre ? 'rgba(122,78,156,0.10)' : 'transparent',
        boxShadow: actif ? `inset 2px 0 0 ${ACCENT}` : 'none',
        color: montre ? ACCENT : '#5E5854', transition: 'all 0.15s',
      }}>
      {Icone && <Icone size={22} strokeWidth={1.25} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{outil.label}</span>
    </button>
  )
}

function Colonne({ idOutil }) {
  const navigate = useNavigate()
  const surTableau = !idOutil
  return (
    <aside style={{
      width: 200, minWidth: 200, backgroundColor: 'white', borderRight: '0.5px solid rgba(0,0,0,0.08)',
      padding: 12, overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column',
    }}>
      {/* Le tableau de bord, point de retour de l'espace : plein quand on y
          est, teinté sinon — comme dans une affaire */}
      <button type="button" onClick={() => navigate('/gestion-agence')} aria-current={surTableau ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', borderRadius: 3,
          border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
          backgroundColor: surTableau ? ACCENT : 'rgba(122,78,156,0.10)', color: surTableau ? 'white' : ACCENT,
          transition: 'background-color 0.15s, color 0.15s',
        }}>
        <IconeTableauDeBord size={22} />
        Tableau de bord
      </button>

      <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '4px 0 8px' }} />
      <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px', padding: '0 12px' }}>
        Outils
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {outilsGestion.map((o) => (
          <EntreeOutil key={o.id} outil={o} actif={o.id === idOutil} onClick={() => navigate(`/gestion-agence/${o.id}`)} />
        ))}
      </div>
    </aside>
  )
}

function TitreOutil({ outil }) {
  const { Icone } = outil
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexShrink: 0 }}>
      {Icone && <Icone size={28} color={ACCENT} strokeWidth={1.25} />}
      <h1 style={{ fontFamily: "'Archivo', sans-serif", fontSize: 20, fontWeight: 500, color: '#1F1B17', margin: 0 }}>{outil.label}</h1>
    </div>
  )
}

export default function GestionPage() {
  const { outil: idOutil } = useParams()
  const outil = outilsGestion.find((o) => o.id === idOutil)
  if (idOutil && !outil) return <Navigate to="/gestion-agence" replace />

  return (
    <div style={{ ...VARIABLES, display: 'flex', height: '100%', minHeight: 0 }}>
      <Colonne idOutil={idOutil} />
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', backgroundColor: 'var(--jga-beige-light)', padding: 24, display: 'flex', flexDirection: 'column' }}>
        {outil ? (
          <>
            <TitreOutil outil={outil} />
            <Suspense fallback={<p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>}>
              <outil.component />
            </Suspense>
          </>
        ) : (
          <TableauBordGestion />
        )}
      </main>
    </div>
  )
}
