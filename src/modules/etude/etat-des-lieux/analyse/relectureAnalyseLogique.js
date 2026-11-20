// ─── Relecture au bureau des pièces analysées : ce qui se calcule sans écran ─
//
// Compte « à valider » d'une pièce, ordre de la liste, éléments rangés par
// calque, menus de la fiche d'un élément (type, point), saisie mise en
// colonnes et message d'une analyse demandée qui n'est pas partie. Pur,
// testé (tests/etat-des-lieux-relecture-analyse.test.js).

import { CALQUES, CALQUES_DE_POINT, calqueEdl, typeEdl } from '../calquesEdl.js'
import { completudeFiche, RUBRIQUES_FICHE } from './analyseEdlLogique.js'
import { CHAMPS_PORTE, RUBRIQUES_STATUT, codeStatut, porteDe } from '../statutsEdl.js'
import { valeurCote, texteValeur, avecTypeEffectif, estInterrupteur, estLuminaire, liaisonExiste } from '../tracesEdl.js'
import { tracesDeLaPiece } from '../visite/tracesVisiteLogique.js'

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
 * @param traces liaisons et cotes de l'affaire (084) : une proposition de
 *   Claude (liaison, valeur de cote) compte comme un élément à valider
 */
export function resumePieceRelecture(piece, elements = [], traces = []) {
  const siens = (elements ?? []).filter((e) => e.piece_id === piece?.id)
  const elementsAValider = siens.filter((e) => e.a_valider).length
  const tracesAValider = (traces ?? []).filter((t) => t.piece_id === piece?.id && t.a_valider).length
  const ficheAValider = piece?.fiche_a_valider === true
  const analysee = !!piece?.analyse_le
  const { complete, manquantes } = completudeFiche(piece?.fiche, { hspLue: piece?.hsp_lue })
  const erreur = piece?.analyse_erreur || null
  const aValider = elementsAValider + tracesAValider + (ficheAValider ? 1 : 0)
  // À valider d'abord, puis ce qui reste à compléter (fiche incomplète ou
  // analyse en échec), puis le reste ; une pièce jamais analysée n'a encore
  // rien d'incomplet
  const incomplete = !!erreur || (analysee && !complete)
  const rang = aValider > 0 ? 0 : incomplete ? 1 : 2
  return { elements: siens.length, elementsAValider, tracesAValider, ficheAValider, aValider, analysee, erreur, complete, manquantes, rang }
}

/**
 * Pièces d'un étage dans l'ordre de la relecture ; l'ordre du plan départage
 * (tri stable). `visitees` : les pièces jamais visitées passent en fin.
 */
export function piecesARelire(pieces = [], elements = [], visitees = null, traces = []) {
  return (pieces ?? [])
    .map((piece, i) => {
      const resume = resumePieceRelecture(piece, elements, traces)
      const visitee = !visitees || visitees.has(piece.id) || resume.elements > 0 || resume.analysee
      return { piece, resume, visitee, i }
    })
    .sort((a, b) => (Number(!a.visitee) - Number(!b.visitee)) || (a.resume.rang - b.resume.rang) || (a.i - b.i))
    .map(({ piece, resume, visitee }) => ({ piece, resume, visitee }))
}

/** Total « à valider » de l'affaire (badge de l'onglet Relecture). */
export const totalAValider = (pieces = [], elements = [], traces = []) =>
  (pieces ?? []).reduce((n, p) => n + resumePieceRelecture(p, elements, traces).aValider, 0)

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

// ─── Points de la pièce : un point sans élément n'a plus rien à dire ─────────
//
// Demande de l'agence (2026-11-20) : écarter le dernier élément d'un point
// retire aussi le point du plan (sa pastille), ses photos et ses liaisons
// (parties par cascade, 079 et 084). Un point qui garde un autre élément
// reste ; un point déjà sans élément se supprime à la main.

// « sa photo », « ses 2 photos »
const sesN = (n, un, plusieurs) => (n === 1 ? un : `ses ${n} ${plusieurs}`)

/**
 * Ce que la suppression d'un point emporte : ses photos et ses liaisons, et
 * la phrase de la confirmation (« Le point P3 disparaîtra du plan, avec ses
 * 2 photos et sa liaison. »).
 */
export function suppressionPoint(point, { photos = [], traces = [] } = {}) {
  const nbPhotos = (photos ?? []).filter((ph) => ph?.point_id === point.id).length
  const nbLiaisons = (traces ?? []).filter((t) => t?.sorte === 'commande' && (t.point_a === point.id || t.point_b === point.id)).length
  const avec = [
    nbPhotos ? sesN(nbPhotos, 'sa photo', 'photos') : null,
    nbLiaisons ? sesN(nbLiaisons, 'sa liaison', 'liaisons') : null,
  ].filter(Boolean)
  const texte = `Le point P${point.numero ?? '?'} disparaîtra du plan${avec.length ? `, avec ${avec.join(' et ')}` : ''}.`
  return { pointId: point.id, numero: point.numero ?? null, photos: nbPhotos, liaisons: nbLiaisons, texte }
}

