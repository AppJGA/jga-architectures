// ─── Rapport Word de l'état des lieux ────────────────────────────────────────
//
// Demande de l'agence (2026-11-19) : le rapport aussi en .docx, pour le
// reprendre à la main après coup. Même suite et même contenu que le PDF :
// garde A4 (chiffres clés et points d'attention en vrai texte), une planche
// A3 paysage par étage, les tableaux par niveau (A3 paysage), l'annexe des
// photos (A4). Ce qui s'y lit se décide ailleurs, une fois pour les deux
// formats : `misePlanche` (plancheEdl.js), `tableauxDuRapport` /
// `syntheseRapport` (tableauxEdlLogique.js), `resumeGarde`, `photosAnnexeEdl`
// et les textes des tableaux (rapportEdlLogique.js).
//
// Planche : comme l'exemple Word de l'agence, le plan est une image de fond
// pleine page, verrouillée et derrière le texte ; la légende et chaque
// symbole sont des images flottantes posées par rapport à la page, que l'on
// déplace à la souris pour corriger un relevé. Les images (fond sans
// symboles ni légende, légende seule, une image par clé de symbole) arrivent
// dessinées par `genererRapportEdl.js` ; deux symboles de même clé partagent
// la même image (Word ne la range qu'une fois).
//
// Statuts des matériaux : pas d'étiquette cernée comme dans le PDF (un
// tableau dans chaque case serait lourd à reprendre), un mot coloré —
// Conserver vert gras, Rafraîchir brun gras sur fond clair, Déposer blanc
// gras sur orange foncé, À préciser gris italique.
//
// Sans navigateur (docx tourne aussi dans Node) : testé par
// tests/etat-des-lieux-export-word.test.js. Chargé à la demande dans l'app
// (`import()`), docx n'alourdit pas le reste.

import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, HorizontalPositionRelativeFrom, ImageRun, Packer, PageNumber,
  PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, TextWrappingType,
  VerticalPositionRelativeFrom, WidthType,
} from 'docx'
import { COULEUR } from '../../../chantier/comptes-rendus/rapportLogique.js'
import { CHAMPS_PORTE, LIBELLES_PORTE, STATUTS, infosStatut } from '../statutsEdl.js'
import { PX_PAR_MM, tailleImageLegende, tailleImageSymbole } from './dessinPlancheEdl.js'
import {
  AUCUNE_PIECE_VISITEE, AUCUN_POINT_ATTENTION, CHARTE, COULEUR_PROPOSITION, NOTE_LECTURE_TABLEAU, SURTITRE_TABLEAUX,
  TITRE_ANNEXE_PHOTOS, TITRE_LECTURE_TABLEAU, photosAnnexeEdl, propositionsTableaux, resumeGarde, sourcesRapportEdl,
  texteLatin, texteNonVisitees, titreTableauxEdl,
} from './rapportEdlLogique.js'
import { syntheseRapport, tableauxDuRapport, texteComptes } from './tableauxEdlLogique.js'

export { Packer }

// ─── Unités ──────────────────────────────────────────────────────────────────

// Word compte en vingtièmes de point (twips), les images en pixels à 96 ppp,
// les positions des images flottantes en EMU (36 000 par millimètre)
const twips = (pt) => Math.round(pt * 20)
const twipsMm = (mm) => Math.round((mm * 1440) / 25.4)
const px = (pt) => (pt * 96) / 72
const pxMm = (mm) => (mm * 96) / 25.4
export const emu = (mm) => Math.round(mm * 36000)
const demi = (pt) => Math.round(pt * 2) // tailles de police en demi-points
const hex = (c) => String(c).replace(/^#/, '').toUpperCase()

// Feuilles en twips, côté court puis côté long (docx échange les deux en paysage)
const A4 = { court: 11906, long: 16838 }
const A3 = { court: 16838, long: 23811 }
const MARGES = { haut: 36, droite: 36, bas: 44, gauche: 36 }
const LARGEUR_UTILE = (A4.court - twips(MARGES.gauche) - twips(MARGES.droite)) / 20 // 523 pt
const LARGEUR_A3 = A3.long - twips(MARGES.gauche) - twips(MARGES.droite) // twips

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
  const taille = tailleDansCadre(dimensionsJpeg(octets), cadre)
  return new Paragraph({
    alignment: centre ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: twips(avant), after: twips(apres) },
    children: [new ImageRun({ type: 'jpg', data: octets, transformation: { width: Math.round(px(taille.largeur)), height: Math.round(px(taille.hauteur)) } })],
  })
}

