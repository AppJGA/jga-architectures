// ─── Export DXF de l'état des lieux, par calques EDL- ────────────────────────
//
// Un DXF texte par étage, à fusionner dans le projet ArchiCAD de l'agence
// (conception § 7, décisions du plan du lot 4) :
//   - R12 (AC1009) : le format le plus largement relu, sans identifiants ni
//     objets à tenir à jour — rien à faire concorder avec un `$HANDSEED` ;
//   - coordonnées et `$INSUNITS` dans l'unité du plan d'origine
//     (`edl_niveaux.unites_par_metre`) : le fichier se superpose au plan sans
//     déplacement ni mise à l'échelle ;
//   - textes en Windows-1252 (`$DWGCODEPAGE ANSI_1252`, `encoderDxf`) ;
//   - un bloc `EDL_<CODE>` par type de symbole utilisé, inséré à la rotation
//     de la pièce (les plans sont souvent tournés) ; des `TEXT` seulement,
//     `MTEXT` n'existant pas en R12.
// Pur, sans navigateur ; chaque fichier produit est relu par notre propre
// lecteur dans les tests (tests/etat-des-lieux-export-dxf.test.js).
//
// Placement des textes (`placementEtiquettes.js`, demande de l'agence du
// 2026-11-18 : plus aucun texte sur un autre), dans le repère de la pièce
// (tourné comme elle, donc jamais à l'envers : `orientationPiece` reste dans
// ]-45°, 45°]) :
//   - nom (numéro), surface, HSP (EDL-Pièces), puis « Sol : … », « Murs : … »…
//     (EDL-Finitions), puis les éléments sans point, chacun sur son calque,
//     dans un CADRE (polyligne fermée sur EDL-Pièces) posé dans la pièce sans
//     couvrir de symbole, réduit si la pièce est petite ;
//   - un élément : son symbole au point, « P7 · libellé » et ses cotes
//     (EDL-Cotes) en bloc à côté, à la première place libre autour du
//     symbole (trait de rappel s'il a fallu s'écarter) ;
//   - une photo : petit cercle en haut à gauche du symbole (ou sur le point
//     s'il n'a pas d'élément), « Ph n » posé par la même règle.

import { CALQUES, calqueEdl, typeEdl } from '../calquesEdl.js'
import { aire, pointDansPolygone } from '../geometrieEdl.js'
import { RAYON_SANS_SYMBOLE, SYMBOLES, decalagesSymboles, orientationPiece } from './symbolesEdl.js'
import { placerEtiquettes, pointInterieur, repere } from './placementEtiquettes.js'
import { dansCp1252, encoderCp1252 } from './encodageDxf.js'
import { ficheExportee, hspExport } from './ficheExportEdl.js'

export const CALQUE_A_VALIDER = 'EDL-À valider'

// Couleurs ACI : une par calque, assez distinctes pour se repérer à l'écran
// d'ArchiCAD ; les propositions en bleu, comme dans l'app
const COULEURS = {
  pieces: 7, finitions: 33, plomberie: 5, electricite: 6, chauffage: 10, ventilation: 4,
  menuiseries: 3, occultations: 94, cotes: 40, compteurs: 140, securite: 200, desordres: 1, photos: 210,
}
const COULEUR_A_VALIDER = 150
// Le plan existant en gris : les calques EDL- doivent ressortir dessus
const COULEUR_PLAN = 8

// Hauteurs de texte en mètres (converties dans l'unité du plan)
export const HAUTEUR_NOM = 0.2
export const HAUTEUR_TEXTE = 0.12
const RAYON_PHOTO = 0.06
// Au-delà, un texte passe à la ligne : un « Murs : … » de 500 caractères
// traversait sinon tout l'étage
const CARACTERES_PAR_LIGNE = 60
// Dans le cadre d'une pièce et les libellés, plus court : un cadre compact
// trouve sa place dans une petite pièce, un libellé étroit entre deux symboles
export const CARACTERES_CADRE = 32
// Le nom, plus haut, garde la même largeur que les lignes de 0,12 m
const CARACTERES_NOM = Math.round((CARACTERES_CADRE * HAUTEUR_TEXTE) / HAUTEUR_NOM)
// Un TEXT R12 ne dépasse pas 255 caractères
const LONGUEUR_TEXTE_MAX = 250

const RUBRIQUES = [['sol', 'Sol'], ['murs', 'Murs'], ['plafond', 'Plafond'], ['plinthes', 'Plinthes']]

