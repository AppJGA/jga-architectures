import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Smartphone, ChevronRight, AlertTriangle } from 'lucide-react'
import { useComptesRendus } from '../../../shared/hooks/useComptesRendus'
import { actionVisite, cheminVisite, estTactile } from './accesVisite'

// ─── Accès direct à la visite, depuis la page de l'affaire ───────────────────
//
// Sur le chantier, écrire une remarque ne doit pas demander de traverser la
// liste des visites puis l'accueil du compte rendu. Ce bandeau ouvre la visite
// en cours — ou crée celle du jour — d'un seul geste.

export function BandeauVisite({ affaireId, lectureSeule = false }) {
  const naviguer = useNavigate()
  const { comptesRendus, loading, createCR } = useComptesRendus(affaireId)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  if (loading) return null
  const choix = actionVisite(comptesRendus)
  const ouvrable = choix.action === 'reprendre' || !lectureSeule

  const aller = async () => {
    if (enCours) return
    setErreur(null)
    if (choix.cr) {
      naviguer(cheminVisite(affaireId, choix.cr.id, { tactile: estTactile() }))
      return
    }
    setEnCours(true)
    try {
      const cr = await createCR()
      naviguer(cheminVisite(affaireId, cr.id, { tactile: estTactile() }))
    } catch (err) {
      console.error(err)
      setErreur(err?.message ?? 'La visite n’a pas pu être créée.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="jga-entree-carte" style={{
      background: 'white',
      border: '0.5px solid rgba(0,0,0,0.08)',
      borderTop: '3px solid #E8602C',
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#C9C4C0' }}>
          Visite de chantier
        </p>
        <p style={{ fontFamily: "'Archivo', sans-serif", fontSize: 17, fontWeight: 500, color: '#1F1B17', marginTop: 4 }}>
          {choix.libelle}
        </p>
        <p style={{ fontSize: 12, color: '#9C9591', marginTop: 2 }}>
          {choix.precision}
          {choix.cr?.pointsEnCours > 0 && ` · ${choix.cr.pointsEnCours} point${choix.cr.pointsEnCours > 1 ? 's' : ''} en cours`}
        </p>
        {erreur && (
          <p role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#B8412C', marginTop: 6 }}>
            <AlertTriangle size={13} /> {erreur}
          </p>
        )}
      </div>

      {ouvrable && (
        <button
          type="button" onClick={aller} disabled={enCours}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            minHeight: 52, padding: '0 24px', flexShrink: 0,
            border: 'none', borderRadius: 3,
            background: '#E8602C', color: 'white',
            fontSize: 15, fontWeight: 600, cursor: enCours ? 'default' : 'pointer',
            boxShadow: '0 10px 24px -12px rgba(232,96,44,0.9)',
            opacity: enCours ? 0.7 : 1,
          }}
        >
          <Smartphone size={18} />
          {enCours ? 'Création…' : (choix.action === 'reprendre' ? 'Reprendre' : 'Démarrer')}
        </button>
      )}

      <button
        type="button"
        onClick={() => naviguer(`/affaires/${affaireId}/comptes-rendus`)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: '#5E5854',
        }}
      >
        Toutes les visites <ChevronRight size={13} />
      </button>
    </div>
  )
}
