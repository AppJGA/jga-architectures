import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('Supabase env vars missing — copy .env.example to .env and fill in your credentials.')
}

// ─── Hors ligne : la dernière synchronisation ────────────────────────────────
//
// Les réponses de la base sont gardées par le service worker (vite.config.js,
// « supabase-api ») : sans réseau, l'app montre la dernière version reçue de
// chaque page. Le moment de la dernière réponse reçue du réseau est noté ici,
// pour dire à l'écran de quand datent les données montrées.

export const CLE_DERNIERE_SYNCHRO = 'jga.derniere-synchro'
const CACHES_DONNEES = ['supabase-api', 'supabase-images']
let derniereNote = 0

function noterSynchro() {
  const maintenant = Date.now()
  if (maintenant - derniereNote < 30_000) return
  derniereNote = maintenant
  try { localStorage.setItem(CLE_DERNIERE_SYNCHRO, String(maintenant)) } catch { /* navigation privée */ }
}

async function fetchNote(...args) {
  const reponse = await fetch(...args)
  if (reponse.ok && navigator.onLine) noterSynchro()
  return reponse
}

/** Date de la dernière réponse reçue du réseau, ou null */
export function derniereSynchro() {
  try {
    const t = Number(localStorage.getItem(CLE_DERNIERE_SYNCHRO))
    return t > 0 ? new Date(t) : null
  } catch { return null }
}

/** À la déconnexion : les données gardées sur l'appareil appartenaient à ce compte */
export async function viderMemoireDonnees() {
  try {
    if (typeof caches !== 'undefined') await Promise.all(CACHES_DONNEES.map((nom) => caches.delete(nom)))
    localStorage.removeItem(CLE_DERNIERE_SYNCHRO)
  } catch { /* rien à effacer */ }
}

export const supabase = createClient(url ?? '', key ?? '', { global: { fetch: fetchNote } })

// Sans réseau, une session expirée fait patienter chaque requête jusqu'à 30 s :
// la bibliothèque retente de renouveler le jeton avant de laisser partir quoi
// que ce soit. Or la mémoire du service worker répond d'après l'adresse seule,
// sans regarder le jeton. Les lectures hors ligne passent donc par un second
// client, sans session, qui part tout de suite.
const lecteurHorsLigne = createClient(url ?? '', key ?? '', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'jga-lecture-hors-ligne' },
})
// Sans réseau, relancer une lecture ne sert à rien : sans copie gardée, on
// le dit tout de suite (sinon trois relances, 7 s d'attente par écran)
lecteurHorsLigne.rest.retry = false
const horsLigne = () => typeof navigator !== 'undefined' && navigator.onLine === false

// ─── Verrou d'écriture d'une affaire en lecture seule ────────────────────────
//
// Dans une affaire dont on n'est pas collaborateur, on se promène mais on ne
// modifie rien. La base le refuse (migration 060) ; ce verrou arrête en plus
// toute écriture avant qu'elle parte, quel que soit l'écran qui l'a lancée :
// les modules écrivent à des dizaines d'endroits, un bouton oublié ne doit pas
// suffire à modifier une affaire. L'écriture refusée rend une erreur
// ordinaire (`{ error }`), que chaque écran traite déjà — le planning, par
// exemple, recharge alors tout depuis la base.
//
// Posé et levé par la page de l'affaire (AffairePage). Les réglages communs
// à l'agence ne sont pas visés.

const TABLES_LIBRES = new Set(['profiles', 'agence_reglages'])
let verrou = null
const ecouteurs = new Set()

export function verrouillerEcritures(message) { verrou = message }
export function deverrouillerEcritures() { verrou = null }
/** Prévenu à chaque écriture refusée ; rend de quoi se désabonner. */
export function surEcritureRefusee(rappel) {
  ecouteurs.add(rappel)
  return () => ecouteurs.delete(rappel)
}

const erreurVerrou = () => ({ code: 'LECTURE_SEULE', message: verrou, details: null, hint: null })

// Une requête qui accepte toutes les suites habituelles (.eq().select()
// .single()…) et se résout sur l'erreur, sans rien envoyer
function requeteRefusee() {
  const resultat = { data: null, error: erreurVerrou(), count: null, status: 403, statusText: 'Lecture seule' }
  const promesse = Promise.resolve(resultat)
  const chaine = new Proxy(function () {}, {
    get(_, cle) {
      if (cle === 'then') return promesse.then.bind(promesse)
      if (cle === 'catch') return promesse.catch.bind(promesse)
      if (cle === 'finally') return promesse.finally.bind(promesse)
      return () => chaine
    },
    apply: () => chaine,
  })
  return chaine
}

/** Un geste refusé à l'écran, hors base (zone de consultation) : même message. */
export function signalerLectureSeule(cible = 'écran') { refuser(cible) }

function refuser(cible) {
  console.warn(`Écriture refusée (lecture seule) : ${cible}`)
  for (const rappel of ecouteurs) rappel(cible)
}

const fromOriginal = supabase.from.bind(supabase)
const fromHorsLigne = lecteurHorsLigne.from.bind(lecteurHorsLigne)
supabase.from = (table) => {
  const requete = (horsLigne() ? fromHorsLigne : fromOriginal)(table)
  if (!verrou || TABLES_LIBRES.has(table)) return requete
  for (const methode of ['insert', 'update', 'upsert', 'delete']) {
    requete[methode] = () => { refuser(table); return requeteRefusee() }
  }
  return requete
}

const stockageOriginal = supabase.storage.from.bind(supabase.storage)
supabase.storage.from = (espace) => {
  const fichiers = stockageOriginal(espace)
  if (!verrou) return fichiers
  for (const methode of ['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl']) {
    if (typeof fichiers[methode] !== 'function') continue
    fichiers[methode] = async () => { refuser(espace); return { data: null, error: erreurVerrou() } }
  }
  return fichiers
}
