import { Sparkles, Check, ListChecks } from 'lucide-react'

// ─── « À vérifier » : relecture du découpage d'un étage ──────────────────────
//
// Les contrôles sans IA (recalculés) et les signalements de Claude (gardés
// dans `edl_niveaux.relecture`). Rien n'est corrigé d'office : toucher un
// signalement choisit la pièce sur le plan ; « C'est juste » l'écarte.

const BLEU_CLAUDE = '#2E6FDB'
const petitBouton = { minHeight: 32, padding: '0 10px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }

const designation = (p) => [p.numero, p.nom].filter(Boolean).join(' · ') || 'Pièce sans nom'
const date = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function PanneauRelecture({ signalements, pieces, relueLe, lectureSeule, enCours, onRelire, onChoisir, onEcarter }) {
  const parId = new Map(pieces.map((p) => [p.id, p]))
  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: '3px solid #F59E0B' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <ListChecks size={15} color="#92400E" />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#1F1B17' }}>
          À vérifier{signalements.length ? ` · ${signalements.length}` : ''}
        </span>
        {!lectureSeule && (
          <button type="button" onClick={onRelire} disabled={enCours} style={{ ...petitBouton, opacity: enCours ? 0.5 : 1 }}
            title="Claude relit le découpage et signale ce qui lui paraît faux ; il ne modifie rien">
            <Sparkles size={13} color={BLEU_CLAUDE} /> {relueLe ? 'Relire à nouveau' : 'Relire avec Claude'}
          </button>
        )}
      </div>
      {relueLe && <p style={{ margin: 0, padding: '0 10px 6px', fontSize: 11, color: '#9C9591' }}>Relu par Claude le {date(relueLe)}</p>}
      {signalements.length === 0 ? (
        <p style={{ margin: 0, padding: '0 10px 10px', fontSize: 12, color: '#9C9591' }}>Rien à signaler.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 240, overflowY: 'auto', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          {signalements.map((s) => {
            const piece = s.pieceId ? parId.get(s.pieceId) : null
            return (
              <li key={s.cle} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                {s.source === 'ia'
                  ? <Sparkles size={13} color={BLEU_CLAUDE} style={{ flexShrink: 0, marginTop: 2 }} aria-label="Signalé par Claude" />
                  : <span style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2, borderRadius: '50%', background: '#F59E0B' }} aria-label="Contrôle automatique" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#1F1B17' }}>{s.motif}</p>
                  {piece && (
                    <button type="button" onClick={() => onChoisir(piece.id)}
                      style={{ border: 'none', background: 'none', padding: '2px 0 0', cursor: 'pointer', fontSize: 11, color: 'var(--affaire-accent, #E8602C)', textAlign: 'left' }}>
                      Voir {designation(piece)} sur le plan
                    </button>
                  )}
                </div>
                {!lectureSeule && (
                  <button type="button" onClick={() => onEcarter(s.cle)} title="Le signalement est écarté ; rien n’est modifié"
                    style={{ ...petitBouton, minHeight: 28, flexShrink: 0 }}>
                    <Check size={12} /> C’est juste
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
