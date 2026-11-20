/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Analyser une pièce de l'état des lieux ──────────────────────────────────
//
// Le navigateur envoie une pièce (nom, numéro, surface, HSP lue), sa fiche
// actuelle et sa frise — gestes du journal et phrases transcrites,
// intercalés par leur heure — et, avec la migration 084, ses liaisons et
// cotes, avec la 085 ses murs touchés ; Claude rend la fiche de la pièce,
// les éléments relevés et, s'il y a lieu, liaisons, valeurs de cotes et
// finitions de murs proposées, en JSON (schéma imposé).
// La clé Anthropic ne vit qu'ici (variable Vercel ANTHROPIC_API_KEY,
// organisation « JGA's Individual Org » : crédits mensuels du forfait Max).
// Consignes et schéma viennent d'analyseEdlLogique.js : depuis le navigateur,
// on n'envoie que des données. Réservé à l'agence.
//
// Durée : celle par défaut du projet (pas d'entrée dans vercel.json — au-delà
// de 60 s sans Fluid compute, Vercel refuse tout le déploiement).

import Anthropic from '@anthropic-ai/sdk'
import { verifierAgence, jetonDe, noterConsommation } from './_agence.js'
import {
  construireDemandeAnalyse, erreurDemandeAnalyse, MODELE_ANALYSE,
} from '../src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js'

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
  const motif = erreurDemandeAnalyse(corps)
  if (motif) { res.status(400).json({ erreur: 'demande', detail: motif }); return }

  const client = new Anthropic({ apiKey: cleAnthropic })
  try {
    // En flux, comme les autres appels de l'état des lieux : une longue pièce
    // et la réflexion qui suit dépasseraient les délais d'une requête simple
    const message = await client.beta.messages.stream({
      model: MODELE_ANALYSE,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...construireDemandeAnalyse({
        piece: corps.piece,
        lignes: corps.lignes,
        dejaReleves: Array.isArray(corps.dejaReleves) ? corps.dejaReleves : [],
        ficheActuelle: corps.ficheActuelle ?? null,
        // Liaisons et cotes (084) : absentes, consignes et schéma d'avant
        traces: Array.isArray(corps.tracesPiece) ? corps.tracesPiece : null,
        // Murs touchés (085) : absents, consignes et schéma de la 084
        finitions: corps.finitionsMurs === true,
      }),
    }).finalMessage()
    // Compté avant tout contrôle : une réponse refusée ou tronquée se paie aussi
    await noterConsommation(url, cleSupabase, jetonDe(req), { fonction: 'analyser-edl', modele: message.model ?? MODELE_ANALYSE, usage: message.usage })
    if (message.stop_reason === 'refusal') { res.status(422).json({ erreur: 'refus' }); return }
    if (message.stop_reason === 'max_tokens') { res.status(502).json({ erreur: 'reponse-tronquee' }); return }
    const texte = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    let resultat
    try {
      resultat = JSON.parse(texte)
    } catch {
      // Distinct d'une panne de réseau : relancer ne sert sans doute à rien
      res.status(502).json({ erreur: 'reponse-illisible', detail: texte.slice(0, 300) })
      return
    }
    res.status(200).json({ resultat })
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      res.status(502).json({ erreur: 'anthropic', statut: e.status, detail: String(e.message).slice(0, 300) })
    } else {
      res.status(502).json({ erreur: 'reseau', detail: String(e?.message ?? e).slice(0, 300) })
    }
  }
}
