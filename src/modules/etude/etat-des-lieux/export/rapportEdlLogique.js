// ─── Rapport PDF de l'état des lieux : logique pure ──────────────────────────
//
// Page de garde (A4 : affaire, étages, chiffres clés, points d'attention),
// puis une planche A3 par étage (`plancheEdl.js`, dessinée par
// `genererRapportEdl.js`), puis un tableau A3 paysage par niveau (une ligne
// par pièce, matériaux et statuts : `tableauxEdlLogique.js`), enfin l'annexe
// des photos (A4). Garde, tableaux et photos sont trois documents pdfmake
// décrits ici (pdfmake ne change pas de format en cours de document) ; les
// planches et le pied de page sont posés par l'assemblage
// (`assemblageRapportEdl.js`, pdf-lib). Tout ce qui se lit dans le PDF se
// décide ici, sans navigateur : les images arrivent prêtes (data URL JPEG,
// pdfmake ne lit pas le WebP), rangées par clé. Testé par
// tests/etat-des-lieux-export-pdf.test.js et …-export-tableaux.test.js.
//
// Roboto, la police de pdfmake, n'a que le latin courant : tout texte venu de
// la base (dicté, transcrit, proposé par Claude) passe par `texteLatin`.

import { CALQUES, calqueEdl, typeEdl } from '../calquesEdl.js'
import { aire } from '../geometrieEdl.js'
import { COULEUR, LARGEUR_UTILE, blocAffaire, jour, lignePhotos, tableauFin } from '../../../chantier/comptes-rendus/rapportLogique.js'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition.js'
import { numeroterPhotos } from './numerotationEdl.js'
import { ficheEcartee, ficheExportee, hspExport } from './ficheExportEdl.js'
import { CHAMPS_PORTE, LIBELLES_PORTE, STATUTS, infosStatut, textePorte } from '../statutsEdl.js'
import { libellePiece, syntheseRapport, tableauxDuRapport, texteComptes } from './tableauxEdlLogique.js'

// ─── Textes ──────────────────────────────────────────────────────────────────

// Latin de base, Latin-1, œ / Œ / Ÿ, tirets, apostrophes et guillemets
// typographiques, points de suspension, euro, puce : ce que Roboto dessine
export const HORS_LATIN = /[^\t\n\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0178\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u20AC\u2022]/g

// Ce qu'une dictée ou Claude écrivent parfois, rendu lisible plutôt qu'effacé
const REMPLACEMENTS = {
  '\u2192': '->', '\u2190': '<-', '\u21D2': '=>', '\u2264': '<=', '\u2265': '>=', '\u2248': '~', '\u2260': '<>',
  '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u2032': '\'', '\u2033': '"', '\u25B6': '\u00BB', '\u25BA': '\u00BB',
  '\u202F': ' ', '\u2009': ' ', '\u2007': ' ', '\u200B': '', '\u2713': '', '\u2714': '', '\u2715': 'x', '\u2716': 'x',
}

/** Texte prêt pour Roboto : accents recomposés, symboles remplacés, le reste retiré. */
export function texteLatin(valeur) {
  if (valeur == null) return ''
  return String(valeur).normalize('NFC').replace(HORS_LATIN, (c) => REMPLACEMENTS[c] ?? '')
}

const rempli = (v) => texteLatin(v).trim()

// Écriture française sans `toLocaleString` : il sépare les milliers par une
// espace fine insécable (U+202F) que Roboto n'a pas
export function nombreFr(valeur, decimales = 2, { fixe = false } = {}) {
  const v = Number(valeur)
  if (!Number.isFinite(v)) return ''
  let t = v.toFixed(decimales)
  if (!fixe && t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '')
  const [entier, fraction] = t.split('.')
  const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return fraction ? `${groupes},${fraction}` : groupes
}

const designation = (p) => texteLatin([p?.numero, p?.nom].filter(Boolean).join(' · ')) || 'Pièce sans nom'

// ─── Couleurs des calques ────────────────────────────────────────────────────

// Une couleur par famille, calée sur la planche d'exemple de l'agence
// (électricité en bleu, sécurité en noir, désordres en violet), pour les
// planches, leur légende et les intertitres des fiches. Le bleu des
// propositions de l'IA (`COULEUR_IA`) reste distinct de celui de
// l'électricité : sur une planche, une proposition garde la couleur de sa
// famille, entourée d'un cercle pointillé de `COULEUR_PROPOSITION`.
export const COULEURS_CALQUES = {
  electricite: '#1565C0',
  securite: '#1F1B17',
  desordres: '#8E44AD',
  plomberie: '#0E7490',
  chauffage: '#C2410C',
  ventilation: '#2A8A4E',
  menuiseries: '#6B4E2E',
  occultations: '#6B6B6B',
  compteurs: '#6B3FA0',
}
export const COULEUR_PROPOSITION = COULEUR_IA
export const couleurCalque = (code) => COULEURS_CALQUES[code] ?? COULEUR.gris

// ─── Ce que contient le rapport ──────────────────────────────────────────────

const tableau = (v) => (v instanceof Set ? v : new Set(v ?? []))
const prendre = (cle, collection) => (collection instanceof Map ? collection.get(cle) : collection?.[cle]) ?? null

// Le bloc porte compte : une pièce dont seule la porte est décrite n'est pas vide
const ficheRemplie = (fiche) => !!fiche && typeof fiche === 'object'
  && (Object.values(fiche).some((v) => typeof v === 'string' && v.trim()) || !!textePorte(fiche))

/**
 * Pièce visitée : entrée notée en visite, ou quelque chose relevé dedans
 * (élément exporté, point, fiche, analyse) — une pièce décrite au bureau
 * compte aussi. Une fiche proposée laissée hors de l'export (et l'analyse qui
 * l'a proposée) ne compte pas : la pièce aurait une fiche vide, absente du DXF.
 */
