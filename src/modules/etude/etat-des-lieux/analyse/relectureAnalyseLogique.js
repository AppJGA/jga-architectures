// ─── Relecture au bureau des pièces analysées : ce qui se calcule sans écran ─
//
// Compte « à valider » d'une pièce, ordre de la liste, éléments rangés par
// calque, menus de la fiche d'un élément (type, point), saisie mise en
// colonnes et message d'une analyse demandée qui n'est pas partie. Pur,
// testé (tests/etat-des-lieux-relecture-analyse.test.js).

import { CALQUES, CALQUES_DE_POINT, calqueEdl, typeEdl } from '../calquesEdl.js'
import { completudeFiche, RUBRIQUES_FICHE } from './analyseEdlLogique.js'

export const LIBELLES_FICHE = {
  sol: 'Sol', murs: 'Murs', plafond: 'Plafond', plinthes: 'Plinthes', hsp: 'HSP', remarques: 'Remarques',
}

/**
 * Ce que la pièce demande encore à l'agence. La fiche compte pour une chose à
 * valider : c'est elle que la relecture ouvre en premier.
 *
 * @param piece pièce fusionnée avec son état d'analyse (fiche, hsp_lue,
 *   analyse_le, analyse_erreur, fiche_a_valider)
 * @param elements éléments de l'affaire (filtrés ici sur la pièce)
 */
export function resumePieceRelecture(piece, elements = []) {
  const siens = (elements ?? []).filter((e) => e.piece_id === piece?.id)
  const elementsAValider = siens.filter((e) => e.a_valider).length
  const ficheAValider = piece?.fiche_a_valider === true
  const analysee = !!piece?.analyse_le
  const { complete, manquantes } = completudeFiche(piece?.fiche, { hspLue: piece?.hsp_lue })
  const erreur = piece?.analyse_erreur || null
  const aValider = elementsAValider + (ficheAValider ? 1 : 0)
  // À valider d'abord, puis ce qui reste à compléter (fiche incomplète ou
  // analyse en échec), puis le reste ; une pièce jamais analysée n'a encore
  // rien d'incomplet
  const incomplete = !!erreur || (analysee && !complete)
  const rang = aValider > 0 ? 0 : incomplete ? 1 : 2
  return { elements: siens.length, elementsAValider, ficheAValider, aValider, analysee, erreur, complete, manquantes, rang }
}

/**
 * Pièces d'un étage dans l'ordre de la relecture ; l'ordre du plan départage
 * (tri stable). `visitees` : les pièces jamais visitées passent en fin.
 */
export function piecesARelire(pieces = [], elements = [], visitees = null) {
  return (pieces ?? [])
    .map((piece, i) => {
      const resume = resumePieceRelecture(piece, elements)
      const visitee = !visitees || visitees.has(piece.id) || resume.elements > 0 || resume.analysee
      return { piece, resume, visitee, i }
    })
    .sort((a, b) => (Number(!a.visitee) - Number(!b.visitee)) || (a.resume.rang - b.resume.rang) || (a.i - b.i))
    .map(({ piece, resume, visitee }) => ({ piece, resume, visitee }))
}

/** Total « à valider » de l'affaire (badge de l'onglet Relecture). */
export const totalAValider = (pieces = [], elements = []) =>
  (pieces ?? []).reduce((n, p) => n + resumePieceRelecture(p, elements).aValider, 0)

/** Éléments d'une pièce rangés par calque, dans l'ordre des calques ; un calque inconnu en dernier. */
export function elementsParCalque(elements = []) {
  const groupes = new Map()
  for (const e of elements ?? []) {
    if (!groupes.has(e.calque)) groupes.set(e.calque, [])
    groupes.get(e.calque).push(e)
  }
  const rangCalque = (code) => {
    const i = CALQUES.findIndex((c) => c.code === code)
    return i < 0 ? CALQUES.length : i
  }
  // Propositions d'abord dans chaque calque : ce sont elles qu'on relit
  const ordre = (a, b) => (Number(b.a_valider) - Number(a.a_valider)) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  return [...groupes.entries()]
    .sort(([a], [b]) => rangCalque(a) - rangCalque(b))
    .map(([code, liste]) => ({ code, libelle: calqueEdl(code)?.libelle ?? code ?? 'Sans calque', elements: [...liste].sort(ordre) }))
}

