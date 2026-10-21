import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { VisionneusePlan } from './VisionneusePlan'

// ─── Un plan en plein écran ──────────────────────────────────────────────────
//
// Commun au module « Plans » et au mode Visite. Portail vers `body` : une
// fenêtre `fixed` sous une carte animée resterait prise dans la carte. Bande
// sombre de la barre d'état de l'iPad, ✕ ou Échap pour fermer (jamais un
// geste à côté). `enfants` : ce qui se pose par-dessus le plan (la fiche
// d'une pastille touchée).

export function PlanPleinEcran({ titre, sousTitre, version, obtenirLiens, pastilles = [], idActive = null, onPastille, enfants = null, onFermer }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={titre}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#FAF7F2', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 'env(safe-area-inset-top)', background: '#1F1B17', flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 4px 16px', background: '#1F1B17', color: '#F5F1E9', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</p>
          {sousTitre && <p style={{ margin: 0, fontSize: 11, color: 'rgba(245,241,233,0.65)' }}>{sousTitre}</p>}
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer le plan" title="Fermer (Échap)"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, border: 'none', background: 'none', color: '#F5F1E9', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {version ? (
          <VisionneusePlan key={version.id} version={version} obtenirLiens={obtenirLiens}
            pastilles={pastilles} idActive={idActive} onPastille={onPastille} />
        ) : (
          <p style={{ padding: 24, fontSize: 13, color: '#5E5854' }}>Version du plan introuvable.</p>
        )}
        {enfants}
      </div>
    </div>,
    document.body,
  )
}
