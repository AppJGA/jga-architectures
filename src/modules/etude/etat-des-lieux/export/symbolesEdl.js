// ─── Symboles usuels de l'état des lieux ─────────────────────────────────────
//
// Un dessin par type d'élément de `calquesEdl.js` (conception § 3), défini une
// seule fois : l'export DXF en fait des blocs, l'écran du SVG, le rapport un
// dessin sur canevas. Pur, testé (tests/etat-des-lieux-export.test.js).
//
// Primitives en mètres autour du point d'insertion, y vers le haut (repère du
// plan d'origine). Seules les sortes que le DXF R12 sait écrire sans
// conversion : LINE, POLYLINE, CIRCLE, ARC, TEXT — une ellipse ou un arrondi
// devient donc une polyligne.
//   { ligne: [[x, y], [x, y]] }
//   { polyligne: [[x, y]…], ferme }
//   { cercle: [cx, cy, r] }
//   { arc: [cx, cy, r, debutDeg, finDeg] }   sens trigonométrique, comme le DXF
//   { texte: 'T', pos: [x, y], hauteur }     pos = milieu du texte (centré)
//
// Les appareils (plomberie, chauffage) sont à leur taille réelle vus de
// dessus, dos au mur vers +y : posés dans une pièce, ils se comparent au plan.
// Les autres symboles ont une taille fixe d'environ 0,30 m — 3 mm au 1/100,
// 6 mm au 1/50 — selon l'usage des plans français (NF C 15-100 pour
// l'électricité). Chaque dessin reste de quelques traits : il est répété des
// centaines de fois dans un DXF et relu par l'agence.

import { CALQUES } from '../calquesEdl.js'

const arrondi = (v) => Math.round(v * 10000) / 10000 || 0

const ligne = (a, b) => ({ ligne: [a, b] })
const polyligne = (points, ferme = false) => ({ polyligne: points.map(([x, y]) => [arrondi(x), arrondi(y)]), ferme })
const rect = (x0, y0, x1, y1) => polyligne([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true)
const cercle = (cx, cy, r) => ({ cercle: [cx, cy, r] })
const arc = (cx, cy, r, debut, fin) => ({ arc: [cx, cy, r, debut, fin] })
const texte = (t, pos, hauteur) => ({ texte: t, pos, hauteur })

const rad = (deg) => (deg * Math.PI) / 180

// Ovale en polyligne (pas d'ELLIPSE en R12) ; 32 côtés suffisent à l'œil
function ovale(cx, cy, rx, ry, n = 32) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return polyligne(pts, true)
}

