import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { Plus, Minus, Maximize } from 'lucide-react'
import { zoomAutour, limiterVue, pointSurPlan, vueSurCadre, cleDeCadre, recadrerVue, tailleCanevas } from './plansLogique'

// ─── Visionneuse de plan ─────────────────────────────────────────────────────
//
// Déplacer au doigt ou à la souris, pincer ou molette pour zoomer, boutons
// + / − / ajuster. Un appui bref sans glisser « touche » le plan (placement
// d'une pastille) ; un appui sur une pastille la sélectionne. L'aperçu léger
// s'affiche d'abord, la pleine définition le remplace une fois chargée.
// `cadre` (fractions de l'image) : la vue s'y ajuste à chaque changement —
// une pièce de l'état des lieux remplit l'écran ; le pincement reste libre
// jusqu'à `zoomMax`.
// `dessinFond(ctx, { largeurImage, hauteurImage, versEcran, echelle, ecran })`
// (facultatif, plan vectoriel de l'état des lieux) : un canevas sous le plan,
// redessiné à chaque vue, garde le dessin net à tous les zooms là où l'image
// devient floue. L'image reste, invisible, pour la mesure des appuis.

const SEUIL_APPUI = 6 // px de déplacement au-delà desquels ce n'est plus un appui

// Ombre de la feuille, à peu près celle de l'image (`box-shadow`) : le
// canevas ne connaît pas d'étalement négatif
const OMBRE_FEUILLE = { couleur: 'rgba(0,0,0,0.2)', flou: 14, y: 6 }

// Peint la feuille blanche du plan puis le dessin, rogné à la feuille : rien
// ne déborde sur le fond gris. `e` : dernières valeurs de la vue.
function peindreFond(canvas, e) {
  if (!canvas || !e?.dessinFond || !(e.echelle > 0) || !(e.taille.largeur > 0)) return
  const { largeur, hauteur } = e.taille
  const t = tailleCanevas(largeur, hauteur, window.devicePixelRatio || 1)
  // Réaffecter la taille réalloue le canevas : seulement quand elle change
  if (canvas.width !== t.largeur) canvas.width = t.largeur
  if (canvas.height !== t.hauteur) canvas.height = t.hauteur
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(canvas.width / largeur, 0, 0, canvas.height / hauteur, 0, 0)
  const k = e.echelle * e.vue.zoom
  const x0 = e.ox + e.vue.dx
  const y0 = e.oy + e.vue.dy
  const lf = e.largeurImage * k
  const hf = e.hauteurImage * k
  ctx.save()
  ctx.shadowColor = OMBRE_FEUILLE.couleur
  ctx.shadowBlur = OMBRE_FEUILLE.flou
  ctx.shadowOffsetY = OMBRE_FEUILLE.y
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x0, y0, lf, hf)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, lf, hf)
  ctx.clip()
  try {
    e.dessinFond(ctx, {
      largeurImage: e.largeurImage, hauteurImage: e.hauteurImage,
      versEcran: (x, y) => [x0 + x * k, y0 + y * k],
      echelle: k, ecran: { largeur, hauteur },
    })
  } catch (err) {
    console.warn('Plan vectoriel :', err)
  }
  ctx.restore()
}

