// ─── Mise en page d'une planche A3 « report relevé » ─────────────────────────
//
// Une planche par étage, comme l'exemple de l'agence (2026-11-19) : plan
// existant au 1/100 (1/200 et au-delà s'il ne tient pas), symboles seuls,
// légende encadrée des symboles utilisés, cartouche de l'agence. Tout ce qui
// est sur la planche se décide ici : le dessin du PDF et le Word lisent la
// même mise, ce qui se voit dans l'un est ce qui part dans l'autre.
//
// Pur, sans DOM, sortie en données simples (sérialisable) : millimètres du
// papier, y vers le bas. Testé (tests/etat-des-lieux-export-planche.test.js).

import { CALQUES, calqueEdl, typeEdl } from '../calquesEdl.js'
import { boite } from '../geometrieEdl.js'
import { MARGE_PLAN_M } from './planRapportEdl.js'
import { COULEUR_PROPOSITION, couleurCalque, dateIso, elementsDeLEtage, texteLatin } from './rapportEdlLogique.js'
import { RAYON_SANS_SYMBOLE, SYMBOLES, boitePrimitives, boiteSymbole, emplacementsDuPoint, largeurTexte, primitivesPlacees, quantiteElement, tailleSymboleMm as tailleDuTableau } from './symbolesEdl.js'
import { COULEUR_TRAIT_COTE, courbeCommande, placerValeurCote, sensInterieurCote, traitsCote } from '../visite/tracesVisiteLogique.js'

export const FORMAT_A3 = { nom: 'A3', largeur: 420, hauteur: 297 }
export const MARGE_PLANCHE = 8
export const HAUTEUR_CARTOUCHE = 24
export const ECHELLES = [100, 200, 250, 500, 1000]
// Un symbole à taille fixe garde la même taille imprimée à toutes les
// échelles (au 1/500, ses 0,30 m ne feraient plus que 0,6 mm) : celle de
// `TAILLES_SYMBOLE_MM` (symbolesEdl.js), relevée sur l'exemple de l'agence
// Élément sans type : un losange de quoi le situer
export const TAILLE_SANS_TYPE_MM = 3
export const DPI_PLANCHE = 200

// Légende (estimations en mm, que le dessin reprend)
export const LEGENDE = {
  largeur: 150, colonnes: 2, entree: 5, titre: 9, note: 7, texteTitre: 3.5,
  // Au-delà, deux colonnes : une légende courte reste étroite
  lignesUneColonne: 6,
}

// Liaisons et cotes (084), sur le papier (mm) : ligne de cote à 6 mm du mur
// dans la pièce, lignes d'attache à 1 mm de l'angle, obliques de 2 mm,
// valeur de 2,2 mm posée 0,8 mm au-dessus de la ligne, glissée par pas de
// 5 mm le long de la ligne si elle couvre un symbole
export const COTE_PLANCHE = { tic: 2, decalage: 0.8, police: 2.2, ecart: 6, jeu: 1, pas: 5 }
// Hauteur des capitales de la valeur, à peu près
const CAPITALES = 0.75

const COINS = ['haut-droite', 'haut-gauche', 'bas-droite', 'bas-gauche']

const arrondiMm = (v) => Math.round(v * 1000) / 1000 || 0
const rempli = (v) => texteLatin(v).trim()

// ─── Repère du papier ───────────────────────────────────────────────────────

/** Mètres du plan (y vers le haut) → millimètres du papier (y vers le bas). */
export function versMmPlanche(transform, [x, y]) {
  const { mmParMetre, origineM, origineMm } = transform
  return [origineMm[0] + (x - origineM[0]) * mmParMetre, origineMm[1] - (y - origineM[1]) * mmParMetre]
}

const boiteValide = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] >= b[0] && b[3] >= b[1]

// `boiteVecteurs` : [x0, y0, x1, y1] (fichier vectoriel) ou { x0, y0, x1, y1 } (cadrage)
function lireBoite(b) {
  if (!b) return null
  const t = Array.isArray(b) ? b : [b.x0 ?? b.xmin, b.y0 ?? b.ymin, b.x1 ?? b.xmax, b.y1 ?? b.ymax]
  return boiteValide(t) ? t : null
}

const contourValide = (c) => Array.isArray(c) && c.length >= 3 && c.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))