// Rectangle aux angles arrondis (bacs, cuvettes), en polyligne
function rectArrondi(x0, y0, x1, y1, r, pas = 4) {
  const coins = [
    [x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180],
  ]
  const pts = []
  for (const [cx, cy, depart] of coins) {
    for (let i = 0; i <= pas; i++) {
      const a = rad(depart + (90 * i) / pas)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return polyligne(pts, true)
}

// Hachures à 45° coupées au rectangle : quelques traits, pas un motif
function hachures(x0, y0, x1, y1, pas) {
  const traits = []
  for (let c = y0 - x1 + pas; c < y1 - x0 - 1e-9; c += pas) {
    const xa = Math.max(x0, y0 - c)
    const xb = Math.min(x1, y1 - c)
    if (xb - xa > 1e-6) traits.push(ligne([arrondi(xa), arrondi(xa + c)], [arrondi(xb), arrondi(xb + c)]))
  }
  return traits
}

// Goutte : pointe en haut, fond en arc ; les deux côtés sont tangents à l'arc
// (pointe à 2 r du centre → tangentes à 30° et 150°)
function goutte(cx, cy, r) {
  const pointe = [cx, arrondi(cy + 2 * r)]
  const cote = (deg) => [arrondi(cx + r * Math.cos(rad(deg))), arrondi(cy + r * Math.sin(rad(deg)))]
  return [arc(cx, cy, r, 150, 30), ligne(pointe, cote(150)), ligne(pointe, cote(30))]
}

// Triangle équilatéral pointe en haut, centre de gravité à l'origine
function triangle(cote) {
  const h = (cote * Math.sqrt(3)) / 2
  return polyligne([[-cote / 2, -h / 3], [cote / 2, -h / 3], [0, (2 * h) / 3]], true)
}

// Interrupteur : cercle et trait incliné à 45° terminé par un trait
// perpendiculaire (simple allumage)
function interrupteur() {
  const r = 0.05
  const u = [Math.SQRT1_2, Math.SQRT1_2]
  const depart = [arrondi(r * u[0]), arrondi(r * u[1])]
  const bout = [arrondi(0.21 * u[0]), arrondi(0.21 * u[1])]
  const talon = [arrondi(bout[0] - 0.05 * u[1]), arrondi(bout[1] + 0.05 * u[0])]
  return [cercle(0, 0, r), ligne(depart, bout), ligne(bout, talon)]
}

// Étoile à huit branches (dégradation) : polyligne fermée en dents
function etoile(rExt, rInt, branches = 8) {
  const pts = []
  for (let i = 0; i < branches * 2; i++) {
    const r = i % 2 ? rInt : rExt
    const a = rad(90 + (180 * i) / branches)
    pts.push([r * Math.cos(a), r * Math.sin(a)])
  }
  return polyligne(pts, true)
}

const reelle = (primitives) => ({ taille: 'reelle', primitives })
const fixe = (primitives) => ({ taille: 'fixe', primitives })

export const SYMBOLES = {
  // ── Plomberie : appareils à leur taille réelle ──
  lavabo: reelle([
    rectArrondi(-0.30, -0.225, 0.30, 0.225, 0.06),
    ovale(0, -0.03, 0.235, 0.15),
    cercle(0, -0.03, 0.02),
    ligne([0, 0.225], [0, 0.15]),
  ]),
  evier: reelle([
    rect(-0.60, -0.30, 0.60, 0.30),
    rectArrondi(-0.55, -0.25, -0.04, 0.19, 0.05),
    rectArrondi(0.04, -0.25, 0.55, 0.19, 0.05),
    cercle(-0.295, -0.03, 0.025),
    cercle(0.295, -0.03, 0.025),
    cercle(0, 0.245, 0.02),
  ]),
  baignoire: reelle([
    rect(-0.85, -0.35, 0.85, 0.35),
    rectArrondi(-0.79, -0.29, 0.79, 0.29, 0.18),
    cercle(0.64, 0, 0.03),
  ]),
  douche: reelle([
    rect(-0.45, -0.45, 0.45, 0.45),
    rect(-0.41, -0.41, 0.41, 0.41),
    ligne([-0.41, -0.41], [0.41, 0.41]),
    ligne([-0.41, 0.41], [0.41, -0.41]),
    cercle(0, 0, 0.04),
  ]),
  wc: reelle([
    rect(-0.20, 0.145, 0.20, 0.325),
    ovale(0, -0.09, 0.175, 0.235),
    ovale(0, -0.11, 0.105, 0.15),
  ]),
  'ballon-eau-chaude': reelle([
    cercle(0, 0, 0.275),
    texte('ECS', [0, 0], 0.10),
  ]),

  // ── Électricité : taille fixe, usage NF C 15-100 ──
  interrupteur: fixe(interrupteur()),
  // Prise 2P+T : demi-cercle côté pièce, trait vers le mur (+y), trait
  // tangent au sommet de l'arc pour la terre
  prise: fixe([
    arc(0, 0, 0.09, 180, 360),
    ligne([-0.09, 0], [0.09, 0]),
    ligne([0, 0], [0, 0.10]),
    ligne([-0.09, -0.09], [0.09, -0.09]),
  ]),
  luminaire: fixe([
    cercle(0, 0, 0.10),
    ligne([-0.0707, -0.0707], [0.0707, 0.0707]),
    ligne([-0.0707, 0.0707], [0.0707, -0.0707]),
  ]),
  'tableau-electrique': fixe([
    rect(-0.15, -0.075, 0.15, 0.075),
    ...hachures(-0.15, -0.075, 0.15, 0.075, 0.05),
  ]),

  // ── Chauffage ──
  radiateur: reelle([
    rect(-0.40, -0.05, 0.40, 0.05),
    ...[-0.32, -0.24, -0.16, -0.08, 0, 0.08, 0.16, 0.24, 0.32].map((x) => ligne([x, -0.05], [x, 0.05])),
  ]),
  chaudiere: reelle([
    rect(-0.225, -0.175, 0.225, 0.175),
    texte('CH', [0, 0], 0.10),
  ]),
  thermostat: fixe([
    cercle(0, 0, 0.11),
    texte('T', [0, 0], 0.10),
  ]),

  // ── Ventilation ──
  'bouche-vmc': fixe([
    cercle(0, 0, 0.11),
    ligne([0, -0.075], [0, 0.075]),
    polyligne([[-0.04, 0.035], [0, 0.075], [0.04, 0.035]]),
  ]),
  grille: fixe([
    rect(-0.15, -0.05, 0.15, 0.05),
    ...[-0.10, -0.05, 0, 0.05, 0.10].map((x) => ligne([x, -0.05], [x, 0.05])),
  ]),
  conduit: fixe([
    cercle(0, 0, 0.12),
    cercle(0, 0, 0.08),
  ]),

  // ── Menuiseries ──
  // Fenêtre : tableaux de l'ouverture et double trait du vitrage
  fenetre: fixe([
    ligne([-0.15, -0.05], [-0.15, 0.05]),
    ligne([0.15, -0.05], [0.15, 0.05]),
    ligne([-0.15, -0.015], [0.15, -0.015]),
    ligne([-0.15, 0.015], [0.15, 0.015]),
  ]),
  // Porte : ouverture sur y = 0, vantail ouvert et son arc de débattement
  porte: fixe([
    ligne([-0.15, -0.04], [-0.15, 0]),
    ligne([0.15, -0.04], [0.15, 0]),
    ligne([-0.15, 0], [-0.15, 0.30]),
    arc(-0.15, 0, 0.30, 0, 90),
  ]),
  placard: fixe([
    rect(-0.15, -0.10, 0.15, 0.10),
    ligne([-0.15, -0.10], [0.15, 0.10]),
    ligne([-0.15, 0.10], [0.15, -0.10]),
  ]),

  // ── Occultations ──
  // Volet : trait épais pointillé — des tirets pleins, l'épaisseur se
  // dessinant faute de largeur de trait en R12
  volet: fixe([-0.15, -0.085, -0.02, 0.045, 0.11].map((x) => rect(x, -0.0125, x + 0.04, 0.0125))),
  store: fixe([
    ligne([-0.15, 0.07], [0.15, 0.07]),
    polyligne([[-0.15, 0], [-0.10, -0.04], [-0.05, 0.04], [0, -0.04], [0.05, 0.04], [0.10, -0.04], [0.15, 0]]),
  ]),

  // ── Compteurs ──
  'compteur-eau': fixe([cercle(0, 0, 0.12), texte('E', [0, 0], 0.10)]),
  'compteur-gaz': fixe([cercle(0, 0, 0.12), texte('G', [0, 0], 0.10)]),
  'compteur-electricite': fixe([cercle(0, 0, 0.12), texte('EL', [0, 0], 0.09)]),

  // ── Sécurité ──
  'detecteur-fumee': fixe([cercle(0, 0, 0.12), texte('DF', [0, 0], 0.08)]),
  'eclairage-secours': fixe([rect(-0.15, -0.07, 0.15, 0.07), texte('BAES', [0, 0], 0.06)]),
  extincteur: fixe([triangle(0.30), texte('EX', [0, -0.025], 0.06)]),

  // ── Désordres ──
  fissure: fixe([
    polyligne([[-0.15, -0.06], [-0.07, 0.02], [-0.03, -0.03], [0.04, 0.05], [0.08, 0], [0.15, 0.07]]),
  ]),
  humidite: fixe([
    ...goutte(0, -0.07, 0.06),
    ...goutte(-0.10, 0.01, 0.04),
    ...goutte(0.10, -0.01, 0.04),
  ]),
  degradation: fixe([etoile(0.15, 0.06)]),
  // Point d'exclamation en traits : il se lit sans dépendre d'une police
  'materiau-suspect': fixe([
    triangle(0.30),
    ligne([0, -0.015], [0, 0.085]),
    cercle(0, -0.045, 0.012),
  ]),
}

// ─── Boîte et taille ────────────────────────────────────────────────────────

// Largeur estimée d'un caractère, en part de la hauteur du texte : un peu
// large, pour qu'un texte ne déborde jamais de la boîte annoncée
export const LARGEUR_CARACTERE = 0.8

const AXES = [0, 90, 180, 270]

// L'angle `a` est-il parcouru par un arc trigonométrique de `debut` à `fin` ?
function dansArc(a, debut, fin) {
  const n = (v) => ((v % 360) + 360) % 360
  const etendue = n(fin - debut) || 360
  return n(a - debut) <= etendue
}

function pointsPrimitive(p) {
  if (p.ligne) return p.ligne
  if (p.polyligne) return p.polyligne
  if (p.cercle) {
    const [cx, cy, r] = p.cercle
    return [[cx - r, cy - r], [cx + r, cy + r]]
  }
  if (p.arc) {
    const [cx, cy, r, debut, fin] = p.arc
    const sur = (deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))]
    return [sur(debut), sur(fin), ...AXES.filter((a) => dansArc(a, debut, fin)).map(sur)]
  }
  if (p.texte != null) {
    const [x, y] = p.pos
    const dx = (String(p.texte).length * LARGEUR_CARACTERE * p.hauteur) / 2
    const dy = p.hauteur / 2
    const a = rad(p.rotation ?? 0)
    const c = Math.cos(a)
    const s = Math.sin(a)
    return [[-dx, -dy], [dx, -dy], [dx, dy], [-dx, dy]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c])
  }
  return []
}

