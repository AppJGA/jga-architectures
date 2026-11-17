// ─── Format d'un plan importé dans l'état des lieux ──────────────────────────
//
// Reconnu au contenu (premiers octets), pas à l'extension : un DWG renommé en
// « .dxf » doit recevoir le message qui dit quoi faire.

export const FORMATS_ACCEPTES = 'DXF ou PDF vectorisé'

export const MESSAGES_FORMAT = {
  dwg: 'Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF dans AutoCAD ou ArchiCAD (Fichier → Enregistrer sous → DXF), ou importez-le en PDF vectorisé.',
  'dxf-binaire': 'Ce DXF est enregistré en binaire. Enregistrez-le en DXF texte (ASCII) dans AutoCAD ou ArchiCAD, ou importez le plan en PDF vectorisé.',
  inconnu: 'Format non reconnu. L’état des lieux accepte les plans en DXF ou en PDF vectorisé.',
  'pdf-scan': 'Ce PDF ne contient pas de dessin vectoriel (plan scanné ?). Importez le plan en DXF, ou en PDF exporté directement du logiciel de dessin.',
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
  if (format === 'dxf' || format === 'pdf') return { ok: true, message: null }
  return { ok: false, message: MESSAGES_FORMAT[format] ?? MESSAGES_FORMAT.inconnu }
}
