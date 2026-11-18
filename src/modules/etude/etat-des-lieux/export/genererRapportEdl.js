// ─── Fabrication du rapport PDF de l'état des lieux, dans le navigateur ──────
//
// Les images d'abord (plan de chaque étage et extrait de chaque pièce dessinés
// sur canevas, photos des points réduites en JPEG), puis pdfmake. Tout ce que
// dit le PDF se décide dans `rapportEdlLogique.js`.

import { chargerPdfMake } from '../../../chantier/comptes-rendus/genererRapport'
import { imagePourPdf, bandeauPourPdf } from '../../../chantier/comptes-rendus/imagesRapport'
import { chargerImage } from '../../../chantier/comptes-rendus/compressionPhoto'
import { canevasBlanc, libererCanevas } from '../renduNiveau'
import { chargerVecteurs } from '../vecteursEdl'
import { CADRE_PLAN_PIECE, definitionRapportEdl, etagesDuRapport, nomFichierRapportEdl, pointsSansElement } from './rapportEdlLogique'
import { cadragePiece, cadragePlan, dessinerPlanRapport, vecteursDuCadrage, PX_PLAN_ETAGE } from './planRapportEdl'

const QUALITE_PLAN = 0.82
const QUALITE_EXTRAIT = 0.7
const TAILLE_PHOTO = 800

// « 2 photos non chargées », « 1 plan vectoriel non chargé »
const LIBELLES_MANQUANTS = {
  logo: ['logo', 'logos', false],
  'photo de l’affaire': ['photo de l’affaire', 'photos de l’affaire', true],
  'plan vectoriel': ['plan vectoriel', 'plans vectoriels', false],
  plan: ['plan', 'plans', false],
  'lien des photos': ['lien des photos', 'liens des photos', false],
  photo: ['photo', 'photos', true],
}

// Un canevas par image, libéré dès l'encodage : l'iPad plafonne la mémoire
// de canevas, et un rapport en dessine un par pièce. Gardé en Blob (octets
// JPEG) et non en data URL tant que le dessin continue : une data URL pèse
// 4/3 en base64, le double en mémoire de chaîne ; elles ne sont faites qu'au
// moment de la mise en page.
async function imagePlan(c, options, qualite = QUALITE_PLAN) {
  const { canvas, ctx } = canevasBlanc(c.largeur, c.hauteur)
  try {
    dessinerPlanRapport(ctx, { cadrage: c, ...options })
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualite))
    if (!blob) throw new Error('Image du plan non encodée')
    return blob
  } finally {
    libererCanevas(canvas)
  }
}

const enDataUrl = (blob) => new Promise((resolve, reject) => {
  const lecteur = new FileReader()
  lecteur.onload = () => resolve(lecteur.result)
  lecteur.onerror = () => reject(lecteur.error)
  lecteur.readAsDataURL(blob)
})

// Map de Blobs → Map de data URL, au dernier moment (pdfmake les veut ainsi)
async function versDataUrls(blobs) {
  const sortie = new Map()
  for (const [cle, blob] of blobs) sortie.set(cle, await enDataUrl(blob))
  return sortie
}

// Fond d'un étage sans fichier vectoriel : son aperçu enregistré
async function fondImage(niveau, obtenirLiens) {
  if (!niveau.chemin_apercu) return null
  const url = (await obtenirLiens([niveau.chemin_apercu])).get(niveau.chemin_apercu)
  if (!url) throw new Error('Aperçu de l’étage introuvable')
  const reponse = await fetch(url)
  if (!reponse.ok) throw new Error(`Aperçu de l’étage : ${reponse.status}`)
  return { image: await chargerImage(await reponse.blob()), niveauCadrage: niveau.cadrage }
}

/**
 * @param obtenirLiens liens signés du stockage `edl` (`useLiensSignes(BUCKET_EDL)`)
 * @param vecteurs Map niveauId → vecteurs déjà décodés (facultatif : sinon lus
 *   par `chargerVecteurs`, une fois par chemin)
 * @param surEtape (texte) → void, pour la progression de l'écran d'export
 * @param verifier () → void, appelé avant chaque extrait de pièce et chaque
 *   photo ; il lève une erreur pour arrêter une fabrication devenue inutile
 *   (réglages changés) sans finir de télécharger et d'encoder les photos
 * Les autres paramètres sont ceux de `definitionRapportEdl`.
 * @returns { blob, nomFichier, avertissements }
 */
