# Visite enregistrée — lot 1 : enregistrer dans la visite et transcrire — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un robot dans la barre du mode Visite enregistre la réunion pendant
qu'on continue de saisir ses remarques ; chaque morceau est transcrit par
Mistral Voxtral dès qu'il y a du réseau, et la transcription se relit depuis
le CR. Un fichier du Dictaphone peut être importé à la place.

**Architecture :** les briques du lot 0 (`enregistreur.js`, `audioLocal.js`,
`enregistrementLogique.js`) sont reprises telles quelles. Un hook
`useEnregistrementVisite` les orchestre (moteur, reprise automatique, file
de transcription). Une fonction serveur `api/transcrire.js` vérifie la
session (agence seule) et parle à Mistral : la clé n'est jamais dans le
navigateur. La transcription est rangée dans `cr_enregistrements`
(migration 057), **jamais l'audio**.

**Tech Stack :** React 19, Vercel Functions (Node), Mistral
`/v1/audio/transcriptions` (`voxtral-mini-latest`), Supabase (table, RLS,
stockage privé temporaire), IndexedDB, `node --test`.

**Spec :** `docs/superpowers/specs/2026-10-05-visite-enregistree-ia-design.md`
(§ 1, 4, 5, 6, 7 lot 1). Lot 0 : `2026-10-05-visite-enregistree-lot0.md`.

## Global Constraints

- Français partout ; styles inline ; animations dans `index.css`.
- **Clé `MISTRAL_API_KEY` côté serveur seulement** (variable Vercel), jamais
  `VITE_`, jamais dans le dépôt (public).
- **L'audio ne va qu'à Mistral** ; rien d'audio dans Supabase, sauf le
  fichier importé, le temps de sa transcription (stockage `audio-temporaire`,
  effacé ensuite).
- Agence seule : le robot, la table, le stockage, la fonction.
- Le code tolère l'absence de la migration 057 (robot masqué) et de la clé
  (« transcription pas encore configurée »).
- Les remarques saisies à la main pendant l'enregistrement fonctionnent
  exactement comme avant : le robot ne bloque rien.
- Boutons ≥ 44 px ; `npm run build` passe ; lint à 73.
- Commit **et push** en fin de tâche.

## Décisions tirées du lot 0

- **Morceaux de 3 minutes** (et non 5) : Chrome sur ordinateur produit
  ≈ 800 Ko/min d'AAC, 5 minutes frôleraient la limite de 4,5 Mo des
  fonctions Vercel ; l'iPad (≈ 250 Ko/min) a de la marge.
