# Visite enregistrée — lot 0 : essai d'enregistrement — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une page d'essai, dans les Outils, qui enregistre une réunion par
morceaux comme le fera le robot, et rend un bilan copiable : Victor la teste
sur chantier (iPad et ordinateur, Safari et Chrome) avant qu'on bâtisse les
lots 1 à 3.

**Architecture :** trois briques réutilisées telles quelles au lot 1 — une
logique pure testée (`enregistrementLogique.js` : format, durées, bilan), un
moteur navigateur (`enregistreur.js` : micro, morceaux, niveau, verrou
d'écran, interruptions) et un rangement local (`audioLocal.js` : morceaux
dans IndexedDB, base à part `jga-audio`). La page d'essai n'est que l'écran.
Aucune API, aucune clé, aucune migration, rien envoyé hors de l'appareil.

**Tech Stack :** React 19, MediaRecorder, Web Audio (`AnalyserNode`),
Screen Wake Lock, IndexedDB, `node --test`.

**Spec :** `docs/superpowers/specs/2026-10-05-visite-enregistree-ia-design.md`
(§ 1 « Enregistrer », § 5 « Sur l'iPad », § 7 lot 0).

## Global Constraints

- Français partout (code métier, commentaires, textes) ; commentaires du
  « pourquoi » seulement.
- Styles inline ; couleurs par les variables de `src/index.css`.
- `@keyframes` et classes d'animation dans `src/index.css`, neutralisées par
  le bloc `prefers-reduced-motion` ; seul `animation-delay` est inline.
- Rien d'audio ne quitte l'appareil au lot 0 (ni Supabase, ni service).
- Chrome autant que Safari : format choisi par `MediaRecorder.isTypeSupported`
  — AAC (`audio/mp4`) d'abord, sinon Opus (`audio/webm`).
- Morceaux de 5 minutes en usage réel ; l'essai permet 1 minute pour tester
  vite.
- Boutons d'au moins 44 px (usage au doigt sur iPad).
- `npm run build` doit passer ; `npx eslint src` reste à 73 problèmes.
- Commit **et push** en fin de tâche (déployé depuis `main`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js` | Pur : choix du format, durée lisible, bilan d'un essai |
| `src/modules/chantier/comptes-rendus/enregistrement/enregistreur.js` | Navigateur : micro, morceaux, niveau, verrou d'écran, interruptions |
| `src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js` | IndexedDB `jga-audio` : ranger, relire, effacer des morceaux |
| `src/tools/essai-enregistrement/EssaiEnregistrement.jsx` + `index.jsx` | La page d'essai |
| `src/tools/manifest.js` | Entrée « Essai d'enregistrement » |
| `src/index.css` | Animation du point rouge `jga-enregistre` |
| `tests/enregistrement.test.js` | Tests de la logique pure |

Base IndexedDB **séparée** (`jga-audio`) plutôt qu'un magasin de plus dans
`baseLocale.js` (écart assumé avec la spec § 5) : changer la version de la
base du hors-ligne ferait courir un risque à la file des visites pour un
simple essai. Le lot 1 garde cette base à part.

---

### Task 1 : logique pure de l'enregistrement

**Files :**
- Create : `src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js`
- Test : `tests/enregistrement.test.js`

**Interfaces :**
- Produces :
  - `FORMATS_AUDIO` : `[{ type: string, extension: 'm4a' | 'webm' }]`
  - `choisirFormat(estSupporte: (type) => boolean) → { type: string, extension: string }` (`type: ''` si rien n'est reconnu : le navigateur choisit)
  - `extensionDe(type: string) → 'm4a' | 'webm' | 'ogg' | 'audio'`
  - `dureeLisible(secondes: number) → string` (`'0:00'`, `'1:15'`, `'1:02:05'`)
  - `bilanEssai({ debut: number, fin: number, morceaux: [{ rang, debut, duree_s, taille, type }], evenements: [{ t, type, detail? }], environnement: { navigateur, installee, verrouEcran, format } }) → { dureeEnregistree, dureeEcoulee, perdue, trous: [{ apresRang, duree_s }], texte }`

- [ ] **Step 1 : écrire les tests**

```js
// tests/enregistrement.test.js
// Visite enregistrée, lot 0 : format audio, durées, bilan d'un essai.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  choisirFormat, extensionDe, dureeLisible, bilanEssai,
} from '../src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js'

describe('format', () => {
  test('AAC quand le navigateur sait le faire (Safari, Chrome sur iPad)', () => {
    assert.deepEqual(choisirFormat((t) => t.startsWith('audio/mp4')), { type: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' })
  })
  test('Opus en WebM sinon (Chrome sur ordinateur)', () => {
    assert.deepEqual(choisirFormat((t) => t.startsWith('audio/webm')), { type: 'audio/webm;codecs=opus', extension: 'webm' })
  })
  test('rien de reconnu : le navigateur choisit', () => {
    assert.deepEqual(choisirFormat(() => false), { type: '', extension: 'audio' })
  })
  test('extension d’un type rendu par le navigateur', () => {
    assert.equal(extensionDe('audio/mp4'), 'm4a')
    assert.equal(extensionDe('audio/webm;codecs=opus'), 'webm')
    assert.equal(extensionDe('audio/ogg'), 'ogg')
    assert.equal(extensionDe(''), 'audio')
  })
})

test('durée lisible', () => {
  assert.equal(dureeLisible(0), '0:00')
  assert.equal(dureeLisible(75.6), '1:15')
  assert.equal(dureeLisible(3725), '1:02:05')
  assert.equal(dureeLisible(-3), '0:00')
})

describe('bilan d’un essai', () => {
  const debut = Date.UTC(2026, 9, 6, 8, 0, 0)
  const s = (sec) => debut + sec * 1000
  const morceaux = [
    { rang: 1, debut: s(0), duree_s: 300, taille: 1_200_000, type: 'audio/mp4' },
    { rang: 2, debut: s(300), duree_s: 300, taille: 1_190_000, type: 'audio/mp4' },
    // coupure de 40 s (photo), puis reprise
    { rang: 3, debut: s(640), duree_s: 120, taille: 480_000, type: 'audio/mp4' },
  ]
  const evenements = [
    { t: s(0), type: 'demarrage' },
    { t: s(600), type: 'page-masquee' },
    { t: s(602), type: 'piste-terminee' },
    { t: s(640), type: 'reprise' },
    { t: s(760), type: 'arret' },
  ]
  const b = bilanEssai({
    debut, fin: s(760), morceaux, evenements,
    environnement: { navigateur: 'Safari iPad', installee: true, verrouEcran: 'obtenu', format: 'audio/mp4' },
  })

  test('durées enregistrée, écoulée, perdue', () => {
    assert.equal(b.dureeEnregistree, 720)
    assert.equal(b.dureeEcoulee, 760)
    assert.equal(b.perdue, 40)
  })
  test('les trous entre deux morceaux, au-delà de 2 s', () => {
    assert.deepEqual(b.trous, [{ apresRang: 2, duree_s: 40 }])
  })
  test('un texte à recopier, qui dit l’essentiel', () => {
    for (const attendu of ['Safari iPad', 'installée : oui', 'audio/mp4', '3 morceaux', '12:00', '12:40', 'perdu : 0:40', 'piste-terminee']) {
      assert.ok(b.texte.includes(attendu), attendu)
    }
  })
  test('un essai sans morceau ne plante pas', () => {
    const vide = bilanEssai({ debut, fin: s(10), morceaux: [], evenements: [], environnement: {} })
    assert.equal(vide.dureeEnregistree, 0)
    assert.deepEqual(vide.trous, [])
  })
})
```

- [ ] **Step 2 : lancer les tests, constater l'échec**

Run : `node --import ./tests/resolve-src.mjs --test tests/enregistrement.test.js`
Attendu : échec, module introuvable.

- [ ] **Step 3 : écrire la logique**

```js
// src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js
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
  const perdue = Math.max(0, dureeEcoulee - dureeEnregistree)
  const taille = tries.reduce((n, m) => n + (m.taille || 0), 0)

  const lignes = [
    'Essai d’enregistrement — bilan',
    `Navigateur : ${environnement.navigateur ?? 'inconnu'} · app installée : ${environnement.installee ? 'oui' : 'non'}`,
    `Format : ${environnement.format || 'choisi par le navigateur'} · écran maintenu allumé : ${environnement.verrouEcran ?? 'inconnu'}`,
    `${tries.length} morceaux · enregistré ${dureeLisible(dureeEnregistree)} sur ${dureeLisible(dureeEcoulee)} · perdu : ${dureeLisible(perdue)} · ${(taille / 1e6).toFixed(1)} Mo`,
    ...trous.map((t) => `Coupure de ${dureeLisible(t.duree_s)} après le morceau ${t.apresRang}`),
    'Événements :',
    ...evenements.map((e) => `  ${heure(e.t)} ${e.type}${e.detail ? ` (${e.detail})` : ''}`),
  ]
  return { dureeEnregistree, dureeEcoulee, perdue, trous, texte: lignes.join('\n') }
}
```

- [ ] **Step 4 : relancer les tests**

Run : `node --import ./tests/resolve-src.mjs --test tests/enregistrement.test.js`
Attendu : tous passent. Le texte contient `12:00` (durée enregistrée de 720 s)
et `12:40` (760 s écoulées).

- [ ] **Step 5 : commit**

```bash
git add src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js tests/enregistrement.test.js
git commit -m "feat: visite enregistrée — logique du format, des durées et du bilan d'essai"
```

---

### Task 2 : rangement local des morceaux (IndexedDB)

**Files :**
- Create : `src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js`

**Interfaces :**
- Produces :
  - `rangerMorceau({ id, enregistrementId, rang, debut, duree_s, type, taille, blob }) → Promise<void>`
  - `lireMorceaux(enregistrementId) → Promise<morceau[]>` (triés par `rang`)
  - `dernierEnregistrement() → Promise<string | null>` (identifiant du plus récent)
  - `effacerEnregistrement(enregistrementId) → Promise<void>`

Pas de test automatique (IndexedDB n'existe pas sous Node) ; vérifié au
navigateur en Task 4.

- [ ] **Step 1 : écrire le module**

```js
// src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js
// ─── Morceaux d'enregistrement gardés sur l'appareil ─────────────────────────
//
// Chaque morceau terminé est rangé aussitôt : si Safari ferme la page en
// arrière-plan, ce qui a déjà été enregistré survit. Base à part (`jga-audio`)
// : celle de la visite hors ligne (`baseLocale.js`) n'a pas à changer de
// version pour cela.

const NOM = 'jga-audio'
const MAGASIN = 'morceaux'

let ouverture = null
function base() {
  if (!ouverture) {
    ouverture = new Promise((resoudre, rejeter) => {
      const req = indexedDB.open(NOM, 1)
      req.onupgradeneeded = () => {
        const magasin = req.result.createObjectStore(MAGASIN, { keyPath: 'id' })
        magasin.createIndex('enregistrement', 'enregistrementId')
      }
      req.onsuccess = () => resoudre(req.result)
      req.onerror = () => { ouverture = null; rejeter(req.error) }
    })
  }
  return ouverture
}

function transaction(mode, travail) {
  return base().then((db) => new Promise((resoudre, rejeter) => {
    const tx = db.transaction(MAGASIN, mode)
    const resultat = travail(tx.objectStore(MAGASIN))
    tx.oncomplete = () => resoudre(resultat?.result ?? resultat)
    tx.onerror = () => rejeter(tx.error)
    tx.onabort = () => rejeter(tx.error)
  }))
}

export function rangerMorceau(morceau) {
  return transaction('readwrite', (m) => { m.put(morceau) }).then(() => undefined)
}

export async function lireMorceaux(enregistrementId) {
  const tous = await transaction('readonly', (m) => m.index('enregistrement').getAll(enregistrementId))
  return [...(tous ?? [])].sort((a, b) => a.rang - b.rang)
}

export async function dernierEnregistrement() {
  const tous = await transaction('readonly', (m) => m.getAll())
  if (!tous?.length) return null
  return tous.reduce((a, b) => (b.debut > a.debut ? b : a)).enregistrementId
}

export async function effacerEnregistrement(enregistrementId) {
  const morceaux = await lireMorceaux(enregistrementId)
  await transaction('readwrite', (m) => { for (const x of morceaux) m.delete(x.id) })
}
```

- [ ] **Step 2 : vérifier lint et build**

Run : `npx eslint src/modules/chantier/comptes-rendus/enregistrement && npm run build`
Attendu : aucun problème sur ces fichiers, build réussi.

- [ ] **Step 3 : commit**

```bash
git add src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js
git commit -m "feat: visite enregistrée — morceaux gardés sur l'appareil (IndexedDB)"
```

---

### Task 3 : moteur d'enregistrement

**Files :**
- Create : `src/modules/chantier/comptes-rendus/enregistrement/enregistreur.js`

**Interfaces :**
- Consumes : `choisirFormat` (Task 1).
- Produces :
  - `enregistrementPossible() → boolean`
  - `demarrerEnregistreur({ dureeMorceauMs, rangDepart = 1, onMorceau, onNiveau, onEvenement }) → Promise<{ arreter(): Promise<void>, format: string, verrouEcran: 'obtenu' | 'refusé' | 'absent' }>`
    - `onMorceau({ rang, debut, duree_s, type, taille, blob })`
    - `onNiveau(n: 0..1)` ~10 fois par seconde
    - `onEvenement({ t, type, detail? })` — types : `demarrage`, `morceau`,
      `page-masquee`, `page-visible`, `piste-muette`, `piste-reprise`,
      `piste-terminee`, `erreur`, `verrou-ecran-perdu`, `arret`.
  - Doit être appelée dans le geste de l'utilisateur (un appui) : iOS refuse
    micro et `AudioContext` autrement.

- [ ] **Step 1 : écrire le moteur**

```js
// src/modules/chantier/comptes-rendus/enregistrement/enregistreur.js
// ─── Enregistrer une réunion, morceau par morceau ────────────────────────────
//
// Un `MediaRecorder` est arrêté puis relancé sur le même micro toutes les
// `dureeMorceauMs` : chaque morceau est un fichier complet, lisible seul (les
// tranches d'un enregistrement continu n'ont d'en-tête que dans la première).
// Une coupure ne perd donc que le morceau en cours.
//
// Safari peut couper le micro sans prévenir (écran verrouillé, photo, appel) :
// tout ce qui s'en approche est signalé par `onEvenement`, l'écran décide.

import { choisirFormat } from './enregistrementLogique'

export function enregistrementPossible() {
  return typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia
}

export async function demarrerEnregistreur({ dureeMorceauMs, rangDepart = 1, onMorceau, onNiveau, onEvenement }) {
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
    enregistreur.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data) }
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
    enregistreur.start(1000)
    clearTimeout(minuterieMorceau)
    minuterieMorceau = setTimeout(() => { if (enregistreur?.state === 'recording') enregistreur.stop() }, dureeMorceauMs)
  }

  piste.addEventListener('mute', () => signaler('piste-muette'))
  piste.addEventListener('unmute', () => signaler('piste-reprise'))
  piste.addEventListener('ended', () => {
    signaler('piste-terminee')
    if (enregistreur?.state === 'recording') enregistreur.stop()
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

  const arreter = () => new Promise((resoudre) => {
    if (!actif) { resoudre(); return }
    actif = false
    clearTimeout(minuterieMorceau)
    const liberer = () => {
      flux.getTracks().forEach((t) => t.stop())
      clearInterval(minuterieNiveau)
      contexte?.close().catch(() => {})
      verrou?.release().catch(() => {})
      document.removeEventListener('visibilitychange', surVisibilite)
      signaler('arret')
      resoudre()
    }
    if (enregistreur?.state === 'recording') { finMorceau = liberer; enregistreur.stop() } else liberer()
  })

  return { arreter, format: format.type, get verrouEcran() { return verrouEcran } }
}
```

- [ ] **Step 2 : lint et build**

Run : `npx eslint src/modules/chantier/comptes-rendus/enregistrement && npm run build`
Attendu : rien sur ces fichiers, build réussi.

- [ ] **Step 3 : commit**

```bash
git add src/modules/chantier/comptes-rendus/enregistrement/enregistreur.js
git commit -m "feat: visite enregistrée — moteur d'enregistrement par morceaux"
```

---

### Task 4 : page d'essai dans les Outils

**Files :**
- Create : `src/tools/essai-enregistrement/index.jsx`, `src/tools/essai-enregistrement/EssaiEnregistrement.jsx`
- Modify : `src/tools/manifest.js` (entrée après « Convertisseur »), `src/index.css` (animation `jga-enregistre` + bloc `prefers-reduced-motion`)

**Interfaces :**
- Consumes : `enregistrementPossible`, `demarrerEnregistreur` (Task 3) ;
  `rangerMorceau`, `lireMorceaux`, `dernierEnregistrement`,
  `effacerEnregistrement` (Task 2) ; `dureeLisible`, `bilanEssai`,
  `extensionDe` (Task 1).

L'écran :
- choix de la longueur des morceaux (1 min pour un essai rapide, 5 min comme
  en vrai) ;
- grand bouton robot (64 px) Démarrer / Arrêter ; pendant l'enregistrement :
  point rouge animé, durée, barre de niveau ;
- bouton « Reprendre » quand le micro a été coupé (`piste-terminee`) ;
- bouton « Prendre une photo » (`<input type=file accept=image/* capture>`),
  pour tester la coupure par l'appareil photo — la photo n'est pas gardée ;
- liste des morceaux (relus depuis IndexedDB, donc aussi après un
  rechargement) avec lecture et téléchargement ;
- journal des événements ; « Copier le bilan » (presse-papiers, repli : zone
  de texte sélectionnable) ; « Effacer l'essai ».

- [ ] **Step 1 : l'animation dans `src/index.css`**

Après la règle `.jga-respire`, ajouter :

```css
/* Essai d'enregistrement / robot : le point rouge bat tant que le micro
   enregistre — on doit voir d'un coup d'œil que ça tourne. */
@keyframes jga-enregistre {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.35; transform: scale(0.8); }
}
.jga-enregistre { animation: jga-enregistre 1.4s ease-in-out infinite; }
```

Et ajouter `.jga-enregistre` à la liste du bloc
`@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 2 : l'entrée du manifeste**

