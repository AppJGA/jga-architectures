// ─── Démarrer une visite sans réseau : logique pure ──────────────────────────
//
// En ligne, la base attribue le numéro et la visite reprend la précédente
// (useComptesRendus). Sans réseau, la reprise se fait sur l'appareil, à partir
// de la visite précédente emportée (« Préparer pour le chantier ») : mêmes
// règles (`preparerReprise`), mêmes participants. La création part ensuite
// dans la file, avant toute autre modification de la visite (envoi.js) ; si
// le numéro a été pris entre-temps, la visite prend le suivant.
// Testé (tests/hors-ligne.test.js).

import { preparerReprise } from '../crLogique'

/** Sections, sous-sections et remarques rangées comme à l'écran */
export function arbreSections(sections, sousSections, remarques) {
  // Séparer remarques principales (sans parent) des sous-remarques
  const principales = remarques.filter(r => !r.parent_id)
  const sousRems    = remarques.filter(r => !!r.parent_id)

  const sousRemsByParent = {}
  for (const sr of sousRems) {
    if (!sousRemsByParent[sr.parent_id]) sousRemsByParent[sr.parent_id] = []
    sousRemsByParent[sr.parent_id].push(sr)
  }

  const withSousRems = (remList) =>
    remList.sort((a, b) => a.ordre - b.ordre).map(r => ({
      ...r,
      sous_remarques: (sousRemsByParent[r.id] ?? [])
        .sort((a, b) => new Date(a.date_note || '1970') - new Date(b.date_note || '1970')),
    }))

  // Grouper par sous-section ou par section directe
  const subRemBySSId  = {}
  const dirRemBySecId = {}
  for (const r of principales) {
    if (r.sous_section_id) {
      if (!subRemBySSId[r.sous_section_id]) subRemBySSId[r.sous_section_id] = []
      subRemBySSId[r.sous_section_id].push(r)
    } else if (r.section_id) {
      if (!dirRemBySecId[r.section_id]) dirRemBySecId[r.section_id] = []
      dirRemBySecId[r.section_id].push(r)
    }
  }

  const ssMap = {}
  for (const ss of sousSections) {
    if (!ssMap[ss.section_id]) ssMap[ss.section_id] = []
    ssMap[ss.section_id].push({
      ...ss,
      remarques: withSousRems(subRemBySSId[ss.id] ?? []),
    })
  }

  return sections
    .sort((a, b) => a.ordre - b.ordre)
    .map(s => ({
      ...s,
      sousSections:    (ssMap[s.id] ?? []).sort((a, b) => a.ordre - b.ordre),
      directRemarques: withSousRems(dirRemBySecId[s.id] ?? []),
    }))
}

/** L'inverse : les lignes à plat, suites comprises */
export function aplatirSections(arbre) {
  const sections = []
  const sousSections = []
  const remarques = []
  const pousser = (liste) => {
    for (const r of liste ?? []) {
      const { sous_remarques: suites = [], ...remarque } = r
      remarques.push(remarque)
      remarques.push(...suites)
    }
  }
  for (const s of arbre ?? []) {
    const { sousSections: sous = [], directRemarques = [], ...section } = s
    sections.push(section)
    for (const ss of sous) {
      const { remarques: rs = [], ...sousSection } = ss
      sousSections.push(sousSection)
      pousser(rs)
    }
    pousser(directRemarques)
  }
  return { sections, sousSections, remarques }
}

/**
 * Les participants de la visite précédente, à pointer : une ligne à insérer
 * (colonnes de la table seulement) et la même à afficher (avec les fiches
 * jointes, pour le nom). Les copies `copie_*` suivent, quand la base les a.
 */
export function presencesReprises(presences, crId, nouvelId) {
  const lignes = []
  const locales = []
  for (const p of presences ?? []) {
    if (!p.interlocuteur_id && !p.lot_entreprise_id) continue
    const copies = Object.fromEntries(Object.entries(p).filter(([cle]) => cle.startsWith('copie_')))
    const ligne = {
      id: nouvelId(), cr_id: crId,
      interlocuteur_id: p.interlocuteur_id ?? null, lot_entreprise_id: p.lot_entreprise_id ?? null,
      presence: 'na', convoque: false, ...copies,
    }
    lignes.push(ligne)
    locales.push({ ...p, ...ligne, heure_convocation: null })
  }
  return { lignes, locales }
}

/** Le numéro sans réseau : le suivant du plus grand connu sur l'appareil */
export function numeroHorsLigne(comptesRendus) {
  return (comptesRendus ?? []).reduce((max, cr) => Math.max(max, Number(cr.numero) || 0), 0) + 1
}

/**
 * La visite créée sur l'appareil.
 * @param precedente état de la visite précédente emportée (instantané + file),
 *   ou null pour une première visite
 * @returns { cr, reprise (lignes à insérer), instantane (ce que montre l'écran) }
 */
export function creationHorsLigne({ affaireId, precedente = null, numero, date, nouvelId }) {
  const cr = { id: nouvelId(), affaire_id: affaireId, numero, date_reunion: date, statut: 'brouillon' }
  const aPlat = aplatirSections(precedente?.sections ?? [])
  const reprise = preparerReprise({
    ...aPlat,
    photos: precedente?.photos ?? [], pastilles: precedente?.pastilles ?? [],
    crId: cr.id, affaireId, nouvelId,
  })
  const presences = presencesReprises(precedente?.presences ?? [], cr.id, nouvelId)
  const instantane = {
    cr: { ...cr, cree_hors_ligne: true },
    sections: arbreSections(
      reprise.sections.map((s) => ({ ...s })),
      reprise.sousSections.map((ss) => ({ ...ss })),
      [...reprise.remarques, ...reprise.sousRemarques].map((r) => ({ ...r, parent_id: r.parent_id ?? null })),
    ),
    presences: presences.locales,
    profiles: precedente?.profiles ?? [],
    photos: reprise.photos,
    pastilles: reprise.pastilles,
    zones: precedente?.zones ?? [],
    ftms: precedente?.ftms ?? [],
    planning: precedente?.planning ?? { taches: [], lots: [], periodes: [] },
  }
  return { cr, reprise: { ...reprise, presences: presences.lignes }, instantane }
}
