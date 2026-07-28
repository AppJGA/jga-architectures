// Palette commune aux zones, aux périodes et aux phases d'étude — une seule
// liste pour que le même bleu soit le même bleu partout.
//
// Module sans JSX : il est importé aussi bien par les composants que par
// `etude/planning/types.js`, lui-même chargé hors navigateur (tests, exports).
export const COULEURS_PRESET = [
  // Oranges et rouges
  '#E8602C', '#C44A1B', '#B8412C', '#D97706', '#92400E',
  // Verts
  '#2A8A4E', '#166534', '#15803D', '#639922', '#365314',
  // Bleus
  '#1B3A5C', '#1E40AF', '#0891B2', '#164E63', '#0C4A6E',
  // Neutres et divers
  '#9C9591', '#5E5854', '#8B5CF6', '#BE185D', '#1F1B17',
]

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

export const estHexValide = (v) => HEX_RE.test(v ?? '')