Dans `src/tools/manifest.js`, après l'outil `convertisseur` :

```js
  {
    id: 'essai-enregistrement',
    label: 'Essai d’enregistrement',
    icon: 'Bot',
    description: 'Tester l’enregistrement d’une visite sur cet appareil',
    path: 'essai-enregistrement',
    component: lazy(() => import('./essai-enregistrement')),
    enabled: true,
  },
```

(`Bot` est déjà dans l'`ICON_MAP` de `ToolsPage.jsx`.)

- [ ] **Step 3 : la page**

```jsx
// src/tools/essai-enregistrement/index.jsx
export { EssaiEnregistrement as default } from './EssaiEnregistrement'
```

```jsx
// src/tools/essai-enregistrement/EssaiEnregistrement.jsx
import { useState, useEffect, useRef } from 'react'
import { Bot, Square, RotateCcw, Camera, Copy, Trash2, Download } from 'lucide-react'
import { enregistrementPossible, demarrerEnregistreur } from '../../modules/chantier/comptes-rendus/enregistrement/enregistreur'
import { rangerMorceau, lireMorceaux, dernierEnregistrement, effacerEnregistrement } from '../../modules/chantier/comptes-rendus/enregistrement/audioLocal'
import { dureeLisible, bilanEssai, extensionDe } from '../../modules/chantier/comptes-rendus/enregistrement/enregistrementLogique'

// ─── Essai d'enregistrement (visite enregistrée, lot 0) ──────────────────────
//
// Avant de construire le robot du mode Visite, on vérifie sur le terrain ce
// que Safari et Chrome tiennent : une heure, écran verrouillé, photo prise,
// app installée. Rien ne quitte l'appareil ; le bilan se copie dans la
// conversation.

const DUREES = [{ ms: 60_000, libelle: '1 min (essai rapide)' }, { ms: 300_000, libelle: '5 min (comme en vrai)' }]

function navigateurLisible() {
  const ua = navigator.userAgent
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const appareil = ipad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'appareil'
  const nav = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Safari/.test(ua) ? 'Safari' : 'navigateur'
  return `${nav} ${appareil}`
}
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

const bouton = (fond, texte, bord = 'none') => ({
  minHeight: 44, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 8,
  border: bord, borderRadius: 3, background: fond, color: texte, fontSize: 13, cursor: 'pointer',
})

export function EssaiEnregistrement() {
  const [dureeMorceau, setDureeMorceau] = useState(DUREES[0].ms)
  const [etat, setEtat] = useState('pret') // pret | enregistre | coupe | arrete
  const [niveau, setNiveau] = useState(0)
  const [maintenant, setMaintenant] = useState(Date.now())
  const [morceaux, setMorceaux] = useState([])
  const [evenements, setEvenements] = useState([])
  const [erreur, setErreur] = useState(null)
  const [copie, setCopie] = useState(null)
  const session = useRef(null) // { id, debut, fin, moteur, format, verrouEcran }
  const urls = useRef(new Map())

  const ajouterEvenement = (e) => setEvenements((liste) => [...liste, e])

  // Un essai interrompu par un rechargement se relit : c'est ce qu'on teste
  useEffect(() => {
    let annule = false
    dernierEnregistrement().then(async (id) => {
      if (!id || annule) return
      const lus = await lireMorceaux(id)
      if (annule || lus.length === 0) return
      session.current = { id, debut: lus[0].debut, fin: lus.at(-1).debut + lus.at(-1).duree_s * 1000, format: lus[0].type }
      setMorceaux(lus)
      setEtat('arrete')
    }).catch((err) => setErreur(`Lecture des essais précédents impossible : ${err?.message ?? err}`))
    return () => { annule = true }
  }, [])

  useEffect(() => {
    if (etat !== 'enregistre') return undefined
    const minuterie = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(minuterie)
  }, [etat])

  useEffect(() => () => {
    session.current?.moteur?.arreter()
    for (const u of urls.current.values()) URL.revokeObjectURL(u)
  }, [])

  const lancer = async (reprise = false) => {
    setErreur(null)
    if (!reprise) {
      session.current = { id: crypto.randomUUID(), debut: Date.now() }
      setMorceaux([])
      setEvenements([])
    }
    const s = session.current
    try {
      const moteur = await demarrerEnregistreur({
        dureeMorceauMs: dureeMorceau,
        rangDepart: (morceaux.at(-1)?.rang ?? 0) + 1,
        onNiveau: setNiveau,
        onEvenement: (e) => {
          ajouterEvenement(e)
          if (e.type === 'piste-terminee') setEtat('coupe')
        },
        onMorceau: async (m) => {
          const morceau = { ...m, id: crypto.randomUUID(), enregistrementId: s.id }
          setMorceaux((liste) => [...liste, morceau])
          try { await rangerMorceau(morceau) } catch (err) {
            ajouterEvenement({ t: Date.now(), type: 'erreur', detail: `rangement : ${err?.message ?? err}` })
          }
        },
      })
      s.moteur = moteur
      s.format = moteur.format
      s.verrouEcran = moteur.verrouEcran
      if (reprise) ajouterEvenement({ t: Date.now(), type: 'reprise' })
      setEtat('enregistre')
    } catch (err) {
      setErreur(err?.name === 'NotAllowedError'
        ? 'Micro refusé : autorisez-le pour ce site dans les réglages du navigateur.'
        : `Impossible de démarrer : ${err?.message ?? err}`)
    }
  }

  const arreter = async () => {
    const s = session.current
    await s?.moteur?.arreter()
    if (s) { s.fin = Date.now(); s.moteur = null }
    setNiveau(0)
    setEtat('arrete')
  }

  const effacer = async () => {
    if (session.current?.id) await effacerEnregistrement(session.current.id)
    for (const u of urls.current.values()) URL.revokeObjectURL(u)
    urls.current.clear()
    session.current = null
    setMorceaux([])
    setEvenements([])
    setCopie(null)
    setEtat('pret')
  }

  const urlDe = (m) => {
    if (!urls.current.has(m.id)) urls.current.set(m.id, URL.createObjectURL(m.blob))
    return urls.current.get(m.id)
  }

  const s = session.current
  const bilan = s ? bilanEssai({
    debut: s.debut, fin: s.fin ?? maintenant, morceaux, evenements,
    environnement: { navigateur: navigateurLisible(), installee: estInstallee(), verrouEcran: s.verrouEcran ?? 'inconnu', format: s.format },
  }) : null

  const copier = async () => {
    try { await navigator.clipboard.writeText(bilan.texte); setCopie('copié') } catch { setCopie('manuel') }
  }

  if (!enregistrementPossible()) {
    return <p style={{ fontSize: 13, color: '#B8412C' }}>Ce navigateur ne sait pas enregistrer le son.</p>
  }

  const enCours = etat === 'enregistre'
  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 4px', color: '#1F1B17' }}>Essai d’enregistrement</h1>
        <p style={{ fontSize: 12, color: '#7A736E', margin: 0, lineHeight: 1.5 }}>
          Lancez l’enregistrement, puis vivez la visite normalement : verrouillez l’écran, prenez une photo, passez à une autre
          app, revenez. À la fin, arrêtez et copiez le bilan. Rien ne quitte cet appareil.
        </p>
      </div>

      {etat === 'pret' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DUREES.map((d) => (
            <button key={d.ms} type="button" onClick={() => setDureeMorceau(d.ms)}
              style={bouton(dureeMorceau === d.ms ? 'var(--jga-green-light)' : 'white', '#1F1B17', `0.5px solid ${dureeMorceau === d.ms ? 'var(--jga-green)' : 'rgba(0,0,0,0.15)'}`)}>
              Morceaux de {d.libelle}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: 16, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <button type="button" onClick={enCours ? arreter : () => lancer(false)}
          aria-label={enCours ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}
          style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer', background: enCours ? '#B8412C' : 'var(--jga-green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {enCours ? <Square size={24} /> : <Bot size={30} />}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          {enCours ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500, color: '#B8412C' }}>
                <span className="jga-enregistre" style={{ width: 10, height: 10, borderRadius: '50%', background: '#B8412C' }} />
                Enregistrement · {dureeLisible((maintenant - s.debut) / 1000)}
              </span>
              <span aria-label="Niveau du son" style={{ width: 180, height: 6, background: '#EEE9E4', borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round(niveau * 100)}%`, background: 'var(--jga-green)', transition: 'width 0.1s linear' }} />
              </span>
            </>
          ) : (
            <span style={{ fontSize: 14, color: '#5E5854' }}>
              {etat === 'coupe' ? 'Le micro a été coupé.' : etat === 'arrete' ? 'Enregistrement arrêté.' : 'Prêt.'}
            </span>
          )}
        </div>
        {etat === 'coupe' && (
          <button type="button" onClick={() => lancer(true)} style={bouton('#F59E0B', 'white')}><RotateCcw size={16} /> Reprendre</button>
        )}
        <label style={{ ...bouton('white', '#1F1B17', '0.5px solid rgba(0,0,0,0.15)'), marginLeft: 'auto' }}>
          <Camera size={16} /> Prendre une photo
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={(e) => { ajouterEvenement({ t: Date.now(), type: 'photo', detail: e.target.files?.length ? 'prise' : 'annulée' }); e.target.value = '' }} />
        </label>
      </div>

      {erreur && <p role="alert" style={{ fontSize: 13, color: '#B8412C', margin: 0 }}>{erreur}</p>}

      {morceaux.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 10px' }}>Morceaux enregistrés</p>
          {morceaux.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 12, width: 150 }}>n° {m.rang} · {dureeLisible(m.duree_s)} · {Math.round(m.taille / 1000)} Ko</span>
              <audio controls preload="none" src={urlDe(m)} style={{ height: 32, maxWidth: '100%' }} />
              <a href={urlDe(m)} download={`essai-${m.rang}.${extensionDe(m.type)}`} style={{ ...bouton('white', '#1F1B17', '0.5px solid rgba(0,0,0,0.15)'), textDecoration: 'none' }}>
                <Download size={14} /> Télécharger
              </a>
            </div>
          ))}
        </div>
      )}

      {bilan && (
        <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copier} disabled={enCours} style={bouton('var(--jga-green)', 'white')}><Copy size={16} /> Copier le bilan</button>
            <button type="button" onClick={effacer} disabled={enCours} style={bouton('white', '#B8412C', '0.5px solid rgba(184,65,44,0.4)')}><Trash2 size={16} /> Effacer l’essai</button>
            {copie === 'copié' && <span style={{ fontSize: 12, color: 'var(--jga-green)', alignSelf: 'center' }}>Copié : collez-le dans la conversation.</span>}
            {copie === 'manuel' && <span style={{ fontSize: 12, color: '#7A736E', alignSelf: 'center' }}>Sélectionnez le texte ci-dessous et copiez-le.</span>}
          </div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0, padding: 10, background: '#FAF7F2', userSelect: 'text' }}>{bilan.texte}</pre>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4 : lint, tests, build**

