// ─── Traces de l'état des lieux : liaisons, cotes, finitions de murs ─────────
//
// Une trace se dessine sur le plan d'un étage, à côté des points :
//   · 'commande' — un interrupteur (point_a) relié au luminaire qu'il commande
//     (point_b), toujours dans cet ordre ;
//   · 'cote'     — une cote entre deux angles d'une pièce, en mètres, repère
//     du plan d'origine (xa, ya) → (xb, yb), et sa valeur telle que dite ou
//     tapée (« 3,45 m »), nulle tant que personne ne l'a donnée ;
//   · 'finition' (migration 085) — la finition d'un mur (un côté du contour
//     de la pièce, de (xa, ya) à (xb, yb)) telle que dite (« Faïence toute
//     hauteur ») dans `valeur`, et son `statut` (codes de statutsEdl.js, ou
//     null). Seule l'analyse les crée, d'après un mur touché et ce qui en est
//     dit : rien de dit, rien de créé.
// Visite, analyse, relecture et exports lisent les mêmes règles ici. Pur,
// testé (tests/etat-des-lieux-traces.test.js, etat-des-lieux-murs.test.js).

import { codeStatut } from './statutsEdl.js'

export const SORTES_TRACE = ['commande', 'cote']
// Avec la 085 : les sortes que la base accepte
export const SORTES_TRACE_FINITIONS = [...SORTES_TRACE, 'finition']
export const TYPES_INTERRUPTEUR = ['interrupteur']
export const TYPES_LUMINAIRE = ['luminaire', 'applique', 'dalle', 'reglette']

// Ce que le journal de la visite note en plus avec la 084 ; sans elle, la
// base refuse ces types (contrainte de la 079) : ils ne sont pas notés.
export const TYPES_JOURNAL_TRACES = ['point-touche', 'angle-touche', 'trace', 'trace-supprimee']

// Avec la 085 seulement : un mur touché. Sans elle, il n'est pas noté (la
// surbrillance seule reste à l'écran).
export const TYPES_JOURNAL_FINITIONS = ['mur-touche']

export const MESSAGE_TRACES_INDISPONIBLES =
  'Les liaisons et les cotes demandent la migration 084 (à passer dans le SQL Editor de Supabase).'

export const estInterrupteur = (point) => TYPES_INTERRUPTEUR.includes(point?.type)
export const estLuminaire = (point) => TYPES_LUMINAIRE.includes(point?.type)

/**
 * Le type d'un point pour les liaisons : celui choisi au geste, sinon celui
 * qu'un élément relevé sur ce point lui donne (l'architecte pose souvent un
 * point sans type et le dit à voix haute : l'analyse en fait un élément
 * « interrupteur » ou « applique »). Un élément validé passe avant une
 * proposition ; null si rien ne le dit.
 */
export function typeEffectif(point, elements = []) {
  if (!point) return null
  if (point.type) return point.type
  let propose = null
  for (const el of elements ?? []) {
    if (!el?.type || el.point_id == null || el.point_id !== point.id) continue
    if (!el.a_valider) return el.type
    propose ??= el.type
  }
  return propose
}

/** Les points avec leur type effectif (`typeEffectif`), en copies ; les autres champs ne changent pas. */
export function avecTypeEffectif(points = [], elements = []) {
  const parPoint = new Map()
  for (const el of elements ?? []) {
    if (!el?.type || el.point_id == null) continue
    const deja = parPoint.get(el.point_id)
    // Le premier validé l'emporte, sinon la première proposition
    if (!deja || (deja.a_valider && !el.a_valider)) parPoint.set(el.point_id, el)
  }
  return (points ?? []).map((p) => {
    if (!p || p.type) return p ? { ...p } : p
    return { ...p, type: parPoint.get(p.id)?.type ?? null }
  })
}

/**
 * Deux points peuvent-ils être reliés ? Un interrupteur et un luminaire,
 * touchés dans un sens ou dans l'autre. Rend { interrupteur, luminaire }
 * remis dans l'ordre de la base, ou null.
 */
export function liaisonPossible(pointA, pointB) {
  if (!pointA || !pointB || pointA === pointB || (pointA.id != null && pointA.id === pointB.id)) return null
  if (estInterrupteur(pointA) && estLuminaire(pointB)) return { interrupteur: pointA, luminaire: pointB }
  if (estLuminaire(pointA) && estInterrupteur(pointB)) return { interrupteur: pointB, luminaire: pointA }
  return null
}

