import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { InterlocuteursEditeur } from '../modules/chantier/comptes-rendus/InterlocuteursModal'

// ─── Interlocuteurs d'une affaire, sans la fiche ─────────────────────────────
//
// Les contacts se gèrent d'habitude dans la fiche de l'affaire, réservée à son
// responsable (migration 050). Un collaborateur garde la main sur les
// interlocuteurs, qui sont une table à part : il les retrouve ici, seuls.
// Se ferme par ✕ ou Échap, jamais au clic à côté ; dans un portail, pour ne
// pas rester prise sous une carte animée.

export function ModaleContacts({ affaireId, onFermer }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top) + 24px) 16px 24px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Interlocuteurs de l'affaire"
        style={{ background: 'white', width: '100%', maxWidth: 760, borderTop: '3px solid var(--affaire-accent, #E8602C)', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <p style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: '#1F1B17' }}>Interlocuteurs de l’affaire</p>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            style={{ width: 34, height: 34, border: 'none', background: 'none', cursor: 'pointer', color: '#5E5854', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </header>
        <div style={{ padding: '16px 22px 22px' }}>
          <InterlocuteursEditeur affaireId={affaireId} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
