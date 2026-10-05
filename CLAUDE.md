# Repères pour travailler sur ce dépôt

Gestionnaire d'affaires de l'agence JGA Architectures. React 19 + Vite
(rolldown), Supabase (base, auth, stockage), déployé sur Vercel depuis `main`.

Ce fichier existe pour éviter de re-explorer le dépôt à chaque tâche. Il donne
les points d'entrée ; le détail se lit dans les fichiers cités.

## Commandes

```
npm run dev      # serveur local, port 5173
npm run build    # doit passer avant tout commit
npm test         # 678 tests node --test (plannings, jalons accrochés, suivi financier d'étude, exports, comptes rendus, photos, plans, visite, rapport, diffusion, OPR, allègement PDF, analyseur réglementaire, import de planning, convertisseur)
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
- **Phase de l'affaire** (`src/affaire/phaseAffaire.js`, testé) : la phase
  fine (ESQ… Chantier, Livrée) se réduit à une période, étude ou chantier
  (livrée = chantier). Le tableau de bord n'affiche que les tuiles de cette
  période (`phasesDuTableau` ; la colonne de gauche garde tout), et la page
  pose des variables CSS `--affaire-accent*` (orange à l'étude, vert au
  chantier) que tout le cadre lit : un élément du cadre de l'affaire prend
  `var(--affaire-accent)`, pas `--jga-orange`. Un composant aussi utilisé
  ailleurs met l'orange en repli (`var(--affaire-accent, …)`). La phase se
  change aussi depuis l'en-tête (`ChoixPhase`), même champ que la fiche ;
  `PHASES_AFFAIRE` est la liste commune.
- **Icônes de l'affaire** (`src/shared/icones/IconesAffaire.jsx`) : dessins
  de l'agence (tableau de bord, chaque module dont la to-do list, robot, plans,
  documents), en
  composants qui s'emploient comme lucide (`size`, `color`). Le manifeste
  garde ses noms lucide ; `ICON_MAP` d'`AffairePage` les traduit. Détaillées :
  pas en dessous de ~16 px (22 dans la colonne, 28 sur les tuiles, à la
  demande de l'agence). Un masque
  par instance (`useId`), sinon deux icônes identiques partagent un `id`.
- **Contacts de l'affaire** : carte « Contacts » de la vue d'ensemble
  (`ContactsAffaire.jsx`, agence seule), fiches calculées par
  `annuaireLogique.js` — interlocuteurs (`affaire_interlocuteurs`, les mêmes
  que dans les visites) et représentant de l'entreprise de chaque lot attribué,
  à défaut les coordonnées de l'entreprise. Ils se gèrent dans la fiche de
  l'affaire par `InterlocuteursEditeur` (exporté d'`InterlocuteursModal.jsx`).
  Cet éditeur vit dans un `<form>` : **aucun `<form>` dedans et tout bouton en
  `type="button"`**, sinon enregistrer un interlocuteur envoie et ferme la
  fiche entière.
  Export (`exportContactsLogique.js`, testé, fabriqué dans la page) : tous
  les contacts en vCard 3.0 pour le téléphone, ou en CSV aux en-têtes
  anglais d'Outlook (marque UTF-8) — l'Outlook classique ne retient que le
  premier contact d'un .vcf. Une icône par fiche donne la carte seule. La
  note de chaque contact porte l'affaire et le rôle.
- **Base** : `supabase/migrations/`, numérotées, 57 fichiers, **passées à la
  main** dans le SQL Editor de Supabase : un code qui dépend d'une nouvelle
  colonne doit tolérer son absence tant que la migration n'est pas faite. La photo de
  couverture d'une affaire est `affaires.photo_url` (migration 014, bucket
  public `affaires-photos`).

## Conventions

- **Français partout** : commentaires, messages de commit, noms de variables
  métier. Les commits suivent `feat:` / `fix:` / `chore:` / `test:`.
- **Les réponses de Claude à l'utilisateur sont toujours en français**, y
  compris les comptes rendus de fin de tâche et les questions posées.
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
- **Remarques rangées par destinataire** (refonte, chantier 1, migration 054 ;
  conception dans `docs/superpowers/specs/2026-10-02-comptes-rendus-refonte-design.md`) :
  chaque CR a deux sections typées, `equipe` (VI) et `entreprises` (VII),
  mises en place à l'ouverture d'un brouillon (`assurerPartiesRemarques`).
  Une remarque de l'agence a **toujours** un destinataire : un lot la range en
  VII, un interlocuteur en VI (`rangerRemarque.js`, commun à la tablette et au
  bureau) ; changer de destinataire change de partie. Le regroupement par lot
  ou par rôle se calcule (`groupesDestinataires`, `remarquesLogique.js`) —
  écran comme PDF. Tous les lots de l'affaire sont proposés (`planning.lots`),
  pas seulement ceux qui ont une entreprise ; le dernier destinataire est
  reproposé (mémoire par CR sur l'appareil). Le choix se fait par **deux menus
  déroulants** (entreprises, équipe), pas par des boutons : un gros chantier
  en remplissait tout le panneau ; statut et zone aussi sont des menus. Les
  numéros de VI / VII **se calculent** d'après le nombre de parties des
  généralités (`numeroterParties`, dans `CrDetail`) : une sixième partie les
  décale en VII / VIII. Le `numero_romain` enregistré de ces sections ne sert
  plus à l'affichage. Le panneau commence par le **texte**, mis en évidence :
  c'est lui qui compte. Les initiales « Pour » (`cr_remarques.pour`) ne sont
  plus ni saisies ni affichées, à la demande de l'agence ; la colonne reste. `ordonnerParties` garde VI avant
  VII quel que soit l'ordre de création. Une **suite** (sous-remarque, ▶) a son
  propre statut et son échéance ; toucher une remarque ouvre `PanneauSuite`
  (avec « Clore la remarque d'origine »). Les sections I à V restent des
  sections classiques ; elles sont remplacées par les généralités.
- **Généralités** (chantier 2, migration 055) : parties I à V, **une version
  par affaire** (`affaire_generalites.contenu`, jsonb parties → rubriques →
  paragraphes, repère de suite ; **pas de date**, à la demande de l'agence :
  elles valent pour tous les CR) ; vue « Généralités » du CR
  (`GeneralitesVue.jsx`, enregistrement automatique), départ des titres
  habituels (`modeleSections.js`) ou import d'une autre affaire. Toute la
  manipulation est pure (`generalitesLogique.js`). À l'émission, copie dans
  `comptes_rendus.generalites` : un CR émis imprime la version de son jour
  (`generalitesAImprimer`). Le PDF les place après présences et avancement,
  avant les remarques, et n'imprime plus les sections générales sans remarque.
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
  recouvre le bas). Les « remarques types » (table `remarques_types`,
  migration 042) ont été **retirées** de l'écran à la demande de l'agence (elles
  embrouillaient) ; la table reste, inutilisée. Dictée : reconnaissance vocale
  du navigateur, bouton masqué si absente.
- **Mise en forme** (migration 056) : gras, italique, surligné, pour toute la
  remarque (`miseEnForme`, `champsMiseEnForme` de `crLogique.js`). Remplace
  « Important » (`est_important`), lu comme gras. Sans la migration, seul le
  gras est proposé et passe par `est_important` (sonde dans `useCompteRendu`,
  `miseEnForme` du `CrContexte`).
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
- **Lien vers une FTM** (migration 048) : une réserve d'OPR donne une fiche de
  travaux modificatifs en un bouton (`ftm/creerDepuis.js`). Le bouton « FTM »
  des remarques de CR a été retiré à la demande de l'agence ; une remarque
  déjà liée garde son étiquette, qui ouvre la fiche. La
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

- **Visite enregistrée** (conception
  `docs/superpowers/specs/2026-10-05-visite-enregistree-ia-design.md`, plans
  des lots dans `docs/superpowers/plans/`) : dossier `enregistrement/`.
  - **Lot 0** (outil « Essai d'enregistrement ») : moteur `enregistreur.js`
    (un `MediaRecorder` relancé à chaque morceau, chaque morceau est un
    fichier complet ; tranches d'une seconde au fil de l'eau ; reprise
    possible, bascule AAC ↔ Opus si l'encodeur échoue), rangement local
    `audioLocal.js` (base IndexedDB à part `jga-audio` : une page fermée ne
    perd qu'une seconde). Essais iPad : écran verrouillé ou autre app =
    sourdine puis micro coupé au bout de 4 s, **reprise automatique au
    retour** acceptée par iOS ; une photo ne coupe rien ; ≈ 250 Ko/min sur
    iPad, ≈ 800 Ko/min sur Chrome Mac.
  - **Lot 1** (migration 057) : robot dans la barre du mode Visite
    (`BoutonRobot`, `useEnregistrementVisite`), le panneau porte le rappel
    (prévenir les participants, ne pas verrouiller) et « Commencer ».
    Morceaux de **3 minutes** (limite de 4,5 Mo des fonctions Vercel).
    Chaque morceau part à `api/transcrire.js` (session vérifiée,
    `est_agence()`, puis Mistral `voxtral-mini-latest`, langue fr,
    vocabulaire de l'affaire en `context_bias`, retenté sans s'il est
    refusé) ; le **texte seul** va dans `cr_enregistrements.segments`, la
    ligne naît au premier morceau transcrit (`upsert`, id décidé sur
    l'appareil). Sans réseau ou sans clé, les morceaux attendent sur
    l'appareil. Import d'un fichier du Dictaphone : stockage privé
    `audio-temporaire` le temps de la transcription (lien signé passé à
    Mistral), effacé ensuite. Vue « Enregistrements » du CR au bureau.
    Agence seule partout. Clé `MISTRAL_API_KEY` : variable Vercel, jamais
    `VITE_`.

## Suivi financier d'étude

`src/modules/etude/financier/`, données par `useSuiviFinancierEtude`. Les
phases ne sont **plus pré-enregistrées** : on tape le nom de la phase en cours
(suggestions `SUGGESTIONS_PHASES`) ; seules les lignes de
`suivi_financier_etude` s'affichent. Le code `phase` reste la clé (une nouvelle
phase reçoit `perso_N`, son nom dans `nom_custom`) ; les anciennes lignes
gardent `esq`, `avp`… dont le libellé sert de nom. Toujours afficher une phase
par `nomPhase`, et prendre « la dernière phase » par `dernierePhaseRenseignee`
(`phases.js`, testé) — la page de l'affaire aussi. L'**enveloppe globale
initiale** se modifie en haut de la page : c'est `affaires.enveloppe_ttc`, le
même champ que la fiche de l'affaire, donc toujours identique des deux côtés.

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

## Export PDF des plannings

Chantier (`chantier/planning/generatePlanningChantierPdf.js`) et étude
(`etude/planning/generatePlanningEtudePdf.js`) : une page HTML imprimée par le
navigateur. Ce qui leur est commun vit dans `src/shared/planning/export/`.

- **Textes libres** en tête (entre logo et titre) et sous le planning :
  `EditeurTexte.jsx` (gras, italique, souligné, puces), mémorisés par affaire
  sur l'appareil (`textesExport.js`). Le HTML passe **toujours** par
  `nettoyerHtml` (`texteRiche.js`, liste fermée de balises, aucun attribut)
  avant d'entrer dans la page.
- **Grille** : `bordureGauche(niveau, granularite)` — mois foncé, semaine
  moyenne, jour discret ; en vue Semaines plus de lignes de jour, en vue Mois
  seulement les mois. L'étude est traitée en Semaines. Les lignes
  horizontales prennent la teinte des mois, un peu plus fines
  (`TRAIT_HORIZONTAL`), et le bandeau des périodes est coupé à chaque début
  de mois pour que la ligne de mois le traverse.
- **Périodes** : fond uni (les hachures moiraient à l'impression), trait aux
  vraies dates de début et de fin, bandeau qui les nomme sous les dates. Au
  chantier, **un seul bloc par période et par ligne**, sous la grille
  (`z-index:-1`) : un fond par cellule laissait un fil clair entre deux jours.
- **Barre en pause** : la barre traverse la période bloquante (l'étude aussi,
  sur le papier ; l'écran garde ses fragments), la portion en pause montre la
  période à travers des rayures (`stylePause`).
- **Légende** = celle de l'écran (`legende.js` : tous les lots, ou toutes les
  zones puis « Sans zone ») + les conventions de dessin. L'Excel du chantier
  lit la même source.

## Analyseur réglementaire (`src/tools/analyseur/`)

Vérifie des plans DXF (ArchiCAD) contre des règles ERP / PMR / Logement.
**Aucune clé API** : l'analyse se fait dans Claude Code ou sur claude.ai,
couverts par l'abonnement de l'agence, en trois temps — l'app prépare la
demande, l'utilisateur la fait analyser, il recolle la réponse.

- Tout ce qui se calcule sans modèle vit dans `analyseLogique.js`, sans React,
  et se teste sans navigateur (`tests/analyseur.test.js`) : lecture du DXF
  (`parseDxfBrut`), relevé (`construireContexte`), demande (`construirePrompt`)
  et relecture de la réponse (`lireReponse`). Le composant n'est plus que
  l'écran.
- **Ce qui part chez Claude est déjà plafonné** — 15 espaces, 20 annotations,
  8 escaliers — et tient en ~3 800 caractères pour un plan. Le gros du travail
  (lire le DXF, mesurer, trier) se fait dans le navigateur.
- `lireReponse` est tolérante par construction : la réponse est collée à la
  main, donc elle arrive entourée d'une phrase, dans un bloc ```json, ou suivie
  d'un commentaire qui contient lui aussi des accolades. L'extraction compte
  les délimiteurs **hors chaînes** plutôt que de chercher le dernier `}`. Un
  statut inconnu devient « à vérifier », une confiance absente ne s'affiche
  jamais à 100 %.