/**
 * Une liaison entre ces deux points existe-t-elle déjà ? Dans un sens ou dans
 * l'autre : la base range toujours l'interrupteur en premier, mais un point
 * dont le type a changé depuis retournerait une liaison déjà posée.
 */
export function liaisonExiste(traces, interrupteurId, luminaireId) {
  return (traces ?? []).some((t) => t.sorte === 'commande'
    && ((t.point_a === interrupteurId && t.point_b === luminaireId) || (t.point_a === luminaireId && t.point_b === interrupteurId)))
}

/** Le sommet du contour le plus proche de [x, y] (copie), ou null sans contour. */
export function angleLePlusProche(contour, [x, y]) {
  let meilleur = null
  let distance = Infinity
  for (const sommet of contour ?? []) {
    const d = Math.hypot(sommet[0] - x, sommet[1] - y)
    if (d < distance) {
      distance = d
      meilleur = sommet
    }
  }
  return meilleur ? [meilleur[0], meilleur[1]] : null
}

const nombre = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))

const distanceAuSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Le sommet du contour sous le doigt : le plus proche de `position`, s'il
 * est à `tolerance` mètres au plus (« pile » sur l'angle). Rend
 * { angle: [x, y], index, distance } ou null.
 */
export function angleSous(contour, position, tolerance) {
  let meilleur = null
  for (const [index, sommet] of (contour ?? []).entries()) {
    const distance = Math.hypot(sommet[0] - position[0], sommet[1] - position[1])
    if (distance <= tolerance && (!meilleur || distance < meilleur.distance)) {
      meilleur = { angle: [sommet[0], sommet[1]], index, distance }
    }
  }
  return meilleur
}

/**
 * Le mur (côté du contour) le plus proche de `position`, s'il est à
 * `tolerance` mètres au plus. Le côté `index` va du sommet `index` au
 * suivant (le dernier referme le contour). Rend { a, b, index, distance,
 * longueur } ou null ; un côté de longueur nulle n'est pas un mur.
 */
export function murLePlusProche(contour, position, tolerance) {
  const pts = contour ?? []
  let meilleur = null
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const longueur = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!(longueur > 0)) continue
    const distance = distanceAuSegment(position, a, b)
    if (distance <= tolerance && (!meilleur || distance < meilleur.distance)) {
      meilleur = { a: [a[0], a[1]], b: [b[0], b[1]], index: i, distance, longueur }
    }
  }
  return meilleur
}

/**
 * Même mur ? Mêmes extrémités, dans un sens ou dans l'autre, au millimètre
 * (les contours sont arrondis au millimètre).
 */
export function memeMur(m1, m2) {
  const v1 = [m1?.xa, m1?.ya, m1?.xb, m1?.yb].map(nombre)
  const v2 = [m2?.xa, m2?.ya, m2?.xb, m2?.yb].map(nombre)
  if (![...v1, ...v2].every(Number.isFinite)) return false
  const egal = (p, q) => Math.abs(p - q) < 0.0005
  const direct = egal(v1[0], v2[0]) && egal(v1[1], v2[1]) && egal(v1[2], v2[2]) && egal(v1[3], v2[3])
  const inverse = egal(v1[0], v2[2]) && egal(v1[1], v2[3]) && egal(v1[2], v2[0]) && egal(v1[3], v2[1])
  return direct || inverse
}

// ─── Finitions de murs (migration 085) ──────────────────────────────────────

/**
 * Les finitions de murs et leur couleur, la même partout (plan de la visite,
 * onglet « Plans », planches, Word, DXF, légende) : faïence en rouge, comme
 * l'exemple « Faïence murale » de l'agence, les autres d'une petite palette
 * fixe. Reconnues d'après les mots de la finition dite (`mots`, sans
 * accents ni majuscules), dans l'ordre de la liste ; « autre » sinon.
 * Teintes loin de celles des familles de symboles (`COULEURS_CALQUES` :
 * chauffage orange, menuiseries brun, ventilation vert…) et du bleu des
 * propositions. `libelle` : celui de la légende des planches ; `nom` : celui
 * des tableaux (« Faïence : 2 murs (toute hauteur) »), null pour « autre »
 * (la finition dite fait alors le nom).
 */
