import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../core/auth/useAuth'
import { rendus, prochaines, ecartJours, groupesTaches, initiales } from './gestionLogique'
import { chargerCalendrier, chargerTaches, listerComptesAgence } from './gestionDonnees'
import { outilsGestion, ACCENT, aujourdhuiLocal } from './manifest'

// ─── Tableau de bord de Gestion d'agence ─────────────────────────────────────
//
// Une tuile par outil du manifeste, avec son résumé quand il en a un (même
// présentation que les tuiles d'une affaire). Un outil ajouté plus tard a sa
// tuile d'office, avec sa description en attendant un résumé. Chaque lecture
// est indépendante : une qui échoue n'éteint pas les autres tuiles.

const ROUGE = '#B8412C'
const delaiCarte = (rang) => `${(0.10 + 0.07 * rang).toFixed(2)}s`
const dateCourte = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

function Tuile({ outil, rang, onClick, children }) {
  const [survol, setSurvol] = useState(false)
  const { Icone } = outil
  return (
    // L'entrée est portée par l'enveloppe : l'animation finit sur opacity 1
    // et, prioritaire sur le style inline, effacerait tout effet de survol
    <div className="jga-entree-carte" style={{ display: 'flex', animationDelay: delaiCarte(rang) }}>
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
        onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
        style={{
          flex: 1, minWidth: 0, backgroundColor: 'white', padding: 20, cursor: 'pointer',
          border: `0.5px solid ${survol ? '#C4A3DE' : 'rgba(0,0,0,0.08)'}`, transition: 'border-color 0.15s',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {Icone && <Icone size={28} strokeWidth={1.25} color={ACCENT} />}
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{outil.label}</span>
          </div>
          <ChevronRight size={14} strokeWidth={1.25} color="#9C9591" />
        </div>
        {children ?? <p style={{ margin: 0, fontSize: 12, color: 'var(--jga-beige)' }}>{outil.description}</p>}
      </div>
    </div>
  )
}

const Chiffre = ({ valeur, unite }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
    <p style={{ margin: 0, fontSize: 22, fontWeight: 500, color: '#1F1B17' }}>{valeur}</p>
    <span style={{ fontSize: 12, color: '#5E5854' }}>{unite}</span>
  </div>
)

export function TableauBordGestion() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const aujourdhui = aujourdhuiLocal()
  const [calendrier, setCalendrier] = useState(null)
  const [taches, setTaches] = useState(null)
  const [comptes, setComptes] = useState(null)

  useEffect(() => {
    chargerCalendrier().then(setCalendrier).catch(() => setCalendrier(false))
    chargerTaches().then(setTaches).catch(() => setTaches(false))
    listerComptesAgence().then(setComptes).catch(() => setComptes(false))
  }, [])

  const resume = useMemo(() => {
    const aVenir = calendrier ? prochaines(rendus(calendrier.jalonsChantier, calendrier.jalonsEtude, calendrier.affaires), aujourdhui, 30) : null
    const groupes = taches?.disponible ? groupesTaches(taches.taches, taches.affaires, {}, aujourdhui) : null
    return {
      aVenir,
      aFaire: groupes?.reduce((n, g) => n + g.taches.length, 0) ?? null,
      enRetard: groupes?.reduce((n, g) => n + g.enRetard, 0) ?? null,
      miennes: taches?.disponible ? taches.taches.filter((t) => t.responsable_id === user?.id).length : null,
      associes: comptes ? comptes.filter((c) => c.est_associe) : null,
    }
  }, [calendrier, taches, comptes, aujourdhui, user?.id])

  const contenu = {
    calendrier: resume.aVenir && (resume.aVenir.length === 0
      ? <p style={{ margin: 0, fontSize: 12, color: 'var(--jga-beige)' }}>Aucun rendu dans les 30 jours</p>
      : <>
          <Chiffre valeur={resume.aVenir.length} unite={`rendu${resume.aVenir.length > 1 ? 's' : ''} dans les 30 jours`} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: resume.aVenir[0].couleur || ACCENT, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#5E5854' }}>
              Prochain : <strong>{resume.aVenir[0].affaire.code_affaire}</strong> {resume.aVenir[0].libelle} · {dateCourte(resume.aVenir[0].date)}
              {(() => { const d = ecartJours(aujourdhui, resume.aVenir[0].date); return d <= 7 ? <span style={{ color: ROUGE, fontWeight: 600 }}> · {d === 0 ? 'aujourd’hui' : `dans ${d} j`}</span> : null })()}
            </span>
          </div>
        </>),
    taches: resume.aFaire != null && (resume.aFaire === 0
      ? <p style={{ margin: 0, fontSize: 12, color: 'var(--jga-beige)' }}>Aucune tâche à faire</p>
      : <>
          <Chiffre valeur={resume.aFaire} unite={`tâche${resume.aFaire > 1 ? 's' : ''} à faire`} />
          <p style={{ margin: 0, fontSize: 11, color: '#5E5854' }}>
            {resume.enRetard > 0 && <span style={{ color: ROUGE, fontWeight: 600 }}>{resume.enRetard} en retard · </span>}
            {resume.miennes} pour vous
          </p>
        </>),
    associes: resume.associes && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex' }}>
          {resume.associes.map((c, i) => (
            <span key={c.id} title={[c.prenom, c.nom].filter(Boolean).join(' ')}
              style={{
                width: 28, height: 28, borderRadius: '50%', background: ACCENT, color: 'white', fontSize: 10, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white',
                marginLeft: i === 0 ? 0 : -8, position: 'relative', zIndex: 10 - i,
              }}>{initiales(c)}</span>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#5E5854' }}>{resume.associes.length} associé{resume.associes.length > 1 ? 's' : ''}</span>
      </div>
    ),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div className="jga-entree-libelle" style={{ display: 'flex', alignItems: 'center', gap: 8, animationDelay: '0.04s' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: ACCENT }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#5E5854', fontFamily: "'Archivo', sans-serif" }}>Outils des associés</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
        {outilsGestion.map((o, i) => (
          <Tuile key={o.id} outil={o} rang={i} onClick={() => navigate(`/gestion-agence/${o.id}`)}>
            {contenu[o.id] || null}
          </Tuile>
        ))}
      </div>
    </div>
  )
}