/**
 * Image flottante posée par rapport à la page (mm du papier, y vers le bas),
 * sans habillage : le texte ne l'écarte pas et elle peut en chevaucher une
 * autre. `fond` : derrière le texte et verrouillée (le plan), comme
 * l'exemple de l'agence ; sinon déplaçable.
 */
function flottante({ type, data, xMm, yMm, largeurMm, hauteurMm, nom, rang, fond = false }) {
  return new ImageRun({
    type,
    data,
    transformation: { width: pxMm(largeurMm), height: pxMm(hauteurMm) },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(xMm) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(yMm) },
      wrap: { type: TextWrappingType.NONE },
      allowOverlap: true,
      behindDocument: fond,
      lockAnchor: fond,
      zIndex: rang,
    },
    altText: { name: nom, description: nom, title: nom },
  })
}

// ─── Textes ──────────────────────────────────────────────────────────────────

const t = (texte, { taille, color, ...options } = {}) => new TextRun({
  text: texte, ...options, ...(color ? { color: hex(color) } : {}), ...(taille ? { size: demi(taille) } : {}),
})

const paragraphe = (enfants, options = {}) => new Paragraph({ children: Array.isArray(enfants) ? enfants : [enfants], ...options })

const titre2 = (texte) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(texte)] })

// Le filet orange sous un titre de page : bordure basse d'un paragraphe vide
const filet = (couleur = COULEUR.orange, epaisseur = 10) => new Paragraph({
  spacing: { before: 0, after: twips(6) },
  border: { bottom: { style: BorderStyle.SINGLE, size: epaisseur, color: hex(couleur), space: 1 } },
  children: [],
})

const espace = (pt = 6) => new Paragraph({ spacing: { before: 0, after: twips(pt) }, children: [] })

// ─── Tableaux ────────────────────────────────────────────────────────────────

const SANS = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const trait = (couleur, pt = 0.5) => ({ style: BorderStyle.SINGLE, size: Math.max(2, Math.round(pt * 8)), color: hex(couleur) })
const FILET = trait(COULEUR.filet)
const BORDURES_FINES = { top: SANS, bottom: SANS, left: SANS, right: SANS, insideHorizontal: FILET, insideVertical: SANS }
const BORDURES_AUCUNE = { top: SANS, bottom: SANS, left: SANS, right: SANS, insideHorizontal: SANS, insideVertical: SANS }
const CASE_SANS = { top: SANS, bottom: SANS, left: SANS, right: SANS }
const MARGES_CASE = { top: twips(3), bottom: twips(3), left: twips(4), right: twips(4) }
const fondCase = (couleur) => (couleur ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(couleur) } } : {})

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
        ...fondCase(typeof fond === 'function' ? fond(i) : fond),
        children: Array.isArray(contenu) ? contenu : [contenu],
      })),
    })),
  })
}

// ─── Garde ───────────────────────────────────────────────────────────────────

// Chiffres clés : un filet orange au-dessus de chacun, séparés par des
// colonnes vides (Word n'a pas d'écart entre cases)
function blocChiffres(chiffres) {
  if (!chiffres.length) return []
  const ecart = 12
  const largeur = (LARGEUR_UTILE - ecart * (chiffres.length - 1)) / chiffres.length
  const largeurs = chiffres.flatMap((_, i) => (i ? [ecart, largeur] : [largeur]))
  const cases = chiffres.flatMap((c, i) => {
    const chiffre = new TableCell({
      width: { size: twips(largeur), type: WidthType.DXA },
      margins: { top: twips(5), bottom: 0, left: 0, right: 0 },
      borders: { ...CASE_SANS, top: trait(CHARTE.orange, 3) },
      children: [
        paragraphe(t(c.valeur, { bold: true, taille: 22, color: CHARTE.encre })),
        paragraphe(t(c.libelle, { taille: 7.5, color: CHARTE.discret })),
        ...(c.detail ? [paragraphe(t(c.detail, { taille: 6.5, color: CHARTE.discret }), { spacing: { before: twips(1) } })] : []),
      ],
    })
    const vide = new TableCell({ width: { size: twips(ecart), type: WidthType.DXA }, borders: CASE_SANS, children: [paragraphe([])] })
    return i ? [vide, chiffre] : [chiffre]
  })
  return [
    espace(10),
    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: twips(LARGEUR_UTILE), type: WidthType.DXA },
      columnWidths: largeurs.map(twips),
      borders: BORDURES_AUCUNE,
      rows: [new TableRow({ cantSplit: true, children: cases })],
    }),
  ]
}

