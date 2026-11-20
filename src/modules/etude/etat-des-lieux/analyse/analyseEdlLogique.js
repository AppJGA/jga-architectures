// ─── Analyse d'une pièce par Claude : ce qui se calcule sans navigateur ──────
//
// Après la visite (ou à chaque sortie de pièce), une pièce part chez Claude
// avec sa « frise » : les gestes du journal (points posés, déplacés,
// photographiés) et les phrases transcrites, intercalés par leur heure.
// Claude rend la fiche de la pièce et les éléments relevés ; la complétude
// de la fiche (verte / orange) se décide ici, pas par Claude.
//
// Fichier partagé avec la fonction serveur api/analyser-edl.js : les consignes
// et le schéma ne se décident pas dans le navigateur. Le serveur l'importe
// sous Node sans crochet de résolution — d'où les imports avec `.js`.
// Pur, testé (tests/etat-des-lieux-analyse-ia.test.js).

import { CALQUES, CALQUES_DE_POINT, calqueEdl, typeEdl } from '../calquesEdl.js'
import { CHAMPS_PORTE, CODES_STATUTS_ENREGISTRES, RUBRIQUES_STATUT, codeStatut, porteDe, rubriqueRenseignee } from '../statutsEdl.js'
import { estInterrupteur, estLuminaire, liaisonPossible, liaisonExiste, longueurCote, texteValeur, valeurCote, avecTypeEffectif } from '../tracesEdl.js'

export const MODELE_ANALYSE = 'claude-opus-5-5'

// Bornes de la demande reçue par le serveur : une pièce de deux heures, une
// phrase toutes les cinq secondes, tient sous 2 000 lignes ; la longueur
// totale garde le corps loin des 4,5 Mo des fonctions Vercel.
export const LIGNES_MAX = 2000
export const LONGUEUR_TOTALE_MAX = 300000
export const DEJA_RELEVES_MAX = 500
// Lignes « liaisons et cotes » de la pièce (migration 084) : interrupteurs
// et luminaires, liaisons existantes, cotes ; une pièce en a quelques dizaines
export const TRACES_MAX = 500
const LIGNE_MAX = 1000

// Une visite abandonnée par le bouton Retour du navigateur ne note ni sortie
// ni fin : passé ce délai sans aucun événement, la pièce est tenue pour
// quittée. Assez long pour qu'une grande pièce décrite sans un geste ne soit
// pas analysée en cours de route ; et si cela arrivait quand même, la suite
// de l'intervalle relance l'analyse (voir `aAnalyser`).
export const DELAI_ABANDON_MS = 2 * 60 * 60 * 1000

// Fuseau des heures de la frise : celui de l'agence, fixé pour que la frise
// ne dépende pas de la machine qui la calcule (tests, serveur).
export const FUSEAU_FRISE = 'Europe/Paris'

const temps = (iso) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

const ARRETS = ['pause', 'coupure']
const priorite = (e) => (e.type === 'sortie' ? 0 : 1)

// ─── Intervalles passés dans une pièce ──────────────────────────────────────

/**
 * Chaque passage dans la pièce : d'une `entree` jusqu'à la `sortie` de la
 * pièce, sinon jusqu'au premier événement qui montre qu'on n'y est plus
 * (entrée dans une pièce, événement d'une autre pièce — sauf sa sortie — ou
 * de l'étage, `fin`),
 * ou jusqu'à une pause / coupure jamais reprise, ou enfin jusqu'au dernier
 * événement de la visite (le bouton Retour ne note rien).
 *
 * `clos` : l'intervalle ne peut plus s'allonger. `motif` : 'sortie' |
 * 'fin' | 'ailleurs' (clos), 'pause' | 'ouvert' (pas clos : la visite peut
 * reprendre dans la pièce). `dernier` : heure du dernier événement de la
 * visite, pour le délai d'abandon. `arrets` : [[début, reprise], …] — pauses
 * et coupures reprises dans la pièce, pendant lesquelles rien n'a été
 * enregistré (le son du passage a là un trou normal).
 *
 * @returns [{ debut, fin, clos, motif, visiteId, dernier, arrets }] (ms), triés par début
 */
export function intervallesPiece(evenements, pieceId) {
  const parVisite = new Map()
  ;(evenements ?? []).forEach((e, rang) => {
    const t = temps(e?.le)
    if (t == null) return
    const liste = parVisite.get(e.visite_id) ?? []
    liste.push({ e, t, rang })
    parVisite.set(e.visite_id, liste)
  })

  const intervalles = []
  for (const [visiteId, liste] of parVisite) {
    // Passer d'une pièce à l'autre note « sortie A » puis « entrée B » à la
    // même milliseconde, et le journal relu de la base n'a pas d'ordre sûr à
    // heure égale : la sortie passe toujours avant l'entrée, puis l'ordre reçu
    liste.sort((a, b) => a.t - b.t || priorite(a.e) - priorite(b.e) || a.rang - b.rang)
    const dernier = liste[liste.length - 1].t
    for (let i = 0; i < liste.length; i++) {
      const { e, t } = liste[i]
      if (e.type !== 'entree' || e.piece_id !== pieceId) continue
      let fin = null
      let motif = 'ouvert'
      let arret = null
      const arrets = []
      for (let j = i + 1; j < liste.length && fin == null; j++) {
        const s = liste[j]
        const ev = s.e
        if (ev.type === 'sortie' && ev.piece_id === pieceId) motif = 'sortie'
        // La sortie d'une autre pièce ne dit rien de celle-ci (sortie notée
        // juste avant l'entrée, mais rangée après elle)
        else if (ev.type === 'sortie') continue
        else if (ev.type === 'fin') motif = 'fin'
        else if (ev.type === 'entree' || ev.piece_id !== pieceId) motif = 'ailleurs'
        else if (ARRETS.includes(ev.type)) { arret ??= s.t; continue }
        else if (ev.type === 'reprise') {
          if (arret != null) arrets.push([arret, s.t])
          arret = null
          continue
        }
        else continue
        // Rien n'a été enregistré pendant une pause : la pièce s'arrête à elle
        fin = arret ?? s.t
      }
      if (fin == null) {
        fin = arret ?? dernier
        if (arret != null) motif = 'pause'
      }
      intervalles.push({ debut: t, fin, clos: motif !== 'ouvert' && motif !== 'pause', motif, visiteId, dernier, arrets })
    }
  }
  return intervalles.sort((a, b) => a.debut - b.debut)
}

const fini = (iv, maintenant) => iv.clos || (maintenant != null && maintenant - iv.dernier >= DELAI_ABANDON_MS)

/**
 * La pièce attend une analyse : un passage s'y est poursuivi après la
 * dernière analyse (ou elle n'a jamais été analysée), et tous ces passages
 * sont terminés. On compare la **fin** du passage plutôt que son entrée :
 * une entrée postérieure à `analyse_le` y est forcément comprise, et un
 * passage analysé avant d'être fini (délai d'abandon, puis reprise dans la
 * pièce) est ainsi réanalysé au lieu d'être perdu.
 *
 * @param piece { id, analyse_le }
 * @param options.maintenant ms. **Tout appelant de l'application doit passer
 *   `maintenant: Date.now()`** : sans lui, pas de délai d'abandon, et une
 *   pièce d'une visite quittée par le bouton Retour (ni sortie ni fin notée)
 *   n'est jamais analysée. Facultatif seulement pour garder la fonction pure
 *   dans les tests.
 */
export function aAnalyser(piece, evenements, { maintenant = null } = {}) {
  if (!piece?.id) return false
  const analyse = temps(piece.analyse_le)
  const nouveaux = intervallesPiece(evenements, piece.id).filter((iv) => analyse == null || iv.fin > analyse)
  return nouveaux.length > 0 && nouveaux.every((iv) => fini(iv, maintenant))
}

// ─── Frise de la pièce ──────────────────────────────────────────────────────

const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_FRISE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** « 10:32:14 », heure de l'agence. */
export const heureFrise = (ms) => FORMAT_HEURE.format(new Date(ms))

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_FRISE, day: '2-digit', month: '2-digit', year: 'numeric' })

/** « 18/11/2026 », jour de l'agence. */
export const jourFrise = (ms) => FORMAT_JOUR.format(new Date(ms))

const nettoyer = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const libelleType = (code) => typeEdl(code)?.libelle ?? null

