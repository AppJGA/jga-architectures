// ─── OPR et réserves : logique pure ──────────────────────────────────────────
//
// Sans navigateur ni base, pour être testée (tests/opr.test.js).

import { sansAccents } from '../comptes-rendus/crLogique'

export const STATUTS_RESERVE = [
  { code: 'ouverte',    libelle: 'Ouverte',    couleur: '#B8412C', fond: 'rgba(184,65,44,0.10)', close: false },
  { code: 'contestee',  libelle: 'Contestée',  couleur: '#C2610C', fond: 'rgba(217,119,6,0.12)', close: false },
  { code: 'levee',      libelle: 'Levée',      couleur: '#2A8A4E', fond: 'rgba(42,138,78,0.12)', close: true },
  { code: 'abandonnee', libelle: 'Abandonnée', couleur: '#5E5854', fond: '#F1EFE8',              close: true },
]
const PAR_CODE = new Map(STATUTS_RESERVE.map((s) => [s.code, s]))

export function infosStatutReserve(reserve) {
  return PAR_CODE.get(reserve?.statut) ?? PAR_CODE.get('ouverte')
}

export const TYPES_VISITE = {
  opr: { libelle: 'OPR', titre: 'Opérations préalables à la réception' },
  levee: { libelle: 'Levée', titre: 'Visite de levée des réserves' },
}

export function libelleLot(lot, copie) {
  if (lot) return lot.numero != null ? `Lot ${lot.numero} — ${lot.nom}` : lot.nom
  return copie ?? 'Sans lot'
}

// Ouverte ou contestée, délai dépassé à la date de référence
export function reserveEnRetard(reserve, dateReference) {
  if (!reserve?.date_limite || !dateReference) return false
  return !infosStatutReserve(reserve).close && reserve.date_limite < dateReference
}

/** Constat d'une réserve dans une visite donnée (null s'il n'y en a pas) */
export function constatDansVisite(constats, reserveId, visiteId) {
  return (constats ?? []).find((c) => c.reserve_id === reserveId && c.visite_id === visiteId) ?? null
}

/**
 * Statut de la réserve tel qu'il était à l'ouverture d'une visite : dernier
 * constat antérieur à cette visite. Sert à savoir quelles réserves une visite
 * de levée doit passer en revue, même après qu'on les a levées pendant la visite.
 */
export function statutAvantVisite(constats, reserveId, visite, visites) {
  const numeroVisite = visite?.numero ?? Infinity
  const numeros = new Map((visites ?? []).map((v) => [v.id, v.numero]))
  const anterieurs = (constats ?? [])
    .filter((c) => c.reserve_id === reserveId && c.visite_id !== visite?.id)
    .filter((c) => c.visite_id == null || (numeros.get(c.visite_id) ?? 0) < numeroVisite)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  return anterieurs.at(-1)?.statut ?? null
}

/**
 * Réserves affichées dans une visite, groupées par lot (ordre des numéros de
 * lot, « Sans lot » à la fin).
 * - OPR : réserves constatées lors de cette visite.
 * - Levée : réserves des lots concernés encore ouvertes ou contestées au début
 *   de la visite, plus celles constatées pendant la visite.
 * @returns [{ lotId, libelle, reserves: [{ ...reserve, nouvelle, constat }] }]
 */
