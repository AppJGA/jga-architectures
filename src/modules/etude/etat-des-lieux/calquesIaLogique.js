// ─── Faire choisir par Claude le traitement de chaque calque ─────────────────
//
// Un étage de DXF arrive avec des dizaines de calques, et le nom d'un calque
// ne dit pas toujours ce qu'il porte (« A-0213 », « Calque 4 ») : la règle
// sans modèle (`decisionsParDefaut`) ne voit que des statistiques. Claude
// reçoit, pour chaque calque, ses chiffres, quelques-uns de ses textes et un
// extrait dessiné seul, plus un aperçu de tout l'étage, et choisit l'un des
// `TRAITEMENTS`. Il ne touche jamais à la géométrie : l'application allège
// le plan elle-même d'après ces choix. Fichier partagé avec la fonction
// serveur api/edl-calques.js : imports avec l'extension `.js`.

import { TRAITEMENTS, LONGUEUR_MOTIF, decisionsParDefaut } from './simplificationPlan.js'

export const MODELE_CALQUES = 'claude-opus-5-5'
// Au-delà, la demande dépasserait la limite de corps des fonctions Vercel
// (4,5 Mo) avec un extrait par calque ; les calques suivants, les moins
// fournis, gardent la décision par défaut.
export const CALQUES_MAX = 60
export const TEXTES_PAR_CALQUE = 10
// Cadrage des extraits : la cellule de 10 m qui porte le plus de traits du
// calque, élargie à 12 m pour ne pas couper le motif au ras de la cellule.
export const CELLULE_DENSE = 10
export const COTE_EXTRAIT = 12

const NOM_MAX = 200
const TEXTE_MAX = 80
const RAISON_MAX = 300

export const SCHEMA_CALQUES = {
  type: 'object',
  additionalProperties: false,
  required: ['calques'],
  properties: {
    calques: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'traitement', 'raison'],
        properties: {
          nom: { type: 'string' },
          traitement: { type: 'string', enum: TRAITEMENTS },
          raison: { type: 'string' },
        },
      },
    },
  },
}

const cm = Math.round(LONGUEUR_MOTIF * 100)

export const CONSIGNES_CALQUES = `Tu prépares le plan d'un bâtiment existant pour un état des lieux, fait par une agence d'architecture. Le plan vient d'un fichier DXF découpé en calques ; il doit être lisible et léger, pour s'afficher vite sur une tablette pendant la visite.

Tu reçois un aperçu de tout l'étage (tous les calques en gris), puis, pour chaque calque : son nom, son nombre de traits, la part de traits courts (moins de ${cm} cm), le nombre de contours fermés, le nombre de textes, quelques-uns de ses textes, et un extrait où ce calque est dessiné seul, en noir sur blanc, sur un carré de ${COTE_EXTRAIT} m cadré sur sa zone la plus chargée.

Pour chaque calque, choisis un traitement :
- « garder » : tous les traits du calque restent.
- « masse » : pour les murs et cloisons dont le remplissage est fait de milliers de petits traits serrés (pochage) ; ces petits traits deviennent des masses pleines, les traits longs (contours des murs) restent.
- « masquer-motif » : pour les motifs décoratifs faits de petits traits répétés — tuiles, gravier, dallage, végétation, hachures de sol ou de terrain ; les petits traits disparaissent, les contours (traits longs) restent.
- « masquer » : tout le calque disparaît, traits et textes ; seulement pour un calque sans intérêt pour la visite — terrain lointain, arbres, cotations d'urbanisme, cartouche.

Règles :
- Dans le doute, garder.
- Ne masque jamais (ni « masquer » ni « masquer-motif ») les portes, fenêtres, escaliers, sanitaires, équipements, zones ou pièces, ni leurs textes.
- « masse » seulement pour un remplissage de murs ou de cloisons ; un motif qui n'est pas un mur prend « masquer-motif ».
- Un calque fait surtout de traits longs n'a pas de motif à retirer : « masse » et « masquer-motif » ne lui changent presque rien.
- Une entrée par calque reçu, avec son nom recopié exactement.
- « raison » : une phrase courte en français qui dit ce que porte le calque et pourquoi ce traitement.
- Réponds uniquement par le JSON demandé.`

const texteCourt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const entier = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0)
const pourcent = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(Math.min(Math.max(n, 0), 1) * 100) : 0
}

/**
 * Contrôle de la demande reçue par la fonction serveur : `null` si elle est
 * recevable, sinon le motif du refus.
 */
