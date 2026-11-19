// ─── Fabrication du rapport PDF de l'état des lieux, dans le navigateur ──────
//
// Les images d'abord (planche A3 de chaque étage et extrait de chaque pièce
// dessinés sur canevas, photos des points réduites en JPEG), puis pdfmake pour
// la garde et les fiches (A4), enfin pdf-lib qui réunit garde, planches et
// fiches et écrit le pied de page (`assemblageRapportEdl.js`). Tout ce que dit
// le PDF se décide dans `rapportEdlLogique.js` et `plancheEdl.js`.

import { chargerPdfMake } from '../../../chantier/comptes-rendus/genererRapport'
import { imagePourPdf, bandeauPourPdf } from '../../../chantier/comptes-rendus/imagesRapport'
import { chargerImage } from '../../../chantier/comptes-rendus/compressionPhoto'
import { canevasBlanc, libererCanevas } from '../renduNiveau'
import { chargerVecteurs } from '../vecteursEdl'
import {
  CADRE_PLAN_PIECE, definitionFichesEdl, definitionGardeEdl, elementsDeLEtage, etagesDuRapport, nomFichierRapportEdl,
  piedRapportEdl, pointsSansElement, relevesHorsPieces, titreRapportEdl,
} from './rapportEdlLogique'
import { cadragePiece, dessinerPlanRapport, vecteursDuCadrage } from './planRapportEdl'
import { misePlanche } from './plancheEdl'
import { PX_PAR_MM, dessinerLegende, dessinerPlanche, dessinerSymbole, tailleImageLegende, tailleImageSymbole, taillePlanchePx } from './dessinPlancheEdl'

const QUALITE_PLANCHE = 0.85
const QUALITE_EXTRAIT = 0.7
const TAILLE_PHOTO = 800
// Plafond de surface d'un canevas sur iPad
const PX_MAX_CANEVAS = 16e6

// « 2 photos non chargées », « 1 plan vectoriel non chargé »
const LIBELLES_MANQUANTS = {
  logo: ['logo', 'logos', false],
  'photo de l’affaire': ['photo de l’affaire', 'photos de l’affaire', true],
  'plan vectoriel': ['plan vectoriel', 'plans vectoriels', false],
  plan: ['plan', 'plans', false],
  planche: ['planche d’étage', 'planches d’étage', true],
  'lien des photos': ['lien des photos', 'liens des photos', false],
  photo: ['photo', 'photos', true],
}

// Un canevas par image, libéré dès l'encodage : l'iPad plafonne la mémoire
// de canevas, et un rapport en dessine un par pièce. Gardé en Blob (octets
// JPEG) et non en data URL tant que le dessin continue : une data URL pèse
// 4/3 en base64, le double en mémoire de chaîne ; elles ne sont faites qu'au
// moment de la mise en page.
async function imagePlan(c, options, qualite) {
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

const encoder = (canvas, type, qualite) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image non encodée'))), type, qualite)
})

// Canevas sans fond : images du Word posées par-dessus le plan
function canevasTransparent(largeur, hauteur) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(largeur))
  canvas.height = Math.max(1, Math.round(hauteur))
  return { canvas, ctx: canvas.getContext('2d') }
}

async function imageTransparente(largeur, hauteur, dessiner) {
  const { canvas, ctx } = canevasTransparent(largeur, hauteur)
  try {
    dessiner(ctx)
    return await encoder(canvas, 'image/png')
  } finally {
    libererCanevas(canvas)
  }
}

/** Résolution de la planche : `DPI_PLANCHE`, réduite si le canevas dépassait 16 Mpx. */
function pxParMmPlanche(mise, pxParMm = PX_PAR_MM) {
  const { largeur, hauteur } = taillePlanchePx(mise, pxParMm)
  return largeur * hauteur <= PX_MAX_CANEVAS ? pxParMm : pxParMm * Math.sqrt(PX_MAX_CANEVAS / (largeur * hauteur)) * 0.999
}

// La planche d'un étage (JPEG du PDF) et ce que le Word en reprend : le même
// canevas redessiné sans symboles ni légende (fond verrouillé du Word), la
// légende seule et une image par clé de symbole (images flottantes)
async function imagesPlanche(mise, { vecteurs, fond, logo, verifier = () => {} }) {
  const pxParMm = pxParMmPlanche(mise)
  const { largeur, hauteur } = taillePlanchePx(mise, pxParMm)
  const { canvas, ctx } = canevasBlanc(largeur, hauteur)
  let jpeg
  let fondWord
  try {
    dessinerPlanche(ctx, mise, { vecteurs, fond, logo, pxParMm })
    jpeg = await encoder(canvas, 'image/jpeg', QUALITE_PLANCHE)
    dessinerPlanche(ctx, mise, { vecteurs, fond, logo, pxParMm, avecSymboles: false, avecLegende: false })
    fondWord = await encoder(canvas, 'image/jpeg', QUALITE_PLANCHE)
  } finally {
    libererCanevas(canvas)
  }
  // Réglages changés pendant le dessin : inutile de fabriquer les images du Word
  verifier()
  let legende = null
  if (mise.legende?.groupes?.length) {
    const t = tailleImageLegende(mise.legende, pxParMm)
    legende = await imageTransparente(t.largeur, t.hauteur, (c) => dessinerLegende(c, mise.legende, { origineMm: t.origine.map((v) => v / pxParMm), pxParMm }))
  }
  // Une image par clé, d'après le premier symbole qui la porte (les angles
  // d'une même clé diffèrent de moins de 5°)
  const symboles = new Map()
  for (const s of mise.symboles) {
    if (symboles.has(s.cle)) continue
    const t = tailleImageSymbole(s, pxParMm)
    symboles.set(s.cle, await imageTransparente(t.largeur, t.hauteur, (c) => dessinerSymbole(c, s, { centrePx: t.centre, pxParMm })))
  }
  return { jpeg, word: { niveauId: mise.niveauId, mise, pxParMm, fond: fondWord, legende, symboles } }
}

