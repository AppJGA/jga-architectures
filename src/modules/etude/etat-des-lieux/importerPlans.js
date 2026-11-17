// ─── Importer les plans de l'existant ────────────────────────────────────────
//
// Deux temps : `preparerFichier` lit chaque DXF sur l'appareil (format,
// étages, pièces) pour que l'utilisateur relise ; `importer` dessine,
// fait proposer ce qui manque par Claude, puis enregistre. Un échec de Claude
// n'arrête rien : l'étage est enregistré sans pièces, à dessiner à la main.
// Toute autre erreur annule l'import entier (`suivi` note ce qui a été écrit).

import { formatPlan, verdictFormat } from './formatPlanEdl'
import { versPixels, versMetres, retirerSuperpositions } from './geometrieEdl'
import { decoderDxf, lireDxf } from './dxfLecture'
import { detecterPieces } from './piecesDxfLogique'
import { proposerNiveaux, uniteParDefaut } from './niveauxLogique'
import { versPiecesEdl } from './piecesIaLogique'
import { proposerPiecesIa } from './piecesIa'
import { rendreNiveauDxf } from './renduNiveau'
import { assurerEtat, envoyerSource, enregistrerNiveau, enregistrerPieces, annulerImport } from './edlDonnees'

const TEXTES_GARDES = 3000

export async function preparerFichier(fichier) {
  const octets = new Uint8Array(await fichier.arrayBuffer())
  const format = formatPlan(octets.slice(0, 512))
  const verdict = verdictFormat(format)
  if (!verdict.ok) return { nom: fichier.name, refus: verdict.message }

  const lecture = lireDxf(decoderDxf(octets))
  const detection = detecterPieces(lecture)
  const unitesParMetre = detection.unitesParMetre ?? uniteParDefaut(lecture)
  const niveaux = proposerNiveaux(lecture, detection, unitesParMetre, fichier.name)
    .map((n) => ({ ...n, garde: true }))
  return { nom: fichier.name, format, octets, lecture, detection, niveaux, unitesParMetre, uniteLue: !!detection.unitesParMetre }
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
        // Même règle que pour les zones du DXF : jamais deux pièces superposées
        pieces = retirerSuperpositions(versPiecesEdl(proposition.pieces, ([x, y]) => versMetres(cadrage, [x / ia.echelle, y / ia.echelle]))).gardees
      } catch (err) {
        avertissements.push(`« ${n.nom} » : ${err.message} Les pièces pourront être proposées plus tard ou dessinées à la main.`)
      }
    }
    surEtape(`Enregistrement de « ${n.nom} »…`)
    await enregistrerPieces(affaireId, niveau.id, pieces)
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
      await importerDxf(affaireId, etat.id, prep, ordre, surEtape, avertissements, suivi)
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
