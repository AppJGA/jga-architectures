import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, X, Spline } from 'lucide-react'
import { libellePoint } from '../calquesEdl'
import { miniatureLocale } from './photosEdl'
import { BarreCalques } from './BarreCalques'

// ─── Le point choisi ─────────────────────────────────────────────────────────
//
// Ancré en haut (le clavier de l'iPad couvre le bas) : type facultatif par la
// barre des calques, photo (appareil de la tablette), suppression. Sans point
// choisi, la barre reste visible, grisée, avec la consigne. Hauteur fixe
// (HAUTEUR_PANNEAU_POINT) : le plan dessous ne change jamais de taille pendant
// la visite, une pièce agrandie ou un pincement ne sont pas défaits.
// « Relier » (interrupteur ou luminaire, migration 084) : `onRelier` absent,
// le bouton n'est pas montré.

const HAUTEUR_PANNEAU_POINT = 170

const bouton = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.18)', background: 'white',
  color: '#1F1B17', fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
}

function Miniature({ photo, obtenirLiens }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let actif = true
    // Pas encore partie : la copie de l'appareil ; sinon le lien signé
    miniatureLocale(photo.id)
      .then(async (locale) => locale ?? (await obtenirLiens([photo.chemin_miniature])).get(photo.chemin_miniature))
      .then((u) => { if (actif) setUrl(u ?? null) })
      .catch(() => {})
    return () => { actif = false }
  }, [photo.id, photo.chemin_miniature, obtenirLiens])
  return url
    ? <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
    : <span style={{ width: 40, height: 40, borderRadius: 2, background: '#EFEBE4', flexShrink: 0 }} />
}

export function PanneauPoint({ point, photos, obtenirLiens, inactif, onType, onPhoto, onSupprimer, onFermer, onRelier = null, relierEnCours = false }) {
  const entree = useRef(null)
  return (
    <div style={{ height: HAUTEUR_PANNEAU_POINT, boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0, background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: point ? 600 : 400, color: point ? '#1F1B17' : '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {point
            ? `${libellePoint(point)}${point.type ? '' : ' · type à préciser ici, ou à dire à voix haute'}`
            : 'Touchez le plan pour poser un point, puis décrivez-le. Le type se précise ici si vous voulez.'}
        </span>
        {point && photos.length > 0 && (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 220, flexShrink: 1 }}>
            {photos.map((ph) => <Miniature key={ph.id} photo={ph} obtenirLiens={obtenirLiens} />)}
          </div>
        )}
        {point && (
          <>
            {onRelier && (
              <button type="button" aria-pressed={relierEnCours} disabled={inactif} onClick={onRelier}
                title="Relier cet interrupteur au luminaire qu’il commande (ou l’inverse)"
                style={{ ...bouton, color: '#1565C0', ...(relierEnCours ? { borderColor: '#1565C0', background: '#EEF4FB' } : {}) }}>
                <Spline size={17} /> Relier
              </button>
            )}
            <button type="button" style={bouton} disabled={inactif} onClick={() => entree.current?.click()}>
              <Camera size={18} /> Photo{photos.length ? ` (${photos.length})` : ''}
            </button>
            <button type="button" style={{ ...bouton, color: '#B8412C' }} disabled={inactif} onClick={onSupprimer}><Trash2 size={16} /> Supprimer</button>
            <button type="button" style={{ ...bouton, width: 44, padding: 0, justifyContent: 'center' }} disabled={inactif} aria-label="Laisser ce point" onClick={onFermer}><X size={18} /></button>
          </>
        )}
        <input
          ref={entree} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }}
        />
      </div>
      <BarreCalques key={point?.id ?? 'aucun'} typeChoisi={point?.type ?? null} inactif={inactif || !point} onChoisir={onType} />
    </div>
  )
}
