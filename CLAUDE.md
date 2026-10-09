# Repères pour travailler sur ce dépôt

Gestionnaire d'affaires de l'agence JGA Architectures. React 19 + Vite
(rolldown), Supabase (base, auth, stockage), déployé sur Vercel depuis `main`.

Ce fichier existe pour éviter de re-explorer le dépôt à chaque tâche. Il donne
les points d'entrée ; le détail se lit dans les fichiers cités.

## Commandes

```
npm run dev      # serveur local, port 5173
npm run build    # doit passer avant tout commit
npm test         # 867 tests node --test (plannings, to-do list, gestion d'agence, jalons accrochés, suivi financier d'étude, exports, comptes rendus, photos, plans, visite, rapport, diffusion, OPR, allègement PDF, analyseur réglementaire, import de planning, convertisseur, dossier pour Claude)
npx eslint src   # ~71 problèmes préexistants : comparer, ne pas viser zéro
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
| Gestion d'agence (associés) | `src/gestion/` (outils dans `manifest.js`) |
| Outils | `src/tools/` (manifeste dans `manifest.js`) |

- **Routes** : `src/core/router/AppRouter.jsx`. Tout est sous `RequireAuth` +
  `AppShell` sauf `/login` et `/_preview/home` (cette dernière n'existe qu'en
  développement, `import.meta.env.DEV`).
- **Coquille** : `src/core/layout/AppShell.jsx` (Topbar 52 px + Sidebar,
  masquée sur l'accueil, le portail, les affaires, le carnet et la boîte à
  outils).
- **Retour dans le bandeau du haut** (`Topbar`), à la place de l'ancien
  titre de page, à côté du logo (qui mène toujours à l'accueil) : flèche,
  icône de la page qui menait ici, nom en gras (`RetourPage`). Déduit de
  l'adresse par `retourParDefaut` (`core/layout/retourLogique.js`, testé) :
  Accueil ← portail, carnet, boîte à outils, heures, réglages ; Boîte à
  outils ← un outil ; Portail ← une affaire ; Tableau de bord de l'affaire
  ← un module ; Liste des visites ← `?cr=` ; Visites d'OPR ← `?visite=` de
  l'OPR. Une page aux vues internes l'impose par `useRetourPage`
  (`retourContexte.js`) : les pages d'un CR → Tableau de bord de la visite.
  Toute nouvelle page reçoit son retour là, jamais dans la page.
  **Dans une affaire, titre et retour sont échangés**, à la demande de
  l'agence (on cherche la flèche sous le titre) : `AffairePage` envoie code,
  nom et maître d'ouvrage au bandeau du haut (`useTitreBandeau`), et le
  retour s'affiche dans la barre de l'affaire, dessous (`RetourCourant`,
  même calcul que le bandeau). Hors affaire, le bandeau garde le retour.
- **Titre des modules** : `AffairePage` pose en tête de chaque module son
  icône et son nom tels qu'au menu (`TitreModule`). Un module n'écrit pas
  son propre titre, seulement ce qui le précise (compteurs, actions) ; un
  module plein écran remplit la boîte laissée sous le titre.
- **Modules d'affaire** : déclarés dans `src/modules/manifest.js` — deux phases
  (`etude`, `chantier`), chaque module a `enabled`, `path`, `icon`, un
  `component` en `lazy()`. Les tuiles du tableau de bord et la sidebar de
  l'affaire sont **générées depuis ce manifeste** : ajouter un module se fait
  là, pas dans `AffairePage.jsx`.
- **Accès aux données** : hooks dans `src/shared/hooks/`. `useAffaires()` pour
  la liste, `useAffaire(id)` pour une affaire (les deux font `select('*')`),
  `useAffaireCollaborateurs(id)` pour les droits (`canEdit`, `isProprietaire`).
- **Numéro d'un lot tel que saisi** (migration 063, `src/shared/lots/numeroLot.js`,
  testé) : `lots.numero` reste un nombre (tri, unicité), le texte saisi
  (« 01 », « 060 ») est dans `numero_affiche` — **tout affichage passe par
  `numeroLot` / `libelleNumeroLot`**, jamais par `lot.numero` (le planning
  garde son complément à 2 chiffres sans texte saisi : `{ minimum: 2 }`).
  Saisie par `lireNumeroSaisi` (champ texte, chiffres seuls ; le texte n'est
  gardé que s'il a un zéro devant). Copies : `copie_lot_numero_affiche` des
  présences (CR, OPR) — envoyée **seulement si le lot lu porte la colonne**,
  sinon une base sans la migration refuserait la présence —, destinataire
  recopié par le déclencheur `cr_remarque_copie_destinataire`. Les lots se
  lisent en `select('*')` / `lots(*)` pour récupérer la colonne quand elle
  existe ; écriture réessayée sans elle si la migration manque.
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
  de l'agence (tableau de bord, chaque module dont la to-do list, robot,
  avancement, présences, remarques, organisation, généralités et export
  PDF du CR, plans,
  documents, tablette du mode Visite, ordinateur de l'éditeur, émission, suite
  d'une remarque), en
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
  Un interlocuteur absent du carnet, nouveau ou déjà dans l'affaire, peut y
  être versé (case « Ajouter au carnet d'adresses », `carnet.js` /
  `carnetLogique.js`, testé) : la fiche
  `entreprises` de son organisation — ou à son nom s'il n'en a pas — puis la
  personne en `interlocuteurs`, sans doublon (comparaison sans majuscules ni
  accents). La fiche de l'affaire ne se ferme plus au clic à côté.
  Recherche dans le carnet (`RechercheCarnet.jsx`, `rechercheCarnetLogique.js`,
  testé) : carnet chargé une fois, une option par personne et une par fiche,
  chaque mot tapé cherché dans tous les champs (sans majuscules ni accents,
  numéros sans espaces) ; choisir une personne remplit tout le formulaire.
  Interlocuteur déjà au carnet (retrouvé par `chercherDansCarnet` d'après ses
  valeurs enregistrées) : à l'enregistrement, `ecartsCarnet` liste ce qui
  diffère et une fenêtre propose « Mettre aussi à jour le carnet » ou
  « Seulement dans l'affaire » (`ecrituresCarnet`, adresse réécrite en rue
  si le lieu n'a pas changé). Crayon sur chaque fiche d'interlocuteur de la
  carte Contacts (`ModaleInterlocuteur`). Piège : une fenêtre `fixed` ouverte
  sous une carte `jga-entree-carte` (animation `both`, `transform` gardé)
  reste prise dans la carte — passer par `createPortal`.
  Export (`exportContactsLogique.js`, testé, fabriqué dans la page) : tous
  les contacts en vCard 3.0 pour le téléphone, ou en CSV aux en-têtes
  anglais d'Outlook (marque UTF-8) — l'Outlook classique ne retient que le
  premier contact d'un .vcf. Une icône par fiche donne la carte seule. La
  note de chaque contact porte l'affaire et le rôle.
- **Base** : `supabase/migrations/`, numérotées, 67 fichiers, **passées à la
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
- **Une fenêtre (modale, panneau, confirmation, visionneuse) ne se ferme
  jamais au clic à côté**, à la demande de l'agence : un geste de trop
  perdait une remarque en cours de rédaction. Seuls ✕, Annuler, Échap ou
  l'action elle-même la ferment ; le fond ne porte aucun `onClick`. Les menus
  déroulants et sélecteurs (date, couleur) gardent, eux, la fermeture au
  clic extérieur.
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
- **Glisser une remarque vers un autre destinataire** (mode Visite et
  éditeur de bureau, parties VI / VII) : une poignée (⋮⋮, `touch-action:
  none` — le reste de la carte fait toujours défiler la liste au doigt)
  ouvre une bande de tous les destinataires (`BandeDepot`, cibles
  `data-cible-depot`) ; le dépôt passe par `champsModification`, comme un
  changement de destinataire au crayon (partie VI ↔ VII, file hors ligne).
  Événements pointeur (`useGlisserRemarque`), `pointercancel` = annulation.
  Pas pour les suites ni les observations des intervenants
  (`glisserLogique.js`, testé).
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
- **Convocations** : la convocation d'un CR (et son heure, page « Prochaine
  visite ») vaut pour la **prochaine** réunion. Au pointage des présences de la visite
  suivante (mode Visite et page Présences), chaque participant convoqué au
  CR précédent porte « Convoqué au CR n°X · 09h00 » et passe en tête de son
  groupe (`convocationLogique.js`, testé ; `useConvocationsPrecedentes`,
  gardé sur l'appareil pour une visite sans réseau). Un participant se
  reconnaît d'un CR à l'autre par `interlocuteur_id` ou `lot_entreprise_id`.
- **Convocations du CR précédent** (`convocationLogique.js`, `useConvocationsPrecedentes`,
  gardées sur l'appareil pour la visite hors ligne) : au pointage, un
  participant convoqué au CR précédent porte la mention « Convoqué au CR n°X »
  et passe en tête. Pointé **absent** (pas excusé), il passe en rouge, avec un
  compteur en tête des présences ; dans le PDF, sa case porte « convoqué » et
  une ligne rouge le nomme. Les participants se reconnaissent d'un CR à
  l'autre par `interlocuteur_id` / `lot_entreprise_id` (`cleParticipant`).
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
  photos et plans. **Une suite a ses propres photos** (`remarque_id` = l'id
  de la suite, aucune migration) : bouton à côté de son texte (tablette) ou
  dans ses actions (bureau), reprises avec elle (`preparerReprise`), imprimées
  sous elle dans le PDF, et comptées dans les fichiers à nettoyer quand sa
  remarque est supprimée (`photosDesRemarques`).
- **Plans** (migration 041) : `affaire_plans` (commun à l'affaire) →
  `affaire_plan_versions` (indice A, B…, image convertie sur l'appareil par
  `conversionPlan.js`, 6 000 px et 16 Mpx au plus — plafond des iPad) →
  `cr_pastilles` (une par remarque, x/y relatifs, `version_id`). Une nouvelle
  version est reportée par la base sur les pastilles des brouillons ; les CR
  émis gardent la leur, et un plan ou une version qu'ils affichent ne se
  supprime pas. La visionneuse (`VisionneusePlan.jsx`) garde ses calculs de
  zoom dans `plansLogique.js`.
- **Tableau de bord d'une visite** (`CrAccueil`, dans `CrDetail.jsx`) : le
  bloc Remarques en tête, puis les tuiles dans l'ordre voulu par l'agence —
  Présences, Avancement, Prochaine visite, Enregistrement, Plans, Généralités — **toujours trois
  par rangée**, seule leur largeur suit l'écran. L'export PDF est
  un bloc à part en bas (`BlocExport`) : c'est l'aboutissement du CR.
  Numéro, date et rédacteur se modifient par le **crayon** à côté du titre
  (`ModaleIdentiteVisite.jsx`, logique dans `identiteVisiteLogique.js`,
  testé) : un numéro déjà pris dans l'affaire est signalé avant l'envoi
  (la base le refuse aussi, `unique(affaire_id, numero)`, `23505`) ; les
  rédacteurs proposés sont les collaborateurs de l'affaire (propriétaire,
  collaborateur — jamais un extérieur), toute l'agence si l'affaire n'en a
  aucun. La liste des visites se relit quand on quitte un CR. Le grand
  numéro a des hauteurs de ligne fixées pour aller du haut du titre au bas
  de la date. Le « template de sections » (sections I à V) n'est plus
  proposé : les généralités l'ont remplacé.
- **Page « Prochaine visite »** (`ProchaineVisite.jsx`, vue `organisation`)
  : date et heure de la prochaine réunion, et **les convocations** (bascule
  et heure par participant, heure par défaut = celle de la réunion). Elles
  ne se règlent plus dans la page Présences, qui ne sert qu'au pointage.
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
  d'archive n'empêche pas l'émission. Chaque PDF archivé (émission,
  version précédente, version par entreprise) se **supprime** depuis la page
  d'export (`supprimerArchive`, `rapportStockage.js`) : ligne d'abord, puis
  fichier — un fichier resté seul est rattrapé par « Nettoyer le stockage ».
  « Émis » désigne l'archive datée de `cr.date_emission`, pas la première.
  **Règle de l'agence : pas d'export d'un brouillon** — la page « Exporter
  le PDF » (`ExportRapport`) ne propose Télécharger que pour un CR émis ; un
  brouillon garde ses réglages (ils servent au PDF archivé à l'émission) et
  un bouton « Émettre le CR ».
  **Contenu par interrupteurs** (plus de modèle complet / synthèse) : page
  de garde toujours (photo de l'affaire en option, `affaires.photo_url`
  recadrée en bandeau par `bandeauPourPdf`), puis présences (coordonnées en
  option), convocations (prochaine réunion + colonne « Convoqué », ou liste
  `blocConvoques` sans les présences), avancement, généralités, remarques
  (closes, photos, classement « Par lot » / « Par zone »), plans. Tout coché
  par défaut (`REGLAGES_DEFAUT`) ; un ancien `modele` mémorisé est ignoré.
  **Aperçu dans la page** (`ApercuPdf.jsx`, `apercuPdfRendu.js` : pdf.js
  rend chaque page en image) : refait 450 ms après le dernier réglage,
  anciennes pages pâlies pendant ce temps, « Agrandir » en plein écran.
  L'émission et la diffusion fabriquent leur PDF elles-mêmes.
- **Avant d'émettre, une liste de contrôle** (`ModaleEmission`, logique
  `controleEmissionLogique.js`, testée) : présences des **convoqués**
  pointées (un non-convoqué non pointé ne manque à rien : il n'a pas à
  figurer absent ; sans convocation, un participant pointé suffit),
  prochaine visite (date et au moins un convoqué), avancement qui a bougé
  depuis le CR précédent (comparé à son `avancement_lots` figé ; première
  visite : un lot avancé suffit), propositions de l'IA relues. Vert et case
  cochée si fait, rouge avec « Ouvrir » sinon ; le bouton devient « Émettre
  quand même ». Seules les propositions de l'IA bloquent (la base refuse,
  migration 058) : le bouton mène alors à elles.
- **Diffusion** (`DiffusionCr.jsx`, migration 044) : pas de serveur d'envoi.
  Boîte pro de l'agence : **Microsoft 365, nouvel Outlook pour Mac** ; sur le
  Mac de Victor, les liens `mailto:` ouvrent Chrome (Gmail), pas Outlook.
  D'où « Ouvrir dans Outlook » : télécharge un modèle `.emltpl`
  (`fichierOutlook`, testé : destinataires ou Cci, objet, texte HTML) qui
  ouvre toujours Outlook sur un e-mail modifiable, **et le PDF à côté** — le
  nouvel Outlook ignore les pièces jointes d'un modèle et ouvre un `.eml` en
  lecture seule (essayé le 2026-10-06). Le texte dit « ci-joint » et garde un
  lien de 30 jours vers le PDF archivé, **court et lisible** (migration 065) :
  `<site>/pdf/2618-LVV-CR03-02-Gros-oeuvre-k7Pq9x` (`codeLien`, 6 caractères
  au hasard à la fin). `vercel.json` envoie `/pdf/<code>` à `api/pdf.js`, qui
  lit le lien signé par `lien_telechargement(code)` (ouverte aux visiteurs
  sans compte, ne rend que ce code, s'il n'a pas expiré) et y redirige ; le
  service worker laisse passer `/pdf/` et `/api/`. Sans la migration, l'e-mail
  garde le lien signé. « Autre messagerie » = mailto.
  Pour joindre le PDF d'office, il faudrait créer le brouillon par Microsoft
  Graph (inscription d'une application dans l'administration Microsoft 365). Les versions par entreprise sont des archives avec
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
  `ftm/lienFtm.js` et s'ouvre par `/affaires/:id/financier-chantier?ftm=<id>`. Supprimer la
  remarque ou la réserve ne supprime pas la fiche : elle engage l'argent.
- **Avancement des lots** (migration 049, `avancementLogique.js`) : aucune
  saisie parallèle — les chiffres sont lus dans le planning chantier
  (`planning.avancement`), pondérés par la durée des tâches, et comparés à ce
  que le planning prévoyait pour la date de la réunion. Pointer une tâche
  depuis le CR ou le mode Visite écrit dans `planning`. En mode Visite : un
  curseur, un champ « % » et les paliers 0/25/50/75/100 (`ReglageAvancement`,
  `bornerAvancement`) ; rien ne part pendant le glissement, une écriture au
  lâcher ou à la validation du champ. À l'émission,
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
  l'écran**. Hors ligne : ni émission, ni PDF, et pas de
  ré-annotation d'une photo déjà envoyée.

- **Visite enregistrée** (conception
  `docs/superpowers/specs/2026-10-05-visite-enregistree-ia-design.md`, plans
  des lots dans `docs/superpowers/plans/`) : dossier `enregistrement/`.
  - **Lot 0** (essais faits ; l'outil « Essai d'enregistrement » de la boîte
    à outils a été retiré le 2026-10-06) : moteur `enregistreur.js`
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
  - **Lot 2** (migration 058) : « Proposer les remarques » (panneau du robot,
    vue Enregistrements) envoie le contexte à `api/analyser-visite.js`
    (fonction **Edge**, réponse en flux ; consignes et schéma fixés côté
    serveur depuis `analyseIaLogique.js` ; Claude `claude-sonnet-5-5`, clé
    `ANTHROPIC_API_KEY`, compte personnel de Victor). L'IA ne voit que des
    références courtes (L1, I2, Z1, R41). Les propositions sont des lignes
    `cr_remarques` créées par les chemins habituels avec **`a_valider`** :
    surbrillance bleue (`styleProposition`, pas le jaune « surligné »),
    extrait entendu, Valider / Modifier / Écarter ; **modifier vaut
    validation** ; sans destinataire → « À attribuer », « Choisir et
    valider ». Une suite qui clôt son origine (`ia_clore_origine`) ne la
    clôt qu'à la validation. **La base refuse l'émission** tant qu'il en
    reste (déclencheur `comptes_rendus_propositions`) ; la reprise ne les
    emporte pas ; l'aperçu PDF les signale. `analyse_le` : pas d'analyse
    en double.
  - **Lot 3** (migration 059, `agence_reglages`) : la façon d'écrire de
    l'agence. Un **guide de rédaction** (`GUIDE_PAR_DEFAUT` de
    `styleAgenceLogique.js`, tiré le 2026-10-06 de 9 CR de l'agence, 5
    chantiers, plusieurs rédacteurs ; **aucun nom réel** : le dépôt est
    public, les CR sources restent hors du dépôt) que l'agence réécrit par
    « Guide de rédaction de l'IA » (vue Enregistrements, `ModaleGuideRedaction`)
    ; enregistré vide ou identique au guide de départ, il y revient. Et
    **40 exemples** pris dans les remarques des CR émis (`choisirExemples`,
    testé : même affaire d'abord, 15 au plus, puis mêmes lots par le nom, puis
    le reste ; ni extérieur, ni proposition à valider, une remarque suivie
    comptée une fois). Les deux partent avec chaque analyse
    (`styleAgencePour`, dans `proposerRemarques`) ; un échec de lecture
    n'empêche jamais l'analyse. Les consignes disent d'imiter le ton des
    exemples sans jamais en reprendre le contenu.

## Pièces écrites (`src/modules/etude/pieces-ecrites/`)

CCTP des bureaux d'études, importés en PDF, découpés en articles et
cherchables — au bureau (module, partie Étude) et en visite (bouton « CCTP »
du mode Visite, hors ligne). Conception :
`docs/superpowers/specs/2026-10-06-pieces-ecrites-design.md`. **Aucune IA.**

- **Lecture** (`piecesLogique.js`, pur, `tests/pieces-ecrites.test.js` sur
  textes inventés — **aucun extrait réel de CCTP dans le dépôt**, public) :
  `lignesDePage` remet les fragments pdf.js **de gauche à droite** (certains
  PDF dessinent le numéro après le titre : « INSTALLATIONS DE CHANTIER5.1 ») ;
  `retirerBruit` ôte en-têtes et pieds (même ligne, chiffres à part, **en haut
  ou en bas** de plus de 40 % des pages — une ligne répétée au milieu reste) et
  lignes de sommaire à points de conduite ; `decouperArticles` retient **la
  plus longue suite logique de numéros** (`suitLogiquement` : trous tolérés,
  2.4 → 3.1 admis), un titre suivi de texte comptant plus : le sommaire sans
  points de conduite perd ainsi face au corps, et « 1 porte au RDC » ne
  casse pas la suite ; moins de 3 articles → un par page. La couverture
  (page 1) n'ouvre pas d'article. `lireLot` : la plus grande ligne « Lot 07 -
  … », « Lot n°170 : … », « Lot N°080 … » de la couverture, nom continué à la
  ligne suivante, sinon le nom du fichier. Réglé sur 7 CCTP réels de 5
  affaires (gardés hors dépôt, `Desktop/PERSO/Exemples de CCTP`).
- **Données** (migration 061, `piecesDonnees.js`) : `pieces_ecrites` (une par
  lot : un nouvel import **remplace** l'ancien) et `pieces_articles` ; seul
  le **texte** est gardé, pas le PDF. Agence seule, écriture des
  collaborateurs (060). Copie sur l'appareil dans une base IndexedDB à part
  (`jga-pieces`) : `piecesPourConsultation` lit la base et rafraîchit la
  copie, ou lit la copie sans réseau.
- **Import** (`ImportPieces.jsx`) : PDF lus sur l'appareil (`lecturePdf.js`,
  pdf.js) ; `proposerLot` rattache au lot de même nom (`cleNom`, l'un pouvant
  contenir l'autre) ou crée le lot lu sur un numéro libre ; tout reste
  modifiable avant « Importer ».
- **Mise en forme** (migration 062, colonne `pieces_articles.styles`,
  `[[début, fin, code]]`, g / i / s combinables) : gardée **à part du
  texte** pour ne pas gêner la recherche. Gras et italique d'après le **nom
  de la police** (`styleDePolice` : « -Bold », « -Oblique » — les drapeaux de
  pdf.js restent faux) ; souligné d'après les **traits** de la page
  (`traitsHorizontaux` sur la liste d'opérations, matrice courante suivie ;
  `fragmentSouligne` : trait juste sous la ligne de base, pas beaucoup plus
  large que le texte — une bordure de tableau n'en est pas un). Les polices
  anonymes (« CIDFont+F3 », CCTP de Coligny) ne disent pas leur gras : perdu.
  `lignesDePage` suit les styles caractère par caractère pour réduire les
  espaces sans décaler les plages ; `extrait` les combine au surlignage. Sans
  la migration 062, l'import enregistre le texte seul. Un CCTP importé avant
  doit être réimporté pour retrouver sa mise en forme.
- **Recherche** (`chercherArticles`, `RecherchePieces.jsx`, commune au module
  et au mode Visite) : tous les mots, sans accents, titre d'abord, groupée
  par CCTP, `extrait` surligné (positions d'origine gardées malgré les
  accents) ; l'article entier garde ses retours à la ligne, sauf ceux qui
  coupent une phrase : `recomposerTexte` (testé, à l'affichage, donc aussi
  pour les CCTP déjà importés) les remplace par une espace — **même longueur**,
  les plages de mise en forme ne bougent pas. Restent : fin de phrase,
  ligne vide, puce ou énumération, sous-titre en capitales ; une césure
  (« huisse-/rie ») se recolle par une espace sans largeur. Sur les 7 CCTP
  d'exemple, un tiers à la moitié des retours disparaissent.
- **Dossier pour Claude** (conformité plans / CCTP, conception
  `docs/superpowers/specs/2026-10-08-dossier-claude-conformite-design.md`) :
  bouton « Préparer le dossier d’analyse de conformité par l’IA » (logo de
  Claude, `shared/icones/LogoClaude.jsx`) → ZIP de quatre fichiers
  (sommaire, CCTP article par article, texte des plans, plans réunis) à
  glisser dans le **projet claude.ai de l'agence** (Team,
  `PROJET_CLAUDE_CONFORMITE`), où se fait l'analyse : **aucun appel d'API**.
  Les plans sont lus sur l'appareil et gardés nulle part. Ce qui fait la
  qualité (constaté aux essais) : chaque annotation de plan avec sa
  **position en mm et sa couleur** — pdf.js ne donnant pas la couleur des
  fragments, `ecrituresColorees` la suit dans la liste d'opérations (matrices,
  avance des glyphes) et `annotationsDePage` rapproche chaque fragment de
  l'écriture la plus proche (2 pt), recolle les exposants (m²), puis fusionne
  les lignes d'un bloc (même couleur, 6 mm, 12 mm, « / ») ; sur les 26 plans
  de l'essai, 98,5 % des annotations de la référence PyMuPDF retrouvées et
  99,6 % de couleurs identiques. Tout est pur dans `dossierClaudeLogique.js`
  (testé) ; lecture, PDF réuni (pdf-lib) et ZIP dans `fabricationDossier.js`
  (pas `dossierClaude.js` : le Mac ignore la casse et le confondait avec
  `DossierClaude.jsx`). Les **consignes** du projet sont
  `consignesConformite.md` (copiées depuis la fenêtre) : changer leur texte
  oblige à monter `VERSION_CONSIGNES` (test) ; Claude signale un projet resté
  sur une ancienne version. « Rapport complet » fait tous les lots d'un coup
  (CCTP commun, chaque lot, Excel) et s'arrête proprement sur « Continue » si
  la réponse est trop longue. Le message à coller commence par le code de
  l'affaire : claude.ai titre la conversation d'après lui.

## To-do list (`src/modules/etude/todo/`)

Conception : `docs/superpowers/specs/2026-10-09-todo-list-design.md`. Même
module dans les deux phases du manifeste (objet `TODO`, un seul `lazy`).
Trois onglets : **À faire** en premier, encadré de couleur et ouvert
d'office (le plus consulté, à la demande de l'agence ; code `quotidien` dans
les liens) — tâches avec personne chargée, échéance, retards en rouge —,
**Mission** (phases Engagement → AOR, la phase en cours de l'affaire ouverte
par `phaseParDefaut`), **Contenu des plans** (à recommencer pour chaque
indice).

- **La liste type est en base, jamais dans le code** (demande de l'agence) :
  `todo_modele` (migration 066, remplie au départ depuis la section 7 de la
  conception), modifiable par « Modifier la liste type ». Une affaire ne la
  recopie pas : `todo_elements` ne garde que ce qu'elle a touché (type
  `modele`, upsert sur `(affaire_id, modele_id)`), ses articles propres
  (`article`) et ses tâches (`tache`). Fusion dans `articlesAffiches`
  (`todoLogique.js`, testé).
- Un article de la liste type n'est **jamais effacé** : `supprime_le`. Il
  disparaît des affaires, sauf là où il a été coché, annoté ou « sans
  objet » (grisé, « Retiré de la liste type », hors compteur).
- Toute coche note `fait_le` / `fait_par` (« Fait par Victor le 09/10 »).
- Liens de partage : `/affaires/<id>/todo?onglet=…&phase=…&tache=…`
  (`lienPartage` / `lireLien`). `RequireAuth` passe l'adresse demandée à la
  connexion (`state.depuis`), qui y ramène : un lien reçu mène au bon endroit.
- Tuile du tableau de bord : `resumeTuile` (phase en cours, tâches en retard).

## Gestion d'agence (`src/gestion/`)

Espace des **associés** (conception :
`docs/superpowers/specs/2026-10-09-gestion-agence-design.md`), bulle 04 de
l'accueil, routes `/gestion-agence[/:outil]` gardées par `AssocieSeul`
(attend tant que `estAssocie` vaut `null` : profil pas encore lu). Outils
déclarés dans `src/gestion/manifest.js` (une entrée = une tuile du tableau
de bord, une entrée de la colonne et une adresse) : calendrier des rendus,
suivi des tâches, associés. **Présenté comme une affaire**, à la demande de
l'agence (`GestionPage.jsx`) : colonne latérale avec « Tableau de bord » mis
en évidence puis les outils, tableau de bord à tuiles résumées
(`TableauBordGestion.jsx` ; un outil sans résumé montre sa description),
titre d'outil comme `TitreModule`. Violet `#7A4E9C`, passé aux composants
de la to-do list par `--affaire-accent`. Bouton violet « Revenir à la
gestion d'agence » dans `Topbar`, à côté de la cloche, pour les seuls
associés, sur toutes les pages sauf Gestion d'agence elle-même.

