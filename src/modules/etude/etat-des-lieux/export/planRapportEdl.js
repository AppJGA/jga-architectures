// ─── Plan du rapport PDF : dessin d'un étage ou d'une pièce ──────────────────
//
// Le plan allégé (fichier vectoriel, à défaut l'image de l'étage) passé en
// gris, les contours des pièces, puis chaque élément : son symbole
// (`primitivesPlacees`, tourné comme la pièce) et son numéro dans une bulle.
// Sans navigateur : `ctx` est n'importe quel contexte 2D, c'est
// `genererRapportEdl.js` qui fournit le canevas et en fait un JPEG.

import { boite, cadrage, versPixels } from '../geometrieEdl.js'
import { dessinerVecteurs, elementsVisibles } from '../vecteursEdlLogique.js'
import { RAYON_SANS_SYMBOLE, SYMBOLES, boitePrimitives, decalagesSymboles, orientationPiece, primitivesPlacees } from './symbolesEdl.js'
import { CADRE_PLAN_ETAGE, COULEUR_PROPOSITION, couleurCalque, texteLatin } from './rapportEdlLogique.js'
import { placerCadre } from './placementEtiquettes.js'

// Plus grand côté de l'image : ~2 400 px pour une page A4 paysage (≈ 230 dpi
// sur 27 cm), ~1 000 px pour l'extrait d'une pièce en tête de sa fiche (un
// rapport en compte autant que de pièces visitées : 200 sur un grand étage)
export const PX_PLAN_PIECE = 1000
export const PX_PLAN_ETAGE = 2400
// Marge autour des pièces : de quoi voir la façade et une fenêtre posée dessus
export const MARGE_PLAN_M = 1.5
const MARGE_PIECE_M = 1

// Un symbole à taille fixe (0,30 m) ferait 6 px sur un étage de 100 m : il
// est agrandi jusqu'à cette taille (en pixels, ou en points imprimés par
// `dessinerPlanRapport`). Les appareils restent à leur taille réelle, c'est
// elle qu'on compare au plan.
export const PX_SYMBOLE_MIN = 24
const TAILLE_FIXE_M = 0.3

// Tailles imprimées, en points PDF : bulle d'un numéro, désignation des
// pièces, traits, symbole à taille fixe au plus petit
const PT = { bulle: 5.5, piece: 6.5, contour: 0.7, symbole: 0.55, trait: 0.3, symboleMin: 8 }

/**
 * Pixels de l'image par point imprimé, une fois l'image posée par pdfmake
 * dans `cadre` ([largeur, hauteur] en points, image réduite pour y tenir).
 */
export function pxParPoint(c, cadre = CADRE_PLAN_ETAGE) {
  return Math.max(c.largeur / cadre[0], c.hauteur / cadre[1], 0.5)
}

const ACCENT = '#E8602C'
const GRIS = '#9C9591'

/**
 * Cadrage d'un plan du rapport, sur les pièces et non sur tout le dessin :
 * une grande feuille de géomètre ne doit pas réduire le bâtiment. Sans
 * pièce, le cadrage de l'étage (`edl_niveaux.cadrage`).
 */
export function cadragePlan(pieces, { pxMax = PX_PLAN_ETAGE, marge = MARGE_PLAN_M, repli = null } = {}) {
  const pts = (pieces ?? []).flatMap((p) => (Array.isArray(p.contour) ? p.contour : []))
  let b = pts.length ? boite(pts) : null
  if (!b && repli && [repli.x0, repli.y0, repli.x1, repli.y1].every(Number.isFinite)) b = [repli.x0, repli.y0, repli.x1, repli.y1]
  if (!b || !b.every(Number.isFinite)) return null
  const m = Math.max(marge, 0.04 * Math.max(b[2] - b[0], b[3] - b[1]))
  return cadrage([b[0] - m, b[1] - m, b[2] + m, b[3] + m], { marge: 0, pxMax })
}

