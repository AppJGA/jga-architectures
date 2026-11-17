// ─── Importer les plans de l'existant ────────────────────────────────────────
//
// Deux temps : `preparerFichier` lit chaque fichier sur l'appareil (format,
// étages, pièces, échelle) pour que l'utilisateur relise ; `importer` dessine,
// fait proposer ce qui manque par Claude, puis enregistre. Un échec de Claude
// n'arrête rien : l'étage est enregistré sans pièces, à dessiner à la main.
// Toute autre erreur annule l'import entier (`suivi` note ce qui a été écrit).

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from './formatPlanEdl'
import { versPixels, versMetres } from './geometrieEdl'
import { decoderDxf, lireDxf } from './dxfLecture'
import { detecterPieces } from './piecesDxfLogique'
import { proposerNiveaux, uniteParDefaut } from './niveauxLogique'
import { metresParPoint } from './pdfPlanLogique'
import { versPiecesEdl } from './piecesIaLogique'
import { proposerPiecesIa } from './piecesIa'
import { rendreNiveauDxf, imagePourIa } from './renduNiveau'
import { ouvrirPdfEdl, examinerPages, rendrePage, pointPageEnMetres, decouperNiveau } from './lecturePdfEdl'
import { assurerEtat, envoyerSource, enregistrerNiveau, enregistrerPieces, annulerImport } from './edlDonnees'

const TEXTES_GARDES = 3000

export async function preparerFichier(fichier) {
  const octets = new Uint8Array(await fichier.arrayBuffer())
  const format = formatPlan(octets.slice(0, 512))
  const verdict = verdictFormat(format)
  if (!verdict.ok) return { nom: fichier.name, refus: verdict.message }

  if (format === 'dxf') {
    const lecture = lireDxf(decoderDxf(octets))
    const detection = detecterPieces(lecture)
    const unitesParMetre = detection.unitesParMetre ?? uniteParDefaut(lecture)
    const niveaux = proposerNiveaux(lecture, detection, unitesParMetre, fichier.name)
      .map((n) => ({ ...n, garde: true }))
    return { nom: fichier.name, format, octets, lecture, detection, niveaux, unitesParMetre, uniteLue: !!detection.unitesParMetre }
  }

  const doc = await ouvrirPdfEdl(octets)
  const pages = (await examinerPages(doc)).map((p) => ({ ...p, garde: p.vectoriel, echelle: p.echelle ?? 100, echelleLue: !!p.echelle }))
  if (!pages.some((p) => p.vectoriel)) return { nom: fichier.name, refus: MESSAGES_FORMAT['pdf-scan'] }
  return { nom: fichier.name, format, octets, pages }
}

// Changer d'unité (DXF sans contours de pièces) : étages recalculés
export function changerUnite(preparation, unitesParMetre) {
  const niveaux = proposerNiveaux(preparation.lecture, preparation.detection, unitesParMetre, preparation.nom)
    .map((n, i) => ({ ...n, nom: preparation.niveaux[i]?.nom ?? n.nom, garde: preparation.niveaux[i]?.garde ?? true }))
  return { ...preparation, unitesParMetre, niveaux }
}

const textesGardes = (textes) => textes.slice(0, TEXTES_GARDES)

async function importerDxf(affaireId, etatId, prep, ordre, surEtape, avertissements, suivi) {
  const cheminSource = await envoyerSource(affaireId, prep.octets)
  suivi.chemins.push(cheminSource)
  for (const n of prep.niveaux.filter((x) => x.garde)) {
    surEtape(`Dessin de l’étage « ${n.nom} »…`)
    const { cadrage, rendu, ia } = await rendreNiveauDxf(n)
    const niveau = await enregistrerNiveau(affaireId, etatId, {
      nom: n.nom, ordre: ordre.valeur++, format: 'dxf', sourceNom: prep.nom, cheminSource, rendu, cadrage,
      unitesParMetre: prep.unitesParMetre, textes: textesGardes(n.textes.map((t) => ({ texte: t.texte, pos: t.pos }))),
    })
    noterNiveau(suivi, niveau)
    let pieces = n.pieces.map((p) => ({ ...p, origine: 'dxf', aVerifier: false }))
    if (!pieces.length) {
      surEtape(`Claude repère les pièces de « ${n.nom} »…`)
      try {
        const textes = n.textes.map((t) => {
          const [x, y] = versPixels(cadrage, t.pos)
          return { texte: t.texte, x: x * ia.echelle, y: y * ia.echelle }
        })
        const proposition = await proposerPiecesIa({ image: ia.image, largeur: ia.largeur, hauteur: ia.hauteur, textes, niveauUnique: true })
        pieces = versPiecesEdl(proposition.pieces, ([x, y]) => versMetres(cadrage, [x / ia.echelle, y / ia.echelle]))
      } catch (err) {
        avertissements.push(`« ${n.nom} » : ${err.message} Les pièces pourront être proposées plus tard ou dessinées à la main.`)
      }
    }
    surEtape(`Enregistrement de « ${n.nom} »…`)
    await enregistrerPieces(affaireId, niveau.id, pieces)
  }
}

