import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// ─── Petite fenêtre de confirmation de la relecture ──────────────────────────
//
// Écarter une proposition, relancer une analyse payante. Règle de l'agence :
// seuls ✕, Annuler, Échap ou l'action la ferment, jamais un clic à côté (le
// fond ne porte aucun onClick). Portail vers `body` : ouverte depuis une
// carte animée, elle y resterait prise (piège du `transform` gardé).

const BOUTON = { minHeight: 44, padding: '0 16px', borderRadius: 3, fontSize: 13, cursor: 'pointer' }

export function ConfirmationEdl({ titre, texte, libelle, libelleEnCours = 'Un instant…', danger = false, onConfirmer, onAnnuler }) {
  const [enCours, setEnCours] = useState(false)
  const annuler = useRef(null)
  const teinte = danger ? '#B8412C' : 'var(--affaire-accent, #E8602C)'

  useEffect(() => {
    // Pendant l'action, Échap laisserait croire qu'elle est annulée
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler, enCours])
  // Entrée ne doit pas écarter par mégarde : le clavier va sur « Annuler »
  useEffect(() => { annuler.current?.focus() }, [])

  const confirmer = async () => {
    setEnCours(true)
    try { await onConfirmer() } finally { setEnCours(false) }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(80px + env(safe-area-inset-top)) 16px 32px' }}>
      <div role="alertdialog" aria-modal="true" aria-label={titre}
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 440, borderTop: `3px solid ${teinte}`, boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 4px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>{titre}</h2>
          <button type="button" onClick={onAnnuler} disabled={enCours} aria-label="Fermer"
            style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: 0, padding: '16px 20px', fontSize: 13, color: '#5E5854', lineHeight: 1.55 }}>{texte}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" ref={annuler} onClick={onAnnuler} disabled={enCours}
            style={{ ...BOUTON, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }}>
            Annuler
          </button>
          <button type="button" onClick={confirmer} disabled={enCours}
            style={{ ...BOUTON, border: 'none', background: teinte, color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
            {enCours ? libelleEnCours : libelle}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