/** Segments d'un morceau transcrit, en heures absolues (ms). */
function phrasesDuMorceau(enr) {
  const debut = temps(enr?.debut)
  if (debut == null) return []
  let segments = Array.isArray(enr.segments) ? enr.segments : []
  // Sans horodatage, tout le texte couvre le morceau entier
  if (!segments.length && nettoyer(enr.texte, 1)) {
    segments = [{ debut_s: 0, fin_s: Number(enr.duree_s) || 0, texte: enr.texte }]
  }
  return segments
    .map((s) => {
      const a = debut + (Number(s?.debut_s) || 0) * 1000
      const b = debut + Math.max(Number(s?.fin_s) || 0, Number(s?.debut_s) || 0) * 1000
      return { a, b, texte: nettoyer(s?.texte, LIGNE_MAX) }
    })
    .filter((p) => p.texte)
}

/**
 * Lignes `[hh:mm:ss] …` de la pièce, triées par heure : ses entrées et
 * sorties, les gestes de son journal, et les phrases dont le milieu tombe
 * dans un de ses passages (une phrase à cheval sur une sortie va à la pièce
 * où elle a surtout été dite). Les points sont désignés `P<numero>` ;
 * `references` rend chaque désignation à l'identifiant du point, pour les
 * seuls points encore dans la pièce (un point supprimé ne se rattache plus).
 * Les éléments déjà validés sont listés à part (`dejaReleves`) pour que
 * Claude ne les propose pas une seconde fois. Une ligne « — visite du
 * JJ/MM/AAAA — » ouvre la frise et chaque changement de visite ou de jour :
 * sans elle, une heure qui recule (pièce revue un autre jour) ferait croire
 * à Claude qu'une phrase suit de près un geste d'une autre visite.
 *
 * Liaisons et cotes (migration 084) : `traces` = les traces de l'affaire,
 * ou null quand elles n'ont pas été lues (base sans la 084, lecture ratée).
 * Lues, les cotes de la pièce sont désignées `C<n>` (`cotes` : 'C2' → la
 * trace), la frise nomme les touchers et les traces posées, et
 * `lignesTraces` décrit interrupteurs, luminaires, liaisons existantes et
 * cotes ; `contexteTraces` sert à relire la réponse (`lireAnalyse`). Non
 * lues : `lignesTraces` et `contexteTraces` valent null, et la demande est
 * celle d'avant la 084.
 *
 * @returns { lignes: string[], references: Map<string, string>, dejaReleves: string[], lignesTraces: string[] | null, contexteTraces: object | null }
 */
export function friseDePiece({ piece, intervalles, evenements = [], points = [], enregistrements = [], elementsValides = [], traces = null }) {
  const pieceId = piece?.id
  const duPoint = new Map()
  const references = new Map()
  for (const p of points ?? []) {
    if (!p?.id) continue
    duPoint.set(p.id, p)
    if (p.piece_id === pieceId && p.numero != null) references.set(`P${p.numero}`, p.id)
  }
  // Un point supprimé n'est plus dans `points` : son numéro se lit au journal
  const numeros = new Map()
  for (const e of evenements ?? []) {
    if (e?.point_id && e.detail?.numero != null && !numeros.has(e.point_id)) numeros.set(e.point_id, e.detail.numero)
  }
  const nom = (pointId) => {
    const n = duPoint.get(pointId)?.numero ?? numeros.get(pointId)
    return n != null ? `P${n}` : 'P?'
  }

  // Points de la pièce, supprimés compris (posés dans la pièce d'après le
  // journal) : une annulation notée depuis le plan de l'étage porte la pièce
  // du moment, pas celle du point
  const pointsDeLaPiece = new Set((points ?? []).filter((p) => p?.id && p.piece_id === pieceId).map((p) => p.id))
  for (const e of evenements ?? []) {
    if (e?.point_id && e.piece_id === pieceId && e.type === 'point') pointsDeLaPiece.add(e.point_id)
  }

  const avecTraces = Array.isArray(traces)
  const nomsTraces = nommerTraces({ traces: avecTraces ? traces : [], evenements, pieceId, avecTraces })
  // Type pour les liaisons : celui du geste, sinon celui d'un élément validé
  // du point (un point posé sans type, dit « interrupteur » à voix haute)
  const effectifs = new Map(avecTypeEffectif((points ?? []).filter((p) => p?.id), elementsValides).map((p) => [p.id, p]))

  const entrees = []
  for (const e of evenements ?? []) {
    const sienne = e?.piece_id === pieceId
    if (!sienne && !(e?.point_id && pointsDeLaPiece.has(e.point_id))) continue
    // Entrées et sorties d'une autre pièce ne la concernent pas
    if (!sienne && (e.type === 'entree' || e.type === 'sortie')) continue
    const t = temps(e.le)
    if (t == null) continue
    const texte = texteGeste(e, nom, duPoint, nomsTraces, effectifs)
    if (texte) entrees.push({ t, ordre: 0, texte, visite: e.visite_id ?? null })
  }

  const passages = intervalles ?? []
  for (const enr of enregistrements ?? []) {
    for (const p of phrasesDuMorceau(enr)) {
      const milieu = (p.a + p.b) / 2
      const dedans = passages.some((iv) => (!iv.visiteId || !enr.visite_id || iv.visiteId === enr.visite_id)
        && milieu >= iv.debut && milieu < iv.fin)
      if (dedans) entrees.push({ t: p.a, ordre: 1, texte: `« ${p.texte} »`, visite: enr.visite_id ?? null })
    }
  }

  // À la même seconde, le geste avant la phrase : on touche, puis on parle
  entrees.sort((a, b) => a.t - b.t || a.ordre - b.ordre)
  const lignes = []
  let avant = null
  for (const x of entrees) {
    const jour = jourFrise(x.t)
    if (!avant || avant.jour !== jour || (x.visite && avant.visite && x.visite !== avant.visite)) {
      lignes.push(`— visite du ${jour} —`)
    }
    avant = { jour, visite: x.visite ?? avant?.visite ?? null }
    lignes.push(`[${heureFrise(x.t)}] ${x.texte}`)
  }

  const dejaReleves = (elementsValides ?? []).map((el) => {
    const quoi = libelleType(el.type) ?? calqueEdl(el.calque)?.libelle ?? 'Élément'
    const ou = el.point_id ? `${nom(el.point_id)} · ` : ''
    const libelle = nettoyer(el.libelle, 200)
    const cotes = nettoyer(el.cotes, 200)
    return `déjà relevé : ${ou}${quoi}${libelle ? ` — ${libelle}` : ''}${cotes ? ` (cotes : ${cotes})` : ''}`
  })

  if (!avecTraces) return { lignes, references, dejaReleves, lignesTraces: null, contexteTraces: null }
  const { lignesTraces, contexteTraces } = descriptionTraces({ traces, pieceId, effectifs, pointsDeLaPiece, nom, nomsTraces })
  return { lignes, references, dejaReleves, lignesTraces, contexteTraces }
}

// ─── Liaisons et cotes dans la frise (migration 084) ────────────────────────

const parCreation = (a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id))

/**
 * Noms des traces pour la frise : `C<n>` pour les cotes de la pièce (ordre
 * de création), et ce que le journal dit des traces disparues depuis (une
 * liaison supprimée se nomme encore par ses deux points).
 */
function nommerTraces({ traces, evenements, pieceId, avecTraces }) {
  const cotes = new Map()
  const nomCote = new Map()
  traces.filter((t) => t?.sorte === 'cote' && t.piece_id === pieceId).sort(parCreation).forEach((t, i) => {
    cotes.set(`C${i + 1}`, t)
    nomCote.set(t.id, `C${i + 1}`)
  })
  const connues = new Map(traces.filter((t) => t?.id).map((t) => [t.id, t]))
  for (const e of evenements ?? []) {
    const d = e?.detail ?? {}
    if (e?.type === 'trace' && d.traceId && d.sorte && !connues.has(d.traceId)) connues.set(d.traceId, { id: d.traceId, ...d })
  }
  return { cotes, nomCote, connues, avecTraces }
}

function objetTrace(traceId, nom, noms, sorteDuGeste = null) {
  const t = noms.connues.get(traceId)
  const sorte = t?.sorte ?? sorteDuGeste
  if (sorte === 'commande') return t?.point_a && t?.point_b ? `liaison ${nom(t.point_a)} → ${nom(t.point_b)}` : 'liaison'
  if (sorte === 'cote') {
    const c = noms.nomCote.get(traceId)
    if (c) return `cote ${c}`
    return noms.avecTraces ? 'cote (retirée depuis)' : 'cote'
  }
  return 'liaison ou cote'
}

