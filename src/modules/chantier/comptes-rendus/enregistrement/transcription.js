// ─── Transcription des enregistrements de visite (navigateur) ────────────────
//
// Chaque morceau rangé sur l'appareil part à `api/transcrire` (qui seul
// détient la clé Mistral) ; le texte rendu s'ajoute à la ligne
// `cr_enregistrements` (migration 057), puis le morceau s'efface de
// l'appareil. Sans réseau, rien ne se perd : la file repart au retour.

import { supabase } from '../../../../core/supabase/client'
import { fusionnerSegment } from './transcriptionLogique'
import { morceauxEnAttente, effacerMorceau, marquerEchec, effacerEnregistrement } from './audioLocal'

// Au-delà, un morceau que Mistral refuse n'est plus retenté : il reste visible
export const ECHECS_MAX = 3

export class ErreurTranscription extends Error {
  /** @param code 'non-configuree' | 'reseau' | 'refus' | 'session' */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const MESSAGES = {
  'non-configuree': 'La transcription n’est pas encore configurée (clé Mistral à ajouter dans Vercel). Les enregistrements attendent sur l’appareil.',
  reseau: 'Pas de réseau : les morceaux attendent sur l’appareil et partiront au retour du réseau.',
  session: 'Session expirée : reconnectez-vous pour transcrire.',
}

export function messageTranscription(err) {
  return MESSAGES[err?.code] ?? `Transcription refusée : ${err?.message ?? err}`
}

// Un en-tête HTTP ne peut pas être très long : le vocabulaire est rogné
function enteteVocabulaire(vocabulaire = []) {
  const termes = [...vocabulaire]
  let code = encodeURIComponent(JSON.stringify(termes))
  while (code.length > 4000 && termes.length) { termes.pop(); code = encodeURIComponent(JSON.stringify(termes)) }
  return code
}

async function appelerTranscription({ corps = null, type = '', chemin = null, vocabulaire = [] }) {
  const { data } = await supabase.auth.getSession()
  const jeton = data?.session?.access_token
  if (!jeton) throw new ErreurTranscription('session', 'session')
  let reponse
  try {
    reponse = await fetch(`/api/transcrire${chemin ? `?chemin=${encodeURIComponent(chemin)}` : ''}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/octet-stream',
        'X-Type-Audio': type,
        'X-Vocabulaire': enteteVocabulaire(vocabulaire),
      },
      body: corps,
    })
  } catch (err) {
    throw new ErreurTranscription('reseau', err?.message ?? 'réseau')
  }
  const json = await reponse.json().catch(() => null)
  if (reponse.ok && json) return String(json.texte ?? '')
  // Sans fonction serveur (développement local), la réponse n'est pas du JSON
  if (!json || json.erreur === 'transcription-non-configuree') throw new ErreurTranscription('non-configuree', 'non configurée')
  if (json.erreur === 'session') throw new ErreurTranscription('session', 'session')
  if (json.erreur === 'reseau') throw new ErreurTranscription('reseau', json.detail ?? 'réseau')
  throw new ErreurTranscription('refus', json.detail || json.erreur || `erreur ${reponse.status}`)
}

/** Ajoute le texte d'un morceau à son enregistrement ; la ligne naît au premier. */
export async function enregistrerSegment(enregistrement, segment) {
  const { data, error } = await supabase.from('cr_enregistrements').select('segments').eq('id', enregistrement.id).maybeSingle()
  if (error) throw error
  const segments = fusionnerSegment(data?.segments ?? [], segment)
  const duree_s = Math.round(segments.reduce((n, s) => n + (Number(s.duree_s) || 0), 0))
  const { error: erreur } = await supabase.from('cr_enregistrements').upsert({
    ...enregistrement, segments, duree_s, statut: 'transcription', erreur: null,
  })
  if (erreur) throw erreur
}

// Une seule file à la fois par CR : le morceau suivant attend le précédent
const filesEnCours = new Map()

/**
 * Transcrit les morceaux de ce CR rangés sur l'appareil, dans l'ordre.
 * S'arrête au premier problème de réseau, de session ou de configuration ;
 * un morceau refusé est compté et la file continue.
 * @returns { transcrits, erreur }
 */
export function transcrireEnAttente(crId, { vocabulaire = [], surProgres } = {}) {
  if (filesEnCours.has(crId)) return filesEnCours.get(crId)
  const travail = (async () => {
    let transcrits = 0
    try {
      for (const m of await morceauxEnAttente(crId)) {
        if ((m.echecs ?? 0) >= ECHECS_MAX) continue
        try {
          const texte = await appelerTranscription({ corps: m.blob, type: m.type, vocabulaire })
          await enregistrerSegment(
            { id: m.enregistrementId, cr_id: m.crId, affaire_id: m.affaireId, debut: m.debutEnregistrement, origine: 'micro', format: m.type },
            { rang: m.rang, duree_s: Math.round(m.duree_s), texte, transcrit_le: new Date().toISOString() },
          )
          await effacerMorceau(m.id)
          transcrits += 1
          surProgres?.()
        } catch (err) {
          if (err instanceof ErreurTranscription && err.code === 'refus') { await marquerEchec(m); continue }
          return { transcrits, erreur: err }
        }
      }
      return { transcrits, erreur: null }
    } finally {
      filesEnCours.delete(crId)
    }
  })()
  filesEnCours.set(crId, travail)
  return travail
}

function dureeFichier(fichier) {
  return new Promise((resoudre) => {
    const url = URL.createObjectURL(fichier)
    const audio = new Audio()
    const fin = (d) => { URL.revokeObjectURL(url); resoudre(Number.isFinite(d) ? Math.round(d) : 0) }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => fin(audio.duration)
    audio.onerror = () => fin(0)
    setTimeout(() => fin(0), 8000)
    audio.src = url
  })
}

/**
 * Enregistrement importé (Dictaphone) : déposé le temps de la transcription
 * dans le stockage privé `audio-temporaire`, que la fonction efface ensuite.
 */
export async function importerFichier(fichier, { crId, affaireId, vocabulaire = [] }) {
  const id = crypto.randomUUID()
  const extension = (fichier.name.split('.').pop() || 'm4a').toLowerCase().replace(/[^a-z0-9]/g, '') || 'm4a'
  const chemin = `${affaireId}/${id}.${extension}`
  const type = fichier.type || 'audio/mp4'
  const duree_s = await dureeFichier(fichier)
  const { error } = await supabase.storage.from('audio-temporaire').upload(chemin, fichier, { contentType: type })
  if (error) throw error
  let texte
  try {
    texte = await appelerTranscription({ chemin, vocabulaire })
  } finally {
    // La fonction l'efface déjà ; si elle n'a pas été jointe, on le fait ici
    supabase.storage.from('audio-temporaire').remove([chemin]).catch(() => {})
  }
  await enregistrerSegment(
    { id, cr_id: crId, affaire_id: affaireId, debut: new Date(fichier.lastModified || Date.now()).toISOString(), origine: 'fichier', format: type },
    { rang: 1, duree_s, texte, transcrit_le: new Date().toISOString() },
  )
  return id
}

export async function listerEnregistrements(crId) {
  const { data, error } = await supabase.from('cr_enregistrements').select('*').eq('cr_id', crId).order('debut', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Supprime la transcription et ce qui resterait de l'audio sur l'appareil. */
export async function supprimerEnregistrement(id) {
  const { error } = await supabase.from('cr_enregistrements').delete().eq('id', id)
  if (error) throw error
  await effacerEnregistrement(id).catch(() => {})
}

/** La migration 057 est-elle passée ? (sinon le robot reste caché) */
export async function enregistrementsDisponibles() {
  const { error } = await supabase.from('cr_enregistrements').select('id').limit(1)
  return !error
}