export function boitePrimitives(primitives) {
  const pts = primitives.flatMap(pointsPrimitive)
  if (!pts.length) return null
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const b = { xmin: Math.min(...xs), ymin: Math.min(...ys), xmax: Math.max(...xs), ymax: Math.max(...ys) }
  return { ...b, largeur: b.xmax - b.xmin, hauteur: b.ymax - b.ymin }
}

export const boiteSymbole = (code) => (SYMBOLES[code] ? boitePrimitives(SYMBOLES[code].primitives) : null)

const deuxDecimales = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// « 0,60 × 0,45 m · taille réelle » : ce que la planche montre à l'agence
export function libelleTailleSymbole(code) {
  const b = boiteSymbole(code)
  if (!b) return ''
  const sorte = SYMBOLES[code].taille === 'reelle' ? 'taille réelle' : 'taille fixe'
  return `${deuxDecimales(b.largeur)} × ${deuxDecimales(b.hauteur)} m · ${sorte}`
}

// ─── Orientation et placement ───────────────────────────────────────────────

// Angle du plus long côté de la pièce, ramené dans ]-45°, 45°] : un symbole
// suit un plan tourné sans jamais se coucher de plus d'un huitième de tour
export function orientationPiece(contour) {
  if (!Array.isArray(contour) || contour.length < 2) return 0
  let plusLong = 0
  let angle = 0
  contour.forEach((a, i) => {
    const b = contour[(i + 1) % contour.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy)
    if (l > plusLong + 1e-9) {
      plusLong = l
      angle = (Math.atan2(dy, dx) * 180) / Math.PI
    }
  })
  let r = ((angle % 90) + 90) % 90
  if (r > 45) r -= 90
  return Math.round(r * 1e6) / 1e6 || 0
}

