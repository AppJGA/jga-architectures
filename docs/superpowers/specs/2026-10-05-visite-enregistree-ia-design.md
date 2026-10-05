# Visite enregistrée : l'IA propose les remarques du CR

Demandé par Victor le 2026-10-05. Pendant une visite de chantier, l'iPad
enregistre toute la réunion ; à la fin, une IA en tire les remarques du compte
rendu, rangées selon nos règles. Chaque proposition apparaît en surbrillance
et doit être validée ou modifiée ; tant qu'il en reste une, le CR ne s'émet
pas.

**Exception budgétaire assumée** : l'agence n'utilise d'ordinaire aucune API
payante. Pour cette fonction, Victor accepte de payer des crédits (ordre de
grandeur : moins de 0,50 € pour une visite d'une heure).

## 1. Ce que voit l'utilisateur

### Enregistrer (mode Visite)

**Chrome autant que Safari** : plusieurs collaborateurs, dont Victor, ouvrent
l'app dans Google Chrome. Le robot fonctionne dans les deux, sur iPad comme à
l'ordinateur (et dans Edge). Sur iPad, Chrome repose sur le même moteur que
Safari (règle d'Apple) : mêmes possibilités, mêmes limites. Le format audio
est choisi selon le navigateur (§ 5).

- Un bouton **robot** dans la barre du mode Visite. Un appui : l'iPad demande
  le micro (la première fois), puis l'enregistrement démarre.
- **Indicateur permanent** tant que l'enregistrement tourne : point rouge qui
  respire, durée (`12:47`), petites barres du niveau sonore. Si les barres
  restent plates, le micro ne capte rien — on le voit tout de suite.
- **Rappel à l'oral** au démarrage : « Prévenez les participants que la
  réunion est enregistrée. » (obligation RGPD, § 6).
- Un second appui sur le robot arrête l'enregistrement.
- **Interruption** (écran verrouillé, photo prise, appel, autre app) : un
  bandeau orange « Enregistrement interrompu à 34:10 — Reprendre ». Ce qui a
  été enregistré avant est conservé ; la reprise ouvre un nouveau morceau
  dans le même enregistrement.
- L'écran reste allumé pendant l'enregistrement (verrou d'écran du
  navigateur).
- Sans réseau, l'enregistrement fonctionne : les morceaux attendent sur
  l'iPad et partent dès que le réseau revient.

### Solution de secours : importer un fichier

Safari peut couper le micro dans des cas qu'on ne maîtrise pas. Bouton
« Importer un enregistrement » (dans le panneau de l'enregistrement, sur iPad
comme à l'ordinateur) : un fichier de l'app **Dictaphone** de l'iPad, qui
enregistre même écran verrouillé, est ensuite transcrit d'un seul tenant
(chemin propre, § 5).

### Faire proposer les remarques

- À l'arrêt, un panneau résume : durée, morceaux transcrits (`12 / 13`), puis
  un bouton **« Proposer les remarques »**, actif quand tout est transcrit et
  que le réseau est là. Utilisable aussi plus tard, depuis l'ordinateur.
- Quelques dizaines de secondes plus tard, les propositions entrent dans le
  CR, **à leur place** : partie VI (équipe) ou VII (entreprises), sous leur
  destinataire, comme une remarque saisie à la main.
- Le coût estimé de l'analyse s'affiche (« ≈ 0,23 € »).

### Valider

- Une proposition est **mise en surbrillance, pas surlignée** (choix de
  Victor) : c'est toute la carte de la remarque qui ressort — bordure et halo
  d'une couleur réservée à l'IA (bleu), fond à peine teinté, pastille robot
  « Proposée — à valider » — et non son texte passé au marqueur. Cela évite
  aussi toute confusion avec la mise en forme « surligné » (jaune) qu'une
  remarque peut porter (migration 056). L'extrait de la réunion d'où elle
  vient est affiché dessous (« … le carreleur doit reprendre les joints de la
  salle de bain… »).
- Trois actions : **Valider**, **Modifier** (ouvre le panneau habituel ;
  enregistrer vaut validation), **Écarter** (la supprime).
- Un bandeau en tête du CR compte ce qui reste (« 7 propositions à valider »)
  avec « Aller à la suivante ».
- **Pas de « Tout valider »** : la demande est de relire chaque remarque une
  à une. Se rajoute facilement si l'usage le réclame.
- Même surbrillance et mêmes boutons au mode Visite et dans l'éditeur de
  bureau.
- **Émettre est impossible** tant qu'une proposition reste à valider : le
  bouton est grisé avec la raison à l'écran, et la base refuse de toute façon
  (§ 4).

### Ce que l'IA propose

- **De nouvelles remarques** : destinataire (lot ou interlocuteur), texte,
  statut, échéance (« pour vendredi » → date), zone si elle est nommée.
- **Des suites aux remarques existantes** (▶) quand on en reparle : « le lot
  03 a repris la descente EP » devient une suite de la remarque n° 41, avec
  son statut. Si la réunion dit que c'est réglé, la proposition porte « clore
  la remarque d'origine » — **la clôture ne s'applique qu'à la validation**.
- **Rien de ce qui est déjà noté** : les remarques saisies à la main pendant
  la visite lui sont données, elle ne les répète pas.
- **Destinataire incertain** : l'IA note la remarque **sans lot ni
  interlocuteur** plutôt que de deviner. Elle se range dans le groupe
  « À attribuer » de la partie VII (entreprises) — celui qui existe déjà pour
  les remarques sans destinataire — ou de la partie VI si la réunion la
  rattache clairement à l'équipe. Le collaborateur lui attribue ensuite son
  destinataire ; Valider demande de le choisir à ce moment-là (une remarque
  de l'agence a toujours un destinataire), et la remarque rejoint alors son
  groupe.
- Mise en forme (gras…), photos, pastilles : jamais proposées par l'IA.

## 2. Les services d'IA

| Étape | Service | Pourquoi | Coût indicatif (oct. 2026) |
|---|---|---|---|
| Audio → texte | **Mistral Voxtral** (transcription) | Très bon en français, société française, données traitées en Europe, le moins cher | ≈ 0,003 $/min → ≈ 0,20 € l'heure |
| Texte → remarques | **Claude Sonnet 5.5** (API Anthropic) | Suit des consignes longues, rend une structure fiable, contexte large | ≈ 2 $ / 10 $ le million de jetons → ≈ 0,10 € par visite |

Repli prévu si la transcription déçoit sur le bruit d'un chantier :
ElevenLabs Scribe (≈ deux fois le prix). Le reste ne change pas : la
transcription est isolée derrière une seule fonction serveur.

Deux comptes d'API, avec un **plafond de dépense
mensuel réglé chez chacun** (par exemple 10 €) : une erreur ne peut pas coûter
plus que ce plafond. Le compte Anthropic est **le compte personnel de
Victor** sur la console d'API d'Anthropic, distinct de l'abonnement Claude
servant au développement : la consommation y est facturée à part. Le compte
Mistral est à ouvrir. Les clés vivent dans les variables d'environnement de
Vercel (`MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`), **jamais en `VITE_`** (elles
seraient lisibles dans le code livré au navigateur), jamais dans le dépôt
(public) ni dans une conversation.

## 3. La façon d'écrire de l'agence

Pas d'entraînement de modèle : à chaque analyse, Claude reçoit des exemples
réels et un guide.

- **Exemples** choisis par l'app (fonction pure, testée) parmi les remarques
  **des CR émis**, écrites par l'agence : d'abord la dernière visite de la
  même affaire (continuité du vocabulaire), puis des remarques d'autres
  affaires pour les mêmes lots (rapprochés par le nom, comme l'import de
  planning) et les mêmes rôles. Une quarantaine au plus.
- **Guide de rédaction de l'agence** : un texte court (tournures, ton,
  abréviations, « L'entreprise doit… », dates « pour le … ») modifiable par
  l'agence. Premier jet rédigé avec Victor à partir de ses CR existants
  (ceux hors de l'app, PDF ou Word, servent ici une fois).
- **Vocabulaire** de l'affaire passé à la transcription si Voxtral l'accepte
  (noms des entreprises, des lots, des personnes, des zones) : c'est là que se
  perdent le plus de mots sur un chantier.

Plus il y aura de CR émis dans l'app, plus les propositions ressembleront à
ceux de l'agence.

## 4. Données (migration 057)

### Enregistrements

Table `cr_enregistrements` — un par enregistrement (une visite peut en avoir
plusieurs : interruption, fichier importé).

- `id` (décidé sur l'appareil, comme les lignes de visite hors ligne),
  `cr_id`, `affaire_id`, `created_by`, `debut`, `duree_s`, `origine`
  (`micro` / `fichier`), `statut` (`enregistrement` / `transcription` /
  `pret` / `analyse` / `erreur`), `format` (`audio/mp4`, `audio/webm`).
- `segments` jsonb : `[{ rang, duree_s, texte, transcrit_le }]` — le texte
  seulement, **jamais l'audio**.
- `analyse_le`, `cout_estime` (jetons, minutes), `erreur`.
- Règles RLS : **agence seule** (`est_agence()`), comme finances et FTM. Un
  intervenant extérieur ne voit ni le bouton ni la table.

La transcription reste attachée au CR (traçabilité : on peut relire d'où
vient une remarque). Elle se supprime avec le CR, et un bouton permet de
l'effacer plus tôt.

### Propositions

Une proposition **est une ligne de `cr_remarques`** (remarque ou suite), pour
profiter de tout l'existant : rangement par destinataire, hors ligne, PDF,
reprise. Colonnes ajoutées :

- `a_valider boolean not null default false` — vrai tant que la proposition
  n'est ni validée ni modifiée.
- `ia_extrait text` — le passage de la réunion qui la justifie.
- `ia_clore_origine boolean not null default false` — pour une suite : clore
  la remarque d'origine **au moment de la validation**.
- `enregistrement_id` → `cr_enregistrements` (`on delete set null`).

Valider = `a_valider := false` (et clôture de l'origine si demandée), par
`executerOperation` comme toute écriture de visite, donc aussi hors ligne.

### Verrou d'émission

Déclencheur sur `comptes_rendus` : passer à `emis` est refusé s'il reste une
ligne `a_valider` dans le CR (« Des remarques proposées restent à valider »).
L'écran prévient avant, mais c'est la base qui garantit. Une proposition ne
peut donc jamais atteindre un CR émis, ni être reprise dans la visite
suivante. Dans l'aperçu PDF d'un brouillon, elle est imprimée avec la mention
« (à valider) ».

Code tolérant tant que la migration n'est pas passée (règle du dépôt) : sans
les colonnes, le bouton robot ne s'affiche pas.

## 5. Fonctionnement technique

### Sur l'iPad

- Enregistrement par `MediaRecorder`, mono, ~32 kbit/s (≈ 15 Mo l'heure).
  Format selon le navigateur, par `MediaRecorder.isTypeSupported` : AAC
  (`audio/mp4`) quand il est disponible — Safari, Chrome sur iPad, Chrome
  récent ailleurs — sinon Opus (`audio/webm`), le format natif de Chrome. Le
  type réel est envoyé avec chaque morceau ; Voxtral accepte les deux (à
  confirmer au lot 0). L'enregistrement est **coupé en morceaux de 5
  minutes** : chaque morceau est un fichier complet,
  rangé aussitôt dans IndexedDB (nouveau magasin `audio` de `baseLocale.js`).
  Une coupure ne perd que le morceau en cours.
- Chaque morceau terminé part à la transcription dès qu'il y a du réseau,
  **pendant la visite** : à l'arrêt, il ne reste presque rien à transcrire.
  Un morceau transcrit est effacé de l'iPad.
- Verrou d'écran (`navigator.wakeLock`, Safari ≥ 16.4 et Chrome), repris à
  chaque retour au premier plan. Niveau sonore par un `AnalyserNode`. Animation du point rouge dans
  `index.css` (règle des animations du dépôt).
- Détection d'interruption : fin de piste, erreur de l'enregistreur, page
  masquée → bandeau « Reprendre ».

### Fonctions serveur (`api/`, Vercel)

- `api/transcrire.js` — reçoit un morceau (moins de 4 Mo : sous la limite de
  4,5 Mo des fonctions Vercel), l'envoie à Voxtral en français avec le
  vocabulaire, renvoie le texte.
- **Fichier importé** (Dictaphone, ≈ 30 Mo l'heure en qualité « compressée ») :
  trop gros pour passer par une fonction, et trop long à découper sur l'iPad
  (décoder une heure d'audio y demanderait des centaines de Mo de mémoire).
  Il est déposé **le temps de la transcription** dans un stockage privé
  `audio-temporaire` (`<affaire_id>/…`, règle du dépôt), la fonction donne à
  Voxtral un lien signé de quelques minutes, puis **efface le fichier**, en
  cas d'échec aussi. Plafond : 50 Mo par fichier (limite de l'offre gratuite
  de Supabase), au-delà l'écran demande la qualité « compressée » du
  Dictaphone. Un fichier oublié par un incident est retrouvé par
  `fichiers_orphelins()` (bouton « Nettoyer le stockage »).
- `api/analyser-visite.js` — reçoit la demande préparée par l'app, appelle
  Claude avec une **sortie structurée** (schéma JSON imposé), renvoie les
  propositions. Réponse **en flux** pour tenir dans la durée maximale d'une
  fonction ; si une réunion très longue la dépasse, l'analyse se fait par
  tranches de ~20 minutes.
- Les deux fonctions **vérifient la session** : jeton Supabase de
  l'utilisateur contrôlé auprès de Supabase, puis `est_agence()`. Sans cela,
  n'importe qui pourrait dépenser les crédits de l'agence.
- Limites par appel (taille du morceau, longueur du texte) contre une
  dépense accidentelle.

### Dans l'app, en fonctions pures testées

Même découpage que l'analyseur réglementaire : tout ce qui se calcule sans
modèle se teste sans navigateur.

- `enregistrementLogique.js` — états, morceaux, durées, ce qui reste à
  transcrire, ce que propose le panneau.
- `analyseIaLogique.js` :
  - `construireDemande` : transcription, lots, interlocuteurs, zones,
    remarques ouvertes (avec leur n°), remarques déjà saisies, exemples,
    guide. Chaque élément porte une **référence courte** (`L3`, `I2`, `R41`,
    `Z1`) : l'IA ne voit jamais d'identifiant de base.
  - `choisirExemples` : la sélection du § 3.
  - `lirePropositions` : relecture **tolérante** — référence inconnue →
    destinataire vide, statut inconnu → « À faire », date impossible →
    aucune ; jamais une erreur qui perdrait toute l'analyse.
  - `payloadsPropositions` : lignes `cr_remarques` prêtes à écrire
    (`a_valider`, `ia_extrait`, section par `rangerRemarque.js`).
- Tests : `tests/enregistrement.test.js`, `tests/analyse-ia.test.js` ; le
  verrou d'émission vérifié en base comme `pgtest/test050.mjs`.

## 6. Droit et confidentialité

- **Informer les participants** au début de la réunion (RGPD) : rappel à
  l'écran au démarrage. Proposition : une phrase optionnelle dans le CR,
  « Réunion enregistrée pour la rédaction du compte rendu ; enregistrement
  supprimé après transcription. »
- **L'audio ne quitte l'iPad que vers Mistral** (Europe), morceau par
  morceau, et n'est conservé nulle part : ni dans Supabase (stockage plafonné
  à 1 Go), ni sur l'iPad après transcription. Seule exception, le fichier
  importé : il séjourne quelques minutes dans le stockage privé
  `audio-temporaire`, effacé dès la transcription faite.
- Le **texte** de la réunion part chez Anthropic (États-Unis) pour l'analyse.
  Les données d'API n'y servent pas à entraîner les modèles. À mentionner
  dans l'information aux participants si l'agence le souhaite.

## 7. Découpage en lots

Chaque lot est livré seul et utilisable.

0. **Essai sur l'iPad (une demi-journée, rien de livré)** : une page d'essai
   qui enregistre par morceaux. Victor la teste sur chantier : écran
   verrouillé, photo prise, app installée et navigateur, une heure entière —
   **dans Safari et dans Chrome**, sur l'iPad et à l'ordinateur. On
   décide ensuite si le micro dans l'app tient, ou si le Dictaphone devient
   la voie principale.
1. **Enregistrer et transcrire** : bouton robot, indicateur, morceaux,
   reprise, import d'un fichier, `api/transcrire.js`, table
   `cr_enregistrements`. On peut relire la transcription.
2. **Proposer et valider** : `api/analyser-visite.js`, propositions en
   surbrillance, Valider / Modifier / Écarter, verrou d'émission.
3. **Style de l'agence** : choix des exemples, guide de rédaction modifiable,
   vocabulaire passé à la transcription.

Avant le lot 1 : ouverture des comptes Mistral et Anthropic, plafonds de
dépense, clés dans Vercel (Victor, guidé pas à pas).

## 8. Points ouverts

- Le comportement réel de Safari et de Chrome (lot 0) décide de la part entre micro de
  l'app et Dictaphone.
- Durée maximale d'une fonction Vercel sur l'offre de l'agence : à vérifier
  avant le lot 2 (sinon analyse par tranches dès le départ).
- Voxtral accepte-t-il un lien (et non le fichier lui-même) et une heure
  d'audio d'un tenant ? À vérifier au lot 1 ; sinon la fonction télécharge
  le fichier et l'envoie, ou on découpe côté serveur.
- La phrase d'information dans le CR : oui ou non, et sa formulation exacte,
  à relire avec l'agence.
