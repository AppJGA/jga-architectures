// ─── Assemblage du rapport PDF de l'état des lieux (pdf-lib) ─────────────────
//
// pdfmake ne sait pas changer de format en cours de document : la garde et les
// fiches sont deux documents A4 (pdfmake), les planches des pages A3 paysage
// posées ici, une image pleine page chacune. Le pied de page « … page n / N »
// est écrit ici, sur les pages A4 seulement (le cartouche tient lieu de pied
// aux planches), parce que N n'est connu qu'une fois tout réuni.
//
// Sans navigateur : testé dans Node (tests/etat-des-lieux-export-assemblage.test.js).
// Chargé à la demande par `genererRapportEdl.js` (`import()`) : pdf-lib
// n'alourdit pas le reste de l'app.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { texteLatin } from './rapportEdlLogique.js'

const PT_PAR_MM = 72 / 25.4

// Mêmes mesures que l'ancien pied pdfmake : Helvetica 7 pt, gris du rapport
export const PIED = { police: 7, gauche: 36, bas: 22, couleur: '#5E5854' }

const couleurPdf = (hex) => {
  const n = Number.parseInt(String(hex).replace(/^#/, ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** « 9901 Maison de l’essai · État des lieux · page 3 / 12 », en une ligne. */
export const textePied = (pied, page, pages) => `${texteLatin(pied).replace(/\s+/g, ' ').trim()} · page ${page} / ${pages}`

async function copierPages(sortie, octets) {
  if (!octets) return []
  const source = await PDFDocument.load(octets)
  const pages = await sortie.copyPages(source, source.getPageIndices())
  return pages.map((p) => sortie.addPage(p))
}

/**
 * @param garde octets du PDF de la page de garde (A4)
 * @param planches [{ jpeg: octets JPEG, largeurMm, hauteurMm }] dans l'ordre des étages
 * @param fiches octets du PDF des fiches (A4), ou null s'il n'y en a pas
 * @param pied « Affaire · État des lieux » (`piedRapportEdl`)
 * @returns octets du rapport (Uint8Array)
 */
export async function assemblerRapport({ garde, planches = [], fiches = null, pied = '', titre = '', auteur = 'JGA Architectes' }) {
  const sortie = await PDFDocument.create()
  const a4 = []
  a4.push(...await copierPages(sortie, garde))
  for (const planche of planches) {
    const image = await sortie.embedJpg(planche.jpeg)
    const largeur = planche.largeurMm * PT_PAR_MM
    const hauteur = planche.hauteurMm * PT_PAR_MM
    const page = sortie.addPage([largeur, hauteur])
    page.drawImage(image, { x: 0, y: 0, width: largeur, height: hauteur })
  }
  a4.push(...await copierPages(sortie, fiches))

  const police = await sortie.embedFont(StandardFonts.Helvetica)
  const toutes = sortie.getPages()
  const couleur = couleurPdf(PIED.couleur)
  for (const page of a4) {
    page.drawText(textePied(pied, toutes.indexOf(page) + 1, toutes.length), {
      x: PIED.gauche, y: PIED.bas, size: PIED.police, font: police, color: couleur,
    })
  }

  if (titre) sortie.setTitle(texteLatin(titre))
  sortie.setAuthor(auteur)
  sortie.setCreator(auteur)
  return sortie.save()
}
