// ─── Allègement d'un plan PDF, en gardant le vectoriel ───────────────────────
//
// Lit le PDF avec pdf-lib, réécrit le contenu de chaque page (et des symboles
// qu'elle pose), puis enregistre un nouveau PDF. Rien n'est converti en image :
// seules changent la façon d'écrire les traits (regroupés) et la présence de
// ce qui ne se voit pas (retiré).
//
// Ce module ne vérifie pas le résultat : le contrôle au pixel se fait à part
// (`controle.js`), dans le navigateur, avant de proposer le fichier.

import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFNumber, PDFRef, decodePDFRawStream,
} from 'pdf-lib'
import { analyserPage } from './analyse'
import { reecrireFlux } from './fusion'

// Entrées du dictionnaire de flux que la recompression remplace
const ENTREES_DE_COMPRESSION = new Set(['Length', 'Filter', 'DecodeParms'])

/**
 * @param donnees ArrayBuffer | Uint8Array du PDF d'origine
 * @param options.respecterCalques voir `analyserPage`
 * @param options.progression (fraction, libelle) => void
 * @param options.pagesExclues Set des numéros de page (1…n) à laisser intacts
 *   — ceux où le contrôle au pixel a vu une différence
 * @returns { octets: Uint8Array, stats }
 */
export async function allegerPdf(donnees, { respecterCalques = true, progression = () => {}, pagesExclues = new Set(), fusionner = true } = {}) {
  const doc = await PDFDocument.load(donnees, { updateMetadata: false, ignoreEncryption: false })
  const pages = doc.getPages()
  const stats = {
    pages: pages.length, traits: 0, traitsCaches: 0, poses: 0, posesCachees: 0,
    blocsFusionnes: 0, traitsFusionnes: 0, symbolesReecrits: 0,
    octetsAvant: 0, octetsApres: 0,
  }
  const formesTraitees = new Set()

  for (let p = 0; p < pages.length; p++) {
    progression(p / pages.length, `Page ${p + 1} sur ${pages.length}`)
    const page = pages[p]
    if (pagesExclues.has(p + 1)) continue
    const contenu = lireContenu(doc, page.node)
    if (!contenu) continue
    stats.octetsAvant += contenu.length

    const ressources = ressourcesDe(doc, page.node.Resources())
    const analyse = analyserPage(contenu, ressources, { respecterCalques })
    stats.traits += analyse.stats.traits
    stats.traitsCaches += analyse.stats.traitsCaches
    stats.poses += analyse.stats.poses
    stats.posesCachees += analyse.stats.posesCachees

    const { octets: nouveau, stats: s } = reecrireFlux(contenu, {
      suppressions: analyse.suppressions,
      extGState: ressources.extGState,
      opaqueAuDepart: true,
      fusionner,
    })
    stats.blocsFusionnes += s.blocsFusionnes
    stats.traitsFusionnes += s.traitsFusionnes
    stats.octetsApres += nouveau.length
    remplacerContenu(doc, page.node, nouveau)

    // Symboles : réécrits une fois, et seulement s'ils sont toujours posés
    // opaques — une pose transparente interdit d'y fusionner les traits
    for (const [id, forme] of fusionner ? ressources.formesLues() : []) {
      if (formesTraitees.has(id) || !forme) continue
      formesTraitees.add(id)
      const opaque = analyse.formesOpaques.get(id) === true
      const { octets: octetsForme, stats: sf } = reecrireFlux(forme.octets, {
        extGState: (forme.ressources ?? ressources).extGState,
        opaqueAuDepart: opaque,
      })
      if (sf.traitsFusionnes === 0 && sf.blocsFusionnes === 0) continue
      remplacerFlux(doc, forme.ref, octetsForme)
      stats.symbolesReecrits++
      stats.traitsFusionnes += sf.traitsFusionnes
    }
  }

  progression(1, 'Enregistrement')
  const octets = await doc.save({ useObjectStreams: true })
  return { octets, stats }
}

// Contenu d'une page : un flux ou un tableau de flux, mis bout à bout
function lireContenu(doc, noeud) {
  const contenu = noeud.get(PDFName.of('Contents'))
  if (!contenu) return null
  const obj = doc.context.lookup(contenu)
  const flux = obj instanceof PDFArray ? obj.asArray().map(r => doc.context.lookup(r)) : [obj]
  const morceaux = flux.filter(f => f instanceof PDFRawStream).map(f => decodePDFRawStream(f).decode())
  const total = morceaux.reduce((t, m) => t + m.length + 1, 0)
  const tout = new Uint8Array(total)
  let pos = 0
  for (const m of morceaux) { tout.set(m, pos); pos += m.length; tout[pos++] = 10 }
  return tout
}