/**
 * Emprise du dessin (mètres) : les pièces, à défaut le plan vectoriel, étendue
 * à tout ce qui est relevé (éléments posés, repères hors pièces : façade,
 * cour) — un relevé hors du cadre serait dans le DXF sans se voir sur la
 * planche ; la marge laisse voir la façade.
 */
function empriseM(pieces, boiteVecteurs, positions) {
  const pts = pieces.filter((p) => contourValide(p.contour)).flatMap((p) => p.contour)
  const base = pts.length ? boite(pts) : lireBoite(boiteVecteurs)
  const b = base ? boite([[base[0], base[1]], [base[2], base[3]], ...positions]) : (positions.length ? boite(positions) : null)
  if (!b) return null
  return [b[0] - MARGE_PLAN_M, b[1] - MARGE_PLAN_M, b[2] + MARGE_PLAN_M, b[3] + MARGE_PLAN_M]
}

/** Première échelle de `ECHELLES` où l'emprise tient dans la zone (la dernière sinon). */
export function echellePlanche(emprise, zone) {
  if (!emprise) return ECHELLES[0]
  const l = emprise[2] - emprise[0]
  const h = emprise[3] - emprise[1]
  return ECHELLES.find((e) => (l * 1000) / e <= zone.largeur + 1e-9 && (h * 1000) / e <= zone.hauteur + 1e-9) ?? ECHELLES[ECHELLES.length - 1]
}

// ─── Symboles ───────────────────────────────────────────────────────────────

// Taille papier d'un symbole : un à taille fixe a sa taille du tableau
// (`tailleDuTableau`) pour le plus grand côté de sa boîte non tournée, un à
// taille réelle suit l'échelle
function mmParMetreSymbole(code, mmParMetre) {
  const s = SYMBOLES[code]
  if (!s) return null
  if (s.taille === 'reelle') return mmParMetre
  const b = boiteSymbole(code)
  return tailleDuTableau(code) / Math.max(b.largeur, b.hauteur)
}

/** Boîte papier d'un symbole tourné, et place du point d'insertion dans la boîte. */
function tailleSymboleMm(code, angle, mmParMetre) {
  const f = mmParMetreSymbole(code, mmParMetre)
  if (!f) return { largeur: TAILLE_SANS_TYPE_MM, hauteur: TAILLE_SANS_TYPE_MM, ancre: [TAILLE_SANS_TYPE_MM / 2, TAILLE_SANS_TYPE_MM / 2] }
  const b = boitePrimitives(primitivesPlacees(code, { angle }))
  // y du plan vers le haut, du papier vers le bas : le haut de la boîte est ymax
  return { largeur: arrondiMm(b.largeur * f), hauteur: arrondiMm(b.hauteur * f), ancre: [arrondiMm(-b.xmin * f), arrondiMm(b.ymax * f)] }
}

const angleCle = (angle) => {
  const r = Math.round(angle / 5) * 5
  return ((r % 360) + 360) % 360
}

function symbolesPlanche(elements, pieces, transform) {
  const parId = new Map(pieces.map((p) => [p.id, p]))
  const { mmParMetre } = transform
  // Agrandissement des symboles en mètres du plan, pour que les décalages
  // d'un même point se comptent sur les symboles tels qu'imprimés
  const echelle = (type) => {
    const f = type ? mmParMetreSymbole(type, mmParMetre) : TAILLE_SANS_TYPE_MM / (2 * RAYON_SANS_SYMBOLE)
    return f / mmParMetre
  }
  const groupes = new Map()
  for (const e of elements) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue
    const cle = e.pointId ?? `${e.x}|${e.y}`
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle).push(e)
  }
  const symboles = []
  for (const groupe of groupes.values()) {
    const premier = groupe[0]
    const { anglePiece, emplacements } = emplacementsDuPoint(groupe, parId, { echelle })
    const a = (anglePiece * Math.PI) / 180
    for (const em of emplacements) {
      // Un symbole par type et par point, comme le DXF : celui de l'élément
      // validé s'il y en a un ; les éléments du même avis se cumulent (deux
      // prises dites au même point font « ×2 »)
      const duType = groupe.filter((e) => (e.type && SYMBOLES[e.type] ? e.type : null) === em.type)
      const element = duType.find((e) => !e.aValider) ?? duType[0]
      const memeAvis = duType.filter((e) => !!e.aValider === !!element.aValider)
      const quantite = memeAvis.reduce((s, e) => s + quantiteElement(e), 0)
      const [xMm, yMm] = versMmPlanche(transform, [premier.x + em.dx * Math.cos(a), premier.y + em.dx * Math.sin(a)])
      const code = em.type
      const angle = Math.round(em.angle * 1e6) / 1e6 || 0
      const aValider = !!element.aValider
      symboles.push({
        cle: `${code}|${angleCle(angle)}|${quantite}|${aValider ? 1 : 0}`,
        elementId: element.id,
        elementIds: memeAvis.map((e) => e.id),
        code,
        calque: element.calque,
        nom: texteLatin(typeEdl(code)?.libelle ?? calqueEdl(element.calque)?.libelle ?? ''),
        xMm: arrondiMm(xMm),
        yMm: arrondiMm(yMm),
        angle,
        quantite,
        aValider,
        couleur: couleurCalque(element.calque),
        tailleMm: tailleSymboleMm(code, angle, mmParMetre),
      })
    }
  }
  return symboles
}

