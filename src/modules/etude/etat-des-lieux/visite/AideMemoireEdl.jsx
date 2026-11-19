import { X, Check } from 'lucide-react'
import { RAPPEL_ETAT } from './aideMemoireLogique'

// ─── Aide-mémoire de la pièce, posé sur le plan ─────────────────────────────
//
// Ouvert à l'entrée dans une pièce (sauf si le collaborateur l'a coupé), en
// haut à droite du plan : le clavier de l'iPad recouvre le bas, et le plan
// reste touchable à côté. Ne se ferme que par ✕ (règle des fenêtres de
// l'agence) ; le bouton « Aide-mémoire » de la barre de la pièce le rouvre.

const ACCENT = 'var(--affaire-accent, #E8602C)'
const VERT = '#2A8A4E'

export function AideMemoireEdl({ titre, aide, ouvrirAuto, onOuvrirAuto, onFermer }) {
  return (
    <section
      aria-label="Aide-mémoire de la pièce"
      style={{
        position: 'absolute', top: 8, right: 8, zIndex: 6, width: 320, maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 16px)',
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto', boxSizing: 'border-box',
        background: 'white', border: '0.5px solid rgba(0,0,0,0.15)', borderTop: `3px solid ${ACCENT}`, borderRadius: 2,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5E5854' }}>Aide-mémoire · {aide.faites}/{aide.total}</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</p>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer l’aide-mémoire" title="Fermer"
          style={{ width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#5E5854' }}>
          <X size={20} />
        </button>
      </header>
      <div style={{ overflowY: 'auto', padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: '#92400E', background: '#FFFBEB', padding: '6px 8px', borderRadius: 2 }}>{RAPPEL_ETAT}</p>
        {aide.groupes.map((g) => (
          <div key={g.cle}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#5E5854' }}>{g.titre}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.rubriques.map((r) => (
                <li key={r.cle} aria-label={`${r.libelle} : ${r.fait ? 'relevé' : 'à relever'}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{
                    width: 18, height: 18, flexShrink: 0, marginTop: 1, borderRadius: 2, boxSizing: 'border-box',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${r.fait ? VERT : 'rgba(0,0,0,0.25)'}`, background: r.fait ? VERT : 'white', color: 'white',
                  }}>{r.fait && <Check size={13} strokeWidth={3} />}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.35, color: r.fait ? VERT : '#1F1B17' }}>
                    <span style={{ fontWeight: 600 }}>{r.libelle}</span>
                    <span style={{ color: r.fait ? VERT : '#5E5854' }}> — {r.aide}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 12, color: '#5E5854', borderTop: '0.5px solid rgba(0,0,0,0.08)', marginTop: 2 }}>
          <input type="checkbox" checked={ouvrirAuto} onChange={(e) => onOuvrirAuto(e.target.checked)} style={{ width: 20, height: 20, minHeight: 0 }} />
          Ouvrir à chaque entrée dans une pièce
        </label>
      </div>
    </section>
  )
}
