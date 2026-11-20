import { useMemo } from 'react'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { symboleEcran, taillesPointEcran, texteCoteEcran, pxParMetreEcran } from '../analyse/symbolesRelectureLogique'
import {
  courbeCommande, traitsCote, extremitesTrace, texteCote, sensInterieurCote, decalageFinition, extremitesFinition, COULEUR_COMMANDE, COULEUR_TRAIT_COTE,
} from './tracesVisiteLogique'
import { couleurFinition } from '../tracesEdl'

// ─── Ce que les plans de l'état des lieux dessinent par-dessus l'étage ───────
//
// Un seul dessin des points, des liaisons, des cotes et des finitions de murs pour l'écran de la
// visite (`PlanVisite`) et l'onglet « Plans » du module (`EditeurPieces`,
// via `PlansEdl`). Tout est rendu dans le `calque` de `VisionneusePlan`, à la
// taille de l'écran (règle Safari) : épaisseurs et écarts divisés par `zoom`
// (1 dans ce calque) restent constants à l'écran. Symboles, disques,
// pastilles et valeurs de cotes, eux, sont à l'échelle du plan (`pxParMetre`,
// pixels d'écran par mètre, `pxParMetreEcran` de symbolesRelectureLogique) : ils grandissent et
// rapetissent avec lui, comme sur un plan au 1/100 (demande de l'agence,
// 2026-11-20). Sans échelle fiable, les tailles d'écran d'avant. Les zones
// du doigt ne changent pas (22 px).

const ACCENT = 'var(--affaire-accent, #E8602C)'
// Zone sensible de 44 px au doigt, rond visible plus petit
export const RAYON_TOUCHER_PX = 22
// Ligne de cote à 18 px de son mur, à tout zoom
export const ECART_COTE_PX = 18
// Finition de mur : trait épais de sa couleur, juste à l'intérieur du mur
export const EPAISSEUR_FINITION_PX = 5
export const ECART_FINITION_PX = 4

/**
 * Liaison (courbe fine, couleur électricité) ou cote (ligne d'encre décalée
 * de 18 px dans la pièce, lignes d'attache, obliques, valeur ou « ? ») —
 * même géométrie que le DXF et la planche. Calculées en mètres puis portées
 * au calque : la courbe reste à gauche du sens interrupteur → luminaire, la
 * cote du côté intérieur de sa pièce. Une proposition de l'IA en tirets bleus.
 */
export function TracePlan({ trace, points, enCalque, zoom, choisie, attenuee, contour = null }) {
  if (trace.sorte === 'finition') return <FinitionPlan trace={trace} enCalque={enCalque} zoom={zoom} choisie={choisie} attenuee={attenuee} contour={contour} />
  const hauteurTexte = texteCoteEcran(pxParMetreEcran(enCalque)) / zoom
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
  const t = traitsCote(a, b, { tic: 12 / zoom, decalage: 4 / zoom, yVersLeBas: true, sens, ecart: ECART_COTE_PX / zoom, jeu: 3 / zoom, hauteurTexte: hauteurTexte * 0.75 })
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
        style={{ fontSize: hauteurTexte, fontWeight: 600, fill: couleur, stroke: 'white', strokeWidth: 3 / zoom, paintOrder: 'stroke', fontFamily: "'JetBrains Mono', monospace" }}
      >{texteCote(trace)}</text>
    </g>
  )
}

/**
 * Finition de mur (085) : trait épais de la couleur de la finition
 * (`couleurFinition`), le long du mur, décalé vers l'intérieur de la pièce
 * (`decalageFinition`, côté calculé en mètres comme pour une cote). Une
 * proposition de l'IA : trait pâli en tirets, doublé d'un fil bleu.
 */
function FinitionPlan({ trace, enCalque, zoom, choisie, attenuee, contour }) {
  const bouts = extremitesFinition(trace)
  if (!bouts) return null
  const sens = sensInterieurCote(bouts[0], bouts[1], contour)
  const [a, b] = bouts.map(enCalque)
  const f = decalageFinition(a, b, { sens, ecart: ECART_FINITION_PX / zoom, yVersLeBas: true })
  if (!f) return null
  const proposee = !!trace.a_valider
  const couleur = couleurFinition(trace.valeur)
  const ligne = { x1: f.a[0], y1: f.a[1], x2: f.b[0], y2: f.b[1] }
  return (
    <g style={{ pointerEvents: 'none', opacity: attenuee ? 0.35 : 1 }}>
      {choisie && <line {...ligne} style={{ stroke: 'rgba(31,27,23,0.18)', strokeWidth: (EPAISSEUR_FINITION_PX + 8) / zoom, strokeLinecap: 'round' }} />}
      <line
        {...ligne}
        style={{
          stroke: couleur, strokeWidth: EPAISSEUR_FINITION_PX / zoom, strokeLinecap: 'butt',
          strokeOpacity: proposee ? 0.55 : 1, strokeDasharray: proposee ? `${8 / zoom} ${4 / zoom}` : undefined,
        }}
      />
      {proposee && <line {...ligne} style={{ stroke: COULEUR_IA, strokeWidth: 1.2 / zoom, strokeDasharray: `${6 / zoom} ${4 / zoom}` }} />}
    </g>
  )
}

