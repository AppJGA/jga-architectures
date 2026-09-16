import { useEffect, useRef, useState } from 'react'

// ─── Demande de confirmation ─────────────────────────────────────────────────
//
// Une action irréversible (émettre un compte rendu, supprimer une fiche) passe
// par ici : le titre pose la question, le texte dit ce qui va se produire, et
// le bouton nomme l'action plutôt que de répondre « OK ».
//
// `danger` colore le bouton en rouge et le libellé d'attente parle de
// suppression ; le défaut est l'orange de la charte.

export function ModaleConfirmation({
  titre,
  texte,
  details = null,
  libelle,
  libelleEnCours,
  couleur,
  danger = false,
  onConfirmer,
  onAnnuler,
}) {
  const [enCours, setEnCours] = useState(false)
  const boutonConfirmer = useRef(null)
  const boutonAnnuler = useRef(null)
  const teinte = couleur ?? (danger ? '#B8412C' : '#E8602C')

  // Échap ferme, sauf pendant l'action : la fermer alors laisserait croire
  // qu'elle a été annulée.
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler, enCours])

  // Sur une action destructrice, c'est « Annuler » qui reçoit le clavier :
  // une frappe sur Entrée ne doit pas supprimer.
  useEffect(() => {
    (danger ? boutonAnnuler : boutonConfirmer).current?.focus()
  }, [danger])

  const confirmer = async () => {
    setEnCours(true)
    try { await onConfirmer() } finally { setEnCours(false) }
  }

  return (
    <div
      onClick={() => { if (!enCours) onAnnuler() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={titre}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', padding: '24px 28px', maxWidth: 460, width: '100%',
          border: '0.5px solid rgba(0,0,0,0.08)', borderTop: `3px solid ${teinte}`,
          boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)',
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 10 }}>{titre}</p>
        <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, margin: 0 }}>{texte}</p>

        {details && (
          <div style={{ margin: '14px 0 0', padding: '10px 12px', background: '#FAF7F2', border: '0.5px solid rgba(0,0,0,0.08)', fontSize: 13, color: '#1F1B17' }}>
            {details}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            type="button" ref={boutonAnnuler} onClick={onAnnuler} disabled={enCours}
            style={{ padding: '8px 16px', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.15)', background: 'transparent', fontSize: 13, cursor: enCours ? 'default' : 'pointer', color: '#374151' }}
          >
            Annuler
          </button>
          <button
            type="button" ref={boutonConfirmer} disabled={enCours} onClick={confirmer}
            style={{ padding: '8px 16px', borderRadius: 2, border: 'none', background: teinte, color: 'white', fontSize: 13, fontWeight: 500, cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? (libelleEnCours ?? (danger ? 'Suppression…' : 'Enregistrement…')) : libelle}
          </button>
        </div>
      </div>
    </div>
  )
}
