# Repères pour travailler sur ce dépôt

Gestionnaire d'affaires de l'agence JGA Architectures. React 19 + Vite
(rolldown), Supabase (base, auth, stockage), déployé sur Vercel depuis `main`.

Ce fichier existe pour éviter de re-explorer le dépôt à chaque tâche. Il donne
les points d'entrée ; le détail se lit dans les fichiers cités.

## Commandes

```
npm run dev      # serveur local, port 5173
npm run build    # doit passer avant tout commit
npm test         # 396 tests node --test (plannings, exports, comptes rendus, photos, plans, visite, rapport, diffusion, OPR)
npx eslint src   # ~73 problèmes préexistants : comparer, ne pas viser zéro
```

`npm test` couvre, dans `tests/` : les chemins critiques (`planning.test.js`,
`planning-etude.test.js`), la géométrie des barres du Gantt chantier
(`geometrie.test.js`) et les exports (`export.test.js`, `export-etude.test.js`,
`export-chantier-excel.test.js`), ainsi que la reprise et les compteurs des
comptes rendus (`comptes-rendus.test.js`, `photos.test.js`, `plans.test.js`,
`visite.test.js`, `rapport.test.js`, `diffusion.test.js`, `avancement.test.js`, `hors-ligne.test.js`, sur les fichiers `*Logique.js` du module ;
`opr.test.js`, `rapportOpr.test.js` et `pv.test.js` pour le module OPR). Rien ne couvre l'interface : la logique des
plannings est gardée dans des fonctions pures (`geometrie.js`, `propagation.js`,
`types.js` de chaque module) pour rester testable.

## Où se trouve quoi

| Écran | Fichier |
|---|---|
| Accueil (choix du module) | `src/pages/HomePage.jsx` |
| Portail des affaires | `src/dashboard/DashboardPage.jsx` + `AffaireCard.jsx` |
| Tableau de bord d'une affaire | `src/affaire/AffairePage.jsx` |
| Carnet d'adresses | `src/pages/CarnetAdressesPage.jsx` |
| Outils | `src/tools/` (manifeste dans `manifest.js`) |

- **Routes** : `src/core/router/AppRouter.jsx`. Tout est sous `RequireAuth` +
  `AppShell` sauf `/login` et `/_preview/home` (cette dernière n'existe qu'en
  développement, `import.meta.env.DEV`).
- **Coquille** : `src/core/layout/AppShell.jsx` (Topbar 52 px + Sidebar).
- **Modules d'affaire** : déclarés dans `src/modules/manifest.js` — deux phases
  (`etude`, `chantier`), chaque module a `enabled`, `path`, `icon`, un
  `component` en `lazy()`. Les tuiles du tableau de bord et la sidebar de
  l'affaire sont **générées depuis ce manifeste** : ajouter un module se fait
  là, pas dans `AffairePage.jsx`.
- **Accès aux données** : hooks dans `src/shared/hooks/`. `useAffaires()` pour
  la liste, `useAffaire(id)` pour une affaire (les deux font `select('*')`),
  `useAffaireCollaborateurs(id)` pour les droits (`canEdit`, `isProprietaire`).
- **Base** : `supabase/migrations/`, numérotées, 52 fichiers, **passées à la
  main** dans le SQL Editor de Supabase : un code qui dépend d'une nouvelle
  colonne doit tolérer son absence tant que la migration n'est pas faite. La photo de
  couverture d'une affaire est `affaires.photo_url` (migration 014, bucket
  public `affaires-photos`).

## Conventions

- **Français partout** : commentaires, messages de commit, noms de variables
  métier. Les commits suivent `feat:` / `fix:` / `chore:` / `test:`.
- **Styles inline**, pas de Tailwind. Les couleurs passent par les variables CSS
  de `src/index.css` (`--jga-orange`, `--jga-green`, `--jga-beige`…).
- **Animations** : les `@keyframes` et les classes d'entrée vivent dans
  `src/index.css`, jamais inline — seul le `animation-delay` est inline. C'est
  ce qui permet au bloc `prefers-reduced-motion` de les neutraliser.
- Les commentaires expliquent **pourquoi**, pas quoi. Un commentaire qui
  paraphrase la ligne suivante est du bruit.

## Comptes rendus de chantier

`src/modules/chantier/comptes-rendus/`, données par `useComptesRendus` (liste,
création avec reprise de la visite précédente) et `useCompteRendu` (un CR).

