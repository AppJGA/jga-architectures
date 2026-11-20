// ─── Dessin d'une planche A3 « report relevé » ───────────────────────────────
//
// Lit la mise de `misePlanche` (plancheEdl.js) et la dessine sur un contexte
// 2D quelconque : le plan existant tel quel (il porte déjà noms, surfaces et
// HSP, on n'y ajoute ni contour de pièce ni désignation), les symboles seuls,
// la légende encadrée et le cartouche, comme l'exemple de l'agence.
// Sans navigateur : c'est l'appelant qui fournit le canevas (PDF) ou un
// canevas par symbole (Word, `tailleImageSymbole`). Testé avec un contexte
// enregistreur (tests/etat-des-lieux-export-planche.test.js).
//
// Tout se mesure en millimètres du papier (y vers le bas) puis passe en
// pixels par `pxParMm` : la même mise donne la planche du PDF et les images
// du Word, à n'importe quelle résolution.

import { versMetres } from '../geometrieEdl.js'
import { EPAISSEUR_TRAIT, dessinerVecteurs } from '../vecteursEdlLogique.js'
import { COULEUR } from '../../../chantier/comptes-rendus/rapportLogique.js'
import { COTE_PLANCHE, DPI_PLANCHE, LEGENDE, TAILLE_SYMBOLE_MM } from './plancheEdl.js'
import { placementFond } from './planRapportEdl.js'
import { COULEUR_PROPOSITION } from './rapportEdlLogique.js'
import { SYMBOLES, boitePrimitives, largeurTexte, primitivesPlacees } from './symbolesEdl.js'

export const PX_PAR_MM = DPI_PLANCHE / 25.4

// Épaisseurs et tailles imprimées (mm)
export const TRAIT = {
  // Plan existant fin, comme l'exemple : ce qu'on lit d'abord, ce sont les relevés
  plan: 0.13,
  symbole: 0.35,
  anneau: 0.25,
  cadreLegende: 0.5,
  filet: 0.25,
  cadreCartouche: 0.5,
  // Liaisons et cotes (084) : plus fines que les symboles, qu'elles ne doivent pas noyer
  commande: 0.25,
  cote: 0.18,
  attache: 0.13,
}
// Tirets d'une liaison ou d'une cote proposée par l'analyse
const TIRETS_TRACE_MM = [1.2, 0.8]
// Liseré blanc sous la valeur d'une cote : lisible sur les traits du plan
const HALO_COTE_MM = 0.5
export const POLICE_MULTIPLE_MM = 2.2
// Entre le symbole et son « ×n »
const ECART_MULTIPLE_MM = 0.5
// Cercle pointillé d'une proposition : au-delà de la boîte du symbole
const MARGE_ANNEAU_MM = 0.8
const TIRETS_ANNEAU_MM = [0.6, 0.45]
// Autour de l'image d'un symbole (Word) : le trait déborde de la boîte
const MARGE_IMAGE_MM = 0.3

const NOIR = '#1F1B17'
const BLANC = '#FFFFFF'
const POLICES = 'Arial, Helvetica, sans-serif'

const arrondi1 = (v) => Math.round(v * 10) / 10
const police = (taillePx, { gras = false, italique = false } = {}) => `${italique ? 'italic ' : ''}${gras ? 'bold ' : ''}${arrondi1(taillePx)}px ${POLICES}`

// ─── Repère ─────────────────────────────────────────────────────────────────

/** Taille du canevas de la planche, en pixels. */
export function taillePlanchePx(mise, pxParMm = PX_PAR_MM) {
  return { largeur: Math.round(mise.format.largeur * pxParMm), hauteur: Math.round(mise.format.hauteur * pxParMm) }
}

/**
 * Cadrage (au sens de `geometrieEdl.js`) qui couvre toute la feuille : le
 * pixel (0, 0) est le coin haut gauche du papier. `dessinerVecteurs` et
 * `placementFond` le lisent comme celui d'un étage.
 */
export function cadragePlanche(mise, pxParMm = PX_PAR_MM) {
  const { mmParMetre, origineM, origineMm } = mise.transform
  const { largeur, hauteur } = taillePlanchePx(mise, pxParMm)
  const x0 = origineM[0] - origineMm[0] / mmParMetre
  const y1 = origineM[1] + origineMm[1] / mmParMetre
  const c = { x0, y1, pxParMetre: mmParMetre * pxParMm, largeur, hauteur }
  const [x1, y0] = versMetres(c, [largeur, hauteur])
  return { ...c, x1, y0 }
}

