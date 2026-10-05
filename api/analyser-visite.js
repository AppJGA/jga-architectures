/* global process -- fonction serveur Vercel (Edge), pas du code navigateur */
// ─── Proposer les remarques d'une visite enregistrée ─────────────────────────
//
// Le navigateur envoie le contexte de la visite (transcription, destinataires,
// remarques déjà notées) ; on interroge Claude et on lui renvoie la réponse
// au fil de l'eau. La clé Anthropic ne vit qu'ici (variable Vercel
// ANTHROPIC_API_KEY, compte personnel de Victor).
//
// Les consignes et la forme de la réponse sont fixées ici, à partir de
// analyseIaLogique.js : depuis le navigateur, on ne peut envoyer que des
// données, pas réécrire ce que l'on demande au modèle.
//
// Fonction « Edge » : la réponse commence en quelques secondes et se
// poursuit en flux, si bien qu'une longue réunion ne bute pas sur la durée
// maximale d'une fonction classique.
//
// Réservé à l'agence : session Supabase vérifiée, puis `est_agence()`.

import { construireDemande, MODELE_ANALYSE, TAILLE_MAX_CONTEXTE } from '../src/modules/chantier/comptes-rendus/enregistrement/analyseIaLogique.js'

export const config = { runtime: 'edge' }

const ANTHROPIC = 'https://api.anthropic.com/v1/messages'

const json = (statut, corps) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })

async function verifierAgence(url, cle, jeton) {
  if (!jeton) return 401
  const entetes = { apikey: cle, Authorization: `Bearer ${jeton}` }
  const utilisateur = await fetch(`${url}/auth/v1/user`, { headers: entetes })
  if (!utilisateur.ok) return 401
  const agence = await fetch(`${url}/rest/v1/rpc/est_agence`, {
    method: 'POST', headers: { ...entetes, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!agence.ok || (await agence.json()) !== true) return 403
  return 200
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { erreur: 'methode' })
  const url = process.env.VITE_SUPABASE_URL
  const cleSupabase = process.env.VITE_SUPABASE_ANON_KEY
  const cleAnthropic = process.env.ANTHROPIC_API_KEY
  if (!url || !cleSupabase) return json(500, { erreur: 'supabase-non-configure' })

  const jeton = String(request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const acces = await verifierAgence(url, cleSupabase, jeton)
  if (acces !== 200) return json(acces, { erreur: acces === 401 ? 'session' : 'agence-seule' })
  if (!cleAnthropic) return json(503, { erreur: 'analyse-non-configuree' })

  const texte = await request.text()
  if (texte.length > TAILLE_MAX_CONTEXTE) return json(413, { erreur: 'trop-gros' })
  let contexte
  try { contexte = JSON.parse(texte).contexte } catch { return json(400, { erreur: 'contexte' }) }
  if (!contexte?.transcription) return json(400, { erreur: 'transcription-vide' })

  let reponse
  try {
    reponse = await fetch(ANTHROPIC, {
      method: 'POST',
      headers: { 'x-api-key': cleAnthropic, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELE_ANALYSE, max_tokens: 8000, stream: true, ...construireDemande(contexte) }),
    })
  } catch (e) {
    return json(502, { erreur: 'reseau', detail: String(e?.message ?? e).slice(0, 300) })
  }
  if (!reponse.ok) {
    const detail = (await reponse.text().catch(() => '')).slice(0, 300)
    return json(502, { erreur: 'anthropic', statut: reponse.status, detail })
  }
  return new Response(reponse.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } })
}