function texteTrace(e, nom, noms) {
  const d = e.detail ?? {}
  const objet = objetTrace(d.traceId, nom, noms, d.sorte)
  if (e.type === 'trace-supprimee') return d.annulation ? `${objet} retirée (annulation de la pose)` : `${objet} supprimée`
  if (d.annulation) return `${objet} : dernier geste annulé`
  if (d.modification) {
    if (!('valeur' in d.modification)) return `${objet} modifiée`
    const v = nettoyer(d.modification.valeur, 50)
    return v ? `${objet} : valeur tapée ${v}` : `${objet} : valeur effacée`
  }
  if (d.sorte === 'commande') return `${objet} posée à la main`
  const v = nettoyer(d.valeur, 50)
  return `${objet} posée entre deux angles${v ? ` (valeur tapée ${v})` : ''}`
}

/**
 * Ce que Claude reçoit des traces de la pièce, et ce qui sert à relire sa
 * réponse. Une liaison existante est une liaison d'un point de la pièce qui
 * restera après l'analyse : les propositions pas encore relues de cette
 * pièce sont remplacées (edl_ecrire_analyse), elles ne comptent pas. Une
 * cote « a une valeur » si cette valeur a été tapée ou validée ; une valeur
 * seulement proposée sera remplacée, la cote est donc « sans valeur ».
 */
function descriptionTraces({ traces, pieceId, effectifs, pointsDeLaPiece, nom, nomsTraces }) {
  const numerotes = [...effectifs.values()]
    .filter((p) => p.piece_id === pieceId && p.numero != null)
    .sort((a, b) => a.numero - b.numero)
  const appareils = numerotes.filter((p) => estInterrupteur(p) || estLuminaire(p))
  // Un point sans type peut devenir interrupteur ou luminaire par les
  // éléments de cette même réponse (`lireTraces`) : Claude doit le savoir
  const sansType = numerotes.filter((p) => !p.type)
  const existantes = traces.filter((t) => t?.sorte === 'commande'
    && (t.piece_id === pieceId || pointsDeLaPiece.has(t.point_a) || pointsDeLaPiece.has(t.point_b))
    && !(t.a_valider && t.piece_id === pieceId))
  const cotes = [...nomsTraces.cotes.entries()]
  const valeurDonnee = (t) => Boolean(nettoyer(t.valeur, 50)) && !t.a_valider

  const lignesTraces = [
    appareils.length
      ? `Interrupteurs et luminaires posés dans la pièce : ${appareils.map((p) => `P${p.numero} (${libelleType(p.type)})`).join(', ')}.`
      : 'Aucun interrupteur ni luminaire posé dans la pièce.',
    ...(sansType.length ? [`Points sans type : ${sansType.map((p) => `P${p.numero}`).join(', ')}.`] : []),
    ...(existantes.length
      ? [`Liaisons existantes (${existantes.length}) :`, ...existantes.map((t) => `- ${nom(t.point_a)} → ${nom(t.point_b)}${t.a_valider ? ' (proposée, pas encore relue)' : ''}`)]
      : ['Aucune liaison existante.']),
    ...(cotes.length
      ? [`Cotes posées dans la pièce (${cotes.length}) :`, ...cotes.map(([c, t]) => {
          const dessinee = texteValeur(longueurCote(t))
          const etat = valeurDonnee(t) ? `valeur déjà donnée : ${nettoyer(t.valeur, 50)}` : 'sans valeur'
          return `- ${c} : ${etat}${dessinee ? ` (longueur dessinée ≈ ${dessinee})` : ''}`
        })]
      : ['Aucune cote posée dans la pièce.']),
  ]
  const cotesSansValeur = new Map(cotes.filter(([, t]) => !valeurDonnee(t)).map(([c, t]) => [c, t.id]))
  return { lignesTraces, contexteTraces: { points: effectifs, existantes, cotesSansValeur } }
}

function texteGeste(e, nom, duPoint, nomsTraces, effectifs) {
  const p = nom(e.point_id)
  const d = e.detail ?? {}
  switch (e.type) {
    case 'entree':
      return 'entrée dans la pièce'
    case 'sortie':
      return 'sortie de la pièce'
    case 'point': {
      if (d.annulation) return `point ${p} rétabli (annulation d'une suppression)`
      const type = libelleType(duPoint.get(e.point_id)?.type)
      return `point ${p} posé${type ? ` (type choisi : ${type})` : ''}`
    }
    case 'point-modifie':
      if (d.annulation) return `point ${p} : dernière modification annulée`
      if ('type' in d) {
        const type = libelleType(d.type)
        return type ? `point ${p} : type choisi ${type}` : `point ${p} : type retiré`
      }
      if ('x' in d || 'y' in d) return `point ${p} déplacé`
      return `point ${p} modifié`
    case 'point-supprime':
      return d.annulation ? `point ${p} retiré (annulation de la pose)` : `point ${p} supprimé`
    case 'photo':
      return `photo du point ${p}`
    case 'point-touche': {
      const type = libelleType(d.type ?? effectifs.get(e.point_id)?.type)
      return `point ${p}${type ? ` (${type})` : ''} touché`
    }
    case 'angle-touche': {
      if (!d.traceId) return 'angle touché'
      const c = nomsTraces.nomCote.get(d.traceId)
      if (c) return `angle touché (cote ${c})`
      return nomsTraces.avecTraces ? 'angle touché (cote abandonnée ou retirée depuis)' : 'angle touché'
    }
    case 'trace':
    case 'trace-supprimee':
      return texteTrace(e, nom, nomsTraces)
    default:
      return null
  }
}

// ─── Demande à Claude ───────────────────────────────────────────────────────

const CODES_CALQUES = CALQUES_DE_POINT.map((c) => c.code)
const CODES_TYPES = CALQUES_DE_POINT.flatMap((c) => c.types.map((t) => t.code))
const chaine = { type: 'string' }
const ouNul = (schema) => ({ anyOf: [schema, { type: 'null' }] })

// Rubriques en texte. S'y ajoutent le bloc porte (`porte`, trois parties) et
// les statuts des matériaux (`statuts`) : voir statutsEdl.js.
export const RUBRIQUES_FICHE = ['sol', 'murs', 'plafond', 'plinthes', 'hsp', 'remarques']
const BORNES_FICHE = { sol: 500, murs: 500, plafond: 500, plinthes: 500, hsp: 100, remarques: 2000 }
const BORNE_PORTE = 200

export const SCHEMA_ANALYSE = {
  type: 'object',
  additionalProperties: false,
  required: ['fiche', 'elements'],
  properties: {
    fiche: {
      type: 'object',
      additionalProperties: false,
      required: [...RUBRIQUES_FICHE, 'porte', 'statuts'],
      properties: {
        ...Object.fromEntries(RUBRIQUES_FICHE.map((r) => [r, chaine])),
        porte: {
          type: 'object',
          additionalProperties: false,
          required: CHAMPS_PORTE,
          properties: Object.fromEntries(CHAMPS_PORTE.map((c) => [c, chaine])),
        },
        // « À préciser » n'est pas un choix de Claude : rien de dit → null
        statuts: {
          type: 'object',
          additionalProperties: false,
          required: RUBRIQUES_STATUT,
          properties: Object.fromEntries(RUBRIQUES_STATUT.map((r) => [r, ouNul({ type: 'string', enum: CODES_STATUTS_ENREGISTRES })])),
        },
      },
    },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['point', 'calque', 'type', 'libelle', 'cotes', 'extrait', 'a_verifier'],
        properties: {
          point: ouNul(chaine),
          calque: { type: 'string', enum: CODES_CALQUES },
          type: ouNul({ type: 'string', enum: CODES_TYPES }),
          libelle: chaine,
          cotes: chaine,
          extrait: chaine,
          a_verifier: { type: 'boolean' },
        },
      },
    },
  },
}