export const cadragePiece = (piece, pxMax = PX_PLAN_PIECE) => cadragePlan([piece], { pxMax, marge: MARGE_PIECE_M })

/**
 * Plan réduit à ce qui croise le cadrage (traits, masses, textes) : l'extrait
 * d'une pièce ne reparcourt pas, à chaque dessin, les milliers de traits de
 * l'étage. Le tri se fait une fois par pièce, sur les boîtes déjà calculées
 * au décodage.
 */
export function vecteursDuCadrage(vecteurs, c) {
  if (!vecteurs || !c) return null
  return { ...elementsVisibles(vecteurs, [c.x0, c.y0, c.x1, c.y1]), calques: vecteurs.calques, boite: vecteurs.boite }
}

/** Agrandissement d'un symbole : 1 pour un appareil, au moins `PX_SYMBOLE_MIN` px pour les autres. */
export function echelleSymbole(code, pxParMetre, pxMin = PX_SYMBOLE_MIN) {
  const s = SYMBOLES[code]
  if (!s || s.taille === 'reelle' || !(pxParMetre > 0)) return 1
  return Math.max(1, pxMin / (TAILLE_FIXE_M * pxParMetre))
}

/**
 * Où poser l'image enregistrée de l'étage (qui couvre `niveauCadrage`) dans
 * le cadrage `c` : rectangle de destination en pixels. L'image entière est
 * posée et le canevas coupe ce qui dépasse — un rectangle source hors de
 * l'image n'est pas dessiné par Safari.
 */
export function placementFond(niveauCadrage, c) {
  const n = niveauCadrage
  if (!n || ![n.x0, n.y0, n.x1, n.y1].every(Number.isFinite)) return null
  return {
    x: (n.x0 - c.x0) * c.pxParMetre,
    y: (c.y1 - n.y1) * c.pxParMetre,
    largeur: (n.x1 - n.x0) * c.pxParMetre,
    hauteur: (n.y1 - n.y0) * c.pxParMetre,
  }
}

/** Primitives agrandies de `k` autour du point d'insertion (mètres). */
export function agrandir(primitives, [ox, oy], k) {
  if (k === 1) return primitives
  const t = ([x, y]) => [ox + (x - ox) * k, oy + (y - oy) * k]
  return primitives.map((p) => {
    if (p.ligne) return { ligne: p.ligne.map(t) }
    if (p.polyligne) return { ...p, polyligne: p.polyligne.map(t) }
    if (p.cercle) return { cercle: [...t(p.cercle), p.cercle[2] * k] }
    if (p.arc) return { arc: [...t(p.arc), p.arc[2] * k, p.arc[3], p.arc[4]] }
    return { ...p, pos: t(p.pos), hauteur: p.hauteur * k }
  })
}

const typeDessine = (e) => (e.type && SYMBOLES[e.type] ? e.type : null)

/**
 * Ce qui se dessine pour chaque symbole placé : primitives en mètres (déjà
 * agrandies), position (x, y), couleur, et la bulle du numéro — une seule par
 * point (plusieurs éléments relevés au même point partagent le numéro), au
 * coin haut droit de l'ensemble de ses symboles (`ancre`).
 *
 * Plusieurs éléments sur un même point : un symbole par type, côte à côte le
 * long de la pièce, par la règle du DXF (`decalagesSymboles`, appliquée aux
 * symboles agrandis) — une fenêtre et son volet ne se recouvrent plus. Deux
 * éléments du même type n'ont qu'un symbole, de la couleur de l'élément
 * validé s'il y en a un.
 */