- Piège : un MTEXT porte les codes de mise en forme d'ArchiCAD
  (`\fArial|b0|i0;Bureau`). Sans nettoyage, la police partait dans l'analyse
  comme si c'était le nom de la pièce.
- **Ne jamais réintroduire `VITE_ANTHROPIC_API_KEY`** : une variable `VITE_`
  est écrite en clair dans le fichier JS livré au navigateur — la clé était
  lisible par quiconque ouvrait l'app. Un appel payant, s'il devait revenir,
  passerait par une fonction serveur (`api/`, comme `garder-eveil.js`).

## Convertisseur (`src/tools/convertisseur/`)

Photos HEIC de l'iPhone en JPEG, par lot (ZIP au-delà d'une photo), taille
d'origine ou allégée à 2 000 px. **Tout reste sur l'appareil** : rien ne passe
par Supabase, dont le stockage est plafonné — c'est une demande de l'agence.

- Pensé pour d'autres conversions : un format de plus, c'est une entrée dans
  `FORMATS_ENTREE` / `FORMATS_SORTIE` (`conversionLogique.js`, testé), pas un
  nouvel outil. Le décodage et l'encodage sont dans `conversion.js`.
- Un HEIC se reconnaît à son contenu (boîte `ftyp`), pas à l'extension.
- Le décodeur `heic-to` (libheif, 3 Mo) se charge au premier HEIC et est
  exclu du préchargement de la PWA (`globIgnores` de `vite.config.js`) : sans
  cela, le build échoue (fichier trop gros pour workbox).