async function importerPdf(affaireId, etatId, prep, ordre, surEtape, avertissements, suivi) {
  const cheminSource = await envoyerSource(affaireId, prep.octets)
  suivi.chemins.push(cheminSource)
  const doc = await ouvrirPdfEdl(prep.octets)
  for (const p of prep.pages.filter((x) => x.garde)) {
    surEtape(`Lecture de la page ${p.numero}…`)
    const page = await rendrePage(doc, p.numero)
    try {
      const mpp = metresParPoint(p.echelle)
      const ia = imagePourIa(page.canvas)
      let proposition
      try {
        surEtape(`Claude repère les étages et les pièces de la page ${p.numero}…`)
        proposition = await proposerPiecesIa({
          image: ia.image, largeur: ia.largeur, hauteur: ia.hauteur, niveauUnique: false,
          textes: page.textes.map((t) => ({ texte: t.texte, x: t.x * ia.echelle, y: t.y * ia.echelle })),
        })
      } catch (err) {
        avertissements.push(`Page ${p.numero} : ${err.message} La page est gardée entière, les pièces pourront être dessinées à la main.`)
        proposition = { niveaux: [{ nom: `Page ${p.numero}`, cadre: [0, 0, ia.largeur, ia.hauteur] }], pieces: [] }
      }
      for (const [k, nv] of proposition.niveaux.entries()) {
        surEtape(`Enregistrement de « ${nv.nom} »…`)
        const cadrePx = nv.cadre.map((v) => v / ia.echelle)
        const { cadrage, rendu } = await decouperNiveau(page, cadrePx, mpp)
        const textes = page.textes
          .filter((t) => t.x >= cadrePx[0] && t.x <= cadrePx[2] && t.y >= cadrePx[1] && t.y <= cadrePx[3])
          .map((t) => ({ texte: t.texte, pos: pointPageEnMetres(page, [t.x, t.y], mpp) }))
        const niveau = await enregistrerNiveau(affaireId, etatId, {
          nom: nv.nom, ordre: ordre.valeur++, format: 'pdf', sourceNom: prep.nom, sourcePage: p.numero,
          cheminSource, rendu, cadrage, echelle: p.echelle, textes: textesGardes(textes),
        })
        noterNiveau(suivi, niveau)
        const pieces = versPiecesEdl(
          proposition.pieces.filter((q) => q.niveau === k),
          ([x, y]) => pointPageEnMetres(page, [x / ia.echelle, y / ia.echelle], mpp),
        )
        await enregistrerPieces(affaireId, niveau.id, pieces)
      }
    } finally {
      // Libéré même après une erreur : l'iPad garde peu de mémoire de canevas
      page.canvas.width = 0
      page.canvas.height = 0
    }
  }
}

function noterNiveau(suivi, niveau) {
  suivi.niveauIds.push(niveau.id)
  suivi.chemins.push(niveau.chemin, niveau.chemin_apercu)
}

export async function importer(affaireId, preparations, surEtape) {
  const { etat, cree } = await assurerEtat(affaireId)
  const avertissements = []
  const ordre = { valeur: 0 }
  const suivi = { niveauIds: [], chemins: [] }
  try {
    for (const prep of preparations.filter((p) => !p.refus)) {
      if (prep.format === 'dxf') await importerDxf(affaireId, etat.id, prep, ordre, surEtape, avertissements, suivi)
      else await importerPdf(affaireId, etat.id, prep, ordre, surEtape, avertissements, suivi)
    }
  } catch (err) {
    surEtape('Annulation de l’import…')
    try {
      await annulerImport({ ...suivi, etatCreeId: cree ? etat.id : null })
    } catch (errAnnulation) {
      // L'erreur d'origine compte seule pour l'utilisateur ; des fichiers
      // restés seuls sont rattrapés par « Nettoyer le stockage »
      console.warn('État des lieux, annulation de l’import :', errAnnulation)
    }
    throw err
  }
  return { avertissements }
}
