// ─── Traces de l'état des lieux : liaisons et cotes (migration 084) ──────────
//
// Une trace se dessine sur le plan d'un étage, à côté des points :
//   · 'commande' — un interrupteur (point_a) relié au luminaire qu'il commande
//     (point_b), toujours dans cet ordre ;
//   · 'cote'     — une cote entre deux angles d'une pièce, en mètres, repère
//     du plan d'origine (xa, ya) → (xb, yb), et sa valeur telle que dite ou
//     tapée (« 3,45 m »), nulle tant que personne ne l'a donnée.
// Visite, analyse, relecture et exports lisent les mêmes règles ici. Pur,
// testé (tests/etat-des-lieux-traces.test.js).

export const SORTES_TRACE = ['commande', 'cote']
export const TYPES_INTERRUPTEUR = ['interrupteur']
export const TYPES_LUMINAIRE = ['luminaire', 'applique', 'dalle', 'reglette']

// Ce que le journal de la visite note en plus avec la 084 ; sans elle, la
// base refuse ces types (contrainte de la 079) : ils ne sont pas notés.
export const TYPES_JOURNAL_TRACES = ['point-touche', 'angle-touche', 'trace', 'trace-supprimee']

export const MESSAGE_TRACES_INDISPONIBLES =
  'Les liaisons et les cotes demandent la migration 084 (à passer dans le SQL Editor de Supabase).'

export const estInterrupteur = (point) => TYPES_INTERRUPTEUR.includes(point?.type)
export const estLuminaire = (point) => TYPES_LUMINAIRE.includes(point?.type)

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

/** Une liaison entre ces deux points existe-t-elle déjà (sens interrupteur → luminaire) ? */
export function liaisonExiste(traces, interrupteurId, luminaireId) {
  return (traces ?? []).some((t) => t.sorte === 'commande' && t.point_a === interrupteurId && t.point_b === luminaireId)
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
