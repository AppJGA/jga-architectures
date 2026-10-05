// ─── Enregistrer une réunion, morceau par morceau ────────────────────────────
//
// Un `MediaRecorder` est arrêté puis relancé sur le même micro toutes les
// `dureeMorceauMs` : chaque morceau est un fichier complet, lisible seul (les
// tranches d'un enregistrement continu n'ont d'en-tête que dans la première).
// Une coupure ne perd donc que le morceau en cours.
//
// Safari peut couper le micro sans prévenir (écran verrouillé, photo, appel) :
// tout ce qui s'en approche est signalé par `onEvenement`, l'écran décide.

import { choisirFormat, DUREE_TRANCHE_S } from './enregistrementLogique'

export function enregistrementPossible() {
  return typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia
}

export async function demarrerEnregistreur({ dureeMorceauMs, rangDepart = 1, onMorceau, onTranche, onNiveau, onEvenement }) {
  const signaler = (type, detail) => onEvenement?.({ t: Date.now(), type, detail })
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  })
  const piste = flux.getAudioTracks()[0]
  const format = choisirFormat((t) => MediaRecorder.isTypeSupported(t))

  // Niveau sonore : le seul moyen, sur place, de voir que le micro capte
  const Contexte = window.AudioContext || window.webkitAudioContext
  const contexte = Contexte ? new Contexte() : null
  let minuterieNiveau = null
  if (contexte) {
    const analyseur = contexte.createAnalyser()
    analyseur.fftSize = 512
    contexte.createMediaStreamSource(flux).connect(analyseur)
    const echantillons = new Uint8Array(analyseur.fftSize)
    minuterieNiveau = setInterval(() => {
      analyseur.getByteTimeDomainData(echantillons)
      let somme = 0
      for (const v of echantillons) somme += ((v - 128) / 128) ** 2
      onNiveau?.(Math.min(1, Math.sqrt(somme / echantillons.length) * 4))
    }, 100)
  }

  // Écran allumé : verrouillé, Safari suspend la page et le micro avec
  let verrou = null
  let verrouEcran = 'absent'
  const demanderVerrou = async () => {
    if (!('wakeLock' in navigator)) return
    try {
      verrou = await navigator.wakeLock.request('screen')
      verrouEcran = 'obtenu'
      verrou.addEventListener('release', () => { if (actif) signaler('verrou-ecran-perdu') })
    } catch (err) {
      verrouEcran = 'refusé'
      signaler('erreur', `verrou d'écran : ${err?.message ?? err}`)
    }
  }
  await demanderVerrou()

  let actif = true
  let rang = rangDepart
  let enregistreur = null
  let debutMorceau = 0
  let morceaux = []
  let minuterieMorceau = null
  let finMorceau = null

  const lancerMorceau = () => {
    morceaux = []
    enregistreur = new MediaRecorder(flux, { ...(format.type ? { mimeType: format.type } : {}), audioBitsPerSecond: 32000 })
    let index = 0
    enregistreur.ondataavailable = (e) => {
      if (!e.data?.size) return
      morceaux.push(e.data)
      // Rangée aussitôt : si la page est fermée, le morceau en cours se recolle
      onTranche?.({ rang, index: index++, debut: debutMorceau, type: enregistreur.mimeType || format.type || e.data.type, blob: e.data })
    }
    enregistreur.onerror = (e) => signaler('erreur', e.error?.message ?? 'enregistreur')
    enregistreur.onstop = () => {
      const duree_s = (Date.now() - debutMorceau) / 1000
      const type = enregistreur.mimeType || format.type || morceaux[0]?.type || ''
      const blob = new Blob(morceaux, { type })
      if (blob.size > 0) {
        onMorceau?.({ rang, debut: debutMorceau, duree_s, type, taille: blob.size, blob })
        signaler('morceau', `n° ${rang}, ${Math.round(duree_s)} s, ${Math.round(blob.size / 1000)} Ko`)
        rang += 1
      }
      const suite = finMorceau
      finMorceau = null
      if (suite) suite()
      else if (actif && piste.readyState === 'live') lancerMorceau()
    }
    debutMorceau = Date.now()
    // Tranches d'une seconde : un arrêt brutal garde ce qui a déjà été capté
    enregistreur.start(DUREE_TRANCHE_S * 1000)
    clearTimeout(minuterieMorceau)
    minuterieMorceau = setTimeout(() => { if (enregistreur?.state === 'recording') enregistreur.stop() }, dureeMorceauMs)
  }

  piste.addEventListener('mute', () => signaler('piste-muette'))
  piste.addEventListener('unmute', () => signaler('piste-reprise'))
  // Micro coupé par le système (écran verrouillé…) : ce moteur est fini, il
  // rend tout ce qu'il tenait ; la reprise en démarre un autre
  piste.addEventListener('ended', () => {
    signaler('piste-terminee')
    fermer('fin-du-moteur')
  })
  const surVisibilite = () => {
    if (document.visibilityState === 'hidden') { signaler('page-masquee'); return }
    signaler('page-visible', `micro ${piste.readyState === 'live' ? 'actif' : 'coupé'}`)
    // Le verrou d'écran tombe quand la page est masquée : le reprendre
    if (actif && (!verrou || verrou.released)) demanderVerrou()
  }
  document.addEventListener('visibilitychange', surVisibilite)

  signaler('demarrage', `${format.type || 'format du navigateur'}, morceaux de ${Math.round(dureeMorceauMs / 1000)} s`)
  lancerMorceau()

  // Range le dernier morceau puis libère micro, écoute du niveau, verrou
  // d'écran et écoute de la page
  const fermer = (evenement) => new Promise((resoudre) => {
    if (!actif) { resoudre(); return }
    actif = false
    clearTimeout(minuterieMorceau)
    const liberer = () => {
      flux.getTracks().forEach((t) => t.stop())
      clearInterval(minuterieNiveau)
      contexte?.close().catch(() => {})
      verrou?.release().catch(() => {})
      document.removeEventListener('visibilitychange', surVisibilite)
      signaler(evenement)
      resoudre()
    }
    if (enregistreur?.state === 'recording') { finMorceau = liberer; enregistreur.stop() } else liberer()
  })
  const arreter = () => fermer('arret')

  return { arreter, format: format.type, get verrouEcran() { return verrouEcran } }
}
