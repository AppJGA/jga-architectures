// ─── Remarques rangées par destinataire (parties VI et VII) ──────────────────
//
// Refonte des comptes rendus, chantier 1 (migration 054). Une remarque des
// parties VI et VII est toujours adressée à quelqu'un : un lot (VII) ou un
// interlocuteur de l'affaire (VI). Le destinataire décide de la section ; le
// regroupement par lot ou par rôle se calcule ici, sans base ni écran
// (tests/remarques-destinataires.test.js).

import { numeroLot } from '../../../shared/lots/numeroLot'

export const PARTIES_REMARQUES = [
  { type: 'equipe', numero_romain: 'VI', titre: 'ÉQUIPE DE MAÎTRISE D’ŒUVRE ET MAÎTRISE D’OUVRAGE' },
  { type: 'entreprises', numero_romain: 'VII', titre: 'ENTREPRISES' },
]

export const estPartieRemarques = (section) =>
  PARTIES_REMARQUES.some((p) => p.type === section?.type_section)

/** Sections VI et VII qui manquent au compte rendu, à créer après les autres. */
export function sectionsAMettreEnPlace(sections = []) {
  let ordre = sections.reduce((m, s) => Math.max(m, s.ordre ?? 0), -1)
  return PARTIES_REMARQUES
    .filter((p) => !sections.some((s) => s.type_section === p.type))
    .map((p) => ({ numero_romain: p.numero_romain, titre: p.titre, type_section: p.type, ordre: ++ordre }))
}

/**
 * Sections dans l'ordre d'affichage, la partie VI toujours avant la VII. Une
 * partie créée plus tard (la première remarque à l'équipe, par exemple) prend
 * le dernier rang : sans ce rangement, VI s'afficherait après VII.
 */
export function ordonnerParties(sections = []) {
  const liste = [...sections]
  const iVI = liste.findIndex((s) => s.type_section === 'equipe')
  const iVII = liste.findIndex((s) => s.type_section === 'entreprises')
  if (iVI > iVII && iVII >= 0) {
    const [vi] = liste.splice(iVI, 1)
    liste.splice(iVII, 0, vi)
  }
  return liste
}

// ─── Numéros des parties ─────────────────────────────────────────────────────

const VALEURS_ROMAINES = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]

export function romain(n) {
  let reste = Math.max(1, Math.floor(n))
  let texte = ''
  for (const [valeur, lettres] of VALEURS_ROMAINES) {
    while (reste >= valeur) { texte += lettres; reste -= valeur }
  }
  return texte
}

// Ordre fixe des parties qui suivent les généralités
const APRES_GENERALITES = ['equipe', 'entreprises', 'intervenants']

/**
 * Les parties des remarques suivent les généralités : avec cinq parties de
 * généralités, l'équipe est VI et les entreprises VII ; une sixième partie les
 * décale en VII et VIII. Sans généralités saisies, on garde la numérotation
 * habituelle (cinq parties). Le numéro est calculé à l'affichage, jamais
 * enregistré : il suit les généralités sans écriture en base.
 */
export function numeroterParties(sections = [], nbGeneralites = 0) {
  const base = nbGeneralites > 0 ? nbGeneralites : 5
  return sections.map((s) => {
    const rang = APRES_GENERALITES.indexOf(s.type_section)
    return rang < 0 ? s : { ...s, numero_romain: romain(base + 1 + rang) }
  })
}

/** Numéros affichés des parties VI / VII (libellés des menus du destinataire). */
export function numerosParties(sections = []) {
  const de = (type, defaut) => sections.find((s) => s.type_section === type)?.numero_romain ?? defaut
  return { equipe: de('equipe', 'VI'), entreprises: de('entreprises', 'VII') }
}

// ─── Destinataire ────────────────────────────────────────────────────────────

/** 'lot:<id>', 'interlo:<id>' ou '' : la forme du filtre et des choix */
export function cleDestinataire(r) {
  if (r?.lot_id) return `lot:${r.lot_id}`
  if (r?.interlocuteur_id) return `interlo:${r.interlocuteur_id}`
  return ''
}

export function typePourDestinataire(cle) {
  if (cle?.startsWith('lot:')) return 'entreprises'
  if (cle?.startsWith('interlo:')) return 'equipe'
  return null
}

export function champsDestinataire(cle) {
  return {
    lot_id: cle?.startsWith('lot:') ? cle.slice(4) : null,
    interlocuteur_id: cle?.startsWith('interlo:') ? cle.slice(8) : null,
  }
}

