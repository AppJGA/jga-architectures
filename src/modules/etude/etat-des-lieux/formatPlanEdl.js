// ─── Format d'un plan importé dans l'état des lieux ──────────────────────────
//
// Reconnu au contenu (premiers octets), pas à l'extension : un DWG renommé en
// « .dxf » doit recevoir le message qui dit quoi faire. Seul le DXF est
// accepté (choix de l'agence, 2026-11-17) : un PDF ne dit ni où sont les
// pièces ni, parfois, leur nom ; Claude n'en retrouvait qu'une partie.

export const FORMATS_ACCEPTES = 'DXF'

const ENREGISTRER_EN_DXF = 'dans ArchiCAD ou AutoCAD : Fichier → Enregistrer sous → DXF'

export const MESSAGES_FORMAT = {
  dwg: `Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF (${ENREGISTRER_EN_DXF}).`,
  pdf: `Les PDF ne sont pas acceptés : importez le plan en DXF (${ENREGISTRER_EN_DXF}).`,
  'dxf-binaire': 'Ce DXF est enregistré en binaire. Enregistrez-le en DXF texte (ASCII) dans ArchiCAD ou AutoCAD.',
  inconnu: `Format non reconnu. L’état des lieux accepte les plans en DXF (${ENREGISTRER_EN_DXF}).`,
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
  if (format === 'dxf') return { ok: true, message: null }
  return { ok: false, message: MESSAGES_FORMAT[format] ?? MESSAGES_FORMAT.inconnu }
}