function blocAttention(attention) {
  const lignes = attention.length
    ? attention.map((a) => paragraphe([t(`${a.titre}  `, { bold: true, taille: 8.5, color: CHARTE.encre }), t(a.texte, { taille: 8.5, color: CHARTE.encre })], { spacing: { after: twips(3) } }))
    : [paragraphe(t(AUCUN_POINT_ATTENTION, { taille: 8.5, color: CHARTE.discret }))]
  return [
    paragraphe(t('POINTS D’ATTENTION', { bold: true, taille: 9.5, color: CHARTE.encre }), { keepNext: true, spacing: { before: twips(16), after: twips(4) } }),
    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: twips(LARGEUR_UTILE), type: WidthType.DXA },
      columnWidths: [twips(LARGEUR_UTILE)],
      borders: BORDURES_AUCUNE,
      rows: [new TableRow({
        children: [new TableCell({
          width: { size: twips(LARGEUR_UTILE), type: WidthType.DXA },
          margins: { top: twips(8), bottom: twips(5), left: twips(10), right: twips(10) },
          borders: { ...CASE_SANS, left: trait(CHARTE.orange, 3) },
          ...fondCase(CHARTE.fondAttention),
          children: lignes,
        })],
      })],
    }),
  ]
}

function pageDeGarde({ garde, synthese, images }) {
  const entete = (texte) => paragraphe(t(texte.toUpperCase(), { taille: 7, color: COULEUR.gris }))
  const valeur = (texte, gras = false) => paragraphe(t(texte || '—', { bold: gras }))
  return [
    ...(images.logo ? [image(images.logo, [90, 44])] : []),
    new Paragraph({
      heading: HeadingLevel.HEADING_1, spacing: { before: twips(28), after: twips(2) },
      children: [t('État des lieux', { bold: true, taille: 28 })],
    }),
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
    ...blocChiffres(synthese.chiffres),
    ...blocAttention(synthese.attention),
  ]
}

// ─── Planches ────────────────────────────────────────────────────────────────

/**
 * Les images flottantes d'une planche, dans l'ordre d'empilement : fond
 * (verrouillé, derrière), légende, puis chaque symbole posé pour que son
 * point d'insertion tombe sur (xMm, yMm). L'image d'une clé est faite
 * d'après le premier symbole qui la porte (`genererRapportEdl.js`) : sa
 * taille et son point d'insertion se relisent donc sur lui.
 */
export function imagesPlancheWord({ mise, pxParMm = PX_PAR_MM, fond = null, legende = null, symboles = new Map() }) {
  const p = pxParMm || PX_PAR_MM
  const images = []
  let rang = 1
  if (fond) {
    images.push({
      type: 'jpg', data: fond, xMm: 0, yMm: 0, largeurMm: mise.format.largeur, hauteurMm: mise.format.hauteur,
      nom: texteLatin(`Fond de plan ${mise.cartouche?.titre ?? mise.etage ?? ''}`).trim(), rang: rang++, fond: true,
    })
  }
  if (legende && mise.legende?.cadreMm) {
    const taille = tailleImageLegende(mise.legende, p)
    images.push({
      type: 'png', data: legende,
      xMm: mise.legende.cadreMm.x - taille.origine[0] / p, yMm: mise.legende.cadreMm.y - taille.origine[1] / p,
      largeurMm: taille.largeur / p, hauteurMm: taille.hauteur / p, nom: 'Légende', rang: rang++,
    })
  }
  const tailles = new Map()
  for (const s of mise.symboles ?? []) {
    const data = prendre(s.cle, symboles)
    if (!data) continue
    if (!tailles.has(s.cle)) tailles.set(s.cle, tailleImageSymbole(s, p))
    const taille = tailles.get(s.cle)
    images.push({
      type: 'png', data,
      xMm: s.xMm - taille.centre[0] / p, yMm: s.yMm - taille.centre[1] / p,
      largeurMm: taille.largeur / p, hauteurMm: taille.hauteur / p, nom: texteLatin(s.nom) || 'Élément', rang: rang++,
    })
  }
  return images
}

