import { useEffect, useMemo, useRef, useState } from 'react'
import { VisionneusePlan } from '../../../chantier/comptes-rendus/VisionneusePlan'
import { versPixels, versMetres, centre } from '../geometrieEdl'
import { cadrePiece, COULEURS_PIECE, etatPiece, pointProche, ZOOM_MAX_VISITE } from './visiteLogique'
import { useVecteursEdl } from '../useVecteursEdl'
import { zoomMaxVectoriel } from '../vecteursEdlLogique'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { symboleEcran, TAILLE_SYMBOLE_PX, RAYON_DISQUE_PX } from '../analyse/symbolesRelectureLogique'
import { courbeCommande, traitsCote, traceProche, extremitesTrace, texteCote, sensInterieurCote, COULEUR_COMMANDE, COULEUR_COTE, COULEUR_TRAIT_COTE } from './tracesVisiteLogique'

// ─── Plan de la visite ───────────────────────────────────────────────────────
//
// Plan de l'étage (pièces grises tant qu'elles ne sont pas visitées), ou
// pièce ouverte agrandie à tout l'écran (`cadre`), les autres pâlies. Les
// points sont dessinés en SVG au-dessus de l'image : nets à tout zoom.
// Gestes : un appui bref sur le plan choisit le point le plus proche (zone de
// 44 px) ou en pose un nouveau ; seul le point choisi capture le doigt et se
// glisse. Un second doigt ou un `pointercancel` annulent le glisser (règle du
// projet : rien d'enregistré).
// `consultation` (relecture au bureau) : aucun point ne se glisse, un appui
// ne fait que choisir un point ; le point choisi porte un halo bleu, celui
// des propositions de l'IA, pour se repérer depuis la liste des éléments.
// Liaisons et cotes (084) : dessinées sous les points, épaisseurs en pixels
// d'écran ; une proposition de l'IA en tirets bleus. Hors mode, un appui sur
// une trace (et pas sur un point) la choisit. En mode « Coter », un appui
// va à l'angle le plus proche de la pièce (`onToucherAngle`), jamais à un
// point ; les angles sont marqués d'un rond de 44 px, zone sensible comprise.
// `symboles` (relecture seulement, Map point → `dessinPointRelecture`) : un
// point typé montre son symbole des planches sur un disque de sa famille,
// son numéro en petit à côté ; sans entrée, la pastille numérotée.

const ACCENT = 'var(--affaire-accent, #E8602C)'
// Zone sensible de 44 px au doigt, rond visible plus petit
const RAYON_TOUCHER = 22
const SEUIL_GLISSE = 6
// Ligne de cote à 18 px de son mur, à tout zoom
const ECART_COTE_PX = 18

