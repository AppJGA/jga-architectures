// ─── Remarques proposées par l'IA (navigateur) ───────────────────────────────
//
// Demande à api/analyser-visite les remarques des enregistrements pas encore
// analysés, puis les range dans le CR comme des remarques ordinaires —
// mêmes chemins que la saisie, donc mêmes règles (destinataire → partie VI
// ou VII, file hors ligne) — mais marquées `a_valider` (migration 058).

import { supabase } from '../../../../core/supabase/client'
import { contexteAnalyse, lireFlux, lirePropositions, coutAnalyse, remarquesDuCr, ecrituresValidation } from './analyseIaLogique'
import { texteTranscription } from './transcriptionLogique'
import { listerEnregistrements, ErreurTranscription } from './transcription'
import { sectionDeLaPartie } from '../rangerRemarque'
import { PARTIES_REMARQUES, champsDestinataire } from '../remarquesLogique'
import { STATUTS } from '../crLogique'

const MESSAGES = {
  'non-configuree': 'L’analyse n’est pas encore configurée (clé Anthropic à ajouter dans Vercel).',
  reseau: 'Pas de réseau : l’analyse demande une connexion. Réessayez une fois connecté.',
  session: 'Session expirée : reconnectez-vous pour lancer l’analyse.',
  vide: 'Rien à analyser : aucun enregistrement transcrit qui ne l’ait déjà été.',
}

export function messageAnalyse(err) {
  return MESSAGES[err?.code] ?? `L’analyse a échoué : ${err?.message ?? err}`
}

const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

async function appelerAnalyse(contexte) {
  const { data } = await supabase.auth.getSession()
  const jeton = data?.session?.access_token
  if (!jeton) throw new ErreurTranscription('session', 'session')
  let reponse
  try {
    reponse = await fetch('/api/analyser-visite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contexte }),
    })
  } catch (err) {
    throw new ErreurTranscription('reseau', err?.message ?? 'réseau')
  }
  if (!reponse.ok) {
    const json = await reponse.json().catch(() => null)
    if (!json || json.erreur === 'analyse-non-configuree') throw new ErreurTranscription('non-configuree', 'non configurée')
    if (json.erreur === 'session') throw new ErreurTranscription('session', 'session')
    throw new ErreurTranscription('refus', json.detail || json.erreur || `erreur ${reponse.status}`)
  }
  // Réponse en flux : lue jusqu'au bout, puis recollée
  const lecteur = reponse.body.getReader()
  const decodeur = new TextDecoder()
  let texte = ''
  for (;;) {
    const { value, done } = await lecteur.read()
    if (done) break
    texte += decodeur.decode(value, { stream: true })
  }
  const flux = lireFlux(texte)
  if (flux.erreur) throw new ErreurTranscription('refus', flux.erreur)
  return flux
}

/**
 * Analyse les enregistrements de ce CR qui ne l'ont pas encore été et range
 * les propositions dans le CR.
 * @returns { nombre, cout }
 */
export async function proposerRemarques({ cr, affaire, lots = [], interlocuteurs = [], zones = [], sections = [], ops }) {
  const aAnalyser = (await listerEnregistrements(cr.id)).filter((e) => !e.analyse_le && texteTranscription(e.segments))
  if (aAnalyser.length === 0) throw new ErreurTranscription('vide', 'vide')
  const transcription = aAnalyser
    .map((e) => `[Enregistrement de ${heure(e.debut)}]\n${texteTranscription(e.segments)}`)
    .join('\n\n')

  const { contexte, references } = contexteAnalyse({
    affaire, cr, transcription, lots, interlocuteurs, zones, remarques: remarquesDuCr(sections),
  })
  const flux = await appelerAnalyse(contexte)
  const propositions = lirePropositions(flux.json, references)

  // Les parties VI / VII peuvent manquer encore : créées une seule fois
  const sectionsCreees = new Map()
  const sectionPour = async (cle) => {
    const type = cle?.startsWith('interlo:') ? 'equipe' : 'entreprises'
    if (sectionsCreees.has(type)) return sectionsCreees.get(type)
    let id = cle ? await sectionDeLaPartie(ops, sections, cle) : sections.find((s) => s.type_section === type)?.id
    if (!id) {
      const partie = PARTIES_REMARQUES.find((p) => p.type === type)
      id = await ops.addSection({ numero_romain: partie.numero_romain, titre: partie.titre, type_section: type })
    }
    sectionsCreees.set(type, id)
    return id
  }

  const enregistrementId = aAnalyser[0].id
  for (const p of propositions) {
    const base = {
      description: p.texte, statut: p.statut, est_clos: STATUTS.find((st) => st.code === p.statut)?.clos ?? false,
      date_echeance: p.echeance, date_note: cr.date_reunion, est_nouveau: true,
      a_valider: true, ia_extrait: p.extrait || null, enregistrement_id: enregistrementId,
      ...(p.zoneId ? { zone_id: p.zoneId } : {}),
    }
    if (p.type === 'suite') {
      await ops.addSousRemarque(p.remarqueId, { ...base, ia_clore_origine: p.cloreOrigine })
    } else {
      await ops.addSectionRemarque(await sectionPour(p.destinataire), { ...base, ...champsDestinataire(p.destinataire) })
    }
  }

  const cout = coutAnalyse(flux.usage)
  const maintenant = new Date().toISOString()
  for (const [i, e] of aAnalyser.entries()) {
    await supabase.from('cr_enregistrements')
      .update({ analyse_le: maintenant, cout_estime: i === 0 ? cout : 0 }).eq('id', e.id)
  }
  return { nombre: propositions.length, cout }
}

/**
 * Valide une proposition. Sans destinataire, rien n'est écrit : l'appelant
 * ouvre le panneau de modification pour le choisir.
 * @returns true si validée, false s'il faut d'abord la compléter
 */
export async function validerProposition(rem, ops, { sectionType } = {}) {
  const { aCompleter, ecritures } = ecrituresValidation(rem, { sectionType })
  if (aCompleter) return false
  for (const { id, champs } of ecritures) await ops.updateRemarque(id, champs)
  return true
}

export function ecarterProposition(rem, ops) {
  return ops.deleteRemarque(rem.id)
}