const enDataUrl = (blob) => new Promise((resolve, reject) => {
  const lecteur = new FileReader()
  lecteur.onload = () => resolve(lecteur.result)
  lecteur.onerror = () => reject(lecteur.error)
  lecteur.readAsDataURL(blob)
})

// Data URL JPEG → Blob : ce que le Word garde des photos une fois le PDF
// fait (la chaîne base64 pèse deux fois plus en mémoire)
function blobDeDataUrl(dataUrl) {
  if (!dataUrl) return null
  const binaire = atob(String(dataUrl).slice(String(dataUrl).indexOf(',') + 1))
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return new Blob([octets], { type: 'image/jpeg' })
}

// Numéro de planche reçu des réglages (Map ou objet)
const texteDe = (collection, cle) => String((collection instanceof Map ? collection.get(cle) : collection?.[cle]) ?? '').trim()

const octetsDe = async (blob) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null)

async function versOctets(blobs) {
  const sortie = new Map()
  for (const [cle, blob] of blobs) sortie.set(cle, await octetsDe(blob))
  return sortie
}

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
 * @param verifier () → void, appelé avant chaque planche, chaque extrait de
 *   pièce et chaque photo ; il lève une erreur pour arrêter une fabrication devenue inutile
 *   (réglages changés) sans finir de télécharger et d'encoder les photos
 * @param numeros numéro de chaque planche au cartouche (Map ou objet niveauId →
 *   texte) ; « EDL-1 », « EDL-2 »… dans l'ordre des étages à défaut
 * @param indice indice des planches (texte ; vide : la date, cf. `misePlanche`)
 * Les autres paramètres sont ceux de `definitionGardeEdl` / `definitionFichesEdl`.
 * @returns { blob, nomFichier, avertissements, fabriquerWord } — `fabriquerWord()`
 *   rend la promesse du rapport Word ({ blob, nomFichier }) fait des mêmes
 *   images (rien n'est redessiné ni retéléchargé), une seule fois. Le Word
 *   reçoit `planches` : par étage, dans l'ordre, { niveauId, mise, pxParMm,
 *   fond (JPEG sans symboles ni légende), legende (PNG ou null),
 *   symboles: Map cle → PNG }, en octets
 */
