// ─── Icônes de l'affaire ─────────────────────────────────────────────────────
//
// Dessinées pour l'agence (dossier « Icônes/icons » qu'elle a fourni) :
// tableau de bord, modules (to-do list comprise), plans et documents de la
// page d'une affaire.
// Elles s'emploient comme celles de lucide-react — `size`, `color`, `style` —
// pour se substituer sans retoucher les appels. Leur épaisseur de trait est
// celle du dessin : un `strokeWidth` passé par l'appel est ignoré.

import { useId } from 'react'

function Icone({ size = 24, color, style, className, titre, children }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
      // La couleur passe par `color` : les points pleins du tableau de bord
      // (fill="currentColor") la suivent comme les traits
      style={{ flexShrink: 0, ...(color ? { color } : null), ...style }}
      className={className}
      role={titre ? 'img' : undefined} aria-hidden={titre ? undefined : true} focusable="false"
    >
      {titre && <title>{titre}</title>}
      {children}
    </svg>
  )
}

// Un masque par icône affichée : deux icônes identiques sur la page ne
// doivent pas se partager le même identifiant
function useMasque() {
  return 'masque-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
}

// Tableau de bord
export function IconeTableauDeBord(props) {
  return <Icone {...props}><rect x="6" y="9" width="52" height="46" rx="4"/><path d="M6 18h52"/><circle cx="11.5" cy="13.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="13.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="20.5" cy="13.5" r="1.4" fill="currentColor" stroke="none"/><path d="M13 34a9 9 0 0 1 18 0"/><path d="M22 34l4-5"/><path d="M13 48l5-4 5 3 7-6"/><rect x="36" y="24" width="4" height="4" rx=".5"/><rect x="36" y="32" width="4" height="4" rx=".5"/><rect x="36" y="40" width="4" height="4" rx=".5"/><path d="M44 26h8M44 34h6M44 42h8M36 49h8"/></Icone>
}

// Planning d'étude
export function IconePlanningEtude(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="15" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><rect x="6" y="10" width="52" height="46" rx="4"/><path d="M20 5v10M44 5v10M6 22h52"/><rect x="12" y="28" width="18" height="5" rx="2.5"/><rect x="24" y="37" width="12" height="5" rx="2.5"/><rect x="12" y="46" width="14" height="5" rx="2.5"/><rect x="34" y="28" width="16" height="5" rx="2.5"/></g><path d="M42 58l1.5-5.5 13-13 4 4-13 13z"/><path d="M53.25 42.75l4 4"/></Icone>
}

// Suivi financier étude
export function IconeFinancierEtude(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="15" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><rect x="6" y="42" width="6" height="14" rx="1.5"/><rect x="16" y="34" width="6" height="22" rx="1.5"/><rect x="26" y="26" width="6" height="30" rx="1.5"/><path d="M6 33l9-8 6 3 10-11"/><path d="M26 17h5v5"/><circle cx="47" cy="17" r="11"/><path d="M51 13a5 5 0 1 0 0 8"/><path d="M42 16h6M42 19h6"/></g><path d="M42 58l1.5-5.5 13-13 4 4-13 13z"/><path d="M53.25 42.75l4 4"/></Icone>
}

// Entreprises & Lots
export function IconeEntreprisesLots(props) {
  return <Icone {...props}><path d="M6 56V14h20v42"/><path d="M11 21h3M18 21h3M11 29h3M18 29h3M11 37h3M18 37h3M13 56v-8h6v8M3 56h26"/><rect x="33" y="17" width="6" height="6" rx="1"/><rect x="33" y="29" width="6" height="6" rx="1"/><rect x="33" y="41" width="6" height="6" rx="1"/><path d="M45 20h14M45 32h14M45 44h10"/></Icone>
}

