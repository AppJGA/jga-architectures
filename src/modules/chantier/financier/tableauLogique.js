// ─── Tableau du suivi financier d'un chantier : logique pure ────────────────
//
// À partir des lots, des lignes et des fiches de travaux modificatifs : le
// tableau affiché et ses totaux. Rien n'y disparaît — une ligne sans lot se
// range en fin de tableau plutôt que de peser sur le total sans se montrer.

export function buildTableau(lotsData, lignesData, ftmsData, tva) {
  // Le lien fiche ↔ ligne se lit des deux côtés : par `ligne_financiere_id`
  // sur la fiche, et par `ftm_id` sur la ligne. L'un des deux peut manquer sur
  // d'anciennes données ; le numéro de fiche doit s'afficher quand même.
  const ftmByLfId = {}
  const ftmParId = {}
  for (const f of ftmsData ?? []) {
    ftmParId[f.id] = f
    if (f.ligne_financiere_id) {
      ftmByLfId[f.ligne_financiere_id] = { ftm_id: f.id, ftm_numero: f.numero }
    }
  }
  const ficheDe = (ligne) => ftmByLfId[ligne.id]
    ?? (ligne.ftm_id && ftmParId[ligne.ftm_id]
      ? { ftm_id: ligne.ftm_id, ftm_numero: ftmParId[ligne.ftm_id].numero }
      : {})

  const lots = lotsData.map(lot => {
    const le = lot.lot_entreprises?.[0] ?? null
    const marche_base_ht = le?.montant_marche_ht ?? 0

    const allLignes = lignesData
      .filter(l => l.lot_id === lot.id)
      .map(l => ({ ...l, ...ficheDe(l) }))
      .sort((a, b) => a.ordre - b.ordre)

    const activeLignes = allLignes.filter(l => l.statut !== 'refuse')

    const sum = (cat) =>
      activeLignes.filter(l => l.categorie === cat).reduce((s, l) => s + (l.montant_ht ?? 0), 0)

    const total_aleas_ht       = sum('aleas')
    const total_adaptation_ht  = sum('adaptation_moe')
    const total_mo_ht          = sum('demande_mo')
    const total_supplements_ht = total_aleas_ht + total_adaptation_ht + total_mo_ht
    const total_lot_ht         = marche_base_ht + total_supplements_ht
    const delta_pct            = marche_base_ht > 0 ? (total_supplements_ht / marche_base_ht) * 100 : 0

    return {
      id: lot.id,
      numero: lot.numero,
      nom: lot.nom,
      ordre: lot.ordre,
      entreprise: le?.entreprises ?? null,
      marche_base_ht,
      marche_base_ttc: marche_base_ht * tva,
      lignes: allLignes,
      total_aleas_ht,
      total_adaptation_ht,
      total_mo_ht,
      total_supplements_ht,
      total_lot_ht,
      total_lot_ttc: total_lot_ht * tva,
      delta_pct,
    }
  })

  // Lignes sans lot : une fiche de travaux peut naître d'une remarque qui n'en
  // désigne aucun. Elles se rangent en fin de tableau plutôt que de disparaître
  // du suivi tout en pesant sur le total.
  const lignesSansLot = lignesData
    .filter(l => !l.lot_id)
    .map(l => ({ ...l, ...ficheDe(l) }))
    .sort((a, b) => a.ordre - b.ordre)
  const actives = lignesSansLot.filter(l => l.statut !== 'refuse')
  const sommeSansLot = (cat) => actives.filter(l => l.categorie === cat).reduce((s, l) => s + (l.montant_ht ?? 0), 0)

  if (lignesSansLot.length > 0) {
    const total_aleas_ht = sommeSansLot('aleas')
    const total_adaptation_ht = sommeSansLot('adaptation_moe')
    const total_mo_ht = sommeSansLot('demande_mo')
    const total_supplements_ht = total_aleas_ht + total_adaptation_ht + total_mo_ht
    lots.push({
      id: 'sans-lot', numero: null, nom: 'Sans lot attribué', ordre: 9999,
      sansLot: true, entreprise: null,
      marche_base_ht: 0, marche_base_ttc: 0,
      lignes: lignesSansLot,
      total_aleas_ht, total_adaptation_ht, total_mo_ht, total_supplements_ht,
      total_lot_ht: total_supplements_ht,
      total_lot_ttc: total_supplements_ht * tva,
      delta_pct: 0,
    })
  }

  const sum = (key) => lots.reduce((s, l) => s + l[key], 0)
  const marches_base_ht       = sum('marche_base_ht')
  const total_aleas_ht        = sum('total_aleas_ht')
  const total_adaptation_ht   = sum('total_adaptation_ht')
  const total_mo_ht           = sum('total_mo_ht')
  const total_supplements_ht  = sum('total_supplements_ht')
  const total_general_ht      = sum('total_lot_ht')

  const totaux = {
    marches_base_ht,
    total_aleas_ht,
    total_adaptation_ht,
    total_mo_ht,
    total_supplements_ht,
    total_general_ht,
    total_general_ttc: total_general_ht * tva,
    delta_pct: marches_base_ht > 0 ? (total_supplements_ht / marches_base_ht) * 100 : 0,
    alea_budget_pct: marches_base_ht > 0 ? (total_aleas_ht / marches_base_ht) * 100 : 0,
  }

  return { lots, totaux }
}
