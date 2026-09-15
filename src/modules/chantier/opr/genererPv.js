// ─── Fabrication du PDF d'un procès-verbal ───────────────────────────────────

import { chargerPdfMake } from '../comptes-rendus/genererRapport'
import { imagePourPdf } from '../comptes-rendus/imagesRapport'
import { definitionPv, nomFichierPv } from './pvLogique'

export async function genererPv({ type, affaire, lot, entreprise, visite, reserves, champs }) {
  const pdfMake = await chargerPdfMake()
  const logo = await imagePourPdf(`${window.location.origin}/Logo_JGA_Archi.jpg`, 400, 0.85).catch(() => null)
  const definition = definitionPv({ type, affaire, lot, entreprise, visite, reserves, champs, logo })
  const blob = await pdfMake.createPdf(definition).getBlob()
  const date = champs.date_reception || champs.date_propositions || visite?.date_visite
  return { blob, nomFichier: nomFichierPv(type, lot, affaire, date) }
}
