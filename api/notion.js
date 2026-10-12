/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Passeur vers Notion : échéances partagées ───────────────────────────────
//
// Seul détenteur du jeton Notion (variable Vercel NOTION_TOKEN) ; les
// identifiants des deux sources (Planning hebdomadaire, base des affaires)
// sont aussi des variables : le dépôt est public. Réservé à l'agence. Il ne
// décide de rien : l'app calcule (synchroNotionLogique.js) et lui demande de
// lire ou d'écrire. Conception : docs/superpowers/specs/2026-10-12-echeances-notion-design.md.

import { verifierAgence, jetonDe } from './_agence.js'
import {
  filtreEcheances, carteDepuisPage, referenceDepuisPage, proprietesCarte, proprietesNouvelleCarte,
} from '../src/shared/notion/notionApiLogique.js'

const NOTION = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const PAGES_MAX = 20            // 2 000 cartes : au-delà, la lecture est déclarée incomplète
const OPERATIONS_MAX = 10
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function appelNotion(jeton, chemin, { methode = 'GET', corps } = {}) {
  const envoyer = () => fetch(`${NOTION}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  let reponse = await envoyer()
  // Notion admet 3 requêtes par seconde : on attend ce qu'il demande, une fois
  if (reponse.status === 429) {
    await pause(Math.min(5000, 1000 * Number(reponse.headers.get('retry-after') ?? 1)))
    reponse = await envoyer()
  }
  return reponse
}

async function toutLire(jeton, source, filtre) {
  const pages = []
  let curseur
  for (let i = 0; i < PAGES_MAX; i++) {
    const r = await appelNotion(jeton, `/data_sources/${source}/query`, {
      methode: 'POST', corps: { page_size: 100, ...(filtre ? { filter: filtre } : {}), ...(curseur ? { start_cursor: curseur } : {}) },
    })
    if (!r.ok) throw Object.assign(new Error('notion'), { statut: r.status, detail: (await r.text().catch(() => '')).slice(0, 300) })
    const json = await r.json()
    pages.push(...(json.results ?? []))
    if (!json.has_more) return { pages, complete: true }
    curseur = json.next_cursor
  }
  return { pages, complete: false }
}

async function executer(jeton, source, op) {
  let r
  if (op.action === 'creer') {
    r = await appelNotion(jeton, '/pages', { methode: 'POST', corps: { parent: { type: 'data_source_id', data_source_id: source }, properties: proprietesNouvelleCarte(op) } })
  } else if (op.action === 'modifier') {
    r = await appelNotion(jeton, `/pages/${op.pageId}`, { methode: 'PATCH', corps: { properties: proprietesCarte(op) } })
  } else if (op.action === 'corbeille') {
    r = await appelNotion(jeton, `/pages/${op.pageId}`, { methode: 'PATCH', corps: { in_trash: true } })
    // Déjà partie : le but est atteint
    if (r.status === 404) return { ok: true, id: op.pageId, modifieLe: null }
  } else {
    return { ok: false, erreur: 'action' }
  }
  if (!r.ok) return { ok: false, erreur: `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}` }
  const page = await r.json()
  return { ok: true, id: page.id, modifieLe: page.last_edited_time ?? null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return }
  const url = process.env.VITE_SUPABASE_URL
  const cleSupabase = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cleSupabase) { res.status(500).json({ erreur: 'supabase-non-configure' }); return }
  const acces = await verifierAgence(url, cleSupabase, jetonDe(req))
  if (acces !== 200) { res.status(acces).json({ erreur: acces === 401 ? 'session' : 'agence-seule' }); return }

  const jeton = process.env.NOTION_TOKEN
  const planning = process.env.NOTION_PLANNING_SOURCE
  const atelier = process.env.NOTION_ATELIER_SOURCE
  if (!jeton || !planning || !atelier) { res.status(503).json({ erreur: 'notion-non-configure' }); return }

  const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  try {
    if (corps.action === 'lire') {
      const numero = /^\d{4}$/.test(corps.numero ?? '') ? corps.numero : null
      const [cartes, affaires] = await Promise.all([toutLire(jeton, planning, filtreEcheances(numero)), toutLire(jeton, atelier, null)])
      res.status(200).json({
        cartes: cartes.pages.filter((p) => !p.in_trash && !p.archived).map(carteDepuisPage),
        references: affaires.pages.map(referenceDepuisPage).filter((r) => r.numero),
        complete: cartes.complete,
      })
      return
    }
    if (corps.action === 'ecrire' && Array.isArray(corps.operations) && corps.operations.length <= OPERATIONS_MAX) {
      const resultats = []
      for (const op of corps.operations) {
        resultats.push(await executer(jeton, planning, op))
        await pause(350)
      }
      res.status(200).json({ resultats })
      return
    }
    res.status(400).json({ erreur: 'requete' })
  } catch (e) {
    res.status(502).json({ erreur: 'notion', statut: e?.statut ?? null, detail: e?.detail ?? String(e?.message ?? e).slice(0, 300) })
  }
}