export function VisionneusePlan({ version, obtenirLiens, pastilles = [], idActive, onToucher, onPastille, calque, cadre = null, zoomMax = 12, dessinFond = null }) {
  const conteneur = useRef(null)
  const image = useRef(null)
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 })
  const [vue, setVue] = useState({ zoom: 1, dx: 0, dy: 0 })
  const [cadreVu, setCadreVu] = useState(null)
  const [urlApercu, setUrlApercu] = useState(null)
  const [urlPleine, setUrlPleine] = useState(null)
  const pointeurs = useRef(new Map())
  const geste = useRef(null)
  const canevas = useRef(null)
  const fond = useRef({ attente: 0, etat: null }) // image demandée, dernières valeurs

  useEffect(() => {
    if (!version) return
    let abandon = false
    obtenirLiens([version.chemin_apercu, version.chemin]).then(liens => {
      if (abandon) return
      setUrlApercu(liens.get(version.chemin_apercu))
      const pleine = liens.get(version.chemin)
      if (!pleine) return
      const prechargement = new Image()
      prechargement.onload = () => { if (!abandon) setUrlPleine(pleine) }
      prechargement.src = pleine
    }).catch(err => console.warn('Plan :', err))
    return () => { abandon = true }
  }, [version?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = conteneur.current
    if (!el) return
    const mesurer = () => setTaille({ largeur: el.clientWidth, hauteur: el.clientHeight })
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Plan ajusté à l'écran au zoom 1, centré
  const echelle = version && taille.largeur ? Math.min(taille.largeur / version.largeur, taille.hauteur / version.hauteur) : 0
  const bw = version ? version.largeur * echelle : 0
  const bh = version ? version.hauteur * echelle : 0
  const ox = (taille.largeur - bw) / 2
  const oy = (taille.hauteur - bh) / 2

  const vueDuCadre = () => (cadre ? limiterVue(vueSurCadre(cadre, taille, { bw, bh, ox, oy }, { zoomMax }), bw, bh) : { zoom: 1, dx: 0, dy: 0 })
  // Nouveau cadre (pièce ouverte, refermée), ou conteneur redimensionné alors
  // qu'un cadre est posé : la vue s'y ajuste (cleDeCadre, testé). Le pincement
  // qui suit reste libre. Conteneur masqué un instant : la clé retenue reste
  // (recadrerVue, testé), le zoom de l'utilisateur n'est pas défait.
  const cleCadre = echelle > 0 ? cleDeCadre(cadre, taille) : null
  if (recadrerVue(cadreVu, cleCadre)) {
    setCadreVu(cleCadre)
    setVue(vueDuCadre())
  }

  // Un seul dessin par image affichée : un pincement change la vue à chaque
  // événement pointeur, souvent plusieurs fois entre deux images. Le dessin
  // lit les dernières valeurs au moment de l'image, pas celles de la demande.
  const largeurImage = version?.largeur
  const hauteurImage = version?.hauteur
  useEffect(() => {
    const f = fond.current
    f.etat = { dessinFond, vue, taille, echelle, ox, oy, largeurImage, hauteurImage }
    if (!dessinFond || f.attente) return
    f.attente = requestAnimationFrame(() => {
      f.attente = 0
      peindreFond(canevas.current, f.etat)
    })
  }, [dessinFond, vue, taille, echelle, ox, oy, largeurImage, hauteurImage])
  useEffect(() => {
    const f = fond.current
    return () => { cancelAnimationFrame(f.attente); f.attente = 0 }
  }, [])
  // Le canevas est libéré au démontage (plafond de mémoire de l'iPad)
  const refCanevas = useCallback((el) => {
    canevas.current = el
    if (!el) return undefined
    return () => {
      el.width = 0
      el.height = 0
      if (canevas.current === el) canevas.current = null
    }
  }, [])

  const appliquer = (v) => setVue(limiterVue(v, bw, bh))
  const zoomer = (facteur, px = taille.largeur / 2, py = taille.hauteur / 2) => {
    setVue(v => limiterVue(zoomAutour(v, facteur, px - ox, py - oy, 1, zoomMax), bw, bh))
  }

  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const molette = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomer(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', molette, { passive: false })
    return () => el.removeEventListener('wheel', molette)
  })

  const position = (e) => {
    const r = conteneur.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const debut = (e) => {
    try { conteneur.current.setPointerCapture(e.pointerId) } catch { /* pointeur déjà relâché */ }
    pointeurs.current.set(e.pointerId, position(e))
    if (pointeurs.current.size === 1) {
      geste.current = { depart: position(e), bouge: false, vue, clientX: e.clientX, clientY: e.clientY }
    } else {
      geste.current = { ...geste.current, bouge: true, pincement: null }
    }
  }

  const deplacement = (e) => {
    if (!pointeurs.current.has(e.pointerId) || !geste.current) return
    pointeurs.current.set(e.pointerId, position(e))
    const points = [...pointeurs.current.values()]
    if (points.length >= 2) {
      const [a, b] = points
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const precedent = geste.current.pincement
      geste.current.pincement = { distance, milieu }
      if (!precedent) return
      setVue(v => {
        const zoomee = zoomAutour(v, distance / precedent.distance, milieu.x - ox, milieu.y - oy, 1, zoomMax)
        return limiterVue({ ...zoomee, dx: zoomee.dx + milieu.x - precedent.milieu.x, dy: zoomee.dy + milieu.y - precedent.milieu.y }, bw, bh)
      })
      return
    }
    const p = points[0]
    const g = geste.current
    if (Math.hypot(p.x - g.depart.x, p.y - g.depart.y) > SEUIL_APPUI) g.bouge = true
    if (g.bouge) appliquer({ ...g.vue, dx: g.vue.dx + p.x - g.depart.x, dy: g.vue.dy + p.y - g.depart.y })
  }

  const fin = (e) => {
    pointeurs.current.delete(e.pointerId)
    const g = geste.current
    if (pointeurs.current.size > 0) {
      // Fin d'un pincement : le doigt restant repart d'ici
      const [reste] = pointeurs.current.values()
      geste.current = { depart: reste, bouge: true, vue, pincement: null }
      return
    }
    geste.current = null
    if (!g || g.bouge || e.type === 'pointercancel' || !onToucher || !image.current) return
    const point = pointSurPlan(e.clientX, e.clientY, image.current.getBoundingClientRect())
    if (point) onToucher(point)
  }

  const bouton = {
    width: 40, height: 40, borderRadius: '50%', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px -6px rgba(0,0,0,0.35)',
  }

  return (
    <div
      ref={conteneur}
      onPointerDown={debut} onPointerMove={deplacement} onPointerUp={fin} onPointerCancel={fin}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#E9E6E0', touchAction: 'none', cursor: onToucher ? 'crosshair' : 'grab', userSelect: 'none' }}
    >
      {dessinFond && (
        // Exactement la taille du conteneur (inset 0) : n'ajoute rien à la
        // zone défilable ; sans pointeur, les gestes vont au conteneur
        <canvas ref={refCanevas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
      )}
      {version && echelle > 0 && (
        <div style={{ position: 'absolute', left: ox, top: oy, width: bw, height: bh, transform: `translate(${vue.dx}px, ${vue.dy}px) scale(${vue.zoom})`, transformOrigin: '0 0' }}>
          {/* Avec un dessin de fond, l'image garde sa place et sert à la mesure
              des appuis (pointSurPlan), sans se voir — même avant d'être lue,
              ou absente de l'appareil : le plan vectoriel suffit. */}
          {(urlPleine || urlApercu || dessinFond) && (
            <img
              ref={image} src={urlPleine ?? urlApercu ?? undefined} alt="Plan" draggable={false}
              style={dessinFond
                ? { width: bw, height: bh, display: 'block', opacity: 0 }
                : { width: bw, height: bh, display: 'block', background: 'white', boxShadow: '0 6px 24px -12px rgba(0,0,0,0.4)' }}
            />
          )}
          {calque?.({ largeur: bw, hauteur: bh, zoom: vue.zoom })}
          {pastilles.map(p => {
            const active = p.id === idActive
            return (
              <button
                key={p.id} type="button"
                title={p.titre}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onPastille?.(p) }}
                style={{
                  position: 'absolute', left: p.x * bw, top: p.y * bh,
                  transform: `translate(-50%, -50%) scale(${1 / vue.zoom})`,
                  minWidth: active ? 34 : 26, height: active ? 34 : 26, padding: '0 5px', borderRadius: 17,
                  border: `${active ? 3 : 2}px solid white`, background: p.couleur ?? '#E8602C', color: 'white',
                  fontSize: active ? 13 : 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  boxShadow: active ? '0 0 0 3px #1F1B17, 0 4px 10px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.35)',
                  opacity: p.attenuee ? 0.55 : 1, cursor: onPastille ? 'pointer' : 'default', zIndex: active ? 2 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {p.numero ?? '•'}
              </button>
            )
          })}
        </div>
      )}
      {!urlApercu && !dessinFond && version && (
        <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#5E5854' }}>Chargement du plan…</p>
      )}
      <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" aria-label="Zoomer" onClick={() => zoomer(1.5)} style={bouton}><Plus size={18} /></button>
        <button type="button" aria-label="Dézoomer" onClick={() => zoomer(1 / 1.5)} style={bouton}><Minus size={18} /></button>
        <button type="button" aria-label="Ajuster à l’écran" onClick={() => setVue(vueDuCadre())} style={bouton}><Maximize size={16} /></button>
      </div>
    </div>
  )
}