export function pieceVisitee(piece, { visitees = null, elementsExport = [], points = [], inclurePropositions = false } = {}) {
  if (tableau(visitees).has(piece.id)) return true
  if (!ficheEcartee(piece, { inclurePropositions }) && (piece.analyse_le || ficheRemplie(piece.fiche))) return true
  return elementsExport.some((e) => e.pieceId === piece.id) || points.some((p) => p.piece_id === piece.id)
}

const parOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)

/** Étages dans l'ordre, chacun avec ses pièces visitées (une fiche chacune) et les autres. */
export function etagesDuRapport({ niveaux = [], pieces = [], elementsExport = [], points = [], visitees = null, inclurePropositions = false }) {
  const vues = tableau(visitees)
  return [...niveaux].sort(parOrdre).map((niveau) => {
    const siennes = pieces.filter((p) => p.niveau_id === niveau.id).sort(parOrdre)
    const visitees = []
    const nonVisitees = []
    for (const p of siennes) (pieceVisitee(p, { visitees: vues, elementsExport, points, inclurePropositions }) ? visitees : nonVisitees).push(p)
    return { niveau, pieces: siennes, visitees, nonVisitees }
  })
}

/**
 * Éléments d'un étage : celui de leur point, sinon celui de leur pièce
 * (`niveauId` d'`elementsAExporter`), comme les DXF — un élément posé hors
 * de toute pièce reste sur le plan de son étage.
 */
export function elementsDeLEtage(elementsExport = [], niveauId, pieces = []) {
  const niveauDeLaPiece = new Map(pieces.map((p) => [p.id, p.niveau_id ?? null]))
  return elementsExport.filter((e) => (e.niveauId !== undefined ? e.niveauId : niveauDeLaPiece.get(e.pieceId) ?? null) === niveauId)
}

/**
 * Relevés d'un étage sans pièce (point hors des contours : façade, cour,
 * palier non découpé) : présents dans le DXF, ils ont leur page « Hors
 * pièces » dans le rapport au lieu de disparaître.
 * @returns { elements, sansElement, photos }
 */
export function relevesHorsPieces({ niveauId, pieces = [], elementsExport = [], points = [], photos = [], sansElement = [] }) {
  const connues = new Set(pieces.map((p) => p.id))
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const horsPiece = (pieceId) => pieceId == null || !connues.has(pieceId)
  return {
    elements: elementsDeLEtage(elementsExport, niveauId, pieces).filter((e) => horsPiece(e.pieceId)),
    sansElement: sansElement.filter((p) => p.niveau_id === niveauId && horsPiece(p.piece_id)),
    photos: photos.filter((ph) => {
      const point = pointsParId.get(ph.point_id)
      return !!point && point.niveau_id === niveauId && horsPiece(point.piece_id)
    }),
  }
}

const memePosition = (a, b) => Number.isFinite(a?.x) && Number.isFinite(b?.x) && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6

/**
 * Points ni typés ni rattachés à un élément exporté (décisions du lot 4) :
 * absents du DXF, listés dans le rapport. Un élément exporté couvre son
 * `pointId` (`elementsAExporter`) ; à défaut de `pointId`, sa position.
 * Un point dont le seul élément est une proposition laissée hors de l'export
 * reste listé, marqué `elementAValider` : il ne doit pas disparaître.
 *
 * @param elements lignes `edl_elements` ({ point_id, a_valider }), facultatif
 */
export function pointsSansElement({ points = [], elements = null, elementsExport = [] }) {
  const couverts = new Set(elementsExport.map((e) => e.pointId).filter(Boolean))
  const sansPointId = elementsExport.filter((e) => e.pointId === undefined)
  const enAttente = new Set((elements ?? []).filter((e) => e.a_valider && e.point_id).map((e) => e.point_id))
  return points
    .filter((p) => !p.type && !couverts.has(p.id) && !sansPointId.some((e) => memePosition(e, p)))
    .map((p) => (enAttente.has(p.id) ? { ...p, elementAValider: true } : p))
}

const libelleElement = (e) => rempli(e.libelle) || texteLatin(typeEdl(e.type)?.libelle) || texteLatin(calqueEdl(e.calque)?.libelle) || 'Élément'

// Un élément sans numéro (sans point) après les numérotés : Number(null) vaut 0
const numeroDe = (e) => (e.numero == null || e.numero === '' ? NaN : Number(e.numero))