- Repasser par un canvas retire date, GPS et appareil : voulu, les photos
  partent chez des tiers. La rotation de l'iPhone est appliquée par libheif.

## Aplatisseur de plan (`src/tools/rasterisation/`)

Deux sorties : **aplatir** (chaque page rendue en image par pdf.js, puis jsPDF)
et **alléger en gardant le vectoriel** (`vectoriel/`, pdf-lib chargé à la
demande). L'allègement a été conçu sur un plan de masse ArchiCAD de 890 000
traits : 2,74 millions d'opérations de dessin ramenées à 0,29 million, rendu
trois à cinq fois plus rapide dans pdf.js.

- **Deux leviers.** ArchiCAD écrit chaque trait dans son propre bloc
  `q /G1 gs couleur RG tracé S Q` : les blocs identiques qui se suivent sont
  regroupés en un seul trait (`fusion.js`). Et ce qui ne se voit pas est
  retiré (`analyse.js`) : ce qui est entièrement recouvert par des aplats
  opaques posés après lui (vues superposées), et ce qui tombe entièrement hors
  de sa découpe — ArchiCAD pose ses motifs de hachure (`Do`, des milliers de
  fois) sur tout le rectangle englobant d'une zone, puis la découpe à sa forme.
- **Trame de visibilité** (`trame.js`) : la page est reparcourue à l'envers
  sur une grille de 2 pixels par point ; chaque zone (aplat, découpe) y a des
  pixels « possibles » (touchés) et « sûrs » (entièrement dedans). Un élément
  n'est retiré que si tous ses pixels possibles sont sûrement recouverts :
  formes quelconques (non convexes, trouées, courbes) et aplats cumulés sont
  gérés, et une grille grossière ne coûte que du gain, jamais du dessin. Deux
  aplats posés bord à bord laissent une jointure incertaine — c'est voulu.
