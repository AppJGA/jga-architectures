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

// Robot (visite enregistrée)
export function IconeRobot(props) {
  return <Icone {...props}><path d="M14 25a18 14 0 0 1 36 0"/><path d="M8 25h48"/><path d="M28 14v7M36 14v7"/><rect x="13" y="30" width="38" height="26" rx="5"/><circle cx="24" cy="41" r="3.5"/><circle cx="40" cy="41" r="3.5"/><rect x="24" y="47" width="16" height="5" rx="1.5"/><path d="M29.3 47v5M34.7 47v5"/><path d="M13 38H8v10h5M51 38h5v10h-5"/></Icone>
}

// Avancement (des lots)
export function IconeAvancement(props) {
  return <Icone {...props}><path d="M32 7a25 25 0 1 1-23.8 32.7"/><path d="M8.2 39.7A25 25 0 0 1 32 7" strokeDasharray="0 5.5"/><circle cx="8.2" cy="39.7" r="3" fill="currentColor" stroke="none"/><path d="M21 33a11 10 0 0 1 22 0"/><path d="M17 33h30"/><path d="M29 24.5v5M35 24.5v5"/><circle cx="27" cy="42" r="2.3"/><circle cx="37" cy="49" r="2.3"/><path d="M37.5 40.5l-11 10"/></Icone>
}

// Présence (des entreprises aux réunions)
export function IconePresence(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="14" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><path d="M14 20a12 10 0 0 1 24 0"/><path d="M10 20h32"/><path d="M23 11.5v4.5M29 11.5v4.5"/><path d="M17 20a9 9 0 0 0 18 0"/><path d="M4 60v-6a22 22 0 0 1 44 0v6"/></g><circle cx="50" cy="50" r="10"/><path d="M45.5 50l3.2 3.2 6-6.4"/></Icone>
}

// Export PDF
export function IconeExportPdf(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="15" fill="#000" stroke="none"/><rect x="3.5" y="23.5" width="37" height="19" rx="3" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><path d="M12 9a3 3 0 0 1 3-3h19l10 10v39a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"/><path d="M34 6v10h10"/><path d="M19 16h10M19 47h12"/></g><rect x="6" y="26" width="32" height="14" rx="2"/><path d="M10 37v-8h3a2.25 2.25 0 0 1 0 4.5h-3" strokeWidth="2.2"/><path d="M18 29v8h1.5a4 4 0 0 0 0-8z" strokeWidth="2.2"/><path d="M32 29h-5v8M27 33h4" strokeWidth="2.2"/><path d="M50 40v13M45 48l5 5 5-5"/><path d="M41 55v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/></Icone>
}

// Généralités (parties I à V des CR)
export function IconeGeneralites(props) {
  return <Icone {...props}><path d="M6 16a3 3 0 0 1 3-3h13l5 5h28a3 3 0 0 1 3 3v31a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="M32 26v21M26 47h12M20 29h24"/><path d="M20 29l-4.5 9M20 29l4.5 9M44 29l-4.5 9M44 29l4.5 9"/><path d="M14.5 38h11a5.5 5.5 0 0 1-11 0zM38.5 38h11a5.5 5.5 0 0 1-11 0z"/><circle cx="32" cy="25" r="1.6" fill="currentColor" stroke="none"/></Icone>
}

// Remarques du CR
export function IconeRemarques(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><rect x="35" y="35" width="29" height="29" rx="4" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><path d="M12 9a3 3 0 0 1 3-3h19l10 10v39a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"/><path d="M34 6v10h10"/><path d="M19 18h9M19 26h18M19 34h18M19 42h10"/></g><path d="M42 40h16a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-9l-5 5v-5h-2a3 3 0 0 1-3-3V43a3 3 0 0 1 3-3z"/><path d="M44 46h12M44 51h8"/></Icone>
}

// Organisation de la visite
export function IconeOrganisation(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="64" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="16" fill="#000" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><rect x="6" y="10" width="52" height="46" rx="4"/><path d="M20 5v10M44 5v10M6 22h52"/><circle cx="14" cy="30" r="1.5" fill="currentColor" stroke="none"/><circle cx="23" cy="30" r="1.5" fill="currentColor" stroke="none"/><circle cx="32" cy="30" r="1.5" fill="currentColor" stroke="none"/><circle cx="41" cy="30" r="1.5" fill="currentColor" stroke="none"/><circle cx="50" cy="30" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="39" r="1.5" fill="currentColor" stroke="none"/><circle cx="32" cy="39" r="1.5" fill="currentColor" stroke="none"/><circle cx="41" cy="39" r="1.5" fill="currentColor" stroke="none"/><circle cx="50" cy="39" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="48" r="1.5" fill="currentColor" stroke="none"/><circle cx="23" cy="48" r="1.5" fill="currentColor" stroke="none"/><circle cx="32" cy="48" r="1.5" fill="currentColor" stroke="none"/><circle cx="41" cy="48" r="1.5" fill="currentColor" stroke="none"/><circle cx="50" cy="48" r="1.5" fill="currentColor" stroke="none"/><rect x="19" y="35" width="8" height="8" rx="2" fill="currentColor"/></g><circle cx="46" cy="47" r="4"/><path d="M38 61a8 8 0 0 1 16 0"/><circle cx="55.5" cy="43" r="3.5"/><path d="M54 50.2a7 7 0 0 1 8 6.8"/></Icone>
}

