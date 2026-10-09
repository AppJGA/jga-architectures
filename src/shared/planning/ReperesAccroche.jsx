import { useState } from 'react'

// ─── Repères d'accrochage d'un jalon ─────────────────────────────────────────
//
// En mode « Accrocher » (roue d'un jalon), chaque barre montre un rond à son
// début et à sa fin : on vise un bout précis au lieu de deviner la moitié de
// barre à toucher (`bordTouche` reste valable sur le reste de la barre).
// Commun aux deux plannings. Posé à côté de la barre, pas dedans : les
// barres coupent ce qui dépasse (`overflow: hidden`). La zone sensible est
// large (doigt sur l'iPad), le rond visible petit pour ne pas masquer la barre.

const ZONE = 36
const ROND = 16

function Repere({ x, y, libelle, onChoisir }) {
  const [survol, setSurvol] = useState(false)
  return (
    <button type="button" aria-label={libelle} title={libelle}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onChoisir() }}
      onPointerEnter={() => setSurvol(true)} onPointerLeave={() => setSurvol(false)}
      style={{
        position: 'absolute', left: x - ZONE / 2, top: y - ZONE / 2, width: ZONE, height: ZONE,
        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', zIndex: 45,
        display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
      }}>
      <span style={{
        width: ROND, height: ROND, borderRadius: '50%', boxSizing: 'border-box',
        border: '2.5px solid #1F1B17', background: survol ? '#1F1B17' : 'white',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.85), 0 2px 6px rgba(0,0,0,0.3)',
        transform: survol ? 'scale(1.15)' : 'none', transition: 'transform 0.12s ease, background-color 0.12s ease',
      }} />
    </button>
  )
}

/**
 * @param left, width  position de la barre dans sa ligne (px)
 * @param y            hauteur du milieu de la barre dans sa ligne (px)
 * @param onChoisir    (bord: 'debut' | 'fin') => void
 */
export function ReperesAccroche({ left, width, y, nom = 'la barre', onChoisir }) {
  return (
    <>
      <Repere x={left} y={y} libelle={`Accrocher au début de ${nom}`} onChoisir={() => onChoisir('debut')} />
      <Repere x={left + width} y={y} libelle={`Accrocher à la fin de ${nom}`} onChoisir={() => onChoisir('fin')} />
    </>
  )
}