- **Associé** (migration 067) : `profiles.est_associe`, `est_associe()`,
  verrou par déclencheur ; on désigne par `designer_associe(compte,
  valeur)` (un compte ne modifie que sa propre fiche), jamais soi-même
  retiré. Premiers associés : `update profiles set est_associe = true where
  email in (…)` dans l'éditeur SQL — **aucun nom dans le dépôt**.
  `AuthProvider` lit le profil en `select('*')` et garde le statut sur
  l'appareil.
- **Rien n'est recopié** : calendrier et suivi lisent les plannings et
  `todo_elements` de toute l'agence (droits de lecture inchangés).
  Logique pure dans `gestionLogique.js` (testé) : jalon d'étude au
  **vendredi** de sa semaine ISO (`vendrediSemaineIso`, dates en UTC),
  `grilleMois`, `prochaines` (30 jours), `affairesModifiables` (= règle de
  `peut_modifier_affaire`), `groupesTaches`. Le calendrier porte les
  **initiales de l'équipe** de chaque affaire (`equipeParAffaire` :
  propriétaire et collaborateurs, **sans les associés** ni les extérieurs ;
  prénom composé en entier + initiale du nom), noms complets au survol.
- L'envoi des jalons vers Notion reste prévu, à part (décision du
  2026-10-09 : les deux).