// Portail d'affaires
export function IconePortail(props) {
  return <Icone {...props}><rect x="5" y="5" width="24" height="24" rx="4"/><path d="M12 23V17L17 12L22 17V23z"/><rect x="35" y="5" width="24" height="24" rx="4"/><path d="M42 23V17L47 12L52 17V23z"/><rect x="5" y="35" width="24" height="24" rx="4"/><path d="M12 53V47L17 42L22 47V53z"/><rect x="35" y="35" width="24" height="24" rx="4"/><path d="M42 53V47L47 42L52 47V53z"/></Icone>
}

// Boîte à outils
export function IconeBoiteOutils(props) {
  const masque = useMasque()
  return <Icone {...props}><defs><mask id={masque}><rect width="64" height="32" fill="#fff" stroke="none"/></mask></defs><g mask={`url(#${masque})`}><g transform="rotate(-22 26 32)"><rect x="21" y="3" width="10" height="17" rx="4"/><path d="M24.5 8v7M27.5 8v7"/><rect x="22.5" y="20" width="7" height="4" rx="1"/><path d="M23.5 24v14M28.5 24v14"/></g><g transform="rotate(22 38 32)"><path d="M35 40V18.3A7 7 0 0 1 35.5 5.46V10h5V5.46A7 7 0 0 1 41 18.3V40"/></g></g><rect x="6" y="32" width="52" height="24" rx="3"/><path d="M6 41h21M37 41h21"/><rect x="27" y="38" width="10" height="7" rx="1.5"/></Icone>
}

// Carnet d'adresses
export function IconeCarnet(props) {
  return <Icone {...props}><rect x="12" y="6" width="38" height="52" rx="4"/><path d="M8 16h8M8 27h8M8 38h8M8 49h8"/><path d="M50 12h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3M50 26h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3M50 40h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3"/><circle cx="31" cy="24" r="6"/><path d="M20 44a11 11 0 0 1 22 0"/><path d="M23 50h16"/></Icone>
}

// Accueil
// Émettre un compte rendu (le document part)
export function IconeEmission(props) {
  return <Icone {...props}><path d="M6 32a3 3 0 0 1 3-3h15l8 8v20a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="M24 29v8h8"/><path d="M12 42h9M12 48h14M12 54h14"/><path d="M60 5L27 19l12 6 6 12z"/><path d="M60 5L39 25"/><path d="M39 25l-3 12 6-6"/><path d="M10 24C10 16 15 12.5 21.5 15.5" strokeDasharray="0 5"/></Icone>
}

// L'éditeur du CR, pensé pour l'ordinateur
export function IconeOrdinateur(props) {
  return <Icone {...props}><path d="M10 45V14a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v31"/><rect x="15" y="15.5" width="34" height="24.5" rx="1.5"/><circle cx="32" cy="12.8" r="1" fill="currentColor" stroke="none"/><path d="M3 45h58v2.5a4.5 4.5 0 0 1-4.5 4.5h-49A4.5 4.5 0 0 1 3 47.5z"/><path d="M25 45v1.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V45"/></Icone>
}

// Le mode Visite, pensé pour la tablette
export function IconeTablette(props) {
  return <Icone {...props}><rect x="10" y="4" width="44" height="56" rx="6"/><rect x="15.5" y="10.5" width="33" height="43" rx="2"/><circle cx="32" cy="7.2" r="1.2" fill="currentColor" stroke="none"/><path d="M28 57h8"/></Icone>
}

// Suite d'une remarque : la bulle, et la flèche qui revient dessous
export function IconeSuite(props) {
  return <Icone {...props}><path d="M11 6h42a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-3v7l-8-7H11a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"/><path d="M15 15h34M15 23h20"/><path d="M50 41v6a6 6 0 0 1-6 6H22"/><path d="M27.5 47.5L22 53l5.5 5.5"/></Icone>
}

// Gestion d'agence : la mallette des associés
export function IconeGestionAgence(props) {
  return <Icone {...props}><path d="M24 19v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5"/><rect x="5" y="19" width="54" height="36" rx="4"/><path d="M5 33h22M37 33h22"/><rect x="27" y="29" width="10" height="9" rx="1.5"/></Icone>
}

export function IconeAccueil(props) {
  return <Icone {...props}><path d="M4 29L32 6l28 23"/><path d="M10 24.5V56h44V24.5"/><path d="M26 56V41a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15"/><path d="M44 15.9V9h6v11.8"/></Icone>
}