// ─── Liaisons et cotes ──────────────────────────────────────────────────────

/**
 * Les traces de l'étage (`tracesAExporter`) en millimètres du papier. La
 * courbe d'une liaison est calculée en mètres (`courbeCommande` : même flèche
 * et même côté qu'à l'écran et dans le DXF) puis portée sur le papier — une
 * transformation affine garde la courbe de Bézier. La cote est calculée sur
 * le papier (`traitsCote`, y vers le bas : texte jamais à l'envers), décalée
 * du côté intérieur de sa pièce (`sensInterieurCote`, décidé en mètres) ; sa
 * valeur évite les symboles (`obstacles`, boîtes papier) et les valeurs
 * déjà posées (`placerValeurCote`).
 */
function tracesPlanche(traces, transform, pieces = [], obstacles = []) {
  const mm = (p) => versMmPlanche(transform, p).map(arrondiMm)
  const contours = new Map(pieces.map((p) => [p.id, p.contour]))
  const gene = [...obstacles]
  const sortie = []
  for (const t of traces) {
    if (t.sorte === 'commande') {
      const c = courbeCommande(t.a, t.b)
      if (!c) continue
      sortie.push({
        id: t.id, sorte: 'commande', aValider: !!t.aValider, couleur: t.aValider ? COULEUR_PROPOSITION : couleurCalque('electricite'),
        a: mm(c.a), controle: mm(c.controle), b: mm(c.b), sommet: mm(c.sommet),
      })
      continue
    }
    const sens = sensInterieurCote(t.a, t.b, contours.get(t.pieceId))
    const coins = [mm(t.a), mm(t.b)]
    const { tic, decalage, police, ecart, jeu, pas } = COTE_PLANCHE
    const c = traitsCote(coins[0], coins[1], { tic, decalage, yVersLeBas: true, sens, ecart, jeu, hauteurTexte: police * CAPITALES })
    if (!c) continue
    const valeur = texteLatin(t.valeur ?? '').trim() || '?'
    const place = placerValeurCote(c, { largeur: largeurTexte(valeur, police), hauteur: police, obstacles: gene, pas, yVersLeBas: true })
    gene.push(boiteDePoints(place.coins))
    const enMm = (p) => p.map(arrondiMm)
    sortie.push({
      id: t.id, sorte: 'cote', aValider: !!t.aValider, couleur: t.aValider ? COULEUR_PROPOSITION : COULEUR_TRAIT_COTE,
      coins, a: enMm(c.ligne[0]), b: enMm(c.ligne[1]),
      attaches: c.attaches.map((o) => o.map(enMm)),
      obliques: c.obliques.map((o) => o.map(enMm)),
      texte: { valeur, position: enMm(place.position), angle: arrondiMm(c.texte.angle), coins: place.coins.map(enMm) },
    })
  }
  return sortie
}

const boiteDePoints = (pts) => ({
  xmin: Math.min(...pts.map((p) => p[0])), xmax: Math.max(...pts.map((p) => p[0])),
  ymin: Math.min(...pts.map((p) => p[1])), ymax: Math.max(...pts.map((p) => p[1])),
})

// Boîte papier d'une trace : obstacle pour la légende
function boiteTrace(t) {
  const pts = t.sorte === 'commande' ? [t.a, t.b, t.sommet] : [...t.coins, t.a, t.b, ...t.texte.coins]
  const [x0, y0, x1, y1] = boite(pts)
  return { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 }
}

// ─── Légende ────────────────────────────────────────────────────────────────

