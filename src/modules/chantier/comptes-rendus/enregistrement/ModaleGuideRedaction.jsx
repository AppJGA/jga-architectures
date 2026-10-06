import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, RotateCcw } from 'lucide-react'
import { lireGuideAgence, enregistrerGuideAgence } from './styleAgence'
import { GUIDE_PAR_DEFAUT } from './styleAgenceLogique'
import { COULEUR_IA } from './styleProposition'

// ─── Guide de rédaction de l'IA ──────────────────────────────────────────────
//
// Le texte que l'IA suit pour écrire comme l'agence. Commun à toutes les
// affaires. Enregistré vide ou identique au guide de départ, il revient à
// celui-ci (la ligne est retirée) : une amélioration du guide de départ
// profite alors à l'agence sans qu'elle ait à recopier quoi que ce soit.

export function ModaleGuideRedaction({ onFermer }) {
  const [etat, setEtat] = useState(null) // null | { disponible, modifieLe }
  const [texte, setTexte] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let annule = false
    lireGuideAgence().then((g) => {
      if (annule) return
      setEtat({ disponible: g.disponible, modifieLe: g.modifieLe })
      setTexte(g.texte ?? GUIDE_PAR_DEFAUT)
    })
    return () => { annule = true }
  }, [])

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, enCours])

  const enregistrer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      await enregistrerGuideAgence(texte.trim() === GUIDE_PAR_DEFAUT.trim() ? '' : texte)
      onFermer()
    } catch (err) {
      setErreur(`Enregistrement impossible : ${err?.message ?? err}`)
      setEnCours(false)
    }
  }

  const modifiable = etat?.disponible
  const bouton = (fond, couleur, bord = 'none') => ({
    minHeight: 40, padding: '0 16px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
    border: bord, background: fond, color: couleur, display: 'inline-flex', alignItems: 'center', gap: 6,
  })

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(24px + env(safe-area-inset-top)) 16px 24px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Guide de rédaction de l’IA"
        style={{ background: 'white', width: '100%', maxWidth: 760, borderTop: `3px solid ${COULEUR_IA}`, boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Guide de rédaction de l’IA</h2>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.55, margin: '0 0 12px' }}>
            Ce texte dit à l’IA comment l’agence écrit ses comptes rendus. Il vaut pour toutes les affaires.
            En plus de ce guide, l’IA reçoit à chaque analyse une quarantaine de remarques réelles tirées des CR émis
            (d’abord ceux de l’affaire), pour imiter le ton et le vocabulaire.
          </p>
          {etat && !modifiable && (
            <p role="status" style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '8px 12px', margin: '0 0 12px' }}>
              La migration 059 n’est pas encore passée : l’IA suit le guide de départ ci-dessous, qui ne peut pas encore être modifié.
            </p>
          )}
          <textarea
            value={texte} onChange={(e) => setTexte(e.target.value)}
            readOnly={!modifiable} aria-label="Texte du guide"
            style={{ width: '100%', minHeight: 420, boxSizing: 'border-box', padding: 12, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', color: '#1F1B17', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, resize: 'vertical', background: modifiable ? 'white' : '#FAF7F2' }}
          />
          {etat?.modifieLe && (
            <p style={{ fontSize: 11, color: '#9C9591', margin: '6px 0 0' }}>
              Modifié le {new Date(etat.modifieLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          {erreur && <p role="alert" style={{ fontSize: 12, color: '#B8412C', margin: '8px 0 0' }}>{erreur}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 20px 18px' }}>
          {modifiable && (
            <button type="button" onClick={() => setTexte(GUIDE_PAR_DEFAUT)} disabled={enCours}
              style={bouton('white', '#5E5854', '0.5px solid rgba(0,0,0,0.15)')}>
              <RotateCcw size={14} /> Revenir au guide de départ
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onFermer} disabled={enCours} style={bouton('white', '#1F1B17', '0.5px solid rgba(0,0,0,0.15)')}>
            {modifiable ? 'Annuler' : 'Fermer'}
          </button>
          {modifiable && (
            <button type="button" onClick={enregistrer} disabled={enCours || !texte.trim()}
              style={{ ...bouton(COULEUR_IA, 'white'), fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
