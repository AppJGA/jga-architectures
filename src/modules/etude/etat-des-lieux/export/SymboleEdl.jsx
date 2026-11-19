import { symboleSvg } from './symbolesEdl'

// ─── Un symbole de l'état des lieux, en SVG ──────────────────────────────────
//
// Dessine les données de `symboleSvg` (y déjà retourné) : le même dessin que
// le bloc du DXF. Le trait garde une épaisseur d'écran quelle que soit la
// taille (`non-scaling-stroke`), sinon un radiateur réduit à 48 px
// disparaîtrait et un symbole fixe agrandi deviendrait pâteux.

export function SymboleEdl({ code, taille = 48, couleur = 'currentColor', epaisseur = 1.2, titre }) {
  const svg = symboleSvg(code)
  if (!svg) return null
  const trait = { fill: 'none', stroke: couleur, strokeWidth: epaisseur, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }
  return (
    <svg viewBox={svg.viewBox} width={taille} height={taille} role="img" aria-label={titre ?? code} style={{ display: 'block', overflow: 'visible' }}>
      {titre && <title>{titre}</title>}
      {svg.elements.map((e, i) => {
        if (e.type === 'line') return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} style={trait} />
        if (e.type === 'polyline') return <polyline key={i} points={e.points} style={trait} />
        if (e.type === 'polygon') return <polygon key={i} points={e.points} style={trait} />
        if (e.type === 'circle') return <circle key={i} cx={e.cx} cy={e.cy} r={e.r} style={e.plein ? { ...trait, fill: couleur } : trait} />
        if (e.type === 'path') return <path key={i} d={e.d} style={trait} />
        return (
          <text
            key={i} x={e.x} y={e.y} fontSize={e.hauteur} textAnchor="middle" dominantBaseline="central"
            transform={e.rotation ? `rotate(${e.rotation} ${e.x} ${e.y})` : undefined}
            style={{ fill: couleur, fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 600 }}
          >
            {e.texte}
          </text>
        )
      })}
    </svg>
  )
}

export default SymboleEdl