// Avec la 084 seulement (la demande porte alors `traces`) : les liaisons
// proposées et les valeurs de cotes lues. Sans elle, le schéma d'avant.
const SCHEMA_LIAISON = {
  type: 'object',
  additionalProperties: false,
  required: ['interrupteur', 'luminaire', 'extrait'],
  properties: { interrupteur: chaine, luminaire: chaine, extrait: chaine },
}
const SCHEMA_VALEUR_COTE = {
  type: 'object',
  additionalProperties: false,
  required: ['cote', 'valeur', 'extrait'],
  properties: { cote: chaine, valeur: chaine, extrait: chaine },
}
export const SCHEMA_ANALYSE_TRACES = {
  ...SCHEMA_ANALYSE,
  required: [...SCHEMA_ANALYSE.required, 'liaisons', 'cotes'],
  properties: {
    ...SCHEMA_ANALYSE.properties,
    liaisons: { type: 'array', items: SCHEMA_LIAISON },
    cotes: { type: 'array', items: SCHEMA_VALEUR_COTE },
  },
}

const catalogue = CALQUES_DE_POINT
  .map((c) => `- ${c.code} (${c.nom}) : ${c.types.map((t) => `${t.code} = ${t.libelle}`).join(', ')}`)
  .join('\n')

export const CONSIGNES_ANALYSE = `Tu aides une agence d'architecture à faire l'état des lieux d'un bâtiment existant. Pendant la visite, l'architecte entre dans chaque pièce, parle à voix haute (ce qu'il dit est transcrit automatiquement, avec des erreurs possibles) et touche le plan pour poser des points numérotés (P1, P2…) là où se trouve ce qu'il décrit ; il peut choisir un type pour un point.

Tu reçois une pièce et sa frise : les gestes et les phrases entendues, dans l'ordre, chacun avec son heure [hh:mm:ss]. Ta tâche : rendre la fiche de la pièce et la liste des éléments relevés.

Éléments :
- Un élément par chose dite et localisée dans la pièce (un radiateur, une prise, une fenêtre, une fissure…). Deux prises dites ensemble sur deux points font deux éléments.
- « point » : rattache l'élément à un point (« P7 ») si la phrase suit de près la pose du point (quelques secondes) ou si elle le désigne ; sinon null. N'utilise que des points présents dans la frise, et jamais un point supprimé (ligne « point … supprimé » sans « rétabli » ensuite) : l'élément prend alors null.
- Les lignes « — visite du JJ/MM/AAAA — » séparent les visites et les jours : une phrase et un geste séparés par une de ces lignes ne se suivent pas, même si leurs heures sont proches.
- « calque » et « type » : choisis-les dans la liste ci-dessous. Si l'architecte a choisi un type au geste, garde-le, sauf contradiction claire avec ce qu'il dit. « type » vaut null si aucun type de la liste ne convient ; le calque reste celui de la chose décrite. Si la chose décrite ne relève d'aucun calque de la liste, n'en force pas un : dis-la dans les « remarques » de la fiche.
- « libelle » : une description courte en français, telle qu'un architecte l'écrirait (« radiateur fonte sous la fenêtre »).
- « cotes » : les dimensions telles que dites (« allège 90, largeur 120 »), sinon "".
- « extrait » : les mots entendus qui décrivent l'élément, recopiés de la frise.
- « a_verifier » : true si l'architecte hésite, se reprend, ou si la transcription est douteuse.
- Ne répète pas les éléments listés comme « déjà relevés ».

Fiche de la pièce (sol, murs, plafond, plinthes, hsp = hauteur sous plafond, remarques = état général et ce qui ne rentre pas ailleurs) : seulement d'après ce qui est dit dans la frise, en phrases courtes ; "" pour une rubrique dont rien n'est dit. Si une « fiche actuelle » est donnée (déjà relevée ou corrigée par l'agence), rends la fiche complète : garde le contenu de chaque rubrique, sauf si ce qui est dit dans la frise le remplace ou le complète clairement.

Bloc porte de la pièce (« porte ») : « huisserie », « vantail », « quincaillerie », chacun en quelques mots, le matériau ou l'état sans répéter le nom de la partie (« bois », « métallique », « béquille laiton ») ; "" pour une partie dont rien n'est dit. Un bloc porte dit « bois » : huisserie bois et vantail bois. Un bloc porte dit « métallique » : huisserie métallique, vantail bois.

Statuts (« statuts ») : un par rubrique (sol, murs, plafond, plinthes, porte), d'après ce qui est dit de son état :
- "rafraichir" : remise en état sans dépose (« à repeindre », « à reprendre », « reboucher ») ;
- "deposer" : dépose, remplacement ou suppression (« à remplacer », « à déposer », « à supprimer », « hors service ») ;
- "conserver" : gardé tel quel (« bon état », « à garder ») ;
- null si rien n'est dit sur l'état, et toujours null pour une rubrique vide.
Si la fiche actuelle donne des statuts, garde-les, sauf si la frise les contredit clairement.

Ne rien inventer : ce qui n'est pas dit n'existe pas. Réponds uniquement par le JSON demandé.

Calques et types possibles :
${catalogue}`

export const CONSIGNES_TRACES = `Liaisons et cotes (« liaisons », « cotes ») :
- L'architecte peut toucher un interrupteur puis le luminaire qu'il commande (ou l'inverse) en le disant (« cet interrupteur commande le plafonnier », « il allume les deux appliques ») : lignes « point P3 (Interrupteur) touché », « point P7 (Luminaire) touché ». Propose une liaison seulement quand ce qui est dit relie un interrupteur et un luminaire touchés ou posés à peu d'écart (quelques secondes). « interrupteur » et « luminaire » : leurs points (« P3 », « P7 »), choisis parmi les interrupteurs et luminaires listés dans « Liaisons et cotes de la pièce ». Un point listé dans « Points sans type » peut aussi être relié, à condition que tes « elements » de cette réponse lui donnent un type d'interrupteur (interrupteur) ou de luminaire (luminaire, applique, dalle, reglette) ; sinon, aucune liaison pour lui. Ne propose jamais une liaison déjà existante (listée), ni deux fois la même, ni une liaison que rien de dit n'établit.
- Une cote est posée entre deux angles de la pièce : lignes « angle touché (cote C2) ». Sa valeur est dite juste avant ou juste après ses deux angles (« trois mètres quarante-cinq », « 3,45 »). Propose une valeur seulement pour une cote listée « sans valeur », d'après ce qui est dit, en chiffres avec l'unité (« 3,45 m ») ; jamais pour une cote dont la valeur est déjà donnée, et jamais d'après la longueur dessinée, qui sert seulement à reconnaître de quelle cote on parle.
- « extrait » : les mots entendus, recopiés de la frise. Rien de tel dans la frise : listes vides.`

/** Consignes de l'analyse : celles d'avant la 084, plus les liaisons et cotes quand la demande les porte. */
export const consignesAnalyse = (avecTraces = false) => (avecTraces ? `${CONSIGNES_ANALYSE}\n\n${CONSIGNES_TRACES}` : CONSIGNES_ANALYSE)

/** Schéma de la réponse : celui d'avant la 084, ou avec liaisons et cotes. */
export const schemaAnalyse = (avecTraces = false) => (avecTraces ? SCHEMA_ANALYSE_TRACES : SCHEMA_ANALYSE)

function lignesFicheActuelle(fiche) {
  if (!fiche || typeof fiche !== 'object') return []
  const remplies = RUBRIQUES_FICHE
    .map((r) => [r, nettoyer(fiche[r], BORNES_FICHE[r])])
    .filter(([, v]) => v)
  const porte = porteDe(fiche)
  const partiesPorte = CHAMPS_PORTE.filter((c) => porte[c]).map((c) => `${c} = ${nettoyer(porte[c], BORNE_PORTE)}`)
  if (partiesPorte.length) remplies.push(['porte', partiesPorte.join(', ')])
  if (!remplies.length) return []
  // Statuts des seules rubriques renseignées (ailleurs, ils ne disent rien)
  const statuts = RUBRIQUES_STATUT
    .map((r) => [r, rubriqueRenseignee(fiche, r) ? codeStatut(fiche.statuts?.[r]) : null])
    .filter(([, s]) => s)
    .map(([r, s]) => `${r} = ${s}`)
  if (statuts.length) remplies.push(['statuts', statuts.join(', ')])
  return ['Fiche actuelle (déjà relevée ou corrigée par l’agence) :', ...remplies.map(([r, v]) => `- ${r} : ${v}`)]
}

const surface = (v) => (Number(v) > 0 ? `${String(Math.round(Number(v) * 100) / 100).replace('.', ',')} m²` : null)