// La RJ45 compte aussi par ×n : la mention ne dit pas « prises » pour elle
const MULTIPLE = { prise: ' (×n : nb de prises)', rj45: ' (×n : nombre)' }

// Une trace s'explique dans le groupe de son calque, seulement si la planche en porte
const ENTREES_TRACES = {
  electricite: { sorte: 'commande', entree: { code: null, libelle: 'Commande d’éclairage', trace: 'commande' } },
  cotes: { sorte: 'cote', entree: { code: null, libelle: 'Cote', trace: 'cote' } },
}
const COULEURS_GROUPE = { cotes: COULEUR_TRAIT_COTE }

function groupesLegende(symboles, traces = []) {
  const groupes = []
  for (const c of CALQUES) {
    const siens = symboles.filter((s) => s.calque === c.code)
    const parTrace = ENTREES_TRACES[c.code]
    const avecTrace = !!parTrace && traces.some((t) => t.sorte === parTrace.sorte && !t.aValider)
    if (!siens.length && !avecTrace) continue
    const entrees = c.types
      .filter((t) => siens.some((s) => s.code === t.code))
      .map((t) => {
        const multiple = siens.some((s) => s.code === t.code && s.quantite > 1)
        return { code: t.code, libelle: texteLatin(t.libelle + (multiple ? MULTIPLE[t.code] ?? ' (×n : nombre)' : '')), ...(multiple ? { multiple: true } : {}) }
      })
    // Un relevé sans type a son losange : il s'explique aussi
    if (siens.some((s) => !s.code)) entrees.push({ code: null, libelle: 'Autre relevé', sansType: true })
    if (avecTrace) entrees.push({ ...parTrace.entree })
    groupes.push({ calque: c.code, libelle: texteLatin(c.libelle), couleur: COULEURS_GROUPE[c.code] ?? couleurCalque(c.code), entrees })
  }
  const symbolesProposes = symboles.some((s) => s.aValider)
  const tracesProposees = traces.some((t) => t.aValider)
  if (symbolesProposes || tracesProposees) {
    groupes.push({
      calque: 'a-valider', libelle: 'À valider', couleur: COULEUR_PROPOSITION,
      entrees: [
        ...(symbolesProposes ? [{ code: null, libelle: 'Proposition de l’analyse, à valider', proposition: true }] : []),
        ...(tracesProposees ? [{ code: null, libelle: 'Liaison ou cote proposée, à valider', trace: 'proposition' }] : []),
      ],
    })
  }
  return groupes
}

// Groupes répartis en deux colonnes dans l'ordre des calques, sans être
// coupés : un groupe va à gauche tant que son milieu tombe avant la moitié
function colonnesLegende(groupes, n) {
  if (n === 1) return [groupes.map((_, i) => i)]
  const lignes = groupes.map((g) => 1 + g.entrees.length)
  const total = lignes.reduce((s, l) => s + l, 0)
  const colonnes = [[], []]
  let cumul = 0
  groupes.forEach((_, i) => {
    const premiere = colonnes[1].length === 0 && (cumul === 0 || cumul + lignes[i] / 2 <= total / 2)
    if (premiere) {
      colonnes[0].push(i)
      cumul += lignes[i]
    } else colonnes[1].push(i)
  })
  return colonnes
}

function noteLegende(date, redacteur) {
  const d = dateCartouche(date)
  const r = rempli(redacteur)
  const releve = d ? `Relevé du ${d}${r ? ` (${r})` : ''}. ` : r ? `Relevé par ${r}. ` : ''
  return `${releve}Positions relevées sur site, à vérifier.`
}

function cadreLegende(legende) {
  const lignes = legende.groupes.map((g) => 1 + g.entrees.length)
  const total = lignes.reduce((s, l) => s + l, 0)
  const n = total <= LEGENDE.lignesUneColonne ? 1 : LEGENDE.colonnes
  const colonnes = colonnesLegende(legende.groupes, n)
  const lignesMax = Math.max(0, ...colonnes.map((c) => c.reduce((s, i) => s + lignes[i], 0)))
  const largeurTitre = largeurTexte(legende.titre, LEGENDE.texteTitre) + 6
  const largeur = n === 1 ? Math.min(LEGENDE.largeur, Math.max(LEGENDE.largeur / 2, largeurTitre)) : LEGENDE.largeur
  return { colonnes, largeur: arrondiMm(largeur), hauteur: arrondiMm(LEGENDE.titre + lignesMax * LEGENDE.entree + LEGENDE.note) }
}

