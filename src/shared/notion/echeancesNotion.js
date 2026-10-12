// ─── Échéances partagées avec Notion : lectures, écritures, orchestration ────
//
// `synchroniser` lit Notion par le passeur (api/notion.js), lit le registre et
// les échéances, calcule le plan (synchroNotionLogique.js) puis l'applique :
// registre retiré, échéances, registre écrit, cartes. Une seule
// synchronisation à la fois sur l'appareil (Web Locks). Sans réseau, sans la
// migration 071 ou sans Notion, rien ne part et rien ne crie : le passage
// suivant rattrape (conception, §5.4).

import { supabase } from '../../core/supabase/client'
import { estAncre } from '../planning/ancrage'
import { CHAMPS_DETACHE } from '../../modules/chantier/planning/jalonsAncres'
import { CHAMPS_DETACHE_ETUDE } from '../../modules/etude/planning/jalonsAncresEtude'
import { titreCarte, lireCarte, remplacerDate, remplacerLibelle, libellePourCarte } from './echeancesNotionLogique'
import { numeroAffaire, codeCarte, COULEUR_NOTION } from './codesAffaire'
import { planSynchro } from './synchroNotionLogique'

const TABLE = { etude: 'planning_etude_jalons', chantier: 'planning_jalons' }
const DETACHE = { etude: CHAMPS_DETACHE_ETUDE, chantier: CHAMPS_DETACHE }
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

// Supabase plafonne une lecture à 1000 lignes : on lit page après page
async function lireTout(table, filtres = {}) {
  const lignes = []
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    let requete = supabase.from(table).select('*')
    for (const [colonne, valeur] of Object.entries(filtres)) requete = requete.eq(colonne, valeur)
    const { data, error } = await requete.order('id').range(debut, debut + TAILLE_PAGE - 1)
    if (error) return { error, data: null }
    lignes.push(...(data ?? []))
    if ((data ?? []).length < TAILLE_PAGE) return { error: null, data: lignes }
  }
}

export async function lireRegistre({ numero = null } = {}) {
  const { data, error } = await lireTout('notion_echeances', numero ? { numero } : {})
  if (absente(error)) return null
  if (error) throw error
  return data
}

async function ecrireCartes(operations) {
  const resultats = []
  if (!operations.length) return resultats
  for (let i = 0; i < operations.length; i += 10) {
    const { resultats: r } = await appelerNotion({ action: 'ecrire', operations: operations.slice(i, i + 10) })
    resultats.push(...r)
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
  if (plan.registre.supprimer.length) {
    const { error } = await supabase.from('notion_echeances').delete().in('id', plan.registre.supprimer)
    if (error) erreurs.push(error.message)
  }

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
      reponse = await supabase.from(table).update({ ...champs, ...(op.decrocher ? DETACHE[op.origine] : {}) }).eq('id', op.id)
    } else if (op.action === 'renommer') {
      reponse = await supabase.from(table).update({ label: op.label }).eq('id', op.id)
    } else {
      reponse = await supabase.from(table).delete().eq('id', op.id)
    }
    if (reponse.error) erreurs.push(reponse.error.message)
    else changementsApp++
  }

  const echecsCreation = new Set(plan.jalons.filter((o) => o.action === 'creer' && !jalonCree.has(o.ligneId)).map((o) => o.ligneId))
  const reservees = new Set()
  const existantes = []
  for (const { ligne, nouvelle } of plan.registre.ecrire) {
    // Échéance pas créée : la ligne attend le passage suivant
    if (echecsCreation.has(ligne.id)) continue
    const l = jalonCree.has(ligne.id) ? { ...ligne, jalon_id: jalonCree.get(ligne.id) } : ligne
    if (!nouvelle) { existantes.push(l); continue }
    const { error } = await supabase.from('notion_echeances').insert(l)
    // 23505 : un autre appareil a déjà réservé cette échéance ; il crée la carte
    if (error && error.code !== '23505') erreurs.push(error.message)
    if (!error) reservees.add(l.id)
  }
  if (existantes.length) {
    const { error } = await supabase.from('notion_echeances').upsert(existantes, { onConflict: 'id' })
    if (error) erreurs.push(error.message)
    else existantes.forEach((l) => reservees.add(l.id))
  }

  const cartes = plan.cartes.filter((c) => c.action !== 'creer' || reservees.has(c.ligneId))
  if (cartes.length) {
    const resultats = await ecrireCartes(cartes)
    for (let i = 0; i < cartes.length; i++) {
      const c = cartes[i]
      const r = resultats[i]
      if (!r?.ok) { erreurs.push(r?.erreur ?? 'carte'); continue }
      if (c.action === 'creer') {
        const { error } = await supabase.from('notion_echeances').update({ page_id: r.id, notion_modifie_le: r.modifieLe }).eq('id', c.ligneId)
        if (error) erreurs.push(error.message)
      }
    }
  }
  return { erreurs, changementsApp }
}