export async function genererRapportEdl({
  affaire, etat = null, niveaux = [], pieces = [], points = [], elements = null, elementsExport = [], photos = [],
  visitees = null, redacteur = '', date = new Date(), obtenirLiens, vecteurs = null, surEtape = () => {}, verifier = () => {},
}) {
  const manquants = new Map()
  const tolerer = (promesse, quoi) => Promise.resolve(promesse).catch((err) => {
    console.warn(`Rapport d’état des lieux, ${quoi} non chargé :`, err)
    manquants.set(quoi, (manquants.get(quoi) ?? 0) + 1)
    return null
  })

  surEtape('Rapport : chargement de pdfmake…')
  const pdfMake = await chargerPdfMake()
  const images = { photos: new Map() }
  const plans = new Map() // niveauId → Blob
  const extraits = new Map() // pieceId → Blob
  images.logo = await tolerer(imagePourPdf(`${window.location.origin}/Logo_JGA_Archi.jpg`, 400, 0.85), 'logo')
  if (affaire?.photo_url) images.photoAffaire = await tolerer(bandeauPourPdf(affaire.photo_url), 'photo de l’affaire')

  const etages = etagesDuRapport({ niveaux, pieces, elementsExport, points, visitees })
  const seuls = pointsSansElement({ points, elements, elementsExport })
  const vues = new Set(etages.flatMap((e) => e.visitees.map((p) => p.id)))
  for (const { niveau, pieces: siennes, visitees: visiteesEtage } of etages) {
    surEtape(`Rapport : plan de l’étage ${niveau.nom || 'sans nom'}…`)
    let v = vecteurs?.get?.(niveau.id) ?? null
    if (!v && niveau.chemin_vecteurs) v = await tolerer(chargerVecteurs(niveau.chemin_vecteurs, obtenirLiens), 'plan vectoriel')
    const fond = v ? null : await tolerer(fondImage(niveau, obtenirLiens), 'plan')
    const ids = new Set(siennes.map((p) => p.id))
    const dessin = {
      vecteurs: v, fond, pieces: siennes, visitees: vues,
      elementsExport: elementsExport.filter((e) => ids.has(e.pieceId)),
      pointsSeuls: seuls.filter((p) => p.niveau_id === niveau.id),
    }
    const c = cadragePlan(siennes, { pxMax: PX_PLAN_ETAGE, repli: niveau.cadrage })
    if (c) {
      const plan = await tolerer(imagePlan(c, dessin), 'plan')
      if (plan) plans.set(niveau.id, plan)
    }
    for (const piece of visiteesEtage) {
      verifier()
      const cp = cadragePiece(piece)
      if (!cp) continue
      // Seulement les traits autour de la pièce, et ses seuls éléments
      const extrait = await tolerer(imagePlan(cp, {
        ...dessin, vecteurs: vecteursDuCadrage(v, cp), pieceMiseEnAvant: piece, cadre: CADRE_PLAN_PIECE,
        elementsExport: dessin.elementsExport.filter((e) => e.pieceId === piece.id),
      }, QUALITE_EXTRAIT), 'plan')
      if (extrait) extraits.set(piece.id, extrait)
      // Laisser respirer l'écran entre deux pièces : un étage de 200 pièces
      // figerait sinon la page le temps du dessin
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  const ficheDe = new Map(etages.flatMap((e) => e.visitees.map((p) => [p.id, true])))
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const retenues = photos.filter((ph) => ficheDe.has(pointsParId.get(ph.point_id)?.piece_id))
  if (retenues.length) {
    surEtape(`Rapport : ${retenues.length} photo${retenues.length > 1 ? 's' : ''}…`)
    const liens = await tolerer(obtenirLiens(retenues.map((ph) => ph.chemin)), 'lien des photos') ?? new Map()
    for (const ph of retenues) {
      verifier()
      const url = liens.get(ph.chemin)
      const image = await tolerer(url ? imagePourPdf(url, TAILLE_PHOTO) : Promise.reject(new Error('lien absent')), 'photo')
      if (image) images.photos.set(ph.id, image)
    }
  }

  surEtape('Rapport : mise en page…')
  images.plans = await versDataUrls(plans)
  images.pieces = await versDataUrls(extraits)
  plans.clear()
  extraits.clear()
  const definition = definitionRapportEdl({ affaire, etat, niveaux, pieces, elementsExport, photos, points, elements, visitees, images, redacteur, date })
  const blob = await pdfMake.createPdf(definition).getBlob()
  const avertissements = [...manquants].map(([quoi, n]) => {
    const [singulier, pluriel, feminin] = LIBELLES_MANQUANTS[quoi] ?? [quoi, quoi, false]
    return `${n} ${n > 1 ? pluriel : singulier} non chargé${feminin ? 'e' : ''}${n > 1 ? 's' : ''}`
  })
  return { blob, nomFichier: nomFichierRapportEdl(affaire, date), avertissements }
}