- **Un CR émis est verrouillé en base** (migration 037, déclencheurs
  `*_verrou_emis`) : toute écriture sur lui ou son contenu est refusée tant
  qu'il n'est pas rouvert. Les cascades (suppression d'affaire, fiche
  supprimée) passent grâce à `pg_trigger_depth() > 1`. Côté écran, le contexte
  `CrContexte` porte `lectureSeule` (CR émis ou affaire sans droit) et
  `signalerErreur` (bandeau rouge).
- **Historique** : une présence garde une copie du participant (`copie_*`), une
  remarque celle de son destinataire (`copie_destinataire`, tenue par un
  déclencheur). Afficher une présence passe par `affichagePresence`, jamais par
  les jointures seules : la fiche liée peut avoir été supprimée.
- **Statuts fixes** (migration 038, `STATUTS` de `crLogique.js`) : le statut
  décide seul de la clôture ; `est_clos` en est déduit par le déclencheur
  `cr_remarques_suivi`. Toujours lire un statut via `statutNormalise` /
  `infosStatut` : les anciennes lignes et un onglet d'avant la migration
  portent encore du texte libre. La correspondance est dupliquée en SQL
  (`cr_statut_normalise`) : modifier les deux ensemble.
- **Suivi d'une remarque** : ses copies de visite en visite partagent
  `suivi_id` et `numero`. Une remarque close revient une fois
  (`cloture_reportee` sur la copie), puis disparaît.