## Suivi financier d'étude

`src/modules/etude/financier/`, données par `useSuiviFinancierEtude`. Les
phases ne sont **plus pré-enregistrées** : on tape le nom de la phase en cours
(suggestions `SUGGESTIONS_PHASES`) ; seules les lignes de
`suivi_financier_etude` s'affichent. Le code `phase` reste la clé (une nouvelle
phase reçoit `perso_N`, son nom dans `nom_custom`) ; les anciennes lignes
gardent `esq`, `avp`… dont le libellé sert de nom. Toujours afficher une phase
par `nomPhase`, et prendre « la dernière phase » par `dernierePhaseRenseignee`
(`phases.js`, testé) — la page de l'affaire aussi. L'**enveloppe globale
initiale** se modifie en haut de la page : c'est `affaires.enveloppe_ht`, le
même champ que la fiche de l'affaire, donc toujours identique des deux côtés.

**Montants : le HT prime** (demande de l'agence, migration 064). Partout dans
l'affaire, le HT se saisit et s'affiche en grand, le TTC en petit dessous
(`MontantHT.jsx`) ; le TTC se **déduit** au taux de l'affaire (`taux_tva`),
jamais saisi. `affaires` porte `enveloppe_ht`, `montant_travaux_ht`,
`honoraires_ht` à côté des `*_ttc`, toujours écrits ensemble. Lire un montant
d'affaire par `montantsAffaire` / `htDe` (`shared/montants.js`, testé) : sans
la migration, le HT se recalcule depuis le TTC, et l'écriture est retentée
sans les colonnes HT (`erreurColonnesHT` / `sansColonnesHT`). Les phases
(`suivi_financier_etude`) et les marchés des lots gardent leurs colonnes
HT / TTC ; le TTC d'un marché suit son HT au taux de l'affaire.
Saisie **au centime** : tout champ de montant porte `step="0.01"` (un
`step="100"` refusait 414 685 €) ; affichage par `formatEuros`, centimes
montrés seulement quand il y en a.

## Fiches de travaux modificatifs (FTM)

`src/modules/chantier/ftm/`, données par `useFtm`. **Plus d'onglet ni de
tuile** (`horsMenu` du manifeste, filtré par `phasesPour`) : les fiches se
créent, s'ouvrent et se suppriment **depuis le suivi financier du chantier**
(bouton « Éditer une fiche de travaux modificatifs », étiquette `FTM-012`,
crayon et corbeille de sa ligne — la ligne d'une fiche ne se modifie jamais
directement, elle se désaccorderait de la fiche). L'ancienne adresse
`/ftm?ftm=<id>` redirige vers `/financier-chantier?ftm=<id>`, qui ouvre la
fiche ; les liens des remarques et réserves y vont directement. La tuile du
suivi financier porte le résumé des FTM. Une fiche est **toujours rattachée
à un lot** (`erreurFtm`) et son montant se saisit sans signe, avec un sens
plus-value / moins-value (`sens_montant`, retiré par `payloadFtm` avant la
base). Une fiche naît du suivi financier, d'une remarque de compte rendu ou
d'une réserve d'OPR (`creerDepuis.js`) — **dans tous les cas elle a sa ligne dans le suivi
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

**Lecture seule d'une affaire dont on n'est pas collaborateur (migration
060)** : on se promène partout, on ne modifie rien. Trois étages, à garder
ensemble :

- **Base** : `peut_modifier_affaire(id)` = compte agence ET (propriétaire ou
  collaborateur de l'affaire, ou affaire sans collaborateur) — la même règle
  que `canEdit`. Posée en règles **restrictives** d'écriture (insert, update,
  delete) sur toutes les tables d'une affaire et sur le stockage rangé par
  affaire : elles s'ajoutent aux règles existantes (ET) sans toucher la
  lecture ; un extérieur garde ses propres règles. **Toute nouvelle table
  d'une affaire reçoit les mêmes règles restrictives** (comme la 061) (nouvelle
  migration qui rejoue le même bloc). Vérifiée par
  `scratchpad/pgtest/test060.mjs` (PGlite, 20 contrôles, hors dépôt).
