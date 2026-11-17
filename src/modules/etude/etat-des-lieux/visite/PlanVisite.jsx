import { useMemo, useRef, useState } from 'react'
import { VisionneusePlan } from '../../../chantier/comptes-rendus/VisionneusePlan'
import { versPixels, versMetres } from '../geometrieEdl'
import { cadrePiece, COULEURS_PIECE, etatPiece, pointProche, ZOOM_MAX_VISITE } from './visiteLogique'

// ─── Plan de la visite ───────────────────────────────────────────────────────
//
// Plan de l'étage (pièces grises tant qu'elles ne sont pas visitées), ou
// pièce ouverte agrandie à tout l'écran (`cadre`), les autres pâlies. Les
// points sont dessinés en SVG au-dessus de l'image : nets à tout zoom.
// Gestes : un appui bref sur le plan choisit le point le plus proche (zone de
// 44 px) ou en pose un nouveau ; seul le point choisi capture le doigt et se
// glisse. Un second doigt ou un `pointercancel` annulent le glisser (règle du
// projet : rien d'enregistré).

const ACCENT = 'var(--affaire-accent, #E8602C)'
// Zone sensible de 44 px au doigt, rond visible plus petit
const RAYON_TOUCHER = 22
const SEUIL_GLISSE = 6

export function PlanVisite({ niveau, pieces, points, nbPhotos, visitees, piece, pointId, obtenirLiens, onToucher, onChoisirPoint, onDeplacerPoint }) {
  const svg = useRef(null)
  const glisseCourant = useRef(null)
  const pointeurs = useRef(new Set()) // doigts posés sur le plan, glisser compris
  const [glisse, setGlisse] = useState(null) // { id, pos: [x, y] mètres } pendant un déplacement
  const c = niveau.cadrage

  const version = useMemo(() => ({
    id: niveau.id, chemin: niveau.chemin, chemin_apercu: niveau.chemin_apercu, largeur: niveau.largeur, hauteur: niveau.hauteur,
  }), [niveau])
  const cadre = useMemo(() => (piece ? cadrePiece(piece, niveau) : null), [piece, niveau])
  const touchable = (p) => (piece ? p.piece_id === piece.id : !p.piece_id)

  const depuisEvenement = (e) => {
    const r = svg.current.getBoundingClientRect()
    return versMetres(c, [((e.clientX - r.left) / r.width) * niveau.largeur, ((e.clientY - r.top) / r.height) * niveau.hauteur])
  }

  // 44 px à l'écran, en mètres : la largeur affichée du calque (zoom compris)
  // couvre toute l'image, soit largeur / pxParMetre mètres
  const toleranceMetres = () => {
    const largeurEcran = svg.current?.getBoundingClientRect().width
    if (!largeurEcran) return 0
    return (RAYON_TOUCHER * (niveau.largeur / c.pxParMetre)) / largeurEcran
  }

  const toucher = ({ x, y }) => {
    const m = versMetres(c, [x * niveau.largeur, y * niveau.hauteur])
    const proche = pointProche(points.filter(touchable), m, toleranceMetres())
    if (proche) onChoisirPoint(proche.id)
    else onToucher(m)
  }

  const annulerGlisse = () => {
    if (!glisseCourant.current) return
    glisseCourant.current = { ...glisseCourant.current, annule: true }
    setGlisse(null)
  }

  // Phase de capture : voit chaque doigt, même celui que le point a capturé
  const doigtPose = (e) => {
    pointeurs.current.add(e.pointerId)
    if (pointeurs.current.size > 1) annulerGlisse()
  }
  const doigtLeve = (e) => { pointeurs.current.delete(e.pointerId) }

  const debut = (e) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointeur déjà relâché */ }
    glisseCourant.current = { id: pointId, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, bouge: false, pos: null, annule: pointeurs.current.size > 1 }
  }
  const pendant = (e) => {
    const g = glisseCourant.current
    if (!g || g.annule || e.pointerId !== g.pointerId) return
    e.stopPropagation()
    if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < SEUIL_GLISSE) return
    const pos = depuisEvenement(e)
    glisseCourant.current = { ...g, bouge: true, pos }
    setGlisse({ id: g.id, pos })
  }
  const fin = (e) => {
    const g = glisseCourant.current
    if (!g || e.pointerId !== g.pointerId) return
    e.stopPropagation()
    glisseCourant.current = null
    setGlisse(null)
    // Pincement commencé, ou geste repris par le navigateur : rien d'enregistré
    if (g.annule || e.type === 'pointercancel' || !g.bouge || !g.pos) return
    onDeplacerPoint(g.id, g.pos)
  }

  const calque = ({ largeur, hauteur, zoom }) => {
    const enCalque = (p) => {
      const [x, y] = versPixels(c, p)
      return [(x / niveau.largeur) * largeur, (y / niveau.hauteur) * hauteur]
    }
    return (
      <svg ref={svg} width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {pieces.map((p) => {
          const couleurs = COULEURS_PIECE[etatPiece(p, visitees)]
          const ouverte = p.id === piece?.id
          return (
            <polygon
              key={p.id} points={p.contour.map(enCalque).map((q) => q.join(',')).join(' ')}
              style={{
                fill: ouverte ? 'transparent' : couleurs.fond, stroke: ouverte ? ACCENT : couleurs.trait,
                strokeWidth: (ouverte ? 3 : 1.2) / zoom, opacity: piece && !ouverte ? 0.35 : 1,
              }}
            />
          )
        })}
        {points.map((p) => {
          const pos = glisse?.id === p.id ? glisse.pos : [Number(p.x), Number(p.y)]
          const [cx, cy] = enCalque(pos)
          const choisi = p.id === pointId
          const r = (choisi ? 13 : 11) / zoom
          return (
            <g key={p.id} style={{ pointerEvents: 'none', opacity: touchable(p) || !piece ? 1 : 0.35 }}>
              {choisi && (
                // Seule poignée qui capture le doigt
                <circle
                  cx={cx} cy={cy} r={RAYON_TOUCHER / zoom}
                  onPointerDown={debut} onPointerMove={pendant} onPointerUp={fin} onPointerCancel={fin}
                  style={{ fill: 'transparent', pointerEvents: 'auto', touchAction: 'none', cursor: 'move' }}
                />
              )}
              <circle cx={cx} cy={cy} r={r} style={{ fill: p.piece_id ? ACCENT : '#5E5854', stroke: choisi ? '#1F1B17' : 'white', strokeWidth: (choisi ? 3 : 2) / zoom }} />
              <text x={cx} y={cy} dy="0.35em" textAnchor="middle" style={{ fontSize: 10 / zoom, fontWeight: 700, fill: 'white', fontFamily: "'JetBrains Mono', monospace" }}>
                {p.numero}
              </text>
              {(nbPhotos.get(p.id) ?? 0) > 0 && (
                <circle cx={cx + r * 0.9} cy={cy - r * 0.9} r={4 / zoom} style={{ fill: '#1F1B17', stroke: 'white', strokeWidth: 1 / zoom }} />
              )}
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <div
      onPointerDownCapture={doigtPose} onPointerUpCapture={doigtLeve} onPointerCancelCapture={doigtLeve}
      style={{ width: '100%', height: '100%' }}
    >
      <VisionneusePlan
        version={version} obtenirLiens={obtenirLiens} onToucher={toucher} calque={calque}
        cadre={cadre} zoomMax={ZOOM_MAX_VISITE}
      />
    </div>
  )
}
