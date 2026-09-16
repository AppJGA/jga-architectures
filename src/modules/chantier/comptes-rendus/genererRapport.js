// ─── Fabrication du PDF d'un compte rendu, dans le navigateur ────────────────

import { definitionPdf, selectionnerSections, remarquesDesSections, nomFichierCr, reglagesEffectifs } from './rapportLogique'
import { imagePourPdf, extraitPlanPourPdf, plancheAvecPastilles } from './imagesRapport'
import { infosStatut } from './crLogique'

// pdfmake et ses polices (~1 Mo) ne sont chargés qu'au premier export
let chargement = null
export function chargerPdfMake() {
  if (!chargement) {
    chargement = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
      .then(([moduleMake, moduleVfs]) => {
        const pdfMake = moduleMake.default ?? moduleMake
        pdfMake.addVirtualFileSystem(moduleVfs.default ?? moduleVfs)
        return pdfMake
      })
      .catch((err) => { chargement = null; throw err })
  }
  return chargement
}

// Libellé du destinataire d'une version par entreprise
export function libelleVersion(destinataire, lots, interlocuteurs) {
  if (destinataire.startsWith('lot:')) {
    const l = lots.find((x) => x.id === destinataire.slice(4))
    return l ? (l.numero ? `Lot ${l.numero} — ${l.nom}` : l.nom) : null
  }
  if (destinataire.startsWith('interlo:')) {
    const i = interlocuteurs.find((x) => x.id === destinataire.slice(8))
    return i ? [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation : null
  }
  return null
}

/**
 * Images d'un document (logo, photos, extraits et plans entiers), prêtes pour
 * pdfmake. Une image qui ne se charge pas est omise et comptée dans
 * `avertissements`.
 * @param elements  [{ id, numero, couleur }] remarques ou réserves du document
 * @param photos    [{ cle (id de l'élément), chemin, legende }]
 * @param pastilles [{ cle, version_id, x, y }]
 */
export async function imagesDocument({ elements, photos, liensPhotos, pastilles, plansCr, reglages }) {
  const manquants = new Map()
  const tolerer = (promesse, quoi) => promesse.catch((err) => {
    console.warn(`PDF, ${quoi} non chargé :`, err)
    manquants.set(quoi, (manquants.get(quoi) ?? 0) + 1)
    return null
  })
  const parId = new Map(elements.map((e) => [e.id, e]))

  const logo = await tolerer(imagePourPdf(`${window.location.origin}/Logo_JGA_Archi.jpg`, 400, 0.85), 'Logo')

  const photosParElement = new Map()
  if (reglages.photos !== 'aucune') {
    const retenues = (photos ?? []).filter((p) => parId.has(p.cle))
    const liens = retenues.length ? await liensPhotos(retenues.map((p) => p.chemin)) : new Map()
    const taille = reglages.photos === 'grandes' ? 1000 : 700
    const prets = await Promise.all(retenues.map((p) => tolerer(imagePourPdf(liens.get(p.chemin), taille), 'Photo').then((image) => ({ p, image }))))
    for (const { p, image } of prets) {
      if (image) photosParElement.set(p.cle, [...(photosParElement.get(p.cle) ?? []), { image, legende: p.legende }])
    }
  }

  const extraits = new Map()
  const planches = []
  const retenues = reglages.plans === 'aucun' ? [] : (pastilles ?? []).filter((p) => parId.has(p.cle))
  if (retenues.length > 0 && plansCr) {
    const versions = [...new Set(retenues.map((p) => p.version_id))]
      .map((id) => plansCr.versions.find((v) => v.id === id)).filter(Boolean)
    const liens = await plansCr.obtenirLiens(versions.map((v) => v.chemin_apercu))
    for (const v of versions) {
      const url = liens.get(v.chemin_apercu)
      if (!url) continue
      const plan = plansCr.plans.find((p) => p.id === v.plan_id)
      const legende = `${plan?.nom ?? 'Plan'} · indice ${v.indice}`
      const siennes = retenues.filter((p) => p.version_id === v.id).map((p) => ({
        cle: p.cle, x: p.x, y: p.y, numero: parId.get(p.cle)?.numero ?? '', couleur: parId.get(p.cle)?.couleur ?? '#9C9591',
      }))
      if (['extraits', 'les_deux'].includes(reglages.plans)) {
        for (const pa of siennes) {
          const image = await tolerer(extraitPlanPourPdf(url, pa), 'Extrait')
          if (image) extraits.set(pa.cle, { image, legende })
        }
      }
      if (['planches', 'les_deux'].includes(reglages.plans)) {
        const image = await tolerer(plancheAvecPastilles(url, siennes), 'Plan')
        if (image) planches.push({ image, titre: legende })
      }
    }
  }

  const avertissements = [...manquants].map(([quoi, n]) => `${n} ${quoi.toLowerCase()}${n > 1 ? 's' : ''} non chargé${quoi === 'Photo' ? 'e' : ''}${n > 1 ? 's' : ''}`)
  return { images: { logo, photos: photosParElement, extraits, planches }, avertissements }
}

/**
 * @returns { blob, nomFichier, avertissements }
 */
export async function genererPdfCr({ cr, affaire, sections, presences, lots, interlocuteurs, zones, avancement, profils, photos, liensPhotos, pastilles, plansCr, reglages: brut }) {
  const reglages = reglagesEffectifs(brut)
  const pdfMake = await chargerPdfMake()
  const choisies = selectionnerSections(sections, reglages)
  const remarques = remarquesDesSections(choisies)

  const { images, avertissements } = await imagesDocument({
    elements: remarques.map((r) => ({ id: r.id, numero: r.numero, couleur: infosStatut(r).couleur })),
    photos: (photos ?? []).map((p) => ({ cle: p.remarque_id, chemin: p.chemin, legende: p.legende })),
    pastilles: (pastilles ?? []).map((p) => ({ cle: p.remarque_id, version_id: p.version_id, x: p.x, y: p.y })),
    liensPhotos, plansCr, reglages,
  })

  const versionPour = reglages.destinataire ? libelleVersion(reglages.destinataire, lots, interlocuteurs) : null
  const definition = definitionPdf({ cr, affaire, sections: choisies, presences, lots, interlocuteurs, zones, avancement, profils, reglages, versionPour, images })
  const blob = await pdfMake.createPdf(definition).getBlob()
  return { blob, nomFichier: nomFichierCr(cr, affaire, versionPour), avertissements }
}

// Téléchargement d'un fichier fabriqué dans la page
export function telechargerBlob(blob, nomFichier) {
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
