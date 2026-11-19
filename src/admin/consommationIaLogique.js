// ─── Consommation des crédits API Claude : calculs (purs) ────────────────────
//
// Anthropic ne donne pas le solde des crédits par API, et son API
// d'administration (dépenses) est fermée aux comptes individuels — dont
// l'organisation « JGA's Individual Org » qui porte la clé de l'app. Chaque
// fonction serveur qui appelle Claude note donc le `usage` de sa réponse
// (table `ia_consommation`, migration 083) ; le coût se calcule ici, aux prix
// publics, et reste une estimation : le chiffre qui fait foi est celui de la
// Console Anthropic.
//
// Lu aussi par les fonctions serveur (`api/`) : rien qui dépende du navigateur.
// Testé (tests/gestion-application.test.js).

/**
 * Les crédits inclus dans le forfait Max : 100 $ par mois, renouvelés le 7,
 * sans report. Seul endroit à changer le jour d'un autre forfait.
 */
export const CREDITS_API = { montantUsd: 100, jourRenouvellement: 7 }

export const SEUIL_ALERTE_CREDITS = 0.8

export const CONSOLE_FACTURATION = 'https://platform.claude.com/settings/billing'

// Prix publics en dollars par million de jetons (entrée, sortie, lecture du
// cache). L'écriture du cache coûte 1,25 fois l'entrée (durée de 5 minutes,
// celle de l'app). Les replis de `fallbacks: 'default'` peuvent servir un
// autre modèle : il est compté à son propre prix.
const PRIX = {
  'claude-fable-5-2': { entree: 8, sortie: 40, lectureCache: 0.2 },
  'claude-mythos-5-2': { entree: 8, sortie: 40, lectureCache: 0.2 },
  'claude-fable-5-1': { entree: 10, sortie: 50, lectureCache: 1 },
  'claude-fable-5': { entree: 10, sortie: 50, lectureCache: 1 },
  'claude-opus-5-5': { entree: 4, sortie: 20, lectureCache: 0.2 },
  'claude-opus-5': { entree: 5, sortie: 25, lectureCache: 0.5 },
  'claude-opus-4-8': { entree: 5, sortie: 25, lectureCache: 0.5 },
  'claude-opus-4-7': { entree: 5, sortie: 25, lectureCache: 0.5 },
  'claude-opus-4-6': { entree: 5, sortie: 25, lectureCache: 0.5 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10, lectureCache: 0.1 },
  'claude-sonnet-5': { entree: 2, sortie: 10, lectureCache: 0.2 },
  'claude-sonnet-4-6': { entree: 3, sortie: 15, lectureCache: 0.3 },
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5, lectureCache: 0.01 },
  'claude-haiku-4-5': { entree: 1, sortie: 5, lectureCache: 0.1 },
}

// Un modèle inconnu (nouveau nom, suffixe de date) : le plus proche par le
// début du nom, sinon le plus cher de la famille Opus — mieux vaut surestimer.
function prixDe(modele) {
  const m = String(modele ?? '')
  if (PRIX[m]) return PRIX[m]
  const connu = Object.keys(PRIX).sort((a, b) => b.length - a.length).find((k) => m.startsWith(k))
  return connu ? PRIX[connu] : PRIX['claude-opus-5']
}

const n = (v) => Math.max(0, Number(v) || 0)

function coutJetons(modele, u) {
  const p = prixDe(modele)
  return (
    n(u.input_tokens) * p.entree
    + n(u.cache_creation_input_tokens) * p.entree * 1.25
    + n(u.cache_read_input_tokens) * p.lectureCache
    + n(u.output_tokens) * p.sortie
  ) / 1e6
}

/**
 * Coût en dollars d'un appel. Avec un repli de modèle, `usage.iterations`
 * donne chaque essai (le `usage` du haut ne couvre que le dernier) : chacun
 * est compté au prix du modèle qui l'a fait.
 * @param modele le modèle demandé (ou servi, faute de mieux)
 * @param usage  le `usage` de la réponse d'Anthropic
 */
export function coutAppel(modele, usage) {
  if (!usage || typeof usage !== 'object') return 0
  const essais = Array.isArray(usage.iterations)
    ? usage.iterations.filter((e) => e && typeof e === 'object' && ('input_tokens' in e || 'output_tokens' in e))
    : []
  if (essais.length) return essais.reduce((s, e) => s + coutJetons(e.model ?? modele, e), 0)
  return coutJetons(modele, usage)
}

