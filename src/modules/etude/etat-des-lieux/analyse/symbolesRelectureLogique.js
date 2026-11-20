// ─── Symboles sur le plan de la relecture (logique pure) ─────────────────────
//
// Demande de l'agence (2026-11-20) : à la relecture, les pastilles numérotées
// se lisaient mal ; chaque point typé montre le symbole des planches, posé
// sur un disque de la couleur de sa famille (la cible du doigt). Un seul
// symbole par point : celui de son type effectif (`typeEffectif` — type du
// geste, sinon de l'élément validé, sinon de la proposition) ; la liste des
// éléments dit le reste. Même catalogue (`symbolesEdl.js`), même angle
// (`orientationElement`), mêmes couleurs (`couleurCalque`) que les planches ;
// taille à l'échelle du plan (demande de l'agence, 2026-11-20 : « les
// symboles et les cotes doivent rester à la même taille dans le plan au
// dézoom »), comme un dessin au 1/100 — `TAILLES_SYMBOLE_MM` des planches,
// en mètres. Seuls les traits et les zones du doigt restent constants à
// l'écran. Un point sans type garde sa pastille.
// Testé (tests/etat-des-lieux-relecture-symboles.test.js).

import { typeEdl } from '../calquesEdl.js'
import { typeEffectif } from '../tracesEdl.js'
import { SYMBOLES, TAILLE_SYMBOLE_DEFAUT_MM, boiteSymbole, orientationElement, primitivesPlacees, tailleSymboleMetres } from '../export/symbolesEdl.js'
import { couleurCalque } from '../export/rapportEdlLogique.js'

// Sans échelle fiable du plan (repli) : plus grande dimension du symbole à
// l'écran, rayon du disque dessous (40 px : la zone sensible du doigt,
// 44 px, le déborde à peine), pastille et texte de cote
export const TAILLE_SYMBOLE_PX = 28
export const RAYON_DISQUE_PX = 20
export const RAYON_PASTILLE_PX = 11
export const TEXTE_COTE_PX = 12

// À l'échelle du plan (mètres) : disque de 1,5 fois le symbole ; pastille
// d'un point sans type de 0,35 m ; valeur d'une cote haute de 0,22 m
export const DISQUE_SUR_SYMBOLE = 1.5
export const DIAMETRE_PASTILLE_M = 0.35
export const HAUTEUR_TEXTE_COTE_M = 0.22

/**
 * Pixels d'écran par mètre du plan, d'après la fonction mètres → calque
 * (le calque est rendu à la taille de l'écran, zoom compris). Null si le
 * plan n'a pas d'échelle fiable (cadrage sans `pxParMetre`) : les tailles
 * d'écran constantes servent alors.
 */
export function pxParMetreEcran(enCalque, origine = [0, 0]) {
  if (typeof enCalque !== 'function') return null
  const a = enCalque(origine)
  const b = enCalque([origine[0] + 1, origine[1]])
  const d = Math.hypot(b?.[0] - a?.[0], b?.[1] - a?.[1])
  return Number.isFinite(d) && d > 0 ? d : null
}

/**
 * Tailles d'écran (px) du dessin d'un point de type `code` (null : pastille).
 * Avec `pxParMetre` : à l'échelle du plan — symbole à sa taille du 1/100
 * (`tailleSymboleMetres`), disque de 1,5 fois (un appareil à taille réelle
 * garde le disque d'un symbole de 3,8 mm, sans quoi une baignoire serait
 * noyée dessous), pastille de 0,35 m. Sans : les constantes d'écran.
 *   { symbole, rayonDisque, rayonPastille }
 */
export function taillesPointEcran(code, pxParMetre = null) {
  if (!(pxParMetre > 0)) return { symbole: TAILLE_SYMBOLE_PX, rayonDisque: RAYON_DISQUE_PX, rayonPastille: RAYON_PASTILLE_PX }
  const metres = (code && tailleSymboleMetres(code)) || TAILLE_SYMBOLE_DEFAUT_MM / 10
  const fixe = code && SYMBOLES[code]?.taille !== 'reelle'
  const base = fixe ? metres : TAILLE_SYMBOLE_DEFAUT_MM / 10
  return {
    symbole: metres * pxParMetre,
    rayonDisque: (DISQUE_SUR_SYMBOLE * base * pxParMetre) / 2,
    rayonPastille: (DIAMETRE_PASTILLE_M * pxParMetre) / 2,
  }
}

/** Hauteur (px) de la valeur d'une cote : 0,22 m du plan, ou 12 px sans échelle. */
export const texteCoteEcran = (pxParMetre = null) => (pxParMetre > 0 ? HAUTEUR_TEXTE_COTE_M * pxParMetre : TEXTE_COTE_PX)

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
