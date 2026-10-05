import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// ─── Retour à la page précédente ─────────────────────────────────────────────
//
// En haut à gauche de chaque page : une flèche, l'icône de la page d'où l'on
// vient et son nom, en gras et sans cadre — discret, mais toujours au même
// endroit. « Précédente » veut dire celle qui portait le lien vers celle-ci,
// pas l'historique du navigateur.

export function RetourPage({ libelle, Icone, vers, onClick, style }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={onClick ?? (() => navigate(vers))}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: 0,
        border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
        fontSize: 13, fontWeight: 600, color: '#5E5854', transition: 'color 0.15s',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--jga-orange)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#5E5854' }}
    >
      <ArrowLeft size={16} />
      {Icone && <Icone size={20} />}
      {libelle}
    </button>
  )
}
