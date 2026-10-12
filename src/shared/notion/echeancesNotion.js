// ─── Échéances partagées avec Notion : lectures, écritures, orchestration ────
//
// `synchroniser` lit Notion par le passeur (api/notion.js), lit le registre et
// les échéances, calcule le plan (synchroNotionLogique.js) puis l'applique
// (appliquerSynchro.js). Une seule synchronisation à la fois sur l'appareil
// (Web Locks). Sans réseau, sans la migration 071 ou sans Notion, rien ne
// part et rien ne crie : le passage suivant rattrape (conception, §5.4).

import { supabase } from '../../core/supabase/client'
import { estAncre } from '../planning/ancrage'
import { titreCarte, lireCarte, remplacerDate, remplacerLibelle, libellePourCarte, formatDateCarte } from './echeancesNotionLogique'
import { numeroAffaire, codeCarte } from './codesAffaire'
import { planSynchro } from './synchroNotionLogique'
import { equipesNotion, ajouterEquipe } from './equipeNotionLogique'
import { appliquerPlan } from './appliquerSynchro'

const absente = (error) => error?.code === 'PGRST205' || error?.code === '42P01'
const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const lienCarte = (pageId) => `https://www.notion.so/${String(pageId).replace(/-/g, '')}`

async function appelerNotion(corps) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Object.assign(new Error('Pas de réseau'), { code: 'hors-ligne' })
  const { data } = await supabase.auth.getSession()
  const reponse = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token ?? ''}` },
    body: JSON.stringify(corps),
  })
  const json = await reponse.json().catch(() => ({}))
  if (!reponse.ok) throw Object.assign(new Error(json.erreur ?? `HTTP ${reponse.status}`), { code: json.erreur ?? 'notion' })
  return json
}

const TAILLE_PAGE = 1000

// Supabase plafonne une lecture à 1000 lignes : on lit page après page, par
// identifiant croissant (« après le dernier lu ») et non par rang : une ligne
// supprimée entre deux pages décalerait les rangs et en ferait sauter une.
// `synchro` : lecture « fraîche ». Le service worker garde les réponses de la
// base (NetworkFirst, 6 s) ; un alias de colonne change l'adresse, et
// vite.config.js exclut ces adresses de la mémoire. Une synchronisation qui
// lirait du vieux annulerait les gestes.
async function lireTout(table, filtres = {}, { synchro = false } = {}) {
  const vues = new Set()
  const lignes = []
  let dernier = null
  for (;;) {
    let requete = supabase.from(table).select(synchro ? '*, synchro_id:id' : '*')
    for (const [colonne, valeur] of Object.entries(filtres)) requete = requete.eq(colonne, valeur)
    if (dernier != null) requete = requete.gt('id', dernier)
    const { data, error } = await requete.order('id').limit(TAILLE_PAGE)
    if (error) return { error, data: null }
    for (const l of data ?? []) {
      if (vues.has(l.id)) continue
      vues.add(l.id)
      if (synchro) delete l.synchro_id
      lignes.push(l)
    }
    if ((data ?? []).length < TAILLE_PAGE) return { error: null, data: lignes }
    dernier = data[data.length - 1].id
  }
}

export async function lireRegistre({ numero = null } = {}) {
  const { data, error } = await lireTout('notion_echeances', numero ? { numero } : {})
  if (absente(error)) return null
  if (error) throw error
  return data
}

// Une panne de lot ne perd pas les lots déjà écrits : chaque opération d'un
// lot manqué rend un échec, dans l'ordre.
async function ecrireCartes(operations) {
  const resultats = []
  for (let i = 0; i < operations.length; i += 10) {
    const lot = operations.slice(i, i + 10)
    try {
      const { resultats: r } = await appelerNotion({ action: 'ecrire', operations: lot })
      resultats.push(...lot.map((_, k) => r?.[k] ?? { ok: false, erreur: 'carte' }))
    } catch (e) {
      resultats.push(...lot.map(() => ({ ok: false, erreur: e.message })))
    }
  }
  return resultats
}

let chaine = Promise.resolve()
function avecVerrou(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('jga-notion', action)
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

// Équipe de chaque affaire, en fiches de la base « Equipe JGA ». Une lecture
// ratée ne bloque rien : les cartes partent sans équipe, complétées plus tard.
async function equipesDesAffaires(affaireId, membres) {
  if (!membres?.length) return new Map()
  let requete = supabase.from('affaire_collaborateurs').select('affaire_id, user_id, role')
  if (affaireId) requete = requete.eq('affaire_id', affaireId)
  const [collaborateurs, profils] = await Promise.all([requete, supabase.from('profiles').select('*').eq('type_compte', 'agence')])
  if (collaborateurs.error || profils.error) return new Map()
  return equipesNotion(collaborateurs.data ?? [], Object.fromEntries((profils.data ?? []).map((p) => [p.id, p])), membres)
}

/** Compare Notion et l'app, pour toute l'agence ou une affaire, et met les deux d'accord. */
export function synchroniser({ affaireId = null } = {}) {
  return avecVerrou(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { etat: 'hors-ligne' }
      let requeteAffaires = supabase.from('affaires').select('id, code_affaire, phase, synchro_id:id')
      if (affaireId) requeteAffaires = requeteAffaires.eq('id', affaireId)
      const { data: affairesLues, error: errAffaires } = await requeteAffaires
      if (errAffaires) return { etat: 'injoignable', erreurs: [errAffaires.message] }
      const affaires = (affairesLues ?? []).map((a) => { const { id, code_affaire, phase } = a; return { id, code_affaire, phase } })
      const numero = affaireId ? numeroAffaire(affaires[0]?.code_affaire) : null
      if (affaireId && !numero) return { etat: 'ok', lectureLe: new Date().toISOString(), changementsApp: 0, erreurs: [] }

      const lectureRegistre = await lireTout('notion_echeances', numero ? { numero } : {}, { synchro: true })
      if (absente(lectureRegistre.error)) return { etat: 'indisponible' }
      if (lectureRegistre.error) return { etat: 'injoignable', erreurs: [lectureRegistre.error.message] }
      const registre = lectureRegistre.data

      let notion
      // Lecture d'un planning : Notion ne rend que les cartes dont le titre
      // contient le numéro. Les cartes déjà liées sont redemandées par leur
      // identifiant : un numéro en cours de frappe ne les fait pas disparaître.
      const pages = numero ? [...new Set(registre.map((l) => l.page_id).filter(Boolean))] : undefined
      try { notion = await appelerNotion({ action: 'lire', numero, pages }) } catch (e) {
        if (e.code === 'notion-non-configure') return { etat: 'indisponible' }
        return { etat: e.code === 'hors-ligne' ? 'hors-ligne' : 'injoignable', erreurs: [e.message] }
      }

      const filtre = affaireId ? { affaire_id: affaireId } : {}
      const [chantier, etude] = await Promise.all([
        lireTout('planning_jalons', filtre, { synchro: true }), lireTout('planning_etude_jalons', filtre, { synchro: true }),
      ])
      if (chantier.error || etude.error) return { etat: 'injoignable', erreurs: [(chantier.error ?? etude.error).message] }
      const jalons = [
        ...chantier.data.filter((j) => j.date).map((j) => ({ ...j, origine: 'chantier', ancre: estAncre(j) })),
        ...etude.data.filter((j) => j.semaine && j.annee).map((j) => ({ ...j, origine: 'etude', ancre: estAncre(j) })),
      ]

      const plan = planSynchro({
        cartes: notion.cartes, lectureComplete: notion.complete, registre, jalons, affaires,
        references: notion.references, numero, aujourdhui: aujourdhui(), maintenant: new Date().toISOString(),
        nouvelId: () => crypto.randomUUID(),
      })
      ajouterEquipe(plan, { cartes: notion.cartes, registre, equipes: await equipesDesAffaires(affaireId, notion.equipe) })
      const { erreurs, changementsApp } = await appliquerPlan(plan, { base: supabase, ecrireCartes })
      return { etat: 'ok', lectureLe: new Date().toISOString(), changementsApp, erreurs, references: notion.references }
    } catch (e) {
      return { etat: e.code === 'hors-ligne' ? 'hors-ligne' : 'injoignable', erreurs: [e.message] }
    }
  })
}

// ─── Affaires absentes de l'app (calendrier des rendus) ──────────────────────
//
// Leur échéance n'existe que dans une carte et une ligne du registre.

export async function creerEcheanceNotionSeule({ numero, reference, libelle, date }) {
  const titre = titreCarte({ code: reference || numero, libelle, date })
  const [r] = await ecrireCartes([{ action: 'creer', titre, semaine: date }])
  if (!r?.ok) throw new Error(r?.erreur ?? 'Notion n’a pas créé la carte')
  const libelleRelu = lireCarte(titre, date).dates[0]?.libelle ?? libelle
  const { error } = await supabase.from('notion_echeances').insert({
    id: crypto.randomUUID(), page_id: r.id, rang: 0, numero, reference, affaire_id: null, origine: null, jalon_id: null,
    libelle: libelleRelu, libelle_app: null, date_synchro: date, texte_carte: titre, nb_dates: 1, notion_modifie_le: r.modifieLe,
  })
  if (error) throw error
}

export async function modifierEcheanceNotionSeule(ligne, { libelle, date }) {
  const lue = lireCarte(ligne.texte_carte, ligne.created_at)
  const d = lue.dates.find((x) => x.rang === ligne.rang) ?? lue.dates[0]
  let titre = ligne.texte_carte
  // Toujours avec l'année : sans elle, une date lointaine se relirait un an à côté
  if (date !== ligne.date_synchro) {
    titre = d
      ? remplacerDate(titre, { ...d, avecAnnee: true, anneeCourte: true }, date)
      : `${titre.trimEnd()} ${formatDateCarte(date)}`
  }
  if (libelle !== ligne.libelle) {
    titre = remplacerLibelle(titre, ligne.libelle, libellePourCarte(libelle))
      ?? titreCarte({ code: codeCarte(ligne.reference || ligne.numero), libelle, date })
  }
  // Le libellé gardé est celui que Notion relira dans ce titre, sinon le
  // passage suivant y verrait un renommage venu de Notion
  const finale = lireCarte(titre, ligne.created_at)
  const libelleRelu = (finale.dates.find((x) => x.rang === ligne.rang) ?? finale.dates[0])?.libelle ?? libelle
  const [r] = await ecrireCartes([{ action: 'modifier', pageId: ligne.page_id, titre, semaine: date }])
  if (!r?.ok) throw new Error(r?.erreur ?? 'Notion n’a pas modifié la carte')
  const { error } = await supabase.from('notion_echeances').update({ libelle: libelleRelu, date_synchro: date, texte_carte: titre, notion_modifie_le: r.modifieLe }).eq('id', ligne.id)
  if (error) throw error
}

export async function supprimerEcheanceNotionSeule(ligne) {
  const [r] = await ecrireCartes([{ action: 'corbeille', pageId: ligne.page_id }])
  if (!r?.ok) throw new Error(r?.erreur ?? 'Notion n’a pas retiré la carte')
  const { error } = await supabase.from('notion_echeances').delete().eq('id', ligne.id)
  if (error) throw error
}