export function PlanVisite({
  niveau, pieces, points, nbPhotos, visitees, etats = null, piece, pointId, obtenirLiens, onToucher, onChoisirPoint, onDeplacerPoint, consultation = false,
  traces = [], traceId = null, mode = null, onChoisirTrace, onToucherAngle, symboles = null,
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
    if (mode?.sorte === 'coter') { onToucherAngle?.(m, tolerance); return }
    const proche = pointProche(points.filter(touchable), m, tolerance)
    if (proche) { onChoisirPoint(proche.id); return }
    // La ligne de cote est dessinée à 18 px de son mur (tolérance = 22 px)
    const trace = !mode && onChoisirTrace
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
          <Trace
            key={t.id} trace={t} points={positionsPoints} enCalque={enCalque} zoom={zoom}
            contour={t.sorte === 'cote' ? pieces?.find((pc) => pc.id === t.piece_id)?.contour : null}
            choisie={t.id === traceId} attenuee={!!piece && !traceTouchable(t)}
          />
        ))}
        {mode?.sorte === 'coter' && piece && piece.contour.map((angle, i) => {
          const [ax, ay] = enCalque(angle)
          const retenu = mode.angles.some((q) => q[0] === angle[0] && q[1] === angle[1])
          return (
            <g key={`angle-${i}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
              <circle cx={ax} cy={ay} r={RAYON_TOUCHER / zoom} style={{ fill: retenu ? 'rgba(14,116,144,0.35)' : 'rgba(14,116,144,0.08)', stroke: COULEUR_COTE, strokeWidth: (retenu ? 2 : 1) / zoom }} />
              <circle cx={ax} cy={ay} r={(retenu ? 5 : 3) / zoom} style={{ fill: COULEUR_COTE }} />
            </g>
          )
        })}
        {points.map((p) => {
          const pos = glisse?.id === p.id ? glisse.pos : [Number(p.x), Number(p.y)]
          const [cx, cy] = enCalque(pos)
          const choisi = p.id === pointId
          const r = (choisi ? 13 : 11) / zoom
          const dessin = symboles?.get(p.id)
          if (dessin?.sorte === 'symbole') {
            return (
              <SymbolePoint
                key={p.id} dessin={dessin} cx={cx} cy={cy} zoom={zoom} choisi={choisi} photos={nbPhotos.get(p.id) ?? 0}
                opacite={piece ? (touchable(p) ? 1 : 0.35) : (p.piece_id ? 0.55 : 1)}
              />
            )
          }
          return (
            <g key={p.id} style={{ pointerEvents: 'none', opacity: piece ? (touchable(p) ? 1 : 0.35) : (p.piece_id ? 0.55 : 1) }}>
              {choisi && consultation && (
                <circle cx={cx} cy={cy} r={22 / zoom} style={{ fill: 'rgba(47,111,181,0.18)', stroke: COULEUR_IA, strokeWidth: 2.5 / zoom }} />
              )}
              {choisi && !consultation && (
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
        cadre={cadre} zoomMax={dessinFond ? (e) => zoomMaxVectoriel(e, niveau.cadrage?.pxParMetre, ZOOM_MAX_VISITE) : ZOOM_MAX_VISITE} dessinFond={dessinFond} sansPleine={sansPleine}
      />
    </div>
  )
}

// Liaison (courbe fine, couleur électricité) ou cote (ligne d'encre décalée
// de 18 px dans la pièce, lignes d'attache, obliques, valeur ou « ? ») —
// même géométrie que le DXF et la planche. Calculées en mètres puis portées
// au calque : la courbe reste à gauche du sens interrupteur → luminaire, la
// cote du côté intérieur de sa pièce, tels que le plan les montre.
// Épaisseurs et écarts divisés par le zoom : constants à l'écran.
function Trace({ trace, points, enCalque, zoom, choisie, attenuee, contour = null }) {
  const bouts = extremitesTrace(trace, points)
  if (!bouts) return null
  const proposee = !!trace.a_valider
  const tirets = proposee ? `${6 / zoom} ${4 / zoom}` : undefined
  const style = { pointerEvents: 'none', opacity: attenuee ? 0.35 : 1 }
  if (trace.sorte === 'commande') {
    const courbe = courbeCommande(...bouts)
    if (!courbe) return null
    const [a, q, b] = [courbe.a, courbe.controle, courbe.b].map(enCalque)
    const d = `M ${a[0]} ${a[1]} Q ${q[0]} ${q[1]} ${b[0]} ${b[1]}`
    return (
      <g style={style}>
        {choisie && <path d={d} style={{ fill: 'none', stroke: 'rgba(21,101,192,0.22)', strokeWidth: 10 / zoom, strokeLinecap: 'round' }} />}
        <path d={d} style={{ fill: 'none', stroke: proposee ? COULEUR_IA : COULEUR_COMMANDE, strokeWidth: (choisie ? 2.5 : 1.5) / zoom, strokeDasharray: tirets }} />
      </g>
    )
  }
  const sens = sensInterieurCote(bouts[0], bouts[1], contour)
  const [a, b] = bouts.map(enCalque)
  const t = traitsCote(a, b, { tic: 12 / zoom, decalage: 4 / zoom, yVersLeBas: true, sens, ecart: ECART_COTE_PX / zoom, jeu: 3 / zoom, hauteurTexte: 9 / zoom })
  if (!t) return null
  const couleur = proposee ? COULEUR_IA : COULEUR_TRAIT_COTE
  const trait = { stroke: couleur, strokeWidth: (choisie ? 2.5 : 1.5) / zoom }
  const fin = { stroke: couleur, strokeWidth: 1 / zoom }
  const [a2, b2] = t.ligne
  const [x, y] = t.texte.position
  return (
    <g style={style}>
      {choisie && <line x1={a2[0]} y1={a2[1]} x2={b2[0]} y2={b2[1]} style={{ stroke: 'rgba(58,54,50,0.2)', strokeWidth: 10 / zoom, strokeLinecap: 'round' }} />}
      {t.attaches.map(([p, q], i) => <line key={`at-${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} style={fin} />)}
      <line x1={a2[0]} y1={a2[1]} x2={b2[0]} y2={b2[1]} style={{ ...trait, strokeDasharray: tirets }} />
      {t.obliques.map(([p, q], i) => <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} style={trait} />)}
      <text
        x={x} y={y} textAnchor="middle" transform={`rotate(${t.texte.angle} ${x} ${y})`}
        style={{ fontSize: 12 / zoom, fontWeight: 600, fill: couleur, stroke: 'white', strokeWidth: 3 / zoom, paintOrder: 'stroke', fontFamily: "'JetBrains Mono', monospace" }}
      >{texteCote(trace)}</text>
    </g>
  )
}

