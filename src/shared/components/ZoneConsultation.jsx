import { signalerLectureSeule } from '../../core/supabase/client'

// ─── Zone en consultation ────────────────────────────────────────────────────
//
// Dans une affaire dont on n'est pas collaborateur, un module se lit mais ne
// se modifie pas. Pour les écrans aux innombrables points d'édition (gestes
// sur les barres d'un planning, tableaux à saisir), cette enveloppe arrête les
// clics, la saisie et les glissers avant qu'ils n'atteignent l'écran — le
// défilement et le zoom restent libres — et dit pourquoi (message de la page
// de l'affaire). Un élément marqué `data-consultation="libre"` reste actif
// (affichage, export). La base refuse de toute façon (migration 060) : ceci
// évite seulement de laisser croire qu'un geste a pris.
//
// `display: contents` : l'enveloppe ne change rien à la mise en page.

const CHAMPS = 'input, textarea, select, [contenteditable="true"]'
const libre = (e) => !!e.target.closest?.('[data-consultation="libre"]')

export function ZoneConsultation({ actif, children }) {
  if (!actif) return children
  const arreter = (e) => {
    if (libre(e)) return
    e.stopPropagation()
    // Pas de focus sur un champ ou un bouton ; le reste (défilement) suit son cours
    if (e.target.closest?.(`${CHAMPS}, button`)) e.preventDefault()
  }
  const refuser = (e) => {
    if (libre(e)) return
    e.stopPropagation()
    e.preventDefault()
    signalerLectureSeule()
  }
  const clavier = (e) => {
    if (libre(e) || !e.target.closest?.(CHAMPS)) return
    e.stopPropagation()
    e.preventDefault()
    signalerLectureSeule()
  }
  return (
    <div
      style={{ display: 'contents' }}
      onPointerDownCapture={arreter}
      onMouseDownCapture={arreter}
      onTouchStartCapture={(e) => { if (!libre(e) && e.target.closest?.(`${CHAMPS}, button`)) e.stopPropagation() }}
      onClickCapture={refuser}
      onDoubleClickCapture={refuser}
      onContextMenuCapture={(e) => { if (!libre(e)) e.stopPropagation() }}
      onDragStartCapture={refuser}
      onKeyDownCapture={clavier}
    >
      {children}
    </div>
  )
}
