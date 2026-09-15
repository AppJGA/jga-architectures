import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { MoveUpRight, Circle, PenLine, Type, Undo2, X, Check } from 'lucide-react'
import { chargerImage } from './compressionPhoto'
import { dimensionsCible, pointeFleche, TAILLE_PHOTO } from './photosLogique'

// ─── Annotation d'une photo ──────────────────────────────────────────────────
//
// Flèche, cercle, trait libre et texte, au doigt ou à la souris. Les formes
// sont gardées en coordonnées de la photo finale (TAILLE_PHOTO) : l'écran n'en
// montre qu'une version réduite, et l'export redessine tout à pleine taille.
// L'annotation est incrustée dans l'image rendue : pas de second fichier.

const OUTILS = [
  { id: 'fleche', libelle: 'Flèche', Icone: MoveUpRight },
  { id: 'cercle', libelle: 'Cercle', Icone: Circle },
  { id: 'trait', libelle: 'Trait', Icone: PenLine },
  { id: 'texte', libelle: 'Texte', Icone: Type },
]
const COULEURS = ['#E0301E', '#F5B400', '#FFFFFF', '#1F6FEB']

function dessinerFormes(ctx, formes, echelle, taille) {
  const epaisseur = Math.max(6, Math.round(taille / 150)) * echelle
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of formes) {
    ctx.strokeStyle = f.couleur
    ctx.fillStyle = f.couleur
    ctx.lineWidth = epaisseur
    // Liseré sombre sous chaque forme : lisible sur un mur blanc comme sur du béton
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = epaisseur * 0.8
    if (f.type === 'trait' && f.points.length > 1) {
      ctx.beginPath()
      f.points.forEach((p, i) => (i ? ctx.lineTo(p.x * echelle, p.y * echelle) : ctx.moveTo(p.x * echelle, p.y * echelle)))
      ctx.stroke()
    } else if (f.type === 'fleche') {
      const [a, b] = pointeFleche(f.x1, f.y1, f.x2, f.y2, taille / 22)
      ctx.beginPath()
      ctx.moveTo(f.x1 * echelle, f.y1 * echelle)
      ctx.lineTo(f.x2 * echelle, f.y2 * echelle)
      ctx.moveTo(a.x * echelle, a.y * echelle)
      ctx.lineTo(f.x2 * echelle, f.y2 * echelle)
      ctx.lineTo(b.x * echelle, b.y * echelle)
      ctx.stroke()
    } else if (f.type === 'cercle') {
      const rx = Math.abs(f.x2 - f.x1) / 2
      const ry = Math.abs(f.y2 - f.y1) / 2
      ctx.beginPath()
      ctx.ellipse(((f.x1 + f.x2) / 2) * echelle, ((f.y1 + f.y2) / 2) * echelle, Math.max(rx, 1) * echelle, Math.max(ry, 1) * echelle, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (f.type === 'texte') {
      const corps = Math.round(taille / 20) * echelle
      ctx.font = `600 ${corps}px Arial, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.shadowBlur = corps / 5
      ctx.lineWidth = corps / 7
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(f.texte, f.x * echelle, f.y * echelle)
      ctx.fillText(f.texte, f.x * echelle, f.y * echelle)
    }
    ctx.shadowBlur = 0
  }
}

/**
 * @param source   File / Blob (photo prise) ou lien de la photo déjà enregistrée
 * @param onValider(canvas) reçoit la photo annotée à pleine taille
 */
export function AnnotationPhoto({ source, onValider, onAnnuler, enCours = false }) {
  const [image, setImage] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [outil, setOutil] = useState('fleche')
  const [couleur, setCouleur] = useState(COULEURS[0])
  const [formes, setFormes] = useState([])
  const [enTrace, setEnTrace] = useState(null)
  const [saisieTexte, setSaisieTexte] = useState(null) // { x, y, texte } en coordonnées photo
  const [affichage, setAffichage] = useState({ largeur: 0, hauteur: 0 })
  const zone = useRef(null)
  const canvas = useRef(null)
  // Forme en cours, lue par la fin du geste : sur une tablette chargée, le
  // doigt peut se lever avant que l'écran ait rendu le dernier mouvement, et
  // l'état React serait alors en retard d'une image.
  const trace = useRef(null)

  useEffect(() => {
    let abandon = false
    const charger = typeof source === 'string'
      // Récupérée en fichier : une image d'une autre adresse « salirait » le
      // canevas, qui refuserait ensuite d'exporter
      ? fetch(source).then(r => { if (!r.ok) throw new Error('Photo introuvable.'); return r.blob() }).then(chargerImage)
      : chargerImage(source)
    charger.then(img => { if (!abandon) setImage(img) }).catch(e => { if (!abandon) setErreur(e.message) })
    return () => { abandon = true }
  }, [source])

  const taille = image ? dimensionsCible(image.naturalWidth, image.naturalHeight, TAILLE_PHOTO) : null

  // Place disponible à l'écran
  useLayoutEffect(() => {
    if (!taille || !zone.current) return
    const mesurer = () => {
      const r = zone.current.getBoundingClientRect()
      const echelle = Math.min(r.width / taille.largeur, r.height / taille.hauteur)
      setAffichage({ largeur: Math.floor(taille.largeur * echelle), hauteur: Math.floor(taille.hauteur * echelle) })
    }
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => window.removeEventListener('resize', mesurer)
  }, [taille?.largeur, taille?.hauteur]) // eslint-disable-line react-hooks/exhaustive-deps

  const echelle = taille && affichage.largeur ? affichage.largeur / taille.largeur : 0

  useEffect(() => {
    const c = canvas.current
    if (!c || !image || !echelle) return
    const dpr = window.devicePixelRatio || 1
    c.width = affichage.largeur * dpr
    c.height = affichage.hauteur * dpr
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.drawImage(image, 0, 0, affichage.largeur, affichage.hauteur)
    dessinerFormes(ctx, enTrace ? [...formes, enTrace] : formes, echelle, taille.largeur)
  }, [image, formes, enTrace, affichage, echelle, taille?.largeur])

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / echelle, y: (e.clientY - r.top) / echelle }
  }

  const debut = (e) => {
    if (!echelle || enCours) return
    const p = point(e)
    if (outil === 'texte') { setSaisieTexte({ ...p, texte: '' }); return }
    // Le trait continue même si le doigt déborde de la photo
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointeur déjà relâché */ }
    trace.current = outil === 'trait'
      ? { type: 'trait', couleur, points: [p] }
      : { type: outil, couleur, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
    setEnTrace(trace.current)
  }
  const deplacement = (e) => {
    const f = trace.current
    if (!f) return
    const p = point(e)
    trace.current = f.type === 'trait' ? { ...f, points: [...f.points, p] } : { ...f, x2: p.x, y2: p.y }
    setEnTrace(trace.current)
  }
  const fin = () => {
    const f = trace.current
    trace.current = null
    setEnTrace(null)
    if (!f) return
    const utile = f.type === 'trait'
      ? f.points.length > 1
      : Math.hypot(f.x2 - f.x1, f.y2 - f.y1) > 8 / echelle
    if (utile) setFormes(fs => [...fs, f])
  }

  const validerTexte = () => {
    if (saisieTexte?.texte.trim()) setFormes(fs => [...fs, { type: 'texte', couleur, x: saisieTexte.x, y: saisieTexte.y, texte: saisieTexte.texte.trim() }])
    setSaisieTexte(null)
  }

  const enregistrer = () => {
    const sortie = document.createElement('canvas')
    sortie.width = taille.largeur
    sortie.height = taille.hauteur
    const ctx = sortie.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, taille.largeur, taille.hauteur)
    dessinerFormes(ctx, formes, 1, taille.largeur)
    onValider(sortie)
  }

  useEffect(() => {
    const touche = (e) => {
      if (e.key === 'Escape' && !saisieTexte) onAnnuler()
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); setFormes(fs => fs.slice(0, -1)) }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler, saisieTexte])

  const boutonBarre = (actif) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 40,
    borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: 13,
    background: actif ? 'white' : 'rgba(255,255,255,0.12)', color: actif ? '#1F1B17' : 'white',
  })

  return (
    <div role="dialog" aria-modal="true" aria-label="Annoter la photo" style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#141210', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {OUTILS.map(({ id, libelle, Icone }) => (
          <button key={id} type="button" aria-pressed={outil === id} onClick={() => setOutil(id)} style={boutonBarre(outil === id)}>
            <Icone size={16} /> {libelle}
          </button>
        ))}
        <span style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
        {COULEURS.map(c => (
          <button
            key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={couleur === c} onClick={() => setCouleur(c)}
            style={{ width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer', border: couleur === c ? '3px solid white' : '2px solid rgba(255,255,255,0.3)', boxShadow: couleur === c ? '0 0 0 2px #E8602C' : 'none' }}
          />
        ))}
        <button type="button" onClick={() => setFormes(fs => fs.slice(0, -1))} disabled={formes.length === 0} style={{ ...boutonBarre(false), opacity: formes.length ? 1 : 0.4 }}>
          <Undo2 size={16} /> Annuler le dernier
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onAnnuler} disabled={enCours} style={boutonBarre(false)}>
          <X size={16} /> Fermer
        </button>
        <button type="button" onClick={enregistrer} disabled={!image || enCours} style={{ ...boutonBarre(false), background: '#2A8A4E', fontWeight: 600, opacity: !image || enCours ? 0.6 : 1 }}>
          <Check size={16} /> {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div ref={zone} style={{ flex: 1, minHeight: 0, margin: '0 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {erreur && <p style={{ color: 'white', fontSize: 14 }}>{erreur}</p>}
        {!image && !erreur && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Chargement de la photo…</p>}
        {image && (
          <div style={{ position: 'relative', width: affichage.largeur, height: affichage.hauteur }}>
            <canvas
              ref={canvas}
              onPointerDown={debut} onPointerMove={deplacement} onPointerUp={fin} onPointerCancel={fin}
              style={{ width: affichage.largeur, height: affichage.hauteur, display: 'block', touchAction: 'none', cursor: outil === 'texte' ? 'text' : 'crosshair' }}
            />
            {saisieTexte && (
              <div style={{ position: 'absolute', left: Math.min(saisieTexte.x * echelle, affichage.largeur - 220), top: Math.max(0, saisieTexte.y * echelle - 20), display: 'flex', gap: 4 }}>
                <input
                  autoFocus value={saisieTexte.texte}
                  onChange={e => setSaisieTexte(t => ({ ...t, texte: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') validerTexte(); if (e.key === 'Escape') setSaisieTexte(null) }}
                  placeholder="Texte…" aria-label="Texte de l’annotation"
                  style={{ width: 170, height: 36, padding: '0 8px', fontSize: 15, border: `2px solid ${couleur}`, borderRadius: 3, outline: 'none' }}
                />
                <button type="button" onClick={validerTexte} style={{ ...boutonBarre(true), minHeight: 36, padding: '0 10px' }}>OK</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