// Symbole d'un point à la relecture : disque de la famille (cible du doigt),
// anneau pointillé bleu pour une proposition, symbole des planches à taille
// d'écran constante, numéro en petit (les listes disent « P3 »)
function SymbolePoint({ dessin, cx, cy, zoom, choisi, photos, opacite }) {
  const elements = useMemo(() => symboleEcran(dessin.code, dessin.angle, TAILLE_SYMBOLE_PX), [dessin.code, dessin.angle])
  const k = 1 / zoom
  const trait = { fill: 'none', stroke: dessin.couleur, strokeWidth: 1.5 * k, strokeLinejoin: 'round', strokeLinecap: 'round' }
  const R = RAYON_DISQUE_PX * k
  return (
    <g style={{ pointerEvents: 'none', opacity: opacite }}>
      {choisi && <circle cx={cx} cy={cy} r={R + 5 * k} style={{ fill: 'rgba(47,111,181,0.14)', stroke: COULEUR_IA, strokeWidth: 2.5 * k }} />}
      <circle cx={cx} cy={cy} r={R} style={{ fill: dessin.couleur, fillOpacity: 0.2, stroke: dessin.couleur, strokeOpacity: 0.45, strokeWidth: 0.5 * k }} />
      {dessin.proposition && (
        <circle cx={cx} cy={cy} r={R - 1.5 * k} style={{ fill: 'none', stroke: COULEUR_IA, strokeWidth: 1.2 * k, strokeDasharray: `${3 * k} ${2.5 * k}` }} />
      )}
      <g transform={`translate(${cx} ${cy}) scale(${k})`}>
        {elements.map((e, i) => {
          if (e.type === 'line') return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} style={{ ...trait, strokeWidth: 1.5 }} />
          if (e.type === 'polyline' || e.type === 'polygon') {
            const Forme = e.type
            return <Forme key={i} points={e.points} style={{ ...trait, strokeWidth: 1.5 }} />
          }
          if (e.type === 'circle') return <circle key={i} cx={e.cx} cy={e.cy} r={e.r} style={{ ...trait, strokeWidth: 1.5, ...(e.plein ? { fill: dessin.couleur } : null) }} />
          if (e.type === 'path') return <path key={i} d={e.d} style={{ ...trait, strokeWidth: 1.5 }} />
          return (
            <text key={i} x={e.x} y={e.y} fontSize={e.taille} textAnchor="middle" dominantBaseline="central"
              transform={e.rotation ? `rotate(${e.rotation} ${e.x} ${e.y})` : undefined}
              style={{ fill: dessin.couleur, fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 600 }}>
              {e.texte}
            </text>
          )
        })}
      </g>
      <text x={cx + R * 0.78} y={cy - R * 0.78} textAnchor="start"
        style={{ fontSize: 9 * k, fontWeight: 600, fill: '#5E5854', stroke: 'white', strokeWidth: 2.5 * k, paintOrder: 'stroke', fontFamily: "'JetBrains Mono', monospace" }}>
        {dessin.numero}
      </text>
      {photos > 0 && <circle cx={cx - R * 0.78} cy={cy - R * 0.78} r={3.5 * k} style={{ fill: '#1F1B17', stroke: 'white', strokeWidth: 1 * k }} />}
    </g>
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
