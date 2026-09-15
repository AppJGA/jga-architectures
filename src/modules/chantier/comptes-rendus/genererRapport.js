// ─── Fabrication du PDF d'un compte rendu, dans le navigateur ────────────────

import { definitionPdf, selectionnerSections, remarquesDesSections, nomFichierCr, reglagesEffectifs } from './rapportLogique'
import { imagePourPdf, extraitPlanPourPdf, plancheAvecPastilles } from './imagesRapport'
import { infosStatut } from './crLogique'

// pdfmake et ses polices (~1 Mo) ne sont chargés qu'au premier export
let chargement = null
function chargerPdfMake() {
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
 * @returns { blob, nomFichier, avertissements }
 * Une image qui ne se charge pas n'empêche pas le PDF : elle est omise et
 * signalée dans `avertissements`.
 */
export async function genererPdfCr({ cr, affaire, sections, presences, lots, interlocuteurs, photos, liensPhotos, pastilles, plansCr, reglages: brut }) {
  const reglages = reglagesEffectifs(brut)
  const [pdfMake] = await Promise.all([chargerPdfMake()])
  const choisies = selectionnerSections(sections, reglages)
  const remarques = remarquesDesSections(choisies)
  const idsRetenus = new Set(remarques.map((r) => r.id))
  const manquants = new Map() // libellé → nombre
  const tolerer = (promesse, quoi) => promesse.catch((err) => {
    console.warn(`PDF, ${quoi} non chargé :`, err)
    manquants.set(quoi, (manquants.get(quoi) ?? 0) + 1)
    return null
  })

  const logo = await tolerer(imagePourPdf(`${window.location.origin}/Logo_JGA_Archi.jpg`, 400, 0.85), 'Logo')

  // Photos
  const photosParRemarque = new Map()
  if (reglages.photos !== 'aucune') {
    const retenues = (photos ?? []).filter((p) => idsRetenus.has(p.remarque_id))
    const liens = retenues.length ? await liensPhotos(retenues.map((p) => p.chemin)) : new Map()
    const taille = reglages.photos === 'grandes' ? 1000 : 700
    const prets = await Promise.all(retenues.map((p) => tolerer(imagePourPdf(liens.get(p.chemin), taille), 'Photo').then((image) => ({ p, image }))))
    for (const { p, image } of prets) {
      if (!image) continue
      photosParRemarque.set(p.remarque_id, [...(photosParRemarque.get(p.remarque_id) ?? []), { image, legende: p.legende }])
    }
  }

  // Plans
  const extraits = new Map()
  const planches = []
  const pastillesRetenues = reglages.plans === 'aucun' ? [] : (pastilles ?? []).filter((p) => idsRetenus.has(p.remarque_id))
  if (pastillesRetenues.length > 0 && plansCr) {
    const parRemarque = new Map(remarques.map((r) => [r.id, r]))
    const versions = [...new Set(pastillesRetenues.map((p) => p.version_id))]
      .map((id) => plansCr.versions.find((v) => v.id === id)).filter(Boolean)
    const liens = await plansCr.obtenirLiens(versions.map((v) => v.chemin_apercu))
    for (const v of versions) {
      const url = liens.get(v.chemin_apercu)
      if (!url) continue
      const plan = plansCr.plans.find((p) => p.id === v.plan_id)
      const legende = `${plan?.nom ?? 'Plan'} · indice ${v.indice}`
      const siennes = pastillesRetenues.filter((p) => p.version_id === v.id).map((p) => {
        const r = parRemarque.get(p.remarque_id)
        return { remarqueId: p.remarque_id, x: p.x, y: p.y, numero: r?.numero ?? '', couleur: r ? infosStatut(r).couleur : '#9C9591' }
      })
      if (['extraits', 'les_deux'].includes(reglages.plans)) {
        for (const pa of siennes) {
          const image = await tolerer(extraitPlanPourPdf(url, pa), 'Extrait')
          if (image) extraits.set(pa.remarqueId, { image, legende })
        }
      }
      if (['planches', 'les_deux'].includes(reglages.plans)) {
        const image = await tolerer(plancheAvecPastilles(url, siennes), 'Plan')
        if (image) planches.push({ image, titre: legende })
      }
    }
  }

  const versionPour = reglages.destinataire ? libelleVersion(reglages.destinataire, lots, interlocuteurs) : null
  const definition = definitionPdf({
    cr, affaire, sections: choisies, presences, lots, interlocuteurs, reglages, versionPour,
    images: { logo, photos: photosParRemarque, extraits, planches },
  })
  const blob = await pdfMake.createPdf(definition).getBlob()
  const avertissements = [...manquants].map(([quoi, n]) => `${n} ${quoi.toLowerCase()}${n > 1 ? 's' : ''} non chargé${quoi === 'Photo' ? 'e' : ''}${n > 1 ? 's' : ''}`)
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
