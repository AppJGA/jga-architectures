// ─── Rapport Word de l'état des lieux ────────────────────────────────────────
//
// Demande de l'agence (2026-11-19) : le rapport aussi en .docx, pour le
// reprendre à la main après coup. Même contenu que le PDF : la suite des pages
// vient de `suiteRapportEdl` et les textes de `resumeFiche`, `ligneElement`,
// `resumeGarde` (rapportEdlLogique.js). Seule la mise en page est propre au
// Word : vrais titres (volet de navigation de Word), vrais tableaux, images
// posées dans le texte, une section paysage par plan d'étage.
//
// Sans navigateur (docx tourne aussi dans Node) : testé par
// tests/etat-des-lieux-export-word.test.js. Chargé à la demande dans l'app
// (`import()`), docx n'alourdit pas le reste.

import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx'
import { COULEUR } from '../../../chantier/comptes-rendus/rapportLogique.js'
import {
  CADRE_PLAN_ETAGE, CADRE_PLAN_PIECE, COULEUR_PROPOSITION, comptesEtage, couleurCalque, designationPiece, groupesElements,
  ligneElement, resumeFiche, resumeGarde, suiteRapportEdl, texteLatin,
} from './rapportEdlLogique.js'

export { Packer }

// ─── Unités ──────────────────────────────────────────────────────────────────

// Word compte en vingtièmes de point (twips), les images en pixels à 96 ppp
const twips = (pt) => Math.round(pt * 20)
const px = (pt) => (pt * 96) / 72
const demi = (pt) => Math.round(pt * 2) // tailles de police en demi-points
const hex = (c) => String(c).replace(/^#/, '').toUpperCase()

const A4 = { largeur: 595, hauteur: 842 }
const MARGES = { haut: 36, droite: 36, bas: 44, gauche: 36 }
const LARGEUR_UTILE = A4.largeur - MARGES.gauche - MARGES.droite // 523 pt
// Un peu moins haut que dans le PDF : les paragraphes de Word ont leur
// interligne, une image trop haute passerait seule à la page suivante
const CADRE_ETAGE = [CADRE_PLAN_ETAGE[0], CADRE_PLAN_ETAGE[1] - 25]

// ─── Images ──────────────────────────────────────────────────────────────────

/**
 * Largeur et hauteur d'un JPEG, lues dans son en-tête (segment SOF) : Word
 * veut la taille d'affichage, et l'image arrive en octets.
 * @returns { largeur, hauteur } ou null si ce n'est pas un JPEG lisible
 */
export function dimensionsJpeg(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets ?? [])
  if (o.length < 4 || o[0] !== 0xFF || o[1] !== 0xD8) return null
  let i = 2
  while (i + 9 < o.length) {
    if (o[i] !== 0xFF) { i++; continue }
    const marqueur = o[i + 1]
    // Bourrage, ou marqueurs sans longueur
    if (marqueur === 0xFF) { i++; continue }
    if (marqueur === 0xD8 || marqueur === 0x01 || (marqueur >= 0xD0 && marqueur <= 0xD7)) { i += 2; continue }
    const longueur = (o[i + 2] << 8) | o[i + 3]
    const sof = marqueur >= 0xC0 && marqueur <= 0xCF && marqueur !== 0xC4 && marqueur !== 0xC8 && marqueur !== 0xCC
    if (sof) {
      const hauteur = (o[i + 5] << 8) | o[i + 6]
      const largeur = (o[i + 7] << 8) | o[i + 8]
      return largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null
    }
    if (longueur < 2) return null
    i += 2 + longueur
  }
  return null
}

/** Taille (points) d'une image posée dans le cadre [l, h], proportions gardées. */
export function tailleDansCadre(dimensions, [l, h]) {
  if (!dimensions) return { largeur: l, hauteur: Math.min(h, (l * 3) / 4) }
  const k = Math.min(l / dimensions.largeur, h / dimensions.hauteur)
  return { largeur: dimensions.largeur * k, hauteur: dimensions.hauteur * k }
}

const prendre = (cle, collection) => (collection instanceof Map ? collection.get(cle) : collection?.[cle]) ?? null