export function marquesElements(elementsExport, pieces, pxParMetre, pxMin = PX_SYMBOLE_MIN) {
  const angles = new Map((pieces ?? []).map((p) => [p.id, orientationPiece(p.contour)]))
  const groupes = new Map()
  for (const e of elementsExport ?? []) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue
    const cle = e.pointId ?? `${e.x}|${e.y}`
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle).push(e)
  }
  const echelle = (type) => echelleSymbole(type, pxParMetre, pxMin)
  const marques = []
  for (const groupe of groupes.values()) {
    const premier = groupe[0]
    const angle = angles.get(premier.pieceId) ?? 0
    const a = (angle * Math.PI) / 180
    const { emplacements } = decalagesSymboles(groupe.map((e) => e.type), { echelle })
    const siennes = emplacements.map((em) => {
      const duType = groupe.filter((e) => typeDessine(e) === em.type)
      const element = duType.find((e) => !e.aValider) ?? duType[0]
      const x = premier.x + em.dx * Math.cos(a)
      const y = premier.y + em.dx * Math.sin(a)
      const primitives = agrandir(primitivesPlacees(em.type, { x, y, angle }), [x, y], echelle(em.type))
      const r = RAYON_SANS_SYMBOLE * echelle(em.type)
      return {
        element, x, y, primitives,
        boite: primitives.length ? boitePrimitives(primitives) : { xmin: x - r, ymin: y - r, xmax: x + r, ymax: y + r },
        couleur: element.aValider ? COULEUR_PROPOSITION : couleurCalque(element.calque),
        numero: null, ancre: null,
      }
    })
    const numero = groupe.find((e) => e.numero != null)?.numero
    if (numero != null && siennes.length) {
      // « P7 », comme le libellé du DXF : c'est le numéro du point de visite
      siennes[0].numero = `P${texteLatin(numero)}`
      siennes[0].ancre = [Math.max(...siennes.map((m) => m.boite.xmax)), Math.max(...siennes.map((m) => m.boite.ymax))]
      // Losange seul (élément sans type) : la bulle s'écarte davantage pour ne pas le cacher
      siennes[0].sansSymbole = siennes.every((m) => !m.primitives.length)
    }
    for (const m of siennes) marques.push(m)
  }
  return marques
}

/**
 * Place de la désignation de chaque pièce (mètres) : même règle que le cadre
 * du DXF (`placerCadre`), pour le nom seul, droit (le canevas l'écrit à
 * l'horizontale) et sans réduction — au plus près du centre de la pièce, sur
 * aucun symbole, aucune bulle, aucun point.
 *
 * @param hauteur hauteur du texte en mètres (police imprimée / px par mètre)
 * @param obstacles boîtes { xmin, ymin, xmax, ymax } en mètres
 * @returns [{ piece, texte, pos }]
 */
export function placesDesignations(pieces, { hauteur, obstacles = [], pieceMiseEnAvant = null } = {}) {
  const polys = obstacles.map((b) => [[b.xmin, b.ymin], [b.xmax, b.ymin], [b.xmax, b.ymax], [b.xmin, b.ymax]])
  const places = []
  for (const p of pieces ?? []) {
    if (!Array.isArray(p.contour) || p.contour.length < 3) continue
    if (pieceMiseEnAvant && pieceMiseEnAvant.id !== p.id) continue
    const texte = texteLatin([p.numero, p.nom].filter(Boolean).join(' · '))
    if (!texte) continue
    const cadre = placerCadre({ contour: p.contour, lignes: [{ texte, hauteur }], obstacles: polys, marge: hauteur * 0.25, reductionMin: 1 })
    places.push({ piece: p, texte, pos: cadre.lignes[0].pos })
  }
  return places
}

// ─── Dessin (contexte 2D quelconque) ─────────────────────────────────────────