// ─── Ce qui part dans l'export ──────────────────────────────────────────────

const nombreOuNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

const contourValide = (pc) => Array.isArray(pc?.contour) && pc.contour.length >= 3

/**
 * Pièce d'un point : celle notée en visite, sinon celle qui le contient.
 * Seules les pièces de son étage sont essayées : les étages d'ArchiCAD se
 * superposent, un point du R+1 tomberait sinon dans une pièce du RDC. Une
 * seule règle pour le DXF et le rapport (`preparerExport` la pose sur les
 * points qu'il leur passe).
 */
export function pieceDuPoint(point, pieces = []) {
  if (!point) return null
  if (point.piece_id) return point.piece_id
  const x = Number(point.x)
  const y = Number(point.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const memeEtage = (pc) => !point.niveau_id || !pc.niveau_id || pc.niveau_id === point.niveau_id
  return pieces.find((pc) => contourValide(pc) && memeEtage(pc) && pointDansPolygone([x, y], pc.contour))?.id ?? null
}

/**
 * Éléments à dessiner (décisions du plan du lot 4) : les éléments validés,
 * plus les propositions si demandé (`aValider`) ; un point typé en visite
 * qu'aucun élément exporté ne couvre devient un élément de son type
 * (libellé = type). Un point ni typé ni rattaché n'est pas dessiné.
 *
 * @returns [{ id, pieceId, pointId, niveauId, x, y, calque (code), type, libelle, cotes, numero, aValider }]
 *   x, y en mètres, `null` pour un élément sans point ; `niveauId` : l'étage
 *   du point, sinon celui de la pièce ; trié par numéro de point.
 */
export function elementsAExporter({ pieces = [], points = [], elements = [], inclurePropositions = false } = {}) {
  const parPoint = new Map(points.map((p) => [p.id, p]))
  const niveauDeLaPiece = new Map(pieces.map((pc) => [pc.id, pc.niveau_id ?? null]))
  const niveauDe = (point, pieceId) => point?.niveau_id ?? niveauDeLaPiece.get(pieceId) ?? null

  const sortie = []
  const pointsCouverts = new Set()
  for (const e of elements) {
    if (e.a_valider && !inclurePropositions) continue
    const type = typeEdl(e.type)
    const calque = type?.calque ?? (calqueEdl(e.calque) ? e.calque : null)
    if (!calque) continue
    const point = e.point_id ? parPoint.get(e.point_id) : null
    if (point) pointsCouverts.add(point.id)
    const pieceId = e.piece_id ?? (point ? pieceDuPoint(point, pieces) : null)
    sortie.push({
      id: e.id,
      pieceId,
      pointId: point?.id ?? null,
      niveauId: niveauDe(point, pieceId),
      x: point ? nombreOuNull(point.x) : null,
      y: point ? nombreOuNull(point.y) : null,
      calque,
      type: type?.code ?? null,
      libelle: e.libelle ?? '',
      cotes: e.cotes ?? null,
      numero: point?.numero ?? null,
      aValider: !!e.a_valider,
    })
  }
  for (const p of points) {
    const type = typeEdl(p.type)
    if (!type || pointsCouverts.has(p.id)) continue
    const pieceId = pieceDuPoint(p, pieces)
    sortie.push({
      id: `point-${p.id}`,
      pieceId,
      pointId: p.id,
      niveauId: niveauDe(p, pieceId),
      x: nombreOuNull(p.x),
      y: nombreOuNull(p.y),
      calque: type.calque,
      type: type.code,
      libelle: type.libelle,
      cotes: null,
      numero: p.numero ?? null,
      aValider: false,
    })
  }
  return sortie
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.numero ?? Infinity) - (b.e.numero ?? Infinity) || a.i - b.i)
    .map(({ e }) => e)
}

// ─── Unités, noms, textes ───────────────────────────────────────────────────

// Unités que `$INSUNITS` sait dire : m, dm, cm, mm
const UNITES = [[1, 6, 'm'], [10, 14, 'dm'], [100, 5, 'cm'], [1000, 4, 'mm']]

/**
 * `$INSUNITS` du fichier. Les coordonnées restent dans l'unité du plan
 * d'origine ; une unité que le DXF ne sait pas dire prend la plus proche, et
 * `exacte` vaut faux pour que l'écran le signale.
 */