/**
 * Écarter cet élément emporte-t-il son point ? Oui s'il n'en reste aucun
 * autre sur ce point (`elements` : ceux de l'affaire, propositions
 * comprises — un élément d'une autre pièce peut désigner le point). Rend
 * `suppressionPoint`, ou null : seul l'élément part.
 */
export function suiteEcartElement(element, { elements = [], points = [], photos = [], traces = [] } = {}) {
  if (!element?.point_id) return null
  if ((elements ?? []).some((e) => e?.id !== element.id && e?.point_id === element.point_id)) return null
  const point = (points ?? []).find((p) => p?.id === element.point_id)
  return point ? suppressionPoint(point, { photos, traces }) : null
}

/** Points de la pièce qu'aucun élément ne désigne, par numéro. */
export function pointsSansElement(points = [], elements = [], pieceId) {
  const designes = new Set((elements ?? []).map((e) => e?.point_id).filter(Boolean))
  return (points ?? []).filter((p) => p?.id && p.piece_id === pieceId && !designes.has(p.id))
    .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
}

// ─── Liaisons et cotes de la pièce (migration 084) ───────────────────────────

/**
 * Traces montrées avec la pièce : les siennes et les liaisons dont un bout y
 * est posé ; propositions d'abord, puis liaisons avant cotes, dans l'ordre
 * de création.
 */
export function tracesRelecture(traces = [], pieceId, points = []) {
  const ordre = (a, b) => (Number(b.a_valider) - Number(a.a_valider))
    || (Number(a.sorte === 'cote') - Number(b.sorte === 'cote'))
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  return [...tracesDeLaPiece(traces, pieceId, points)].sort(ordre)
}

/**
 * Ce que propose « Ajouter une liaison » d'une pièce : les interrupteurs de
 * l'étage (ceux de la pièce d'abord, un interrupteur du couloir peut
 * commander la pièce) et les luminaires de la pièce, d'après leur type
 * effectif (`avecTypeEffectif` : type du geste, sinon de l'élément relevé).
 * Libellé « P3 · Interrupteur à l'entrée de la pièce » : le libellé de
 * l'élément du point s'il y en a un, sinon le type.
 *
 * @param points points de l'étage ; elements : ceux de l'affaire
 * @returns { interrupteurs: [{ id, libelle }], luminaires: [{ id, libelle }] }
 */
export function choixLiaisonRelecture({ points = [], elements = [], pieceId }) {
  const effectifs = avecTypeEffectif(points, elements).filter((p) => p?.id)
  const libelleDuPoint = (p) => libellePointRelecture(p, elements)
  const parNumero = (a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0)
  const interrupteurs = effectifs.filter(estInterrupteur)
    .sort((a, b) => Number(b.piece_id === pieceId) - Number(a.piece_id === pieceId) || parNumero(a, b))
  const luminaires = effectifs.filter((p) => estLuminaire(p) && p.piece_id === pieceId).sort(parNumero)
  const option = (p) => ({ id: p.id, libelle: libelleDuPoint(p) })
  return { interrupteurs: interrupteurs.map(option), luminaires: luminaires.map(option) }
}

/**
 * « P3 · Interrupteur à l'entrée de la pièce » : le libellé de l'élément du
 * point (validé d'abord), sinon son type (effectif), sinon « sans type ».
 */
export function libellePointRelecture(point, elements = []) {
  const siens = (elements ?? []).filter((e) => e?.point_id === point.id && texte(e.libelle))
  const element = siens.find((e) => !e.a_valider) ?? siens[0]
  const type = point.type ?? avecTypeEffectif([point], elements)[0]?.type
  return `P${point.numero ?? '?'} · ${element ? texte(element.libelle) : typeEdl(type)?.libelle ?? type ?? 'sans type'}`
}

/** Ce qui empêche de relier ces deux points à la relecture, ou null. */
export function erreurLiaisonRelecture(interrupteurId, luminaireId, traces = []) {
  if (!interrupteurId || !luminaireId) return 'Choisissez l’interrupteur et le luminaire à relier.'
  if (liaisonExiste(traces, interrupteurId, luminaireId)) return 'Ces deux points sont déjà reliés.'
  return null
}

/** Valeur de cote saisie → « 3,45 m », ou le motif du refus. */
export function lireSaisieCote(saisie) {
  const valeur = texteValeur(valeurCote(saisie))
  return valeur ? { valeur } : { erreur: 'Valeur illisible : tapez par exemple 3,45 (en mètres) ou 345 cm.' }
}

/** Ce qui se dit d'une trace à la relecture : proposée, validée, posée à la main, à préciser. */
export function etatTrace(t) {
  if (t?.a_valider) return t.sorte === 'cote' ? 'valeur proposée' : 'proposée'
  if (t?.sorte === 'cote') {
    if (!String(t.valeur ?? '').trim()) return 'valeur à préciser'
    // L'extrait reste d'une valeur lue par Claude puis validée
    if (t.extrait) return 'valeur validée'
  }
  return t?.origine === 'ia' ? 'validée' : 'posée à la main'
}