Run : `npx eslint src 2>&1 | tail -1 && npm test 2>&1 | grep -E "^ℹ (pass|fail)" && npm run build`
Attendu : 73 problèmes (aucun nouveau), tous les tests passent, build réussi.

- [ ] **Step 5 : vérification au navigateur (Chrome de bureau, Playwright)**

Monter la page par un banc temporaire `src/_essai_enregistrement.jsx` sur
`http://localhost:5287/login` (méthode habituelle du dépôt), avec un faux
micro : lancer Chromium avec `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream`, ou, à défaut, remplacer
`navigator.mediaDevices.getUserMedia` dans la page par un flux d'un
`OscillatorNode` (`AudioContext.createMediaStreamDestination().stream`).
Vérifier : démarrage, durée qui avance, niveau non nul, un morceau rangé
après 1 minute (ou en raccourcissant `DUREES` le temps du test), lecture,
rechargement → les morceaux reviennent, « Copier le bilan », « Effacer ».
Supprimer le banc ensuite.

- [ ] **Step 6 : commit et push**

```bash
git add src/tools/essai-enregistrement src/tools/manifest.js src/index.css
git commit -m "feat: outil « Essai d'enregistrement » — tester l'enregistrement d'une visite sur l'appareil"
git push origin main
```

---

