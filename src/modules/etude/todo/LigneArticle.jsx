import { useEffect, useRef, useState } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { libelleFait } from './todoLogique'

// ─── Une case de la to-do list ───────────────────────────────────────────────
//
// Commune aux articles (mission, plans) et aux tâches du quotidien : case,
// texte, qui a coché et quand, note, et un menu d'actions. Le menu se ferme
// au clic à côté (c'est un menu, pas une fenêtre).

export function CaseACocher({ coche, desactive, onClick, libelle }) {
  return (
    <button type="button" role="checkbox" aria-checked={coche} aria-label={libelle} onClick={onClick} disabled={desactive}
      style={{
        flexShrink: 0, width: 24, height: 24, marginTop: 1, borderRadius: 4, padding: 0,
        border: coche ? 'none' : '1.5px solid #C9C4C0', background: coche ? '#2A8A4E' : 'white',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: desactive ? 'default' : 'pointer', opacity: desactive ? 0.5 : 1,
      }}>
      {coche && <Check size={16} color="white" strokeWidth={3} />}
    </button>
  )
}

export function MenuActions({ actions }) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e) => { if (!boite.current?.contains(e.target)) setOuvert(false) }
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])
  const visibles = actions.filter(Boolean)
  if (visibles.length === 0) return null
  return (
    <div ref={boite} style={{ position: 'relative', flexShrink: 0 }} data-consultation="libre">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-label="Actions" aria-expanded={ouvert}
        style={{ width: 32, height: 32, border: 'none', background: ouvert ? 'rgba(0,0,0,0.05)' : 'none', borderRadius: 3, cursor: 'pointer', color: '#9C9591', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <MoreHorizontal size={18} />
      </button>
      {ouvert && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 50, minWidth: 200, background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', boxShadow: '0 12px 30px -12px rgba(31,27,23,0.35)', padding: 4 }}>
          {visibles.map((a) => (
            <button key={a.libelle} type="button" role="menuitem"
              data-consultation={a.libre ? 'libre' : undefined}
              onClick={() => { setOuvert(false); a.action() }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'none', fontSize: 13, color: a.danger ? '#B8412C' : '#1F1B17', cursor: 'pointer' }}>
              {a.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Note d'une ligne, saisie sur place. */
export function EditeurNote({ valeur, onEnregistrer, onAnnuler }) {
  const [texte, setTexte] = useState(valeur ?? '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') onAnnuler() }}
        placeholder="Note (référence d'un courrier, date d'un rendez-vous…)"
        style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ padding: '6px 12px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, background: 'transparent', fontSize: 12, cursor: 'pointer' }}>Annuler</button>
        <button type="button" onClick={() => onEnregistrer(texte.trim() || null)} style={{ padding: '6px 12px', border: 'none', borderRadius: 2, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Enregistrer</button>
      </div>
    </div>
  )
}

/**
 * @param article  issu de `articlesAffiches`
 * @param actions  { basculer, enregistrer(champs), supprimer?, copierLien? }
 */
export function LigneArticle({ article, profils, lectureSeule, actions }) {
  const [noteOuverte, setNoteOuverte] = useState(false)
  const grise = article.sans_objet || article.retire
  const fait = libelleFait(article, profils)

  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 4px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', opacity: grise ? 0.55 : 1 }}>
      <CaseACocher coche={!!article.fait_le} desactive={lectureSeule || grise} onClick={actions.basculer}
        libelle={article.fait_le ? `Décocher : ${article.texte}` : `Cocher : ${article.texte}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: '#1F1B17', textDecoration: article.sans_objet ? 'line-through' : 'none' }}>{article.texte}</p>
        {(fait || article.sans_objet || article.retire || article.source === 'article') && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: article.fait_le ? '#2A8A4E' : '#9C9591' }}>
            {[fait, article.sans_objet && 'Sans objet pour cette affaire', article.retire && 'Retiré de la liste type', article.source === 'article' && 'Propre à cette affaire'].filter(Boolean).join(' · ')}
          </p>
        )}
        {article.note && !noteOuverte && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5E5854', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{article.note}</p>
        )}
        {noteOuverte && (
          <EditeurNote valeur={article.note}
            onAnnuler={() => setNoteOuverte(false)}
            onEnregistrer={async (note) => { await actions.enregistrer({ note }); setNoteOuverte(false) }} />
        )}
      </div>
      <MenuActions actions={[
        !lectureSeule && { libelle: article.note ? 'Modifier la note' : 'Ajouter une note', action: () => setNoteOuverte(true) },
        !lectureSeule && !article.retire && { libelle: article.sans_objet ? 'Remettre dans la liste' : 'Sans objet pour cette affaire', action: () => actions.enregistrer({ sans_objet: !article.sans_objet }) },
        actions.copierLien && { libelle: 'Copier le lien', action: actions.copierLien, libre: true },
        !lectureSeule && actions.supprimer && { libelle: 'Supprimer', action: actions.supprimer, danger: true },
      ]} />
    </li>
  )
}