function chemin(ctx, c, pts, ferme) {
  pts.forEach((p, i) => {
    const [x, y] = versPixels(c, p)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (ferme) ctx.closePath()
}

function tracerPrimitives(ctx, c, primitives, couleur, epaisseur) {
  ctx.strokeStyle = couleur
  ctx.fillStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.beginPath()
  for (const p of primitives) {
    if (p.ligne) chemin(ctx, c, p.ligne, false)
    else if (p.polyligne) chemin(ctx, c, p.polyligne, p.ferme)
    else if (p.cercle) {
      const [x, y] = versPixels(c, p.cercle)
      ctx.moveTo(x + p.cercle[2] * c.pxParMetre, y)
      ctx.arc(x, y, p.cercle[2] * c.pxParMetre, 0, Math.PI * 2)
    } else if (p.arc) {
      // Sens trigonométrique, y vers le haut : sur le canevas (y vers le bas),
      // angles opposés et sens inverse
      const [x, y] = versPixels(c, p.arc)
      const r = p.arc[2] * c.pxParMetre
      const debut = (-p.arc[3] * Math.PI) / 180
      ctx.moveTo(x + r * Math.cos(debut), y + r * Math.sin(debut))
      ctx.arc(x, y, r, debut, (-p.arc[4] * Math.PI) / 180, true)
    }
  }
  ctx.stroke()
  for (const p of primitives) {
    if (!p.texte) continue
    const h = p.hauteur * c.pxParMetre
    if (h < 3) continue
    const [x, y] = versPixels(c, p.pos)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((-(p.rotation ?? 0) * Math.PI) / 180)
    ctx.font = `bold ${Math.round(h)}px Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.texte, 0, 0)
    ctx.restore()
  }
}

function bulle(ctx, x, y, r, texte, couleur) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = couleur
  ctx.fill()
  ctx.lineWidth = Math.max(1, r * 0.18)
  ctx.strokeStyle = '#FFFFFF'
  ctx.stroke()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${Math.round(r * (texte.length > 3 ? 0.72 : texte.length > 2 ? 0.85 : 1.05))}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(texte, x, y + r * 0.05)
}

/**
 * Dessine le plan dans `ctx` (canevas de `c.largeur` × `c.hauteur`).
 *
 * @param fond { image, niveauCadrage } image enregistrée de l'étage, quand il
 *   n'a pas de fichier vectoriel (étage plus ancien)
 * @param visitees Set des pièces visitées : les autres en pointillés gris
 * @param pieceMiseEnAvant pièce de la fiche : les voisines passent au gris
 * @param cadre cadre de l'image dans le PDF (points) : règle les tailles imprimées
 */
export function dessinerPlanRapport(ctx, {
  cadrage: c, vecteurs = null, fond = null, pieces = [], elementsExport = [], pointsSeuls = [],
  visitees = null, pieceMiseEnAvant = null, cadre = CADRE_PLAN_ETAGE,
}) {
  const pt = pxParPoint(c, cadre)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, c.largeur, c.hauteur)

  if (vecteurs) {
    // Traits d'un pixel d'écran dans `dessinerVecteurs` : à 2 400 px pour une
    // feuille imprimée, on les épaissit en dessinant dans un repère agrandi
    const k = Math.max(1, PT.trait * pt)
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
  // Le plan existant en retrait : ce qu'on lit d'abord, ce sont les relevés
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillRect(0, 0, c.largeur, c.hauteur)

  const vues = visitees instanceof Set ? visitees : new Set(visitees ?? [])
  const trait = Math.max(1, PT.contour * pt)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const p of pieces) {
    if (!Array.isArray(p.contour) || p.contour.length < 3) continue
    const enAvant = pieceMiseEnAvant?.id === p.id
    const discrete = pieceMiseEnAvant ? !enAvant : !vues.has(p.id)
    ctx.beginPath()
    chemin(ctx, c, p.contour, true)
    if (enAvant) {
      ctx.fillStyle = 'rgba(232,96,44,0.05)'
      ctx.fill()
    }
    ctx.setLineDash?.(discrete && !pieceMiseEnAvant ? [trait * 3, trait * 3] : [])
    ctx.strokeStyle = discrete ? GRIS : ACCENT
    ctx.lineWidth = enAvant ? trait * 1.6 : discrete ? trait * 0.7 : trait
    ctx.stroke()
  }
  ctx.setLineDash?.([])

  // Symboles et bulles d'abord calculés : la désignation les évite
  const r = Math.max(6, Math.round(PT.bulle * pt))
  const montres = pieceMiseEnAvant ? elementsExport.filter((e) => e.pieceId === pieceMiseEnAvant.id) : elementsExport
  const marques = marquesElements(montres, pieces, c.pxParMetre, PT.symboleMin * pt)
  const enMetres = (px) => px / c.pxParMetre
  const obstacles = []
  for (const m of marques) {
    obstacles.push(m.boite)
    if (!m.numero) continue
    const decal = enMetres(m.sansSymbole ? r * 0.9 : r * 0.55)
    const [ax, ay] = m.ancre ?? [m.x, m.y]
    obstacles.push({ xmin: ax + decal - enMetres(r), ymin: ay + decal - enMetres(r), xmax: ax + decal + enMetres(r), ymax: ay + decal + enMetres(r) })
  }
  for (const point of pointsSeuls) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    // Le rond et son « P4 », à droite
    obstacles.push({ xmin: point.x - enMetres(r * 0.35), ymin: point.y - enMetres(r * 0.6), xmax: point.x + enMetres(r * (0.6 + 0.6 * (String(point.numero).length + 1))), ymax: point.y + enMetres(r * 0.6) })
  }

  // Désignation petite (le plan d'origine porte souvent déjà le nom, elle
  // sert à retrouver la fiche), posée comme le cadre du DXF : là où elle ne
  // couvre ni symbole ni bulle, au plus près du centre
  const police = Math.max(8, Math.round(PT.piece * pt))
  ctx.font = `bold ${police}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const { piece: p, texte, pos } of placesDesignations(pieces, { hauteur: enMetres(police), obstacles, pieceMiseEnAvant })) {
    const [x, y] = versPixels(c, pos)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    const l = ctx.measureText?.(texte)?.width ?? texte.length * police * 0.6
    ctx.fillRect(x - l / 2 - 3, y - police * 0.65, l + 6, police * 1.3)
    ctx.fillStyle = pieceMiseEnAvant || vues.has(p.id) ? ACCENT : GRIS
    ctx.fillText(texte, x, y)
  }

  // Points posés sans type ni élément : un rond gris, « P4 »
  for (const point of pointsSeuls) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (pieceMiseEnAvant && point.piece_id !== pieceMiseEnAvant.id) continue
    const [x, y] = versPixels(c, [point.x, point.y])
    ctx.beginPath()
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = GRIS
    ctx.fill()
    ctx.font = `bold ${Math.round(r * 0.95)}px Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`P${point.numero}`, x + r * 0.6, y)
  }

  // Extrait d'une pièce : ses seuls éléments (`montres`), les numéros des
  // voisines se lisent sur le plan de l'étage
  const epaisseur = Math.max(1, PT.symbole * pt)
  for (const m of marques) {
    if (m.primitives.length) tracerPrimitives(ctx, c, m.primitives, m.couleur, epaisseur)
    else {
      // Élément sans type (calque seul) : un losange à sa place
      const [x, y] = versPixels(c, [m.x, m.y])
      ctx.beginPath()
      ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x, y + r * 0.5); ctx.lineTo(x - r * 0.5, y)
      ctx.closePath()
      ctx.fillStyle = m.couleur
      ctx.fill()
    }
  }
  // Bulles par-dessus tous les symboles, au coin haut droit de ceux du point
  for (const m of marques) {
    if (!m.numero) continue
    const [ax, ay] = versPixels(c, m.ancre ?? [m.x, m.y])
    const decal = m.sansSymbole ? r * 0.9 : r * 0.55
    bulle(ctx, ax + decal, ay - decal, r, m.numero, m.couleur)
  }
}