- **Prudence de l'analyse** : un aplat ne masque que s'il est opaque, de
  couleur unie, sans mode de fusion ni masque doux. Masque et élément doivent
  être dans le **même calque** : sinon masquer un calque dans Acrobat ferait
  un trou. Une découpe s'applique même calque masqué. Dans un symbole, seuls
  les aplats sont enregistrés : garder ses traits (750 000 sur le plan de
  masse) faisait passer l'analyse de 190 Mo à près de 900 Mo.
- **Fusion seulement des traits opaques** : deux traits semi-transparents qui
  se croisent foncent au croisement, un trait unique non.
- **Contrôle au pixel** (`controle.js`, `comparaison.js`) : chaque page est
  rendue avant et après par pdf.js à l'échelle 1 ; une page où un trait
  apparaît ou disparaît est laissée intacte.
- Limite connue et acceptée par l'agence (2026-09-17, « ce qui compte, c'est
  l'impression ») : dans les moteurs à anticrénelage par tracé (Aperçu, et
  sans doute Acrobat), des traits regroupés qui se touchent remplissent mieux
  leurs pixels — les hachures très serrées paraissent plus denses en vue
  d'ensemble à l'écran. Identique en zoomant et à l'impression. Le contrôle
  pdf.js ne voit pas cet écart.