const indisponible = (nom) => paragraphe([
  t(`${nom} — Plan indisponible`, { bold: true, taille: 11, color: CHARTE.encre }),
  t(' : la planche de l’étage n’a pas pu être dessinée.', { taille: 9, color: CHARTE.discret }),
], { spacing: { before: twips(22) }, indent: { left: twipsMm(10) } })

function pagePlanche(planche, nom) {
  const images = imagesPlancheWord(planche)
  return [
    // Un seul paragraphe porte toutes les images, comme l'exemple de l'agence
    new Paragraph({ spacing: { before: 0, after: 0 }, children: images.map(flottante) }),
    ...(planche.fond ? [] : [indisponible(nom)]),
  ]
}

// ─── Tableaux par niveau ─────────────────────────────────────────────────────

// Rafraîchir : fond clair propre au Word (le PDF cerne l'étiquette en pointillé)
const FOND_RAFRAICHIR = '#FFF4E0'

/** Le mot du statut, en couleur, suivi d'un espace (voir l'en-tête). */
function etiquette(code) {
  const st = infosStatut(code)
  const fond = st.code === 'rafraichir' ? FOND_RAFRAICHIR : st.fond
  return [
    new TextRun({
      text: `\u00A0${texteLatin(st.libelle).toUpperCase()}\u00A0`,
      size: demi(6.5),
      characterSpacing: 6,
      color: hex(st.texte),
      ...(st.code === 'a-preciser' ? { italics: true } : { bold: true }),
      ...(fond ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(fond) } } : {}),
    }),
    t('  ', { taille: 8 }),
  ]
}

// Pièce, Sol, Mur, Plafond, Bloc porte, Équipements, Points particuliers :
// les largeurs du PDF (points), la dernière colonne prend le reste de l'A3
const COLONNES = ['Pièce', 'Sol', 'Mur', 'Plafond', 'Bloc porte', 'Équipements', 'Points particuliers']
const LARGEURS_COLONNES = (() => {
  const fixes = [120, 150, 140, 130, 140, 190].map(twips)
  return [...fixes, LARGEUR_A3 - fixes.reduce((a, b) => a + b, 0)]
})()

const nonDecrit = () => paragraphe(t('Non décrit', { italics: true, taille: 7.5, color: CHARTE.discret }))
const sansObjet = () => paragraphe(t('—', { taille: 8, color: CHARTE.filet }))
const marqueAValider = () => t(' (à valider)', { italics: true, taille: 8, color: COULEUR_PROPOSITION })
const ecartItem = (i, pt = 3) => ({ spacing: { before: i ? twips(pt) : 0 } })

function celluleMateriaux(items, aValider) {
  if (!items.length) return [nonDecrit()]
  return items.map((it, i) => paragraphe([
    ...etiquette(it.statut), t(it.texte, { taille: 8, color: CHARTE.encre }), ...(aValider || it.aValider ? [marqueAValider()] : []),
  ], ecartItem(i)))
}

function cellulePorte(porte, aValider) {
  if (!porte) return [nonDecrit()]
  return [
    paragraphe(etiquette(porte.statut), { spacing: { after: twips(1) } }),
    ...CHAMPS_PORTE.filter((c) => porte[c]).map((c) => paragraphe([
      t(`${LIBELLES_PORTE[c].toUpperCase()}  `, { taille: 5.5, color: CHARTE.discret, characterSpacing: 8 }),
      t(porte[c], { taille: 8, color: CHARTE.encre }),
    ], { spacing: { after: twips(1) } })),
    ...(aValider ? [paragraphe(t('à valider', { italics: true, taille: 7, color: COULEUR_PROPOSITION }))] : []),
  ]
}