function image(octets, cadre, { centre = false, avant = 0, apres = 4 } = {}) {
  const t = tailleDansCadre(dimensionsJpeg(octets), cadre)
  return new Paragraph({
    alignment: centre ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: twips(avant), after: twips(apres) },
    children: [new ImageRun({ type: 'jpg', data: octets, transformation: { width: Math.round(px(t.largeur)), height: Math.round(px(t.hauteur)) } })],
  })
}

// ─── Textes ──────────────────────────────────────────────────────────────────

const t = (texte, { taille, color, ...options } = {}) => new TextRun({
  text: texte, ...options, ...(color ? { color: hex(color) } : {}), ...(taille ? { size: demi(taille) } : {}),
})

const paragraphe = (enfants, options = {}) => new Paragraph({ children: Array.isArray(enfants) ? enfants : [enfants], ...options })

const discret = (texte) => paragraphe(t(texte, { italics: true, taille: 8.5, color: COULEUR.grisClair }), { spacing: { before: twips(2), after: twips(4) } })

const titre1 = (enfants, { saut = false } = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: saut, keepNext: true, children: enfants })
const titre2 = (texte) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(texte)] })
const titre3 = (texte, couleur) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [t(texte, { color: couleur })] })

// Le filet orange sous un titre de page : bordure basse d'un paragraphe vide
const filet = () => new Paragraph({
  spacing: { before: 0, after: twips(6) },
  border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: hex(COULEUR.orange), space: 1 } },
  children: [],
})

// ─── Tableaux ────────────────────────────────────────────────────────────────

const SANS = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const FILET = { style: BorderStyle.SINGLE, size: 4, color: hex(COULEUR.filet) }
const BORDURES_FINES = { top: SANS, bottom: SANS, left: SANS, right: SANS, insideHorizontal: FILET, insideVertical: SANS }
const BORDURES_AUCUNE = { top: SANS, bottom: SANS, left: SANS, right: SANS, insideHorizontal: SANS, insideVertical: SANS }
const MARGES_CASE = { top: twips(3), bottom: twips(3), left: twips(4), right: twips(4) }

function tableau(lignes, largeurs, { bordures = BORDURES_FINES, fond = null, entete = false } = {}) {
  const total = largeurs.reduce((a, b) => a + b, 0)
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: twips(total), type: WidthType.DXA },
    columnWidths: largeurs.map(twips),
    borders: bordures,
    rows: lignes.map((cases, i) => new TableRow({
      cantSplit: true,
      tableHeader: entete && i === 0,
      children: cases.map((contenu, j) => new TableCell({
        width: { size: twips(largeurs[j]), type: WidthType.DXA },
        margins: MARGES_CASE,
        ...(typeof fond === 'function' ? (fond(i) ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(fond(i)) } } : {}) : fond ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(fond) } } : {}),
        children: Array.isArray(contenu) ? contenu : [contenu],
      })),
    })),
  })
}

const espace = (pt = 6) => new Paragraph({ spacing: { before: 0, after: twips(pt) }, children: [] })

// ─── Pages ───────────────────────────────────────────────────────────────────

function pageDeGarde({ garde, images }) {
  const entete = (texte) => paragraphe(t(texte.toUpperCase(), { taille: 7, color: COULEUR.gris }))
  const valeur = (texte, gras = false) => paragraphe(t(texte || '—', { bold: gras }))
  return [
    ...(images.logo ? [image(images.logo, [90, 44])] : []),
    paragraphe(t('État des lieux', { bold: true, taille: 28 }), { spacing: { before: twips(40), after: twips(2) } }),
    paragraphe(t(garde.nom, { taille: 16, color: COULEUR.texte })),
    ...(garde.code ? [paragraphe(t(garde.code, { taille: 12, color: COULEUR.orange }), { spacing: { before: twips(2) } })] : []),
    filet(),
    ...(images.photoAffaire ? [image(images.photoAffaire, [LARGEUR_UTILE, 260], { apres: 10 })] : []),
    tableau([
      ['Affaire', 'Code', 'Adresse', 'Maître d’ouvrage'].map(entete),
      [valeur(garde.nom, true), valeur(garde.code), valeur(garde.adresse), valeur(garde.moa)],
    ], [160, 70, 147, 146], { bordures: BORDURES_AUCUNE, fond: '#F5F5F5' }),
    espace(8),
    tableau([
      [entete('Date'), entete('Rédacteur')],
      [valeur(garde.date, true), valeur(garde.redacteur, true)],
    ], [LARGEUR_UTILE / 2, LARGEUR_UTILE / 2], { bordures: BORDURES_AUCUNE, fond: '#F5F5F5' }),
    espace(8),
    titre2('Étages'),
    tableau([
      ['Étage', 'Pièces', 'Visitées', 'Éléments'].map((x, i) => paragraphe(t(x, { bold: true, taille: 8, color: '#FFFFFF' }), { alignment: i ? AlignmentType.RIGHT : AlignmentType.LEFT })),
      ...garde.etages.map((e) => [
        paragraphe(t(e.nom)),
        ...[e.pieces, e.visitees, e.elements].map((v) => paragraphe(t(String(v)), { alignment: AlignmentType.RIGHT })),
      ]),
    ], [LARGEUR_UTILE - 180, 60, 60, 60], { fond: (i) => (i === 0 ? COULEUR.texte : null), entete: true }),
    ...(garde.propositions ? [paragraphe(t(garde.propositions, { italics: true, taille: 8.5, color: COULEUR_PROPOSITION }), { spacing: { before: twips(8) } })] : []),
  ]
}

