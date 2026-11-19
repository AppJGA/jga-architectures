// ─── Rapport PDF de l'état des lieux : logique pure ──────────────────────────
//
// Page de garde, puis par étage une page paysage avec le plan (image fabriquée
// sur canevas par `genererRapportEdl.js`), puis une fiche par pièce visitée.
// Tout ce qui se lit dans le PDF se décide ici, sans navigateur : les images
// arrivent prêtes (data URL JPEG, pdfmake ne lit pas le WebP), rangées par
// clé. Testé par tests/etat-des-lieux-export-pdf.test.js.
//
// Roboto, la police de pdfmake, n'a que le latin courant : tout texte venu de
// la base (dicté, transcrit, proposé par Claude) passe par `texteLatin`.

import { CALQUES, calqueEdl, typeEdl } from '../calquesEdl.js'
import { aire } from '../geometrieEdl.js'
import { COULEUR, LARGEUR_UTILE, blocAffaire, jour, lignePhotos, tableauFin } from '../../../chantier/comptes-rendus/rapportLogique.js'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition.js'
import { numeroterPhotos } from './numerotationEdl.js'
import { ficheEcartee, ficheExportee, hspExport } from './ficheExportEdl.js'

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

const ficheRemplie = (fiche) => !!fiche && typeof fiche === 'object' && Object.values(fiche).some((v) => typeof v === 'string' && v.trim())

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
 * point relie la photo à sa pièce (`edl_photos.point_id`).
 */
function legendePhoto(photo, point, elementsDuPoint) {
  const sujet = elementsDuPoint.length
    ? elementsDuPoint.map((e) => [e.numero != null ? `P${e.numero}` : null, libelleElement(e)].filter(Boolean).join(' · ')).join(', ')
    : `P${point?.numero ?? '?'}`
  return photo.numero != null ? `Ph ${photo.numero} · ${sujet}` : sujet
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
const discret = (texte) => ({ text: texte, italics: true, fontSize: 8.5, color: COULEUR.grisClair, margin: [0, 2, 0, 4] })

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

function tableauFinitions(finitions) {
  return {
    layout: tableauFin,
    margin: [0, 0, 0, 2],
    table: {
      widths: [70, '*'],
      body: finitions.map(({ libelle, valeur }) => {
        return [
          { text: libelle, bold: true, fontSize: 8.5, color: COULEUR.gris },
          valeur ? { text: valeur, fontSize: 9 } : { text: 'Non relevé', italics: true, fontSize: 8.5, color: COULEUR.grisClair },
        ]
      }),
    },
  }
}

// Un intertitre ne reste jamais seul en bas de page : il voyage avec ce qui
// le suit (tout le bloc s'il est court)
const ensemble = (noeuds, court = true) => ({ stack: noeuds, unbreakable: court })

function blocElements(titre, elements) {
  if (!elements.length) return [ensemble([titre, discret('Aucun élément relevé.')])]
  return groupesElements(elements).map((g, i) => ensemble([
    ...(i === 0 ? [titre] : []),
    { text: g.libelle, bold: true, fontSize: 9, color: couleurCalque(g.calque), margin: [0, 4, 0, 2] },
    {
      layout: tableauFin,
      margin: [0, 0, 0, 4],
      table: {
        headerRows: 0,
        dontBreakRows: true,
        widths: [30, '*', 150],
        body: g.elements.map((e) => {
          const l = ligneElement(e)
          return [
            { text: l.numero, bold: true, fontSize: 9, color: l.aValider ? COULEUR_PROPOSITION : couleurCalque(g.calque) },
            {
              fontSize: 9,
              text: [
                l.libelle,
                ...(l.type ? [{ text: `  ${l.type}`, fontSize: 7.5, color: COULEUR.gris }] : []),
                ...(l.aValider ? [{ text: '  (à valider)', italics: true, color: COULEUR_PROPOSITION }] : []),
                ...(l.sansPoint ? [{ text: '  (sans point sur le plan)', fontSize: 7.5, italics: true, color: COULEUR.grisClair }] : []),
              ],
            },
            { text: l.cotes, fontSize: 8.5, color: COULEUR.texte },
          ]
        }),
      },
    },
  ], g.elements.length <= 12))
}

function enteteFiche(etage, piece, { surface, hsp }) {
  return [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: texteLatin(etage).toUpperCase(), fontSize: 8, bold: true, color: COULEUR.orange },
            { text: designation(piece), fontSize: 17, bold: true, margin: [0, 1, 0, 0] },
          ],
        },
        {
          width: 150, alignment: 'right', fontSize: 9,
          stack: [
            surface
              ? { text: [{ text: 'Surface  ', color: COULEUR.gris, fontSize: 8 }, { text: surface.texte, bold: true }, ...(surface.mesuree ? [{ text: ' (mesurée)', fontSize: 7, color: COULEUR.grisClair }] : [])] }
              : { text: 'Surface inconnue', color: COULEUR.grisClair, fontSize: 8 },
            hsp
              ? { text: [{ text: 'HSP  ', color: COULEUR.gris, fontSize: 8 }, { text: hsp, bold: true }] }
              : { text: 'HSP non relevée', color: COULEUR.grisClair, fontSize: 8 },
          ],
        },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: LARGEUR_UTILE, y2: 4, lineWidth: 1.2, lineColor: COULEUR.orange }], margin: [0, 0, 0, 6] },
  ]
}

