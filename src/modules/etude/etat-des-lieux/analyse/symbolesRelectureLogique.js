// ─── Symboles sur le plan de la relecture (logique pure) ─────────────────────
//
// Demande de l'agence (2026-11-20) : à la relecture, les pastilles numérotées
// se lisaient mal ; chaque point typé montre le symbole des planches, posé
// sur un disque de la couleur de sa famille (la cible du doigt). Un seul
// symbole par point : celui de son type effectif (`typeEffectif` — type du
// geste, sinon de l'élément validé, sinon de la proposition) ; la liste des
// éléments dit le reste. Même catalogue (`symbolesEdl.js`), même angle
// (`orientationElement`), mêmes couleurs (`couleurCalque`) que les planches ;
// taille constante à l'écran. Un point sans type garde sa pastille.
// Testé (tests/etat-des-lieux-relecture-symboles.test.js).

import { typeEdl } from '../calquesEdl.js'
import { typeEffectif } from '../tracesEdl.js'
import { SYMBOLES, boiteSymbole, orientationElement, primitivesPlacees } from '../export/symbolesEdl.js'
import { couleurCalque } from '../export/rapportEdlLogique.js'

// Plus grande dimension du symbole à l'écran, et rayon du disque dessous
// (40 px : la zone sensible du doigt, 44 px, le déborde à peine)
export const TAILLE_SYMBOLE_PX = 28
export const RAYON_DISQUE_PX = 20

/**
 * Ce que la relecture dessine pour un point :
 *   { sorte: 'pastille', numero }                        sans type, ou type sans symbole ;
 *   { sorte: 'symbole', code, calque, couleur, angle, proposition, numero }
 * `proposition` : le point n'a que des éléments à valider (anneau pointillé
 * du bleu de l'IA, comme sur les planches). `piece` : sa pièce, pour l'angle.
 */
export function dessinPointRelecture(point, { elements = [], piece = null } = {}) {
  const numero = point?.numero ?? null
  const code = typeEffectif(point, elements)
  if (!code || !SYMBOLES[code]) return { sorte: 'pastille', numero }
  const calque = typeEdl(code)?.calque ?? null
  const siens = (elements ?? []).filter((e) => e?.point_id === point.id)
  return {
    sorte: 'symbole',
    code,
    calque,
    couleur: couleurCalque(calque),
    angle: orientationElement({ type: code, x: Number(point.x), y: Number(point.y) }, piece),
    proposition: siens.length > 0 && siens.every((e) => e.a_valider),
    numero,
  }
}

const r2 = (v) => Math.round(v * 100) / 100 || 0

/**
 * Le symbole en pixels d'écran autour de son point d'insertion (y vers le
 * bas), tourné de `angle` degrés (sens trigonométrique du plan) : sa plus
 * grande dimension mesure `taillePx` quel que soit l'angle. Éléments SVG :
 * line, polyline, polygon, circle (`plein`), path (arc), text.
 */
export function symboleEcran(code, angle = 0, taillePx = TAILLE_SYMBOLE_PX) {
  const b = boiteSymbole(code)
  if (!b) return []
  const f = taillePx / Math.max(b.largeur, b.hauteur)
  const px = ([u, v]) => [r2(u * f), r2(-v * f)]
  const pts = (liste) => liste.map((q) => px(q).join(',')).join(' ')
  return primitivesPlacees(code, { angle }).map((p) => {
    if (p.ligne) {
      const [[x1, y1], [x2, y2]] = p.ligne.map(px)
      return { type: 'line', x1, y1, x2, y2 }
    }
    if (p.polyligne) return { type: p.ferme ? 'polygon' : 'polyline', points: pts(p.polyligne) }
    if (p.cercle) {
      const [cx, cy] = px(p.cercle)
      return { type: 'circle', cx, cy, r: r2(p.cercle[2] * f), plein: !!p.plein }
    }
    if (p.arc) {
      const [cx, cy, r, debut, fin] = p.arc
      const sur = (deg) => px([cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)])
      const etendue = ((((fin - debut) % 360) + 360) % 360) || 360
      const [a, z] = [sur(debut), sur(fin)]
      // Sens trigonométrique du plan = sens négatif une fois y retourné
      return { type: 'path', d: `M ${a[0]} ${a[1]} A ${r2(r * f)} ${r2(r * f)} 0 ${etendue > 180 ? 1 : 0} 0 ${z[0]} ${z[1]}` }
    }
    const [x, y] = px(p.pos)
    return { type: 'text', x, y, taille: r2(p.hauteur * f), texte: p.texte, rotation: -(p.rotation ?? 0) || 0 }
  })
}