function pagePlan({ niveau, pieces, visitees, nonVisitees, elements, images }) {
  const plan = prendre(niveau.id, images.plans)
  const calques = groupesElements(elements)
  const nom = texteLatin(niveau.nom).trim() || 'Étage'
  const separateur = () => t('  ·  ', { color: COULEUR.grisClair })
  return [
    titre1([new TextRun(nom), t('   Plan de l’étage', { bold: false, taille: 10, color: COULEUR.gris })]),
    paragraphe(t(comptesEtage({ pieces, visitees, elements }), { taille: 8.5, color: COULEUR.gris }), { spacing: { after: 0 } }),
    filet(),
    ...(calques.length ? [paragraphe([
      t('Calques : ', { taille: 8, color: COULEUR.gris }),
      ...calques.flatMap((g, i) => [...(i ? [separateur()] : []), t(g.libelle, { bold: true, taille: 8, color: couleurCalque(g.calque) })]),
      ...(elements.some((e) => e.aValider) ? [separateur(), t('en bleu : à valider', { italics: true, taille: 8, color: COULEUR_PROPOSITION })] : []),
    ], { spacing: { after: twips(4) } })] : []),
    plan ? image(plan, CADRE_ETAGE, { centre: true }) : discret('Plan de l’étage indisponible (fichier non chargé).'),
    ...(nonVisitees.length ? [paragraphe([
      t(`Pièce${nonVisitees.length > 1 ? 's' : ''} non visitée${nonVisitees.length > 1 ? 's' : ''} (${nonVisitees.length}, sans fiche) : `, { bold: true, taille: 8, color: COULEUR.gris }),
      t(nonVisitees.map(designationPiece).join(', '), { taille: 8, color: COULEUR.gris }),
    ], { spacing: { before: twips(6) } })] : []),
  ]
}

function blocElements(titre, elements) {
  if (!elements.length) return [titre2(titre), discret('Aucun élément relevé.')]
  return [
    titre2(titre),
    ...groupesElements(elements).flatMap((g) => [
      titre3(g.libelle, couleurCalque(g.calque)),
      tableau(g.elements.map((e) => {
        const l = ligneElement(e)
        return [
          paragraphe(t(l.numero, { bold: true, color: l.aValider ? COULEUR_PROPOSITION : couleurCalque(g.calque) })),
          paragraphe([
            t(l.libelle),
            ...(l.type ? [t(`  ${l.type}`, { taille: 7.5, color: COULEUR.gris })] : []),
            ...(l.aValider ? [t('  (à valider)', { italics: true, color: COULEUR_PROPOSITION })] : []),
            ...(l.sansPoint ? [t('  (sans point sur le plan)', { taille: 7.5, italics: true, color: COULEUR.grisClair })] : []),
          ]),
          paragraphe(t(l.cotes, { taille: 8.5 })),
        ]
      }), [34, LARGEUR_UTILE - 34 - 150, 150]),
    ]),
  ]
}