/**
 * @param piece { nom, numero, surface, hsp } — surface et HSP lues sur le plan
 * @param lignes lignes de la frise ; dejaReleves : lignes « déjà relevé : … »
 * @param ficheActuelle fiche de la pièce telle qu'enregistrée (analyse
 *   précédente, peut-être corrigée par l'agence) : une réanalyse repart de
 *   tout ce qui a été dit, mais ne doit pas défaire une correction faite au
 *   bureau (conception § 6, « ce que la pièce avait déjà »)
 */
export function construireDemandeAnalyse({ piece = {}, lignes = [], dejaReleves = [], ficheActuelle = null, traces = null }) {
  const avecTraces = Array.isArray(traces)
  const designation = [nettoyer(piece.nom, 200) || 'Pièce sans nom', piece.numero ? `n° ${nettoyer(piece.numero, 50)}` : null]
    .filter(Boolean).join(', ')
  const plan = [surface(piece.surface) && `surface ${surface(piece.surface)}`, Number(piece.hsp) > 0 && `hauteur sous plafond ${String(piece.hsp).replace('.', ',')} m`]
    .filter(Boolean)
  const texte = [
    `Pièce : ${designation}${plan.length ? ` (lu sur le plan : ${plan.join(', ')})` : ''}.`,
    ...lignesFicheActuelle(ficheActuelle),
    dejaReleves.length ? `Éléments déjà relevés et validés (${dejaReleves.length}) :` : 'Aucun élément déjà relevé.',
    ...dejaReleves,
    ...(avecTraces ? ['Liaisons et cotes de la pièce :', ...traces] : []),
    `Frise de la pièce (${lignes.length} lignes) :`,
    ...(lignes.length ? lignes : ['(rien n’a été dit ni fait dans la pièce)']),
  ].join('\n')
  return {
    system: consignesAnalyse(avecTraces),
    messages: [{ role: 'user', content: [{ type: 'text', text: texte }] }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaAnalyse(avecTraces) } },
  }
}

const objetDeTextes = (o) => o != null && typeof o === 'object' && !Array.isArray(o)
  && Object.values(o).every((v) => v == null || typeof v === 'string')

// Rubriques en texte ; `porte` et `statuts` : objets de textes (ou null)
function ficheRecevable(fiche) {
  if (fiche == null) return true
  if (typeof fiche !== 'object' || Array.isArray(fiche)) return false
  return Object.entries(fiche).every(([k, v]) => v == null || typeof v === 'string'
    || ((k === 'porte' || k === 'statuts') && objetDeTextes(v)))
}

/**
 * Contrôle de la demande reçue par la fonction serveur : `null` si elle est
 * recevable, sinon le motif du refus.
 */
export function erreurDemandeAnalyse(corps) {
  const piece = corps?.piece
  if (!piece || typeof piece !== 'object' || Array.isArray(piece)) return 'piece'
  if (piece.nom != null && typeof piece.nom !== 'string') return 'piece'
  const { lignes, dejaReleves = [] } = corps
  if (!Array.isArray(lignes) || lignes.some((l) => typeof l !== 'string')) return 'lignes'
  if (lignes.length > LIGNES_MAX) return 'trop-de-lignes'
  if (!Array.isArray(dejaReleves) || dejaReleves.some((l) => typeof l !== 'string')) return 'deja-releves'
  if (dejaReleves.length > DEJA_RELEVES_MAX) return 'trop-de-releves'
  if (!ficheRecevable(corps.ficheActuelle)) return 'fiche'
  // Facultatif : absent, la demande est celle d'avant la 084
  const traces = corps.tracesPiece ?? []
  if (!Array.isArray(traces) || traces.some((l) => typeof l !== 'string')) return 'traces'
  if (traces.length > TRACES_MAX) return 'trop-de-traces'
  const longueur = [...lignes, ...dejaReleves, ...traces].reduce((n, l) => n + l.length, 0)
  if (longueur > LONGUEUR_TOTALE_MAX) return 'trop-long'
  return null
}

// ─── Lecture de la réponse ──────────────────────────────────────────────────

const CALQUES_VALIDES = new Set(CALQUES.map((c) => c.code))

/**
 * Réponse de Claude → { fiche, elements } prêts à écrire. Le schéma est
 * imposé, mais rien ne s'écrit sans contrôle : type inconnu → null, calque
 * déduit du type (un type n'appartient qu'à un calque), élément sans calque
 * valable écarté, point inconnu de la pièce → null, textes bornés.
 *
 * @param references Map('P7' → point_id) de `friseDePiece`
 * Statut inconnu (ou « a-preciser ») → null, et null pour une rubrique vide.
 * @param contexteTraces `contexteTraces` de `friseDePiece` (traces lues) ou
 *   null : `traces` vaut alors null, et rien des traces ne s'écrit.
 *
 * Liaisons : deux points de la pièce (`references`), un interrupteur et un
 * luminaire (`liaisonPossible`, sens rétabli), ni existante ni en double ;
 * sinon écartée. Le type d'un point : celui du geste, sinon d'un élément
 * validé, sinon d'un élément de cette même réponse (point posé sans type).
 * Valeurs de cotes : une cote encore sans valeur (`cotesSansValeur`), une
 * valeur lisible (`valeurCote`), réécrite « 3,45 m » ; une cote à la fois ;
 * sinon écartée.
 *
 * @returns { fiche: { sol, murs, plafond, plinthes, hsp, remarques, porte, statuts }, elements: [{ point_id, calque, type, libelle, cotes, extrait, a_verifier }], traces: { liaisons: [{ point_a, point_b, extrait }], cotes: [{ id, valeur, extrait }] } | null }
 */
export function lireAnalyse(resultat, references = new Map(), contexteTraces = null) {
  const f = resultat?.fiche ?? {}
  const fiche = Object.fromEntries(RUBRIQUES_FICHE.map((r) => [r, nettoyer(f[r], BORNES_FICHE[r])]))
  const porte = f.porte && typeof f.porte === 'object' ? f.porte : {}
  fiche.porte = Object.fromEntries(CHAMPS_PORTE.map((c) => [c, nettoyer(porte[c], BORNE_PORTE)]))
  const statuts = f.statuts && typeof f.statuts === 'object' ? f.statuts : {}
  fiche.statuts = Object.fromEntries(RUBRIQUES_STATUT.map((r) => [r, rubriqueRenseignee(fiche, r) ? codeStatut(statuts[r]) : null]))
  const elements = []
  for (const el of Array.isArray(resultat?.elements) ? resultat.elements : []) {
    if (!el || typeof el !== 'object') continue
    const type = typeEdl(typeof el.type === 'string' ? el.type : null)
    const calque = type?.calque ?? (CALQUES_VALIDES.has(el.calque) ? el.calque : null)
    if (!calque) continue
    const cle = cleReference(el.point, 'P')
    elements.push({
      point_id: (cle && references.get(cle)) ?? null,
      calque,
      type: type?.code ?? null,
      libelle: nettoyer(el.libelle, 300),
      cotes: nettoyer(el.cotes, 200),
      extrait: nettoyer(el.extrait, 1000),
      a_verifier: el.a_verifier === true,
    })
  }
  return { fiche, elements, traces: contexteTraces ? lireTraces(resultat, references, contexteTraces, elements) : null }
}

// « p7 », « P 7 », « 7 » : même point (« c2 », « 2 » : même cote)
function cleReference(v, lettre) {
  const cle = typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : null
  if (!cle) return null
  return /^\d+$/.test(cle) ? `${lettre}${cle}` : cle
}