export async function genererRapportEdl({
  affaire, etat = null, niveaux = [], pieces = [], points = [], elements = null, elementsExport = [], photos = [],
  visitees = null, redacteur = '', date = new Date(), obtenirLiens, vecteurs = null, surEtape = () => {}, verifier = () => {},
  inclurePropositions = false, numeros = null, indice = '',
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
  const planchesPdf = [] // { jpeg: Blob, largeurMm, hauteurMm }, dans l'ordre des étages
  const planchesWord = [] // { niveauId, mise, pxParMm, fond, legende, symboles } (Blobs)
  const extraits = new Map() // pieceId → Blob
  images.logo = await tolerer(imagePourPdf(`${window.location.origin}/Logo_JGA_Archi.jpg`, 400, 0.85), 'logo')
  if (affaire?.photo_url) images.photoAffaire = await tolerer(bandeauPourPdf(affaire.photo_url), 'photo de l’affaire')

  // Le logo du cartouche, dessiné sur le canevas : une image, pas une data URL
  const logoImage = images.logo ? await tolerer(chargerImage(images.logo), 'logo') : null

  const etages = etagesDuRapport({ niveaux, pieces, elementsExport, points, visitees, inclurePropositions })
  const seuls = pointsSansElement({ points, elements, elementsExport })
  const vues = new Set(etages.flatMap((e) => e.visitees.map((p) => p.id)))
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const dateRapport = date ?? etat?.created_at ?? null
  const position = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? [Number(p.x), Number(p.y)] : null)
  for (const [rang, { niveau, pieces: siennes, visitees: visiteesEtage }] of etages.entries()) {
    verifier()
    surEtape(`Rapport : planche de l’étage ${niveau.nom || 'sans nom'}…`)
    let v = vecteurs?.get?.(niveau.id) ?? null
    if (!v && niveau.chemin_vecteurs) v = await tolerer(chargerVecteurs(niveau.chemin_vecteurs, obtenirLiens), 'plan vectoriel')
    const fond = v ? null : await tolerer(fondImage(niveau, obtenirLiens), 'plan')
    // Les relevés hors des pièces (façade, cour) restent sur la feuille : les
    // éléments, `misePlanche` les compte ; ici les points sans élément et ceux
    // des photos
    const hors = relevesHorsPieces({ niveauId: niveau.id, pieces, elementsExport, points, photos, sansElement: seuls })
    const reperes = [...hors.sansElement, ...hors.photos.map((ph) => pointsParId.get(ph.point_id))].map(position).filter(Boolean)
    const mise = misePlanche({
      niveau, pieces, elementsExport, boiteVecteurs: v?.boite ?? niveau.cadrage ?? null, reperes,
      affaire, date: dateRapport, redacteur, inclurePropositions,
      numero: texteDe(numeros, niveau.id) || `EDL-${rang + 1}`, indice,
    })
    // Une planche ratée n'arrête pas le rapport : elle manque, avec un avertissement
    // L'arrêt demandé par `verifier` ne doit pas passer pour une planche ratée
    let arret = null
    const verifierPlanche = () => {
      try { verifier() } catch (err) { arret = err; throw err }
    }
    const planche = await tolerer(imagesPlanche(mise, { vecteurs: v, fond, logo: logoImage, verifier: verifierPlanche }), 'planche')
    if (arret) throw arret
    if (planche) {
      planchesPdf.push({ jpeg: planche.jpeg, largeurMm: mise.format.largeur, hauteurMm: mise.format.hauteur })
      planchesWord.push(planche.word)
    }
    // Par étage et non par pièce : un relevé hors des pièces reste sur l'extrait
    const dessin = {
      vecteurs: v, fond, pieces: siennes, visitees: vues,
      elementsExport: elementsDeLEtage(elementsExport, niveau.id, pieces),
      pointsSeuls: seuls.filter((p) => p.niveau_id === niveau.id),
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
  const connues = new Set(pieces.map((p) => p.id))
  // Photos d'une fiche, ou d'un point hors de toute pièce (page « Hors pièces »)
  const retenues = photos.filter((ph) => {
    const point = pointsParId.get(ph.point_id)
    if (!point) return false
    return ficheDe.has(point.piece_id) || point.piece_id == null || !connues.has(point.piece_id)
  })
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
  images.pieces = await versDataUrls(extraits)
  const parametres = { affaire, etat, niveaux, pieces, elementsExport, photos, points, elements, visitees, redacteur, date, inclurePropositions }
  const garde = await octetsDe(await pdfMake.createPdf(definitionGardeEdl({ ...parametres, images })).getBlob())
  const definitionFiches = definitionFichesEdl({ ...parametres, images })
  const fiches = definitionFiches ? await octetsDe(await pdfMake.createPdf(definitionFiches).getBlob()) : null
  surEtape('Rapport : assemblage des planches…')
  const { assemblerRapport } = await import('./assemblageRapportEdl')
  const planchesOctets = []
  for (const p of planchesPdf) planchesOctets.push({ ...p, jpeg: await octetsDe(p.jpeg) })
  const octets = await assemblerRapport({ garde, planches: planchesOctets, fiches, pied: piedRapportEdl(affaire), titre: titreRapportEdl(affaire) })
  const blob = new Blob([octets], { type: 'application/pdf' })

  // Le Word reprend les mêmes images, gardées en Blob (planches et extraits le
  // sont déjà) ; les data URL du PDF sont lâchées
  const pourWord = {
    logo: blobDeDataUrl(images.logo),
    photoAffaire: blobDeDataUrl(images.photoAffaire),
    planches: planchesWord,
    pieces: extraits,
    photos: new Map([...images.photos].map(([cle, url]) => [cle, blobDeDataUrl(url)])),
  }
  let word = null
  const fabriquerWord = () => {
    word ??= (async () => {
      const { Packer, documentWordEdl, nomFichierWordEdl } = await import('./rapportWordEdl')
      const imagesWord = {
        logo: await octetsDe(pourWord.logo),
        photoAffaire: await octetsDe(pourWord.photoAffaire),
        pieces: await versOctets(pourWord.pieces),
        photos: await versOctets(pourWord.photos),
      }
      const planches = []
      for (const p of pourWord.planches) {
        planches.push({ ...p, fond: await octetsDe(p.fond), legende: await octetsDe(p.legende), symboles: await versOctets(p.symboles) })
      }
      const document = documentWordEdl({ ...parametres, images: imagesWord, planches })
      return { blob: await Packer.toBlob(document), nomFichier: nomFichierWordEdl(affaire, date) }
    })()
    // Un échec peut se retenter au prochain export
    word.catch(() => { word = null })
    return word
  }
  const avertissements = [...manquants].map(([quoi, n]) => {
    const [singulier, pluriel, feminin] = LIBELLES_MANQUANTS[quoi] ?? [quoi, quoi, false]
    return `${n} ${n > 1 ? pluriel : singulier} non chargé${feminin ? 'e' : ''}${n > 1 ? 's' : ''}`
  })
  return { blob, nomFichier: nomFichierRapportEdl(affaire, date), avertissements, fabriquerWord }
}