function celluleListe(items) {
  if (!items.length) return [nonDecrit()]
  return items.map((it, i) => paragraphe([
    t(it.texte, { taille: 8, color: CHARTE.encre }), ...(it.aValider ? [marqueAValider()] : []),
  ], ecartItem(i, 2.5)))
}

function cellulePiece({ piece, ficheAValider, hors }) {
  const note = (texte, couleur = CHARTE.discret) => paragraphe(t(texte, { italics: true, taille: 6.5, color: couleur }), { spacing: { before: twips(1) } })
  return [
    paragraphe([
      ...(piece.numero ? [t(`${piece.numero}  `, { bold: true, taille: 7.5, color: CHARTE.orangeFonce })] : []),
      t(piece.designation, { bold: true, taille: 11, color: hors ? CHARTE.discret : CHARTE.encre }),
    ]),
    ...(piece.surface || piece.hsp
      ? [paragraphe(t([piece.surface, piece.hsp ? `HSP ${piece.hsp}` : null].filter(Boolean).join(' · '), { taille: 7, color: CHARTE.discret }), { spacing: { before: twips(1) } })]
      : []),
    ...(hors ? [note('Relevés posés en dehors des pièces dessinées')] : []),
    ...(ficheAValider ? [note('Fiche proposée, à valider', COULEUR_PROPOSITION)] : []),
  ]
}

// Une rangée par pièce, même très haute : Word la coupe d'une page à l'autre
// (le PDF, lui, la découpe en rangées « (suite) »)
function rangeePiece(l) {
  const vide = (items, cellule) => (l.hors && !items?.length ? [sansObjet()] : cellule())
  const contenus = [
    cellulePiece(l),
    ...(l.hors ? [[sansObjet()], [sansObjet()], [sansObjet()], [sansObjet()]] : [
      celluleMateriaux(l.sol, l.ficheAValider),
      celluleMateriaux(l.mur, l.ficheAValider),
      celluleMateriaux(l.plafond, l.ficheAValider),
      cellulePorte(l.porte, l.ficheAValider),
    ]),
    vide(l.equipements, () => celluleListe(l.equipements)),
    vide(l.particuliers, () => celluleListe(l.particuliers)),
  ]
  return new TableRow({
    children: contenus.map((children, j) => new TableCell({
      width: { size: LARGEURS_COLONNES[j], type: WidthType.DXA },
      margins: { top: twips(6), bottom: twips(6), left: j ? twips(5) : 0, right: twips(5) },
      children,
    })),
  })
}

function tableauNiveau(lignes) {
  const entete = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: COLONNES.map((c, j) => new TableCell({
      width: { size: LARGEURS_COLONNES[j], type: WidthType.DXA },
      margins: { top: twips(2), bottom: twips(4), left: j ? twips(5) : 0, right: twips(5) },
      borders: { ...CASE_SANS, bottom: trait(CHARTE.encre, 1) },
      children: [paragraphe(t(c.toUpperCase(), { bold: true, taille: 6.5, color: CHARTE.discret, characterSpacing: 12 }))],
    })),
  })
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: LARGEUR_A3, type: WidthType.DXA },
    columnWidths: LARGEURS_COLONNES,
    borders: { top: SANS, left: SANS, right: SANS, insideVertical: SANS, bottom: trait(CHARTE.filet), insideHorizontal: trait(CHARTE.filet) },
    rows: [entete, ...lignes.map(rangeePiece)],
  })
}

// Titre de niveau : carré orange (bordure gauche épaisse) et filet noir dessous
const titreNiveau = (nom, saut) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  pageBreakBefore: saut,
  keepNext: true,
  spacing: { before: 0, after: twips(3) },
  border: {
    left: { style: BorderStyle.SINGLE, size: 48, color: hex(CHARTE.orange), space: 6 },
    bottom: { style: BorderStyle.SINGLE, size: 8, color: hex(CHARTE.encre), space: 2 },
  },
  children: [t(texteLatin(nom).toUpperCase(), { bold: true, taille: 12, color: CHARTE.encre, characterSpacing: 16 })],
})

