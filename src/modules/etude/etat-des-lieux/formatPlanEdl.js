// ─── Format d'un plan importé dans l'état des lieux ──────────────────────────
//
// Reconnu au contenu (premiers octets), pas à l'extension : un DWG renommé en
// « .dxf » est traité comme un DWG. DXF et DWG sont acceptés (un DWG est
// converti sur l'appareil, convertisseurDwg.js) ; le PDF est refusé (choix de
// l'agence, 2026-11-17) : il ne dit ni où sont les pièces ni, parfois, leur
// nom ; Claude n'en retrouvait qu'une partie.

export const FORMATS_ACCEPTES = 'DWG ou DXF'

const ENREGISTRER_EN_DXF = 'dans ArchiCAD ou AutoCAD : Fichier → Enregistrer sous → DXF'

export const MESSAGES_FORMAT = {
  pdf: `Les PDF ne sont pas acceptés : importez le plan en DWG ou en DXF (${ENREGISTRER_EN_DXF}).`,
  'dxf-binaire': 'Ce DXF est enregistré en binaire. Enregistrez-le en DXF texte (ASCII) dans ArchiCAD ou AutoCAD.',
  inconnu: `Format non reconnu. L’état des lieux accepte les plans en DWG ou en DXF (${ENREGISTRER_EN_DXF}).`,
  // Conversion ratée : le motif précis est ajouté après
  'dwg-illisible': `Ce DWG n’a pas pu être converti sur cet appareil. Enregistrez-le en DXF (${ENREGISTRER_EN_DXF}) et importez le DXF.`,
}

export function formatPlan(octets) {
  const marque = octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf ? 3 : 0
  const debut = String.fromCharCode(...octets.slice(marque, marque + 512))
  if (/^AC10\d\d/.test(debut)) return 'dwg'
  if (debut.startsWith('%PDF-')) return 'pdf'
  if (debut.startsWith('AutoCAD Binary DXF')) return 'dxf-binaire'
  if (/^\s*(999\r?\n[^\n]*\n\s*)?0\r?\n\s*SECTION/.test(debut)) return 'dxf'
  return 'inconnu'
}

export function verdictFormat(format) {
  if (format === 'dxf' || format === 'dwg') return { ok: true, message: null }
  return { ok: false, message: MESSAGES_FORMAT[format] ?? MESSAGES_FORMAT.inconnu }
}
