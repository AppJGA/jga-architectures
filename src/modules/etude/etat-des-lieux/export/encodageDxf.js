// ─── Windows-1252 pour le DXF R12 ────────────────────────────────────────────
//
// Un DXF R12 n'a pas d'UTF-8 : ses textes sont dans la page de code annoncée
// par `$DWGCODEPAGE` (ANSI_1252 ici, celle des postes Windows français). Le
// navigateur ne sait encoder qu'en UTF-8 (`TextEncoder`) : la table est donc
// ici. Pur, testé (tests/etat-des-lieux-export-dxf.test.js).

// Les 32 positions 0x80–0x9F, où Windows-1252 s'écarte de Latin-1 (guillemets
// courbes, apostrophe typographique, œ, €…) ; les trous de la table sont nuls
const PLAGE_80 = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
]

const VERS_OCTET = new Map(PLAGE_80.map((code, i) => [code, 0x80 + i]).filter(([code]) => code))

/** Octet Windows-1252 d'un caractère, `null` s'il n'y figure pas. */
export function octetCp1252(caractere) {
  const code = caractere.codePointAt(0)
  if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code
  return VERS_OCTET.get(code) ?? null
}

export const dansCp1252 = (caractere) => octetCp1252(caractere) !== null

/** Texte → octets Windows-1252 ; un caractère hors table devient « ? ». */
export function encoderCp1252(texte) {
  // Un octet par caractère, jamais plus que de positions UTF-16 (une paire
  // de substitution donne un seul « ? ») : le tableau est réservé d'un coup.
  // Un tableau JS intermédiaire coûtait ~8 octets par caractère, des
  // centaines de Mo pour un DXF avec le plan sur iPad
  const octets = new Uint8Array(texte.length)
  let n = 0
  for (const caractere of texte) octets[n++] = octetCp1252(caractere) ?? 0x3f
  return octets.subarray(0, n)
}