export function groupesVisiteOpr({ visite, visites, reserves, constats, lots }) {
  const concernes = new Set(visite?.lot_ids ?? [])
  const dansLots = (r) => concernes.size === 0 || concernes.has(r.lot_id)
  const retenues = (reserves ?? []).filter((r) => {
    if (r.visite_origine_id === visite.id) return true
    if (visite.type !== 'levee' || !dansLots(r)) return false
    const origine = (visites ?? []).find((v) => v.id === r.visite_origine_id)
    if (origine && origine.numero > visite.numero) return false
    const avant = statutAvantVisite(constats, r.id, visite, visites)
    return avant === 'ouverte' || avant === 'contestee'
  })

  const parLot = new Map()
  for (const r of retenues) {
    const cle = r.lot_id ?? 'sans-lot'
    const lot = (lots ?? []).find((l) => l.id === r.lot_id)
    const groupe = parLot.get(cle) ?? { lotId: r.lot_id ?? null, numero: lot?.numero ?? Infinity, libelle: libelleLot(lot, r.copie_lot), reserves: [] }
    groupe.reserves.push({ ...r, nouvelle: r.visite_origine_id === visite.id, constat: constatDansVisite(constats, r.id, visite.id) })
    parLot.set(cle, groupe)
  }
  // Un lot concerné sans réserve reste affiché dans une OPR : on y ajoute ses réserves
  if (visite.type === 'opr') {
    for (const lotId of concernes) {
      if (parLot.has(lotId)) continue
      const lot = (lots ?? []).find((l) => l.id === lotId)
      if (lot) parLot.set(lotId, { lotId, numero: lot.numero ?? Infinity, libelle: libelleLot(lot), reserves: [] })
    }
  }
  return [...parLot.values()]
    .map((g) => ({ ...g, reserves: g.reserves.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)) }))
    .sort((a, b) => a.numero - b.numero)
}

/** Tableau de suivi par lot */
export function tableauParLot(reserves, lots, dateReference) {
  const lignes = new Map()
  for (const r of reserves ?? []) {
    const cle = r.lot_id ?? 'sans-lot'
    const lot = (lots ?? []).find((l) => l.id === r.lot_id)
    const ligne = lignes.get(cle) ?? { lotId: r.lot_id ?? null, numero: lot?.numero ?? Infinity, libelle: libelleLot(lot, r.copie_lot), total: 0, ouvertes: 0, contestees: 0, levees: 0, abandonnees: 0, enRetard: 0 }
    ligne.total++
    if (r.statut === 'ouverte') ligne.ouvertes++
    else if (r.statut === 'contestee') ligne.contestees++
    else if (r.statut === 'levee') ligne.levees++
    else if (r.statut === 'abandonnee') ligne.abandonnees++
    if (reserveEnRetard(r, dateReference)) ligne.enRetard++
    lignes.set(cle, ligne)
  }
  return [...lignes.values()].sort((a, b) => a.numero - b.numero)
}

// Une réserve ne se supprime que dans sa visite d'origine, tant qu'aucune
// autre visite ne l'a constatée
export function peutSupprimerReserve(reserve, constats) {
  return !(constats ?? []).some((c) => c.reserve_id === reserve.id && c.visite_id && c.visite_id !== reserve.visite_origine_id)
}

/** Filtre du suivi des réserves */
export function passeFiltreReserve(reserve, { statut = 'ouvertes', lotId = '', recherche = '' }, dateReference) {
  const infos = infosStatutReserve(reserve)
  if (statut === 'ouvertes' && infos.close) return false
  if (statut === 'retard' && !reserveEnRetard(reserve, dateReference)) return false
  if (PAR_CODE.has(statut) && reserve.statut !== statut) return false
  if (lotId && (lotId === 'sans-lot' ? reserve.lot_id : reserve.lot_id !== lotId)) return false
  const q = sansAccents(recherche).trim()
  if (q) {
    const num = q.replace(/^n\s*°?\s*/, '')
    if (/^\d+$/.test(num)) return String(reserve.numero) === num
    const texte = sansAccents([reserve.description, reserve.localisation].filter(Boolean).join(' '))
    if (!q.split(/\s+/).every((m) => texte.includes(m))) return false
  }
  return true
}

// Lots proposés à la création d'une visite : ceux qui ont une entreprise
export function lotsAvecEntreprise(lots, lotEntreprises) {
  const avec = new Set((lotEntreprises ?? []).map((le) => le.lot_id))
  return (lots ?? []).filter((l) => avec.has(l.id)).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
}