/**
 * Un point relevé. `dessin` (`dessinPointRelecture`) : un point typé montre
 * le symbole des planches sur un disque de sa famille ; sans dessin (écran
 * de la visite) ou sans type, la pastille numérotée. `halo` : le point
 * choisi porte le halo bleu des propositions (repère depuis la liste des
 * éléments) ; sinon `children`, la poignée que la visite glisse au doigt.
 */
export function PointPlan({ point, cx, cy, zoom, dessin = null, choisi, halo = false, photos = 0, opacite = 1, pxParMetre = null, children = null }) {
  if (dessin?.sorte === 'symbole') {
    return <SymbolePoint dessin={dessin} cx={cx} cy={cy} zoom={zoom} choisi={choisi} photos={photos} opacite={opacite} pxParMetre={pxParMetre} />
  }
  // Pastille de 0,35 m dans le plan (11 px sans échelle), un peu plus grande choisie
  const r = (taillesPointEcran(null, pxParMetre).rayonPastille * (choisi ? 13 / 11 : 1)) / zoom
  return (
    <g style={{ pointerEvents: 'none', opacity: opacite }}>
      {choisi && halo && (
        <circle cx={cx} cy={cy} r={Math.max(22 / zoom, r + 6 / zoom)} style={{ fill: 'rgba(47,111,181,0.18)', stroke: COULEUR_IA, strokeWidth: 2.5 / zoom }} />
      )}
      {choisi && !halo && children}
      <circle cx={cx} cy={cy} r={r} style={{ fill: point.piece_id ? ACCENT : '#5E5854', stroke: choisi ? '#1F1B17' : 'white', strokeWidth: (choisi ? 3 : 2) / zoom }} />
      <text x={cx} y={cy} dy="0.35em" textAnchor="middle" style={{ fontSize: r * 0.9, fontWeight: 700, fill: 'white', fontFamily: "'JetBrains Mono', monospace" }}>
        {point.numero}
      </text>
      {photos > 0 && (
        <circle cx={cx + r * 0.9} cy={cy - r * 0.9} r={r * 0.36} style={{ fill: '#1F1B17', stroke: 'white', strokeWidth: 1 / zoom }} />
      )}
    </g>
  )
}

// Symbole d'un point : disque de la famille (cible du doigt), anneau
// pointillé bleu pour une proposition, symbole des planches à l'échelle du
// plan, numéro en petit (les listes disent « P3 »), à l'échelle du disque
function SymbolePoint({ dessin, cx, cy, zoom, choisi, photos, opacite, pxParMetre }) {
  const tailles = taillesPointEcran(dessin.code, pxParMetre)
  const elements = useMemo(() => symboleEcran(dessin.code, dessin.angle, tailles.symbole), [dessin.code, dessin.angle, tailles.symbole])
  const k = 1 / zoom
  const trait = { fill: 'none', stroke: dessin.couleur, strokeWidth: 1.5 * k, strokeLinejoin: 'round', strokeLinecap: 'round' }
  const R = tailles.rayonDisque * k
  return (
    <g style={{ pointerEvents: 'none', opacity: opacite }}>
      {choisi && <circle cx={cx} cy={cy} r={R + 5 * k} style={{ fill: 'rgba(47,111,181,0.14)', stroke: COULEUR_IA, strokeWidth: 2.5 * k }} />}
      <circle cx={cx} cy={cy} r={R} style={{ fill: dessin.couleur, fillOpacity: 0.2, stroke: dessin.couleur, strokeOpacity: 0.45, strokeWidth: 0.5 * k }} />
      {dessin.proposition && (
        <circle cx={cx} cy={cy} r={R * 0.92} style={{ fill: 'none', stroke: COULEUR_IA, strokeWidth: 1.2 * k, strokeDasharray: `${3 * k} ${2.5 * k}` }} />
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
        style={{ fontSize: R * 0.45, fontWeight: 600, fill: '#5E5854', stroke: 'white', strokeWidth: 2.5 * k, paintOrder: 'stroke', fontFamily: "'JetBrains Mono', monospace" }}>
        {dessin.numero}
      </text>
      {photos > 0 && <circle cx={cx - R * 0.78} cy={cy - R * 0.78} r={R * 0.18} style={{ fill: '#1F1B17', stroke: 'white', strokeWidth: 1 * k }} />}
    </g>
  )
}