// ─── Fiche de la pièce ───────────────────────────────────────────────────────

/**
 * Brouillon de la fiche : toutes les rubriques en texte, le bloc porte
 * (`porte`, trois parties) et les statuts (`statuts`, code ou "" pour
 * « À préciser »). Une ancienne fiche sans porte ni statuts se lit vide.
 */
export function brouillonFiche(fiche) {
  const statuts = fiche?.statuts && typeof fiche.statuts === 'object' ? fiche.statuts : {}
  return {
    ...Object.fromEntries(RUBRIQUES_FICHE.map((r) => [r, fiche?.[r] == null ? '' : String(fiche[r])])),
    porte: porteDe(fiche),
    statuts: Object.fromEntries(RUBRIQUES_STATUT.map((r) => [r, codeStatut(statuts[r]) ?? ''])),
  }
}

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * Fiche à enregistrer : rubriques nettoyées, statut « À préciser » → null ;
 * les autres clés (de la fiche, de sa porte, de ses statuts) gardées telles
 * quelles.
 */
export function ficheDepuisBrouillon(fiche, brouillon) {
  const base = fiche && typeof fiche === 'object' ? { ...fiche } : {}
  for (const r of RUBRIQUES_FICHE) base[r] = texte(brouillon?.[r])
  const porte = { ...objet(base.porte) }
  for (const c of CHAMPS_PORTE) porte[c] = texte(objet(brouillon?.porte)[c])
  base.porte = porte
  const statuts = { ...objet(base.statuts) }
  for (const r of RUBRIQUES_STATUT) statuts[r] = codeStatut(objet(brouillon?.statuts)[r])
  base.statuts = statuts
  return base
}

// Ce que l'écran compare : textes nettoyés, parties de la porte, statuts
const cleBrouillon = (b) => JSON.stringify([
  ...RUBRIQUES_FICHE.map((r) => texte(b?.[r])),
  ...CHAMPS_PORTE.map((c) => texte(objet(b?.porte)[c])),
  ...RUBRIQUES_STATUT.map((r) => codeStatut(objet(b?.statuts)[r])),
])

/** Une rubrique, une partie de la porte ou un statut a changé (espaces autour ignorés). */
export function ficheModifiee(fiche, brouillon) {
  return cleBrouillon(brouillonFiche(fiche)) !== cleBrouillon(brouillon)
}

/**
 * Une autre fiche arrive de la base (nouvelle analyse, enregistrement relu)
 * pendant qu'un brouillon est ouvert. Brouillon propre (identique à la fiche
 * vue jusque-là) ou déjà égal à la fiche reçue : il est remplacé. Brouillon
 * modifié : il est gardé — une saisie en cours ne se perd pas parce qu'une
 * analyse est arrivée ; l'écran le dit et propose de charger la fiche reçue.
 * @returns 'remplacer' | 'garder'
 */
export function suiteFicheRecue({ precedente, brouillon, recue }) {
  if (!ficheModifiee(precedente, brouillon)) return 'remplacer'
  if (!ficheModifiee(recue, brouillon)) return 'remplacer'
  return 'garder'
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
  'fiche-modifiee': 'La pièce a changé pendant la préparation de l’analyse : relancez-la pour qu’elle en tienne compte.',
  conflit: 'La pièce a changé pendant l’analyse (au bureau ou sur un autre appareil) : rien n’a été enregistré. L’analyse repartira d’elle-même dans quelques minutes.',
  'conflit-elements': 'La pièce a changé pendant l’analyse : les éléments proposés sont enregistrés, pas encore la fiche. L’analyse repartira d’elle-même dans quelques minutes.',
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

// ─── Revue d’une pièce depuis « Plans » ───────────────────────────────────────

/**
 * Vrai quand une pièce n'a encore rien à relire : ni visitée, ni analysée
 * (ou en échec), sans fiche, sans élément, sans point ni liaison ou cote.
 * Le panneau de « Plans » se réduit alors à « Pas encore visitée »
 * (la liste des pièces reste à portée) ; dès qu'il y a quelque chose, il
 * montre la même revue que l'onglet « État des lieux ».
 *
 * @param points points de l'étage ; elements, traces : ceux de l'affaire
 */
export function pieceSansRevue(piece, { visitee = false, elements = [], points = [], traces = [] } = {}) {
  if (!piece?.id) return true
  if (visitee || piece.analyse_le || piece.analyse_erreur) return false
  if (JSON.stringify(brouillonFiche(piece.fiche)) !== JSON.stringify(brouillonFiche({}))) return false
  if ((elements ?? []).some((e) => e?.piece_id === piece.id)) return false
  if ((points ?? []).some((p) => p?.piece_id === piece.id)) return false
  return tracesDeLaPiece(traces ?? [], piece.id, points ?? []).length === 0
}