// Le nouveau contenu prend la place de l'ancien, sous la même référence : un
// flux simplement ajouté laissait l'ancien dans le fichier, qui grossissait.
function remplacerContenu(doc, noeud, octets) {
  const cle = PDFName.of('Contents')
  const valeur = noeud.get(cle)
  const refs = valeur instanceof PDFRef
    ? (doc.context.lookup(valeur) instanceof PDFArray ? doc.context.lookup(valeur).asArray() : [valeur])
    : valeur instanceof PDFArray ? valeur.asArray() : []
  const flux = doc.context.flateStream(octets)
  if (refs[0] instanceof PDFRef && doc.context.lookup(refs[0]) instanceof PDFRawStream) {
    doc.context.assign(refs[0], flux)
    noeud.set(cle, refs[0])
    for (const r of refs.slice(1)) if (r instanceof PDFRef) doc.context.delete(r)
  } else {
    noeud.set(cle, doc.context.register(flux))
  }
}

// Remplace le contenu d'un flux existant en gardant son dictionnaire (BBox,
// Matrix, Resources…) : les références au symbole restent valables
function remplacerFlux(doc, ref, octets) {
  const ancien = doc.context.lookup(ref)
  const entrees = {}
  for (const [cle, valeur] of ancien.dict.entries()) {
    const nom = cle.decodeText ? cle.decodeText() : String(cle).slice(1)
    if (!ENTREES_DE_COMPRESSION.has(nom)) entrees[nom] = valeur
  }
  doc.context.assign(ref, doc.context.flateStream(octets, entrees))
}

// Ressources d'un contenu, dans la forme qu'attendent l'analyse et la fusion
export function ressourcesDe(doc, dict) {
  const formes = new Map()   // nom → forme lue
  const parId = new Map()    // id → forme (pour la réécriture)
  const nombre = (o) => (o instanceof PDFNumber ? o.asNumber() : undefined)
  const nomDe = (o) => (o ? String(o).replace(/^\//, '') : undefined)
  const extg = dict instanceof PDFDict ? dict.lookup(PDFName.of('ExtGState')) : null
  const xo = dict instanceof PDFDict ? dict.lookup(PDFName.of('XObject')) : null
  const cacheGs = new Map()

  return {
    extGState(nom) {
      if (cacheGs.has(nom)) return cacheGs.get(nom)
      const g = extg instanceof PDFDict ? extg.lookup(PDFName.of(nom)) : null
      let r = null
      if (g instanceof PDFDict) {
        const bm = g.lookup(PDFName.of('BM'))
        const sm = g.lookup(PDFName.of('SMask'))
        r = {
          CA: nombre(g.lookup(PDFName.of('CA'))),
          ca: nombre(g.lookup(PDFName.of('ca'))),
          BM: bm ? nomDe(bm instanceof PDFArray ? bm.lookup(0) : bm) : undefined,
          SMask: sm ? (sm instanceof PDFDict ? 'Dict' : nomDe(sm)) : undefined,
        }
      }
      cacheGs.set(nom, r)
      return r
    },
    forme(nom) {
      if (formes.has(nom)) return formes.get(nom)
      const ref = xo instanceof PDFDict ? xo.get(PDFName.of(nom)) : null
      const obj = ref ? doc.context.lookup(ref) : null
      let forme = null
      if (ref instanceof PDFRef && obj instanceof PDFRawStream && nomDe(obj.dict.get(PDFName.of('Subtype'))) === 'Form') {
        const nombres = (a) => (a instanceof PDFArray ? a.asArray().map(x => doc.context.lookup(x)).map(x => x.asNumber()) : null)
        const res = obj.dict.lookup(PDFName.of('Resources'))
        forme = {
          id: String(ref),
          ref,
          bbox: nombres(obj.dict.lookup(PDFName.of('BBox'))),
          matrice: nombres(obj.dict.lookup(PDFName.of('Matrix'))),
          octets: decodePDFRawStream(obj).decode(),
          ressources: res instanceof PDFDict ? ressourcesDe(doc, res) : null,
        }
        parId.set(forme.id, forme)
      }
      formes.set(nom, forme)
      return forme
    },
    // Formes rencontrées pendant l'analyse, par identifiant d'objet
    formesLues() {
      return parId.entries()
    },
  }
}
