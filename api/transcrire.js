/* global process, Buffer -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Transcrire un morceau de visite enregistrée ─────────────────────────────
//
// Le navigateur envoie un morceau d'audio (3 minutes) ; on le passe à Mistral
// Voxtral et on rend le texte. La clé Mistral ne vit qu'ici (variable Vercel
// MISTRAL_API_KEY) : dans le navigateur, n'importe qui pourrait la lire et
// dépenser les crédits de l'agence.
//
// Deux sources :
// - le corps de la requête (`application/octet-stream`) : un morceau du robot ;
// - `?chemin=<affaire>/<fichier>` : un enregistrement importé, déposé dans le
//   stockage privé `audio-temporaire` ; Mistral le lit par un lien signé, puis
//   le fichier est effacé, quoi qu'il arrive.
//
// Réservé à l'agence : la session Supabase de l'appelant est vérifiée, puis
// `est_agence()` est demandé avec son propre jeton (règles de la base).
//
// En-tête `X-Horodatage: segment` (visite d'un état des lieux) : Mistral rend
// aussi les phrases avec leurs heures (secondes depuis le début du morceau),
// pour les rattacher à la pièce où l'on était. L'horodatage n'accepte pas
// `language` (documentation Mistral) : il part sans ; s'il est refusé, on
// redemande le texte seul, en français. Sans l'en-tête (comptes rendus),
// rien ne change.

import { verifierAgence } from './_agence.js'

const MISTRAL = 'https://api.mistral.ai/v1/audio/transcriptions'
const MODELE = 'voxtral-mini-latest'
// Sous la limite de 4,5 Mo du corps d'une fonction Vercel
const TAILLE_MAX = 4.4 * 1024 * 1024
const CHEMIN_VALIDE = /^[0-9a-f-]{36}\/[\w.-]+$/i

const EXTENSIONS = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }

async function lireCorps(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  const morceaux = []
  for await (const m of req) morceaux.push(m)
  return Buffer.concat(morceaux)
}

async function appelerMistral(cle, { fichier, lien, vocabulaire, horodatage = false }) {
  const envoyer = async (avecVocabulaire, avecHorodatage = false) => {
    const formulaire = new FormData()
    formulaire.append('model', MODELE)
    if (avecHorodatage) formulaire.append('timestamp_granularities', 'segment')
    else formulaire.append('language', 'fr')
    if (lien) formulaire.append('file_url', lien)
    else formulaire.append('file', fichier.blob, fichier.nom)
    if (avecVocabulaire) for (const terme of vocabulaire) formulaire.append('context_bias', terme)
    return fetch(MISTRAL, { method: 'POST', headers: { Authorization: `Bearer ${cle}` }, body: formulaire })
  }
  const essayer = async (avecHorodatage) => {
    let reponse = await envoyer(vocabulaire.length > 0, avecHorodatage)
    // Le vocabulaire est expérimental en français : s'il est refusé, sans lui
    if (!reponse.ok && reponse.status < 500 && vocabulaire.length > 0) reponse = await envoyer(false, avecHorodatage)
    return reponse
  }
  if (!horodatage) return { reponse: await essayer(false), horodate: false }
  const reponse = await essayer(true)
  // Horodatage refusé : le texte seul vaut mieux que rien
  if (!reponse.ok && reponse.status < 500) return { reponse: await essayer(false), horodate: false }
  return { reponse, horodate: true }
}

// Segments de Mistral ({ start, end, text }) → ceux de l'app ; `null` si la
// réponse n'en porte pas (texte seul). Un segment sans heures lisibles ne se
// placerait nulle part : écarté (NaN deviendrait `null` dans le JSON)
function segmentsDe(resultat) {
  if (!Array.isArray(resultat?.segments)) return null
  return resultat.segments
    .map((s) => ({ debut_s: Number(s?.start), fin_s: Number(s?.end), texte: String(s?.text ?? '').trim() }))
    .filter((s) => Number.isFinite(s.debut_s) && Number.isFinite(s.fin_s))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return }
  const url = process.env.VITE_SUPABASE_URL
  const cleSupabase = process.env.VITE_SUPABASE_ANON_KEY
  const cleMistral = process.env.MISTRAL_API_KEY
  if (!url || !cleSupabase) { res.status(500).json({ erreur: 'supabase-non-configure' }); return }

  const jeton = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const acces = await verifierAgence(url, cleSupabase, jeton)
  if (acces !== 200) { res.status(acces).json({ erreur: acces === 401 ? 'session' : 'agence-seule' }); return }
  if (!cleMistral) { res.status(503).json({ erreur: 'transcription-non-configuree' }); return }

  let vocabulaire
  try {
    const lu = JSON.parse(decodeURIComponent(String(req.headers['x-vocabulaire'] ?? '%5B%5D')))
    vocabulaire = Array.isArray(lu) ? lu.map(String).slice(0, 100) : []
  } catch { vocabulaire = [] }

  const horodatage = String(req.headers['x-horodatage'] ?? '').toLowerCase() === 'segment'
  const chemin = typeof req.query?.chemin === 'string' ? req.query.chemin : null
  const stockage = { apikey: cleSupabase, Authorization: `Bearer ${jeton}` }
  try {
    let reponse
    let horodate = false
    if (chemin) {
      if (!CHEMIN_VALIDE.test(chemin)) { res.status(400).json({ erreur: 'chemin' }); return }
      try {
        const signe = await fetch(`${url}/storage/v1/object/sign/audio-temporaire/${chemin}`, {
          method: 'POST', headers: { ...stockage, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 }),
        })
        if (!signe.ok) { res.status(404).json({ erreur: 'fichier-introuvable' }); return }
        const { signedURL } = await signe.json()
        const appel = await appelerMistral(cleMistral, { lien: `${url}/storage/v1${signedURL}`, vocabulaire, horodatage })
        reponse = appel.reponse
        horodate = appel.horodate
      } finally {
        // L'audio ne reste pas dans Supabase, même si la transcription échoue
        await fetch(`${url}/storage/v1/object/audio-temporaire`, {
          method: 'DELETE', headers: { ...stockage, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [chemin] }),
        }).catch(() => {})
      }
    } else {
      const corps = await lireCorps(req)
      if (corps.length === 0) { res.status(400).json({ erreur: 'audio-vide' }); return }
      if (corps.length > TAILLE_MAX) { res.status(413).json({ erreur: 'trop-gros' }); return }
      const type = String(req.headers['x-type-audio'] ?? 'audio/mp4').split(';')[0]
      const fichier = { blob: new Blob([corps], { type }), nom: `morceau.${EXTENSIONS[type] ?? 'm4a'}` }
      const appel = await appelerMistral(cleMistral, { fichier, vocabulaire, horodatage })
      reponse = appel.reponse
      horodate = appel.horodate
    }

    if (!reponse.ok) {
      const detail = (await reponse.text().catch(() => '')).slice(0, 300)
      res.status(502).json({ erreur: 'mistral', statut: reponse.status, detail })
      return
    }
    const resultat = await reponse.json()
    const texte = String(resultat.text ?? '').trim()
    if (!horodatage) { res.status(200).json({ texte }); return }
    res.status(200).json({ texte, segments: horodate ? segmentsDe(resultat) : null })
  } catch (e) {
    res.status(502).json({ erreur: 'reseau', detail: String(e?.message ?? e).slice(0, 300) })
  }
}