- **Reprise automatique** après un écran verrouillé ou un changement d'app
  (iOS l'accepte sans appui) ; l'écran rappelle de ne pas verrouiller l'iPad.
- Format choisi par le navigateur, avec bascule AAC ↔ Opus si l'encodeur
  échoue (moteur du lot 0).

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/057_cr_enregistrements.sql` | Table, RLS agence, stockage `audio-temporaire` |
| `api/transcrire.js` | Fonction serveur : session agence → Mistral → texte |
| `src/modules/chantier/comptes-rendus/enregistrement/transcriptionLogique.js` | Pur : segments, état, texte, vocabulaire |
| `src/modules/chantier/comptes-rendus/enregistrement/transcription.js` | Navigateur : appel de la fonction, écriture de la ligne |
| `src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js` | + `crId` sur les morceaux, `morceauxEnAttente`, `effacerMorceau` |
| `src/modules/chantier/comptes-rendus/enregistrement/useEnregistrementVisite.js` | Hook : moteur, reprise, file de transcription |
| `src/modules/chantier/comptes-rendus/enregistrement/BoutonRobot.jsx` | Robot + indicateur compact du mode Visite, rappel RGPD |
| `src/modules/chantier/comptes-rendus/enregistrement/PanneauEnregistrements.jsx` | Liste, transcription, import d'un fichier, suppression |
| `ModeVisite.jsx`, `CrDetail.jsx` | Branchement (robot dans la barre ; vue « Enregistrements » au bureau) |
| `tests/transcription.test.js` | Tests de la logique pure |

---

### Task 1 : migration 057

`cr_enregistrements` : `id uuid primary key` (décidé sur l'appareil),
`cr_id → comptes_rendus on delete cascade`, `affaire_id → affaires on delete
cascade`, `created_by default auth.uid()`, `debut timestamptz`, `origine`
(`micro` / `fichier`), `format text`, `duree_s numeric default 0`,
`segments jsonb default '[]'`, `statut text default 'transcription'`,
`erreur text`, `created_at`, `updated_at`. Index sur `cr_id`.
RLS : une règle « agence » pour tout (`est_agence()`), rien d'autre.
Stockage `audio-temporaire` : privé, 50 Mo, types audio ; règle « Écriture
agence » sur `storage.objects` comme la migration 050. Rejouable,
`notify pgrst`.

### Task 2 : logique pure + tests

`transcriptionLogique.js` :
- `fusionnerSegment(segments, { rang, duree_s, texte })` → segments triés
  par rang, un seul par rang (le plus récent gagne).
- `texteTranscription(segments)` → texte des segments, dans l'ordre, séparés
  par une ligne vide ; un segment vide est sauté.
- `resumeEnregistrement(segments, enAttente)` → `{ transcrits, enAttente,
  duree_s, pret }` (`pret` : au moins un segment et rien en attente).
- `vocabulaireAffaire({ lots, interlocuteurs, zones })` → au plus 100 termes
  uniques (raisons sociales, noms de lots, noms et sociétés des
  interlocuteurs, zones), sans les vides, les plus courts d'abord exclus
  sous 3 lettres.
- `DUREE_MORCEAU_MS = 180_000`.

### Task 3 : fonction serveur `api/transcrire.js`

- `POST`, corps = l'audio (`application/octet-stream`), en-têtes
  `Authorization: Bearer <jeton Supabase>`, `X-Type-Audio`, `X-Vocabulaire`
  (JSON encodé URI, facultatif). Variante `?chemin=<affaire>/<fichier>` :
  fichier du stockage `audio-temporaire` (import), passé à Mistral par lien
  signé de 10 minutes, effacé ensuite quoi qu'il arrive.
- Vérifie la session (`/auth/v1/user`) puis `rpc/est_agence` avec le jeton
  de l'utilisateur ; sinon 401 / 403.
- Sans `MISTRAL_API_KEY` : 503 `{ erreur: 'transcription-non-configuree' }`.
- Morceau au-delà de 4,4 Mo : 413.
- Appel Mistral en `multipart/form-data` : `model=voxtral-mini-latest`,
  `language=fr`, `file` (ou `file_url`), `context_bias` répété par terme.
  Si Mistral refuse (4xx) avec le vocabulaire, une seconde tentative sans
  lui (le vocabulaire est expérimental en français).
- Réponse `{ texte }`.

### Task 4 : navigateur — rangement et transcription

- `audioLocal.js` : les morceaux portent `crId` et `affaireId` ;
  `morceauxEnAttente(crId)` et `effacerMorceau(id)`.
- `transcription.js` :
  - `transcrireMorceau(morceau, { vocabulaire })` → texte (appel de
    `/api/transcrire` avec le jeton de session) ; erreurs typées
    (`non-configuree`, `reseau`, `refus`).
  - `enregistrerSegment(enregistrement, segment)` : relit la ligne, fusionne,
    `upsert` (la ligne naît au premier segment transcrit : un enregistrement
    commencé sans réseau n'a besoin de rien d'autre).
  - `transcrireEnAttente(crId, contexte)` : prend les morceaux de ce CR dans
    l'ordre, transcrit, range, efface le morceau local ; s'arrête à la
    première erreur réseau.
  - `importerFichier(fichier, { crId, affaireId })` : dépôt dans
    `audio-temporaire`, appel `?chemin=`, segment unique, effacement.

### Task 5 : hook et écran

- `useEnregistrementVisite({ cr, affaireId, contexte, actif })` : états
  `pret | enregistre | coupe | arrete`, durée, niveau ; reprise automatique
  (effet sur `coupe`, comme l'essai) ; chaque morceau → IndexedDB puis
  transcription si en ligne ; au retour du réseau et à l'ouverture, la file
  repart ; `arreter()` à la fermeture du mode Visite.
- `BoutonRobot` : robot 44 px dans la barre ; en marche, point rouge animé +
  durée + barre de niveau, compacts ; premier démarrage de la session : un
  rappel « Prévenez les participants… / Ne verrouillez pas l'iPad pendant
  l'enregistrement » à confirmer ; un appui sur l'indicateur ouvre le
  panneau.
- `PanneauEnregistrements` : enregistrements du CR (début, durée, morceaux
  transcrits / en attente, état), « Lire la transcription », « Importer un
  enregistrement » (fichier audio ≤ 50 Mo), « Supprimer la transcription ».
- `ModeVisite` : robot dans la barre (agence, table présente, CR non émis).
- `CrDetail` : vue « Enregistrements » (agence, table présente).

### Task 6 : vérifications, documentation, livraison

Tests, lint, build ; navigateur avec faux micro et fonction simulée
(`page.route('**/api/transcrire**')`) ; CLAUDE.md ; commit, push. Victor :
migration 057, compte Mistral et clé dans Vercel (guidé).

## Écarts constatés pendant la réalisation

- Le rappel (prévenir les participants, ne pas verrouiller l'iPad) n'est pas
  une fenêtre à part : appuyer sur « Enregistrer » ouvre le panneau des
  enregistrements, qui le porte en tête avec « Commencer ». Tout est au même
  endroit, y compris quand on n'enregistre pas (transcriptions, import).
- Un morceau que Mistral refuse trois fois reste sur l'appareil, compté
  « refusé », sans bloquer la file.
- Vérifié au navigateur (faux micro, base et fonction simulées) : morceau →
  transcription (jeton de session, vocabulaire) → ligne en base → lecture ;
  sans clé (503) le morceau attend et « Transcrire maintenant » le rattrape ;
  suppression. La fonction serveur est vérifiée avec Supabase et Mistral
  simulés (401, 403, 503, vocabulaire refusé, import, chemin piégé).
- Reste à vérifier avec la vraie clé : format accepté par Voxtral (AAC,
  Opus), forme attendue de `context_bias` en multipart, durée d'un import
  d'une heure dans la limite d'une fonction Vercel.
