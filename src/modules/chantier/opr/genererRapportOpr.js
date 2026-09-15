// ─── Fabrication du PDF d'une visite OPR ou de levée ─────────────────────────

import { chargerPdfMake, imagesDocument } from '../comptes-rendus/genererRapport'
import { definitionPdfOpr, nomFichierOpr, REGLAGES_OPR_DEFAUT } from './rapportOprLogique'
import { groupesVisiteOpr, infosStatutReserve, libelleLot } from './oprLogique'

export async function genererPdfOpr({ visite, affaire, opr, plansCr, reglages: brut }) {
  const reglages = { ...REGLAGES_OPR_DEFAUT, ...brut }
  const pdfMake = await chargerPdfMake()
  const groupes = groupesVisiteOpr({ visite, visites: opr.visites, reserves: opr.reserves, constats: opr.constats, lots: opr.lots })
    .filter((g) => !reglages.lot || g.lotId === reglages.lot)
  const reserves = groupes.flatMap((g) => g.reserves)

  const { images, avertissements } = await imagesDocument({
    elements: reserves.map((r) => ({ id: r.id, numero: r.numero, couleur: infosStatutReserve(r).couleur })),
    photos: opr.photos.map((p) => ({ cle: p.reserve_id, chemin: p.chemin, legende: p.legende })),
    pastilles: opr.pastilles.map((p) => ({ cle: p.reserve_id, version_id: p.version_id, x: p.x, y: p.y })),
    liensPhotos: opr.obtenirLiens, plansCr, reglages,
  })

  const lot = reglages.lot ? opr.lots.find((l) => l.id === reglages.lot) : null
  const versionPour = lot ? libelleLot(lot) : null
  const definition = definitionPdfOpr({
    visite, affaire, groupes, toutesReserves: opr.reserves, lots: opr.lots,
    presences: opr.presences.filter((p) => p.visite_id === visite.id), reglages, versionPour, images,
  })
  const blob = await pdfMake.createPdf(definition).getBlob()
  return { blob, nomFichier: nomFichierOpr(visite, affaire, versionPour), avertissements }
}
