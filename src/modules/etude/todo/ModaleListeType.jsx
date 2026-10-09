import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { groupesDe, ordreSuivant, deplacer } from './todoLogique'
import { ajouterAuModele, modifierModele, reordonnerModele } from './todoDonnees'

// ─── Liste type de l'agence ──────────────────────────────────────────────────
//
// Ce qui se modifie ici vaut pour toutes les affaires, en cours comprises.
// Un article supprimé n'est que retiré (`supprime_le`) : il reste, grisé, dans
// les affaires où il avait été coché ou annoté. Monter / descendre par des
// flèches plutôt qu'un glisser : sûr au doigt sur l'iPad.
// Dans un portail : une fenêtre `fixed` ouverte sous une carte animée y
// resterait prise. Se ferme par ✕ ou Échap, jamais au clic à côté.

const bouton = { width: 34, height: 34, border: 'none', background: 'none', borderRadius: 3, cursor: 'pointer', color: '#5E5854', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }

function LigneModele({ ligne, premier, dernier, onRenommer, onMonter, onDescendre, onSupprimer }) {
  const [texte, setTexte] = useState(ligne.texte)
  const valider = () => { const t = texte.trim(); if (t && t !== ligne.texte) onRenommer(t); else setTexte(ligne.texte) }
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
      <input value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} aria-label="Texte de l'article"
        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '7px 8px', border: '0.5px solid transparent', borderRadius: 3, background: 'transparent' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'; e.currentTarget.style.background = 'white' }}
        onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }} />
      <button type="button" onClick={onMonter} disabled={premier} aria-label="Monter" style={{ ...bouton, opacity: premier ? 0.25 : 1 }}><ArrowUp size={16} /></button>
      <button type="button" onClick={onDescendre} disabled={dernier} aria-label="Descendre" style={{ ...bouton, opacity: dernier ? 0.25 : 1 }}><ArrowDown size={16} /></button>
      <button type="button" onClick={onSupprimer} aria-label="Supprimer de la liste type" style={{ ...bouton, color: '#B8412C' }}><Trash2 size={16} /></button>
    </li>
  )
}

export function ModaleListeType({ modele, listeInitiale = 'mission', groupeInitial, poserModele, onFermer }) {
  const [liste, setListe] = useState(listeInitiale)
  const [groupe, setGroupe] = useState(groupeInitial ?? groupesDe(listeInitiale)[0].code)
  const [nouveau, setNouveau] = useState('')
  const [aSupprimer, setASupprimer] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape' && !aSupprimer) onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer, aSupprimer])

  const lignes = useMemo(() => modele
    .filter((m) => m.liste === liste && m.groupe === groupe && !m.supprime_le)
    .sort((a, b) => a.ordre - b.ordre), [modele, liste, groupe])

  const agir = async (fn) => {
    try { setErreur(null); await fn() } catch (e) { setErreur(e?.message ?? String(e)) }
  }

  const changerListe = (l) => { setListe(l); setGroupe(groupesDe(l)[0].code) }

  const deplacerLigne = (i, sens) => agir(async () => {
    const changements = deplacer(lignes, i, sens)
    await reordonnerModele(changements)
    changements.forEach(({ id, ordre }) => poserModele({ ...modele.find((m) => m.id === id), ordre }))
  })

  const ajouter = () => agir(async () => {
    const texte = nouveau.trim()
    if (!texte) return
    poserModele(await ajouterAuModele({ liste, groupe, texte, ordre: ordreSuivant(lignes, groupe) }))
    setNouveau('')
  })

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top) + 24px) 16px 24px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Liste type de l'agence"
        style={{ background: 'white', width: '100%', maxWidth: 760, borderTop: '3px solid var(--affaire-accent, #E8602C)', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 10px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1F1B17' }}>Liste type de l’agence</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5E5854', lineHeight: 1.5 }}>
              Les changements valent pour toutes les affaires, en cours comprises. Un article supprimé reste visible, grisé, là où il avait déjà été coché ou annoté.
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={bouton}><X size={18} /></button>
        </header>

        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['mission', 'Mission'], ['plans', 'Contenu des plans']].map(([code, libelle]) => (
              <button key={code} type="button" onClick={() => changerListe(code)} aria-pressed={liste === code}
                style={{ minHeight: 34, padding: '0 14px', borderRadius: 3, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: liste === code ? 'none' : '0.5px solid rgba(0,0,0,0.15)', background: liste === code ? '#1F1B17' : 'white', color: liste === code ? 'white' : '#1F1B17' }}>
                {libelle}
              </button>
            ))}
          </div>
          <select value={groupe} onChange={(e) => setGroupe(e.target.value)} aria-label={liste === 'mission' ? 'Phase' : 'Rubrique'}
            style={{ fontSize: 13, padding: '8px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3, background: 'white' }}>
            {groupesDe(liste).map((g) => <option key={g.code} value={g.code}>{g.libelle}</option>)}
          </select>
          {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>Non enregistré : {erreur}</p>}
        </div>

        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: '0 22px', overflowY: 'auto', flex: 1 }}>
          {lignes.map((l, i) => (
            <LigneModele key={`${l.id}:${l.texte}`} ligne={l} premier={i === 0} dernier={i === lignes.length - 1}
              onRenommer={(texte) => agir(async () => poserModele(await modifierModele(l.id, { texte })))}
              onMonter={() => deplacerLigne(i, -1)} onDescendre={() => deplacerLigne(i, 1)}
              onSupprimer={() => setASupprimer(l)} />
          ))}
          {lignes.length === 0 && <li style={{ padding: '12px 0', fontSize: 13, color: '#9C9591' }}>Aucun article.</li>}
        </ul>

        <footer style={{ display: 'flex', gap: 8, padding: '12px 22px 18px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <input value={nouveau} onChange={(e) => setNouveau(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ajouter() }}
            placeholder="Nouvel article de la liste type…" aria-label="Nouvel article de la liste type"
            style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '8px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3 }} />
          <button type="button" onClick={ajouter} disabled={!nouveau.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: nouveau.trim() ? 1 : 0.5 }}>
            <Plus size={15} /> Ajouter
          </button>
        </footer>
      </div>

      {aSupprimer && (
        <ModaleConfirmation danger titre="Retirer de la liste type ?" libelle="Retirer"
          texte={`« ${aSupprimer.texte} » ne sera plus proposé dans les affaires. Il restera visible, grisé, dans celles où il avait déjà été coché ou annoté.`}
          onAnnuler={() => setASupprimer(null)}
          onConfirmer={async () => {
            await agir(async () => poserModele(await modifierModele(aSupprimer.id, { supprime_le: new Date().toISOString() })))
            setASupprimer(null)
          }} />
      )}
    </div>,
    document.body,
  )
}