function compareNumeros(a, b) {
  const na = numeroDe(a)
  const nb = numeroDe(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1
  return String(a.numero ?? '').localeCompare(String(b.numero ?? ''), 'fr', { numeric: true })
}

/** Éléments rangés par calque, dans l'ordre de `calquesEdl.js` ; un calque inconnu en dernier. */
export function groupesElements(elementsExport = []) {
  const groupes = CALQUES
    .map((c) => ({ calque: c.code, libelle: c.libelle, elements: elementsExport.filter((e) => e.calque === c.code) }))
    .filter((g) => g.elements.length > 0)
  const connus = new Set(CALQUES.map((c) => c.code))
  const autres = elementsExport.filter((e) => !connus.has(e.calque))
  if (autres.length) groupes.push({ calque: null, libelle: 'Autres éléments', elements: autres })
  return groupes.map((g) => ({ ...g, elements: [...g.elements].sort(compareNumeros) }))
}

/**
 * Légende d'une photo : l'élément relevé au même point, sinon le point. Le
 * point relie la photo à sa pièce (`edl_photos.point_id`). Avec `piece`
 * (annexe des photos) : « Ph n · pièce · élément ».
 */
function legendePhoto(photo, point, elementsDuPoint, piece = null) {
  const sujet = elementsDuPoint.length
    ? elementsDuPoint.map((e) => [e.numero != null ? `P${e.numero}` : null, libelleElement(e)].filter(Boolean).join(' · ')).join(', ')
    : `P${point?.numero ?? '?'}`
  const texte = piece ? `${piece} · ${sujet}` : sujet
  return photo.numero != null ? `Ph ${photo.numero} · ${texte}` : texte
}

/**
 * Éléments exportés d'un point : par le point (`pointId` d'`elementsAExporter`),
 * puis par les lignes `edl_elements`, puis, en dernier recours, par la position.
 */
function elementsDuPointDe({ elementsExport = [], elements = null }) {
  const exportesParId = new Map(elementsExport.map((e) => [e.id, e]))
  return (point) => {
    if (!point) return []
    const parPoint = elementsExport.filter((e) => e.pointId === point.id)
    if (parPoint.length) return parPoint
    const parLigne = (elements ?? []).filter((e) => e.point_id === point.id).map((e) => exportesParId.get(e.id)).filter(Boolean)
    if (parLigne.length) return parLigne
    return elementsExport.filter((e) => e.pointId === undefined && memePosition(e, point))
  }
}

// ─── Mise en page ────────────────────────────────────────────────────────────

const A4_PAYSAGE = { largeur: 842 - 72, hauteur: 595 - 36 - 44 }
export const MARGES = [36, 36, 36, 44]
// Cadres où pdfmake pose les plans (points PDF) : le dessin sur canevas y
// règle ses épaisseurs et ses bulles, pour qu'elles s'impriment à la même
// taille sur un étage de 10 m comme de 100 m
export const CADRE_PLAN_ETAGE = [A4_PAYSAGE.largeur, A4_PAYSAGE.hauteur - 70]
export const CADRE_PLAN_PIECE = [LARGEUR_UTILE, 250]

const titreSection = (texte, couleur = COULEUR.orange) => ({ text: texte.toUpperCase(), bold: true, fontSize: 9.5, color: couleur, margin: [0, 12, 0, 4] })

/** « 12,5 m² », écrite sur le plan d'origine ou, à défaut, mesurée sur le contour. */
export function surfacePiece(piece) {
  const lue = Number(piece?.surface_lue)
  if (piece?.surface_lue != null && Number.isFinite(lue) && lue > 0) return { texte: `${nombreFr(lue)} m²`, mesuree: false }
  const contour = Array.isArray(piece?.contour) ? piece.contour : []
  if (contour.length < 3) return null
  return { texte: `${nombreFr(aire(contour), 1)} m²`, mesuree: true }
}

/** HSP lue sur le plan, sinon dite en visite si la fiche part : la règle du DXF (`hspExport`). */
export function hspPiece(piece, { inclurePropositions = false } = {}) {
  return rempli(hspExport(piece, { inclurePropositions })?.texte) || null
}

const FINITIONS = [['sol', 'Sol'], ['murs', 'Murs'], ['plafond', 'Plafond'], ['plinthes', 'Plinthes']]

// Un intertitre ne reste jamais seul en bas de page : il voyage avec ce qui
// le suit (tout le bloc s'il est court)
const ensemble = (noeuds, court = true) => ({ stack: noeuds, unbreakable: court })

// ─── Tableaux par niveau (A3 paysage) ────────────────────────────────────────

// Charte de la synthèse montrée par l'agence (2026-11-19) : encre, texte
// discret, filets, orange JGA et orange foncé, fond des points d'attention
export const CHARTE = {
  encre: '#2B2826', discret: '#5A554F', filet: '#DDD7D1',
  orange: '#EF6524', orangeFonce: '#B9481B', fondAttention: '#F4F1EE',
}

// A3 paysage moins les marges (points PDF)
const LARGEUR_A3 = 1190.55 - MARGES[0] - MARGES[2]
// Pièce, Sol, Mur, Plafond, Bloc porte, Équipements, Points particuliers ;
// la dernière colonne prend le reste
const COLONNES = ['Pièce', 'Sol', 'Mur', 'Plafond', 'Bloc porte', 'Équipements', 'Points particuliers']
const LARGEURS = [120, 150, 140, 130, 140, 190, '*']
const LARGEUR_ETIQUETTE = 46
const PAS_POINTILLE = { pointille: { length: 1, space: 1.2 }, tirete: { length: 2.6, space: 1.4 } }

/**
 * Étiquette de statut dessinée comme la synthèse de l'agence : une case
 * cernée (plein, pointillé ou tireté, par le style de trait des tableaux
 * pdfmake) ou pleine pour « Déposer ».
 */
export function etiquetteStatut(code) {
  const st = infosStatut(code)
  const style = PAS_POINTILLE[st.cerne] ? () => ({ dash: PAS_POINTILLE[st.cerne] }) : () => null
  return {
    margin: [0, 1, 0, 0],
    table: {
      widths: ['auto'],
      body: [[{
        text: texteLatin(st.libelle).toUpperCase(), fontSize: 5.5, bold: true, color: st.texte, characterSpacing: 0.3,
        noWrap: true, ...(st.fond ? { fillColor: st.fond } : {}),
      }]],
    },
    layout: {
      hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => st.trait, vLineColor: () => st.trait,
      hLineStyle: style, vLineStyle: style,
      paddingLeft: () => 2.5, paddingRight: () => 2.5, paddingTop: () => 0.8, paddingBottom: () => 0.2,
    },
  }
}

const nonDecrit = () => ({ text: 'Non décrit', italics: true, fontSize: 7.5, color: CHARTE.discret })
const sansObjet = () => ({ text: '—', fontSize: 8, color: CHARTE.filet })
const marqueAValider = { text: ' (à valider)', italics: true, color: COULEUR_PROPOSITION }

const avecEtiquette = (code, contenu) => ({
  columnGap: 3,
  columns: [{ width: LARGEUR_ETIQUETTE, stack: [etiquetteStatut(code)] }, { width: '*', ...contenu }],
})

function celluleMateriaux(items, aValider) {
  if (!items.length) return nonDecrit()
  return {
    stack: items.map((it, i) => ({
      ...avecEtiquette(it.statut, { text: [it.texte, ...(aValider ? [marqueAValider] : [])], fontSize: 8, color: CHARTE.encre }),
      margin: [0, i ? 3 : 0, 0, 0],
    })),
  }
}

function cellulePorte(porte, aValider) {
  if (!porte) return nonDecrit()
  const parties = CHAMPS_PORTE.filter((c) => porte[c]).map((c) => ({
    text: [
      { text: `${LIBELLES_PORTE[c].toUpperCase()}  `, fontSize: 5.5, color: CHARTE.discret, characterSpacing: 0.4 },
      { text: porte[c], fontSize: 8, color: CHARTE.encre },
    ],
    margin: [0, 0, 0, 1],
  }))
  return {
    stack: [
      avecEtiquette(porte.statut, { stack: parties }),
      ...(aValider ? [{ text: 'à valider', italics: true, fontSize: 7, color: COULEUR_PROPOSITION }] : []),
    ],
  }
}

function celluleListe(items) {
  if (!items.length) return nonDecrit()
  return {
    stack: items.map((it, i) => ({
      text: [it.texte, ...(it.aValider ? [marqueAValider] : [])], fontSize: 8, color: CHARTE.encre, margin: [0, i ? 2.5 : 0, 0, 0],
    })),
  }
}

function cellulePiece({ piece, ficheAValider, hors, suite }) {
  return {
    stack: [
      {
        text: [
          ...(piece.numero ? [{ text: `${piece.numero}  `, fontSize: 7.5, bold: true, color: CHARTE.orangeFonce }] : []),
          { text: piece.designation, fontSize: 11, bold: true, color: hors ? CHARTE.discret : CHARTE.encre },
          ...(suite ? [{ text: ' (suite)', fontSize: 9, bold: false, color: CHARTE.discret }] : []),
        ],
      },
      ...(suite ? [] : piece.surface || piece.hsp
        ? [{ text: [piece.surface, piece.hsp ? `HSP ${piece.hsp}` : null].filter(Boolean).join(' · '), fontSize: 7, color: CHARTE.discret, margin: [0, 1, 0, 0] }]
        : []),
      ...(hors && !suite ? [{ text: 'Relevés posés en dehors des pièces dessinées', fontSize: 6.5, italics: true, color: CHARTE.discret, margin: [0, 1, 0, 0] }] : []),
      ...(ficheAValider && !suite ? [{ text: 'Fiche proposée, à valider', italics: true, fontSize: 6.5, color: COULEUR_PROPOSITION, margin: [0, 1, 0, 0] }] : []),
    ],
  }
}

// Une rangée de tableau reste insécable (`dontBreakRows`, réglé pour tout le
// tableau) ; une pièce aux très nombreux relevés ferait une rangée plus haute
// que la page, que pdfmake ne sait plus placer. Ses textes continuent alors
// sur des rangées « (suite) », chacune insécable : on estime les lignes de
// texte de chaque colonne (caractères par ligne, prudents, d'après la largeur
// de la colonne à 8 pt) et on coupe au-delà de `LIGNES_PAR_RANGEE` — environ
// 450 pt, la moitié d'une page A3 paysage utile.
export const LIGNES_PAR_RANGEE = 45
const CARACTERES_PAR_LIGNE = { sol: 22, mur: 20, plafond: 18, equipements: 42, particuliers: 40 }

const lignesEstimees = (texte, car) => Math.max(1, Math.ceil(String(texte ?? '').length / car)) + 0.3

// Un texte seul plus long que la rangée est coupé entre deux mots
function morceauxItem(item, car) {
  const max = Math.floor((LIGNES_PAR_RANGEE - 1) * car)
  const texte = String(item.texte ?? '')
  if (texte.length <= max) return [item]
  const morceaux = []
  let reste = texte
  while (reste.length > max) {
    const espace = reste.lastIndexOf(' ', max)
    const coupe = espace > max * 0.5 ? espace : max
    morceaux.push(reste.slice(0, coupe).trim())
    reste = reste.slice(coupe).trim()
  }
  if (reste) morceaux.push(reste)
  return morceaux.map((t) => ({ ...item, texte: t }))
}

function paquetsColonne(items = [], car) {
  const paquets = [[]]
  let lignes = 0
  for (const item of items.flatMap((it) => morceauxItem(it, car))) {
    const n = lignesEstimees(item.texte, car)
    if (lignes + n > LIGNES_PAR_RANGEE && paquets.at(-1).length) {
      paquets.push([])
      lignes = 0
    }
    paquets.at(-1).push(item)
    lignes += n
  }
  return paquets
}

/**
 * Rangées d'une ligne du tableau : la ligne elle-même, ou, si elle déborde,
 * la ligne puis ses rangées « (suite) » (`suite: true`, sans porte).
 */
export function rangeesDeLigne(ligne) {
  const colonnes = Object.keys(CARACTERES_PAR_LIGNE)
  const decoupe = Object.fromEntries(colonnes.map((c) => [c, paquetsColonne(ligne[c], CARACTERES_PAR_LIGNE[c])]))
  const n = Math.max(...colonnes.map((c) => decoupe[c].length))
  if (n === 1) return [ligne]
  return Array.from({ length: n }, (_, i) => ({
    ...ligne,
    ...Object.fromEntries(colonnes.map((c) => [c, decoupe[c][i] ?? []])),
    ...(i ? { suite: true, porte: null } : {}),
  }))
}

const enteteColonne = (t) => ({ text: t.toUpperCase(), fontSize: 6.5, bold: true, color: CHARTE.discret, characterSpacing: 0.6 })

const layoutTableau = {
  hLineWidth: (i) => (i === 0 ? 0 : i === 1 ? 1 : 0.5),
  hLineColor: (i) => (i === 1 ? CHARTE.encre : CHARTE.filet),
  vLineWidth: () => 0,
  paddingLeft: (i) => (i === 0 ? 0 : 5), paddingRight: () => 5,
  paddingTop: (i) => (i === 0 ? 2 : 6), paddingBottom: (i) => (i === 0 ? 4 : 6),
}

/** Tableau d'un niveau : en-tête répété à chaque page, une ligne par pièce, insécable. */
function tableauNiveau(lignes) {
  return {
    layout: layoutTableau,
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: LARGEURS,
      body: [
        COLONNES.map(enteteColonne),
        ...lignes.flatMap(rangeesDeLigne).map((l) => {
          // Ligne « Hors pièces » ou suite d'une pièce : une case vide est sans objet
          const vide = (items, cellule) => ((l.hors || l.suite) && !items?.length ? sansObjet() : cellule())
          return [
            cellulePiece(l),
            ...(l.hors ? [sansObjet(), sansObjet(), sansObjet(), sansObjet()] : [
              vide(l.sol, () => celluleMateriaux(l.sol, l.ficheAValider)),
              vide(l.mur, () => celluleMateriaux(l.mur, l.ficheAValider)),
              vide(l.plafond, () => celluleMateriaux(l.plafond, l.ficheAValider)),
              l.suite ? sansObjet() : cellulePorte(l.porte, l.ficheAValider),
            ]),
            vide(l.equipements, () => celluleListe(l.equipements)),
            vide(l.particuliers, () => celluleListe(l.particuliers)),
          ]
        }),
      ],
    },
  }
}