### Task 5 : documentation et mode d'emploi de l'essai

**Files :**
- Modify : `CLAUDE.md` (section « Comptes rendus de chantier », nouvelle puce « Visite enregistrée »)

- [ ] **Step 1 : CLAUDE.md**

Ajouter après la puce « Visite hors ligne » :

```markdown
- **Visite enregistrée** (en cours, conception :
  `docs/superpowers/specs/2026-10-05-visite-enregistree-ia-design.md`) :
  `enregistrement/` — logique pure (`enregistrementLogique.js`, testée),
  moteur (`enregistreur.js` : un `MediaRecorder` relancé à chaque morceau,
  chaque morceau est un fichier complet), morceaux dans IndexedDB
  (`audioLocal.js`, base à part `jga-audio`). Lot 0 : l'outil « Essai
  d'enregistrement » mesure ce que tiennent Safari et Chrome sur le terrain.
```

- [ ] **Step 2 : commit et push**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — visite enregistrée, lot 0"
git push origin main
```

## Écarts constatés pendant la réalisation

- **Tranches d'une seconde gardées aussi** (`rangerTranche`,
  `recupererMorceaux`, `regrouperTranches` testée) : sans elles, une page
  fermée par Safari perdait tout le morceau en cours (jusqu'à 5 minutes) —
  précisément le risque que l'essai doit mesurer. Au retour, le morceau
  interrompu est recollé, à une seconde près. Base `jga-audio` en version 2
  (magasins `morceaux` et `tranches`).
- **Journal gardé dans `localStorage`** : après une fermeture, le bilan dit
  encore ce qui s'est passé juste avant (`page-rechargee`,
  `morceau-recupere`).
- **État de la page dans le state React**, le moteur seul en `useRef` : le
  contrôle du compilateur React refuse la lecture de références pendant
  l'affichage.
- Bilan masqué pendant l'enregistrement, avec le débit en Ko par minute.
- Constat sur Chrome Mac : AAC choisi, **≈ 800 Ko par minute** (le débit
  demandé de 32 kbit/s est ignoré), soit ≈ 4 Mo pour 5 minutes — à la limite
  des fonctions Vercel. Le lot 1 devra raccourcir les morceaux ou préférer
  Opus selon ce que donnent les iPad.

- Premiers essais de Victor (Safari, iPad, app installée) : AAC à
  ≈ 250 Ko par minute (le débit demandé est respecté), écran maintenu
  allumé obtenu. **Verrouiller l'écran coupe le micro** : piste muette
  aussitôt, terminée 4 s plus tard. D'où la **reprise automatique** au
  retour de la page (`fermer('fin-du-moteur')` libère le moteur coupé, un
  effet en relance un autre) — reste à savoir si iOS l'accepte sans appui.

Fin du lot 0 : Victor fait l'essai (protocole donné dans la réponse de fin
de tâche) et colle les bilans ; le plan des lots 1 à 3 s'écrit ensuite.