// ─── Menu du type : calque et type d'un seul choix ───────────────────────────
//
// Un seul menu, groupé par calque (le calque de l'élément en tête) : choisir
// un type fixe aussi son calque. Chaque calque propose aussi « autre », pour
// un élément de ce calque qui n'a pas de type de la liste.

const SEPARATEUR = '|'
export const valeurType = (calque, type) => `${calque ?? ''}${SEPARATEUR}${type ?? ''}`

/** Valeur du menu → `{ calque, type }` ; le calque d'un type connu prime. */
export function lireValeurType(valeur) {
  const [calque, type] = String(valeur ?? '').split(SEPARATEUR)
  const connu = typeEdl(type || null)
  if (connu) return { calque: connu.calque, type: connu.code }
  return { calque: calque || null, type: null }
}

export function optionsType(calqueCourant = null) {
  const calques = [...CALQUES_DE_POINT]
  // Un élément d'un calque sans types (finitions…) garde son calque proposé
  const courant = calqueEdl(calqueCourant)
  if (courant && !calques.some((c) => c.code === courant.code)) calques.push(courant)
  calques.sort((a, b) => Number(b.code === calqueCourant) - Number(a.code === calqueCourant))
  return calques.map((c) => ({
    code: c.code,
    libelle: c.libelle,
    options: [
      ...c.types.map((t) => ({ valeur: valeurType(c.code, t.code), libelle: t.libelle })),
      { valeur: valeurType(c.code, null), libelle: `Autre (${c.libelle.toLowerCase()})` },
    ],
  }))
}

/**
 * Points proposés pour rattacher un élément : ceux de la pièce, par numéro,
 * plus le point actuel s'il est ailleurs (Claude peut rattacher un point
 * posé juste à côté) — sans lui, ouvrir la fiche le détacherait.
 */
export function pointsProposes(points = [], pieceId, pointCourantId = null) {
  const liste = (points ?? []).filter((p) => p.piece_id === pieceId || p.id === pointCourantId)
  return [...liste].sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
}

const texte = (v) => (typeof v === 'string' ? v.trim() : '')

/** Ce qui manque pour enregistrer un élément saisi, ou null. */
export function erreurSaisieElement(saisie) {
  const { calque, type } = lireValeurType(saisie?.typeValeur)
  if (!calque) return 'Choisissez le type de l’élément.'
  if (!type && !texte(saisie?.libelle)) return 'Donnez un libellé à un élément sans type.'
  return null
}

/**
 * Saisie de la fiche d'un élément → colonnes. Jamais de calque vide (la
 * colonne est NOT NULL) : sans choix, le calque n'est pas envoyé.
 */
export function champsElementSaisis(saisie) {
  const { calque, type } = lireValeurType(saisie?.typeValeur)
  const champs = {
    type,
    libelle: texte(saisie?.libelle),
    cotes: texte(saisie?.cotes) || null,
    point_id: saisie?.pointId || null,
  }
  if (calque) champs.calque = calque
  return champs
}

/** Saisie de départ pour modifier un élément (ou en ajouter un : `element` nul). */
export const saisieElement = (element = null) => ({
  typeValeur: element?.calque ? valeurType(element.calque, element.type) : '',
  libelle: element?.libelle ?? '',
  cotes: element?.cotes ?? '',
  pointId: element?.point_id ?? '',
})

/** Libellé d'un élément pour la liste : libellé dit, sinon le type. */
export function titreElement(e) {
  return texte(e?.libelle) || typeEdl(e?.type)?.libelle || calqueEdl(e?.calque)?.libelle || 'Élément'
}

// ─── Fiche de la pièce ───────────────────────────────────────────────────────

