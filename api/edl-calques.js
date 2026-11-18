/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Choisir le traitement de chaque calque d'un étage ──────────────────────
//
// Le navigateur envoie, pour chaque calque d'un étage de DXF, ses chiffres,
// quelques textes et un extrait dessiné seul (JPEG 384 px), plus un aperçu de
// l'étage (JPEG 1 024 px) ; Claude rend un traitement par calque en JSON
// (schéma imposé). La clé Anthropic ne vit qu'ici (variable Vercel
// ANTHROPIC_API_KEY, organisation « JGA's Individual Org » : crédits mensuels
// du forfait Max). Consignes et schéma viennent de calquesIaLogique.js :
// depuis le navigateur, on n'envoie que des données. Réservé à l'agence.
//
// Durée : celle par défaut du projet (pas d'entrée dans vercel.json — au-delà
// de 60 s sans Fluid compute, Vercel refuse tout le déploiement).

import Anthropic from '@anthropic-ai/sdk'
import { verifierAgence, jetonDe } from './_agence.js'
import { construireDemandeCalques, erreurDemandeCalques, MODELE_CALQUES } from '../src/modules/etude/etat-des-lieux/calquesIaLogique.js'

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
  const motif = erreurDemandeCalques(corps)
  if (motif) { res.status(400).json({ erreur: 'demande', detail: motif }); return }

  const client = new Anthropic({ apiKey: cleAnthropic })
  try {
    // En flux, comme les autres appels de l'état des lieux : soixante images
    // et la réflexion qui suit dépassent vite les délais d'une requête simple
    const message = await client.beta.messages.stream({
      model: MODELE_CALQUES,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...construireDemandeCalques({ calques: corps.calques, apercu: corps.apercu ?? null }),
    }).finalMessage()
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
