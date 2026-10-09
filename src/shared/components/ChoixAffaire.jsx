import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { filtrerAffaires, libelleAffaire } from '../choixAffaireLogique'

// ─── Choisir une affaire en tapant ───────────────────────────────────────────
//
// Une barre de recherche dont la liste se resserre à chaque lettre : code ou
// nom de l'affaire, sans souci des majuscules ni des accents
// (`filtrerAffaires`, testé). Clavier : ↑ ↓ pour parcourir, Entrée pour
// choisir, Échap pour refermer. Au doigt, des lignes de 44 px. C'est un menu
// déroulant : il se referme au clic à côté (convention de l'agence).

export function ChoixAffaire({ affaires, valeur, onChange, id, placeholder = 'Rechercher une affaire (code ou nom)…', accent = 'var(--affaire-accent, #E8602C)' }) {
  const idListe = useId()
  const boite = useRef(null)
  const champ = useRef(null)
  const [saisie, setSaisie] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)

  const choisie = (affaires ?? []).find((a) => a.id === valeur) ?? null
  const resultats = useMemo(() => filtrerAffaires(affaires, saisie), [affaires, saisie])

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e) => { if (!boite.current?.contains(e.target)) setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    return () => document.removeEventListener('pointerdown', dehors)
  }, [ouvert])

  // La ligne active reste visible quand on la déplace au clavier
  useEffect(() => {
    if (!ouvert) return
    document.getElementById(`${idListe}-${actif}`)?.scrollIntoView({ block: 'nearest' })
  }, [actif, ouvert, idListe])

  const choisir = (a) => {
    onChange(a.id)
    setSaisie('')
    setOuvert(false)
  }

  const clavier = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((i) => Math.min(i + 1, resultats.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (ouvert && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]) } }
    else if (e.key === 'Escape') { if (ouvert) { e.stopPropagation(); setOuvert(false) } }
  }

  // Fermé, le champ montre l'affaire choisie ; on tape pour en chercher une autre
  const texte = ouvert ? saisie : (choisie ? libelleAffaire(choisie) : saisie)

  return (
    <div ref={boite} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={15} color="#9C9591" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
        <input ref={champ} id={id} type="text" role="combobox" autoComplete="off"
          aria-expanded={ouvert} aria-controls={idListe} aria-autocomplete="list"
          aria-activedescendant={ouvert && resultats[actif] ? `${idListe}-${actif}` : undefined}
          value={texte} placeholder={placeholder}
          onFocus={() => { setOuvert(true); setActif(0) }}
          onChange={(e) => { setSaisie(e.target.value); setOuvert(true); setActif(0) }}
          onKeyDown={clavier}
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '9px 34px 9px 32px',
            border: `0.5px solid ${ouvert ? accent : 'rgba(0,0,0,0.2)'}`, borderRadius: 3, background: 'white', color: '#1F1B17',
            fontWeight: !ouvert && choisie ? 600 : 400,
          }} />
        {(choisie || saisie) && (
          <button type="button" aria-label="Effacer" onClick={() => { onChange(''); setSaisie(''); setOuvert(true); champ.current?.focus() }}
            style={{ position: 'absolute', right: 4, width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: '#9C9591', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} />
          </button>
        )}
      </div>

      {ouvert && (
        <ul id={idListe} role="listbox" aria-label="Affaires"
          style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 60, margin: 0, padding: 4, listStyle: 'none',
            maxHeight: 280, overflowY: 'auto', background: 'white', border: '0.5px solid rgba(0,0,0,0.12)',
            boxShadow: '0 12px 30px -12px rgba(31,27,23,0.35)',
          }}>
          {resultats.length === 0 && <li style={{ padding: '10px 12px', fontSize: 13, color: '#9C9591' }}>Aucune affaire ne correspond.</li>}
          {resultats.map((a, i) => (
            <li key={a.id} id={`${idListe}-${i}`} role="option" aria-selected={a.id === valeur}
              onPointerDown={(e) => e.preventDefault()} // garde le focus dans le champ
              onClick={() => choisir(a)} onMouseEnter={() => setActif(i)}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 44, boxSizing: 'border-box', padding: '11px 12px', cursor: 'pointer',
                background: i === actif ? 'rgba(0,0,0,0.05)' : 'transparent', borderLeft: `3px solid ${a.id === valeur ? accent : 'transparent'}`,
              }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1F1B17', flexShrink: 0 }}>{a.code_affaire}</span>
              <span style={{ fontSize: 13, color: '#5E5854', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nom}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
