# État des lieux — lot 3 « Analyser » : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal :** ce qui a été dit pendant la visite devient, pièce par pièce, une fiche (sol, murs, plafond, plinthes, HSP, remarques) et des éléments typés rattachés aux points touchés ; l'agence relit et valide au bureau.

**Architecture :** les morceaux audio de la visite (déjà rangés sur l'appareil, base `jga-audio`, marqués `edlVisiteId`) sont transcrits par Mistral **avec horodatage par segment** ; chaque phrase reçoit son heure absolue (heure de début du morceau + décalage). À la sortie d'une pièce — ou plus tard, au retour du réseau — une **frise** (phrases et gestes du journal intercalés par l'heure) part à Claude (`api/analyser-edl.js`, sortie JSON imposée) qui rend la fiche et les éléments ; ils s'écrivent comme **propositions** (`a_valider`) que l'agence valide, modifie ou écarte. Ce qui reste à analyser se **déduit des données** (entrées dans la pièce postérieures à sa dernière analyse), sans file de plus.

**Tech Stack :** React 19 + Vite, Supabase (migration manuelle 082), fonctions Vercel Node, `@anthropic-ai/sdk`, Mistral `voxtral-mini-latest`, IndexedDB, `node --test`.

**Spec :** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` § 2 (Analyse, Couleur des pièces, Relecture), § 5, § 6, § 8, § 9, § 10 (lot 3).

## Global Constraints

- Français partout (écran, commentaires qui disent pourquoi). Styles inline, charte : `--affaire-accent`, bordures 0,5 px, angles 2–3 px, rouge `#B8412C`, ambre `#FFFBEB` / `#92400E`. Une fenêtre ne se ferme jamais au clic à côté. Cibles de 44 px au moins sur tablette.
- **Dépôt public** : aucun nom réel, aucune transcription réelle, données de test inventées.
- Clés côté serveur seulement : `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` (jamais `VITE_`). Claude : `claude-opus-5-5`, beta `server-side-fallback-2026-07-01` + `fallbacks: 'default'`, `output_config.format` JSON schema, `client.beta.messages.stream(...).finalMessage()`, accès `verifierAgence` / `jetonDe` (`api/_agence.js`) — modèle exact : `api/edl-pieces.js`. **Aucune entrée dans `vercel.json`.** Corps < 4,5 Mo.
- **Mistral (vérifié dans sa documentation le 2026-11-18)** : `timestamp_granularities=segment` rend `segments: [{ start, end, text }]` (secondes depuis le début du fichier) et **n'est pas compatible avec `language`** : pour l'état des lieux, envoyer `timestamp_granularities` **sans** `language` ; garder le repli « sans `context_bias` » existant ; si Mistral refuse l'horodatage, repli sur le texte seul (un segment couvrant le morceau). Le mode des CR (texte seul, `language=fr`) ne change pas.
- Un morceau audio est continu (une pause ouvre un nouveau morceau, `useEnregistreur.pause`) : heure d'une phrase = heure de début du morceau sur l'appareil + `start`.
- Migrations passées **à la main** : le code tolère l'absence de la 082 (message « L'analyse demande la migration 082 », rien ne casse au lot 2). Toute nouvelle table : `grant select, insert, update, delete … to authenticated` et `to service_role` (pas `anon`), règle « Agence » `est_agence()`, règles **restrictives** `peut_modifier_affaire(affaire_id)` en insert / update / delete (bloc de la 079 rejoué). Identifiants décidés sur l'appareil quand une ligne naît hors ligne.
- Supabase ne lève pas : lire `{ error }` ; un refus RLS ne rend pas d'erreur → **compter les lignes** (`.select()`) sur update / delete. Lectures qui décident d'une écriture : alias `synchro_id:id` (hors cache du service worker).
- Rien d'enregistré ne se calcule dans un `setState(prev => …)`.
- Le son n'est jamais gardé en ligne : effacé de l'appareil après une transcription réussie.
- Les comptes rendus (robot, transcription, `cr_enregistrements`) ne changent pas de comportement.
- `npm test` vert, `npm run build` réussi, ESLint sans problème ajouté (~72 préexistants). Commits `feat:` / `fix:` / `test:` / `docs:` finissant par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne jamais pousser.

---

### Task 1 : Migration 082 et accès aux données de l'analyse

**Files :**
- Create : `supabase/migrations/082_edl_analyse.sql`
- Create : `src/modules/etude/etat-des-lieux/analyse/analyseDonnees.js`
- Test : `tests/etat-des-lieux-analyse.test.js` (fonctions pures seulement)

**Migration 082 (rejouable) :**
- `edl_enregistrements` : `id text primary key` (identifiant du morceau sur l'appareil), `visite_id uuid not null references edl_visites(id) on delete cascade`, `affaire_id uuid not null references affaires(id) on delete cascade`, `debut timestamptz not null` (début du morceau, heure de l'appareil), `duree_s numeric`, `segments jsonb not null default '[]'` (`[{ debut_s, fin_s, texte }]`, secondes depuis `debut`), `texte text not null default ''`, `horodate boolean not null default true` (faux si Mistral n'a rendu que le texte), `created_at`.
- `edl_elements` : `id uuid primary key` (décidé côté client), `affaire_id`, `niveau_id uuid references edl_niveaux on delete cascade`, `piece_id uuid references edl_pieces on delete cascade`, `point_id uuid references edl_points(id) on delete set null`, `calque text not null`, `type text`, `libelle text not null default ''`, `cotes text`, `extrait text`, `a_valider boolean not null default true`, `a_verifier boolean not null default false`, `origine text not null default 'ia' check (origine in ('ia','main'))`, `valide_le timestamptz`, `created_at`, `updated_at`.
- `edl_pieces` : `add column if not exists analyse_le timestamptz`, `analyse_erreur text`, `fiche_a_valider boolean not null default false`.
- Index utiles (`edl_enregistrements(visite_id, debut)`, `edl_elements(piece_id)`), droits, RLS (« Agence » + 3 restrictives, comme la 079), `fichiers_orphelins()` inchangée (aucun fichier), `notify pgrst, 'reload schema'`.

**`analyseDonnees.js`** (navigateur ; replis si la 082 manque : `analyseIndisponible(error)` sur 42P01 / PGRST205 / « relation … does not exist », et colonnes manquantes) :
- `lireAnalyse(affaireId)` → `{ enregistrements, elements, pieces (id, fiche, analyse_le, analyse_erreur, fiche_a_valider) }` en lectures `synchro_id:id`, paginées par identifiant (1 000) ;
- `enregistrerTranscription(ligne)` (upsert par `id`) ;
- `ecrireResultatAnalyse({ affaireId, piece, fiche, elements, analyseLe })` : supprime les éléments `origine = 'ia' and a_valider` de la pièce (**lignes comptées**), insère les nouveaux, met à jour `fiche`, `fiche_a_valider = true`, `analyse_le`, `analyse_erreur = null` (lignes comptées ; 0 ligne → erreur « Lecture seule »). Les éléments validés ne sont jamais touchés ;
- `noterErreurAnalyse(pieceId, message)` ;
- `validerElement(id, champs?)` (modifier vaut validation : `a_valider=false`, `valide_le=now()`), `ecarterElement(id)` (suppression comptée), `ajouterElement(ligne)` (origine `main`, déjà validé), `modifierFiche(pieceId, fiche, { valider })`.

**Tests (purs)** : `analyseIndisponible` (codes), et toute fonction pure extraite (par ex. construction des lignes à insérer depuis un résultat).

Commit : `feat: état des lieux — analyse : migration 082 et accès aux données`.

---

### Task 2 : Transcription horodatée des morceaux de la visite

**Files :**
- Modify : `api/transcrire.js` — en-tête `X-Horodatage: segment` : `timestamp_granularities=segment`, **sans** `language` ; si Mistral refuse (4xx), une seconde demande sans horodatage et **avec** `language=fr` ; réponse `{ texte, segments: [{ debut_s, fin_s, texte }] | null }`. Sans l'en-tête : comportement actuel, octet pour octet.
- Create : `src/modules/etude/etat-des-lieux/analyse/transcriptionEdlLogique.js` (pur) : `ligneTranscription(morceau, reponse)` → ligne `edl_enregistrements` (`id` = id du morceau, `debut` ISO = heure de début du morceau, `segments` nettoyés et bornés à la durée, `horodate`), `heureSegment(ligne, segment)` → ms epoch, `morceauxAPurger(morceaux, visitesConnues, maintenant)` (morceaux d'une `edlVisiteId` absente de la base, plus vieux de 10 minutes — démarrage refusé, report du lot 2).
- Create : `src/modules/etude/etat-des-lieux/analyse/transcriptionEdl.js` : `transcrireEdlEnAttente({ edlVisiteId } | null)` — morceaux `jga-audio` de l'état des lieux (`morceauxEnAttente({ edlVisiteId })`, ou tous ceux qui portent un `edlVisiteId`), un à la fois, dans l'ordre, sous Web Lock `jga-transcription-edl` ; envoi avec `X-Horodatage: segment` (même appel serveur que les CR : réutiliser/étendre `appelerTranscription` de `transcription.js` par un paramètre, sans changer son comportement pour les CR) ; `enregistrerTranscription` puis `effacerMorceau` ; refus compté (`marquerEchec`, `ECHECS_MAX`) ; arrêt sur réseau / session / configuration ; purge des morceaux orphelins (lecture en ligne des visites, `synchro_id:id`). Signale `jga-transcription-edl` (événement fenêtre) après chaque morceau.
- Modify : `visite/useEnregistrementEdl.js` — après chaque morceau rangé, si en ligne, lancer `transcrireEdlEnAttente({ edlVisiteId })` (sans attendre) ; `enAttente` continue de compter.
- Modify : `visite/synchroEdl.js` `envoyerToutEdl` — après la file des gestes, `transcrireEdlEnAttente(null)` (chargé à la demande).
- Test : `tests/etat-des-lieux-analyse.test.js`.

Vérifier dans `audioLocal.js` / `enregistreur.js` le nom exact du champ qui porte l'heure de début du morceau ; s'il manque sur le morceau rangé, l'ajouter (champ facultatif, sans effet sur les CR).

Commit : `feat: état des lieux — transcription horodatée des morceaux de visite`.

---

### Task 3 : Logique de l'analyse et fonction serveur Claude

**Files :**
- Create : `src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js` (pur, partagé avec le serveur : imports avec `.js`)
- Create : `api/analyser-edl.js`
- Test : `tests/etat-des-lieux-analyse.test.js`

**`analyseEdlLogique.js` :**
- `intervallesPiece(evenements, pieceId)` → `[{ debut, fin }]` (ms) : chaque `entree` de la pièce jusqu'à la `sortie` suivante, sinon jusqu'à l'événement suivant d'une autre pièce / `fin` / `pause` non reprise / dernier événement de la visite (le bouton Retour du navigateur ne note pas de fin — report du lot 2). Plusieurs visites, plusieurs entrées.
- `friseDePiece({ piece, intervalles, evenements, points, enregistrements, elementsValides })` → `{ lignes: string[], references: Map('P7' → point_id) }` : lignes `[hh:mm:ss] …` triées par heure — gestes du journal de la pièce (« point P7 posé (type choisi : Interrupteur) », « point P7 déplacé », « point P7 supprimé », « photo du point P7 ») et phrases dont l'heure tombe dans un intervalle (une phrase à cheval est gardée si son milieu y tombe). Points désignés par `P<numero>`. Les éléments déjà validés sont listés à part (« déjà relevé : … ») pour éviter les doublons.
- `aAnalyser(piece, evenements)` : une entrée dans la pièce postérieure à `analyse_le` (ou jamais analysée) **et** l'intervalle correspondant clos.
- `MODELE_ANALYSE = 'claude-opus-5-5'`, `SCHEMA_ANALYSE` (`additionalProperties: false` partout) : `{ fiche: { sol, murs, plafond, plinthes, hsp, remarques } (chaînes, vides si rien dit), elements: [{ point: string|null ('P7'), calque: enum codes de CALQUES_DE_POINT, type: enum codes de types (ou null), libelle, cotes, extrait, a_verifier: boolean }] }`.
- `CONSIGNES_ANALYSE` (français) : état des lieux d'un bâtiment existant ; un élément par chose dite et localisée ; rattacher à un point si la phrase suit de près sa pose (quelques secondes) ou le désigne ; type choisi au geste prioritaire sauf contradiction claire ; cotes telles que dites (« allège 90, largeur 120 ») ; extrait = mots entendus ; `a_verifier` si hésitation ; ne rien inventer ; fiche seulement d'après ce qui est dit ; ne pas répéter les éléments « déjà relevés ».
- `construireDemandeAnalyse({ piece: { nom, numero, surface }, lignes, dejaReleves })` (system + message utilisateur + `output_config` : `effort: 'medium'`, format json_schema), `lireAnalyse(resultat, references)` → `{ fiche, elements }` (types / calques validés contre `calquesEdl.js`, point inconnu → `null`, champs bornés en longueur).
- `completudeFiche(fiche)` → `{ complete, manquantes: ['plafond', …] }` (sol, murs, plafond, plinthes ; HSP facultative si `hsp_lue`) ; `etatAnalysePiece(piece, { visitee, attente })` → `'non-visitee' | 'attente' | 'complete' | 'incomplete' | 'echec'`.

**`api/analyser-edl.js`** : copie de forme d'`api/edl-pieces.js` ; valide la demande (pièce, lignes ≤ 2 000, longueur totale bornée) ; `max_tokens` 16000.

**Tests** : intervalles (entrées multiples, sortie manquante, pause), frise (ordre, phrase à cheval, références P), `aAnalyser`, schéma, `lireAnalyse` (type invalide, point inconnu), complétude et état.

Commit : `feat: état des lieux — frise de la pièce et analyse par Claude`.

---

### Task 4 : Lancer l'analyse et la montrer pendant la visite

**Files :**
- Create : `src/modules/etude/etat-des-lieux/analyse/analyseEdl.js` : `analyserPiece(affaireId, pieceId)` (lectures fraîches : journal, points, enregistrements, éléments validés de la pièce ; frise ; appel ; `ecrireResultatAnalyse` ; en échec `noterErreurAnalyse`) et `analyserEnAttente(affaireId)` : sous Web Lock `jga-analyse-edl`, pièces `aAnalyser` dont **plus aucun morceau de la visite n'attend sur l'appareil** pour la période de l'intervalle (morceaux non transcrits commençant avant la fin de l'intervalle) ; une pièce à la fois ; signale `jga-analyse-edl`. Silencieux hors ligne ou sans la 082.
- Create : `src/modules/etude/etat-des-lieux/analyse/useAnalyseEdl.js` : état de l'analyse pour une affaire (pièces, éléments, en cours), relu sur `jga-analyse-edl` / `jga-transcription-edl` / `online` ; déclenche `transcrireEdlEnAttente` puis `analyserEnAttente` à l'ouverture (en ligne).
- Modify : `visite/VisiteEdl.jsx` — à la sortie d'une pièce, après `couper()`, lancer (sans attendre, en ligne) transcription puis `analyserEnAttente` ; couleurs des pièces d'après `etatAnalysePiece` (grise, sablier = attente, verte, orange, rouge pâle = échec) ; pense-bête coché d'après la fiche (`penseBete(fiche)` existe).
- Modify : `visite/visiteLogique.js` (`COULEURS_PIECE` étendues : `attente`, `complete`, `incomplete`, `echec`) et `visite/PlanVisite.jsx` (sablier discret au centre d'une pièce en attente).
- Modify : `visite/synchroEdl.js` `envoyerToutEdl` — après la transcription, `analyserEnAttente` pour chaque affaire dont des morceaux viennent d'être transcrits.
- Test : `tests/etat-des-lieux-analyse.test.js` (règle pure « morceaux qui bloquent l'analyse d'un intervalle » extraite dans `analyseEdlLogique.js`).

Commit : `feat: état des lieux — analyse à la sortie de chaque pièce, couleurs et pense-bête`.

---

### Task 5 : Relecture au bureau

**Files :**
- Create : `src/modules/etude/etat-des-lieux/analyse/RelectureEdl.jsx` (+ composants à côté si besoin)
- Modify : `src/modules/etude/etat-des-lieux/index.jsx` — bascule « Pièces » / « Relecture » (onglets soulignés, comme les étages ; « Relecture » dès qu'une visite existe ; mémorisée dans l'adresse `?vue=relecture`).

**Écran :** par étage, liste des pièces avec leur couleur et un compte (« 3 éléments à valider »), triée : à valider d'abord. Une pièce ouverte :
- le plan agrandi sur la pièce (`VisionneusePlan` + `cadre` + vecteurs, points numérotés comme en visite, point choisi en surbrillance quand un élément est survolé / touché) ;
- la **fiche** (sol, murs, plafond, plinthes, HSP, remarques) modifiable, en surbrillance bleue tant que `fiche_a_valider` (style des propositions de l'IA des CR, `styleProposition`), bouton « Valider la fiche » ; rubriques manquantes signalées en orange ;
- les **éléments** groupés par calque : proposition en bleu avec extrait entendu, **Valider / Modifier / Écarter** (modifier = validation ; type, libellé, cotes, point rattaché par un menu des points de la pièce) ; « Ajouter un élément » (origine main) ; « Relancer l'analyse » (réanalyse complète de la pièce ; les éléments validés restent) ; erreur d'analyse affichée en rouge avec « Réessayer ».
- lecture seule (`lectureSeule`) : rien de modifiable.

Commit : `feat: état des lieux — relecture des pièces analysées`.

---

### Task 6 : Documentation et vérification finale

- `CLAUDE.md` section « État des lieux » : puce **Analyse (lot 3)** (migration 082, transcription horodatée sans `language`, frise, `aAnalyser` déduit des données, Web Locks, relecture) ; nombre de tests et de migrations (82 fichiers).
- Spec : § 6 et § 10, ce qui a été fait / changé.
- `npm test`, `npm run build`, `npx eslint src`.

Commit : `docs: état des lieux — lot 3 (analyse) dans CLAUDE.md et la conception`.