/** Compare Notion et l'app, pour toute l'agence ou une affaire, et met les deux d'accord. */
export function synchroniser({ affaireId = null } = {}) {
  return avecVerrou(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { etat: 'hors-ligne' }
    let requeteAffaires = supabase.from('affaires').select('id, code_affaire, phase')
    if (affaireId) requeteAffaires = requeteAffaires.eq('id', affaireId)
    const { data: affaires, error: errAffaires } = await requeteAffaires
    if (errAffaires) return { etat: 'injoignable', erreurs: [errAffaires.message] }
    const numero = affaireId ? numeroAffaire(affaires?.[0]?.code_affaire) : null
    if (affaireId && !numero) return { etat: 'ok', lectureLe: new Date().toISOString(), changementsApp: 0, erreurs: [] }

    let registre
    try { registre = await lireRegistre({ numero }) } catch (e) { return { etat: 'injoignable', erreurs: [e.message] } }
    if (registre === null) return { etat: 'indisponible' }

    let notion
    try { notion = await appelerNotion({ action: 'lire', numero }) } catch (e) {
      return { etat: e.code === 'hors-ligne' ? 'hors-ligne' : 'injoignable', erreurs: [e.message] }
    }

    const lire = (table) => lireTout(table, affaireId ? { affaire_id: affaireId } : {})
    const [chantier, etude] = await Promise.all([lire('planning_jalons'), lire('planning_etude_jalons')])
    if (chantier.error || etude.error) return { etat: 'injoignable', erreurs: [(chantier.error ?? etude.error).message] }
    const jalons = [
      ...(chantier.data ?? []).filter((j) => j.date).map((j) => ({ ...j, origine: 'chantier', ancre: estAncre(j) })),
      ...(etude.data ?? []).filter((j) => j.semaine && j.annee).map((j) => ({ ...j, origine: 'etude', ancre: estAncre(j) })),
    ]

    const plan = planSynchro({
      cartes: notion.cartes, lectureComplete: notion.complete, registre, jalons, affaires: affaires ?? [],
      references: notion.references, numero, aujourdhui: aujourdhui(), nouvelId: () => crypto.randomUUID(),
    })
    try {
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
  const { error } = await supabase.from('notion_echeances').insert({
    id: crypto.randomUUID(), page_id: r.id, rang: 0, numero, reference, affaire_id: null, origine: null, jalon_id: null,
    libelle, libelle_app: null, date_synchro: date, texte_carte: titre, nb_dates: 1, notion_modifie_le: r.modifieLe,
  })
  if (error) throw error
}

export async function modifierEcheanceNotionSeule(ligne, { libelle, date }) {
  const lue = lireCarte(ligne.texte_carte, ligne.created_at)
  const d = lue.dates.find((x) => x.rang === ligne.rang) ?? lue.dates[0]
  let titre = ligne.texte_carte
  if (d && date !== ligne.date_synchro) {
    titre = remplacerDate(titre, d, date)
    // Sans année, la date se relirait au plus près de la création de la carte :
    // une date lointaine reviendrait un an à côté. On l'écrit alors avec son année.
    const relue = lireCarte(titre, ligne.created_at)
    if ((relue.dates.find((x) => x.rang === d.rang) ?? relue.dates[0])?.date !== date) {
      titre = remplacerDate(ligne.texte_carte, { ...d, avecAnnee: true, anneeCourte: true }, date)
    }
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
