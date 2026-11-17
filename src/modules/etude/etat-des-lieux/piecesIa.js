// Appel des fonctions serveur de l'état des lieux depuis le navigateur
// (compte agence, réseau requis)

import { supabase } from '../../../core/supabase/client'
import { lirePropositionsPieces } from './piecesIaLogique'

export class ErreurPiecesIa extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const MESSAGES = {
  'analyse-non-configuree': 'L’analyse par Claude n’est pas configurée (clé ANTHROPIC_API_KEY dans Vercel).',
  session: 'Session expirée : reconnectez-vous.',
  'agence-seule': 'Réservé aux comptes de l’agence.',
  refus: 'Claude n’a pas accepté d’analyser ce plan.',
  'reponse-tronquee': 'La réponse de Claude était trop longue pour cet étage.',
}

// Appel d'une fonction serveur de l'état des lieux (pièces, relecture) : même
// session vérifiée, mêmes messages d'erreur
export async function appelerClaude(route, demande) {
  if (!navigator.onLine) throw new ErreurPiecesIa('reseau', 'Pas de réseau.')
  const { data } = await supabase.auth.getSession()
  const jeton = data?.session?.access_token
  if (!jeton) throw new ErreurPiecesIa('session', MESSAGES.session)
  let reponse
  try {
    reponse = await fetch(route, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  } catch (err) {
    throw new ErreurPiecesIa('reseau', `Réseau : ${err?.message ?? err}`)
  }
  const json = await reponse.json().catch(() => null)
  if (!reponse.ok) {
    throw new ErreurPiecesIa(json?.erreur ?? 'erreur', MESSAGES[json?.erreur] ?? `L’analyse a échoué (${json?.detail ?? reponse.status}).`)
  }
  return json?.resultat
}

export async function proposerPiecesIa(demande) {
  const resultat = await appelerClaude('/api/edl-pieces', demande)
  return lirePropositionsPieces(resultat, { largeur: demande.largeur, hauteur: demande.hauteur })
}