// Copie de CATEGORIE_META (useAffaireInterlocuteurs) : ce module reste lisible
// sans React ni base, pour les tests.
const ROLES = {
  moa: 'Maître d’ouvrage',
  moe: 'Maître d’œuvre',
  be: 'Bureau d’études',
  ct: 'Contrôle technique',
  csps: 'CSPS',
  administration: 'Administration',
  autre: 'Autre',
}

/** « 02 - Démolition - Gros-Oeuvre », comme les titres du CR */
export function libelleLot(lot) {
  const numero = numeroLot(lot, { minimum: 2 })
  if (!numero) return lot?.nom ?? ''
  return `${numero} - ${lot.nom ?? ''}`.trim()
}

/** Rôle d'un interlocuteur : le libellé saisi (« BET Electricité »), sinon sa catégorie */
export function libelleRole(i) {
  return i?.categorie_label || ROLES[i?.categorie] || 'Autre'
}

export function nomInterlocuteur(i) {
  return [i?.prenom, i?.nom].filter(Boolean).join(' ') || i?.organisation || ''
}

const parNumero = (a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0)
const parOrdre = (a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)

/** Boutons du choix du destinataire : les lots (VII) puis l'équipe (VI). */
export function choixDestinataires({ lots = [], interlocuteurs = [] } = {}) {
  return {
    entreprises: [...lots].sort(parNumero).map((l) => ({
      cle: `lot:${l.id}`,
      libelle: libelleLot(l),
      court: numeroLot(l) ? `Lot ${numeroLot(l, { minimum: 2 })}` : l.nom,
      detail: l.nom,
    })),
    equipe: [...interlocuteurs].sort(parOrdre).map((i) => ({
      cle: `interlo:${i.id}`,
      libelle: nomInterlocuteur(i),
      court: nomInterlocuteur(i),
      detail: libelleRole(i),
    })),
  }
}

// Le destinataire de la remarque précédente est reproposé — à condition
// d'exister encore (lot supprimé depuis, autre affaire…)
export function destinataireParDefaut(memo, choix) {
  if (!memo) return ''
  const tous = [...(choix?.entreprises ?? []), ...(choix?.equipe ?? [])]
  return tous.some((c) => c.cle === memo) ? memo : ''
}

// ─── Regroupement ────────────────────────────────────────────────────────────

/**
 * Remarques d'une partie, en groupes : un par lot (dans l'ordre des numéros),
 * un par rôle (plusieurs personnes du même rôle ensemble, dans l'ordre de
 * l'équipe), un par destinataire supprimé (nom recopié), puis « À attribuer ».
 *
 * `destinataire` : celui qu'un « + » sur le titre du groupe propose.
 *
 * @returns [{ cle, titre, destinataire, remarques }]
 */
export function groupesDestinataires(remarques = [], { lots = [], interlocuteurs = [] } = {}) {
  const groupes = new Map()
  const ajouter = (cle, donnees, r) => {
    const g = groupes.get(cle) ?? { cle, ...donnees, remarques: [] }
    g.remarques.push(r)
    groupes.set(cle, g)
  }

  for (const r of remarques) {
    const lot = r.lot_id ? lots.find((l) => l.id === r.lot_id) : null
    const interlo = r.interlocuteur_id ? interlocuteurs.find((i) => i.id === r.interlocuteur_id) : null
    if (lot) {
      ajouter(`lot:${lot.id}`, { titre: libelleLot(lot), destinataire: `lot:${lot.id}`, rang: [0, Number(lot.numero) || 0] }, r)
    } else if (interlo) {
      const role = libelleRole(interlo)
      const duRole = interlocuteurs.filter((i) => libelleRole(i) === role).sort(parOrdre)
      ajouter(`role:${role}`, { titre: role, destinataire: `interlo:${duRole[0].id}`, rang: [0, duRole[0].ordre ?? 99] }, r)
    } else if (r.copie_destinataire) {
      ajouter(`copie:${r.copie_destinataire}`, { titre: r.copie_destinataire, destinataire: null, rang: [1, 0] }, r)
    } else {
      ajouter('aucun', { titre: 'À attribuer', destinataire: null, rang: [2, 0] }, r)
    }
  }

  return [...groupes.values()]
    .sort((a, b) => a.rang[0] - b.rang[0] || a.rang[1] - b.rang[1] || a.titre.localeCompare(b.titre))
    .map((g) => ({ cle: g.cle, titre: g.titre, destinataire: g.destinataire, remarques: g.remarques }))
}