function titreNiveau(nom) {
  return [
    {
      columnGap: 6,
      columns: [
        { width: 8, canvas: [{ type: 'rect', x: 0, y: 3, w: 7.5, h: 7.5, color: CHARTE.orange }] },
        { width: '*', text: texteLatin(nom).toUpperCase(), fontSize: 12, bold: true, color: CHARTE.encre, characterSpacing: 0.8 },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 3, x2: LARGEUR_A3, y2: 3, lineWidth: 1, lineColor: CHARTE.encre }], margin: [0, 0, 0, 4] },
  ]
}

function blocNiveau(etage, rang) {
  const lignes = etage.lignes
  const nonVisitees = etage.nonVisitees ?? []
  const titre = titreNiveau(etage.nom)
  return {
    id: `niveau-${etage.niveau.id}`,
    ...(rang > 0 ? { pageBreak: 'before' } : {}),
    stack: [
      ensemble([
        ...titre,
        { text: texteComptes(lignes), fontSize: 8, color: CHARTE.discret, margin: [0, 0, 0, 8] },
      ]),
      lignes.length ? tableauNiveau(lignes) : { text: 'Aucune pièce visitée à ce niveau.', italics: true, fontSize: 8.5, color: CHARTE.discret },
      ...(nonVisitees.length ? [{
        margin: [0, 8, 0, 0], fontSize: 7.5, color: CHARTE.discret,
        text: [{ text: `Pièces non visitées (${nonVisitees.length}) : `, bold: true }, nonVisitees.map(libellePiece).join(', ')],
      }] : []),
    ],
  }
}

