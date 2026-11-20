import { useEffect, useMemo, useRef, useState } from 'react'
import { VisionneusePlan } from '../../../chantier/comptes-rendus/VisionneusePlan'
import { versPixels, versMetres, centre } from '../geometrieEdl'
import { cadrePiece, COULEURS_PIECE, etatPiece, pointProche, ZOOM_MAX_VISITE } from './visiteLogique'
import { useVecteursEdl } from '../useVecteursEdl'
import { zoomMaxVectoriel } from '../vecteursEdlLogique'
import { traceProche, cibleToucher, TOLERANCE_PILE_PX, COULEUR_COTE } from './tracesVisiteLogique'
import { TracePlan, PointPlan, RAYON_TOUCHER_PX as RAYON_TOUCHER, ECART_COTE_PX } from './DessinsPlanEdl'
import { pxParMetreEcran } from '../analyse/symbolesRelectureLogique'

// ─── Plan de la visite ───────────────────────────────────────────────────────
//
// Plan de l'étage (pièces grises tant qu'elles ne sont pas visitées), ou
// pièce ouverte agrandie à tout l'écran (`cadre`), les autres pâlies. Les
// points sont dessinés en SVG au-dessus de l'image : nets à tout zoom.
// Gestes : un appui bref sur le plan choisit le point le plus proche (zone de
// 44 px) ou en pose un nouveau ; seul le point choisi capture le doigt et se
// glisse. Un second doigt ou un `pointercancel` annulent le glisser (règle du
// projet : rien d'enregistré).
// Liaisons, cotes et finitions de murs (084, 085) : dessinées sous les
// points, épaisseurs en pixels d'écran ; une proposition de l'IA en tirets
// bleus. Dans la pièce ouverte, sans bouton de mode (`cibleToucher`) : un
// appui pile sur un angle du contour (12 px) va à `onToucherAngle`, pile sur
// un mur à `onToucherMur`, sinon comme avant — un point existant se choisit
// (il l'emporte sur l'angle ou le mur s'il est plus près du doigt), une
// trace se choisit, ou un point se pose. Angle allumé (`premierAngle`) et
// mur touché (`murAllume`) sont dessinés en surbrillance.
// Points, liaisons, cotes et finitions : le dessin commun de
// `DessinsPlanEdl.jsx`, le même que l'onglet « Plans » du module (qui y
// ajoute les symboles).

const ACCENT = 'var(--affaire-accent, #E8602C)'
const SEUIL_GLISSE = 6

