/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Proposer les étages et les pièces d'un plan ─────────────────────────────
//
// Le navigateur envoie l'image d'un plan (JPEG ≤ 2 000 px) et ses textes
// positionnés ; Claude rend étages et contours de pièces en JSON (schéma
// imposé). La clé Anthropic ne vit qu'ici (variable Vercel ANTHROPIC_API_KEY,
// organisation « JGA's Individual Org » : crédits mensuels du forfait Max).
// Consignes et schéma viennent de piecesIaLogique.js : depuis le navigateur,
// on n'envoie que des données. Réservé à l'agence.
//
// Durée : celle par défaut du projet (pas d'entrée dans vercel.json — au-delà
// de 60 s sans Fluid compute, Vercel refuse tout le déploiement). Un très
// grand étage pourrait demander de découper l'appel, un étage à la fois.

import Anthropic from '@anthropic-ai/sdk'
import { verifierAgence, jetonDe, noterConsommation } from './_agence.js'
import { construireDemandePieces, MODELE_PIECES } from '../src/modules/etude/etat-des-lieux/piecesIaLogique.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return }
  const url = process.env.VITE_SUPABASE_URL
  const cleSupabase = process.env.VITE_SUPABASE_ANON_KEY
  const cleAnthropic = process.env.ANTHROPIC_API_KEY
  if (!url || !cleSupabase) { res.status(500).json({ erreur: 'supabase-non-configure' }); return }

  const acces = await verifierAgence(url, cleSupabase, jetonDe(req))
  if (acces !== 200) { res.status(acces).json({ erreur: acces === 401 ? 'session' : 'agence-seule' }); return }
  if (!cleAnthropic) { res.status(503).json({ erreur: 'analyse-non-configuree' }); return }

  const corps = req.body ?? {}
  const { image, largeur, hauteur, textes, niveauUnique } = corps
  if (typeof image !== 'string' || !image || !(largeur > 0) || !(hauteur > 0)) { res.status(400).json({ erreur: 'demande' }); return }

  const client = new Anthropic({ apiKey: cleAnthropic })
  try {
    // En flux : la réponse (réflexion comprise) peut être longue sur un grand
    // étage, et une requête non suivie buterait sur les délais du SDK
    const message = await client.beta.messages.stream({
      model: MODELE_PIECES,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...construireDemandePieces({ image, largeur, hauteur, textes: Array.isArray(textes) ? textes : [], niveauUnique: !!niveauUnique }),
    }).finalMessage()
    // Compté avant tout contrôle : une réponse refusée ou tronquée se paie aussi
    await noterConsommation(url, cleSupabase, jetonDe(req), { fonction: 'edl-pieces', modele: message.model ?? MODELE_PIECES, usage: message.usage })
    if (message.stop_reason === 'refusal') { res.status(422).json({ erreur: 'refus' }); return }
    if (message.stop_reason === 'max_tokens') { res.status(502).json({ erreur: 'reponse-tronquee' }); return }
    const texte = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    res.status(200).json({ resultat: JSON.parse(texte) })
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      res.status(502).json({ erreur: 'anthropic', statut: e.status, detail: String(e.message).slice(0, 300) })
    } else {
      res.status(502).json({ erreur: 'reseau', detail: String(e?.message ?? e).slice(0, 300) })
    }
  }
}