/**
 * Le `usage` d'une réponse en flux (événements SSE de l'API Messages) :
 * `message_start` donne l'entrée et le modèle, chaque `message_delta` des
 * cumuls qui remplacent les précédents.
 * @param evenements objets déjà lus depuis les lignes « data: »
 * @returns { modele, usage } ou null si rien n'a été vu
 */
export function usageDuFlux(evenements = []) {
  let modele = null
  let usage = null
  for (const e of evenements) {
    if (e?.type === 'message_start' && e.message) {
      modele = e.message.model ?? modele
      usage = { ...(e.message.usage ?? {}) }
    } else if (e?.type === 'message_delta' && e.usage) {
      usage = { ...(usage ?? {}), ...e.usage }
    }
  }
  return usage ? { modele, usage } : null
}

/**
 * La période de crédits qui contient `date` : du jour de renouvellement à
 * minuit (UTC) jusqu'au même jour du mois suivant, exclu.
 */
export function periodeCredits(date = new Date(), jour = CREDITS_API.jourRenouvellement) {
  const d = new Date(date)
  const annee = d.getUTCFullYear()
  let mois = d.getUTCMonth()
  if (d.getUTCDate() < jour) mois -= 1
  const debut = new Date(Date.UTC(annee, mois, jour))
  const fin = new Date(Date.UTC(annee, mois + 1, jour))
  return { debut, fin }
}

/** La période d'avant. */
export function periodePrecedente(periode) {
  return periodeCredits(new Date(periode.debut.getTime() - 1))
}

export const LIBELLES_FONCTIONS = {
  'analyser-visite': 'Remarques proposées (visites de chantier)',
  'edl-pieces': 'Pièces repérées sur les plans (état des lieux)',
  'edl-relecture': 'Relecture du découpage (état des lieux)',
  'edl-calques': 'Allègement des plans (état des lieux)',
  'analyser-edl': 'Analyse des pièces visitées (état des lieux)',
}

/**
 * Ce que montre la carte « Crédits API Claude ».
 * @param lignes [{ cree_le, fonction, modele, usage }] (ia_consommation)
 * @returns { periode, depense, part, alerte, reste, appels, parFonction,
 *            precedente, projection, depuis }
 */
export function resumeConsommation(lignes = [], maintenant = new Date(), credits = CREDITS_API) {
  const periode = periodeCredits(maintenant, credits.jourRenouvellement)
  const avant = periodePrecedente(periode)
  const dans = (l, p) => {
    const t = new Date(l.cree_le).getTime()
    return t >= p.debut.getTime() && t < p.fin.getTime()
  }
  const courantes = lignes.filter((l) => dans(l, periode))
  const fonctions = new Map()
  let depense = 0
  for (const l of courantes) {
    const c = coutAppel(l.modele, l.usage)
    depense += c
    const f = fonctions.get(l.fonction) ?? { fonction: l.fonction, libelle: LIBELLES_FONCTIONS[l.fonction] ?? l.fonction, appels: 0, cout: 0 }
    f.appels += 1
    f.cout += c
    fonctions.set(l.fonction, f)
  }
  const precedentes = lignes.filter((l) => dans(l, avant))
  const part = credits.montantUsd > 0 ? depense / credits.montantUsd : 0

  // Au rythme actuel, jusqu'à la fin de la période ; seulement passé un jour,
  // sinon le premier appel du mois annonce des centaines de dollars
  const ecoule = maintenant.getTime() - periode.debut.getTime()
  const duree = periode.fin.getTime() - periode.debut.getTime()
  const projection = ecoule >= 86400000 && depense > 0 ? depense * (duree / ecoule) : null

  const dates = lignes.map((l) => new Date(l.cree_le).getTime()).filter(Number.isFinite)
  return {
    periode,
    depense,
    part,
    alerte: part >= SEUIL_ALERTE_CREDITS,
    reste: Math.max(0, credits.montantUsd - depense),
    montant: credits.montantUsd,
    appels: courantes.length,
    parFonction: [...fonctions.values()].sort((a, b) => b.cout - a.cout),
    precedente: precedentes.length
      ? { periode: avant, depense: precedentes.reduce((s, l) => s + coutAppel(l.modele, l.usage), 0), appels: precedentes.length }
      : null,
    projection,
    depuis: dates.length ? new Date(Math.min(...dates)) : null,
  }
}

/** « 0,42 $ », « 12,30 $ » ; moins d'un centime : « < 0,01 $ ». */
export function formatDollars(montant) {
  const m = Number(montant) || 0
  if (m > 0 && m < 0.005) return '< 0,01 $'
  return `${m.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}