// Type d'un point pour les liaisons : celui du geste ou d'un élément validé
// (`contexteTraces.points`), à défaut celui que les éléments de cette même
// réponse lui donnent
function lireTraces(resultat, references, { points, existantes = [], cotesSansValeur }, elementsRecus = []) {
  const typeRecu = new Map()
  for (const el of elementsRecus) if (el.point_id && el.type && !typeRecu.has(el.point_id)) typeRecu.set(el.point_id, el.type)
  const point = (id) => {
    const p = points.get(id)
    if (!p || p.type || !typeRecu.has(id)) return p
    return { ...p, type: typeRecu.get(id) }
  }
  const liaisons = []
  const dejaVues = [...existantes]
  for (const l of Array.isArray(resultat?.liaisons) ? resultat.liaisons : []) {
    if (!l || typeof l !== 'object') continue
    const idA = references.get(cleReference(l.interrupteur, 'P'))
    const idB = references.get(cleReference(l.luminaire, 'P'))
    const paire = idA && idB ? liaisonPossible(point(idA), point(idB)) : null
    if (!paire) continue
    const [a, b] = [paire.interrupteur.id, paire.luminaire.id]
    if (liaisonExiste(dejaVues, a, b)) continue
    dejaVues.push({ sorte: 'commande', point_a: a, point_b: b })
    liaisons.push({ point_a: a, point_b: b, extrait: nettoyer(l.extrait, 1000) })
  }
  const cotes = []
  const lues = new Set()
  for (const c of Array.isArray(resultat?.cotes) ? resultat.cotes : []) {
    if (!c || typeof c !== 'object') continue
    const id = cotesSansValeur?.get(cleReference(c.cote, 'C'))
    const valeur = texteValeur(valeurCote(typeof c.valeur === 'string' ? c.valeur : null))
    if (!id || !valeur || lues.has(id)) continue
    lues.add(id)
    cotes.push({ id, valeur, extrait: nettoyer(c.extrait, 1000) })
  }
  return { liaisons, cotes }
}

// ─── Complétude et état de la pièce ─────────────────────────────────────────

const OBLIGATOIRES = ['sol', 'murs', 'plafond', 'plinthes']
const rempli = (v) => v != null && String(v).trim() !== ''

/**
 * Rubriques de la fiche qui manquent. La HSP n'est demandée que si le plan
 * ne la donne pas (`hspLue` = `edl_pieces.hsp_lue`).
 */
export function completudeFiche(fiche, { hspLue = null } = {}) {
  const demandees = Number(hspLue) > 0 ? OBLIGATOIRES : [...OBLIGATOIRES, 'hsp']
  const manquantes = demandees.filter((r) => !rempli(fiche?.[r]))
  return { complete: manquantes.length === 0, manquantes }
}

/**
 * Couleur de la pièce : 'non-visitee' | 'attente' | 'complete' | 'incomplete'
 * | 'echec'. L'échec passe avant l'attente : une pièce dont l'analyse a
 * échoué reste à analyser, l'attente masquerait l'erreur.
 *
 * @param piece { fiche, hsp_lue, analyse_le, analyse_erreur }
 */
export function etatAnalysePiece(piece, { visitee = false, attente = false } = {}) {
  if (!visitee) return 'non-visitee'
  if (piece?.analyse_erreur) return 'echec'
  if (attente || !piece?.analyse_le) return 'attente'
  return completudeFiche(piece.fiche, { hspLue: piece.hsp_lue }).complete ? 'complete' : 'incomplete'
}

// ─── Quand lancer l'analyse ─────────────────────────────────────────────────
//
// Chaque analyse se paie : ces règles décident, sans navigateur, si une pièce
// part chez Claude. Le branchement (lectures, verrou, appel) est dans
// analyseEdlPasse.js / analyseEdl.js.

// Tranches d'un morceau pas encore rangé : celles du morceau en cours ou
// tout juste coupé (un morceau dure 3 minutes au plus) bloquent l'analyse.
// Plus vieilles, ce sont les restes d'une page fermée en plein
// enregistrement : elles ne se recollent qu'à la reprise de leur visite, qui
// peut ne jamais venir ; les attendre figerait la pièce dans le sablier.
export const DELAI_TRANCHE_VIVANTE_MS = 10 * 60 * 1000

// Après un échec, la pièce ne repart pas avant 10 minutes, puis 1 heure à
// chaque nouvel échec : un essai raté ne doit jamais tourner en boucle
export const ATTENTES_APRES_ECHEC_MS = [10 * 60 * 1000, 60 * 60 * 1000]

export function attenteApresEchecs(essais) {
  const rang = Math.min(Math.max(Math.trunc(Number(essais) || 1), 1), ATTENTES_APRES_ECHEC_MS.length)
  return ATTENTES_APRES_ECHEC_MS[rang - 1]
}

// Heure de début d'un morceau ou d'une tranche de l'appareil (ms) : `debut`
// du moteur, à défaut le début de l'enregistrement (plus tôt : plus prudent)
function debutAudio(x) {
  if (Number.isFinite(x?.debut)) return x.debut
  const t = Date.parse(x?.debut ?? x?.debutEnregistrement ?? '')
  return Number.isFinite(t) ? t : null
}

/**
 * Son encore sur l'appareil qui interdit d'analyser un passage : morceaux de
 * la même visite, pas encore transcrits, commencés avant la fin du passage
 * (ce qu'on y a dit manquerait à la frise, et la pièce, une fois analysée,
 * ne repartirait plus pour lui). Ne bloquent pas : un morceau mis de côté
 * après `echecsMax` refus (il n'est plus jamais retenté de lui-même), un
 * morceau sans heure (il ne se place dans aucune pièce, il n'est jamais
 * transcrit), et les tranches orphelines (voir DELAI_TRANCHE_VIVANTE_MS).
 *
 * @param intervalle { fin, visiteId } de `intervallesPiece`
 * @returns morceaux et tranches qui bloquent
 */
export function morceauxQuiBloquent(intervalle, { morceaux = [], tranches = [], maintenant = null, echecsMax = 3 } = {}) {
  const deLaVisite = (x) => x?.edlVisiteId != null && x.edlVisiteId === intervalle?.visiteId
  const avantLaFin = (x) => {
    const t = debutAudio(x)
    return t != null && t < intervalle.fin
  }
  const enAttente = (morceaux ?? []).filter((m) => deLaVisite(m) && avantLaFin(m) && (m.echecs ?? 0) < echecsMax)
  const vivantes = (tranches ?? []).filter((t) => deLaVisite(t) && avantLaFin(t)
    && (maintenant == null || maintenant - debutAudio(t) < DELAI_TRANCHE_VIVANTE_MS))
  return [...enAttente, ...vivantes]
}

/**
 * Gestes de l'appareil pas encore envoyés, notés avant la fin du passage : le
 * journal de la base ne les a pas, la frise les perdrait. `creeLe` (ms) est
 * l'heure de l'appareil, comme celle des événements qu'il note.
 */
export const gestesQuiBloquent = (intervalle, gestes = []) =>
  (gestes ?? []).filter((g) => Number.isFinite(g?.creeLe) && g.creeLe <= intervalle.fin)

const memeHeure = (a, b) => temps(a) === temps(b)

// Tolérance entre la fin du dernier morceau transcrit et la fin du passage :
// le morceau est coupé à la sortie, à quelques centaines de ms près
export const MARGE_SON_MS = 30 * 1000

// Trou toléré entre deux morceaux transcrits d'un même passage : une
// coupure d'iOS (micro rendu puis repris) laisse quelques secondes sans son
export const TROU_SON_MS = 30_000

/**
 * Le son d'un passage est-il dans la base ? Oui si les transcriptions de sa
 * visite le couvrent **sans trou**, du début à la fin (à MARGE_SON_MS près
 * à la fin) :
 * - seuls comptent les morceaux commencés avant la fin du passage : un
 *   morceau est coupé à chaque entrée et sortie, celui de la pièce suivante
 *   (transcrit) ne dit rien de celui-ci (peut-être encore refusé sur la
 *   tablette) ;
 * - deux morceaux qui se suivent peuvent laisser TROU_SON_MS sans son ;
 * - un arrêt repris dans la pièce (pause, coupure d'iOS : `arrets` de
 *   `intervallesPiece`) n'a rien enregistré : la couverture saute jusqu'à
 *   la reprise s'il commence au plus TROU_SON_MS après ce qui est couvert.
 * Un morceau de 3 minutes encore sur la tablette au milieu d'un long passage
 * laisse donc un trou, et la pièce attend.
 */
