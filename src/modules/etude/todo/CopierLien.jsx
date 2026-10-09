import { useEffect, useState } from 'react'
import { Link2, Check } from 'lucide-react'
import { copierDansPressePapiers } from './pressePapiers'

// Copie l'adresse d'une liste, d'une phase ou d'une tâche, à envoyer à un
// collaborateur de l'affaire. Reste actif en lecture seule
// (`data-consultation="libre"`) : partager n'est pas modifier.

export function CopierLien({ lien, libelle = 'Copier le lien', avecTexte = false }) {
  const [copie, setCopie] = useState(false)
  useEffect(() => {
    if (!copie) return
    const t = setTimeout(() => setCopie(false), 1800)
    return () => clearTimeout(t)
  }, [copie])

  const copier = async () => { if (await copierDansPressePapiers(lien)) setCopie(true) }

  return (
    <button type="button" onClick={copier} data-consultation="libre" title={libelle} aria-label={libelle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: avecTexte ? '0 12px' : '0 6px',
        border: avecTexte ? '0.5px solid rgba(0,0,0,0.15)' : 'none', borderRadius: 3, background: avecTexte ? 'white' : 'none',
        color: copie ? '#2A8A4E' : '#5E5854', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
      {copie ? <Check size={15} /> : <Link2 size={15} />}
      {(avecTexte || copie) && <span>{copie ? 'Lien copié' : libelle}</span>}
    </button>
  )
}
