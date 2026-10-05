// ─── Visite enregistrée : ce qui se calcule sans navigateur ──────────────────
//
// Format audio, durées et bilan d'un enregistrement. Pur, pour être testé
// (tests/enregistrement.test.js) ; le micro et IndexedDB sont dans
// `enregistreur.js` et `audioLocal.js`.

// AAC d'abord : Safari ne sait faire que lui, Chrome récent aussi ; sinon
// Opus en WebM, le format natif de Chrome sur ordinateur
export const FORMATS_AUDIO = [
  { type: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
  { type: 'audio/mp4', extension: 'm4a' },
  { type: 'audio/webm;codecs=opus', extension: 'webm' },
  { type: 'audio/webm', extension: 'webm' },
]

export function choisirFormat(estSupporte) {
  return FORMATS_AUDIO.find((f) => estSupporte(f.type)) ?? { type: '', extension: 'audio' }
}

export function extensionDe(type) {
  const t = String(type ?? '')
  if (t.startsWith('audio/mp4')) return 'm4a'
  if (t.startsWith('audio/webm')) return 'webm'
  if (t.startsWith('audio/ogg')) return 'ogg'
  return 'audio'
}

export function dureeLisible(secondes) {
  const total = Math.max(0, Math.floor(Number(secondes) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// En deçà, l'écart vient du passage d'un morceau au suivant, pas d'une coupure
const TROU_MINIMAL_S = 2

// Une sourdine (écran verrouillé brièvement) enregistre du silence : le
// morceau dure, mais rien n'est capté. Elle finit quand le micro revient ou
// quand l'enregistrement s'arrête.
const FINS_SOURDINE = new Set(['piste-reprise', 'piste-terminee', 'fin-du-moteur', 'arret'])

/** Secondes passées en sourdine, d'après le journal. */
export function dureeSourdine(evenements = [], fin = null) {
  let total = 0
  let depuis = null
  for (const e of [...evenements].sort((a, b) => a.t - b.t)) {
    if (e.type === 'piste-muette' && depuis === null) depuis = e.t
    else if (FINS_SOURDINE.has(e.type) && depuis !== null) { total += e.t - depuis; depuis = null }
  }
  if (depuis !== null && fin !== null) total += Math.max(0, fin - depuis)
  return Math.round(total / 1000)
}

const heure = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Ce que l'essai a donné, et un texte à recopier dans la conversation. */
export function bilanEssai({ debut, fin, morceaux = [], evenements = [], environnement = {} }) {
  const tries = [...morceaux].sort((a, b) => a.rang - b.rang)
  const dureeEnregistree = Math.round(tries.reduce((n, m) => n + (m.duree_s || 0), 0))
  const dureeEcoulee = Math.round(Math.max(0, (fin - debut) / 1000))
  const trous = []
  for (let i = 1; i < tries.length; i++) {
    const finPrecedent = tries[i - 1].debut + tries[i - 1].duree_s * 1000
    const ecart = Math.round((tries[i].debut - finPrecedent) / 1000)
    if (ecart > TROU_MINIMAL_S) trous.push({ apresRang: tries[i - 1].rang, duree_s: ecart })
  }
  const muet = dureeSourdine(evenements, fin)
  // Perdu : ce qui n'a pas été enregistré, plus le silence de la sourdine
  const perdue = Math.max(0, dureeEcoulee - dureeEnregistree) + muet
  const taille = tries.reduce((n, m) => n + (m.taille || 0), 0)

  const lignes = [
    'Essai d’enregistrement — bilan',
    `Navigateur : ${environnement.navigateur ?? 'inconnu'} · app installée : ${environnement.installee ? 'oui' : 'non'}`,
    `Format : ${environnement.format || 'choisi par le navigateur'} · écran maintenu allumé : ${environnement.verrouEcran ?? 'inconnu'}`,
    `${tries.length} morceau${tries.length > 1 ? 'x' : ''} · enregistré ${dureeLisible(dureeEnregistree)} sur ${dureeLisible(dureeEcoulee)} · perdu : ${dureeLisible(perdue)} · ${(taille / 1e6).toFixed(1)} Mo`,
    // Le débit décide de la longueur des morceaux envoyés au lot 1 (4 Mo au plus)
    ...(dureeEnregistree > 0 ? [`Débit : ${Math.round(taille / 1000 / (dureeEnregistree / 60))} Ko par minute`] : []),
    ...trous.map((t) => `Coupure de ${dureeLisible(t.duree_s)} après le morceau ${t.apresRang}`),
    ...(muet > 0 ? [`Micro en sourdine : ${dureeLisible(muet)} (silence enregistré)`] : []),
    'Événements :',
    ...evenements.map((e) => `  ${heure(e.t)} ${e.type}${e.detail ? ` (${e.detail})` : ''}`),
  ]
  return { dureeEnregistree, dureeEcoulee, perdue, muet, trous, texte: lignes.join('\n') }
}

// Durée d'une tranche : celle demandée à `MediaRecorder.start` (enregistreur.js)
export const DUREE_TRANCHE_S = 1

/**
 * Tranches d'une seconde restées seules après une fermeture brutale, par
 * morceau, dans l'ordre : de quoi recoller chaque morceau interrompu. La
 * première tranche porte l'en-tête du fichier ; sans elle le morceau est
 * illisible, il est écarté.
 * @returns [{ rang, debut, type, duree_s, tranches }]
 */
export function regrouperTranches(tranches = []) {
  const parRang = new Map()
  for (const t of tranches) {
    if (!parRang.has(t.rang)) parRang.set(t.rang, [])
    parRang.get(t.rang).push(t)
  }
  return [...parRang.entries()]
    .map(([rang, liste]) => {
      const triees = [...liste].sort((a, b) => a.index - b.index)
      return { rang, debut: triees[0].debut, type: triees[0].type, duree_s: triees.length * DUREE_TRANCHE_S, tranches: triees }
    })
    .filter((g) => g.tranches[0].index === 0)
    .sort((a, b) => a.rang - b.rang)
}