export function uniteDxf(unitesParMetre) {
  const u = Number(unitesParMetre) > 0 ? Number(unitesParMetre) : 1
  let meilleure = UNITES[0]
  for (const unite of UNITES) {
    if (Math.abs(Math.log(u / unite[0])) < Math.abs(Math.log(u / meilleure[0]))) meilleure = unite
  }
  return { unitesParMetre: u, insunits: meilleure[1], nom: meilleure[2], exacte: Math.abs(u - meilleure[0]) < 1e-9 }
}

/** Nom de bloc d'un type : ASCII, majuscules, « - » → « _ ». */
export const nomBloc = (code) => `EDL_${String(code).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`

// Caractères refusés dans un nom de calque par AutoCAD et ArchiCAD
const INTERDITS = /[<>/\\":;?*|=,`]/

/**
 * Nom de calque d'origine rendu acceptable : 31 caractères au plus,
 * caractères interdits (et ceux que Windows-1252 n'a pas, qui deviendraient
 * « ? », lui-même interdit) remplacés par « _ ».
 */
export function nomCalqueValide(nom) {
  const remplace = [...String(nom ?? '')]
    .map((c) => (c.codePointAt(0) < 32 || INTERDITS.test(c) || !dansCp1252(c) ? '_' : c))
    .join('')
    .trim()
  return [...remplace].slice(0, 31).join('').trim() || 'SANS_NOM'
}

/** Texte d'une ligne de TEXT : ni retour à la ligne ni caractère de contrôle. */
export function texteDxf(brut) {
  // Un saut de ligne dans une valeur décalerait toutes les paires code / valeur qui suivent
  const sansControle = [...String(brut ?? '')].map((c) => {
    const code = c.codePointAt(0)
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : c
  }).join('')
  const t = sansControle.replace(/\s+/g, ' ').trim()
  return t.length > LONGUEUR_TEXTE_MAX ? `${t.slice(0, LONGUEUR_TEXTE_MAX - 1)}…` : t
}

/**
 * « %% » ouvre un code dans un TEXT (%%d = °, %%c = Ø…) : un « 100%%d »
 * dicté s'afficherait « 100° ». Dans une suite d'au moins deux « % »,
 * chacun s'écrit « %%% » (le pourcent littéral du DXF) ; un « % » isolé
 * n'est pas un code et reste tel quel, lisible par tout lecteur.
 */
export const echapperPourcent = (texte) => String(texte).replace(/%{2,}/g, (suite) => '%%%'.repeat(suite.length))

/** Coupe un texte en lignes d'au plus `max` caractères, aux espaces. */
export function couperLignes(brut, max = CARACTERES_PAR_LIGNE) {
  const lignes = []
  let courante = ''
  for (const mot of texteDxf(brut).split(' ').filter(Boolean)) {
    let reste = mot
    while (reste.length > max) {
      if (courante) { lignes.push(courante); courante = '' }
      lignes.push(reste.slice(0, max))
      reste = reste.slice(max)
    }
    if (!courante) courante = reste
    else if (courante.length + 1 + reste.length <= max) courante += ` ${reste}`
    else { lignes.push(courante); courante = reste }
  }
  if (courante) lignes.push(courante)
  return lignes
}

const decimales = (v, n) => String(Math.round(v * 10 ** n) / 10 ** n).replace('.', ',')

/** « 12,5 m² » : surface écrite sur le plan, sinon dessinée. */
export function texteSurface(piece) {
  const lue = Number(piece?.surface_lue)
  const surface = lue > 0 ? lue : (Array.isArray(piece?.contour) && piece.contour.length >= 3 ? aire(piece.contour) : 0)
  return surface > 0 ? `${decimales(surface, 2)} m²` : null
}

/**
 * « HSP 2,50 m » : lue sur le plan, sinon dite en visite si la fiche part
 * (règle et format communs avec le rapport, `hspExport`).
 */
export function texteHsp(piece, { inclurePropositions = true } = {}) {
  const hsp = hspExport(piece, { inclurePropositions })
  const texte = hsp ? texteDxf(hsp.texte) : ''
  return texte ? `HSP ${texte}` : null
}

// ─── Écriture R12 ───────────────────────────────────────────────────────────

const nb = (v) => {
  const r = Math.round(v * 1e6) / 1e6 || 0
  const s = String(r)
  return /[.e]/.test(s) ? s : `${s}.0`
}
const entier = (v) => String(Math.round(v)).padStart(6, ' ')

// Codes de groupe sur trois caractères, alignés à droite, comme AutoCAD
function ecrivain() {
  const lignes = []
  const g = (code, valeur) => { lignes.push(String(code).padStart(3, ' '), String(valeur)) }
  const point = (base, [x, y]) => { g(base, nb(x)); g(base + 10, nb(y)); g(base + 20, '0.0') }

  return {
    lignes,
    g,
    ligne(calque, a, b) {
      g(0, 'LINE'); g(8, calque); point(10, a); point(11, b)
    },
    polyligne(calque, pts, ferme) {
      g(0, 'POLYLINE'); g(8, calque); g(66, entier(1)); point(10, [0, 0]); g(70, entier(ferme ? 1 : 0))
      for (const p of pts) { g(0, 'VERTEX'); g(8, calque); point(10, p) }
      g(0, 'SEQEND'); g(8, calque)
    },
    cercle(calque, c, r) {
      g(0, 'CIRCLE'); g(8, calque); point(10, c); g(40, nb(r))
    },
    arc(calque, c, r, debut, fin) {
      g(0, 'ARC'); g(8, calque); point(10, c); g(40, nb(r)); g(50, nb(debut)); g(51, nb(fin))
    },
    // h : 0 gauche, 1 centre, 2 droite ; v : 0 ligne de base, 2 milieu.
    // Aligné, le point qui compte est 11/21 ; 10/20 reçoit le même, AutoCAD
    // le recalcule à l'ouverture.
    texte(calque, pos, hauteur, valeur, { rotation = 0, h = 0, v = 0 } = {}) {
      g(0, 'TEXT'); g(8, calque); point(10, pos); g(40, nb(hauteur)); g(1, echapperPourcent(valeur))
      if (Math.abs(rotation) > 1e-9) g(50, nb(rotation))
      if (h) g(72, entier(h))
      if (h || v) point(11, pos)
      if (v) g(73, entier(v))
    },
    insert(calque, nom, pos, rotation) {
      g(0, 'INSERT'); g(8, calque); g(2, nom); point(10, pos)
      g(41, '1.0'); g(42, '1.0'); g(43, '1.0')
      if (Math.abs(rotation) > 1e-9) g(50, nb(rotation))
    },
  }
}

// Primitives d'un symbole (mètres) écrites dans l'unité du fichier
function ecrirePrimitives(w, calque, primitives, u) {
  const s = ([x, y]) => [x * u, y * u]
  for (const p of primitives) {
    if (p.ligne) w.ligne(calque, s(p.ligne[0]), s(p.ligne[1]))
    else if (p.polyligne) w.polyligne(calque, p.polyligne.map(s), p.ferme)
    else if (p.cercle) w.cercle(calque, s(p.cercle), p.cercle[2] * u)
    else if (p.arc) w.arc(calque, s(p.arc), p.arc[2] * u, p.arc[3], p.arc[4])
    else if (p.texte) w.texte(calque, s(p.pos), p.hauteur * u, texteDxf(p.texte), { rotation: p.rotation ?? 0, h: 1, v: 2 })
  }
}

// Gardé ici pour les appelants d'avant : le placement des textes en a besoin aussi
export { pointInterieur }

// ─── Textes d'un étage et leur place ────────────────────────────────────────

const aUnPoint = (e) => e.x !== null && e.x !== undefined && e.y !== null && e.y !== undefined

/** Calque d'un texte d'élément : le sien, ou « À valider » pour une proposition. */
const calqueElement = (code, aValider) => (aValider ? CALQUE_A_VALIDER : calqueEdl(code).nom)

const libelleElement = (e) => texteDxf(e.libelle) || typeEdl(e.type)?.libelle || calqueEdl(e.calque).libelle

/**
 * Ce qui s'écrit sur un étage, et où (`placerEtiquettes`) : le cadre de
 * chaque pièce et ses lignes, puis, point par point (pièce, puis numéro),
 * symboles, libellé et repère photo. Positions en mètres du plan. Exporté
 * pour les tests (aucun texte sur un autre).
 *
 * @returns {
 *   cadres: [{ piece, coins, lignes [{ texte, calque, hauteur, pos }], echelle, dedans, angle }],
 *   reperes: [{ cle, origine, angle, groupe, emplacements, symbole, calqueRappel,
 *     libelle: { lignes, coins, rappel } | null,
 *     photo: { centre, lignes, coins, rappel } | null }],
 * }
 */
export function etiquettesEtage({ pieces = [], elementsExport = [], photos = [], points = [], inclurePropositions = false } = {}) {
  const NOM_PIECES = calqueEdl('pieces').nom
  const NOM_FINITIONS = calqueEdl('finitions').nom
  const NOM_COTES = calqueEdl('cotes').nom
  const NOM_PHOTOS = calqueEdl('photos').nom
  const parId = new Map(pieces.map((p) => [p.id, p]))
  const angleDe = (pieceId) => {
    const piece = pieceId ? parId.get(pieceId) : null
    return piece && Array.isArray(piece.contour) ? orientationPiece(piece.contour) : 0
  }

  // ── Cadres : ce que dit chaque pièce ──
  const sansPoint = new Map()
  for (const e of elementsExport) {
    if (aUnPoint(e) || !e.pieceId || !parId.has(e.pieceId)) continue
    if (!sansPoint.has(e.pieceId)) sansPoint.set(e.pieceId, [])
    sansPoint.get(e.pieceId).push(e)
  }
  const avecContour = pieces.filter(contourValide)
  const cadres = avecContour.map((piece) => {
    const fiche = ficheExportee(piece, { inclurePropositions })
    const calqueFiche = piece.fiche_a_valider ? CALQUE_A_VALIDER : NOM_FINITIONS
    const lignes = []
    const ajouter = (texte, calque, hauteur = HAUTEUR_TEXTE, max = CARACTERES_CADRE) => {
      for (const l of couperLignes(texte, max)) lignes.push({ texte: l, calque, hauteur })
    }
    const nom = texteDxf(piece.nom)
    const numero = texteDxf(piece.numero)
    ajouter(numero ? `${nom || 'Pièce'} (${numero})` : nom || 'Pièce', NOM_PIECES, HAUTEUR_NOM, CARACTERES_NOM)
    const surface = texteSurface(piece)
    if (surface) ajouter(surface, NOM_PIECES)
    const hsp = texteHsp(piece, { inclurePropositions })
    // Dite dans une fiche proposée : sur « À valider », comme ses finitions
    const hspDeLaFiche = !!hsp && !hspExport(piece, { inclurePropositions })?.lue && !!piece.fiche_a_valider
    if (hsp) ajouter(hsp, hspDeLaFiche ? CALQUE_A_VALIDER : NOM_PIECES)
    if (fiche) {
      for (const [cle, libelle] of RUBRIQUES) {
        const valeur = texteDxf(fiche[cle])
        if (valeur) ajouter(`${libelle} : ${valeur}`, calqueFiche)
      }
    }
    for (const e of sansPoint.get(piece.id) ?? []) {
      ajouter(libelleElement(e), calqueElement(e.calque, e.aValider))
      if (texteDxf(e.cotes)) ajouter(e.cotes, e.aValider ? CALQUE_A_VALIDER : NOM_COTES)
    }
    return { id: piece.id, piece, contour: piece.contour, angle: orientationPiece(piece.contour), lignes }
  })

  // ── Repères : un par point (symboles et libellés), photos comprises ──
  // Plusieurs éléments sur un même point (« un élément par chose dite » :
  // une fenêtre et son volet sur P3) : un symbole par type, côte à côte le
  // long de la pièce (`decalagesSymboles`, même règle que le plan du
  // rapport), et leurs libellés empilés en un seul bloc.
  const reperes = new Map()
  for (const e of elementsExport) {
    if (!aUnPoint(e)) continue
    const cle = e.pointId ?? `${Number(e.x)} ${Number(e.y)}`
    if (!reperes.has(cle)) reperes.set(cle, { cle, pieceId: e.pieceId, numero: e.numero, origine: [Number(e.x), Number(e.y)], groupe: [] })
    reperes.get(cle).groupe.push(e)
  }
  for (const r of reperes.values()) {
    r.angle = angleDe(r.pieceId)
    const { emplacements, boite } = decalagesSymboles(r.groupe.map((e) => e.type))
    r.emplacements = emplacements
    r.symbole = boite
    r.lignes = []
    for (const e of r.groupe) {
      const calque = calqueElement(e.calque, e.aValider)
      const titre = e.numero !== null && e.numero !== undefined ? `P${e.numero} · ${libelleElement(e)}` : libelleElement(e)
      for (const t of couperLignes(titre, CARACTERES_CADRE)) r.lignes.push({ texte: t, calque, hauteur: HAUTEUR_TEXTE })
      for (const t of couperLignes(e.cotes, CARACTERES_CADRE)) r.lignes.push({ texte: t, calque: e.aValider ? CALQUE_A_VALIDER : NOM_COTES, hauteur: HAUTEUR_TEXTE })
    }
    r.calqueRappel = calqueElement(r.groupe[0].calque, r.groupe[0].aValider)
  }

  // Photos : un repère par point, « Ph 3, 4 »
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const photosParPoint = new Map()
  photos.forEach((ph, i) => {
    if (!ph?.point_id) return
    if (!photosParPoint.has(ph.point_id)) photosParPoint.set(ph.point_id, [])
    photosParPoint.get(ph.point_id).push(ph.numero ?? i + 1)
  })
  for (const [pointId, numeros] of photosParPoint) {
    let r = reperes.get(pointId)
    if (!r) {
      const point = pointsParId.get(pointId)
      const origine = point ? [Number(point.x), Number(point.y)] : null
      if (!origine || !origine.every(Number.isFinite)) continue
      const pieceId = pieceDuPoint(point, pieces)
      r = { cle: pointId, pieceId, numero: point.numero ?? null, origine, angle: angleDe(pieceId), groupe: [], emplacements: [], symbole: null, lignes: [] }
      reperes.set(pointId, r)
    }
    const centre = r.symbole ? [r.symbole.xmin - RAYON_PHOTO, r.symbole.ymax + RAYON_PHOTO] : [0, 0]
    r.photo = {
      centre,
      ancre: { xmin: centre[0] - RAYON_PHOTO, ymin: centre[1] - RAYON_PHOTO, xmax: centre[0] + RAYON_PHOTO, ymax: centre[1] + RAYON_PHOTO },
      lignes: couperLignes(`Ph ${numeros.join(', ')}`, CARACTERES_CADRE).map((t) => ({ texte: t, calque: NOM_PHOTOS, hauteur: HAUTEUR_TEXTE })),
    }
  }

  // Ordre stable (pièce, puis numéro du point) : il décide des places
  const rang = new Map(avecContour.map((p, i) => [p.id, i]))
  const ordre = [...reperes.values()].sort((a, b) => (rang.get(a.pieceId) ?? Infinity) - (rang.get(b.pieceId) ?? Infinity)
    || (a.numero ?? Infinity) - (b.numero ?? Infinity)
    || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0))

  const places = placerEtiquettes({ cadres, reperes: ordre })
  return {
    cadres: cadres.map((c, i) => ({ ...places.cadres[i], piece: c.piece })),
    reperes: ordre.map((r, i) => {
      const p = places.reperes[i]
      return {
        ...r,
        libelle: p.libelle,
        photo: r.photo ? { ...r.photo, ...(p.photo ?? { lignes: [], coins: null, rappel: null }) } : null,
      }
    }),
  }
}

