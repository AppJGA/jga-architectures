// ─── Assemblage du rapport PDF de l'état des lieux (pdf-lib) ─────────────────
//
// pdfmake ne sait pas changer de format en cours de document : la garde (A4),
// les tableaux par niveau (A3 paysage) et l'annexe des photos (A4) sont trois
// documents pdfmake, les planches des pages A3 paysage posées ici, une image
// pleine page chacune. Le pied de page « … page n / N » est écrit ici, sur
// les pages des documents pdfmake seulement (le cartouche tient lieu de pied
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

async function poserPlanches(sortie, planches) {
  for (const planche of planches ?? []) {
    const image = await sortie.embedJpg(planche.jpeg)
    const largeur = planche.largeurMm * PT_PAR_MM
    const hauteur = planche.hauteurMm * PT_PAR_MM
    const page = sortie.addPage([largeur, hauteur])
    page.drawImage(image, { x: 0, y: 0, width: largeur, height: hauteur })
  }
}

/**
 * @param documents suite des morceaux du rapport, dans l'ordre :
 *   { octets: PDF, pied: true|false } (un document pdfmake ; null = omis)
 *   ou { planches: [{ jpeg: octets JPEG, largeurMm, hauteurMm }] }
 * @param garde, planches, fiches ancienne forme (garde, planches, annexe),
 *   lue si `documents` manque
 * @param pied « Affaire · État des lieux » (`piedRapportEdl`)
 * @returns octets du rapport (Uint8Array)
 */
export async function assemblerRapport({
  documents = null, garde = null, planches = [], fiches = null, pied = '', titre = '', auteur = 'JGA Architectes',
}) {
  const suite = documents ?? [{ octets: garde, pied: true }, { planches }, { octets: fiches, pied: true }]
  const sortie = await PDFDocument.create()
  const avecPied = []
  for (const morceau of suite) {
    if (morceau?.planches) await poserPlanches(sortie, morceau.planches)
    else if (morceau?.octets) {
      const pages = await copierPages(sortie, morceau.octets)
      if (morceau.pied !== false) avecPied.push(...pages)
    }
  }

  const police = await sortie.embedFont(StandardFonts.Helvetica)
  const toutes = sortie.getPages()
  const couleur = couleurPdf(PIED.couleur)
  for (const page of avecPied) {
    page.drawText(textePied(pied, toutes.indexOf(page) + 1, toutes.length), {
      x: PIED.gauche, y: PIED.bas, size: PIED.police, font: police, color: couleur,
    })
  }

  if (titre) sortie.setTitle(texteLatin(titre))
  sortie.setAuthor(auteur)
  sortie.setCreator(auteur)
  return sortie.save()
}