export function PlanVisite({
  niveau, pieces, points, nbPhotos, visitees, etats = null, piece, pointId, obtenirLiens, onToucher, onChoisirPoint, onDeplacerPoint,
  traces = [], traceId = null, mode = null, onChoisirTrace,
  anglesActifs = false, premierAngle = null, murAllume = null, onToucherAngle, onToucherMur,
}) {
  const svg = useRef(null)
  const glisseCourant = useRef(null)
  const pointeurs = useRef(new Set()) // doigts posés sur le plan, glisser compris
  const [glisse, setGlisse] = useState(null) // { id, pos: [x, y] mètres } pendant un déplacement
  const c = niveau.cadrage

  const version = useMemo(() => ({
    id: niveau.id, chemin: niveau.chemin, chemin_apercu: niveau.chemin_apercu, largeur: niveau.largeur, hauteur: niveau.hauteur,
  }), [niveau])
  // Plan vectoriel s'il existe (migration 081) : une pièce ouverte remplit
  // l'écran, l'image y serait floue
  const { dessinFond, sansPleine } = useVecteursEdl(niveau, obtenirLiens)
  const cadre = useMemo(() => (piece ? cadrePiece(piece, niveau) : null), [piece, niveau])
  // Pièce ouverte : ses points. Plan de l'étage : tous (ceux d'une pièce
  // sont pâlis, mais un appui dessus les choisit au lieu d'en poser un autre
  // par-dessus ; la pièce s'ouvre depuis l'écran, pas d'ici).
  const touchable = (p) => (!piece || p.piece_id === piece.id)
  // Une trace se touche dans la pièce ouverte, ou toutes sur le plan de l'étage
  const traceTouchable = (t) => (!piece || t.piece_id === piece.id || points.some((p) => p.piece_id === piece.id && (p.id === t.point_a || p.id === t.point_b)))

  // Un point différent, ou plus de glisser : on repart d'un compte de doigts sain
  useEffect(() => { pointeurs.current.clear(); glisseCourant.current = null }, [pointId])

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
    // Un doigt supplémentaire posé pendant un glisser, ou un glisser annulé
    // pas encore relâché : ce n'est pas un appui qui pose un point
    if (glisseCourant.current || pointeurs.current.size > 0) return
    const m = versMetres(c, [x * niveau.largeur, y * niveau.hauteur])
    const tolerance = toleranceMetres()
    const proche = pointProche(points.filter(touchable), m, tolerance)
    // « Relier » : seul un point compte (ailleurs, la visite dit pourquoi)
    if (mode) {
      if (proche) onChoisirPoint(proche.id)
      else onToucher?.(m)
      return
    }
    // Angle et mur « pile » : zone de 12 px, plus fine que celle des points
    const cible = cibleToucher({
      contour: piece?.contour ?? null, position: m, tolerance: (tolerance * TOLERANCE_PILE_PX) / RAYON_TOUCHER,
      pointExistant: proche ? { point: proche, distance: Math.hypot(Number(proche.x) - m[0], Number(proche.y) - m[1]) } : null,
      avecAngles: anglesActifs,
    })
    if (cible.sorte === 'angle') { onToucherAngle?.(cible.angle); return }
    if (cible.sorte === 'mur') { onToucherMur?.(cible.mur); return }
    if (cible.sorte === 'point') { onChoisirPoint(cible.point.id); return }
    // La ligne de cote est dessinée à 18 px de son mur (tolérance = 22 px)
    const trace = onChoisirTrace
      ? traceProche(traces.filter(traceTouchable), points, m, tolerance, {
        ecartCote: (tolerance * ECART_COTE_PX) / RAYON_TOUCHER,
        contourDe: (t) => pieces?.find((pc) => pc.id === t.piece_id)?.contour ?? null,
      })
      : null
    if (trace) onChoisirTrace(trace.id)
    else onToucher?.(m)
  }

  const annulerGlisse = () => {
    if (!glisseCourant.current) return
    glisseCourant.current = { ...glisseCourant.current, annule: true }
    setGlisse(null)
  }

  // Phase de capture : voit chaque doigt, même celui que le point a capturé
  const doigtPose = (e) => {
    // Premier doigt : un relâché perdu ne doit pas fausser le compte
    if (e.isPrimary) pointeurs.current.clear()
    pointeurs.current.add(e.pointerId)
    if (pointeurs.current.size > 1) annulerGlisse()
  }
  const doigtLeve = (e) => { pointeurs.current.delete(e.pointerId) }

  const debut = (e) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointeur déjà relâché */ }
    // Écart doigt / centre du point, gardé : le point ne saute pas sous le doigt
    const courant = points.find((p) => p.id === pointId)
    const m = depuisEvenement(e)
    const decalage = courant ? [Number(courant.x) - m[0], Number(courant.y) - m[1]] : [0, 0]
    glisseCourant.current = { id: pointId, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, bouge: false, pos: null, decalage, annule: pointeurs.current.size > 1 }
  }
  const pendant = (e) => {
    const g = glisseCourant.current
    if (!g || g.annule || e.pointerId !== g.pointerId) return
    e.stopPropagation()
    if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < SEUIL_GLISSE) return
    const m = depuisEvenement(e)
    const pos = [m[0] + g.decalage[0], m[1] + g.decalage[1]]
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

  // Un point glissé emporte ses liaisons avec lui
  const positionsPoints = glisse ? points.map((p) => (p.id === glisse.id ? { ...p, x: glisse.pos[0], y: glisse.pos[1] } : p)) : points

  const calque = ({ largeur, hauteur, zoom }) => {
    const enCalque = (p) => {
      const [x, y] = versPixels(c, p)
      return [(x / niveau.largeur) * largeur, (y / niveau.hauteur) * hauteur]
    }
    // Pastilles à l'échelle du plan, zone du doigt constante (22 px)
    const pxParMetre = pxParMetreEcran(enCalque)
    return (
      <svg ref={svg} width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {pieces.map((p) => {
          const etat = etats?.get(p.id) ?? etatPiece(p, visitees)
          const couleurs = COULEURS_PIECE[etat] ?? COULEURS_PIECE.visitee
          const ouverte = p.id === piece?.id
          return (
            <polygon
              key={p.id} points={p.contour.map(enCalque).map((q) => q.join(',')).join(' ')}
              style={{
                fill: ouverte ? 'transparent' : couleurs.fond, fillOpacity: couleurs.opacite ?? 1, stroke: ouverte ? ACCENT : couleurs.trait,
                strokeWidth: (ouverte ? 3 : 1.2) / zoom, opacity: piece && !ouverte ? 0.35 : 1,
              }}
            />
          )
        })}
        {/* Sablier discret au milieu d'une pièce qui attend son analyse ; pas
            sur la pièce ouverte, où il couvrirait les points */}
        {pieces.map((p) => {
          if (p.id === piece?.id || etats?.get(p.id) !== 'attente') return null
          const [cx, cy] = enCalque(centre(p.contour))
          return <Sablier key={`s-${p.id}`} x={cx} y={cy} taille={14 / zoom} attenue={!!piece} />
        })}
        {traces.map((t) => (
          <TracePlan
            key={t.id} trace={t} points={positionsPoints} enCalque={enCalque} zoom={zoom}
            contour={t.sorte !== 'commande' ? pieces?.find((pc) => pc.id === t.piece_id)?.contour : null}
            choisie={t.id === traceId} attenuee={!!piece && !traceTouchable(t)}
          />
        ))}
        {/* Mur touché : surbrillance le long du mur, quelques secondes */}
        {murAllume && piece && (() => {
          const [a, b] = [murAllume.a, murAllume.b].map(enCalque)
          return (
            <line
              aria-hidden="true" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
              style={{ pointerEvents: 'none', stroke: ACCENT, strokeOpacity: 0.45, strokeWidth: 12 / zoom, strokeLinecap: 'round' }}
            />
          )
        })()}
        {/* Angles de la pièce ouverte : un repère discret, l'angle choisi allumé */}
        {anglesActifs && piece && piece.contour.map((angle, i) => {
          const [ax, ay] = enCalque(angle)
          const allume = !!premierAngle && premierAngle[0] === angle[0] && premierAngle[1] === angle[1]
          return (
            <g key={`angle-${i}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {allume && <circle cx={ax} cy={ay} r={RAYON_TOUCHER / zoom} style={{ fill: 'rgba(14,116,144,0.3)', stroke: COULEUR_COTE, strokeWidth: 2 / zoom }} />}
              <circle cx={ax} cy={ay} r={(allume ? 5 : 2.5) / zoom} style={{ fill: COULEUR_COTE, fillOpacity: allume ? 1 : 0.55 }} />
            </g>
          )
        })}
        {points.map((p) => {
          const pos = glisse?.id === p.id ? glisse.pos : [Number(p.x), Number(p.y)]
          const [cx, cy] = enCalque(pos)
          return (
            <PointPlan
              key={p.id} point={p} cx={cx} cy={cy} zoom={zoom} choisi={p.id === pointId} photos={nbPhotos.get(p.id) ?? 0} pxParMetre={pxParMetre}
              opacite={piece ? (touchable(p) ? 1 : 0.35) : (p.piece_id ? 0.55 : 1)}
            >
              {/* Seule poignée qui capture le doigt */}
              <circle
                cx={cx} cy={cy} r={RAYON_TOUCHER / zoom}
                onPointerDown={debut} onPointerMove={pendant} onPointerUp={fin} onPointerCancel={fin}
                style={{ fill: 'transparent', pointerEvents: 'auto', touchAction: 'none', cursor: 'move' }}
              />
            </PointPlan>
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
        cadre={cadre} zoomMax={dessinFond ? (e) => zoomMaxVectoriel(e, niveau.cadrage?.pxParMetre, ZOOM_MAX_VISITE) : ZOOM_MAX_VISITE} dessinFond={dessinFond} sansPleine={sansPleine}
      />
    </div>
  )
}

// Sablier dessiné (pas de police : il doit rester net à tout zoom), du gris
// de l'attente : l'accent de la phase passe au vert au chantier
const TRAIT_ATTENTE = COULEURS_PIECE.attente.trait
function Sablier({ x, y, taille, attenue }) {
  const d = taille / 2
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none', opacity: attenue ? 0.35 : 0.85 }}>
      <circle cx={x} cy={y} r={d * 1.15} style={{ fill: 'white', stroke: TRAIT_ATTENTE, strokeWidth: taille / 14 }} />
      <path
        d={`M ${x - d * 0.5} ${y - d * 0.65} H ${x + d * 0.5} L ${x} ${y} L ${x + d * 0.5} ${y + d * 0.65} H ${x - d * 0.5} L ${x} ${y} Z`}
        style={{ fill: TRAIT_ATTENTE, fillOpacity: 0.35, stroke: TRAIT_ATTENTE, strokeWidth: taille / 12, strokeLinejoin: 'round' }}
      />
    </g>
  )
}
