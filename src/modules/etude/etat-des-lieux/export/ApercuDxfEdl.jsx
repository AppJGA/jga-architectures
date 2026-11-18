import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Minus, Maximize } from 'lucide-react'
import { alignementCanevas, deplacer, versEcran, vueAjustee, zoomer } from './exportFenetreLogique'

// ─── Aperçu d'un DXF de l'export, sur canevas ────────────────────────────────
//
// Le fichier réellement produit, relu par le lecteur de l'import
// (`dessinDxf`) : ce qui se voit ici est ce qu'ArchiCAD recevra. Calques EDL-
// en couleur, plan existant en gris clair ; une case par calque. Molette,
// pincement ou glisser pour se déplacer, + / − / Ajuster pour qui n'a ni
// molette ni deux doigts. La vue vit dans une référence et se redessine à
// l'image suivante : un glisser ne repasse pas par React.

const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
// Sous cette taille à l'écran, un texte n'est qu'une tache : il n'est pas dessiné
const TEXTE_MIN_PX = 3
const boutonVue = {
  width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, background: 'white', color: '#1F1B17', cursor: 'pointer',
}

function dessiner(canvas, dessin, vue, masques) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (!dessin) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineJoin = 'round'
  // Le plan existant d'abord, les calques EDL- par-dessus
  const calques = [...dessin.calques].reverse()
  for (const c of calques) {
    if (masques.has(c.nom)) continue
    ctx.strokeStyle = c.couleur
    ctx.lineWidth = c.edl ? 1.1 : 0.7
    ctx.beginPath()
    for (const t of c.traits) {
      t.pts.forEach((p, i) => {
        const [x, y] = versEcran(vue, p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      if (t.ferme) ctx.closePath()
    }
    ctx.stroke()
    ctx.fillStyle = c.couleur
    for (const t of c.textes) {
      const taille = (t.hauteur || 0) * vue.echelle
      if (taille < TEXTE_MIN_PX) continue
      const [x, y] = versEcran(vue, t.pos)
      const { textAlign, textBaseline } = alignementCanevas(t)
      ctx.save()
      ctx.translate(x, y)
      if (t.rotation) ctx.rotate((-t.rotation * Math.PI) / 180)
      ctx.font = `${taille}px ${POLICE}`
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline
      t.texte.split('\n').forEach((ligne, i) => ctx.fillText(ligne, 0, i * taille * 1.4))
      ctx.restore()
    }
  }
}

export function ApercuDxfEdl({ dessin, pali = false }) {
  const cadre = useRef(null)
  const canevas = useRef(null)
  const vue = useRef({ echelle: 1, tx: 0, ty: 0 })
  const touche = useRef(false) // l'utilisateur a bougé la vue : un redimensionnement ne la recadre plus
  const image = useRef(0)
  const pointeurs = useRef(new Map())
  const pincement = useRef(null)
  const [masques, setMasques] = useState(() => new Set())
  const [taille, setTaille] = useState({ l: 0, h: 0 })
  // Écran étroit : la liste des calques passe sous le plan au lieu de lui
  // prendre 200 px de large (pas de `flex-wrap` : 30 calques étireraient la
  // rangée et le plan sortirait de l'écran)
  const ensemble = useRef(null)
  const [etroit, setEtroit] = useState(false)
  useLayoutEffect(() => {
    const el = ensemble.current
    if (!el) return undefined
    const mesurer = () => setEtroit(el.clientWidth < 560)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const etat = useRef({ dessin, masques })
  useLayoutEffect(() => { etat.current = { dessin, masques } })

  const redessiner = () => {
    if (image.current) return
    image.current = requestAnimationFrame(() => {
      image.current = 0
      if (canevas.current) dessiner(canevas.current, etat.current.dessin, vue.current, etat.current.masques)
    })
  }
  const redessinerCourant = useRef(redessiner)
  useLayoutEffect(() => { redessinerCourant.current = redessiner })

  // Taille du cadre suivie : le canevas a autant de pixels que l'écran
  useLayoutEffect(() => {
    const el = cadre.current
    if (!el) return undefined
    const mesurer = () => setTaille({ l: el.clientWidth, h: el.clientHeight })
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const ajuster = () => {
    touche.current = false
    vue.current = vueAjustee(dessin?.boite, taille.l, taille.h)
    redessiner()
  }

  // Nouveau fichier ou nouvelle taille : cadré sur tout le dessin, sauf si
  // l'utilisateur a déjà zoomé dans ce fichier
  const dessinVu = useRef(null)
  useLayoutEffect(() => {
    const c = canevas.current
    if (!c || !taille.l || !taille.h) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(taille.l * dpr)
    c.height = Math.round(taille.h * dpr)
    if (dessinVu.current !== dessin || !touche.current) {
      touche.current = false
      vue.current = vueAjustee(dessin?.boite, taille.l, taille.h)
    }
    dessinVu.current = dessin
    redessinerCourant.current()
  }, [dessin, taille])

  useEffect(() => { redessinerCourant.current() }, [masques])

  // Molette : écouteur non passif, sinon la page défile en même temps
  useEffect(() => {
    const c = canevas.current
    if (!c) return undefined
    const surMolette = (e) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      const facteur = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))
      vue.current = zoomer(vue.current, facteur, e.clientX - r.left, e.clientY - r.top)
      touche.current = true
      redessinerCourant.current()
    }
    c.addEventListener('wheel', surMolette, { passive: false })
    return () => c.removeEventListener('wheel', surMolette)
  }, [])

  useEffect(() => () => { if (image.current) cancelAnimationFrame(image.current) }, [])

  const position = (e) => {
    const r = canevas.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const ecartPinces = () => {
    const [a, b] = [...pointeurs.current.values()]
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
  }
  const surBas = (e) => {
    canevas.current.setPointerCapture?.(e.pointerId)
    pointeurs.current.set(e.pointerId, position(e))
    pincement.current = pointeurs.current.size === 2 ? ecartPinces() : null
  }
  const surDeplacement = (e) => {
    const avant = pointeurs.current.get(e.pointerId)
    if (!avant) return
    const p = position(e)
    pointeurs.current.set(e.pointerId, p)
    if (pointeurs.current.size === 2 && pincement.current) {
      const { d, m } = ecartPinces()
      const prec = pincement.current
      let v = deplacer(vue.current, m[0] - prec.m[0], m[1] - prec.m[1])
      if (prec.d > 0 && d > 0) v = zoomer(v, d / prec.d, m[0], m[1])
      vue.current = v
      pincement.current = { d, m }
    } else if (pointeurs.current.size === 1) {
      vue.current = deplacer(vue.current, p[0] - avant[0], p[1] - avant[1])
    }
    touche.current = true
    redessiner()
  }
  // `pointercancel` compte comme une fin de geste : rien d'autre à défaire,
  // la vue n'est pas enregistrée
  const surHaut = (e) => {
    pointeurs.current.delete(e.pointerId)
    pincement.current = pointeurs.current.size === 2 ? ecartPinces() : null
  }

  const zoomBouton = (facteur) => {
    vue.current = zoomer(vue.current, facteur, taille.l / 2, taille.h / 2)
    touche.current = true
    redessiner()
  }

  const basculer = (noms, visible) => setMasques((avant) => {
    const n = new Set(avant)
    for (const nom of noms) { if (visible) n.delete(nom); else n.add(nom) }
    return n
  })

  const calquesEdl = dessin?.calques.filter((c) => c.edl) ?? []
  const calquesPlan = dessin?.calques.filter((c) => !c.edl) ?? []
  const planVisible = calquesPlan.some((c) => !masques.has(c.nom))

  return (
    <div ref={ensemble} style={{
      display: 'grid', gap: 10, height: '100%', minHeight: 0,
      ...(etroit ? { gridTemplateRows: 'minmax(260px, 1fr) minmax(0, 180px)' } : { gridTemplateColumns: 'minmax(0, 1fr) 200px' }),
    }}>
      <div style={{ position: 'relative', minHeight: 0, border: '0.5px solid rgba(0,0,0,0.12)', background: 'white' }}>
        <div ref={cadre} style={{ position: 'absolute', inset: 0, opacity: pali ? 0.5 : 1, transition: 'opacity 150ms' }}>
          <canvas
            ref={canevas}
            aria-label="Aperçu du DXF"
            onPointerDown={surBas} onPointerMove={surDeplacement} onPointerUp={surHaut} onPointerCancel={surHaut}
            style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' }}
          />
        </div>
        <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => zoomBouton(1.4)} title="Zoomer" aria-label="Zoomer" style={boutonVue}><Plus size={16} /></button>
          <button type="button" onClick={() => zoomBouton(1 / 1.4)} title="Dézoomer" aria-label="Dézoomer" style={boutonVue}><Minus size={16} /></button>
          <button type="button" onClick={ajuster} title="Tout voir" aria-label="Tout voir" style={boutonVue}><Maximize size={16} /></button>
        </div>
      </div>

      <div style={{ minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: '#1F1B17' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9591' }}>Calques</p>
        {calquesEdl.map((c) => (
          <CaseCalque key={c.nom} calque={c} visible={!masques.has(c.nom)} onChange={(v) => basculer([c.nom], v)} />
        ))}
        {calquesPlan.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', listStyle: 'none' }}>
              <input type="checkbox" checked={planVisible} aria-label="Afficher le plan existant"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => basculer(calquesPlan.map((c) => c.nom), e.target.checked)}
                style={{ width: 18, height: 18, minHeight: 0, margin: 0, accentColor: 'var(--affaire-accent, #E8602C)' }} />
              <span style={{ width: 12, height: 12, background: calquesPlan[0].couleur, flexShrink: 0 }} />
              <span>Plan existant · {calquesPlan.length} calque{calquesPlan.length > 1 ? 's' : ''}</span>
            </summary>
            {calquesPlan.map((c) => (
              <CaseCalque key={c.nom} calque={c} visible={!masques.has(c.nom)} onChange={(v) => basculer([c.nom], v)} retrait />
            ))}
          </details>
        )}
      </div>
    </div>
  )
}

function CaseCalque({ calque, visible, onChange, retrait = false }) {
  const n = calque.traits.length + calque.textes.length
  return (
    <label style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingLeft: retrait ? 12 : 0 }}>
      <input type="checkbox" checked={visible} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, minHeight: 0, margin: 0, accentColor: 'var(--affaire-accent, #E8602C)' }} />
      <span style={{ width: 12, height: 12, background: calque.couleur, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={calque.nom}>{calque.nom}</span>
      <span style={{ color: '#9C9591', fontSize: 11 }}>{n}</span>
    </label>
  )
}
