// ─── Dossier pour Claude : fabrication sur l'appareil ────────────────────────
//
// Les plans sont lus ici (pdf.js) et réunis (pdf-lib) ; rien ne part vers
// Supabase, dont le stockage est plafonné. Le contenu se décide dans
// `dossierClaudeLogique.js`.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import {
  ecrituresColorees, annotationsDePage, textePlan, titrePlan,
  sommaireMarkdown, cctpMarkdown, plansMarkdown, nomDossier, FICHIERS_DOSSIER,
} from './dossierClaudeLogique'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MM_PAR_POINT = 25.4 / 72

export async function lirePlan(fichier) {
  const octets = await fichier.arrayBuffer()
  let doc
  try {
    // pdf.js transfère le tampon à son worker : il reçoit une copie, l'original sert à la réunion
    doc = await pdfjs.getDocument({ data: octets.slice(0) }).promise
  } catch {
    throw new Error('Ce PDF n’a pas pu être ouvert (fichier protégé ou endommagé ?).')
  }
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const [x0, y0, x1, y1] = page.view
    let ecritures = []
    try {
      const ops = await page.getOperatorList()
      ecritures = ecrituresColorees(ops.fnArray, ops.argsArray, pdfjs.OPS)
    } catch { /* couleurs perdues, positions et textes intacts */ }
    const contenu = await page.getTextContent()
    pages.push({
      largeur: Math.round((x1 - x0) * MM_PAR_POINT), hauteur: Math.round((y1 - y0) * MM_PAR_POINT),
      annotations: annotationsDePage({ items: contenu.items, ecritures, view: page.view }),
    })
    page.cleanup?.()
  }
  doc.destroy?.()
  return {
    nomFichier: fichier.name, octets, nbPages: pages.length,
    largeur: pages[0]?.largeur ?? 0, hauteur: pages[0]?.hauteur ?? 0,
    sansTexte: pages.every((p) => p.annotations.length === 0),
    texte: textePlan({ titre: titrePlan(fichier.name), pages }),
  }
}

async function reunirPdf(plans, surProgression) {
  const { PDFDocument } = await import('pdf-lib')
  const reuni = await PDFDocument.create()
  for (let i = 0; i < plans.length; i++) {
    const source = await PDFDocument.load(plans[i].octets, { ignoreEncryption: true })
    const pages = await reuni.copyPages(source, source.getPageIndices())
    pages.forEach((p) => reuni.addPage(p))
    surProgression?.((i + 1) / plans.length)
  }
  return reuni.save()
}

export async function fabriquerDossier({ affaire, pieces, articles, lots, plans, surProgression }) {
  const pdf = await reunirPdf(plans, surProgression)
  const { zipSync, strToU8 } = await import('fflate')
  const date = new Date().toLocaleDateString('fr-FR')
  const contenu = {
    [FICHIERS_DOSSIER.sommaire]: strToU8(sommaireMarkdown({ affaire, pieces, lots, plans, date })),
    [FICHIERS_DOSSIER.cctp]: strToU8(cctpMarkdown({ affaire, pieces, articles, lots })),
    [FICHIERS_DOSSIER.plans]: strToU8(plansMarkdown({ affaire, textes: plans.map((p) => p.texte) })),
    // Un PDF est déjà compressé : le recompresser ne ferait que perdre du temps
    [FICHIERS_DOSSIER.pdf]: [pdf, { level: 0 }],
  }
  const nom = nomDossier(affaire)
  // Les fichiers rangés dans un dossier du même nom : décompressé, il se retrouve d'un coup d'œil
  const range = Object.fromEntries(Object.entries(contenu).map(([k, v]) => [`${nom}/${k}`, v]))
  return { blob: new Blob([zipSync(range)], { type: 'application/zip' }), nom: `${nom}.zip`, octetsPdf: pdf.byteLength }
}

export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