// ─── Symboles ───────────────────────────────────────────────────────────────

const primitivesDe = (symbole) => (symbole.code && SYMBOLES[symbole.code] ? primitivesPlacees(symbole.code, { angle: symbole.angle ?? 0 }) : [])

// Millimètres papier par mètre du catalogue : d'après la taille décidée par
// la mise (`tailleMm`), pour ne pas refaire ici sa règle fixe / réelle
function mmParMetreDe(symbole, primitives) {
  const b = boitePrimitives(primitives)
  const cote = b ? Math.max(b.largeur, b.hauteur) : 0
  const voulu = Math.max(symbole.tailleMm?.largeur ?? 0, symbole.tailleMm?.hauteur ?? 0)
  return cote > 0 && voulu > 0 ? voulu / cote : TAILLE_SYMBOLE_MM / 0.3
}

// Boîte du symbole autour de son point d'insertion (mm, y vers le bas)
function boiteMm(symbole) {
  const t = symbole.tailleMm ?? { largeur: 0, hauteur: 0, ancre: [0, 0] }
  const [ax, ay] = t.ancre ?? [t.largeur / 2, t.hauteur / 2]
  return { xmin: -ax, ymin: -ay, xmax: t.largeur - ax, ymax: t.hauteur - ay }
}

const texteMultiple = (symbole) => (symbole.quantite > 1 ? `×${symbole.quantite}` : null)

