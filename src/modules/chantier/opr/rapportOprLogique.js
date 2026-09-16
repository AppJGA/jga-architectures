// ─── PDF d'une visite OPR ou de levée : logique pure ─────────────────────────

import {
  COULEUR, jour, tableauFin, lignePhotos, piedPdf, entetePdf, blocAffaire, blocsPresences, blocPlanches,
} from '../comptes-rendus/rapportLogique'
import { TYPES_VISITE, infosStatutReserve, reserveEnRetard, tableauParLot, grouperParZone } from './oprLogique'

export const REGLAGES_OPR_DEFAUT = { photos: 'petites', plans: 'extraits', lot: '' }

export function nomFichierOpr(visite, affaire, versionPour) {
  const prefixe = visite.type === 'levee' ? 'Levée' : 'OPR'
  const morceaux = [`${prefixe}${String(visite.numero).padStart(2, '0')}`, affaire?.nom, visite.date_visite, versionPour]
    .filter(Boolean).map((m) => String(m).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim())
  return `${morceaux.join(' – ')}.pdf`
}

/**
 * Statut affiché dans le PDF d'une visite : dans une visite de levée, le
 * constat du jour (« Non levée » si la réserve reste ouverte, « Non revue »
 * sans constat) ; dans une OPR, le statut de la réserve.
 */
export function statutPourVisite(reserve, visite) {
  if (visite.type !== 'levee' || reserve.nouvelle) {
    const s = infosStatutReserve(reserve.constat ?? reserve)
    return { libelle: s.libelle, couleur: s.couleur }
  }
  if (!reserve.constat) return { libelle: 'Non revue', couleur: COULEUR.grisClair }
  if (reserve.constat.statut === 'ouverte') return { libelle: 'Non levée', couleur: '#B8412C' }
  const s = infosStatutReserve(reserve.constat)
  return { libelle: s.libelle, couleur: s.couleur }
}

function lignesReserve(r, { visite, images, reglages }) {
  const statut = statutPourVisite(r, visite)
  const retard = reserveEnRetard(r, visite.date_visite)
  const lignes = [[
    { text: `n°${r.numero}`, fontSize: 8, bold: true, color: COULEUR.orange },
    { text: r.localisation ?? '—', fontSize: 8, color: COULEUR.gris },
    {
      stack: [
        { text: r.description, bold: !!r.est_important },
        ...(r.constat?.commentaire ? [{ text: r.constat.commentaire, italics: true, fontSize: 8, color: COULEUR.gris, margin: [0, 2, 0, 0] }] : []),
        ...(visite.type === 'levee' && r.nouvelle ? [{ text: 'Nouvelle réserve', fontSize: 7, color: COULEUR.orange }] : []),
      ],
    },
    {
      stack: r.date_limite
        ? [{ text: jour(r.date_limite), fontSize: 8, color: retard ? '#B8412C' : COULEUR.gris, bold: retard },
          ...(retard ? [{ text: 'EN RETARD', fontSize: 6.5, bold: true, color: 'white', background: '#B8412C' }] : [])]
        : [{ text: '—', fontSize: 8, color: COULEUR.grisClair }],
    },
    { text: statut.libelle, fontSize: 8, bold: true, color: statut.couleur },
  ]]
  const photos = reglages.photos !== 'aucune' ? images.photos?.get(r.id) ?? [] : []
  if (photos.length > 0) lignes.push(['', '', { colSpan: 3, stack: lignePhotos(photos, reglages.photos) }, '', ''])
  const extrait = ['extraits', 'les_deux'].includes(reglages.plans) ? images.extraits?.get(r.id) : null
  if (extrait) {
    lignes.push(['', '', { colSpan: 3, stack: [{ image: extrait.image, width: 220 }, { text: extrait.legende, fontSize: 7, color: COULEUR.gris, margin: [0, 2, 0, 0] }] }, '', ''])
  }
  return lignes
}

/**
 * @param donnees { visite, affaire, groupes (groupesVisiteOpr, déjà filtrés par
 *   lot si version), toutesReserves (pour le récapitulatif), lots, presences,
 *   reglages, versionPour, images }
 */
