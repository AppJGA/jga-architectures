import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'

// ─── Bouton de suppression en deux temps ──────────────────────────────────────
// Premier clic : le bouton passe au rouge et demande confirmation. Sans second
// clic dans les 3 secondes, il se réarme : un clic distrait des minutes plus
// tard ne doit pas supprimer.

export function BoutonSupprimer({ onConfirm, taille = 12, libelle = false, style }) {
  const [arme, setArme] = useState(false)
  useEffect(() => {
    if (!arme) return
    const t = setTimeout(() => setArme(false), 3000)
    return () => clearTimeout(t)
  }, [arme])

  return (
    <button
      type="button"
      data-compact={libelle ? undefined : true}
      title={arme ? 'Cliquer à nouveau pour confirmer' : 'Supprimer'}
      onClick={() => {
        if (!arme) { setArme(true); return }
        setArme(false)
        onConfirm()
      }}
      style={libelle ? {
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 2, fontSize: 11, cursor: 'pointer',
        border: `0.5px solid ${arme ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
        backgroundColor: arme ? 'rgba(184,65,44,0.10)' : 'white', color: arme ? '#B8412C' : '#9C9591',
        ...style,
      } : {
        display: 'inline-flex', alignItems: 'center', gap: 3, padding: arme ? '2px 5px' : 3, borderRadius: 2,
        background: arme ? 'rgba(184,65,44,0.10)' : 'none', border: 'none', cursor: 'pointer',
        fontSize: 10, color: arme ? '#B8412C' : '#9C9591',
        ...style,
      }}
    >
      <Trash2 size={taille} />
      {libelle ? (arme ? 'Confirmer' : 'Supprimer') : (arme && 'Confirmer')}
    </button>
  )
}