function blocNiveau(etage, rang) {
  const lignes = etage.lignes
  const nonVisitees = etage.nonVisitees ?? []
  const nv = texteNonVisitees(nonVisitees)
  return [
    titreNiveau(etage.nom, rang > 0),
    paragraphe(t(texteComptes(lignes), { taille: 8, color: CHARTE.discret }), { keepNext: true, spacing: { after: twips(8) } }),
    lignes.length ? tableauNiveau(lignes) : paragraphe(t(AUCUNE_PIECE_VISITEE, { italics: true, taille: 8.5, color: CHARTE.discret })),
    ...(nonVisitees.length ? [paragraphe([
      t(nv.libelle, { bold: true, taille: 7.5, color: CHARTE.discret }), t(nv.liste, { taille: 7.5, color: CHARTE.discret }),
    ], { spacing: { before: twips(8) } })] : []),
  ]
}

function legendeTableau() {
  const largeur = LARGEUR_A3 / STATUTS.length
  return [
    paragraphe(t(TITRE_LECTURE_TABLEAU.toUpperCase(), { bold: true, taille: 7, color: CHARTE.discret, characterSpacing: 16 }), { keepNext: true, spacing: { after: twips(4) } }),
    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: LARGEUR_A3, type: WidthType.DXA },
      columnWidths: STATUTS.map(() => largeur),
      borders: BORDURES_AUCUNE,
      rows: [new TableRow({
        cantSplit: true,
        children: STATUTS.map((st) => new TableCell({
          width: { size: largeur, type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: twips(18) },
          children: [paragraphe([...etiquette(st.code), t(texteLatin(st.sens), { taille: 7.5, color: CHARTE.discret })])],
        })),
      })],
    }),
    paragraphe(t(NOTE_LECTURE_TABLEAU, { taille: 7, color: CHARTE.discret }), { spacing: { before: twips(5), after: twips(14) } }),
  ]
}

function pagesTableaux({ affaire, etages, elementsExport, date, redacteur }) {
  const propositions = propositionsTableaux(etages, elementsExport)
  return [
    paragraphe(t(SURTITRE_TABLEAUX.toUpperCase(), { bold: true, taille: 8, color: CHARTE.orange, characterSpacing: 20 })),
    new Paragraph({
      heading: HeadingLevel.HEADING_1, spacing: { before: twips(1), after: twips(10) },
      children: [t(titreTableauxEdl(affaire), { bold: true, taille: 16, color: CHARTE.encre })],
    }),
    ...legendeTableau(),
    ...etages.flatMap(blocNiveau),
    paragraphe(sourcesRapportEdl({ date, redacteur, propositions }).map((m) => t(m.texte, { bold: !!m.gras, taille: 7, color: CHARTE.discret })), { spacing: { before: twips(16) } }),
  ]
}

// ─── Annexe des photos ───────────────────────────────────────────────────────

// Trois photos par rangée, légende dessous ; un tableau sans bordures, que
// Word laisse déplacer ou retailler
function tableauPhotos(photos) {
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
  return tableau(lignes, colonnes, { bordures: BORDURES_AUCUNE })
}

function pagesPhotos(annexe) {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(TITRE_ANNEXE_PHOTOS, { color: CHARTE.encre })] }),
    filet(CHARTE.orange, 10),
    ...annexe.flatMap(({ nom, groupes }) => [
      titre2(nom),
      ...groupes.flatMap((g) => [
        new Paragraph({
          heading: HeadingLevel.HEADING_3, keepNext: true,
          children: [t(g.nom, { bold: true, taille: 10, color: CHARTE.encre }), t(`  (${g.photos.length})`, { bold: false, taille: 8, color: COULEUR.gris })],
        }),
        tableauPhotos(g.photos),
      ]),
    ]),
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

// Pied vide des planches : sans lui, Word reprendrait celui de la section précédente
const piedVide = () => new Footer({ children: [new Paragraph({ children: [] })] })