- **Photos** (migration 039, table `cr_photos`, stockage **privé** `cr-photos`,
  liens signés) : compressées sur l'appareil avant l'envoi
  (`compressionPhoto.js`, 1 920 px WebP ~300 Ko + miniature) — l'offre gratuite
  de Supabase plafonne le stockage à 1 Go. La reprise recopie la ligne, pas le
  fichier : plusieurs lignes partagent un `chemin`, et un fichier ne s'efface
  (`nettoyerFichiers`) que lorsque plus aucune ligne ne le désigne. Le stockage
  ne se purge pas en SQL : toute suppression qui emporte des photos doit
  appeler `nettoyerFichiers` après coup. Les fichiers restés orphelins malgré
  tout se retrouvent par `cr_photos_orphelines()` (migration 040, ignore ceux
  de moins d'une heure : envoi en cours) — bouton « Nettoyer le stockage » de
  l'écran d'export. Depuis la migration 041, `fichiers_orphelins()` couvre
  photos et plans.
- **Plans** (migration 041) : `affaire_plans` (commun à l'affaire) →
  `affaire_plan_versions` (indice A, B…, image convertie sur l'appareil par
  `conversionPlan.js`, 6 000 px et 16 Mpx au plus — plafond des iPad) →
  `cr_pastilles` (une par remarque, x/y relatifs, `version_id`). Une nouvelle
  version est reportée par la base sur les pastilles des brouillons ; les CR
  émis gardent la leur, et un plan ou une version qu'ils affichent ne se
  supprime pas. La visionneuse (`VisionneusePlan.jsx`) garde ses calculs de
  zoom dans `plansLogique.js`.
- **Aller vite à la visite** : sur le chantier, écrire une remarque doit
  demander deux gestes, pas cinq. La page de l'affaire porte un bandeau
  (`BandeauVisite.jsx`) qui reprend la visite en cours ou crée celle du jour ;
  `accesVisite.js` décide de ce qu'il propose et d'où il mène — mode Visite sur
  écran tactile, éditeur à la souris (`estTactile`). La liste des visites met
  la visite en cours en tête, avec ses deux portes.
- **Mode Visite** (`ModeVisite.jsx`, `PanneauxVisite.jsx`) : écran plein pour
  la tablette (iPad) ouvert par `?visite=1` ; le CR ouvert est aussi dans
  l'adresse (`?cr=`), pour survivre à un rechargement. Boutons de 44 px au
  moins. Ses panneaux s'ancrent en haut de l'écran (le clavier de l'iPad
  recouvre le bas). Remarques types de l'agence : table `remarques_types`
  (migration 042). Dictée : reconnaissance vocale du navigateur, bouton masqué
  si absente.
- **Rapport PDF** : vrai fichier fabriqué dans le navigateur par pdfmake
  (chargé à la demande, `genererRapport.js`). Tout le contenu se décide dans
  `rapportLogique.js` (sélection selon les réglages, `definitionPdf`), testé
  sans navigateur ; les images y arrivent en JPEG (pdfmake ne lit pas le WebP),
  préparées par `imagesRapport.js`. Roboto n'a pas certains symboles (▶, ✓) :
  s'en tenir aux caractères latins courants. À l'émission, le PDF est archivé
  (`cr_archives`, stockage privé `cr-archives`, migration 043) ; un échec
  d'archive n'empêche pas l'émission.
- **Diffusion** (`DiffusionCr.jsx`, migration 044) : pas de serveur d'envoi.
  L'e-mail s'ouvre dans la messagerie de l'utilisateur (lien `mailto:`) avec
  un lien signé de 30 jours vers le PDF archivé — un mailto ne peut pas porter
  de pièce jointe. Les versions par entreprise sont des archives avec
  `destinataire` renseigné, réutilisées pour la même émission ; seules celles
  sans destinataire sont listées comme archives d'émission. `cr_diffusions`
  note les e-mails préparés, pas envoyés.
- **Zones** (migration 047) : une remarque ou une réserve peut porter la zone
  du planning chantier qui la concerne (`zone_id`, + `copie_zone` pour
  l'historique). Affichage et filtre passent par `libelleZone` /
  `grouperParZone` (`crLogique.js`).
- **Lien vers une FTM** (migration 048) : une remarque ou une réserve donne
  une fiche de travaux modificatifs en un bouton (`ftm/creerDepuis.js`). La
  fiche garde son origine (`source_type`, `source_suivi_id`,
  `source_reserve_id`, `source_libelle`) ; le lien se relit des deux côtés par
  `ftm/lienFtm.js` et s'ouvre par `/affaires/:id/ftm?ftm=<id>`. Supprimer la
  remarque ou la réserve ne supprime pas la fiche : elle engage l'argent.
- **Avancement des lots** (migration 049, `avancementLogique.js`) : aucune
  saisie parallèle — les chiffres sont lus dans le planning chantier
  (`planning.avancement`), pondérés par la durée des tâches, et comparés à ce
  que le planning prévoyait pour la date de la réunion. Pointer une tâche
  depuis le CR ou le mode Visite écrit dans `planning`. À l'émission,
  l'instantané est recopié dans `comptes_rendus.avancement_lots` : le planning
  continue d'avancer, le CR garde les chiffres du jour.
- **Visite hors ligne** (`horsLigne/`, aucune migration) : ouvrir le mode Visite
  avec du réseau emporte la visite — instantané du CR et images (photos, plans)
  recopiés dans IndexedDB (`baseLocale.js`, `images.js`). Ensuite **toute
  écriture de visite passe par `executerOperation` de `useCompteRendu`** :
  appliquée à l'écran, puis envoyée, ou rangée dans la file si le réseau manque.
  Deux règles à ne pas casser : **l'identifiant des lignes créées est décidé sur
  l'appareil** (un envoi rejoué écrit la même ligne, un doublon `23505` vaut
  succès), et **l'ordre de création est l'ordre d'envoi**. Ce que la base
  calcule (numéro, `copie_*`, `est_clos`) manque tant que l'envoi n'a pas eu
  lieu : l'écran affiche « n° en attente », `fileLogique.js` recalcule
  `est_clos`. Une opération refusée trois fois est mise de côté (bandeau
  « refusée par la base », Réessayer / Abandonner) mais **reste appliquée à
  l'écran**. Hors ligne : ni création de CR, ni émission, ni PDF, et pas de
  ré-annotation d'une photo déjà envoyée.

## Fiches de travaux modificatifs (FTM)

`src/modules/chantier/ftm/`, données par `useFtm`. Une fiche naît du module
lui-même, d'une remarque de compte rendu ou d'une réserve d'OPR
(`creerDepuis.js`) — **dans tous les cas elle a sa ligne dans le suivi
financier** : `ligneFinanciereLogique.js` en décide la forme (référence
`FTM-012`, catégorie tirée de l'origine, statut tiré de la décision, montant
signé), `ligneFinanciere.js` l'écrit et referme le lien des deux côtés
(`ftm.ligne_financiere_id` ↔ `lignes_financieres.ftm_id`). Les fiches
orphelines sont rattrapées au chargement du module.

- **La table `ftm` n'a pas de colonne `intitule`** — c'est `lignes_financieres`
  qui en a une. Une fiche se décrit par `description`.
- Ses colonnes à liste fermée (`type_demande`, `motivation`,
  `incidence_delai_unite`, `decision`) acceptent une valeur connue ou `null`,
  **jamais une chaîne vide** : `payloadFtm` s'en charge, sans quoi la base
  refuse la fiche entière (`violates check constraint`).
- Le PDF est une page HTML imprimée par le navigateur : ses marges sont dans la
  page (`.feuille`), car « Marges : aucune » dans la boîte d'impression écrase
  `@page`.
- Le tableau du suivi financier se calcule dans
  `financier/tableauLogique.js` : **rien n'y disparaît**. Un lot sans marché de
  base garde ses lignes (elles comptaient dans les totaux sans s'afficher), et
  une ligne sans lot se range dans un bloc « Sans lot attribué » en fin de
  tableau.
- Vérifier une colonne sans deviner :
  `curl -H "apikey: $VITE_SUPABASE_ANON_KEY" "$VITE_SUPABASE_URL/rest/v1/ftm?select=<colonne>&limit=1"`
  — `[]` si elle existe, `42703` sinon.

## OPR et réserves

`src/modules/chantier/opr/`, données par `useOpr` (tout le module chargé en une
fois). Migration 045. Une réserve est **une ligne qui vit jusqu'à sa levée**
(contrairement aux remarques de CR, recopiées à chaque visite) ; son statut
est celui de son dernier constat (`opr_constats`, un par réserve et par
visite), tenu par un déclencheur. Ce qu'une visite de levée affiche se calcule
dans `groupesVisiteOpr` (statut avant la visite). Le module réutilise les
briques des comptes rendus : photos et plans passent par `PhotosContexte` et
`PlacementPlan` avec `remarque_id` = `reserve_id`, le PDF par les blocs
exportés de `rapportLogique.js` et `imagesDocument`, la diffusion par
`DiffusionDocument`.

Procès-verbaux (migration 046, table `opr_pv`, un par visite, lot et type) :
modèles dans `pvLogique.js` — PV des OPR, propositions du MOE et décision de
réception (CCAG Travaux, art. 41), PV de réception en marché privé (Code
civil, art. 1792-6), levée des réserves. Validés par l'agence le 2026-09-15 ;
toute modification de formulation se fait là et se relit avec elle. PDF à
signer à la main, archivé dans `cr-archives`.

## Accès des intervenants extérieurs

Des BET ou architectes extérieurs pourront consulter les comptes rendus des
seules affaires où ils sont invités et y ajouter leurs propres remarques
(photos, pastilles, suivis), sans jamais toucher à celles de l'agence ni voir
finances, FTM, plannings, OPR ou carnet d'adresses. Leurs remarques entrent
directement dans le CR, groupées et marquées à leur nom ; ils ouvrent les CR
émis et le brouillon en cours.

**Lot 1 fait (migration 050)** : les droits sont désormais tenus *en base*,
plus seulement à l'écran.

- `profiles.type_compte` — `agence` ou `exterieur`, **extérieur par défaut** :
  un compte créé et oublié ne voit rien. Le changer demande une session
  d'agence, ou l'éditeur SQL (`auth.uid()` nul y est traité comme
  l'administrateur).
- Les règles s'écrivent avec `est_agence()`, `membre_affaire(id)`,
  `acces_affaire(id)` et `affaire_du_cr(cr_id)` — fonctions `security definer`
  (elles lisent `profiles` et `affaire_collaborateurs` sans relancer leurs
  propres règles). **Toute nouvelle table passe par elles**, jamais par
  « tout utilisateur connecté ».
- Trois familles : *agence seule* (finances, FTM, plannings, OPR, carnet,
  outils, remarques types), *lecture des membres de l'affaire + écriture
  agence* (comptes rendus, remarques, photos, pastilles, plans, lots, zones),
  et le carnet limité aux entreprises qui interviennent sur ses affaires.
- Les fichiers suivent la même règle : le stockage est filtré sur le **premier
  dossier du chemin**, qui est l'identifiant de l'affaire (`<affaire_id>/…`).
  C'est pour cela qu'un chemin ne se construit jamais autrement.
- `created_by` (défaut `auth.uid()`) sur `cr_remarques`, `cr_photos`,
  `cr_pastilles` ; `preparerReprise` le recopie, une remarque reste à son auteur
  d'une visite à l'autre.
- Piège : **une seule règle permissive survivante annule tout le reste**.
  La migration retire explicitement les anciens noms (« Authenticated »,
  « Authenticated users », « Lecture affaires authentifiées »…). Vérifier aussi
  que chaque compte a bien une ligne dans `profiles` : sans elle,
  `est_agence()` est faux et l'utilisateur ne voit plus rien.
- Vérification : `pgtest/test050.mjs` (hors dépôt) rejoue la migration deux
  fois puis interroge la base sous l'identité d'un extérieur et d'un compte
  agence.

**Lot 2 fait (migration 051 + écran)** :

- `affaires` porte des montants (enveloppe, travaux, honoraires) et une règle
  RLS travaille par ligne, jamais par colonne : la table est donc **réservée à
  l'agence**, et un extérieur la lit par la vue `affaires_resume` (nom, code,
  adresse, maître d'ouvrage, photo). La vue n'est pas en `security_invoker` :
  elle filtre elle-même sur `acces_affaire(id)`. `useAffaires` / `useAffaire`
  choisissent la source selon le type de compte.
- `AuthProvider` expose `profil` et `estAgence`, et garde le dernier type connu
  dans `localStorage` — sans réseau (visite de chantier), l'écran ne se réduit
  pas faute d'avoir pu lire le profil.
- `phasesPour(estAgence)` (manifeste) filtre les modules : un extérieur ne voit
  que « Visites de chantier ». Même filtre dans la sidebar de l'affaire, les
  tuiles et la vue d'ensemble. `AgenceSeule` garde les routes carnet, heures et
  outils ; `useAffaireCollaborateurs` renvoie `canEdit = false` pour le rôle
  `exterieur`.
- Invitation : `CollaborateursSection`, le rôle découle du type du compte
  trouvé (extérieur → rôle `exterieur`). Le compte lui-même se crée dans
  Supabase (Authentication → Add user) ; son type reste « extérieur ».

**Lot 3 fait (migration 052)** : un intervenant écrit ses propres observations.

- Elles se rangent dans la section « Observations des intervenants »
  (`type_section = 'intervenants'`), créée à la demande par
  `section_intervenants(cr)` — un extérieur ne crée pas de section. La fonction
  est `security definer` et refuse un CR émis ou une affaire qui n'est pas la
  sienne.
- Règles RLS adossées à `created_by` : il ajoute, modifie et supprime **ses**
  lignes (remarques, photos, pastilles), photos et pastilles seulement sur
  **ses** remarques (`remarque_de_lauteur`). Un suivi, lui, s'ajoute sous
  n'importe quelle remarque : il ne la modifie pas. Le déclencheur
  `cr_auteur_fige` empêche de s'approprier une ligne de l'agence. Le verrou des
  CR émis (037) s'applique avant tout.
- Stockage : il dépose dans le dossier de son affaire et ne retire que ses
  propres fichiers (`owner`).
- Écran : `CrContexte` porte `contributeur`, `utilisateurId` et `profils` ;
  `peutModifierRemarque` / `peutOrganiser` / `auteurExterieur` (`crLogique.js`)
  décident des boutons affichés, dans l'éditeur comme en mode Visite. Une
  observation extérieure est signée à l'écran et dans le PDF.
- Attention : un refus RLS sur un `update` ou un `delete` **ne lève pas
  d'erreur**, il ne touche aucune ligne. Un test qui attend une exception passe
  à côté — compter les lignes (voir `pgtest/test050.mjs`).

## Pièges déjà rencontrés

- **Une animation CSS prime sur le style inline.** Un `animation: … both` fige
  l'élément sur sa dernière image et écrase ensuite tout `opacity` ou
  `transform` inline (survol, atténuation). Utiliser `backwards`, ou porter
  l'animation sur une enveloppe.
- **Un calque en `position: absolute; height: 100vh` compte dans le débordement
  défilable** et ajoute une barre de défilement fantôme quand le contenu est
  plus court que la fenêtre. Mesurer la hauteur du conteneur, ou passer par un
  arrière-plan.
- **`mix-blend-mode` est isolé par un contexte d'empilement.** Un parent avec
  `position: relative` *et* `z-index` suffit à le neutraliser.
- **Rien de ce qui doit être enregistré ne se calcule dans un `setState(prev => …)`.**
  React n'exécute cette fonction qu'au rendu suivant : une valeur « capturée »
  dedans est encore vide quand l'écriture Supabase part. Calculer d'abord depuis
  l'état courant, puis appliquer et enregistrer le même résultat.
- **Supabase ne lève pas d'exception** : l'échec est dans `{ error }` de la
  réponse. Un `try/catch` seul laisse passer les écritures ratées.
- **Un hook qui renvoie un objet neuf à chaque rendu ne se met pas dans les
  dépendances d'un `useCallback`.** `useHorsLigne` rendait `{ enLigne, file, … }`
  sans `useMemo` ; `fetchAll` en dépendait, changeait donc d'identité à chaque
  rendu, et son `useEffect` relançait le chargement en boucle — 500 rendus et
  200 requêtes en cinq secondes, la console noire d'erreurs. Dépendre des
  fonctions (stables) plutôt que de l'objet, et mémoriser l'objet rendu.
- **Jamais de `Math.floor` sur un écart en millisecondes entre deux dates.**
  Entre l'hiver et l'été, il manque une heure : un lundi tombait dans la
  semaine précédente. Utiliser `joursEntre` (`chantier/planning/geometrie.js`).
- **Plannings : une durée est en jours ouvrés** (semaines pour l'étude), hors
  week-ends et fermetures bloquantes. Toute fin de barre, d'export ou de délai
  passe par `dernierJourTache` ; ne jamais ajouter des jours calendaires à une
  durée.
- **Roue d'une barre de planning** (`shared/planning/MenuRadial.jsx`, commune
  aux deux plannings) : les pétales se placent par le calcul
  (`positionsPetales.js`, répartition égale depuis midi). Ajouter une action,
  c'est une ligne dans `ACTIONS` et un cas dans l'`actionMenu` de chaque
  timeline — jamais de coordonnées à recaler. Un segment ajouté d'un geste se
  pose selon `segmentParDefaut.js` de chaque planning, la même règle que le
  bouton de la fiche.
- **Un segment se manipule comme une barre** : toucher → sa roue
  (`ACTIONS_SEGMENT` : Réglages, Déplacer, Allonger, Supprimer) et recadrage ;
  Déplacer / Allonger → `EditionBarre`. Sa sélection (`selectionSeg`) est
  distincte de celle des tâches ou phases, et en exclut l'ouverture simultanée.
  Les gestes passent par les **événements pointeur**, jamais `mousedown` :
  au doigt, un segment ne glisse qu'en mode d'édition, sinon le planning
  défile. Piège déjà rencontré : le drapeau « le geste a bougé » doit se
  remettre à zéro **à chaque contact**, pas seulement au début d'un
  glissement — sinon le toucher qui suit un glissement est avalé.
- **Une action du planning = une étape d'historique.** L'annulation écrit tout
  l'écart avec l'instantané : une action sans instantané est défaite en même
  temps que la précédente.
- Un décalage d'animation calculé sur une liste **filtrée** rejoue l'entrée à
  chaque frappe dans la recherche. Le calculer sur la liste complète.

## Reprise d'une maquette Claude Design

Le projet Design `8cc64bfd-6d73-4da4-bbff-f4b0c013efd7` contient les maquettes
des écrans. Elles sont **retouchées et réimportées régulièrement** : toujours
relire le fichier avant d'implémenter, et diffuser le diff par rapport à ce qui
est déjà en place plutôt que de tout réécrire — l'essentiel du design est en
général déjà implémenté.

- L'en-tête de 52 px des maquettes correspond à `Topbar` : ne pas le réimplémenter.
- Les props Design (cases à cocher, curseurs) n'ont pas d'équivalent : prendre la
  valeur par défaut, ou le réglage système pour les animations.
- `support.js` est le moteur d'exécution minifié de Claude Design. Il n'apprend
  rien : la logique du composant est dans son bloc `<script type="text/x-dc">`.
- Les maquettes sont calibrées sur des données d'exemple (8 cartes, 6 tuiles).
  Les valeurs figées — décalages d'animation, comptes — doivent devenir des
  formules, car l'app affiche un nombre quelconque d'éléments.

## Livraison

Commiter **et pousser** en fin de tâche. Le site est déployé depuis `main` : un
commit resté local, c'est une fonctionnalité que l'utilisateur ne voit pas et
qu'il signalera comme cassée.