- Piège : `pdfjs.getDocument({ data })` **transfère** le tampon à son worker ;
  relu ensuite, il est vide (« detached ArrayBuffer »). Relire le fichier, ou
  passer une copie.

## Pièges déjà rencontrés

- **App installée sur l'iPad : l'écran passe sous la barre d'état** (heure,
  batterie), à cause de `black-translucent` (index.html). `AppShell` et le mode
  Visite réservent `env(safe-area-inset-top)` dans une bande sombre (l'heure
  s'écrit en blanc) ; tout nouvel écran plein ou panneau ancré en haut doit en
  faire autant.
- **Tablette : `index.css` impose 48 px de hauteur à tout champ** (`pointer:
  coarse`). Un champ logé dans une ligne de planning ou de tableau doit poser
  `minHeight: 0` en ligne, sinon il déborde de sa ligne.
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
- **Zoom au pincement (iPad)** : `usePincementZoom` (`shared/planning/`),
  branché sur le volet défilant des deux éditeurs, calcul pur dans
  `pincement.js`. Il suit les événements **tactiles** (les pointeurs finissent
  en `pointercancel` dès que Safari croit à un défilement) ; le volet porte
  `touch-action: pan-x pan-y` et `gesture*` est bloqué, sinon Safari zoome la
  page entière. Quand un deuxième doigt se pose, le geste du premier reçoit un
  `pointercancel` synthétique : **tout geste de barre ou de segment doit
  traiter `pointercancel` comme une annulation** (rien d'enregistré, pas de
  roue) — c'est ce qui empêche un pincement de déplacer une barre. Seul le
  temps zoome ; au chantier, la vue (Jours/Semaines/Mois) ne change pas.
- **Jalons accrochés** (migration 053, les deux plannings) : toucher un jalon
  ouvre sa roue (`actionsJalon` : Réglages, Déplacer, Accrocher, Supprimer ;
  Détacher s'il est accroché — un jalon accroché ne se déplace pas à la main).
  Accrocher : on touche ensuite une barre ou un segment, moitié gauche = début,
  moitié droite = fin (`bordTouche`). La **date reste stockée** (exports, page
  de l'affaire, import la lisent telle quelle) et se **recale par comparaison
  après coup** : `jalonsARecaler` (chantier, `jalonsAncres.js`) /
  `jalonsARecalerEtude` (étude), appliqués par un effet différé de chaque
  planning — pas besoin de compléter chaque chemin qui bouge une barre. Fin =
  `dernierJourTache` au chantier, dernière semaine travaillée à l'étude ;
  `ancre_bord = 'fin'` dessine le jalon au **bord droit** de son jour / sa
  semaine, et reste après un détachement pour qu'il ne saute pas. Barre
  supprimée → la base remet l'ancre à `null`. Décaler ignore les jalons
  accrochés ; l'import remappe leur ancre. Les jalons de l'étude sont désormais
  dans l'instantané d'historique (semaine, ancres).
- **Décaler tout le planning** (report du démarrage, bouton « Décaler » de la
  barre d'outils du chantier, `decalage.js` + `DecalagePlanningModal.jsx`) :
  on donne la nouvelle date de démarrage, tout ce qui est concerné (option
  « à partir du ») avance du même nombre de **jours ouvrés** — tâches,
  segments (ils ont leur propre date) et jalons ; les périodes restent fixes.
  Un lien à cheval sur la frontière d'un décalage partiel reçoit son nouvel
  écart, sinon le prochain recalage ramènerait la tâche. Une seule étape
  d'historique : **l'instantané contient les jalons** (date seulement,
  `COLONNES_JALON`). Les dates de l'affaire suivent, hors historique.
- **Importer un planning depuis une autre affaire** (bouton « Importer » des
  deux barres d'outils) : calcul pur dans `chantier/planning/importPlanning.js`
  et `etude/planning/importPlanningEtude.js`, écriture dans les `importEcriture*`,
  modale commune `shared/planning/ImportPlanningModal.jsx` pilotée par un objet
  `moteur` que chaque planning construit chez lui. Quatre règles :
  **les lignes s'ajoutent à la suite** (rien n'est effacé, `ordre` repris après
  le dernier) ; **l'avancement repart à zéro** (on importe une trame) ; le
  décalage se compte en **jours ouvrés** au chantier et en **semaines ISO** à
  l'étude ; **lots et zones se rapprochent par le NOM**, jamais par le numéro —
  le lot 3 de deux affaires n'est pas le même métier, et `unique(affaire_id,
  numero)` refuserait le numéro d'origine (un lot créé prend le premier libre).
  `cleNom` défait les ligatures avant les accents : `NFD` ne décompose pas
  « œ », et « Gros œuvre » resterait distinct de « Gros oeuvre ».
- **L'ordre des insertions d'un import n'est pas négociable** : zones → lots →
  tâches → liaisons → segments → dépendances → jalons. Les tâches sont écrites
  **sans `depends_on`**, puis mises à jour : à l'insertion la tâche parente
  n'est pas forcément créée. Les jalons gardent un `id` `generated ALWAYS`
  (aucune migration 034/035 pour eux) — ne jamais leur en fournir un.
- Les **congés et fermetures ne s'importent pas** : `periodes_bloquees` est
  **commune au planning d'étude et à celui de chantier** d'une même affaire,
  les recopier polluerait l'autre. Et ⌘Z après un import retire tâches,
  segments et liaisons, mais **ni les jalons ni les lots ou zones créés** —
  `diffSnapshots` neutralise volontairement les créations de jalons, et les
  lots servent à d'autres modules.
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

## Supabase gardé éveillé

L'offre gratuite met le projet en pause après 7 jours sans requête. Vercel
appelle chaque jour `api/garder-eveil.js` (tâche `crons` de `vercel.json`,
6 h UTC) : une lecture minuscule avec la clé publique. Le `rewrite` de
`vercel.json` exclut `/api/`, sinon l'appel renverrait `index.html`. Suivi :
Vercel → projet → Cron Jobs.

## Sauvegardes

L'offre gratuite de Supabase ne sauvegarde rien. Le dépôt **privé**
`AppJGA/jga-sauvegardes` (copie locale `../jga-sauvegardes`) le fait chaque
nuit à 1 h UTC par GitHub Actions : la base par `supabase db dump` (rôles,
structure, données, gardés 30 jours en artifacts), les fichiers de tous les
buckets recopiés dans le dépôt (seuls les nouveaux ; un fichier supprimé reste).
Résumé de la nuit : `derniere-sauvegarde.md`. Restauration : son `README.md`.

- Secrets du dépôt : `SUPABASE_DB_URL` (Session pooler, avec le mot de passe
  de la base — **à mettre à jour si ce mot de passe change**) et
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Ce dépôt-ci (`jga-architectures`) est public** : jamais de données, de
  sauvegarde ni de secret dedans.
- Une nouvelle table ou un nouveau bucket sont pris d'office ; rien à modifier.

## Livraison

Commiter **et pousser** en fin de tâche. Le site est déployé depuis `main` : un
commit resté local, c'est une fonctionnalité que l'utilisateur ne voit pas et
qu'il signalera comme cassée.