const proprietesPage = (feuille, paysage, marges = MARGES) => ({
  page: {
    size: { width: feuille.court, height: feuille.long, orientation: paysage ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
    margin: {
      top: twips(marges.haut), right: twips(marges.droite), bottom: twips(marges.bas), left: twips(marges.gauche),
      footer: marges.haut ? twips(20) : 0, header: marges.haut ? twips(18) : 0,
    },
  },
})

const SANS_MARGE = { haut: 0, droite: 0, bas: 0, gauche: 0 }

// La feuille d'une planche d'après sa mise (A3 paysage aujourd'hui)
function feuillePlanche(mise) {
  const { largeur, hauteur } = mise?.format ?? { largeur: 420, hauteur: 297 }
  return { feuille: { court: twipsMm(Math.min(largeur, hauteur)), long: twipsMm(Math.max(largeur, hauteur)) }, paysage: largeur >= hauteur }
}

const POLICE = 'Arial'

/**
 * Le rapport Word (objet `Document` de docx, à passer à `Packer`).
 * Paramètres de `suiteRapportEdl`, plus :
 * @param images octets JPEG (Uint8Array) : { logo, photoAffaire,
 *   photos: photoId → octets } (Map ou objet)
 * @param planches par étage (fabriquées par `genererRapportEdl`) :
 *   [{ niveauId, mise (`misePlanche`), pxParMm, fond (JPEG sans symboles ni
 *   légende, ou null), legende (PNG ou null), symboles: Map cle → PNG }] ;
 *   un étage sans planche reçoit une page « Plan indisponible »
 */
export function documentWordEdl({
  affaire = null, etat = null, niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, images = {}, planches = [], redacteur = '', date = null, inclurePropositions = false, traces = [],
}) {
  const parametres = { niveaux, pieces, elementsExport, photos, points, elements, visitees, inclurePropositions, traces }
  const { etages } = tableauxDuRapport(parametres)
  const dateRapport = date ?? etat?.created_at ?? null
  const garde = resumeGarde({ affaire, etages, redacteur, date: dateRapport, elementsExport, pieces })
  const synthese = syntheseRapport({ etages })
  const footers = { default: pied(affaire) }
  const sansPied = { default: piedVide() }
  const planchesParNiveau = new Map((planches ?? []).map((p) => [p.niveauId ?? p.mise?.niveauId, p]))

  const sections = [{ properties: proprietesPage(A4, false), footers, children: pageDeGarde({ garde, synthese, images }) }]
  for (const etage of etages) {
    const planche = planchesParNiveau.get(etage.niveau.id)
    if (planche?.mise) {
      const { feuille, paysage } = feuillePlanche(planche.mise)
      sections.push({ properties: proprietesPage(feuille, paysage, SANS_MARGE), footers: sansPied, children: pagePlanche(planche, etage.nom) })
    } else {
      sections.push({ properties: proprietesPage(A3, true), footers: sansPied, children: [indisponible(etage.nom)] })
    }
  }
  if (etages.length) {
    sections.push({ properties: proprietesPage(A3, true), footers, children: pagesTableaux({ affaire, etages, elementsExport, date: dateRapport, redacteur }) })
  }
  const annexe = photosAnnexeEdl({ ...parametres, images })
  if (annexe.length) sections.push({ properties: proprietesPage(A4, false), footers, children: pagesPhotos(annexe) })

  return new Document({
    creator: 'JGA Architectes',
    title: texteLatin(`État des lieux${affaire?.nom ? ` — ${affaire.nom}` : ''}`),
    styles: {
      default: {
        document: { run: { font: POLICE, size: demi(9), color: hex(COULEUR.texte) }, paragraph: { spacing: { line: 264 } } },
        heading1: { run: { font: POLICE, size: demi(17), bold: true, color: hex(COULEUR.texte) }, paragraph: { spacing: { before: twips(1), after: 0 } } },
        heading2: { run: { font: POLICE, size: demi(9.5), bold: true, allCaps: true, color: hex(COULEUR.orange) }, paragraph: { spacing: { before: twips(12), after: twips(4) } } },
        heading3: { run: { font: POLICE, size: demi(9), bold: true }, paragraph: { spacing: { before: twips(4), after: twips(4) } } },
      },
    },
    sections,
  })
}

/** « 2026-11-18-2618-etat-des-lieux.docx », à côté du PDF */
export { nomFichierWordEdl } from './rapportEdlLogique.js'