// Visites de chantier
export function IconeVisitesChantier(props) {
  return <Icone {...props}><path d="M18 56V14M24 56V14M18 50l6-6-6-6 6-6-6-6 6-6"/><path d="M6 14h52M24 20h34M58 14v6"/><path d="M21 14V5L6 14M21 5l37 9"/><rect x="6" y="14" width="7" height="7"/><path d="M48 20v16"/><rect x="42" y="36" width="12" height="9" rx="1"/><path d="M10 56h22"/></Icone>
}

// OPR
export function IconeOpr(props) {
  return <Icone {...props}><path d="M24 10h-9a3 3 0 0 0-3 3v42a3 3 0 0 0 3 3h34a3 3 0 0 0 3-3V13a3 3 0 0 0-3-3h-9"/><rect x="24" y="6" width="16" height="8" rx="2"/><path d="M19 26l3 3 5-5M32 27h14M19 38l3 3 5-5M32 39h14M20 48l5 5M25 48l-5 5M32 50.5h14"/></Icone>
}

// Fiches de travaux modificatifs
export function IconeFtm(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="15" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><path d="M12 9a3 3 0 0 1 3-3h19l10 10v39a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"/><path d="M34 6v10h10"/><path d="M19 18h9M19 26h18M19 34h18M19 42h12"/></g><path d="M42 47a8.5 8.5 0 0 1 15-3"/><path d="M57 38v6h-6"/><path d="M58 53a8.5 8.5 0 0 1-15 3"/><path d="M43 62v-6h6"/></Icone>
}

// Planning chantier
export function IconePlanningChantier(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="15" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><rect x="6" y="10" width="52" height="46" rx="4"/><path d="M20 5v10M44 5v10M6 22h52"/><rect x="12" y="28" width="18" height="5" rx="2.5"/><rect x="24" y="37" width="12" height="5" rx="2.5"/><rect x="12" y="46" width="14" height="5" rx="2.5"/><rect x="34" y="28" width="16" height="5" rx="2.5"/></g><path d="M40 54a10 10 0 0 1 20 0"/><path d="M37 54h26"/><path d="M46 45.5v4.5M54 45.5v4.5"/></Icone>
}

// Suivi financier chantier
export function IconeFinancierChantier(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="15" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><rect x="6" y="42" width="6" height="14" rx="1.5"/><rect x="16" y="34" width="6" height="22" rx="1.5"/><rect x="26" y="26" width="6" height="30" rx="1.5"/><path d="M6 33l9-8 6 3 10-11"/><path d="M26 17h5v5"/><circle cx="47" cy="17" r="11"/><path d="M51 13a5 5 0 1 0 0 8"/><path d="M42 16h6M42 19h6"/></g><path d="M40 54a10 10 0 0 1 20 0"/><path d="M37 54h26"/><path d="M46 45.5v4.5M54 45.5v4.5"/></Icone>
}

// Plans
export function IconePlans(props) {
  return <Icone {...props}><path d="M28 48H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h36a3 3 0 0 1 3 3v33"/><path d="M12 12h30v14H28v12H12z"/><path d="M24 12v8M12 26h7"/><path d="M32 58V30l28 28z"/><path d="M37 53V42l11 11z"/></Icone>
}

// Documents
export function IconeDocuments(props) {
  return <Icone {...props}><path d="M22 12V9a3 3 0 0 1 3-3h17l10 10v30a3 3 0 0 1-3 3h-3"/><path d="M42 6v10h10"/><path d="M12 18a3 3 0 0 1 3-3h17l10 10v30a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"/><path d="M32 15v10h10"/><path d="M18 34h18M18 41h18M18 48h12"/></Icone>
}

// To-do list
export function IconeTodo(props) {
  return <Icone {...props}><rect x="6" y="8" width="12" height="12" rx="2.5"/><path d="M9.5 14l3.5 3.5 8-9"/><path d="M26 14h32"/><rect x="6" y="26" width="12" height="12" rx="2.5"/><path d="M9.5 32l3.5 3.5 8-9"/><path d="M26 32h32"/><rect x="6" y="44" width="12" height="12" rx="2.5"/><path d="M26 50h24"/></Icone>
}