export function definitionPdfOpr({ visite, affaire, groupes, toutesReserves, lots, zones = [], presences, reglages: brut, versionPour, images = {} }) {
  const reglages = { ...REGLAGES_OPR_DEFAUT, ...brut }
  const type = TYPES_VISITE[visite.type]
  const num = String(visite.numero).padStart(2, '0')
  const contexte = { visite, images, reglages }
  const lotsConcernes = (visite.lot_ids ?? []).map((id) => lots.find((l) => l.id === id)).filter(Boolean)
    .map((l) => (l.numero != null ? `Lot ${l.numero} ${l.nom}` : l.nom))
  const recap = tableauParLot(
    (toutesReserves ?? []).filter((r) => !reglages.lot || r.lot_id === reglages.lot),
    lots, visite.date_visite,
  ).filter((l) => (visite.lot_ids ?? []).length === 0 || visite.lot_ids.includes(l.lotId))

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    info: { title: `${type.titre} n°${num}${affaire?.nom ? ` — ${affaire.nom}` : ''}`, author: 'JGA Architectes' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEUR.texte, lineHeight: 1.15 },
    footer: piedPdf,
    content: [
      ...entetePdf({
        logo: images.logo, titre: `${type.libelle === 'OPR' ? 'OPR' : 'Levée des réserves'} n°${num}`,
        sousTitre: jour(visite.date_visite, { day: 'numeric', month: 'long', year: 'numeric' }),
        emis: visite.statut === 'emis', dateEmission: visite.date_emission, versionPour,
      }),
      { text: type.titre, alignment: 'center', fontSize: 10, color: COULEUR.gris, margin: [0, -4, 0, 8] },
      blocAffaire(affaire),
      ...(lotsConcernes.length > 0 ? [{ text: [{ text: 'Lots concernés : ', bold: true }, lotsConcernes.join(' · ')], fontSize: 8.5, margin: [0, 0, 0, 6] }] : []),
      ...blocsPresences(presences, true),
      ...(recap.length > 0 ? [
        { text: 'Récapitulatif des réserves par lot', bold: true, fontSize: 10, margin: [0, 10, 0, 4] },
        {
          layout: tableauFin,
          table: {
            headerRows: 1,
            widths: ['*', 50, 50, 55, 50, 60],
            body: [
              ['Lot', 'Total', 'Ouvertes', 'Contestées', 'Levées', 'Abandonnées'].map((t) => ({ text: t, bold: true, fontSize: 8, color: COULEUR.gris })),
              ...recap.map((l) => [
                { text: l.libelle, fontSize: 8.5 },
                { text: String(l.total), alignment: 'center' },
                { text: String(l.ouvertes), alignment: 'center', color: l.ouvertes ? '#B8412C' : COULEUR.grisClair, bold: l.ouvertes > 0 },
                { text: String(l.contestees), alignment: 'center', color: l.contestees ? '#C2610C' : COULEUR.grisClair },
                { text: String(l.levees), alignment: 'center', color: l.levees ? '#2A8A4E' : COULEUR.grisClair },
                { text: String(l.abandonnees), alignment: 'center', color: COULEUR.grisClair },
              ]),
            ],
          },
        },
      ] : []),
      ...(groupes ?? []).map((g) => ({
        stack: [
          {
            margin: [0, 12, 0, 6],
            table: { widths: ['*'], body: [[{ text: g.libelle.toUpperCase(), bold: true, fontSize: 10.5, fillColor: '#FFF8F5' }]] },
            layout: { hLineWidth: (i) => (i === 1 ? 1.2 : 0), vLineWidth: () => 0, hLineColor: () => COULEUR.orange, paddingLeft: () => 6, paddingTop: () => 5, paddingBottom: () => 5 },
          },
          ...(g.reserves.length === 0
            ? [{ text: 'Aucune réserve', italics: true, fontSize: 8, color: COULEUR.grisClair, margin: [0, 2, 0, 6] }]
            : grouperParZone(g.reserves, zones).flatMap((parZone, i, tout) => [
              // Sous-titre de zone seulement s'il y en a plusieurs dans le lot
              ...(tout.length > 1 ? [{ text: parZone.libelle ?? 'Sans zone', bold: true, fontSize: 9, color: '#1B3A5C', margin: [2, i ? 6 : 2, 0, 4] }] : []),
              {
                layout: tableauFin,
                table: {
                  headerRows: 1, dontBreakRows: true,
                  widths: [30, 80, '*', 60, 62],
                  body: [
                    ['N°', 'Localisation', 'Description', 'Délai', 'Statut'].map((t) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, color: COULEUR.gris })),
                    ...parZone.elements.flatMap((r) => lignesReserve(r, contexte)),
                  ],
                },
              },
            ])),
        ],
      })),
      ...(visite.observations ? [
        { text: 'Observations', bold: true, fontSize: 10, margin: [0, 12, 0, 4] },
        { text: visite.observations, fontSize: 9 },
      ] : []),
      ...blocPlanches(['planches', 'les_deux'].includes(reglages.plans) ? images.planches ?? [] : []),
    ],
  }
}