export function erreurDemandeCalques(corps) {
  const calques = corps?.calques
  if (!Array.isArray(calques) || !calques.length) return 'calques'
  if (calques.length > CALQUES_MAX) return 'trop-de-calques'
  const imageValide = (v) => v == null || (typeof v === 'string' && v.length > 0)
  if (!imageValide(corps.apercu)) return 'apercu'
  for (const c of calques) {
    // Un nom vide est un vrai calque de DXF (code 8 vide) : le refuser privait
    // tout le fichier de Claude. Le navigateur ne les envoie plus, mais une
    // demande qui en porte un reste recevable.
    if (!c || typeof c !== 'object' || typeof c.nom !== 'string') return 'calques'
    if (!imageValide(c.extrait)) return 'extrait'
  }
  return null
}

/** Le nom tel que Claude le lit dans la demande (espaces réduites, coupé). */
export const nomEnvoye = (nom) => texteCourt(nom, NOM_MAX)

/**
 * Calques à soumettre à Claude : les plus fournis d'abord, sans les calques
 * sans nom — Claude ne pourrait pas les désigner dans sa réponse ; ils
 * gardent la décision par défaut.
 * @param analyse sortie d'`analyserCalques`
 */
export function calquesAEnvoyer(analyse) {
  return (analyse ?? []).filter((c) => typeof c?.nom === 'string' && nomEnvoye(c.nom)).slice(0, CALQUES_MAX)
}

/**
 * @param calques [{ nom, traits, partCourts, fermes, textes: [string], extrait: base64 JPEG | null }]
 * @param apercu base64 JPEG de tout l'étage, ou null
 */
export function construireDemandeCalques({ calques = [], apercu = null }) {
  const contenu = []
  if (apercu) {
    contenu.push({ type: 'text', text: 'Aperçu de tout l’étage (tous les calques en gris) :' })
    contenu.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: apercu } })
  } else {
    contenu.push({ type: 'text', text: 'Pas d’aperçu de l’étage.' })
  }
  calques.slice(0, CALQUES_MAX).forEach((c, i) => {
    const textes = (Array.isArray(c.textes) ? c.textes : [])
      .map((t) => texteCourt(t, TEXTE_MAX))
      .filter(Boolean)
      .slice(0, TEXTES_PAR_CALQUE)
    const lignes = [
      `Calque ${i + 1} — nom : « ${nomEnvoye(c.nom)} »`,
      `${entier(c.traits)} traits, ${pourcent(c.partCourts)} % de traits courts (< ${cm} cm), ${entier(c.fermes)} contours fermés, ${entier(c.nbTextes ?? textes.length)} textes.`,
      textes.length ? `Textes : ${textes.join(' ; ')}` : 'Aucun texte.',
      c.extrait ? 'Extrait du calque seul :' : 'Pas d’extrait (aucun trait).',
    ]
    contenu.push({ type: 'text', text: lignes.join('\n') })
    if (c.extrait) contenu.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.extrait } })
  })
  contenu.push({ type: 'text', text: `${Math.min(calques.length, CALQUES_MAX)} calques à traiter : une entrée pour chacun.` })
  return {
    system: CONSIGNES_CALQUES,
    messages: [{ role: 'user', content: contenu }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_CALQUES } },
  }
}

/**
 * Ne garde que les calques envoyés et les traitements connus : un calque
 * oublié par Claude reste absent, l'appelant lui donne la décision par
 * défaut (`fusionnerDecisions`). Claude recopie le nom qu'il a lu, réduit par
 * `nomEnvoye` (espaces doubles, nom de plus de 200 caractères) : sa réponse
 * est ramenée au nom d'origine par la même réduction. Deux calques que la
 * réduction confond restent aux défauts : on ne saurait pas lequel il désigne.
 * @param noms noms des calques envoyés, tels que dans le DXF
 * @returns { decisions: { nom: traitement }, raisons: { nom: texte } } — clés = noms d'origine
 */
export function lireDecisionsCalques(resultat, noms) {
  const parNomCourt = new Map()
  for (const nom of noms) {
    const court = nomEnvoye(nom)
    parNomCourt.set(court, parNomCourt.has(court) && parNomCourt.get(court) !== nom ? null : nom)
  }
  const decisions = {}
  const raisons = {}
  for (const c of Array.isArray(resultat?.calques) ? resultat.calques : []) {
    const nom = typeof c?.nom === 'string' ? (parNomCourt.get(nomEnvoye(c.nom)) ?? null) : null
    if (nom == null || Object.hasOwn(decisions, nom)) continue
    if (!TRAITEMENTS.includes(c.traitement)) continue
    decisions[nom] = c.traitement
    const raison = texteCourt(c.raison, RAISON_MAX)
    if (raison) raisons[nom] = raison
  }
  return { decisions, raisons }
}