- **Client** : `verrouillerEcritures` (`core/supabase/client.js`), posé par
  `AffairePage` pour un compte agence sans droit : tout `insert`, `update`,
  `upsert`, `delete` et dépôt de fichier rend `{ error: LECTURE_SEULE }` sans
  rien envoyer — les écrans traitent déjà l'erreur (le planning recharge).
  Un geste refusé affiche « Lecture seule… Rien n'a été modifié »
  (seulement juste après un geste : les écritures automatiques au
  chargement sont refusées sans bruit).
- **Écran** : chaque module reçoit `lectureSeule`. Boutons de modification
  masqués (barres d'outils des plannings, suivi financier, lots, fiche FTM
  consultable sans enregistrer) ; là où l'édition est partout (gestes des
  plannings, suivi financier d'étude), `ZoneConsultation` arrête clics,
  saisie et glissers ; `data-consultation="libre"` garde un élément actif
  (panneau Affichage). Piège : en développement, un fichier modifié est
  servi avec `?t=…` — un test qui importe `/src/…` sans ce suffixe obtient
  une autre copie du module (verrou non posé).

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

## Hors ligne (chantier sans réseau)

Ouvrir l'app, rester connecté, retrouver le portail et toute affaire déjà
ouverte sur l'appareil — sans réseau. Vérifié le 2026-10-06 sur la version
construite (service worker actif, réseau coupé, jeton expiré) : portail et
affaire en 0,1 s. La visite elle-même suit ses propres règles (« Visite hors
ligne », plus haut).

