import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { Plus, Minus, Maximize } from 'lucide-react'
import { zoomAutour, limiterVue, pointSurPlan } from './plansLogique'

// ─── Visionneuse de plan ─────────────────────────────────────────────────────
//
// Déplacer au doigt ou à la souris, pincer ou molette pour zoomer, boutons
// + / − / ajuster. Un appui bref sans glisser « touche » le plan (placement
// d'une pastille) ; un appui sur une pastille la sélectionne. L'aperçu léger
// s'affiche d'abord, la pleine définition le remplace une fois chargée.

const SEUIL_APPUI = 6 // px de déplacement au-delà desquels ce n'est plus un appui

export function VisionneusePlan({ version, obtenirLiens, pastilles = [], idActive, onToucher, onPastille }) {
  const conteneur = useRef(null)
  const image = useRef(null)
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 })
  const [vue, setVue] = useState({ zoom: 1, dx: 0, dy: 0 })
  const [urlApercu, setUrlApercu] = useState(null)
  const [urlPleine, setUrlPleine] = useState(null)
  const pointeurs = useRef(new Map())
  const geste = useRef(null)

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

  const appliquer = (v) => setVue(limiterVue(v, bw, bh))
  const zoomer = (facteur, px = taille.largeur / 2, py = taille.hauteur / 2) => {
    setVue(v => limiterVue(zoomAutour(v, facteur, px - ox, py - oy), bw, bh))
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
        const zoomee = zoomAutour(v, distance / precedent.distance, milieu.x - ox, milieu.y - oy)
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
      {version && echelle > 0 && (
        <div style={{ position: 'absolute', left: ox, top: oy, width: bw, height: bh, transform: `translate(${vue.dx}px, ${vue.dy}px) scale(${vue.zoom})`, transformOrigin: '0 0' }}>
          {(urlPleine || urlApercu) && (
            <img
              ref={image} src={urlPleine ?? urlApercu} alt="Plan" draggable={false}
              style={{ width: bw, height: bh, display: 'block', background: 'white', boxShadow: '0 6px 24px -12px rgba(0,0,0,0.4)' }}
            />
          )}
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
      {!urlApercu && version && (
        <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#5E5854' }}>Chargement du plan…</p>
      )}
      <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" aria-label="Zoomer" onClick={() => zoomer(1.5)} style={bouton}><Plus size={18} /></button>
        <button type="button" aria-label="Dézoomer" onClick={() => zoomer(1 / 1.5)} style={bouton}><Minus size={18} /></button>
        <button type="button" aria-label="Ajuster à l’écran" onClick={() => setVue({ zoom: 1, dx: 0, dy: 0 })} style={bouton}><Maximize size={16} /></button>
      </div>
    </div>
  )
}