function blocSansElement(sansElement) {
  if (!sansElement.length) return []
  return [
    titre2('Points sans élément'),
    paragraphe(t(`${sansElement.length > 1 ? 'Points posés' : 'Point posé'} en visite sans type ni élément exporté :`, { taille: 8.5, color: COULEUR.gris })),
    paragraphe(sansElement.flatMap((p, i) => [
      ...(i ? [t(', ', { taille: 8.5 })] : []),
      t(`P${p.numero}`, { bold: true, taille: 8.5 }),
      ...(p.elementAValider ? [t(' (élément à valider)', { italics: true, taille: 8.5, color: COULEUR_PROPOSITION })] : []),
    ]), { spacing: { before: twips(2) } }),
  ]
}

// Trois photos par rangée, légende dessous ; un tableau sans bordures, que
// Word laisse déplacer ou retailler
function blocPhotos(photos) {
  if (!photos.length) return []
  const parLigne = 3
  const ecart = 8
  const largeur = (LARGEUR_UTILE - ecart * (parLigne - 1)) / parLigne
  const colonnes = []
  for (let i = 0; i < parLigne; i++) colonnes.push(largeur + (i < parLigne - 1 ? ecart : 0))
  const lignes = []
  for (let i = 0; i < photos.length; i += parLigne) {
    const morceau = photos.slice(i, i + parLigne)
    lignes.push(Array.from({ length: parLigne }, (_, j) => {
      const ph = morceau[j]
      if (!ph) return paragraphe([])
      return [
        image(ph.image, [largeur - 8, (largeur - 8) * 0.75], { apres: 2 }),
        ...(ph.legende ? [paragraphe(t(ph.legende, { taille: 7, color: COULEUR.gris }))] : []),
      ]
    }))
  }
  return [titre2(`Photos (${photos.length})`), tableau(lignes, colonnes, { bordures: BORDURES_AUCUNE })]
}

function fichePiece({ etage, piece, elements, sansElement, photos, images, inclurePropositions, saut }) {
  const extrait = prendre(piece.id, images.pieces)
  const r = resumeFiche({ piece, elements, sansElement, photos, inclurePropositions })
  const mesure = (libelle, valeur, absent, mesuree = false) => (valeur
    ? [t(`${libelle}  `, { taille: 8, color: COULEUR.gris }), t(valeur, { bold: true }), ...(mesuree ? [t(' (mesurée)', { taille: 7, color: COULEUR.grisClair })] : [])]
    : [t(absent, { taille: 8, color: COULEUR.grisClair })])
  return [
    new Paragraph({ pageBreakBefore: saut, keepNext: true, spacing: { after: 0 }, children: [t(texteLatin(etage).toUpperCase(), { bold: true, taille: 8, color: COULEUR.orange })] }),
    titre1([new TextRun(designationPiece(piece))]),
    paragraphe([
      ...mesure('Surface', r.surface?.texte, 'Surface inconnue', r.surface?.mesuree),
      t('     '),
      ...mesure('HSP', r.hsp, 'HSP non relevée'),
    ], { spacing: { after: 0 } }),
    filet(),
    ...(r.ficheProposee ? [paragraphe(t('Fiche proposée par l’analyse, à valider par l’agence.', { italics: true, taille: 8.5, color: COULEUR_PROPOSITION }), { spacing: { after: twips(4) } })] : []),
    ...(extrait ? [image(extrait, CADRE_PLAN_PIECE, { centre: true })] : []),
    ...(r.vide ? [discret('Rien n’a été relevé dans cette pièce.')] : []),
    titre2('Finitions'),
    tableau(r.finitions.map(({ libelle, valeur }) => [
      paragraphe(t(libelle, { bold: true, taille: 8.5, color: COULEUR.gris })),
      paragraphe(valeur ? t(valeur) : t('Non relevé', { italics: true, taille: 8.5, color: COULEUR.grisClair })),
    ]), [70, LARGEUR_UTILE - 70]),
    ...blocElements(`Éléments relevés${elements.length ? ` (${elements.length})` : ''}`, elements),
    ...blocSansElement(sansElement),
    // Les retours à la ligne de la dictée restent des paragraphes
    ...(r.remarques ? [titre2('Remarques'), ...r.remarques.split('\n').map((l) => paragraphe(t(l)))] : []),
    ...blocPhotos(photos),
  ]
}

