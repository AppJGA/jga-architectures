import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, List } from 'lucide-react'

// Éditeur de texte à mise en forme simple, pour les mentions du PDF.
// La zone n'est pas contrôlée par React : réécrire son contenu à chaque frappe
// renverrait le curseur au début. Le contenu n'est posé qu'à l'ouverture
// (changement de `valeurInitiale`) ; chaque saisie remonte par `onChange`.

const OUTILS = [
  { commande: 'bold', Icone: Bold, titre: 'Gras' },
  { commande: 'italic', Icone: Italic, titre: 'Italique' },
  { commande: 'underline', Icone: Underline, titre: 'Souligné' },
  { commande: 'insertUnorderedList', Icone: List, titre: 'Liste à puces' },
]

export function EditeurTexte({ valeurInitiale = '', onChange, placeholder = '' }) {
  const zone = useRef(null)

  useEffect(() => {
    if (zone.current && zone.current.innerHTML !== valeurInitiale) zone.current.innerHTML = valeurInitiale
  }, [valeurInitiale])

  const appliquer = (commande) => {
    const el = zone.current
    if (!el) return
    // Zone pas encore active : on y entre par la fin, pas par le début
    if (document.activeElement !== el) {
      el.focus()
      const plage = document.createRange()
      plage.selectNodeContents(el)
      plage.collapse(false)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(plage)
    }
    document.execCommand(commande, false)
    onChange?.(zone.current?.innerHTML ?? '')
  }

  return (
    <div style={{ border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9' }}>
      <div style={{ display: 'flex', gap: 2, padding: 3, borderBottom: '0.5px solid rgba(0,0,0,0.08)', backgroundColor: 'white' }}>
        {OUTILS.map(({ commande, Icone, titre }) => (
          <button
            key={commande}
            type="button"
            title={titre}
            aria-label={titre}
            // Garder la sélection : un clic ordinaire la ferait perdre à la zone
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => appliquer(commande)}
            style={{
              width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', cursor: 'pointer', color: '#5E5854',
            }}
          >
            <Icone size={15} />
          </button>
        ))}
      </div>
      <div
        ref={zone}
        className="editeur-texte-pdf"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={() => onChange?.(zone.current?.innerHTML ?? '')}
        style={{ minHeight: 60, maxHeight: 180, overflowY: 'auto', padding: '8px 10px', fontSize: 12, color: '#1F1B17', outline: 'none', lineHeight: 1.5 }}
      />
    </div>
  )
}