/** Brouillon de la fiche : toutes les rubriques, en texte. */
export const brouillonFiche = (fiche) =>
  Object.fromEntries(RUBRIQUES_FICHE.map((r) => [r, fiche?.[r] == null ? '' : String(fiche[r])]))

/** Fiche à enregistrer : rubriques nettoyées, les autres clés gardées telles quelles. */
export function ficheDepuisBrouillon(fiche, brouillon) {
  const base = fiche && typeof fiche === 'object' ? { ...fiche } : {}
  for (const r of RUBRIQUES_FICHE) base[r] = texte(brouillon?.[r])
  return base
}

export function ficheModifiee(fiche, brouillon) {
  return RUBRIQUES_FICHE.some((r) => texte(fiche?.[r] == null ? '' : String(fiche[r])) !== texte(brouillon?.[r]))
}

/** Rubriques signalées manquantes à l'écran (seulement une fois la pièce analysée). */
export function rubriquesManquantes(piece, brouillon) {
  if (!piece?.analyse_le) return []
  return completudeFiche(brouillon, { hspLue: piece.hsp_lue }).manquantes
}

// ─── « Relancer l'analyse » / « Réessayer » ──────────────────────────────────

const MESSAGES_LANCEMENT = {
  rien: 'L’analyse n’est pas partie : un passage dans la pièce n’est pas terminé, ou du son ou des gestes attendent encore d’être envoyés depuis la tablette.',
  'hors-ligne': 'Pas de réseau : l’analyse partira plus tard.',
  reseau: 'Le réseau a manqué pendant l’analyse. Réessayez dans un moment.',
  session: 'La session a expiré : reconnectez-vous pour lancer l’analyse.',
  'agence-seule': 'L’analyse est réservée aux comptes de l’agence.',
  'analyse-non-configuree': 'L’analyse n’est pas configurée sur le serveur (clé de Claude).',
  'supabase-non-configure': 'Le serveur n’est pas relié à la base.',
  indisponible: 'L’analyse demande la migration 082 dans Supabase.',
  refus: 'Lecture seule : rien n’a été modifié.',
  lecture: 'La pièce n’a pas pu être relue avant l’analyse. Réessayez.',
  appareil: 'Les données de cet appareil sont illisibles : l’analyse n’est pas partie.',
  // Raisons précises rendues par analyserPiece (analyseEdlPasse.js)
  son: 'L’analyse attend le son de la visite : il est encore sur la tablette ou pas encore transcrit.',
  passage: 'L’analyse attend la fin du passage dans la pièce (sortie, ou fin de la visite).',
  gestes: 'L’analyse attend les gestes de la visite encore sur la tablette (points, photos, sorties).',
  'echec-definitif': 'L’analyse de cette pièce a échoué plusieurs fois : elle ne repart que sur « Réessayer ».',
  'deja-fait': 'Cette pièce vient d’être analysée : rien de nouveau à analyser.',
  'non-visitee': 'Cette pièce n’a pas été visitée : rien à analyser.',
  'attente-echec': 'L’analyse a échoué il y a peu : elle repartira d’elle-même dans un moment.',
  'fiche-modifiee': 'La fiche a changé pendant la préparation de l’analyse : relancez-la pour qu’elle en tienne compte.',
  conflit: 'La pièce a changé pendant l’analyse (au bureau ou sur un autre appareil) : rien n’a été enregistré. Relancez l’analyse.',
  'conflit-elements': 'La pièce a changé pendant l’analyse : les éléments proposés sont enregistrés, mais pas la fiche. Relancez l’analyse pour la compléter.',
}

/**
 * Message à montrer après une analyse demandée (`analyserPiece`), ou null
 * quand elle a abouti. Un échec de Claude, lui, est noté sur la pièce (motif
 * en rouge) et relu avec elle.
 */
export function messageLancement(r) {
  if (!r || r.analysees > 0 || r.echecs > 0) return null
  if (!r.raison) return null
  return MESSAGES_LANCEMENT[r.raison] ?? `L’analyse n’est pas partie (${r.raison}).`
}
