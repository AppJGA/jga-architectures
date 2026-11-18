// ─── Importer les plans de l'existant ────────────────────────────────────────
//
// Deux temps : `preparerFichier` lit chaque DXF sur l'appareil (format,
// étages, pièces, calques) pour que l'utilisateur relise, pendant que Claude
// propose le traitement de chaque calque (`proposerTraitements`) ; `importer`
// allège chaque étage d'après ces choix, le dessine, fait proposer ce qui
// manque par Claude, puis enregistre. Un échec de Claude
// n'arrête rien : l'étage est enregistré sans pièces, à dessiner à la main.
// Toute autre erreur annule l'import entier (`suivi` note ce qui a été écrit).

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from './formatPlanEdl'
import { versPixels, versMetres, retirerSuperpositions } from './geometrieEdl'
import { decoderDxf, lireDxf } from './dxfLecture'
import { detecterPieces } from './piecesDxfLogique'
import { proposerNiveaux, uniteParDefaut } from './niveauxLogique'
import { versPiecesEdl } from './piecesIaLogique'
import { proposerPiecesIa } from './piecesIa'
import { rendreNiveauDxf } from './renduNiveau'
import { assurerEtat, envoyerSource, envoyerVecteurs, enregistrerNiveau, enregistrerPieces, enregistrerRelecture, annulerImport } from './edlDonnees'
import { analyserNiveaux, decisionsParDefaut, parCalque, simplifierNiveau, encoderVecteurs } from './simplificationPlan'
import { CALQUES_EN_ATTENTE, reprendreDecisions, valeurCalques } from './calquesIaLogique'
import { proposerTraitementsIa } from './calquesIa'
import { relireNiveau } from './relectureIa'

const TEXTES_GARDES = 3000

export async function preparerFichier(fichier, { surConversion } = {}) {
  const lus = new Uint8Array(await fichier.arrayBuffer())
  const format = formatPlan(lus.slice(0, 512))
  const verdict = verdictFormat(format)
  if (!verdict.ok) return { nom: fichier.name, refus: verdict.message }

  // Un DWG est converti en DXF sur l'appareil ; c'est ce DXF qui est lu, et
  // gardé comme source (l'export du lot 4 part de lui)
  let octets = lus
  if (format === 'dwg') {
    surConversion?.(fichier.name)
    try {
      const { convertirDwgEnDxf } = await import('./convertisseurDwg')
      octets = await convertirDwgEnDxf(lus)
    } catch (err) {
      return { nom: fichier.name, refus: `${MESSAGES_FORMAT['dwg-illisible']} (Motif : ${err?.message ?? err}.)` }
    }
  }

  const lecture = lireDxf(decoderDxf(octets))
  const detection = detecterPieces(lecture)
  const unitesParMetre = detection.unitesParMetre ?? uniteParDefaut(lecture)
  const niveaux = proposerNiveaux(lecture, detection, unitesParMetre, fichier.name)
    .map((n) => ({ ...n, garde: true }))
  const analyse = analyserNiveaux(niveaux)
  return {
    nom: fichier.name, format, converti: format === 'dwg', octets, lecture, detection, niveaux, unitesParMetre, uniteLue: !!detection.unitesParMetre,
    analyse, decisions: decisionsParDefaut(analyse), calques: CALQUES_EN_ATTENTE,
  }
}

// Changer d'unité (DXF sans contours de pièces) : étages recalculés, et
// calques réanalysés (la longueur d'un trait court change avec l'unité) ;
// un calque réglé par Claude ou à la main garde son traitement, les autres
// reprennent les défauts de la nouvelle analyse.
export function changerUnite(preparation, unitesParMetre) {
  const niveaux = proposerNiveaux(preparation.lecture, preparation.detection, unitesParMetre, preparation.nom)
    .map((n, i) => ({ ...n, nom: preparation.niveaux[i]?.nom ?? n.nom, garde: preparation.niveaux[i]?.garde ?? true }))
  const analyse = analyserNiveaux(niveaux)
  return { ...preparation, unitesParMetre, niveaux, analyse, decisions: reprendreDecisions(preparation, analyse) }
}

