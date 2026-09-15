import { useState, useEffect, useRef } from 'react'
import { Camera, Images, ChevronLeft, ChevronRight, X, PenLine } from 'lucide-react'
import { useCr } from './CrContexte'
import { BoutonSupprimer } from './BoutonSupprimer'
import { AnnotationPhoto } from './AnnotationPhoto'

// Bouton « Photo », miniatures, visionneuse. L'état partagé vient de
// usePhotosRemarque (usePhotosRemarque.js).

// Bouton « Photo » des actions d'une remarque. Les champs fichier sont dans
// des <label> : un clic programmé sur un champ caché est ignoré par certains
// navigateurs de tablette.
export function BoutonPhoto({ ctl }) {
  const [menu, setMenu] = useState(false)
  const conteneur = useRef(null)

  useEffect(() => {
    if (!menu) return
    const fermer = (e) => { if (!conteneur.current?.contains(e.target)) setMenu(false) }
    document.addEventListener('pointerdown', fermer)
    return () => document.removeEventListener('pointerdown', fermer)
  }, [menu])

  const choix = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 12,
    color: '#1F1B17', cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div ref={conteneur} style={{ position: 'relative' }}>
      <button
        type="button" data-compact onClick={() => setMenu(m => !m)} title="Ajouter une photo"
        aria-haspopup="menu" aria-expanded={menu}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 5px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: menu ? '#E8602C' : '#9C9591' }}
      >
        <Camera size={12} /> Photo
      </button>
      {menu && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 30, background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', boxShadow: '0 10px 24px -12px rgba(31,27,23,0.45)', minWidth: 190 }}>
          <label role="menuitem" style={choix}>
            <Camera size={14} color="#E8602C" /> Prendre une photo
            <input
              type="file" accept="image/*" capture="environment" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; setMenu(false); ctl.annoterNouvelle(f) }}
            />
          </label>
          <label role="menuitem" style={{ ...choix, borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
            <Images size={14} color="#1B3A5C" /> Choisir des photos
            <input
              type="file" accept="image/*" multiple hidden
              onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; setMenu(false); ctl.envoyerFichiers(f) }}
            />
          </label>
        </div>
      )}
    </div>
  )
}

// Miniatures sous la remarque, visionneuse et annotation
export function PhotosDeRemarque({ ctl }) {
  const { photos, liens, envoi, annotation, visionneuse } = ctl
  if (photos.length === 0 && !envoi && !annotation) return null

  return (
    <>
      {(photos.length > 0 || envoi) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {photos.map((p, i) => (
            <button
              key={p.id} type="button" onClick={() => ctl.ouvrir(i)}
              title={p.legende || 'Voir la photo'}
              style={{ width: 64, height: 64, padding: 0, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F1EFE8', cursor: 'zoom-in', overflow: 'hidden', flexShrink: 0 }}
            >
              {liens.get(p.chemin_miniature) && (
                <img src={liens.get(p.chemin_miniature)} alt={p.legende || `Photo ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </button>
          ))}
          {envoi && (
            <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 10, color: '#5E5854', border: '0.5px dashed rgba(0,0,0,0.25)', background: 'white' }}>
              Envoi de {envoi.total} photo{envoi.total > 1 ? 's' : ''}…
            </div>
          )}
        </div>
      )}
      {visionneuse !== null && photos[visionneuse] && <Visionneuse key={photos[visionneuse].id} ctl={ctl} index={visionneuse} />}
      {annotation && (
        <AnnotationPhoto
          source={annotation.source}
          enCours={ctl.enregistrement}
          onValider={ctl.validerAnnotation}
          onAnnuler={ctl.fermerAnnotation}
        />
      )}
    </>
  )
}

function Visionneuse({ ctl, index }) {
  const { lectureSeule } = useCr()
  const { photos, liens } = ctl
  const photo = photos[index]
  const [pleine, setPleine] = useState(null)
  const [legende, setLegende] = useState(photo.legende ?? '')

  // Remontée à chaque photo (clé) : légende et image repartent de zéro
  useEffect(() => {
    let abandon = false
    ctl.liensPhotos([photo.chemin]).then(m => { if (!abandon) setPleine(m.get(photo.chemin)) }).catch(() => {})
    return () => { abandon = true }
  }, [photo.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const aller = (pas) => ctl.ouvrir((index + pas + photos.length) % photos.length)
  const enregistrerLegende = () => {
    if ((photo.legende ?? '') !== legende.trim()) ctl.modifierLegende(photo, legende.trim())
  }

  useEffect(() => {
    const touche = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape') ctl.fermer()
      if (e.key === 'ArrowRight') aller(1)
      if (e.key === 'ArrowLeft') aller(-1)
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  const rond = { width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }

  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" onClick={ctl.fermer} style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(20,18,16,0.94)', display: 'flex', flexDirection: 'column' }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', color: 'white', fontSize: 13 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>
          {ctl.remarque.numero != null && `n°${ctl.remarque.numero} · `}{index + 1} / {photos.length}
        </span>
        <span style={{ flex: 1 }} />
        {!lectureSeule && (
          <>
            <button type="button" onClick={() => ctl.annoterExistante(photo)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 3, border: 'none', background: 'rgba(255,255,255,0.14)', color: 'white', cursor: 'pointer', fontSize: 13 }}>
              <PenLine size={15} /> Annoter
            </button>
            <BoutonSupprimer libelle taille={14} onConfirm={() => ctl.supprimer(photo)} style={{ padding: '8px 12px', fontSize: 13 }} />
          </>
        )}
        <button type="button" onClick={ctl.fermer} aria-label="Fermer" style={rond}><X size={20} /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px' }}>
        {photos.length > 1 && <button type="button" aria-label="Photo précédente" onClick={e => { e.stopPropagation(); aller(-1) }} style={rond}><ChevronLeft size={22} /></button>}
        <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          <img
            onClick={e => e.stopPropagation()}
            src={pleine ?? liens.get(photo.chemin_miniature)}
            alt={photo.legende || 'Photo de la remarque'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        </div>
        {photos.length > 1 && <button type="button" aria-label="Photo suivante" onClick={e => { e.stopPropagation(); aller(1) }} style={rond}><ChevronRight size={22} /></button>}
      </div>

      <div onClick={e => e.stopPropagation()} style={{ padding: '12px 14px 16px', display: 'flex', justifyContent: 'center' }}>
        {lectureSeule ? (
          photo.legende && <p style={{ color: 'white', fontSize: 14 }}>{photo.legende}</p>
        ) : (
          <input
            value={legende} onChange={e => setLegende(e.target.value)}
            onBlur={enregistrerLegende}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder="Ajouter une légende…" aria-label="Légende de la photo"
            style={{ width: '100%', maxWidth: 560, height: 40, padding: '0 12px', fontSize: 14, borderRadius: 3, border: 'none', outline: 'none' }}
          />
        )}
      </div>
    </div>
  )
}
