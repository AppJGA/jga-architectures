import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('Supabase env vars missing — copy .env.example to .env and fill in your credentials.')
}

export const supabase = createClient(url ?? '', key ?? '')

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
supabase.from = (table) => {
  const requete = fromOriginal(table)
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