function blocSansElement(sansElement) {
  if (!sansElement.length) return []
  return [ensemble([
    titreSection('Points sans élément'),
    {
      text: `${sansElement.length > 1 ? 'Points posés' : 'Point posé'} en visite sans type ni élément exporté :`,
      fontSize: 8.5, color: COULEUR.gris,
    },
    {
      fontSize: 8.5, margin: [0, 2, 0, 0],
      text: sansElement.flatMap((p, i) => [
        ...(i ? [', '] : []),
        { text: `P${p.numero}`, bold: true },
        ...(p.elementAValider ? [{ text: ' (élément à valider)', italics: true, color: COULEUR_PROPOSITION }] : []),
      ]),
    },
  ])]
}

function blocPhotos(photos) {
  if (!photos.length) return []
  const [premiere, ...suite] = lignePhotos(photos, 'petites')
  return [ensemble([titreSection(`Photos (${photos.length})`), premiere]), ...suite]
}

function fichePiece({ etage, piece, elements, sansElement, photos, images, inclurePropositions }) {
  const extrait = prendre(piece.id, images.pieces)
  const resume = resumeFiche({ piece, elements, sansElement, photos, inclurePropositions })
  const { remarques, vide } = resume
  return {
    id: `fiche-${piece.id}`,
    pageBreak: 'before',
    pageOrientation: 'portrait',
    stack: [
      ...enteteFiche(etage, piece, resume),
      ...(resume.ficheProposee ? [{ text: 'Fiche proposée par l’analyse, à valider par l’agence.', italics: true, fontSize: 8.5, color: COULEUR_PROPOSITION, margin: [0, 0, 0, 4] }] : []),
      ...(extrait ? [{ image: extrait, fit: CADRE_PLAN_PIECE, alignment: 'center', margin: [0, 0, 0, 4] }] : []),
      ...(vide ? [discret('Rien n’a été relevé dans cette pièce.')] : []),
      ensemble([titreSection('Finitions'), tableauFinitions(resume.finitions)]),
      ...blocElements(titreSection(`Éléments relevés${elements.length ? ` (${elements.length})` : ''}`), elements),
      ...blocSansElement(sansElement),
      ...(remarques ? [ensemble([titreSection('Remarques'), { text: remarques, fontSize: 9 }], remarques.length < 1500)] : []),
      ...blocPhotos(photos),
    ],
  }
}

// Page des relevés d'un étage posés hors de toute pièce
function pageHorsPieces({ etage, niveauId, elements, sansElement, photos }) {
  return {
    id: `hors-pieces-${niveauId}`,
    pageBreak: 'before',
    pageOrientation: 'portrait',
    stack: [
      { text: texteLatin(etage).toUpperCase(), fontSize: 8, bold: true, color: COULEUR.orange },
      { text: 'Hors pièces', fontSize: 17, bold: true, margin: [0, 1, 0, 0] },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: LARGEUR_UTILE, y2: 4, lineWidth: 1.2, lineColor: COULEUR.orange }], margin: [0, 0, 0, 6] },
      discret('Relevés posés en dehors des pièces dessinées (façade, cour, circulation non découpée…).'),
      ...(elements.length ? blocElements(titreSection(`Éléments relevés (${elements.length})`), elements) : []),
      ...blocSansElement(sansElement),
      ...blocPhotos(photos),
    ],
  }
}