// ─── Fichier ────────────────────────────────────────────────────────────────

/**
 * DXF R12 d'un étage, en texte (fins de ligne CRLF) ; `encoderDxf` en fait
 * les octets à enregistrer.
 *
 * @param niveau        ligne `edl_niveaux` (unité de repli : `unites_par_metre`)
 * @param pieces        lignes `edl_pieces` de l'étage (contour en mètres, fiche)
 * @param elementsExport sortie d'`elementsAExporter`
 * @param photos        [{ point_id, numero? }] — numérotées dans l'ordre reçu
 *                      si `numero` manque (« Ph n »)
 * @param points        lignes `edl_points` (position des photos d'un point
 *                      sans élément exporté)
 * @param unitesParMetre unité du plan d'origine (1 m, 100 cm, 1000 mm)
 * @param plan          plan allégé décodé (`decoderVecteurs`) ou null
 * @param inclurePropositions fiche pas encore relue (`fiche_a_valider`) :
 *                      ses finitions sur `EDL-À valider` si vrai, omises sinon
 */
export function genererDxfEdl({
  niveau = null, pieces = [], elementsExport = [], photos = [], points = [],
  unitesParMetre, plan = null, inclurePropositions = false,
} = {}) {
  const { unitesParMetre: u, insunits } = uniteDxf(unitesParMetre ?? niveau?.unites_par_metre)
  const w = ecrivain()
  const calquesUtilises = new Set()
  const typesUtilises = new Set()
  const etendue = [Infinity, Infinity, -Infinity, -Infinity]
  // Tout passe par là : coordonnées converties et étendue tenue à jour
  const enUnites = ([x, y]) => {
    const p = [x * u, y * u]
    if (p[0] < etendue[0]) etendue[0] = p[0]
    if (p[1] < etendue[1]) etendue[1] = p[1]
    if (p[0] > etendue[2]) etendue[2] = p[0]
    if (p[1] > etendue[3]) etendue[3] = p[1]
    return p
  }
  const utiliser = (nom) => { calquesUtilises.add(nom); return nom }
  const nomCalque = (code, aValider) => utiliser(calqueElement(code, aValider))

  // ── Plan existant, en dessous de tout ──
  // Limite connue : le fichier vectoriel allégé ne garde des textes que leur
  // point, leur hauteur et leur contenu — ni rotation ni alignement. Dans
  // `…-avec-plan.dxf`, les textes du plan existant sont donc écrits droits,
  // calés à gauche sur ce point ; le DXF d'origine reste la référence.
  const calquesPlan = new Map()
  if (plan) {
    const pris = new Set([...CALQUES.map((c) => c.nom), CALQUE_A_VALIDER].map((n) => n.toUpperCase()))
    const calqueDuPlan = (nom) => {
      if (calquesPlan.has(nom)) return calquesPlan.get(nom)
      const base = nomCalqueValide(nom)
      let valide = base
      // AutoCAD ne distingue pas la casse : « Murs » et « MURS » seraient un seul calque
      for (let i = 2; pris.has(valide.toUpperCase()) && valide !== '0'; i++) valide = `${[...base].slice(0, 31 - String(i).length - 1).join('')}_${i}`
      if (valide !== '0') pris.add(valide.toUpperCase())
      calquesPlan.set(nom, valide)
      return valide
    }
    for (const t of plan.traits ?? []) {
      if (!t.pts || t.pts.length < 2) continue
      const calque = calqueDuPlan(t.calque)
      const pts = t.pts.map(enUnites)
      if (pts.length === 2 && !t.ferme) w.ligne(calque, pts[0], pts[1])
      else w.polyligne(calque, pts, !!t.ferme)
    }
    for (const m of plan.masses ?? []) {
      for (const anneau of m.anneaux ?? []) {
        if (anneau.length >= 3) w.polyligne(calqueDuPlan(m.calque), anneau.map(enUnites), true)
      }
    }
    for (const t of plan.textes ?? []) {
      const hauteur = Number(t.hauteur) > 0 ? Number(t.hauteur) : HAUTEUR_TEXTE
      String(t.texte ?? '').split('\n').map(texteDxf).forEach((ligne, i) => {
        if (ligne) w.texte(calqueDuPlan(t.calque), enUnites([t.pos[0], t.pos[1] - i * hauteur * 1.4]), hauteur * u, ligne)
      })
    }
  }

  // ── Pièces : contour, cadre et ses textes ──
  const mise = etiquettesEtage({ pieces, elementsExport, photos, points, inclurePropositions })
  const NOM_PIECES = calqueEdl('pieces').nom
  const NOM_PHOTOS = calqueEdl('photos').nom
  for (const c of mise.cadres) {
    w.polyligne(utiliser(NOM_PIECES), c.piece.contour.map(enUnites), true)
    w.polyligne(NOM_PIECES, c.coins.map(enUnites), true)
    for (const l of c.lignes) w.texte(utiliser(l.calque), enUnites(l.pos), l.hauteur * u, l.texte, { rotation: c.angle, h: 1, v: 2 })
  }

  // ── Éléments placés : symboles, libellés, cotes ──
  for (const r of mise.reperes) {
    if (!r.groupe.length) continue
    const place = repere(r.origine, r.angle).versPlan
    // Un emplacement par type ; le symbole va sur le calque de l'élément
    // validé s'il y en a un, sur « À valider » si tous sont des propositions
    for (const em of r.emplacements) {
      const duType = r.groupe.filter((e) => (e.type && SYMBOLES[e.type] ? e.type : null) === em.type)
      const element = duType.find((e) => !e.aValider) ?? duType[0]
      const { dx, boite: b } = em
      const calque = nomCalque(element.calque, element.aValider)
      if (em.type) {
        typesUtilises.add(em.type)
        // L'étendue suit la boîte tournée du symbole, pas seulement son point
        for (const coin of [[b.xmin, b.ymin], [b.xmax, b.ymax], [b.xmin, b.ymax], [b.xmax, b.ymin]]) enUnites(place([dx + coin[0], coin[1]]))
        w.insert(calque, nomBloc(em.type), enUnites(place([dx, 0])), r.angle)
      } else {
        // Sans type (désordre non classé…) : un petit rond suffit à le situer
        w.cercle(calque, enUnites(place([dx, 0])), RAYON_SANS_SYMBOLE * u)
      }
    }
    if (!r.libelle) continue
    for (const l of r.libelle.lignes) w.texte(utiliser(l.calque), enUnites(l.pos), l.hauteur * u, l.texte, { rotation: r.angle, v: 2 })
    if (r.libelle.rappel) w.ligne(utiliser(r.calqueRappel), enUnites(r.libelle.rappel[0]), enUnites(r.libelle.rappel[1]))
  }

  // ── Photos : un repère par point, « Ph 3, 4 » ──
  for (const r of mise.reperes) {
    if (!r.photo) continue
    const place = repere(r.origine, r.angle).versPlan
    w.cercle(utiliser(NOM_PHOTOS), enUnites(place(r.photo.centre)), RAYON_PHOTO * u)
    for (const l of r.photo.lignes) w.texte(NOM_PHOTOS, enUnites(l.pos), l.hauteur * u, l.texte, { rotation: r.angle, v: 2 })
    if (r.photo.rappel) w.ligne(NOM_PHOTOS, enUnites(r.photo.rappel[0]), enUnites(r.photo.rappel[1]))
  }

  // ── Assemblage : en-tête, tables, blocs, entités ──
  const f = ecrivain()
  const { g } = f
  const vide = !Number.isFinite(etendue[0])
  const min = vide ? [0, 0] : [etendue[0], etendue[1]]
  const max = vide ? [0, 0] : [etendue[2], etendue[3]]

  g(0, 'SECTION'); g(2, 'HEADER')
  g(9, '$ACADVER'); g(1, 'AC1009')
  g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252')
  g(9, '$INSBASE'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0')
  g(9, '$EXTMIN'); g(10, nb(min[0])); g(20, nb(min[1])); g(30, '0.0')
  g(9, '$EXTMAX'); g(10, nb(max[0])); g(20, nb(max[1])); g(30, '0.0')
  g(9, '$INSUNITS'); g(70, entier(insunits))
  g(0, 'ENDSEC')

  // Calques dans l'ordre de `calquesEdl.js`, puis « À valider », puis ceux du plan
  const calquesEdl = CALQUES.map((c) => ({ nom: c.nom, couleur: COULEURS[c.code] ?? 7 })).filter((c) => calquesUtilises.has(c.nom))
  if (calquesUtilises.has(CALQUE_A_VALIDER)) calquesEdl.push({ nom: CALQUE_A_VALIDER, couleur: COULEUR_A_VALIDER })
  const calquesOrigine = [...new Set(calquesPlan.values())].filter((n) => n !== '0').map((nom) => ({ nom, couleur: COULEUR_PLAN }))
  const tousCalques = [{ nom: '0', couleur: 7 }, ...calquesEdl, ...calquesOrigine]

  g(0, 'SECTION'); g(2, 'TABLES')
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, entier(1))
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, entier(0)); g(3, 'Solid line'); g(72, entier(65)); g(73, entier(0)); g(40, '0.0')
  g(0, 'ENDTAB')
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, entier(tousCalques.length))
  for (const c of tousCalques) { g(0, 'LAYER'); g(2, c.nom); g(70, entier(0)); g(62, entier(c.couleur)); g(6, 'CONTINUOUS') }
  g(0, 'ENDTAB')
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, entier(1))
  g(0, 'STYLE'); g(2, 'STANDARD'); g(70, entier(0)); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, entier(0)); g(42, nb(HAUTEUR_TEXTE * u)); g(3, 'txt'); g(4, '')
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')

  // Symboles en blocs, sur le calque 0 : ils prennent le calque (et la
  // couleur) de leur insertion
  g(0, 'SECTION'); g(2, 'BLOCKS')
  for (const code of Object.keys(SYMBOLES).filter((c) => typesUtilises.has(c))) {
    const nom = nomBloc(code)
    g(0, 'BLOCK'); g(8, '0'); g(2, nom); g(70, entier(0)); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(3, nom)
    ecrirePrimitives(f, '0', SYMBOLES[code].primitives, u)
    g(0, 'ENDBLK'); g(8, '0')
  }
  g(0, 'ENDSEC')

  g(0, 'SECTION'); g(2, 'ENTITIES')
  // Pas de `push(...w.lignes)` : étalées en arguments, les centaines de
  // milliers de lignes d'un grand plan dépassent la pile (RangeError dès
  // ~3 000 traits), et l'aperçu comme le ZIP tombaient
  for (const l of w.lignes) f.lignes.push(l)
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return `${f.lignes.join('\r\n')}\r\n`
}

/** Octets du fichier, en Windows-1252 (caractère hors table → « ? »). */
export const encoderDxf = (texte) => encoderCp1252(texte)