export function sonTranscritJusquA(intervalle, enregistrements = []) {
  const plages = (enregistrements ?? [])
    .filter((e) => e?.visite_id === intervalle?.visiteId && temps(e.debut) != null && temps(e.debut) < intervalle.fin)
    .map((e) => [temps(e.debut), temps(e.debut) + (Number(e.duree_s) || 0) * 1000])
    .filter(([d, f]) => Number.isFinite(d) && Number.isFinite(f) && !(f <= intervalle.debut - TROU_SON_MS))
    .sort((a, b) => a[0] - b[0])
  if (!plages.length) return false
  const arrets = [...(intervalle.arrets ?? [])].sort((a, b) => a[0] - b[0])
  let atteint = Number.isFinite(intervalle.debut) ? intervalle.debut : plages[0][0]
  // Triés : un saut peut en permettre un autre, un seul parcours suffit
  const sauterLesArrets = () => {
    for (const [a, r] of arrets) if (a <= atteint + TROU_SON_MS && r > atteint) atteint = r
  }
  for (const [d, f] of plages) {
    sauterLesArrets()
    if (d > atteint + TROU_SON_MS) return false
    atteint = Math.max(atteint, f)
  }
  sauterLesArrets()
  return atteint >= intervalle.fin - MARGE_SON_MS
}

/**
 * Tout ce qui a été dit pendant le passage est-il transcrit ?
 * - Appareil qui tient des morceaux ou des tranches de la visite (la
 *   tablette) : aucun d'eux ne doit bloquer (`morceauxQuiBloquent`).
 * - Appareil qui n'en tient aucun (le bureau) : il ne voit pas ce qui attend
 *   encore sur la tablette. Il faut que les transcriptions de la base
 *   couvrent le passage, ou que le passage soit fini depuis plus de
 *   DELAI_ABANDON_MS (le son ne viendra sans doute plus). Sans cette règle,
 *   le bureau payait une analyse sans la parole, puis `analyse_le` couvrait
 *   le passage et la transcription arrivée ensuite n'était jamais analysée.
 */
export function sonPret(intervalle, { morceaux = [], tranches = [], enregistrements = [], maintenant = null, echecsMax = 3 } = {}) {
  const deLaVisite = (x) => x?.edlVisiteId != null && x.edlVisiteId === intervalle?.visiteId
  if ((morceaux ?? []).some(deLaVisite) || (tranches ?? []).some(deLaVisite)) {
    return morceauxQuiBloquent(intervalle, { morceaux, tranches, maintenant, echecsMax }).length === 0
  }
  if (maintenant != null && maintenant - intervalle.fin > DELAI_ABANDON_MS) return true
  return sonTranscritJusquA(intervalle, enregistrements)
}

/**
 * Le suivi local d'une pièce (essai fait sur cet appareil) vaut tant que la
 * pièce n'a pas été analysée depuis : même `analyse_le` qu'avant l'essai.
 * @param suivi { essais, dernier, couvert, analyseLe, definitif }
 */
export function suiviValable(suivi, piece) {
  return Boolean(suivi) && memeHeure(suivi.analyseLe ?? null, piece?.analyse_le ?? null)
}

// Heure jusqu'où un essai couvre la pièce : jamais avant la fin des passages
// qu'il a vus (l'horloge de la tablette peut avancer sur celle du bureau)
const couverture = (maintenant, intervalles) =>
  Math.max(maintenant, ...intervalles.map((iv) => iv.fin).filter(Number.isFinite))

const couvertDe = (suivi) => (Number.isFinite(suivi?.couvert) ? suivi.couvert : suivi?.dernier)

// Écart toléré entre l'horloge du serveur (updated_at) et celle de la
// tablette (fin des passages) pour dater un échec vu dans la base
export const MARGE_HORLOGE_MS = 5 * 60 * 1000

// Fin du motif d'un échec définitif. Le suivi des essais est propre à
// l'appareil ; ce suffixe, écrit dans `analyse_erreur`, fait que tout
// appareil tient l'échec pour définitif (sinon un appareil neuf relançait
// une pièce que la tablette avait abandonnée).
export const SUFFIXE_DEFINITIF = ' — ne repartira que sur « Réessayer »'

export const echecDefinitifNote = (motif) => typeof motif === 'string' && motif.includes(SUFFIXE_DEFINITIF.trim())

// Longueur gardée du motif avant le suffixe (le tout reste sous les 500
// caractères de messageErreurAnalyse)
const MOTIF_MAX = 400

/** Motif à écrire sur la pièce : suffixé s'il est définitif, sans doublon. */
export function motifEchec(message, { definitif = false } = {}) {
  const t = String(message ?? '').trim() || 'Analyse impossible.'
  const tete = t.length > MOTIF_MAX ? `${t.slice(0, MOTIF_MAX - 1)}…` : t
  if (!definitif || echecDefinitifNote(tete)) return tete
  return `${tete.replace(/[.\s]+$/, '')}${SUFFIXE_DEFINITIF}`
}

// Essais automatiques pour une même couverture : au-delà, l'échec est
// définitif. L'attente plafonne le rythme, ce plafond le nombre : chaque
// essai se paie, et un échec qui se répète trois fois se répétera.
export const ESSAIS_AUTO_MAX = 3

const non = (raison, suivi) => (suivi ? { tenter: false, raison, suivi } : { tenter: false, raison })

/**
 * Faut-il envoyer la pièce chez Claude maintenant ?
 *
 * Dans l'ordre : il faut un passage nouveau et fini (`aAnalyser`, ou tous les
 * passages finis pour `relancer`, réanalyse demandée) ; aucun geste de ces
 * passages ne doit attendre sur l'appareil, et leur son doit être transcrit
 * (`sonPret`) ; enfin une pièce en échec ne repart que sur demande (`forcer`,
 * « Réessayer »), quand une nouvelle visite de la pièce s'est terminée après
 * l'échec, ou après l'attente (10 min, puis 1 h) tant qu'elle n'a pas échoué
 * ESSAIS_AUTO_MAX fois ou d'un échec définitif (frise trop longue, refus de
 * Claude, réponse tronquée). Un motif suffixé (SUFFIXE_DEFINITIF) dans la
 * base passe avant le suivi de l'appareil : seule une visite terminée plus
 * de MARGE_HORLOGE_MS (5 min) après max(`updated_at`, `analyse_le`) — heure
 * de l'échec vue du serveur, la marge couvrant l'horloge de la tablette — le
 * lève. Une pièce en échec dans la base sans suivi sur cet appareil (essai
 * fait ailleurs, mémoire effacée) repart sur la même règle, sinon attend ;
 * `suivi` est alors le suivi à garder.
 *
 * Raisons d'un refus : 'non-visitee', 'deja-fait', 'passage' (pas fini),
 * 'gestes', 'son', 'echec-definitif', 'attente-echec'.
 *
 * @param maintenant ms — `Date.now()` de l'appareil, obligatoire (abandon, attentes)
 * @param enregistrements transcriptions de la base (visite_id, debut, duree_s)
 * @returns { tenter, raison, suivi? }
 */
export function decisionAnalyse({
  piece, evenements, morceaux = [], tranches = [], enregistrements = [], gestes = [], suivi = null, maintenant,
  forcer = false, relancer = false, echecsMax = 3,
}) {
  if (!piece?.id) return non('non-visitee')
  const intervalles = intervallesPiece(evenements, piece.id)
  if (!intervalles.length) return non('non-visitee')
  const analyse = temps(piece.analyse_le)
  let concernes
  if (relancer) {
    concernes = intervalles
  } else {
    concernes = intervalles.filter((iv) => analyse == null || iv.fin > analyse)
    if (!concernes.length) return non('deja-fait')
  }
  if (!concernes.every((iv) => fini(iv, maintenant))) return non('passage')
  if (concernes.some((iv) => gestesQuiBloquent(iv, gestes).length)) return non('gestes')
  if (!concernes.every((iv) => sonPret(iv, { morceaux, tranches, enregistrements, maintenant, echecsMax }))) return non('son')
  if (forcer || relancer) return { tenter: true, raison: 'demande' }

  const valable = suiviValable(suivi, piece)
  if (!piece.analyse_erreur && !valable) return { tenter: true, raison: 'a-analyser' }
  // Heure de l'échec vue de la base (horloge du serveur), avec une marge
  // pour l'horloge de la tablette, qui date les passages
  const echecLe = Math.max(temps(piece.updated_at) ?? -Infinity, temps(piece.analyse_le) ?? -Infinity)
  const visiteApresEchec = Number.isFinite(echecLe) && intervalles.some((iv) => iv.fin > echecLe + MARGE_HORLOGE_MS)
  // Échec définitif noté dans la base, d'abord : il a pu être écrit par un
  // autre appareil, après un passage que le suivi de celui-ci ne couvre pas.
  // Seule une visite finie après l'échec (heure de la base) le lève ;
  // sinon chaque appareil repayait la frise que l'autre avait abandonnée.
  if (echecDefinitifNote(piece.analyse_erreur)) {
    return visiteApresEchec ? { tenter: true, raison: 'nouvelle-visite' } : non('echec-definitif')
  }
  if (!valable) {
    if (visiteApresEchec) return { tenter: true, raison: 'nouvelle-visite' }
    return non('attente-echec', {
      essais: 1, dernier: maintenant, couvert: couverture(maintenant, intervalles), analyseLe: piece.analyse_le ?? null, definitif: false,
    })
  }
  if (intervalles.some((iv) => iv.fin > couvertDe(suivi))) return { tenter: true, raison: 'nouvelle-visite' }
  if (suivi.definitif || (suivi.essais ?? 0) >= ESSAIS_AUTO_MAX) return non('echec-definitif')
  if (maintenant - suivi.dernier >= attenteApresEchecs(suivi.essais)) return { tenter: true, raison: 'relance' }
  return non('attente-echec')
}

