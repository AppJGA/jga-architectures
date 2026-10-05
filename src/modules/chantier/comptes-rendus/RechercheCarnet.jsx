import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, User, Building2 } from 'lucide-react'
import { supabase } from '../../../core/supabase/client'
import { optionsCarnet, filtrerOptions } from './rechercheCarnetLogique'

// ─── Barre de recherche du carnet d'adresses ─────────────────────────────────
//
// Le carnet est chargé une fois à l'ouverture : la liste s'affiche dès que
// l'on entre dans la barre et se précise à chaque lettre, sans attendre le
// réseau. Flèches et Entrée au clavier ; au doigt, on touche une ligne.

const INPUT = {
  width: '100%', height: 36, padding: '0 10px 0 30px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

export function RechercheCarnet({ onChoisir }) {
  const [entreprises, setEntreprises] = useState(null)
  const [requete, setRequete] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const liste = useRef(null)

  useEffect(() => {
    let annule = false
    supabase
      .from('entreprises')
      .select('id, raison_sociale, adresse, code_postal, ville, telephone, email, siret, interlocuteurs(id, prenom, nom, fonction, telephone, email)')
      .order('raison_sociale')
      .then(({ data }) => { if (!annule) setEntreprises(data ?? []) })
    return () => { annule = true }
  }, [])

  const options = useMemo(() => optionsCarnet(entreprises ?? []), [entreprises])
  const resultats = useMemo(() => filtrerOptions(options, requete), [options, requete])

  // La ligne active reste visible quand on la déplace au clavier
  useEffect(() => {
    liste.current?.querySelector(`[data-rang="${actif}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [actif])

  const choisir = (option) => {
    onChoisir(option)
    setRequete('')
    setOuvert(false)
  }

  const touche = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((a) => Math.min(a + 1, resultats.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') { setOuvert(false) }
    else if (e.key === 'Enter') {
      // L'Entrée du formulaire enregistre l'interlocuteur : ici, elle choisit
      e.preventDefault()
      e.stopPropagation()
      if (ouvert && resultats[actif]) choisir(resultats[actif])
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9C9591', pointerEvents: 'none' }} />
        <input
          value={requete}
          onChange={(e) => { setRequete(e.target.value); setOuvert(true); setActif(0) }}
          onFocus={(e) => { setOuvert(true); e.target.style.borderColor = '#E8602C' }}
          // Laisse le temps au toucher d'une ligne d'être pris en compte
          onBlur={(e) => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; setTimeout(() => setOuvert(false), 180) }}
          onKeyDown={touche}
          placeholder="Nom, prénom, organisation, ville, téléphone, e-mail…"
          aria-label="Rechercher dans le carnet d’adresses"
          autoComplete="off"
          style={INPUT}
        />
      </div>
      {ouvert && (
        <div ref={liste} role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 60, maxHeight: 320, overflowY: 'auto',
          backgroundColor: 'white', border: '0.5px solid rgba(0,0,0,0.15)', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.35)',
        }}>
          <p style={{ fontSize: 11, color: '#9C9591', margin: 0, padding: '6px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            {entreprises === null ? 'Chargement du carnet…'
              : resultats.length === 0 ? 'Aucune fiche ne correspond.'
                : requete.trim() ? `${resultats.length}${resultats.length === 60 ? '+' : ''} résultat${resultats.length > 1 ? 's' : ''}`
                  : 'Tout le carnet — tapez pour préciser'}
          </p>
          {resultats.map((o, rang) => {
            const Icone = o.type === 'personne' ? User : Building2
            return (
              <button
                key={o.cle} type="button" role="option" aria-selected={rang === actif} data-rang={rang}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(o)}
                onMouseEnter={() => setActif(rang)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', minHeight: 44, padding: '7px 12px',
                  textAlign: 'left', border: 'none', borderBottom: '0.5px solid rgba(0,0,0,0.05)', cursor: 'pointer',
                  background: rang === actif ? 'rgba(232,96,44,0.08)' : 'white',
                }}
              >
                <Icone size={15} color={o.type === 'personne' ? '#E8602C' : '#5E5854'} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>{o.titre}</span>
                  {o.detail && <span style={{ display: 'block', fontSize: 11, color: '#7A736E', overflowWrap: 'anywhere' }}>{o.detail}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