function cadreAuCoin(coin, zone, largeur, hauteur) {
  const x = coin.endsWith('droite') ? zone.x + zone.largeur - largeur : zone.x
  const y = coin.startsWith('haut') ? zone.y : zone.y + zone.hauteur - hauteur
  return { x: arrondiMm(x), y: arrondiMm(y), largeur, hauteur }
}

const recouvrement = (a, b) => {
  const l = Math.min(a.x + a.largeur, b.x + b.largeur) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.hauteur, b.y + b.hauteur) - Math.max(a.y, b.y)
  return l > 0 && h > 0 ? l * h : 0
}

/** Coin de la zone où la légende couvre le moins de pièces et de symboles ; en haut à droite à égalité. */
function coinLegende(zone, largeur, hauteur, obstacles) {
  let meilleur = COINS[0]
  let moindre = Infinity
  for (const coin of COINS) {
    const cadre = cadreAuCoin(coin, zone, largeur, hauteur)
    const couvert = obstacles.reduce((s, o) => s + recouvrement(cadre, o), 0)
    if (couvert < moindre - 1e-9) {
      moindre = couvert
      meilleur = coin
    }
  }
  return meilleur
}

// ─── Cartouche ──────────────────────────────────────────────────────────────

/** « 18/11/2026 » d'une date ou d'un 'AAAA-MM-JJ' ; '' sans date. */
export function dateCartouche(date) {
  const d = dateIso(date)
  if (!d) return ''
  const [a, m, j] = d.split('-')
  return `${j}/${m}/${a}`
}

// Largeurs des cases, de gauche à droite (mm) ; le titre prend le reste
const CASES = { affaire: 110, colonne: 22, numero: 30, logo: 38 }

function casesCartouche(c, cadre) {
  const { x, y, largeur, hauteur } = cadre
  const demi = hauteur / 2
  const cases = []
  const ajouter = (cle, cx, cy, l, h, libelle, valeur, extra = {}) => cases.push({ cle, x: arrondiMm(cx), y: arrondiMm(cy), largeur: arrondiMm(l), hauteur: arrondiMm(h), libelle, valeur, ...extra })
  let cx = x
  ajouter('affaire', cx, y, CASES.affaire, hauteur, '', c.affaire, { detail: c.adresse })
  cx += CASES.affaire
  const grille = [
    [['code', 'Affaire', c.code], ['echelle', 'Échelle', c.echelle], ['format', 'Format', c.format]],
    [['phase', 'Phase', c.phase], ['date', 'Date', c.date], ['indice', 'Indice', c.indice]],
  ]
  grille.forEach((rang, r) => rang.forEach(([cle, libelle, valeur], i) => ajouter(cle, cx + i * CASES.colonne, y + r * demi, CASES.colonne, demi, libelle, valeur)))
  cx += 3 * CASES.colonne
  ajouter('numero', cx, y, CASES.numero, hauteur, 'N°', c.numero, { grand: true })
  cx += CASES.numero
  const largeurTitre = x + largeur - CASES.logo - cx
  ajouter('titre', cx, y, largeurTitre, hauteur, '', c.titre)
  cx += largeurTitre
  ajouter('logo', cx, y, CASES.logo, hauteur, '', '')
  return cases
}

// ─── La planche ─────────────────────────────────────────────────────────────

/**
 * Tout ce qui est sur la planche d'un étage.
 *
 * @param niveau l'étage ({ id, nom })
 * @param pieces pièces de l'affaire (celles de l'étage font l'emprise)
 * @param elementsExport sortie d'`elementsAExporter` (filtrée ici à l'étage)
 * @param boiteVecteurs emprise du plan vectoriel, en repli sans pièce
 * @param reperes [[x, y]] (mètres) d'autres relevés à garder sur la feuille :
 *   points sans élément, points des photos hors des pièces
 * @param traces sortie de `tracesAExporter` (filtrée ici à l'étage) : liaisons
 *   et cotes, dans l'emprise, dessinées sous les symboles
 * @returns {{ format, zone, echelle, transform, symboles, traces, legende, cartouche, etage, niveauId }}
 */
