import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { GeneralitesVue } from './GeneralitesVue'
import { useGeneralites } from '../../../shared/hooks/useGeneralites'

// Généralités ouvertes depuis la liste des visites : elles valent pour toute
// l'affaire, on doit pouvoir les régler sans ouvrir un compte rendu.
export function GeneralitesModal({ affaireId, peutModifier, onClose }) {
  const generalites = useGeneralites(affaireId)
  const [erreur, setErreur] = useState(null)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 'calc(24px + env(safe-area-inset-top)) 16px 24px' }}>
      <div role="dialog" aria-modal="true" aria-label="Généralités" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 960, background: '#FAF7F2', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>Généralités de l’affaire</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', display: 'flex' }}><X size={18} /></button>
        </div>
        {erreur && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: '#FBEAE6', color: '#7A2A1C', fontSize: 12 }}>
            <AlertTriangle size={14} /> <span style={{ flex: 1 }}>{erreur}</span>
            <button type="button" onClick={() => setErreur(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C' }}><X size={14} /></button>
          </div>
        )}
        <div style={{ padding: 20 }}>
          <GeneralitesVue cr={null} generalites={generalites} peutModifier={peutModifier}
            signalerErreur={(err) => { console.error(err); setErreur(err?.message ?? String(err)) }} />
        </div>
      </div>
    </div>
  )
}
