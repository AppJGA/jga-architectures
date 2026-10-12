// ─── Échéances partagées avec Notion : lectures, écritures, orchestration ────
//
// `synchroniser` lit Notion par le passeur (api/notion.js), lit le registre et
// les échéances, calcule le plan (synchroNotionLogique.js) puis l'applique :
// échéances, réservations (nouvelles lignes), cartes, puis le reste du
// registre : une ligne dont l'écriture liée a échoué reste telle quelle, pour
// que le passage suivant reprenne la même décision. Une seule
// synchronisation à la fois sur l'appareil (Web Locks). Sans réseau, sans la
// migration 071 ou sans Notion, rien ne part et rien ne crie : le passage
// suivant rattrape (conception, §5.4).

import { supabase } from '../../core/supabase/client'
import { estAncre } from '../planning/ancrage'
import { CHAMPS_DETACHE } from '../../modules/chantier/planning/jalonsAncres'
import { CHAMPS_DETACHE_ETUDE } from '../../modules/etude/planning/jalonsAncresEtude'
import { titreCarte, lireCarte, remplacerDate, remplacerLibelle, libellePourCarte, formatDateCarte } from './echeancesNotionLogique'
import { numeroAffaire, codeCarte, COULEUR_NOTION } from './codesAffaire'
import { planSynchro } from './synchroNotionLogique'

const TABLE = { etude: 'planning_etude_jalons', chantier: 'planning_jalons' }
const DETACHE = { etude: CHAMPS_DETACHE_ETUDE, chantier: CHAMPS_DETACHE }
const absente = (error) => error?.code === 'PGRST205' || error?.code === '42P01'
const BAIL_MS = 2 * 60 * 1000
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