function legendeTableau() {
  return ensemble([
    { text: 'LECTURE DU TABLEAU', fontSize: 7, bold: true, color: CHARTE.discret, characterSpacing: 0.8, margin: [0, 0, 0, 4] },
    {
      columnGap: 18,
      columns: STATUTS.map((st) => ({
        width: '*',
        ...avecEtiquette(st.code, { text: texteLatin(st.sens), fontSize: 7.5, color: CHARTE.discret }),
      })),
    },
    {
      text: '« Non décrit » : rien n’a été relevé pour cette rubrique ; « — » : sans objet. Équipements et points particuliers n’ont pas de statut ; cotes et « Ph n » renvoient aux planches et à l’annexe photos.',
      fontSize: 7, color: CHARTE.discret, margin: [0, 5, 0, 14],
    },
  ])
}

function noteSources({ date, redacteur, propositions }) {
  const d = dateIso(date)
  const visite = d ? `Relevé sur site du ${jour(d, { day: 'numeric', month: 'long', year: 'numeric' })}${rempli(redacteur) ? ` (${rempli(redacteur)})` : ''}` : 'Relevé sur site'
  return {
    margin: [0, 16, 0, 0], fontSize: 7, color: CHARTE.discret,
    text: [
      { text: 'Sources. ', bold: true },
      `${visite} : points, photos et descriptions dictées pièce par pièce, transcrites puis analysées et relues par l’agence ; plans de l’existant importés. Surfaces et HSP lues sur le plan d’origine, sinon mesurées sur le contour ou dites en visite. `,
      'Statut « À préciser » : rien n’a été dit sur l’état pendant la visite.',
      ...(propositions ? [' Les mentions « à valider » sont des propositions de l’analyse pas encore relues par l’agence.'] : []),
    ],
  }
}

// ─── Garde : chiffres clés et points d'attention ─────────────────────────────

function blocChiffres(chiffres) {
  if (!chiffres.length) return []
  const ecart = 12
  const largeur = (LARGEUR_UTILE - ecart * (chiffres.length - 1)) / chiffres.length
  return [{
    columnGap: ecart,
    margin: [0, 16, 0, 0],
    columns: chiffres.map((c) => ({
      width: largeur,
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: largeur, y2: 0, lineWidth: 3, lineColor: CHARTE.orange }] },
        { text: c.valeur, fontSize: 22, bold: true, color: CHARTE.encre, margin: [0, 5, 0, 0] },
        { text: c.libelle, fontSize: 7.5, color: CHARTE.discret },
        ...(c.detail ? [{ text: c.detail, fontSize: 6.5, color: CHARTE.discret, margin: [0, 1, 0, 0] }] : []),
      ],
    })),
  }]
}

function blocAttention(attention) {
  const titre = { text: 'POINTS D’ATTENTION', bold: true, fontSize: 9.5, color: CHARTE.encre, margin: [0, 16, 0, 4] }
  const lignes = attention.length
    ? attention.map((a) => [{ fontSize: 8.5, color: CHARTE.encre, text: [{ text: `${a.titre}  `, bold: true }, a.texte] }])
    : [[{ fontSize: 8.5, color: CHARTE.discret, text: 'Aucun désordre, aucune rubrique à déposer ni à vérifier.' }]]
  return [ensemble([titre, {
    table: { widths: ['*'], body: lignes },
    layout: {
      fillColor: () => CHARTE.fondAttention,
      hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => CHARTE.orange,
      paddingLeft: () => 10, paddingRight: () => 10,
      paddingTop: (i) => (i === 0 ? 8 : 3), paddingBottom: (i, node) => (i === node.table.body.length - 1 ? 8 : 3),
    },
  }])]
}