export const FINITIONS_MUR = [
  { code: 'faience', libelle: 'Faïence murale', nom: 'Faïence', couleur: '#C62828', mots: ['faience'] },
  { code: 'credence', libelle: 'Crédence', nom: 'Crédence', couleur: '#E0A800', mots: ['credence'] },
  { code: 'lambris', libelle: 'Lambris', nom: 'Lambris', couleur: '#AD1457', mots: ['lambris'] },
  { code: 'carrelage-mural', libelle: 'Carrelage mural', nom: 'Carrelage mural', couleur: '#FF8A65', mots: ['carrelage', 'carreau', 'mosaique'] },
  { code: 'peinture', libelle: 'Peinture spécifique', nom: 'Peinture', couleur: '#9E9D24', mots: ['peinture', 'laque', 'enduit', 'papier peint', 'toile de verre'] },
  { code: 'autre', libelle: 'Autre finition de mur', nom: null, couleur: '#5D6B78', mots: [] },
]

const sansAccents = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** L'entrée de `FINITIONS_MUR` d'une finition dite (« Faïence toute hauteur » → faïence), « autre » à défaut. */
export function finitionMur(texte) {
  const t = sansAccents(texte)
  return FINITIONS_MUR.find((f) => f.mots.some((m) => t.includes(m))) ?? FINITIONS_MUR[FINITIONS_MUR.length - 1]
}

/** Couleur d'une finition dite : celle de son entrée de `FINITIONS_MUR`. */
export const couleurFinition = (texte) => finitionMur(texte).couleur

/**
 * Une finition proposée telle qu'elle part dans `p_traces` : texte borné,
 * première lettre en capitale, statut lu par `codeStatut` (inconnu → null).
 * null si la finition est vide ou le mur incomplet.
 */