// Supabase plafonne une lecture à 1000 lignes : on lit page après page.
// `synchro` : lecture « fraîche ». Le service worker garde les réponses de la
// base (NetworkFirst, 6 s) et deux pages `.range` partagent une adresse ; un
// alias de colonne change l'adresse, et vite.config.js exclut ces adresses de
// la mémoire. Une synchronisation qui lirait du vieux annulerait les gestes.
async function lireTout(table, filtres = {}, { synchro = false } = {}) {
  const vues = new Set()
  const lignes = []
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    let requete = supabase.from(table).select(synchro ? '*, synchro_id:id' : '*')
    for (const [colonne, valeur] of Object.entries(filtres)) requete = requete.eq(colonne, valeur)
    const { data, error } = await requete.order('id').range(debut, debut + TAILLE_PAGE - 1)
    if (error) return { error, data: null }
    for (const l of data ?? []) {
      if (vues.has(l.id)) continue
      vues.add(l.id)
      if (synchro) delete l.synchro_id
      lignes.push(l)
    }
    if ((data ?? []).length < TAILLE_PAGE) return { error: null, data: lignes }
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

async function appliquer(plan) {
  const erreurs = []
  let changementsApp = 0
  const echecs = new Set()   // lignes du registre dont une écriture liée a échoué : on n'y touche pas

  // (i) Échéances des plannings
  const jalonCree = new Map()   // ligneId → id de l'échéance créée
  for (const op of plan.jalons) {
    const table = TABLE[op.origine]
    let reponse
    if (op.action === 'creer') {
      const champs = { affaire_id: op.affaire_id, label: op.label, couleur: COULEUR_NOTION, ordre: 0 }
      if (op.origine === 'etude') Object.assign(champs, { semaine: op.semaine, annee: op.annee })
      else champs.date = op.date
      reponse = await supabase.from(table).insert(champs).select('id').single()
      if (!reponse.error) jalonCree.set(op.ligneId, reponse.data.id)
    } else if (op.action === 'deplacer') {
      const champs = op.origine === 'etude' ? { semaine: op.semaine, annee: op.annee } : { date: op.date }
      reponse = await supabase.from(table).update({ ...champs, ...(op.decrocher ? DETACHE[op.origine] : {}) }).eq('id', op.id).select('id')
    } else if (op.action === 'renommer') {
      reponse = await supabase.from(table).update({ label: op.label }).eq('id', op.id).select('id')
    } else {
      reponse = await supabase.from(table).delete().eq('id', op.id).select('id')
    }
    // Un refus RLS ne rend pas d'erreur : seule une ligne rendue prouve l'écriture
    const touchee = op.action === 'creer' ? !reponse.error : (reponse.data?.length ?? 0) > 0
    if (reponse.error) erreurs.push(reponse.error.message)
    if (touchee) changementsApp++
    else if (op.action !== 'supprimer' || reponse.error) { if (op.ligneId != null) echecs.add(op.ligneId) }
  }

  const ligneAvecJalon = (ligne) => (jalonCree.has(ligne.id) ? { ...ligne, jalon_id: jalonCree.get(ligne.id) } : ligne)

  // (ii) Réservations : les lignes nouvelles, avant toute carte
  const reservees = new Set()
  const existantes = []
  for (const { ligne, nouvelle } of plan.registre.ecrire) {
    if (echecs.has(ligne.id)) continue
    const l = ligneAvecJalon(ligne)
    if (!nouvelle) { existantes.push(l); continue }
    const { error } = await supabase.from('notion_echeances').insert(l)
    // 23505 : un autre appareil a déjà réservé cette échéance ; il crée la carte
    if (error && error.code !== '23505') erreurs.push(error.message)
    if (!error) reservees.add(l.id)
  }

  // (iii) Cartes. Une carte à créer exige une ligne qu'on vient d'insérer ou
  // une ligne en attente prise à bail (deux minutes) : sans cela, deux
  // appareils créeraient chacun la leur.
  const ecrites = new Map(existantes.map((l) => [l.id, l]))
  const bailPris = new Set()
  const operations = []
  for (const c of plan.cartes) {
    if (c.action !== 'creer') { operations.push(c); continue }
    if (echecs.has(c.ligneId) || echecsCreation(plan, jalonCree, c.ligneId)) continue
    if (reservees.has(c.ligneId)) { operations.push(c); continue }
    const champs = ecrites.get(c.ligneId) ?? { texte_carte: c.titre }
    const sansId = { ...champs }
    delete sansId.id
    const limite = new Date(Date.now() - BAIL_MS).toISOString()
    const { data, error } = await supabase.from('notion_echeances').update(sansId).eq('id', c.ligneId).is('page_id', null).lt('updated_at', limite).select('id')
    if (error) { erreurs.push(error.message); continue }
    if (data?.length === 1) { bailPris.add(c.ligneId); operations.push(c) }
  }
  const resultats = operations.length ? await ecrireCartes(operations) : []
  const crees = []
  operations.forEach((c, i) => {
    const r = resultats[i]
    if (!r?.ok) {
      erreurs.push(r?.erreur ?? 'carte')
      if (c.action === 'creer') echecs.add(c.ligneId)
      else (c.ligneIds ?? []).forEach((id) => echecs.add(id))
    } else if (c.action === 'creer') crees.push({ c, r })
  })

  // (iv) Le reste du registre, sauf les lignes dont une écriture liée a échoué
  const aSupprimer = plan.registre.supprimer.filter((id) => !echecs.has(id))
  if (aSupprimer.length) {
    const { error } = await supabase.from('notion_echeances').delete().in('id', aSupprimer)
    if (error) erreurs.push(error.message)
  }
  const aMettreAJour = existantes.filter((l) => !echecs.has(l.id) && !bailPris.has(l.id)
    && !plan.cartes.some((c) => c.action === 'creer' && c.ligneId === l.id))
  if (aMettreAJour.length) {
    const { error } = await supabase.from('notion_echeances').upsert(aMettreAJour, { onConflict: 'id' })
    if (error) erreurs.push(error.message)
  }

  // (v) Adresse des cartes créées : seulement si la ligne attend encore la sienne
  for (const { c, r } of crees) {
    const { data, error } = await supabase.from('notion_echeances').update({ page_id: r.id, notion_modifie_le: r.modifieLe })
      .eq('id', c.ligneId).is('page_id', null).select('id')
    if (error) { erreurs.push(error.message); continue }
    if (!data?.length) {
      // Un autre appareil a gagné : la carte qu'on vient de créer est de trop
      const [retrait] = await ecrireCartes([{ action: 'corbeille', pageId: r.id }])
      if (!retrait?.ok) erreurs.push(retrait?.erreur ?? 'carte en double')
    }
  }
  return { erreurs, changementsApp }
}

// Création d'échéance ratée : sa ligne n'a pas d'échéance, donc pas de carte
const echecsCreation = (plan, jalonCree, ligneId) =>
  plan.jalons.some((o) => o.action === 'creer' && o.ligneId === ligneId) && !jalonCree.has(ligneId)

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
      try { notion = await appelerNotion({ action: 'lire', numero }) } catch (e) {
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
        references: notion.references, numero, aujourdhui: aujourdhui(), nouvelId: () => crypto.randomUUID(),
      })
      const { erreurs, changementsApp } = await appliquer(plan)
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