function anneau(ctx, x, y, r, pxParMm) {
  ctx.save()
  ctx.strokeStyle = COULEUR_PROPOSITION
  ctx.lineWidth = TRAIT.anneau * pxParMm
  ctx.setLineDash?.(TIRETS_ANNEAU_MM.map((v) => v * pxParMm))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function losange(ctx, x, y, demi, couleur) {
  ctx.beginPath()
  ctx.moveTo(x, y - demi)
  ctx.lineTo(x + demi, y)
  ctx.lineTo(x, y + demi)
  ctx.lineTo(x - demi, y)
  ctx.closePath()
  ctx.fillStyle = couleur
  ctx.fill()
}

// Primitives en mètres (déjà tournées, autour du point d'insertion), en
// pixels : x à droite, y du plan vers le haut donc retourné. Le retournement
// suffit à « inverser le sens » de l'angle trigonométrique du plan.
function tracerPrimitives(ctx, primitives, [cx, cy], k, couleur, epaisseur) {
  const px = ([u, v]) => [cx + u * k, cy - v * k]
  const chemin = (pts, ferme) => {
    pts.forEach((p, i) => {
      const [x, y] = px(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (ferme) ctx.closePath()
  }
  ctx.strokeStyle = couleur
  ctx.fillStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const p of primitives) {
    if (p.ligne) chemin(p.ligne, false)
    else if (p.polyligne) chemin(p.polyligne, p.ferme)
    else if (p.cercle) {
      const [x, y] = px(p.cercle)
      const r = p.cercle[2] * k
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    } else if (p.arc) {
      // Sens trigonométrique, y vers le haut : sur le canevas, angles opposés et sens inverse
      const [x, y] = px(p.arc)
      const r = p.arc[2] * k
      const debut = (-p.arc[3] * Math.PI) / 180
      ctx.moveTo(x + r * Math.cos(debut), y + r * Math.sin(debut))
      ctx.arc(x, y, r, debut, (-p.arc[4] * Math.PI) / 180, true)
    }
  }
  ctx.stroke()
  for (const p of primitives) {
    if (!p.plein || !p.cercle) continue
    const [x, y] = px(p.cercle)
    ctx.beginPath()
    ctx.arc(x, y, p.cercle[2] * k, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const p of primitives) {
    if (p.texte == null) continue
    const h = p.hauteur * k
    if (!(h >= 1)) continue
    const [x, y] = px(p.pos)
    ctx.save()
    ctx.translate(x, y)
    // `rotation` est déjà ramenée dans ]-90°, 90°] par `primitivesPlacees` :
    // un « RJ » contre le mur du haut ne se lit pas la tête en bas
    ctx.rotate((-(p.rotation ?? 0) * Math.PI) / 180)
    ctx.font = police(h, { gras: true })
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.texte, 0, 0)
    ctx.restore()
  }
}

/**
 * Un symbole de la mise, son point d'insertion en `centrePx`.
 * Proposition : la couleur de sa famille, entourée d'un cercle pointillé
 * `COULEUR_PROPOSITION`. Élément sans type : losange plein de sa couleur.
 */
export function dessinerSymbole(ctx, symbole, { centrePx, pxParMm = PX_PAR_MM }) {
  const [cx, cy] = centrePx
  const couleur = symbole.couleur ?? NOIR
  const b = boiteMm(symbole)
  const milieu = [cx + ((b.xmin + b.xmax) / 2) * pxParMm, cy + ((b.ymin + b.ymax) / 2) * pxParMm]
  ctx.save()
  ctx.setLineDash?.([])
  const primitives = primitivesDe(symbole)
  if (primitives.length) {
    const k = mmParMetreDe(symbole, primitives) * pxParMm
    tracerPrimitives(ctx, primitives, [cx, cy], k, couleur, TRAIT.symbole * pxParMm)
  } else {
    losange(ctx, milieu[0], milieu[1], ((b.xmax - b.xmin) / 2) * pxParMm, couleur)
  }
  const multiple = texteMultiple(symbole)
  if (multiple) {
    // Non tourné : un « ×3 » se lit toujours à l'endroit
    ctx.fillStyle = couleur
    ctx.font = police(POLICE_MULTIPLE_MM * pxParMm, { gras: true })
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(multiple, cx + (b.xmax + ECART_MULTIPLE_MM) * pxParMm, milieu[1])
  }
  if (symbole.aValider) anneau(ctx, milieu[0], milieu[1], rayonAnneauMm(b) * pxParMm, pxParMm)
  ctx.restore()
}

const rayonAnneauMm = (b) => Math.hypot(b.xmax - b.xmin, b.ymax - b.ymin) / 2 + MARGE_ANNEAU_MM

/**
 * Image d'un seul symbole (Word), « ×n » et cercle de proposition compris,
 * fond transparent : taille en pixels et place du point d'insertion
 * (`centre`) dans l'image. L'image posée en (xMm − centre[0] / pxParMm,
 * yMm − centre[1] / pxParMm) met le symbole là où la planche le dessine.
 */
export function tailleImageSymbole(symbole, pxParMm = PX_PAR_MM) {
  const b = boiteMm(symbole)
  const m = TRAIT.symbole / 2 + MARGE_IMAGE_MM
  let env = { xmin: b.xmin - m, ymin: b.ymin - m, xmax: b.xmax + m, ymax: b.ymax + m }
  const unir = (o) => {
    env = { xmin: Math.min(env.xmin, o.xmin), ymin: Math.min(env.ymin, o.ymin), xmax: Math.max(env.xmax, o.xmax), ymax: Math.max(env.ymax, o.ymax) }
  }
  const my = (b.ymin + b.ymax) / 2
  const multiple = texteMultiple(symbole)
  if (multiple) {
    const x = b.xmax + ECART_MULTIPLE_MM
    const demi = POLICE_MULTIPLE_MM * 0.6
    unir({ xmin: x, ymin: my - demi, xmax: x + largeurTexte(multiple, POLICE_MULTIPLE_MM) + MARGE_IMAGE_MM, ymax: my + demi })
  }
  if (symbole.aValider) {
    const mx = (b.xmin + b.xmax) / 2
    const r = rayonAnneauMm(b) + TRAIT.anneau / 2 + MARGE_IMAGE_MM
    unir({ xmin: mx - r, ymin: my - r, xmax: mx + r, ymax: my + r })
  }
  return {
    largeur: Math.max(1, Math.ceil((env.xmax - env.xmin) * pxParMm)),
    hauteur: Math.max(1, Math.ceil((env.ymax - env.ymin) * pxParMm)),
    centre: [-env.xmin * pxParMm, -env.ymin * pxParMm],
  }
}

// ─── Liaisons et cotes ──────────────────────────────────────────────────────

/** Une liaison de la mise : courbe fine de la couleur électricité (tirets si proposée). */
function dessinerCommande(ctx, t, p) {
  ctx.strokeStyle = t.couleur
  ctx.lineWidth = TRAIT.commande * p
  ctx.setLineDash?.(t.aValider ? TIRETS_TRACE_MM.map((v) => v * p) : [])
  ctx.beginPath()
  ctx.moveTo(t.a[0] * p, t.a[1] * p)
  ctx.quadraticCurveTo(t.controle[0] * p, t.controle[1] * p, t.b[0] * p, t.b[1] * p)
  ctx.stroke()
}

/** Une cote de la mise : lignes d'attache, ligne de cote, obliques et valeur (« ? » si personne ne l'a donnée). */
function dessinerCote(ctx, t, p) {
  ctx.strokeStyle = t.couleur
  ctx.lineWidth = TRAIT.cote * p
  ctx.setLineDash?.(t.aValider ? TIRETS_TRACE_MM.map((v) => v * p) : [])
  ctx.beginPath()
  ctx.moveTo(t.a[0] * p, t.a[1] * p)
  ctx.lineTo(t.b[0] * p, t.b[1] * p)
  ctx.stroke()
  ctx.setLineDash?.([])
  if (t.attaches?.length) {
    ctx.lineWidth = TRAIT.attache * p
    ctx.beginPath()
    for (const [q, r] of t.attaches) {
      ctx.moveTo(q[0] * p, q[1] * p)
      ctx.lineTo(r[0] * p, r[1] * p)
    }
    ctx.stroke()
    ctx.lineWidth = TRAIT.cote * p
  }
  ctx.beginPath()
  for (const [q, r] of t.obliques) {
    ctx.moveTo(q[0] * p, q[1] * p)
    ctx.lineTo(r[0] * p, r[1] * p)
  }
  ctx.stroke()
  if (!t.texte.valeur) return
  const [x, y] = t.texte.position
  ctx.save()
  ctx.translate(x * p, y * p)
  ctx.rotate((t.texte.angle * Math.PI) / 180)
  ctx.font = police(COTE_PLANCHE.police * p, { gras: true })
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = BLANC
  ctx.lineWidth = HALO_COTE_MM * p
  ctx.strokeText(t.texte.valeur, 0, 0)
  ctx.fillStyle = t.couleur
  ctx.fillText(t.texte.valeur, 0, 0)
  ctx.restore()
}

/**
 * Les liaisons et cotes de la mise (`mise.traces`), sous les symboles. Toujours
 * dessinées, symboles ou non : le fond verrouillé du Word les porte (elles n'y
 * sont pas déplaçables, seuls les symboles le sont).
 */
export function dessinerTraces(ctx, traces, { pxParMm = PX_PAR_MM } = {}) {
  if (!traces?.length) return
  ctx.save()
  ctx.lineCap = 'round'
  for (const t of traces) {
    if (t.sorte === 'commande') dessinerCommande(ctx, t, pxParMm)
    else if (t.sorte === 'cote') dessinerCote(ctx, t, pxParMm)
  }
  ctx.restore()
}

// ─── Légende ────────────────────────────────────────────────────────────────

// Mesures de la légende (mm) ; `LEGENDE` (plancheEdl.js) en donne les
// hauteurs : titre 9 = bandeau 7 + 2 d'air, une entrée 5, note 7
const L = {
  bandeau: 7, marge: 3, caseSymbole: [5, 3.6], texteSymbole: 10,
  policeTitre: LEGENDE.texteTitre, policeGroupe: 2.6, policeEntree: 2.5, policeNote: 2.2,
  losange: 2.6, anneau: 1.8,
}

// Symbole d'une entrée, réduit pour tenir dans sa case sans être déformé
function symboleLegende(code, couleur) {
  const primitives = primitivesPlacees(code)
  const b = boitePrimitives(primitives)
  if (!b) return null
  const [cl, ch] = L.caseSymbole
  const f = Math.min(b.largeur > 0 ? cl / b.largeur : Infinity, b.hauteur > 0 ? ch / b.hauteur : Infinity)
  return { code, angle: 0, quantite: 1, aValider: false, couleur, tailleMm: { largeur: b.largeur * f, hauteur: b.hauteur * f, ancre: [-b.xmin * f, b.ymax * f] } }
}

// Trace d'une entrée de légende, dans la case du symbole (5 × 3,6 mm)
function traceLegende(ctx, sorte, couleur, [sx, sy], pxParMm) {
  const [cl, ch] = L.caseSymbole
  const a = [sx - cl / 2, sy + ch / 4]
  const b = [sx + cl / 2, sy + ch / 4]
  ctx.save()
  ctx.lineCap = 'round'
  if (sorte === 'cote') {
    const tic = COTE_PLANCHE.tic * 0.6
    dessinerCote(ctx, {
      couleur, aValider: false, a: [a[0], sy], b: [b[0], sy],
      obliques: [a[0], b[0]].map((x) => [[x - tic / 2 * Math.SQRT1_2, sy + tic / 2 * Math.SQRT1_2], [x + tic / 2 * Math.SQRT1_2, sy - tic / 2 * Math.SQRT1_2]]),
      texte: { valeur: '', position: [sx, sy], angle: 0 },
    }, pxParMm)
  } else {
    // Courbe bombée vers le haut de la case, comme une liaison posée de gauche à droite
    dessinerCommande(ctx, { couleur, aValider: sorte === 'proposition', a, b, controle: [sx, sy - ch * 0.75] }, pxParMm)
  }
  ctx.restore()
}

function entreeLegende(ctx, entree, couleur, [sx, sy], pxParMm) {
  const p = pxParMm
  if (entree.trace) {
    traceLegende(ctx, entree.trace, couleur, [sx, sy], p)
    return
  }
  if (entree.proposition) {
    anneau(ctx, sx * p, sy * p, L.anneau * p, p)
    return
  }
  const s = entree.code && SYMBOLES[entree.code] ? symboleLegende(entree.code, couleur) : null
  if (!s) {
    losange(ctx, sx * p, sy * p, (L.losange / 2) * p, couleur)
    return
  }
  const t = s.tailleMm
  dessinerSymbole(ctx, s, { centrePx: [(sx - t.largeur / 2 + t.ancre[0]) * p, (sy - t.hauteur / 2 + t.ancre[1]) * p], pxParMm })
}

/**
 * La légende comme celle de l'exemple : cadre noir, bandeau noir au titre
 * blanc gras, une ou deux colonnes (titre de groupe gris gras, puis symbole et
 * libellé), séparateur vertical, note sous un filet.
 */
export function dessinerLegende(ctx, legende, { origineMm = null, pxParMm = PX_PAR_MM } = {}) {
  const p = pxParMm
  const cadre = legende.cadreMm
  const [x0, y0] = origineMm ?? [cadre.x, cadre.y]
  const { largeur, hauteur } = cadre
  const colonnes = legende.colonnes?.length ? legende.colonnes : [legende.groupes.map((_, i) => i)]
  const largeurColonne = largeur / colonnes.length
  const basEntrees = y0 + hauteur - LEGENDE.note

  ctx.save()
  ctx.setLineDash?.([])
  ctx.fillStyle = BLANC
  ctx.fillRect(x0 * p, y0 * p, largeur * p, hauteur * p)
  ctx.fillStyle = NOIR
  ctx.fillRect(x0 * p, y0 * p, largeur * p, L.bandeau * p)
  ctx.fillStyle = BLANC
  ctx.font = police(L.policeTitre * p, { gras: true })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(legende.titre, (x0 + L.marge) * p, (y0 + L.bandeau / 2) * p, (largeur - 2 * L.marge) * p)

  colonnes.forEach((indices, n) => {
    const cx = x0 + n * largeurColonne
    let y = y0 + LEGENDE.titre
    for (const i of indices) {
      const g = legende.groupes[i]
      if (!g) continue
      ctx.fillStyle = COULEUR.gris
      ctx.font = police(L.policeGroupe * p, { gras: true })
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(g.libelle, (cx + L.marge) * p, (y + LEGENDE.entree / 2) * p, (largeurColonne - 2 * L.marge) * p)
      y += LEGENDE.entree
      for (const e of g.entrees) {
        const milieu = y + LEGENDE.entree / 2
        entreeLegende(ctx, e, g.couleur, [cx + L.marge + L.caseSymbole[0] / 2, milieu], p)
        ctx.fillStyle = NOIR
        ctx.font = police(L.policeEntree * p)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(e.libelle, (cx + L.texteSymbole) * p, milieu * p, (largeurColonne - L.texteSymbole - L.marge) * p)
        y += LEGENDE.entree
      }
    }
  })

  ctx.strokeStyle = NOIR
  ctx.lineWidth = TRAIT.filet * p
  ctx.beginPath()
  for (let n = 1; n < colonnes.length; n++) {
    const x = (x0 + n * largeurColonne) * p
    ctx.moveTo(x, (y0 + L.bandeau + 1) * p)
    ctx.lineTo(x, (basEntrees - 1) * p)
  }
  ctx.moveTo(x0 * p, basEntrees * p)
  ctx.lineTo((x0 + largeur) * p, basEntrees * p)
  ctx.stroke()

  if (legende.note) {
    ctx.fillStyle = NOIR
    ctx.font = police(L.policeNote * p, { italique: true })
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(legende.note, (x0 + L.marge) * p, (basEntrees + LEGENDE.note / 2) * p, (largeur - 2 * L.marge) * p)
  }

  ctx.strokeStyle = NOIR
  ctx.lineWidth = TRAIT.cadreLegende * p
  ctx.strokeRect(x0 * p, y0 * p, largeur * p, hauteur * p)
  ctx.restore()
}

/**
 * Image de la légende seule (Word) : taille en pixels et place du coin haut
 * gauche du cadre (`origine`) dans l'image — le trait du cadre déborde de
 * moitié, d'où la marge. Dessinée par `dessinerLegende(ctx, legende,
 * { origineMm: origine / pxParMm })`, l'image posée en
 * (cadreMm.x − origine[0] / pxParMm, cadreMm.y − origine[1] / pxParMm)
 * recouvre la légende de la planche.
 */
export function tailleImageLegende(legende, pxParMm = PX_PAR_MM) {
  const { largeur, hauteur } = legende.cadreMm
  const m = TRAIT.cadreLegende / 2 + MARGE_IMAGE_MM
  return {
    largeur: Math.max(1, Math.ceil((largeur + 2 * m) * pxParMm)),
    hauteur: Math.max(1, Math.ceil((hauteur + 2 * m) * pxParMm)),
    origine: [m * pxParMm, m * pxParMm],
  }
}

// ─── Cartouche ──────────────────────────────────────────────────────────────

const C = { libelle: 2, valeur: 3, affaire: 4.2, adresse: 3, numero: 9, titre: 4.5, logo: 9, marge: 1.5, air: 3 }

function texte(ctx, t, x, y, { taille, gras = false, italique = false, couleur = NOIR, aligne = 'left', base = 'middle', max = null }, p) {
  if (!t) return
  ctx.fillStyle = couleur
  ctx.font = police(taille * p, { gras, italique })
  ctx.textAlign = aligne
  ctx.textBaseline = base
  if (max) ctx.fillText(t, x * p, y * p, max * p)
  else ctx.fillText(t, x * p, y * p)
}

function dessinerLogo(ctx, logo, k, p) {
  const l = logo.naturalWidth ?? logo.width
  const h = logo.naturalHeight ?? logo.height
  const placeL = k.largeur - 2 * C.air
  const placeH = k.hauteur - 2 * C.air
  if (!(l > 0) || !(h > 0) || !(placeL > 0) || !(placeH > 0)) return false
  const f = Math.min(placeL / l, placeH / h)
  const dl = l * f
  const dh = h * f
  ctx.drawImage(logo, (k.x + (k.largeur - dl) / 2) * p, (k.y + (k.hauteur - dh) / 2) * p, dl * p, dh * p)
  return true
}

/** Le cartouche de l'agence (cases de la mise), logo s'il est fourni, sinon « JGA ». */
export function dessinerCartouche(ctx, cartouche, { logo = null, pxParMm = PX_PAR_MM } = {}) {
  const p = pxParMm
  const cadre = cartouche.cadreMm
  ctx.save()
  ctx.setLineDash?.([])
  ctx.fillStyle = BLANC
  ctx.fillRect(cadre.x * p, cadre.y * p, cadre.largeur * p, cadre.hauteur * p)
  ctx.strokeStyle = NOIR
  ctx.lineWidth = TRAIT.filet * p
  for (const k of cartouche.cases) ctx.strokeRect(k.x * p, k.y * p, k.largeur * p, k.hauteur * p)

  for (const k of cartouche.cases) {
    const utile = k.largeur - 2 * C.marge
    if (k.cle === 'affaire') {
      texte(ctx, k.valeur, k.x + C.air, k.y + k.hauteur * 0.38, { taille: C.affaire, gras: true, max: k.largeur - 2 * C.air }, p)
      texte(ctx, k.detail, k.x + C.air, k.y + k.hauteur * 0.68, { taille: C.adresse, couleur: COULEUR.gris, max: k.largeur - 2 * C.air }, p)
    } else if (k.cle === 'titre') {
      texte(ctx, k.valeur, k.x + C.air, k.y + k.hauteur / 2, { taille: C.titre, gras: true, max: k.largeur - 2 * C.air }, p)
    } else if (k.cle === 'logo') {
      if (!logo || !dessinerLogo(ctx, logo, k, p)) {
        texte(ctx, 'JGA', k.x + k.largeur / 2, k.y + k.hauteur / 2, { taille: C.logo, gras: true, aligne: 'center', max: utile }, p)
      }
    } else {
      // Petite case : libellé en haut à gauche, valeur au milieu
      texte(ctx, k.libelle, k.x + C.marge, k.y + C.marge, { taille: C.libelle, couleur: COULEUR.gris, base: 'top', max: utile }, p)
      const taille = k.grand ? C.numero : C.valeur
      texte(ctx, k.valeur, k.x + k.largeur / 2, k.y + k.hauteur * (k.grand ? 0.56 : 0.62), { taille, gras: true, aligne: 'center', max: utile }, p)
    }
  }
  ctx.lineWidth = TRAIT.cadreCartouche * p
  ctx.strokeRect(cadre.x * p, cadre.y * p, cadre.largeur * p, cadre.hauteur * p)
  ctx.restore()
}

// ─── La planche ─────────────────────────────────────────────────────────────

function dessinerPlanExistant(ctx, mise, { vecteurs, fond, pxParMm }) {
  const c = cadragePlanche(mise, pxParMm)
  const z = mise.zone
  ctx.save()
  // Le plan reste dans sa zone : il ne déborde ni sur le cartouche ni sur la marge
  ctx.beginPath()
  ctx.rect(z.x * pxParMm, z.y * pxParMm, z.largeur * pxParMm, z.hauteur * pxParMm)
  ctx.clip()
  if (vecteurs) {
    // `dessinerVecteurs` trace en pixels d'écran (1 px) : on le fait dessiner
    // dans un repère agrandi pour obtenir un trait fin imprimé de 0,13 mm à
    // toute résolution
    const k = (TRAIT.plan * pxParMm) / EPAISSEUR_TRAIT
    ctx.save()
    ctx.scale(k, k)
    dessinerVecteurs(ctx, vecteurs, c, {
      versEcran: (x, y) => [x / k, y / k], echelle: 1 / k, ecran: { largeur: c.largeur / k, hauteur: c.hauteur / k },
    })
    ctx.restore()
  } else if (fond?.image) {
    const r = placementFond(fond.niveauCadrage, c)
    if (r) ctx.drawImage(fond.image, r.x, r.y, r.largeur, r.hauteur)
  }
  ctx.restore()
}

/**
 * Dessine la planche dans `ctx` (canevas de `taillePlanchePx(mise, pxParMm)`).
 *
 * @param vecteurs fichier vectoriel décodé de l'étage (`decoderVecteurs`)
 * @param fond { image, niveauCadrage } image de l'étage, s'il n'a pas de fichier vectoriel
 * @param logo image du logo de l'agence (tout ce que `drawImage` accepte)
 */
export function dessinerPlanche(ctx, mise, {
  vecteurs = null, fond = null, logo = null, pxParMm = PX_PAR_MM, avecSymboles = true, avecLegende = true,
} = {}) {
  const { largeur, hauteur } = taillePlanchePx(mise, pxParMm)
  ctx.fillStyle = BLANC
  ctx.fillRect(0, 0, largeur, hauteur)
  dessinerPlanExistant(ctx, mise, { vecteurs, fond, pxParMm })
  // Dans le fond du Word aussi (`avecSymboles` faux) : elles n'y bougent pas
  dessinerTraces(ctx, mise.traces, { pxParMm })
  if (avecSymboles) {
    for (const s of mise.symboles) dessinerSymbole(ctx, s, { centrePx: [s.xMm * pxParMm, s.yMm * pxParMm], pxParMm })
  }
  if (avecLegende && mise.legende?.groupes?.length) dessinerLegende(ctx, mise.legende, { pxParMm })
  dessinerCartouche(ctx, mise.cartouche, { logo, pxParMm })
}