/**
 * Suivi noté juste avant l'appel : un onglet fermé pendant l'appel compte
 * comme un échec. Les essais se comptent par couverture : une nouvelle visite
 * de la pièce terminée après le dernier essai les remet à zéro.
 */
export function suiviTentative(suivi, piece, { maintenant, intervalles = [] }) {
  const valable = suiviValable(suivi, piece)
  const memeCouverture = valable && !intervalles.some((iv) => iv.fin > couvertDe(suivi))
  return {
    essais: (memeCouverture ? (suivi.essais ?? 0) : 0) + 1,
    dernier: maintenant,
    couvert: couverture(maintenant, intervalles),
    analyseLe: piece?.analyse_le ?? null,
    definitif: false,
  }
}

/**
 * Suivi après un échec noté : définitif pour une demande trop longue, un
 * refus de Claude (il refusera encore), une réponse tronquée (la même frise
 * donnerait la même longueur de réponse) ou le dernier essai automatique.
 * Une réponse illisible, elle, peut tenir au hasard : elle reste relancée.
 */
export function suiviApresEchec(suivi, err) {
  const definitif = suivi?.definitif === true || err?.code === 'demande' || err?.code === 'refus'
    || err?.code === 'reponse-tronquee'
    || (suivi?.essais ?? 0) >= ESSAIS_AUTO_MAX
  return { ...suivi, definitif }
}

// Statut et porte comptent : une fiche dont l'agence n'a changé qu'un statut
// est une fiche corrigée, qu'une analyse en cours ne doit pas écraser
const ficheComparable = (f) => JSON.stringify([
  ...RUBRIQUES_FICHE.map((r) => String(f?.[r] ?? '').trim()),
  ...CHAMPS_PORTE.map((c) => porteDe(f)[c]),
  ...RUBRIQUES_STATUT.map((r) => codeStatut(f?.statuts?.[r])),
])

/** Même contenu de fiche (rubriques connues, porte, statuts ; espaces autour ignorés). */
export const memeFiche = (a, b) => ficheComparable(a) === ficheComparable(b)

/**
 * L'écriture finale, conditionnée sur l'`updated_at` de la réservation, n'a
 * touché aucune ligne : que s'est-il passé pendant l'appel ? D'après la
 * pièce relue :
 * - 'disparue' : supprimée ;
 * - 'deja-fait' : analysée ailleurs entre-temps (son résultat reste) ;
 * - 'lecture-seule' : rien n'a bougé, c'est la base qui refuse ;
 * - 'fiche-agence' : la fiche a été modifiée ou validée au bureau, elle est gardée ;
 * - 'reessayer' : autre écriture sans toucher à la fiche (motif, réservation
 *   d'un autre appareil) : le résultat s'écrit sur la nouvelle version.
 */
export function suiteConflitEcriture({ piece, reserve, relue }) {
  if (!relue) return 'disparue'
  if (!memeHeure(relue.analyse_le ?? null, piece?.analyse_le ?? null)) return 'deja-fait'
  if (memeHeure(relue.updated_at ?? null, reserve ?? null)) return 'lecture-seule'
  if (ficheComparable(relue.fiche) !== ficheComparable(piece?.fiche)) return 'fiche-agence'
  // « Valider la fiche » pendant l'appel : même contenu, mais la fiche est
  // désormais relue par l'agence, elle ne doit pas repasser « à valider »
  if (piece?.fiche_a_valider === true && relue.fiche_a_valider === false) return 'fiche-agence'
  return 'reessayer'
}

/**
 * `analyse_le` à écrire : l'heure de la lecture de la frise, jamais avant la
 * fin des passages analysés. `aAnalyser` compare la fin des passages à
 * cette heure ; ce qui arrive pendant l'appel à Claude reste ainsi à analyser.
 */
export function analyseLeApres(luLe, intervalles = []) {
  return new Date(couverture(luLe, intervalles)).toISOString()
}

/**
 * Prochain moment où une pièce de l'affaire pourra partir sans qu'aucune
 * donnée n'arrive : fin d'une attente après échec, ou délai d'abandon d'un
 * passage resté ouvert (visite quittée par le bouton Retour). `null` : rien
 * à relancer à heure fixe (le reste repart sur un envoi ou une transcription).
 */
export function prochaineRelance({ pieces = [], evenements = [], suivis = {}, maintenant, morceaux = [], tranches = [], enregistrements = [], echecsMax = 3 }) {
  let prochaine = null
  const garder = (t) => {
    if (Number.isFinite(t) && t > maintenant && (prochaine == null || t < prochaine)) prochaine = t
  }
  for (const piece of pieces ?? []) {
    const analyse = temps(piece?.analyse_le)
    const nouveaux = intervallesPiece(evenements, piece?.id).filter((iv) => analyse == null || iv.fin > analyse)
    if (!nouveaux.length) continue
    for (const iv of nouveaux) {
      if (!iv.clos) garder(iv.dernier + DELAI_ABANDON_MS)
      // Son attendu d'un autre appareil : au-delà du délai, on n'attend plus
      else if (!sonPret(iv, { morceaux, tranches, enregistrements, maintenant, echecsMax })) garder(iv.fin + DELAI_ABANDON_MS + 1000)
    }
    const s = suivis?.[piece.id]
    if (suiviValable(s, piece) && !s.definitif && (s.essais ?? 0) < ESSAIS_AUTO_MAX) garder(s.dernier + attenteApresEchecs(s.essais))
  }
  return prochaine
}

// Réponses du serveur pour lesquelles Claude n'a pas été appelé : rien n'est
// payé, la pièce n'y est pour rien (session, configuration)
export const CODES_SANS_APPEL = ['session', 'agence-seule', 'analyse-non-configuree', 'supabase-non-configure', 'methode']

const MOTIFS_TROP_LONG = ['trop-de-lignes', 'trop-long', 'trop-de-releves', 'trop-de-traces']

export const MESSAGE_FRISE_TROP_LONGUE = 'Trop de gestes et de paroles dans cette pièce pour une seule analyse (plus de 2 000 lignes)'

const MESSAGES_ECHEC = {
  refus: 'Claude n’a pas accepté d’analyser cette pièce.',
  'reponse-tronquee': 'La réponse de Claude était trop longue pour cette pièce.',
  'reponse-illisible': 'La réponse de Claude était illisible.',
  anthropic: 'Le service de Claude n’a pas répondu.',
}

/** Motif d'échec gardé sur la pièce (`analyse_erreur`), en français. */
export function messageEchecAnalyse(err) {
  if (err?.code === 'demande') {
    return MOTIFS_TROP_LONG.includes(err.detail) ? MESSAGE_FRISE_TROP_LONGUE : `La demande d’analyse a été refusée (${err.detail ?? 'demande'}).`
  }
  return MESSAGES_ECHEC[err?.code] ?? (String(err?.message ?? '').trim() || 'Analyse impossible.')
}

/** Pièce telle que Claude la reçoit : désignation, surface et HSP lues sur le plan. */
export function pieceDemandee(piece, surfaceDessinee = null) {
  const lue = Number(piece?.surface_lue)
  return {
    nom: piece?.nom ?? '',
    numero: piece?.numero ?? null,
    surface: lue > 0 ? lue : (Number(surfaceDessinee) > 0 ? Number(surfaceDessinee) : null),
    hsp: Number(piece?.hsp_lue) > 0 ? Number(piece.hsp_lue) : null,
  }
}