export function misePlanche({
  niveau, pieces = [], elementsExport = [], boiteVecteurs = null, reperes = [], traces = [],
  affaire = null, date = null, redacteur = '', numero = '', indice = '', inclurePropositions = false,
} = {}) {
  const format = { ...FORMAT_A3 }
  const largeurUtile = format.largeur - 2 * MARGE_PLANCHE
  const zone = { x: MARGE_PLANCHE, y: MARGE_PLANCHE, largeur: largeurUtile, hauteur: format.hauteur - 2 * MARGE_PLANCHE - HAUTEUR_CARTOUCHE }
  const cadreCartouche = { x: MARGE_PLANCHE, y: zone.y + zone.hauteur, largeur: largeurUtile, hauteur: HAUTEUR_CARTOUCHE }

  const niveauId = niveau?.id ?? null
  const siennes = pieces.filter((p) => !p.niveau_id || p.niveau_id === niveauId)
  const elements = elementsDeLEtage(elementsExport, niveauId, pieces).filter((e) => inclurePropositions || !e.aValider)
  const positions = elements.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y)).map((e) => [e.x, e.y])

  const autres = (reperes ?? []).filter((pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
  const sesTraces = (traces ?? []).filter((t) => (!t.niveauId || t.niveauId === niveauId) && (inclurePropositions || !t.aValider))
  // Une liaison bombe hors de la corde : son sommet compte aussi
  const boutsTraces = sesTraces.flatMap((t) => [t.a, t.b, ...(t.sorte === 'commande' ? [courbeCommande(t.a, t.b)?.sommet].filter(Boolean) : [])])
  const emprise = empriseM(siennes, boiteVecteurs, [...positions, ...autres, ...boutsTraces])
  const echelle = echellePlanche(emprise, zone)
  const mmParMetre = 1000 / echelle
  const origineM = emprise ? [(emprise[0] + emprise[2]) / 2, (emprise[1] + emprise[3]) / 2] : [0, 0]
  const transform = { mmParMetre, origineM, origineMm: [zone.x + zone.largeur / 2, zone.y + zone.hauteur / 2] }

  const symboles = symbolesPlanche(elements, pieces, transform)
  const boitesSymboles = symboles.map((s) => ({
    xmin: s.xMm - s.tailleMm.ancre[0], ymin: s.yMm - s.tailleMm.ancre[1],
    xmax: s.xMm - s.tailleMm.ancre[0] + s.tailleMm.largeur, ymax: s.yMm - s.tailleMm.ancre[1] + s.tailleMm.hauteur,
  }))
  const tracesMm = tracesPlanche(sesTraces, transform, pieces, boitesSymboles)

  const etage = rempli(niveau?.nom) || 'Étage'
  const legende = {
    titre: `LÉGENDE – ÉTAT DES LIEUX ${etage.toUpperCase()}`,
    groupes: groupesLegende(symboles, tracesMm),
    note: noteLegende(date, redacteur),
  }
  const { colonnes, largeur, hauteur } = cadreLegende(legende)
  const obstacles = [
    ...siennes.filter((p) => contourValide(p.contour)).map((p) => {
      const [x0, y0, x1, y1] = boite(p.contour.map((pt) => versMmPlanche(transform, pt)))
      return { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 }
    }),
    ...symboles.map((s) => ({ x: s.xMm - s.tailleMm.ancre[0], y: s.yMm - s.tailleMm.ancre[1], largeur: s.tailleMm.largeur, hauteur: s.tailleMm.hauteur })),
    ...tracesMm.map(boiteTrace),
  ]
  legende.coin = coinLegende(zone, largeur, hauteur, obstacles)
  legende.cadreMm = cadreAuCoin(legende.coin, zone, largeur, hauteur)
  legende.colonnes = colonnes

  const jour = dateCartouche(date)
  const cartouche = {
    affaire: rempli(affaire?.nom) || 'Affaire',
    adresse: rempli([affaire?.projet_adresse, affaire?.projet_commune].filter(Boolean).join(' ')),
    code: rempli(affaire?.code_affaire),
    echelle: `1:${echelle}`,
    format: format.nom,
    phase: 'EDL',
    date: jour,
    indice: rempli(indice) || jour,
    numero: rempli(numero),
    titre: `EXISTANT - Plan ${etage}`,
  }
  cartouche.cadreMm = cadreCartouche
  cartouche.cases = casesCartouche(cartouche, cadreCartouche)

  return { format, zone, echelle, transform, symboles, traces: tracesMm, legende, cartouche, etage, niveauId }
}