function pageHorsPieces({ etage, elements, sansElement, photos, saut }) {
  return [
    new Paragraph({ pageBreakBefore: saut, keepNext: true, spacing: { after: 0 }, children: [t(texteLatin(etage).toUpperCase(), { bold: true, taille: 8, color: COULEUR.orange })] }),
    titre1([new TextRun('Hors pièces')]),
    filet(),
    discret('Relevés posés en dehors des pièces dessinées (façade, cour, circulation non découpée…).'),
    ...(elements.length ? blocElements(`Éléments relevés (${elements.length})`, elements) : []),
    ...blocSansElement(sansElement),
    ...blocPhotos(photos),
  ]
}

// ─── Document ────────────────────────────────────────────────────────────────

function pied(affaire) {
  const libelle = texteLatin([affaire?.code_affaire, affaire?.nom].filter(Boolean).join(' ')) || 'Affaire'
  const run = (enfants) => new TextRun({ children: enfants, size: demi(7), color: hex(COULEUR.gris) })
  return new Footer({
    children: [new Paragraph({ children: [run([`${libelle} · État des lieux · page `]), run([PageNumber.CURRENT]), run([' / ']), run([PageNumber.TOTAL_PAGES])] })],
  })
}

const proprietesPage = (paysage) => ({
  page: {
    size: { width: twips(A4.largeur), height: twips(A4.hauteur), orientation: paysage ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
    margin: { top: twips(MARGES.haut), right: twips(MARGES.droite), bottom: twips(MARGES.bas), left: twips(MARGES.gauche), footer: twips(20), header: twips(18) },
  },
})

const POLICE = 'Arial'

/**
 * Le rapport Word (objet `Document` de docx, à passer à `Packer`).
 * Paramètres de `suiteRapportEdl` ; les images sont des octets JPEG
 * (Uint8Array) : { logo, photoAffaire, plans: niveauId → octets,
 * pieces: pieceId → octets, photos: photoId → octets } (Map ou objet).
 */
export function documentWordEdl({
  affaire = null, etat = null, niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, images = {}, redacteur = '', date = null, inclurePropositions = false,
}) {
  const { etages, pages } = suiteRapportEdl({ niveaux, pieces, elementsExport, photos, points, elements, visitees, images, inclurePropositions })
  const garde = resumeGarde({ affaire, etages, redacteur, date: date ?? etat?.created_at ?? null, elementsExport, pieces })
  const footers = { default: pied(affaire) }

  // Une section par orientation : la garde, puis chaque plan d'étage en
  // paysage suivi des fiches de ses pièces en portrait
  const sections = [{ properties: proprietesPage(false), footers, children: pageDeGarde({ garde, images }) }]
  let courante = null
  for (const page of pages) {
    if (page.sorte === 'plan') {
      sections.push({ properties: proprietesPage(true), footers, children: pagePlan({ ...page, images }) })
      courante = null
      continue
    }
    if (!courante) {
      courante = { properties: proprietesPage(false), footers, children: [] }
      sections.push(courante)
    }
    // Une section commence sur une page neuve : pas de saut en tête
    const saut = courante.children.length > 0
    courante.children.push(...(page.sorte === 'piece'
      ? fichePiece({ ...page, images, inclurePropositions, saut })
      : pageHorsPieces({ ...page, saut })))
  }

  return new Document({
    creator: 'JGA Architectes',
    title: texteLatin(`État des lieux${affaire?.nom ? ` — ${affaire.nom}` : ''}`),
    styles: {
      default: {
        document: { run: { font: POLICE, size: demi(9), color: hex(COULEUR.texte) }, paragraph: { spacing: { line: 264 } } },
        heading1: { run: { font: POLICE, size: demi(17), bold: true, color: hex(COULEUR.texte) }, paragraph: { spacing: { before: twips(1), after: 0 } } },
        heading2: { run: { font: POLICE, size: demi(9.5), bold: true, allCaps: true, color: hex(COULEUR.orange) }, paragraph: { spacing: { before: twips(12), after: twips(4) } } },
        heading3: { run: { font: POLICE, size: demi(9), bold: true }, paragraph: { spacing: { before: twips(4), after: twips(2) } } },
      },
    },
    sections,
  })
}

/** « 2026-11-18-2618-etat-des-lieux.docx », à côté du PDF */
export { nomFichierWordEdl } from './rapportEdlLogique.js'