/**
 * Claude choisit le traitement de chaque calque du fichier. Ne lève jamais :
 * sans Claude (réseau, clé, refus), `avertissement` dit pourquoi et les
 * décisions déjà affichées (défauts ou choix à la main) restent.
 * @returns { raisons, proposees, avertissement? } — `proposees` : seulement
 *   les calques que Claude a traités, appliqués par `appliquerProposition`
 */
export async function proposerTraitements(preparation) {
  try {
    // On laisse d'abord la fenêtre afficher le fichier qui vient d'être lu ;
    // les extraits se dessinent ensuite calque par calque (`proposerTraitementsIa`)
    await new Promise((r) => setTimeout(r, 0))
    const traits = parCalque(preparation.niveaux.flatMap((n) => n.traits))
    const textes = parCalque(preparation.niveaux.flatMap((n) => n.textes))
    const { decisions, raisons } = await proposerTraitementsIa(preparation.analyse, traits, textes)
    return { raisons, proposees: decisions }
  } catch (err) {
    return { raisons: {}, proposees: {}, avertissement: err?.message ?? String(err) }
  }
}

const textesGardes = (textes) => textes.slice(0, TEXTES_GARDES)

async function importerDxf(affaireId, etatId, prep, ordre, surEtape, avertissements, suivi) {
  const cheminSource = await envoyerSource(affaireId, prep.octets)
  suivi.chemins.push(cheminSource)
  // Les décisions du moment : un import lancé pendant que Claude réfléchit
  // part avec les réglages affichés
  const calques = valeurCalques(prep)
  for (const n of prep.niveaux.filter((x) => x.garde)) {
    surEtape(`Allègement de l’étage « ${n.nom} »…`)
    const allege = simplifierNiveau(n, calques.decisions)
    // La boîte de l'étage entier : l'image garde le cadrage des pièces même
    // quand un calque est masqué
    const vecteurs = { traits: allege.traits, masses: allege.masses, textes: allege.textes, boite: n.boite }
    surEtape(`Dessin de l’étage « ${n.nom} »…`)
    const { cadrage, rendu, ia } = await rendreNiveauDxf(vecteurs)
    // Base sans la migration 081 (vue au premier étage) : plus aucun envoi
    let cheminVecteurs = null
    if (!suivi.sansVecteurs) {
      cheminVecteurs = await envoyerVecteurs(affaireId, encoderVecteurs(vecteurs))
      suivi.chemins.push(cheminVecteurs)
    }
    // Une fois l'absence de la 081 constatée, les étages suivants n'envoient
    // plus les deux colonnes : sans cela, chacun essuyait un refus de plus
    const niveau = await enregistrerNiveau(affaireId, etatId, {
      nom: n.nom, ordre: ordre.valeur++, format: 'dxf', sourceNom: prep.nom, cheminSource, rendu, cadrage,
      unitesParMetre: prep.unitesParMetre, textes: textesGardes(n.textes.map((t) => ({ texte: t.texte, calque: t.calque, pos: t.pos }))),
      cheminVecteurs, calques,
    }, { sansVecteurs: !!suivi.sansVecteurs })
    if (cheminVecteurs && !Object.hasOwn(niveau, 'chemin_vecteurs')) suivi.sansVecteurs = true
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
    const lignes = await enregistrerPieces(affaireId, niveau.id, pieces)
    // Claude relit le découpage avant le premier affichage ; il signale, ne
    // modifie rien. Un échec n'arrête pas l'import : la relecture se relance
    // depuis l'écran de correction.
    if (lignes.length) {
      surEtape(`Claude relit le découpage de « ${n.nom} »…`)
      try {
        const relecture = await relireNiveau({ niveau, pieces: lignes, source: rendu.apercu.blob })
        await enregistrerRelecture(niveau.id, { ...relecture, ecartes: [] })
      } catch (err) {
        avertissements.push(`« ${n.nom} » : relecture par Claude non faite (${err.message}). Elle se relance depuis l’écran de correction.`)
      }
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