/**
 * Décisions par défaut remplacées par celles de Claude quand elles sont
 * valides. Un nom absent des défauts (calque inconnu de l'étage) est écarté.
 */
export function fusionnerDecisions(defauts, proposees) {
  const resultat = { ...defauts }
  for (const [nom, traitement] of Object.entries(proposees ?? {})) {
    if (Object.hasOwn(resultat, nom) && TRAITEMENTS.includes(traitement)) resultat[nom] = traitement
  }
  return resultat
}

/**
 * Carré de l'extrait d'un calque : centré sur la cellule de `cellule` m qui
 * porte le plus de ses traits (un trait compte pour la cellule de son
 * premier point), côté `cote` m. `null` pour un calque sans trait.
 * @returns [x0, y0, x1, y1] en mètres
 */
export function cadreDense(traits, { cellule = CELLULE_DENSE, cote = COTE_EXTRAIT } = {}) {
  const compte = new Map()
  let meilleure = null
  let max = 0
  for (const t of traits) {
    const p = t.pts?.[0]
    if (!p) continue
    const i = Math.floor(p[0] / cellule)
    const j = Math.floor(p[1] / cellule)
    const cle = `${i}:${j}`
    const n = (compte.get(cle) ?? 0) + 1
    compte.set(cle, n)
    if (n > max) { max = n; meilleure = [i, j] }
  }
  if (!meilleure) return null
  const cx = (meilleure[0] + 0.5) * cellule
  const cy = (meilleure[1] + 0.5) * cellule
  return [cx - cote / 2, cy - cote / 2, cx + cote / 2, cy + cote / 2]
}

// ─── Choix des calques dans la fenêtre d'import ──────────────────────────────
//
// Un fichier préparé porte `decisions` (le traitement courant de chaque
// calque) et `calques` : { etat: 'attente' | 'claude' | 'defaut', raisons,
// touches, proposees, avertissement }. `touches` liste les calques changés à
// la main : une réponse de Claude arrivée après coup ne les écrase pas.
// `proposees` garde les choix de Claude : seuls ceux-là et ceux de la main
// survivent à une nouvelle analyse (`reprendreDecisions`).

export const CALQUES_EN_ATTENTE = { etat: 'attente', raisons: {}, touches: [], proposees: {} }

/** Réponse de `proposerTraitements` appliquée au fichier tel qu'il est devenu entre-temps. */
export function appliquerProposition(prep, proposition) {
  const touches = prep.calques?.touches ?? []
  if (proposition.avertissement) {
    return { ...prep, calques: { ...prep.calques, touches, etat: 'defaut', raisons: {}, avertissement: proposition.avertissement } }
  }
  const proposees = { ...(proposition.proposees ?? {}) }
  for (const nom of touches) delete proposees[nom]
  return {
    ...prep,
    decisions: fusionnerDecisions(prep.decisions, proposees),
    calques: { ...prep.calques, touches, etat: 'claude', raisons: proposition.raisons ?? {}, proposees: proposition.proposees ?? {}, avertissement: null },
  }
}

/**
 * Décisions après une nouvelle analyse du fichier (changement d'unité : la
 * longueur d'un trait court change). Un calque réglé à la main ou par Claude
 * garde son traitement ; tous les autres reprennent les défauts de la
 * nouvelle analyse, sans quoi les défauts calculés avec la mauvaise unité
 * resteraient.
 */
export function reprendreDecisions(prep, analyse) {
  const c = prep.calques ?? {}
  const gardes = {}
  for (const nom of [...Object.keys(c.proposees ?? {}), ...(c.touches ?? [])]) {
    if (Object.hasOwn(prep.decisions ?? {}, nom)) gardes[nom] = prep.decisions[nom]
  }
  return fusionnerDecisions(decisionsParDefaut(analyse), gardes)
}

export function choisirTraitement(prep, nom, traitement) {
  if (!TRAITEMENTS.includes(traitement)) return prep
  const touches = prep.calques?.touches ?? []
  return {
    ...prep,
    decisions: { ...prep.decisions, [nom]: traitement },
    calques: { ...prep.calques, touches: touches.includes(nom) ? touches : [...touches, nom] },
  }
}

/** Valeur de la colonne `edl_niveaux.calques` (migration 081). */
export function valeurCalques(prep) {
  const c = prep.calques ?? {}
  const source = c.touches?.length ? 'main' : c.etat === 'claude' ? 'claude' : 'defaut'
  return { decisions: { ...prep.decisions }, raisons: { ...(c.raisons ?? {}) }, source }
}