// Primitives d'un symbole tournées de `angle` degrés (sens trigonométrique)
// puis posées en (x, y), toujours en mètres
export function primitivesPlacees(code, { x = 0, y = 0, angle = 0 } = {}) {
  const symbole = SYMBOLES[code]
  if (!symbole) return []
  const a = rad(angle)
  const c = Math.cos(a)
  const s = Math.sin(a)
  const t = ([u, v]) => [x + u * c - v * s, y + u * s + v * c]
  return symbole.primitives.map((p) => {
    if (p.ligne) return { ligne: p.ligne.map(t) }
    if (p.polyligne) return { polyligne: p.polyligne.map(t), ferme: p.ferme }
    if (p.cercle) {
      const [cx, cy, r] = p.cercle
      return { cercle: [...t([cx, cy]), r] }
    }
    if (p.arc) {
      const [cx, cy, r, debut, fin] = p.arc
      return { arc: [...t([cx, cy]), r, debut + angle, fin + angle] }
    }
    return { texte: p.texte, pos: t(p.pos), hauteur: p.hauteur, rotation: (p.rotation ?? 0) + angle }
  })
}

// ─── SVG ────────────────────────────────────────────────────────────────────

const nb = (v) => String(arrondi(v))

// Données SVG d'un symbole : y retourné (le plan monte, l'écran descend).
// `SymboleEdl.jsx` n'a plus qu'à les dessiner.
export function symboleSvg(code) {
  const symbole = SYMBOLES[code]
  if (!symbole) return null
  const b = boitePrimitives(symbole.primitives)
  const marge = Math.max(0.02, 0.06 * Math.max(b.largeur, b.hauteur))
  const viewBox = [b.xmin - marge, -b.ymax - marge, b.largeur + 2 * marge, b.hauteur + 2 * marge].map(nb).join(' ')
  const pt = ([px, py]) => `${nb(px)},${nb(-py)}`
  const elements = symbole.primitives.map((p) => {
    if (p.ligne) {
      const [[x1, y1], [x2, y2]] = p.ligne
      return { type: 'line', x1: arrondi(x1), y1: arrondi(-y1), x2: arrondi(x2), y2: arrondi(-y2) }
    }
    if (p.polyligne) return { type: p.ferme ? 'polygon' : 'polyline', points: p.polyligne.map(pt).join(' ') }
    if (p.cercle) {
      const [cx, cy, r] = p.cercle
      return { type: 'circle', cx: arrondi(cx), cy: arrondi(-cy), r }
    }
    if (p.arc) {
      const [cx, cy, r, debut, fin] = p.arc
      const etendue = ((((fin - debut) % 360) + 360) % 360) || 360
      const sur = (deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))]
      // Le sens trigonométrique du plan, une fois y retourné, est le sens
      // négatif du SVG : drapeau de balayage à 0
      return { type: 'path', d: `M ${pt(sur(debut))} A ${nb(r)} ${nb(r)} 0 ${etendue > 180 ? 1 : 0} 0 ${pt(sur(fin))}` }
    }
    return { type: 'text', x: arrondi(p.pos[0]), y: arrondi(-p.pos[1]), hauteur: p.hauteur, texte: p.texte, rotation: -(p.rotation ?? 0) || 0 }
  })
  return { viewBox, elements }
}

// Codes de type sans symbole (doit rester vide : vérifié par les tests)
export const typesSansSymbole = () => CALQUES.flatMap((c) => c.types.map((t) => t.code)).filter((code) => !SYMBOLES[code])