- **Mémoire des pages** : service worker (`vite.config.js`), réponses de la
  base en `NetworkFirst` (`supabase-api`, 4 000 réponses, 45 jours, bascule
  sur la mémoire si le réseau ne répond pas en 6 s), photos publiques à part
  (`supabase-images`). Les liens signés ne sont pas gardés (ils changent à
  chaque fois). Tout est effacé à la déconnexion (`viderMemoireDonnees`).
- **Connexion** (`AuthProvider`, `sessionHorsLigne.js`, testé) : passé une
  heure, le jeton doit se renouveler ; sans réseau, Supabase répond « pas de
  session » après avoir cherché le réseau jusqu'à 30 s — l'app renvoyait à la
  page de connexion. Désormais, sur un échec **de réseau**, l'utilisateur
  rangé sur l'appareil fait foi (tout de suite si `navigator.onLine` est
  faux, au bout de 2,5 s sinon) ; un refus du serveur déconnecte. Seul
  `SIGNED_OUT` efface l'utilisateur. Au retour du réseau, le jeton se
  renouvelle.
- **Lectures hors ligne sans attendre** (`core/supabase/client.js`) : sans
  réseau, `supabase.from` passe par un second client **sans session** (la
  mémoire du service worker répond d'après l'adresse, pas d'après le jeton)
  et **sans relances** (`rest.retry = false` ; postgrest-js relance trois
  fois une erreur réseau, 7 s par écran).
- **Ne jamais demander l'utilisateur au serveur** pour afficher :
  `auth.getUser()` part sur le réseau. `useAuth().user` (sur l'appareil).
  Piège vu : `useAffaireCollaborateurs` le demandait, et sans réseau l'affaire
  pouvait passer en lecture seule en pleine visite.
- **« Préparer pour le chantier »** (bloc « Visite de chantier » du tableau
  de bord, `BandeauVisite`) : ouvre une à une, dans un **cadre caché**, les
  vraies pages utiles sans réseau (`etapesPreparation` : liste des visites,
  la visite en cours — sinon la dernière — **en mode Visite**, ce qui
  l'emporte avec photos et plans, lots, planning chantier, pièces écrites,
  dont la copie de recherche est attendue). Recopier leurs requêtes ici les
  aurait désaccordées des pages. Une page est finie quand plus rien ne part
  depuis 2,5 s (`pageCalme`) ; la visite est vérifiée dans IndexedDB.
  Résultat sur l'appareil (`jga.preparation.<affaire>`) : prête, ancienne
  (plus de 24 h), incomplète (`etatPreparation`, testé). ~17 s sur une
  petite affaire.
- **Envoi des modifications sans rouvrir la visite** (`horsLigne/synchro.js`)
  : la file de **toutes** les visites part à l'ouverture de l'app, au retour
  du réseau, au retour au premier plan et chaque minute s'il reste quelque
  chose (`useMoteurSynchro`, dans `AppShell`, jamais dans le cadre caché).
  Un seul envoi à la fois, même entre fenêtres (Web Locks), et la file est
  relue sous le verrou : rien ne part deux fois. La visite ouverte passe par
  le même envoi (`envoyerFileDuCr`) ; l'événement `jga-file-hors-ligne`
  tient les écrans à jour. Témoin dans le bandeau du haut (`TemoinEnvoi`,
  `temoinFile`) et ligne par visite sur le tableau de bord
  (`resumeParVisite`, testés) ; un refus mène à la visite.
- **Rien d'automatique ne doit crier sans réseau.** À l'ouverture d'un CR,
  la mise à jour de la feuille de présence (`syncPresences`) et la lecture
  des lots attendent le réseau en silence (relance sur `online`) : elle
  affichait « Non enregistré. TypeError: FetchEvent.respondWith… no-response »
  — message du service worker sans copie gardée (Safari), désormais reconnu
  comme coupure (`erreurReseau`, `messageErreur` : « Pas de réseau »).
  L'avancement d'une tâche pointé en visite passe par la file
  (`tache.avancement`, écrit dans `planning` à l'envoi).
- **Démarrer une visite sans réseau** (`horsLigne/creationLogique.js`,
  testé) : `createCR` (bouton « Démarrer », « Nouvelle visite ») crée la
  visite **sur l'appareil** si le réseau manque (ou ne répond pas) : id
  décidé sur l'appareil, numéro = plus grand connu + 1, reprise de la visite
  précédente **emportée** par les mêmes règles (`preparerReprise`), ses
  participants à pointer (`presencesReprises`, copies `copie_*` comprises).
  Sans visite précédente emportée : refus, avec renvoi vers « Préparer pour
  le chantier ». La création est **la première opération de sa file**
  (`cr.creer`, `envoyerCreationCr`) : la visite, puis sa reprise niveau par
  niveau, puis le reste de la file. Doublon `23505` : la visite existe déjà
  (envoi rejoué) ou son **numéro a été pris** — elle prend alors le suivant
  libre, l'instantané suit et un avis s'affiche sur le tableau de bord
  (`jga.visites-renumerotees`). Tant que la création attend, la visite se lit
  sur l'appareil (`fetchAll`), la feuille de présence ne se complète pas, et
  toute écriture passe derrière la file (`executerOperation` : l'ordre de
  création est l'ordre d'envoi, même en ligne). La liste des visites inclut
  les visites en attente (`visitesEnAttente`), sinon « Démarrer » en
  créerait une seconde. Mode Visite : « n° provisoire ».
- **Écran** : `BandeauHorsLigne` (dans `AppShell`) dit « Hors ligne » et la
  date de la dernière réponse reçue du réseau (`derniereSynchro`, notée par
  le `fetch` du client). Portail sans copie : message au lieu de « 0
  affaire » (`useAffaires().horsLigne`) ; affaire sans copie : message au
  lieu d'une roue sans fin (`useAffaire().horsLigne`).

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
  Accrocher : chaque barre et chaque segment montrent alors **un rond à
  chaque bout** (`shared/planning/ReperesAccroche.jsx`, posé à côté de la
  barre — elle coupe ce qui dépasse ; zone sensible de 36 px pour le doigt ;
  une phase coupée par des congés n'a qu'un rond au tout début et au tout
  bout) : toucher un rond dit le bord. Toucher la barre ailleurs garde la
  règle des moitiés, gauche = début, droite = fin (`bordTouche`). La **date reste stockée** (exports, page
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