function pagePlan({ niveau, pieces, visitees, nonVisitees, elements, images }) {
  const plan = prendre(niveau.id, images.plans)
  const calques = groupesElements(elements)
  const nom = rempli(niveau.nom) || 'Étage'
  return {
    id: `plan-${niveau.id}`,
    pageBreak: 'before',
    pageOrientation: 'landscape',
    stack: [
      {
        columns: [
          { width: '*', text: [{ text: nom, fontSize: 15, bold: true }, { text: '   Plan de l’étage', fontSize: 10, color: COULEUR.gris }] },
          {
            width: 260, alignment: 'right', fontSize: 8.5, color: COULEUR.gris, margin: [0, 4, 0, 0],
            text: comptesEtage({ pieces, visitees, elements }),
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: A4_PAYSAGE.largeur, y2: 4, lineWidth: 1.2, lineColor: COULEUR.orange }], margin: [0, 0, 0, 4] },
      ...(calques.length ? [{
        fontSize: 8, margin: [0, 0, 0, 4],
        text: [
          { text: 'Calques : ', color: COULEUR.gris },
          ...calques.flatMap((g, i) => [...(i ? [{ text: '  ·  ', color: COULEUR.grisClair }] : []), { text: g.libelle, bold: true, color: couleurCalque(g.calque) }]),
          ...(elements.some((e) => e.aValider) ? [{ text: '  ·  ', color: COULEUR.grisClair }, { text: 'en bleu : à valider', italics: true, color: COULEUR_PROPOSITION }] : []),
        ],
      }] : []),
      plan
        ? { image: plan, fit: CADRE_PLAN_ETAGE, alignment: 'center' }
        : discret('Plan de l’étage indisponible (fichier non chargé).'),
      ...(nonVisitees.length ? [{
        fontSize: 8, color: COULEUR.gris, margin: [0, 6, 0, 0],
        text: [{ text: `Pièce${nonVisitees.length > 1 ? 's' : ''} non visitée${nonVisitees.length > 1 ? 's' : ''} (${nonVisitees.length}, sans fiche) : `, bold: true }, nonVisitees.map(designation).join(', ')],
      }] : []),
    ],
  }
}

/** « Affaire · État des lieux · page n / N » */
export function piedRapportEdl(affaire) {
  const libelle = texteLatin([affaire?.code_affaire, affaire?.nom].filter(Boolean).join(' ')) || 'Affaire'
  return (page, pages) => ({
    margin: [36, 14, 36, 0],
    text: `${libelle} · État des lieux · page ${page} / ${pages}`,
    fontSize: 7, color: COULEUR.gris,
  })
}

const dateIso = (d) => {
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

function pageDeGarde({ affaire, etages, redacteur, date, elementsExport, pieces, images }) {
  const propositions = elementsExport.filter((e) => e.aValider).length
  const affaireLatine = Object.fromEntries(Object.entries(affaire ?? {}).map(([k, v]) => [k, typeof v === 'string' ? texteLatin(v) : v]))
  const d = dateIso(date)
  const entete = (t) => ({ text: t.toUpperCase(), fontSize: 7, color: COULEUR.gris })
  return {
    id: 'garde',
    stack: [
      images.logo ? { image: images.logo, fit: [90, 44] } : { text: '' },
      { text: 'État des lieux', fontSize: 28, bold: true, margin: [0, 40, 0, 2] },
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
    ],
  }
}

/**
 * Ce que contient le rapport, page par page, sans mise en page : la même
 * suite sert au PDF (`definitionRapportEdl`) et au Word
 * (`rapportWordEdl.js`), pour qu'ils disent la même chose.
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
  const exportesParId = new Map(elementsExport.map((e) => [e.id, e]))
  // Par le point (`pointId` d'`elementsAExporter`), puis par les lignes
  // `edl_elements`, puis, en dernier recours, par la position
  const elementsDuPoint = (point) => {
    const parPoint = elementsExport.filter((e) => e.pointId === point.id)
    if (parPoint.length) return parPoint
    const parLigne = (elements ?? []).filter((e) => e.point_id === point.id).map((e) => exportesParId.get(e.id)).filter(Boolean)
    if (parLigne.length) return parLigne
    return elementsExport.filter((e) => e.pointId === undefined && memePosition(e, point))
  }
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

/**
 * Description pdfmake du rapport : la suite de `suiteRapportEdl` mise en
 * page. Paramètres de `suiteRapportEdl`, plus :
 * @param images { logo, photoAffaire, plans: niveauId → JPEG, pieces: pieceId → JPEG,
 *   photos: photoId → JPEG } (data URL, Map ou objet ; une image absente est omise)
 */
export function definitionRapportEdl({
  affaire = null, etat = null, niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, images = {}, redacteur = '', date = null, inclurePropositions = false,
}) {
  const { etages, pages } = suiteRapportEdl({ niveaux, pieces, elementsExport, photos, points, elements, visitees, images, inclurePropositions })
  const contenu = [pageDeGarde({ affaire, etages, redacteur, date: date ?? etat?.created_at ?? null, elementsExport, pieces, images })]
  for (const page of pages) {
    if (page.sorte === 'plan') contenu.push(pagePlan({ ...page, images }))
    else if (page.sorte === 'piece') contenu.push(fichePiece({ ...page, images, inclurePropositions }))
    else contenu.push(pageHorsPieces(page))
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: MARGES,
    info: { title: texteLatin(`État des lieux${affaire?.nom ? ` — ${affaire.nom}` : ''}`), author: 'JGA Architectes' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEUR.texte, lineHeight: 1.15 },
    footer: piedRapportEdl(affaire),
    content: contenu,
  }
}