export function finitionPropre({ xa, ya, xb, yb, valeur, statut = null, extrait = null }) {
  const v = String(valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const coords = [xa, ya, xb, yb].map(nombre)
  if (!v || !coords.every(Number.isFinite) || !(Math.hypot(coords[2] - coords[0], coords[3] - coords[1]) > 0)) return null
  return {
    xa: coords[0], ya: coords[1], xb: coords[2], yb: coords[3],
    valeur: v.charAt(0).toUpperCase() + v.slice(1),
    statut: codeStatut(statut),
    extrait: extrait == null ? null : String(extrait).replace(/\s+/g, ' ').trim().slice(0, 1000) || null,
  }
}

/**
 * La base n'a pas la 085 : la colonne `statut` des traces est inconnue
 * (42703 de PostgreSQL, PGRST204 du cache de PostgREST).
 */
export function finitionsIndisponibles(error) {
  if (!error) return false
  const texte = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  return (error.code === '42703' || error.code === 'PGRST204') && /statut/.test(texte)
}

/** Colonne de sonde des lectures de traces : elle n'existe qu'avec la 085. */
export const SONDE_FINITIONS = 'sonde_finitions:statut'

/**
 * Lit les traces en sondant la 085 : `lireAvecSonde()` lit avec la colonne
 * `SONDE_FINITIONS`, `lireSans()` sans elle. Rend { traces,
 * tracesDisponibles, finitionsDisponibles } — sans la 084, ni traces ni
 * finitions ; sans la 085, les traces de la 084 et `finitionsDisponibles`
 * faux. La colonne de sonde est retirée des lignes.
 */
export async function lectureTracesEtFinitions(lireAvecSonde, lireSans) {
  try {
    const lignes = (await lireAvecSonde()) ?? []
    const traces = lignes.map((l) => {
      const copie = { ...l }
      delete copie.sonde_finitions
      return copie
    })
    return { traces, tracesDisponibles: true, finitionsDisponibles: true }
  } catch (err) {
    // La colonne d'abord : « column edl_traces.statut does not exist » se lirait
    // aussi comme une table absente
    if (!finitionsIndisponibles(err)) {
      if (tracesIndisponibles(err)) return { traces: [], tracesDisponibles: false, finitionsDisponibles: false }
      throw err
    }
  }
  const { traces, tracesDisponibles } = await lectureTraces(lireSans)
  return { traces, tracesDisponibles, finitionsDisponibles: false }
}

/** Longueur dessinée d'une cote, en mètres ; null pour une liaison ou une cote incomplète. */
export function longueurCote(trace) {
  if (trace?.sorte !== 'cote') return null
  const [xa, ya, xb, yb] = [trace.xa, trace.ya, trace.xb, trace.yb].map(nombre)
  if (![xa, ya, xb, yb].every(Number.isFinite)) return null
  return Math.hypot(xb - xa, yb - ya)
}

const METRES = '(?:m|metres?|mètres?)'
const CENTIMETRES = '(?:cm|centimetres?|centimètres?)'
const MILLIMETRES = '(?:mm|millimetres?|millimètres?)'
const NOMBRE = '(\\d+(?:\\.\\d+)?)'
const LECTURES = [
  [new RegExp(`^${NOMBRE}\\s*${METRES}?$`), (m) => Number(m[1])],
  [new RegExp(`^${NOMBRE}\\s*${CENTIMETRES}$`), (m) => Number(m[1]) / 100],
  [new RegExp(`^${NOMBRE}\\s*${MILLIMETRES}$`), (m) => Number(m[1]) / 1000],
  // « 3 m 45 », « 3m45 », « 3 m 5 cm » : ce qui suit les mètres est en centimètres
  [new RegExp(`^(\\d+)\\s*${METRES}\\s*(\\d{1,2})\\s*${CENTIMETRES}?$`), (m) => Number(m[1]) + Number(m[2]) / 100],
]

/**
 * Le nombre de mètres lu dans une valeur dite ou tapée : « 3,45 », « 3.45 m »,
 * « 345 cm », « 3450 mm », « 3 m 45 ». Arrondi au millimètre ; null si rien de
 * lisible (ou zéro).
 */
export function valeurCote(texte) {
  if (typeof texte === 'number') return Number.isFinite(texte) && texte > 0 ? Math.round(texte * 1000) / 1000 : null
  if (typeof texte !== 'string') return null
  const propre = texte.normalize('NFC').toLowerCase().trim().replace(/,/g, '.').replace(/\s+/g, ' ').replace(/\.$/, '')
  for (const [motif, lire] of LECTURES) {
    const m = propre.match(motif)
    if (!m) continue
    const v = lire(m)
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null
  }
  return null
}

/** « 3,45 m » : la valeur d'une cote telle qu'on l'écrit et qu'on l'enregistre. */
export function texteValeur(metres) {
  const v = Number(metres)
  if (metres === null || metres === undefined || metres === '' || !Number.isFinite(v) || v <= 0) return null
  return `${v.toFixed(2).replace('.', ',')} m`
}

/** Une trace complète, telle que la base l'accepte (contrainte edl_traces_forme). */
export function traceValide(t) {
  if (!t || typeof t !== 'object' || !t.id || !t.affaire_id || !t.niveau_id) return false
  if (!SORTES_TRACE.includes(t.sorte)) return false
  if (t.origine != null && !['main', 'ia'].includes(t.origine)) return false
  if (t.sorte === 'commande') return Boolean(t.point_a && t.point_b && t.point_a !== t.point_b)
  const longueur = longueurCote(t)
  return longueur !== null && longueur > 0
}

/**
 * Une trace neuve posée à la main pendant la visite (identifiant décidé sur
 * l'appareil). `commande` : `interrupteur` et `luminaire` (des points, ou
 * leurs ids) ; `cote` : les angles `a` et `b` ([x, y] en mètres) et une
 * `valeur` facultative. `id` : décidé d'avance si le journal doit déjà le
 * citer (les angles touchés d'une cote).
 */
export function nouvelleTrace({ id = null, sorte, affaireId, visiteId = null, niveauId, pieceId = null, interrupteur, luminaire, a, b, valeur = null }) {
  const base = {
    id: id ?? crypto.randomUUID(), affaire_id: affaireId, visite_id: visiteId, niveau_id: niveauId, piece_id: pieceId,
    sorte, point_a: null, point_b: null, xa: null, ya: null, xb: null, yb: null, valeur: null,
    origine: 'main', a_valider: false, extrait: null,
  }
  if (sorte === 'commande') {
    return { ...base, point_a: interrupteur?.id ?? interrupteur ?? null, point_b: luminaire?.id ?? luminaire ?? null }
  }
  return { ...base, xa: a?.[0] ?? null, ya: a?.[1] ?? null, xb: b?.[0] ?? null, yb: b?.[1] ?? null, valeur: valeur ?? null }
}

/**
 * Les champs d'une modification de trace tels qu'ils partent. Une valeur
 * donnée à la main est une valeur relue : `a_valider` repasse à faux, sans
 * quoi la prochaine analyse retirerait la valeur tapée comme une proposition.
 */
export function champsModificationTrace(champs) {
  return champs && Object.hasOwn(champs, 'valeur') ? { ...champs, a_valider: false } : { ...champs }
}

/**
 * La base n'a pas la 084 : table inconnue de PostgreSQL (42P01) ou du cache
 * de PostgREST (PGRST205). Le nom de la table est exigé dans le message, sauf
 * pour ces deux codes : une autre table manquante n'a pas à masquer les traces.
 */
export function tracesIndisponibles(error) {
  if (!error) return false
  const texte = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  if (error.code === '42P01' || error.code === 'PGRST205') return /edl_traces/.test(texte) || !texte.trim()
  return /edl_traces/.test(texte) && /does not exist|schema cache/i.test(texte)
}

/**
 * Lit les traces par `lire()` (rend les lignes, ou lève l'erreur de la base) :
 * { traces, tracesDisponibles }. Sans la 084, aucune trace et le drapeau
 * faux — l'écran masque alors « Relier » et « Coter » ; toute autre erreur
 * remonte.
 */
export async function lectureTraces(lire) {
  try {
    return { traces: (await lire()) ?? [], tracesDisponibles: true }
  } catch (err) {
    if (!tracesIndisponibles(err)) throw err
    return { traces: [], tracesDisponibles: false }
  }
}

const coordonnees = (x, y) => {
  const p = [nombre(x), nombre(y)]
  return p.every(Number.isFinite) ? p : null
}

/**
 * Les traces qui partent dans les exports (DXF, planches PDF et Word,
 * tableaux), en mètres du plan, avec la règle des éléments : par défaut,
 * rien de ce qui attend une relecture.
 *   · une liaison proposée (`a_valider`) n'existe que si les propositions
 *     sont demandées ; une liaison dont un point manque, ou n'est plus sur
 *     l'étage de la liaison, est omise ;
 *   · une cote est toujours posée à la main : seule sa valeur peut être
 *     proposée. Sans les propositions, elle part sans valeur (« ? ») ; avec,
 *     elle part marquée « à valider ».
 * `valeur` : « 3,45 m » (réécrite si lisible), ou null tant que personne ne
 * l'a donnée.
 *   · une finition de mur (085) proposée n'existe que si les propositions
 *     sont demandées ; sans texte, elle est omise. Elle part avec son
 *     `statut` (code ou null) et son entrée de `FINITIONS_MUR` (`finition` :
 *     code, libellé de légende, nom, couleur).
 *
 * @returns [{ id, sorte, niveauId, pieceId, a: [x, y], b: [x, y], valeur, aValider, statut?, finition? }]
 */
export function tracesAExporter({ traces = [], points = [], inclurePropositions = false } = {}) {
  const parId = new Map((points ?? []).map((p) => [p.id, p]))
  const sortie = []
  for (const t of traces ?? []) {
    if (!t || !SORTES_TRACE_FINITIONS.includes(t.sorte)) continue
    const niveauId = t.niveau_id ?? null
    const proposee = !!t.a_valider
    if (t.sorte === 'finition') {
      if (proposee && !inclurePropositions) continue
      const a = coordonnees(t.xa, t.ya)
      const b = coordonnees(t.xb, t.yb)
      const valeur = typeof t.valeur === 'string' ? t.valeur.replace(/\s+/g, ' ').trim() : ''
      if (!a || !b || !valeur || !(Math.hypot(b[0] - a[0], b[1] - a[1]) > 0)) continue
      const { code, libelle, nom, couleur } = finitionMur(valeur)
      sortie.push({
        id: t.id, sorte: 'finition', niveauId, pieceId: t.piece_id ?? null, a, b, valeur, aValider: proposee,
        statut: codeStatut(t.statut), finition: { code, libelle, nom, couleur },
      })
      continue
    }
    if (t.sorte === 'commande') {
      if (proposee && !inclurePropositions) continue
      const pa = parId.get(t.point_a)
      const pb = parId.get(t.point_b)
      const surLEtage = (p) => !niveauId || !p.niveau_id || p.niveau_id === niveauId
      if (!pa || !pb || pa.id === pb.id || !surLEtage(pa) || !surLEtage(pb)) continue
      const a = coordonnees(pa.x, pa.y)
      const b = coordonnees(pb.x, pb.y)
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue
      sortie.push({ id: t.id, sorte: 'commande', niveauId: niveauId ?? pa.niveau_id ?? null, pieceId: t.piece_id ?? null, a, b, valeur: null, aValider: proposee })
      continue
    }
    const a = coordonnees(t.xa, t.ya)
    const b = coordonnees(t.xb, t.yb)
    if (!a || !b || !(Math.hypot(b[0] - a[0], b[1] - a[1]) > 0)) continue
    const garderValeur = !proposee || inclurePropositions
    const brute = garderValeur && typeof t.valeur === 'string' && t.valeur.trim() ? t.valeur.trim() : null
    const valeur = brute ? texteValeur(valeurCote(brute)) ?? brute : null
    sortie.push({ id: t.id, sorte: 'cote', niveauId, pieceId: t.piece_id ?? null, a, b, valeur, aValider: proposee && garderValeur && !!valeur })
  }
  return sortie
}