/**
 * « 9901 Maison de l’essai · État des lieux » : le pied des pages A4, que
 * l'assemblage (`assemblageRapportEdl.js`) complète de « · page n / N ».
 */
export function piedRapportEdl(affaire) {
  const libelle = texteLatin([affaire?.code_affaire, affaire?.nom].filter(Boolean).join(' ')) || 'Affaire'
  return `${libelle} · État des lieux`
}

export const dateIso = (d) => {
  if (!d) return null
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const m = String(d).match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

/** « 2026-11-18-2618-etat-des-lieux.pdf », comme le ZIP de l'export */
export function nomFichierRapportEdl(affaire, date = new Date()) {
  const code = texteLatin(affaire?.code_affaire ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${[dateIso(date), code || null, 'etat-des-lieux'].filter(Boolean).join('-')}.pdf`
}

/** « 2026-11-18-2618-etat-des-lieux.docx » : le rapport Word, à côté du PDF */
export const nomFichierWordEdl = (affaire, date = new Date()) => nomFichierRapportEdl(affaire, date).replace(/\.pdf$/, '.docx')

function pageDeGarde({ affaire, etages, redacteur, date, elementsExport, pieces, images, synthese }) {
  const propositions = elementsExport.filter((e) => e.aValider).length
  const affaireLatine = Object.fromEntries(Object.entries(affaire ?? {}).map(([k, v]) => [k, typeof v === 'string' ? texteLatin(v) : v]))
  const d = dateIso(date)
  const entete = (t) => ({ text: t.toUpperCase(), fontSize: 7, color: COULEUR.gris })
  return {
    id: 'garde',
    stack: [
      images.logo ? { image: images.logo, fit: [90, 44] } : { text: '' },
      { text: 'État des lieux', fontSize: 28, bold: true, margin: [0, 28, 0, 2] },
      { text: rempli(affaire?.nom) || 'Affaire', fontSize: 16, color: COULEUR.texte },
      ...(rempli(affaire?.code_affaire) ? [{ text: rempli(affaire.code_affaire), fontSize: 12, color: COULEUR.orange, margin: [0, 2, 0, 0] }] : []),
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: LARGEUR_UTILE, y2: 8, lineWidth: 1.5, lineColor: COULEUR.orange }], margin: [0, 0, 0, 14] },
      ...(images.photoAffaire ? [{ image: images.photoAffaire, width: LARGEUR_UTILE, margin: [0, 0, 0, 10] }] : []),
      blocAffaire(affaireLatine),
      {
        table: {
          widths: ['*', '*'],
          body: [
            [entete('Date'), entete('Rédacteur')],
            [
              { text: d ? jour(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '—', bold: true },
              { text: rempli(redacteur) || '—', bold: true },
            ],
          ],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#F5F5F5', paddingLeft: () => 8, paddingTop: () => 3, paddingBottom: () => 3 },
        margin: [0, 0, 0, 14],
      },
      titreSection('Étages'),
      {
        layout: { ...tableauFin, fillColor: (i) => (i === 0 ? COULEUR.texte : null) },
        table: {
          headerRows: 1,
          widths: ['*', 60, 60, 60],
          body: [
            ['Étage', 'Pièces', 'Visitées', 'Éléments'].map((t, i) => ({ text: t, bold: true, fontSize: 8, color: 'white', alignment: i ? 'right' : 'left' })),
            ...etages.map((e) => {
              // Par étage et non par pièce : les relevés hors pièces comptent
              const n = elementsDeLEtage(elementsExport, e.niveau.id, pieces).length
              return [
                { text: rempli(e.niveau.nom) || 'Étage', fontSize: 9 },
                ...[e.pieces.length, e.visitees.length, n].map((v) => ({ text: String(v), fontSize: 9, alignment: 'right' })),
              ]
            }),
          ],
        },
      },
      ...(propositions ? [{
        text: `${propositions} élément${propositions > 1 ? 's' : ''} marqué${propositions > 1 ? 's' : ''} « à valider » : proposition${propositions > 1 ? 's' : ''} de l’analyse pas encore relue${propositions > 1 ? 's' : ''} par l’agence.`,
        fontSize: 8.5, italics: true, color: COULEUR_PROPOSITION, margin: [0, 8, 0, 0],
      }] : []),
      ...blocChiffres(synthese?.chiffres ?? []),
      ...(synthese ? blocAttention(synthese.attention) : []),
    ],
  }
}

/**
 * Ce que contient le rapport, page par page, sans mise en page : la suite
 * que lit le Word (`rapportWordEdl.js`). Le PDF lit les mêmes étages, pièces
 * et photos par `tableauxDuRapport` (tableaux par niveau, annexe photos).
 *
 * @param elementsExport sortie d'`elementsAExporter` (export DXF) :
 *   [{ id, pieceId, pointId, x, y, calque, type, libelle, cotes, numero, aValider }]
 * @param photos lignes `edl_photos` ({ id, point_id, prise_le, numero? }) ; une
 *   photo se range dans la pièce de son point. `numero` : celui donné au DXF
 *   (`numeroterPhotos`) ; calculé par la même règle s'il manque
 * @param points lignes `edl_points` ({ id, piece_id, numero, type, x, y })
 * @param elements lignes `edl_elements` ({ id, point_id, a_valider }), pour les
 *   points dont la seule proposition reste hors de l'export
 * @param visitees identifiants des pièces où l'on est entré en visite (Set ou tableau)
 * @param inclurePropositions comme le DXF : une fiche proposée (`fiche_a_valider`)
 *   n'est imprimée que si vrai ; sinon la pièce se lit sans fiche
 * @param images { photos: photoId → image } (Map ou objet) : une photo sans
 *   image est omise ; l'image est rendue telle quelle (data URL pour pdfmake,
 *   octets pour le Word)
 * @returns { etages, pages: [{ sorte: 'plan', niveau, pieces, visitees, nonVisitees, elements }
 *   | { sorte: 'piece', etage, piece, elements, sansElement, photos: [{ image, legende }] }
 *   | { sorte: 'hors', etage, niveauId, elements, sansElement, photos }] }
 */
export function suiteRapportEdl({
  niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, images = {}, inclurePropositions = false,
}) {
  const etages = etagesDuRapport({ niveaux, pieces, elementsExport, points, visitees, inclurePropositions })
  const sansElement = pointsSansElement({ points, elements, elementsExport })
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const elementsDuPoint = elementsDuPointDe({ elementsExport, elements })
  // Mêmes numéros que le DXF (« Ph n ») : ceux reçus, sinon calculés ici
  // par la même règle
  const photosNumerotees = photos.every((ph) => ph.numero != null) ? photos : numeroterPhotos(photos, points, { niveaux, pieces })

  const illustrees = (liste) => liste
    .map((ph) => ({ ph, point: pointsParId.get(ph.point_id), image: prendre(ph.id, images.photos) }))
    .filter((x) => x.image)
    .sort((a, b) => a.ph.numero - b.ph.numero)
    .map(({ ph, point, image }) => ({ image, legende: legendePhoto(ph, point, elementsDuPoint(point)) }))
  const parNumero = (a, b) => (a.numero ?? 0) - (b.numero ?? 0)

  const pages = []
  for (const etage of etages) {
    const nomEtage = rempli(etage.niveau.nom) || 'Étage'
    pages.push({ sorte: 'plan', ...etage, elements: elementsDeLEtage(elementsExport, etage.niveau.id, pieces) })
    for (const piece of etage.visitees) {
      pages.push({
        sorte: 'piece',
        etage: nomEtage,
        piece,
        elements: elementsExport.filter((e) => e.pieceId === piece.id),
        sansElement: sansElement.filter((p) => p.piece_id === piece.id).sort(parNumero),
        photos: illustrees(photosNumerotees.filter((ph) => pointsParId.get(ph.point_id)?.piece_id === piece.id)),
      })
    }
    const hors = relevesHorsPieces({ niveauId: etage.niveau.id, pieces, elementsExport, points, photos: photosNumerotees, sansElement })
    const photosHors = illustrees(hors.photos)
    if (hors.elements.length || hors.sansElement.length || photosHors.length) {
      pages.push({
        sorte: 'hors', etage: nomEtage, niveauId: etage.niveau.id, elements: hors.elements,
        sansElement: hors.sansElement.sort(parNumero), photos: photosHors,
      })
    }
  }
  return { etages, pages }
}

/**
 * Ce que dit une fiche de pièce, partagé par le PDF et le Word : fiche
 * exportée (une fiche proposée non retenue se lit comme absente, comme dans
 * le DXF), surface, HSP, remarques, pièce vide.
 */
export function resumeFiche({ piece, elements = [], sansElement = [], photos = [], inclurePropositions = false }) {
  const fiche = ficheExportee(piece, { inclurePropositions })
  return {
    fiche,
    surface: surfacePiece(piece),
    hsp: hspPiece(piece, { inclurePropositions }),
    remarques: rempli(fiche?.remarques),
    ficheProposee: !!(piece.fiche_a_valider && fiche),
    vide: !elements.length && !sansElement.length && !photos.length && !ficheRemplie(fiche),
    finitions: FINITIONS.map(([cle, libelle]) => ({ cle, libelle, valeur: rempli(fiche?.[cle]) })),
  }
}

/** Ligne d'un élément : libellé, type quand il dit autre chose, sans point. */
export function ligneElement(e) {
  const type = texteLatin(typeEdl(e.type)?.libelle)
  const libelle = libelleElement(e)
  return {
    numero: e.numero != null ? `P${e.numero}` : '—',
    libelle,
    type: type && type.toLowerCase() !== libelle.toLowerCase() ? type : null,
    aValider: !!e.aValider,
    sansPoint: !Number.isFinite(e.x) || !Number.isFinite(e.y),
    cotes: rempli(e.cotes),
  }
}

/** Page de garde : textes communs au PDF et au Word. */
export function resumeGarde({ affaire, etages, redacteur, date, elementsExport = [], pieces = [] }) {
  const propositions = elementsExport.filter((e) => e.aValider).length
  const d = dateIso(date)
  return {
    nom: rempli(affaire?.nom) || 'Affaire',
    code: rempli(affaire?.code_affaire),
    adresse: texteLatin([affaire?.projet_adresse, affaire?.projet_commune].filter(Boolean).join(' ')),
    moa: rempli(affaire?.moa_nom),
    date: d ? jour(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
    redacteur: rempli(redacteur) || '—',
    etages: etages.map((e) => ({
      nom: rempli(e.niveau.nom) || 'Étage',
      pieces: e.pieces.length,
      visitees: e.visitees.length,
      // Par étage et non par pièce : les relevés hors pièces comptent
      elements: elementsDeLEtage(elementsExport, e.niveau.id, pieces).length,
    })),
    propositions: propositions
      ? `${propositions} élément${propositions > 1 ? 's' : ''} marqué${propositions > 1 ? 's' : ''} « à valider » : proposition${propositions > 1 ? 's' : ''} de l’analyse pas encore relue${propositions > 1 ? 's' : ''} par l’agence.`
      : null,
  }
}

/** « 12 pièces · 5 visitées · 30 éléments » */
export function comptesEtage({ pieces, visitees, elements }) {
  const s = (n) => (n > 1 ? 's' : '')
  return `${pieces.length} pièce${s(pieces.length)} · ${visitees.length} visitée${s(visitees.length)} · ${elements.length} élément${s(elements.length)}`
}

export const designationPiece = designation

// Réglages communs aux documents pdfmake ; pas de pied : l'assemblage
// l'écrit, une fois le nombre total de pages connu
const documentPdf = (affaire, contenu, { taille = 'A4', orientation = 'portrait' } = {}) => ({
  pageSize: taille,
  pageOrientation: orientation,
  pageMargins: MARGES,
  info: { title: titreRapportEdl(affaire), author: 'JGA Architectes' },
  defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEUR.texte, lineHeight: 1.15 },
  content: contenu,
})

/** « État des lieux — Maison de l’essai » : titre du PDF (métadonnées). */
export const titreRapportEdl = (affaire) => texteLatin(`État des lieux${affaire?.nom ? ` — ${affaire.nom}` : ''}`)

/**
 * Description pdfmake de la page de garde (A4), chiffres clés et points
 * d'attention compris (`syntheseRapport`). Paramètres de `suiteRapportEdl`,
 * plus `affaire`, `etat`, `redacteur`, `date` et
 * @param images { logo, photoAffaire } (data URL ; une image absente est omise)
 */
export function definitionGardeEdl({
  affaire = null, etat = null, niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, images = {}, redacteur = '', date = null, inclurePropositions = false,
}) {
  const { etages } = tableauxDuRapport({ niveaux, pieces, elementsExport, photos, points, elements, visitees, inclurePropositions })
  const synthese = syntheseRapport({ etages })
  return documentPdf(affaire, [pageDeGarde({ affaire, etages, redacteur, date: date ?? etat?.created_at ?? null, elementsExport, pieces, images, synthese })])
}

/**
 * Description pdfmake des tableaux par niveau (A3 paysage), après les
 * planches : en tête la légende des statuts, puis un tableau par niveau
 * (titre, comptes, une ligne par pièce, ligne « Hors pièces », pièces non
 * visitées), enfin la note des sources. Paramètres de `suiteRapportEdl`,
 * plus `affaire`, `etat`, `redacteur`, `date`.
 * @returns la description, ou null s'il n'y a aucun étage
 */
export function definitionTableauxEdl({
  affaire = null, etat = null, niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, redacteur = '', date = null, inclurePropositions = false,
}) {
  const { etages } = tableauxDuRapport({ niveaux, pieces, elementsExport, photos, points, elements, visitees, inclurePropositions })
  if (!etages.length) return null
  const propositions = elementsExport.some((e) => e.aValider)
    || etages.some((e) => e.lignes.some((l) => l.ficheAValider))
  const nom = rempli([affaire?.code_affaire, affaire?.nom].filter(Boolean).join(' · '))
  return documentPdf(affaire, [
    {
      id: 'tableaux',
      stack: [
        { text: 'DESCRIPTION DES PIÈCES', fontSize: 8, bold: true, color: CHARTE.orange, characterSpacing: 1 },
        { text: nom ? `État des lieux — ${nom}` : 'État des lieux', fontSize: 16, bold: true, color: CHARTE.encre, margin: [0, 1, 0, 10] },
        legendeTableau(),
      ],
    },
    ...etages.map(blocNiveau),
    noteSources({ date: date ?? etat?.created_at ?? null, redacteur, propositions }),
  ], { taille: 'A3', orientation: 'landscape' })
}

/**
 * Description pdfmake de l'annexe des photos (A4 portrait), en fin de
 * rapport : par niveau puis par pièce (ordre du plan), « Hors pièces » en
 * fin de niveau, trois photos par rangée, légende « Ph n · pièce · élément »
 * avec les numéros du DXF. Paramètres de `suiteRapportEdl`, plus `affaire` et
 * @param images { photos: photoId → JPEG } (data URL, Map ou objet ; une photo sans image est omise)
 * @returns la description, ou null s'il n'y a aucune photo à montrer
 */
export function definitionPhotosEdl({
  affaire = null, niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, images = {}, inclurePropositions = false,
}) {
  const { etages, photos: numerotees } = tableauxDuRapport({ niveaux, pieces, elementsExport, photos, points, elements, visitees, inclurePropositions })
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const connues = new Set(pieces.map((p) => p.id))
  const elementsDuPoint = elementsDuPointDe({ elementsExport, elements })
  const illustrees = (liste, nomPiece) => liste
    .map((ph) => ({ ph, point: pointsParId.get(ph.point_id), image: prendre(ph.id, images.photos) }))
    .filter((x) => x.image)
    .sort((a, b) => a.ph.numero - b.ph.numero)
    .map(({ ph, point, image }) => ({ image, legende: legendePhoto(ph, point, elementsDuPoint(point), nomPiece) }))

  const contenu = []
  for (const etage of etages) {
    const groupes = etage.visitees
      .map((piece) => ({ nom: libellePiece(piece), photos: illustrees(numerotees.filter((ph) => pointsParId.get(ph.point_id)?.piece_id === piece.id), libellePiece(piece)) }))
    const hors = numerotees.filter((ph) => {
      const point = pointsParId.get(ph.point_id)
      return !!point && point.niveau_id === etage.niveau.id && (point.piece_id == null || !connues.has(point.piece_id))
    })
    groupes.push({ nom: 'Hors pièces', photos: illustrees(hors, 'Hors pièces') })
    const avecPhotos = groupes.filter((g) => g.photos.length)
    if (!avecPhotos.length) continue
    avecPhotos.forEach((g, i) => {
      const [premiere, ...suite] = lignePhotos(g.photos, 'petites')
      contenu.push(ensemble([
        ...(i === 0 ? [titreSection(etage.nom)] : []),
        { text: [g.nom, { text: `  (${g.photos.length})`, fontSize: 8, color: COULEUR.gris }], fontSize: 10, bold: true, color: CHARTE.encre, margin: [0, 4, 0, 4] },
        premiere,
      ]), ...suite)
    })
  }
  if (!contenu.length) return null
  return documentPdf(affaire, [
    { id: 'photos', text: 'Annexe — Photos', fontSize: 17, bold: true, color: CHARTE.encre },
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: LARGEUR_UTILE, y2: 4, lineWidth: 1.2, lineColor: CHARTE.orange }], margin: [0, 0, 0, 6] },
    ...contenu,
  ])
}
