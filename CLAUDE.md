# Repères pour travailler sur ce dépôt

Gestionnaire d'affaires de l'agence JGA Architectures. React 19 + Vite
(rolldown), Supabase (base, auth, stockage), déployé sur Vercel depuis `main`.

Ce fichier existe pour éviter de re-explorer le dépôt à chaque tâche. Il donne
les points d'entrée ; le détail se lit dans les fichiers cités.

## Commandes

```
npm run dev      # serveur local, port 5173
npm run build    # doit passer avant tout commit
npm test         # 1904 tests node --test (plannings, to-do list, gestion d'agence, jalons accrochés, suivi financier d'étude, exports, comptes rendus, photos, plans, visite, rapport, diffusion, OPR, allègement PDF, analyseur réglementaire, import de planning, convertisseur, dossier pour Claude, échéances Notion, DPGF, module Plans, gestion de l'application, état des lieux)
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
- **Pas d'animation d'ouverture** : celle du logo construit pièce à pièce
  (`index.html`) a été retirée à la demande de l'agence (2026-11-16) — on
  arrive directement sur la page.
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
  **Carnet d'adresses : plusieurs interlocuteurs par organisation**
  (migration 072, conception
  `docs/superpowers/specs/2026-10-13-carnet-interlocuteurs-design.md`).
  Un contact d'affaire est relié à sa personne du carnet par
  `affaire_interlocuteurs.interlocuteur_id` (+ `entreprise_id`), mais ses
  champs copiés restent l'**historique imprimé** dans les CR : modifier le
  carnet ne change jamais une affaire. `lienDepuisLiaison`
  (`comptes-rendus/carnetLogique.js`) relie d'après une correspondance de
  valeurs **seulement** si le contact n'a pas été rempli depuis le carnet et
  n'est pas déjà lié, et si prénom + nom (ou l'organisation) correspondent
  encore à la fiche — sinon l'ancienne fiche remplaçait un choix fait.
  Attention : `affaire_interlocuteurs.interlocuteur_id` est un identifiant de
  personne du carnet, alors que les colonnes `interlocuteur_id` de
  `cr_presences`, `cr_remarques` et des tables OPR désignent des lignes de
  `affaire_interlocuteurs` — ne pas les mélanger.
  L'organisation (`entreprises.type` : entreprise / bet / moa / autre,
  déduit une fois par la 072, filtre dans le carnet) a ses personnes
  (`PersonnesOrganisation.jsx`). Les **usages** (lots représentés, contacts
  d'affaire, affaires touchées) se calculent dans
  `shared/carnet/carnetLiensLogique.js` (testé), jamais stockés ; **une
  personne utilisée ne se supprime pas** (`personneSupprimable`). Clé de
  comparaison jumelle : `carnet_cle` (SQL) et `cleComparaison` (JS) à
  modifier ensemble (ligatures œ / æ développées). Menu de la personne d'un
  lot (`ordonnerPersonnes`, principale en tête) : remis à zéro quand
  l'entreprise change, « (représentant actuel) » en repli si la personne
  n'est plus dans la liste, entreprises relues après l'enregistrement d'une
  personne. **Suppression d'une organisation** (`handleDelete`) :
  `peut_modifier_affaire` vérifié sur chaque affaire concernée avant tout
  retrait (un refus RLS ne rend pas d'erreur), puis les attributions de lots
  supprimées **avec décompte des lignes**, puis l'organisation (ses
  personnes partent par cascade). Sans la 072, le carnet et les contacts
  tolèrent l'absence des colonnes (`type`, `interlocuteur_id`) et
  réessaient sans elles.
- **Téléphones fixe et portable** (migration 076, `shared/telephones.js`,
  testé) : `telephone` = le fixe, `telephone_portable` à côté (`entreprises`,
  `interlocuteurs`, `affaire_interlocuteurs`) et `moa_telephone_portable`
  pour le maître d'ouvrage ; copies `copie_telephone_portable` des présences
  (CR, OPR), envoyées **seulement si la fiche lue porte la colonne**
  (`copiePresence`). La 076 a réparti les anciens numéros (06 / 07 au
  portable, le reste au fixe), règle jumelle de `repartirNumeros`. Affichage
  par `numerosFiche` / `texteTelephones` / `LiensTelephone` (combiné ou
  mobile) ; un numéro en 06 resté au fixe compte pour un portable (vCard
  CELL, Outlook « Mobile Phone »). Un numéro manquant du représentant d'un
  lot est pris à son entreprise, champ par champ. Lectures en `*` (pas de
  liste de colonnes) pour récupérer le portable quand la base l'a ; sans la
  076, `sansPortable` le joint au fixe (« 03 … / 06 … »). Les replis de
  colonnes manquantes s'enchaînent par `ecrireAvecReplis`
  (`shared/repliColonnes.js`).
- **Références cadastrales** (migration 076, `affaire/cadastreLogique.js`,
  testé) : `affaires.cadastre_references` (jsonb `[{ section, parcelles,
  superficie }]`), autant de sections que voulu, une superficie par section.
  Toujours lire par `referencesCadastre` (repli sur les anciennes colonnes) ;
  l'enregistrement (`colonnesCadastre`) tient aussi à jour `cadastre_section`
  / `cadastre_parcelle` (première ligne) et `cadastre_superficie` (total).
- **Base** : `supabase/migrations/`, numérotées, 84 fichiers, **passées à la
  main** dans le SQL Editor de Supabase : un code qui dépend d'une nouvelle
  colonne doit tolérer son absence tant que la migration n'est pas faite.
  **Toute table créée depuis le 2026-10-30 doit recevoir ses droits d'API
  dans la migration qui la crée** (Supabase ne les donne plus d'office ;
  sans eux : « permission denied ») : `grant select, insert, update, delete
  on public.<table> to authenticated;` et de même `to service_role;` —
  `anon` seulement si des visiteurs sans compte doivent la lire (jamais pour
  une table de l'agence). Les tables antérieures ne changent pas. La photo de
  couverture d'une affaire est `affaires.photo_url` (migration 014, bucket
  public `affaires-photos`).

## Conventions

- **Français partout** : commentaires, messages de commit, noms de variables
  métier. Les commits suivent `feat:` / `fix:` / `chore:` / `test:`.
- **Les réponses de Claude à l'utilisateur sont toujours en français**, y
  compris les comptes rendus de fin de tâche et les questions posées.
- **Styles inline**, pas de Tailwind. Les couleurs passent par les variables CSS
  de `src/index.css` (`--jga-orange`, `--jga-green`, `--jga-beige`…).
- **Chaque partie a la couleur de sa bulle d'accueil** (demande de l'agence) :
  affaires en orange (vert au chantier, `--affaire-accent`), Boîte à outils
  en vert (`--jga-green`, `--jga-green-light`), Carnet d'adresses en bleu
  (`--jga-blueprint`), Gestion d'agence en violet (`#7A4E9C`). Un élément
  coloré d'une de ces parties prend sa couleur, jamais l'orange par défaut.
- **Animations** : les `@keyframes` et les classes d'entrée vivent dans
  `src/index.css`, jamais inline — seul le `animation-delay` est inline. C'est
  ce qui permet au bloc `prefers-reduced-motion` de les neutraliser.
- **Une fenêtre (modale, panneau, confirmation, visionneuse) ne se ferme
  jamais au clic à côté**, à la demande de l'agence : un geste de trop
  perdait une remarque en cours de rédaction. Seuls ✕, Annuler, Échap ou
  l'action elle-même la ferment ; le fond ne porte aucun `onClick`. Les menus
  déroulants et sélecteurs (date, couleur) gardent, eux, la fermeture au
  clic extérieur.
- **Vocabulaire : « échéance », jamais « jalon » à l'écran** (demande de
  l'agence, 2026-10-09) — boutons, titres, messages, exports PDF et Excel,
  au féminin (« une échéance accrochée », « l'échéance »). Le code, les
  tables (`planning_jalons`, `planning_etude_jalons`), les identifiants et
  les commentaires gardent « jalon ». `MenuRadial` reçoit `objet="échéance"`
  et élide l'article (`avecArticle`).
- **Choisir une affaire** se fait par `ChoixAffaire`
  (`shared/components/ChoixAffaire.jsx`) : barre de recherche dont la liste
  se resserre à chaque lettre, code ou nom (ou maître d'ouvrage), sans
  majuscules ni accents (`filtrerAffaires`, `choixAffaireLogique.js`, testé),
  ↑ ↓ Entrée Échap, lignes de 44 px. Pas de `<select>` d'affaires.
- **Initiales d'une personne** (pastilles du portail, de l'affaire, des
  collaborateurs, du calendrier des rendus et de son PDF) : toujours par
  `initialesPersonne` (`shared/initiales.js`) — une lettre par partie du
  prénom puis du nom, à la demande de l'agence (« Claire Avril Rat » → CAR,
  « Véronique Durafour-Soro » → VDS). Trois lettres : police réduite dans le
  rond.
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
  photos et plans ; depuis la 075, aussi les **photos de couverture** que
  plus aucune affaire ne désigne (`affaires.photo_url`, chemin comparé sans
  le « ?… »), comptées à part (`couvertures` de `resumeOrphelines`). **Une suite a ses propres photos** (`remarque_id` = l'id
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
  **Module « Plans »** (phase chantier, `src/modules/chantier/plans/`,
  conception `docs/superpowers/specs/2026-10-21-module-plans-design.md`,
  remplace l'ancienne rubrique « Documents · bientôt ») : **les mêmes
  plans**, aucune table de plus. Import d'un **jeu de plans** (`ImportPlans`,
  règle pure `importPlansLogique.js`, testée) : toutes les pages de chaque
  PDF, cochées, nom d'après le fichier (« – p. N ») ; une page qui porte le
  nom d'un plan existant (`cleNom`) en devient la **nouvelle version**, sauf
  « en faire un nouveau plan » ; deux pages cochées du même nom bloquent.
  Ouvert avec réseau, le module recopie sur l'appareil aperçu et image de
  la version courante de chaque plan (`cheminsAGarder`, `garderImages`) ;
  « Préparer pour le chantier » a son étape « Plans ». Bouton **« Plans »
  du mode Visite** (`PanneauPlansVisite`) : liste puis plein écran
  (`PlanPleinEcran`, commun au module) avec les pastilles de la visite ;
  `PlansContexte` porte pour cela `liens`, `obtenirLiens` et `remarques`.
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
    Le moteur côté écran est commun aux CR et à l'état des lieux
    (`useEnregistreur` : démarrer, pause, reprendre, arrêter, `couper()` ;
    état décidé par les seuls signaux du moteur, `etatApresEvenement`) ;
    les morceaux portent `crId` **ou** `edlVisiteId` (`deLaVisite`,
    `champsVisite`). Le robot des CR garde son affichage d'avant
    (`etatPourLeCr` : sourdine et échec y restent « enregistre », la durée
    avance pendant la sourdine). Les tranches orphelines ne sont jamais
    recollées pendant que leur enregistrement tourne
    (`enregistrementsARecuperer`).
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

CCTP et DPGF des bureaux d'études, importés en PDF (et Excel pour les DPGF),
découpés en articles ou en lignes et cherchables — au bureau (module, partie Étude) et en visite (bouton « CCTP »
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
- **Lecture d'un CCTP entier** (`LecteurCctp.jsx`, `lectureCctp` testé) :
  toucher la tuile d'un CCTP, ou « Lire dans le CCTP » sur un article
  trouvé (module et mode Visite), ouvre le texte en plein écran, articles à
  la suite, repère à chaque page qui commence, sommaire des deux premiers
  niveaux qui suit la lecture. Le PDF n'étant pas gardé, c'est le texte
  remis en page (choix de l'agence, 2026-10-15) : ni tableaux ni images.
  Portail vers `body` : la couleur de la phase est relue sur une ancre.
- **DPGF** (conception `docs/superpowers/specs/2026-10-19-dpgf-design.md`,
  migration 073, `dpgfLogique.js` pur, `tests/dpgf.test.js` sur tableaux
  inventés ; 9 DPGF réels hors dépôt, `Desktop/PERSO/Exemples DPGF`) :
  **vierges seulement, jamais les prix** — numéro, désignation, unité,
  quantité ou texte (« PM », « CP », « Inclus en armoire »). Une pièce
  `type = 'dpgf'` par lot à côté du CCTP ; lignes dans `pieces_dpgf_lignes`.
  **`enregistrerPiece` remplace par lot ET par type** (sinon un DPGF
  effaçait le CCTP). Excel (`lectureTableur.js`, SheetJS à la demande) :
  en-tête unité + quantité, colonnes recalées sur les valeurs, **texte
  affiché** des cases (« 1.10 » saisi en nombre vaut 1.1), lecture depuis le
  haut de la feuille (l'en-tête répété arrive parfois après les premiers
  articles), numéro en tête de désignation pris s'il suit logiquement,
  sous-totaux / totaux / signature écartés ; colonnes désignées à la main en
  repli. PDF (`casesDePage`, abscisses des fragments) : pages à tableau
  par l'en-tête, désignation sur plusieurs lignes (continuée si minuscule,
  ou si la ligne précédente atteignait le bord du texte — bord lu sans les
  sous-totaux qui débordent), quantité posée entre deux lignes, rubrique
  « Localisation : » qui ouvre une ligne, numéro dans sa propre case
  accepté même s'il saute ; **un PDF peut contenir CCTP et DPGF**
  (`lirePdfPieces`). À l'import, le DPGF d'un PDF s'efface devant l'Excel
  du même lot. **Lien au CCTP calculé, jamais stocké** (`lienCctpDpgf`) :
  même lot, même numéro (`cleNumero` : « 3.0 » ≡ « 3 ») ; sur les exemples,
  88 à 100 % des lignes reliées. Écran : une tuile par lot (`piecesParLot`),
  `LecteurDpgf` (article sans correspondant dans le CCTP du lot marqué
  « Absent du CCTP », ambre du bandeau qui les compte), lignes en gris sous
  chaque article de `LecteurCctp`,
  passage de l'un à l'autre par `LecturePiece`, cadre commun
  `CadreLecture` ; recherche (`chercherLignesDpgf`) ; copie hors ligne avec
  `lignes`. Sans la 073, le module marche comme avant (`dpgfDisponible`).
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

## État des lieux (`src/modules/etude/etat-des-lieux/`)

Bâtiment existant : plans de l'existant → étages et pièces → (lots 2 à 4)
visite enregistrée pièce par pièce, analyse par Claude, export DXF par
calques `EDL-` et rapport PDF. Conception :
`docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` ; plan du
lot 1 : `docs/superpowers/plans/2026-11-17-etat-des-lieux-lot1-preparer.md`.

- **DWG ou DXF** (`formatPlanEdl.js`, reconnu au contenu ; décisions de
  l'agence du 2026-11-17) : PDF et DXF binaire refusés avec ce qu'il faut
  faire. Le PDF a été retiré : Claude n'y retrouvait qu'une partie des
  pièces (≈ 35 sur 200 sur une feuille d'étages réduite à 2 000 px) et
  certains plans n'ont pas de noms de pièces.
- **DWG converti sur l'appareil** (`convertisseurDwg.js`) : LibreDWG en
  WebAssembly (`@mlightcad/libredwg-web`, version épinglée, **GPL-3.0**,
  accord de l'agence), `dwg_write_dxf`, puis lecture comme un DXF ; c'est le
  DXF converti qui est gardé comme source. Chargé au premier DWG seulement
  (`import()` + `.wasm` désigné par `new URL(…node_modules…, import.meta.url)`
  car le paquet n'exporte pas son `.wasm`), exclu du préchargement de la PWA
  (`globIgnores`). DWG d'exemple (2010, 2018) : pièces identiques à un DXF
  converti en ligne, 0,2–0,3 s dans Chrome. Conversion ratée : refus du
  fichier avec le motif et « Enregistrer sous → DXF ».
- **DXF** (`dxfLecture.js`) : blocs déployés (ArchiCAD range le plan dans
  des blocs de vues, un par étage), espace papier ignoré sauf si l'espace
  objet est vide, MTEXT nettoyés (`^J`, `\P`, `\p…;`, codes de police). Fichiers
  R14 décodés en Windows-1252.
- **Pièces** (`piecesDxfLogique.js`) : **jamais reconstruites depuis les
  murs**. Le calque des pièces est celui dont les polylignes fermées
  contiennent une surface écrite égale à la surface dessinée ; le rapport
  donne l'unité (zones ArchiCAD en cm, géomètre en m). **Plusieurs calques
  retenus** s'ils passent ce test avec la même unité que le meilleur (zones
  rangées par étage : `S-SURFACES_RDC`, `S-SURFACES_R+1`…). « HP » = hauteur sous
  plafond ; « Hp » (porte) et « HSP » (poutre) ignorés — la casse compte.
  Un tampon de zone sans nom prend celui du calque des désignations
  (`CALQUE_DESIGNATION`), jamais du mobilier.
- **Jamais deux pièces superposées** (règle de l'agence,
  `retirerSuperpositions` / `pieceChevauchee` de `geometrieEdl.js`, part
  recouverte mesurée par échantillonnage, seuil 5 %) : à l'import, **étage
  par étage** (ceux d'ArchiCAD se superposent entre eux), les plus petites
  pièces sont gardées et les zones qui les recouvrent écartées (surfaces
  « SDO », tout l'étage : 24 sur le DXF ArchiCAD d'essai, 199 pièces
  gardées) ; même règle pour les pièces de Claude ; à l'écran, un geste qui
  ferait chevaucher une autre pièce n'est pas enregistré (message).
- **Couloirs = reste des zones englobantes** (`restesLogique.js`, testé) :
  dans ArchiCAD les circulations n'ont souvent pas de zone « SU », elles
  n'existent que dans les zones « SDO ». Le reste d'une zone écartée (moins
  ses pièces) est calculé sur une grille de 10 cm ; chaque morceau qui porte
  un nom du calque des désignations devient une pièce (numéro écrit dedans),
  un morceau à deux noms est partagé au plus proche, un reste sans nom est
  ignoré. Zones traitées de la plus petite à la plus grande ; un nom déjà
  dans une pièce n'est pas repris ; une case de marge le long des pièces
  voisines (pas de la façade) garde la règle « jamais superposées ». DXF
  ArchiCAD d'essai : 24 couloirs retrouvés, 0 superposition.
- **Étages** (`niveauxLogique.js`) : par nom de bloc ou de calque (RDC,
  RDJ / Rez-de-jardin, SSOL / SOUS-SOL, R+n, Combles — les étages
  d'ArchiCAD sont superposés), sinon grappes de traits (cellule d'un mètre)
  et grappe qui porte les pièces — la plus petite qui les contient parmi
  les **vrais dessins** (au moins 1 % des traits) : une limite de terrain
  trop longue pour la grille fait une grappe d'un seul trait qui entoure
  les pièces, et l'étage s'affichait sans ses murs ; nom d'après le fichier
  s'il n'y a qu'un étage ; dessin morcelé sans pièces : tout en un étage.
- **Marques de zone** : certains exports écrivent l'alignement MTEXT
  `\A1{…}` sans point-virgule et l'exposant en `\S2^ ;` (`nettoyerMtext`) ;
  mal nettoyée, la surface ne se lisait plus et l'import passait à Claude.
- **Claude** (`piecesIaLogique.js`, `api/edl-pieces.js`, SDK Anthropic,
  `claude-opus-5-5`, sortie JSON imposée, replis `fallbacks: 'default'`) :
  seulement pour un étage dont le DXF n'a pas de contours ; reçoit l'image (2 000 px)
  et les textes positionnés ; pièces « à vérifier » (bleu). Crédits API du
  forfait Max (organisation « JGA's Individual Org »). **Aucune entrée dans
  `vercel.json`** pour cette fonction : au-delà de 60 s sans Fluid compute,
  Vercel refuse tout le déploiement ; durée par défaut du projet.
- **Relecture du découpage** (`relectureLogique.js`, `relectureIaLogique.js`,
  `relectureIa.js`, `api/edl-relecture.js`, `PanneauRelecture.jsx`) : on
  **signale, on ne corrige jamais** (Claude dessine mal les contours sur un
  plan dense ; ceux du DXF sont exacts). Contrôles sans IA recalculés à
  l'affichage : nom écrit sans pièce autour (textes d'étage gardés **avec
  leur calque** depuis cette version ; étages plus anciens : contrôle
  sauté), pièce sans nom, surface dessinée ≠ écrite, pièce < 0,5 m², même
  nom et même numéro. Claude relit chaque étage **à l'import** (aperçu
  2 000 px, pièces numérotées dessus, liste des pièces, noms sans pièce) et
  sur demande (« Relire avec Claude ») ; ses signalements et les écartés
  (« C'est juste ») sont dans `edl_niveaux.relecture` (migration 078 ; sans
  elle, gardés pour la séance seulement, message). Un échec de la relecture
  n'arrête pas l'import.
- **Repère** : contours en mètres dans le repère du plan d'origine (y vers
  le haut) ; `edl_niveaux.cadrage` lie mètres et pixels de l'image
  (`versPixels` / `versMetres`).
- **Import** (`importerPlans.js`) : un import interrompu retire ce qu'il a
  écrit (`annulerImport` : étages, état des lieux qu'il a créé, fichiers) —
  relancer ne double rien. Un fichier illisible n'est refusé que seul.
- **Données** (migration 077) : `edl_etats` (un par affaire), `edl_niveaux`
  (image 6 000 px + aperçu, textes du plan, source compressée), `edl_pieces`
  (contour, surface et HP lues, origine dxf / ia / main, `a_verifier`,
  `fiche` pour le lot 3). Stockage privé `edl` (`<affaire>/edl/…`), compté
  par `fichiers_orphelins()` et la gestion de l'application. « Remplacer les
  plans » supprime tout l'état des lieux, visites comprises (voir plus
  bas). **La règle restrictive de stockage
  de la migration 060 est remplacée en bloc** : toute future migration qui
  ajoute un bucket doit répéter la liste complète, `edl` compris (sinon ce
  bucket s'ouvre à tout compte agence).
- **Charte** : l'import est une fenêtre (portail, fond papier, liseré
  `--affaire-accent`, zone de dépôt en pointillés) comme celui des pièces
  écrites ; onglets soulignés des étages comme la to-do list ; angles
  presque droits (2–3 px), bordures 0,5 px, alertes rouge `#B8412C`, ambre
  `#FFFBEB` / `#92400E`. Pas de `flex-wrap` autour du plan : la liste de
  200 pièces étirait la rangée et le plan sortait de l'écran.
- **Plans allégés et vectoriels** (2026-11-18, migration 081, plan
  `docs/superpowers/plans/2026-11-18-etat-des-lieux-plans-vectoriels.md`) :
  un plan ArchiCAD exporte le noir des murs et les motifs (tuiles, gravier)
  en centaines de milliers de petits traits — 540 000 sur un R+1, dont
  ~7 000 utiles. À l'import, chaque **calque** reçoit un traitement
  (`simplificationPlan.js`, pur, testé) : `garder`, `masse` (traits de
  moins de 10 cm → masses au pochage blanc et contour épais, grille creuse
  au centimètre, fermeture de 2 cm, anneaux tracés et adoucis), `masquer-motif`
  (petits traits retirés, contours gardés) ou `masquer`. **Claude propose**
  (`api/edl-calques.js`, `calquesIaLogique.js` : statistiques et un extrait
  dessiné par calque, « dans le doute, garder ») ; sans lui, défauts
  (`decisionsParDefaut` : ≥ 90 % de petits traits et ≥ 500 traits → `masse`
  si MUR / CLOISON, sinon `masquer-motif`). La fenêtre d'import montre un
  menu par calque et un **aperçu** (400 ms après le dernier choix) ; un choix
  à la main n'est jamais écrasé par une réponse tardive de Claude, et un
  changement d'unité ne garde que les choix de Claude et de la main
  (`reprendreDecisions`). Chaque étage reçoit un fichier
  `<affaire>/edl/vecteurs/<uuid>.json.gz` (`encoderVecteurs`, au mm ;
  50–150 Ko) et `edl_niveaux.calques` (`{ decisions, raisons, source }`) ;
  l'image est dessinée depuis le plan allégé. **Affichage** : prop
  `dessinFond` de `VisionneusePlan` (canevas sous le bloc transformé,
  redessiné dans le même `requestAnimationFrame` que la vue — planifié par
  `useLayoutEffect`, sinon décalé d'une image pendant un glisser — seuls
  les éléments visibles), et `sansPleine` : l'image de 6 000 px n'est plus
  chargée quand l'étage a son fichier vectoriel (≈ 96 Mo de mémoire sur
  iPad), sauf si sa lecture échoue ; appuis mesurés sur un bloc de la taille
  du plan. Zoom maximal **selon l'échelle** (`zoomMaxVectoriel` : 1 cm = 20 px
  d'écran ; `zoomMax` de la visionneuse accepte une fonction de l'échelle),
  au lieu du plafond des images (12, 60 en visite). `useVecteursEdl` (cache par chemin, plafonné au poids décodé :
  ~1,5 M points, l'étage affiché toujours gardé). Hors ligne : aperçus, puis
  fichiers vectoriels, puis images pleines des étages qui n'en ont pas
  (`garderImages`). Sans la 081 : import et affichage comme avant (repli par
  `colonnesVecteursManquantes`). Les comptes rendus ne passent aucune de ces
  props : leur visionneuse est inchangée.
- **Écran** : `EditeurPieces` sur `VisionneusePlan` (nouvelle prop `calque`,
  SVG au-dessus de l'image) : sommets déplacés au doigt, rond de milieu =
  nouveau sommet (zone sensible de 44 px sous chaque rond), **« Annuler »**
  (⌘Z / Ctrl+Z hors des champs) défait les derniers gestes — contour
  modifié, pièce dessinée, pièce supprimée (qui revient sous un nouvel id,
  les gestes plus anciens suivent) ; en dessin, ⌘Z et « Dernier angle »
  retirent le dernier angle touché,
  `pointercancel` = rien d'enregistré. Bandeau « Échelle à vérifier » par
  étage si la médiane surface dessinée / écrite s'écarte de plus de 15 %
  (`ecartEchelle`, au moins trois surfaces écrites). Lecture ratée : ni
  anciens étages, ni import proposé (« Réessayer »).
- **Visite (lot 2)** (`visite/`, migration 079, plan
  `docs/superpowers/plans/2026-11-17-etat-des-lieux-lot2-visiter.md`) :
  « Démarrer la visite » (`?visite=1`, gardé au rechargement) ouvre
  `VisiteEdl`, écran plein. Le micro s'ouvre **dans le geste** (Safari),
  puis la visite est créée (`edl_visites`, id décidé sur l'appareil) ; l'écran
  de départ reste tant que la ligne n'est pas écrite, et si `commencer()`
  est refusé le micro s'arrête et un message s'affiche. Une visite non
  terminée se reprend. Enregistrement continu par le moteur
  des CR (`useEnregistrementEdl`), **coupé à chaque entrée et sortie de
  pièce** (`couper()`), pas à chaque point (horodatages par segment de
  Mistral à vérifier au lot 3 ; d'après sa documentation,
  `timestamp_granularities` est incompatible avec `language`). Au lot 2,
  l'audio de l'état des lieux attend sur l'appareil (`jga-audio`) : ni
  transcription ni envoi par le moteur de synchro avant le lot 3. Bandeau
  rouge « Enregistrement · 12:34 » + jauge ; **dès que rien n'est
  enregistré** (pause, sourdine, micro coupé, échec) un voile gris recouvre
  le plan et avale tout geste, pincement compris : seuls « Reprendre
  l'enregistrement », « Pause » et « Terminer » restent. Toucher une pièce
  l'agrandit (`cadre` / `zoomMax` de `VisionneusePlan`, `vueSurCadre`, zoom
  jusqu'à 60) ; tout point posé appartient à la pièce ouverte, même sur une
  cloison ; hors des pièces, un point se rattache à l'étage. Sur la vue de
  l'étage, **tous les points se touchent** (ceux d'une pièce sont atténués) :
  toucher le point d'une pièce ouvre cette pièce (entrée au journal,
  morceau coupé) et le sélectionne ; **jamais de nouveau point posé sur un
  point existant**. Points numérotés dans l'ordre de
  l'état des lieux (`numeroSuivant`, décidé sur l'appareil), type facultatif
  par la barre des calques (`calquesEdl.js`, seule liste des calques
  `EDL-` et des types), photo, déplacement (seul le point choisi capture
  le doigt ; les autres se choisissent par un appui bref, `pointProche`, et
  un doigt posé dessus fait défiler le plan ; second doigt ou
  `pointercancel` = rien d'enregistré), suppression, **Annuler / ⌘Z**
  (`operationInverse`, l'entrée d'annulation n'est empilée **qu'après**
  l'écriture réussie). Barres au-dessus du plan à hauteur fixe pendant
  toute la visite et `cleDeCadre` (taille du conteneur dans la clé) : une
  pièce ouverte est toujours bien cadrée. Pièces grises tant
  qu'elles ne sont pas visitées (`piecesVisitees`). **Aide-mémoire** (demande
  de l'agence, 2026-11-19, `aideMemoireLogique.js` testé, `AideMemoireEdl.jsx`)
  : ouvert à chaque entrée dans une pièce (réglage de l'appareil, case dans le
  panneau), en haut à droite du plan, fermé par ✕, rouvert par le bouton
  « Aide-mémoire n/N » de la barre de la pièce. Rappelle finitions et leur
  état, bloc porte, menuiseries, électricité, plomberie, chauffage,
  sécurité, désordres ; chaque rubrique se coche seule (fiche remplie par
  l'analyse, HSP lue sur le plan, point ou élément de son calque dans la
  pièce). La liste ne vit que dans `AIDE_MEMOIRE`.
  **Journal** `edl_evenements` (debut, fin, entree, sortie, point,
  point-modifie, point-supprime, photo, pause, reprise, coupure), heure de
  l'appareil.
- **Hors ligne de la visite** : base IndexedDB à part `jga-edl`
  (instantané par affaire, opérations, photos). **Tout geste passe par la
  file**, même en ligne (`fileEdlLogique.js`, testé) : écran = instantané +
  file ; après chaque envoi réussi, l'opération est reportée dans
  l'instantané avant d'être retirée (`synchroEdl.js`, verrou
  `jga-envoi-edl`). Instantané écrit sous le même verrou, en lectures
  `synchro_id:id` (hors cache du service worker), paginées par identifiant,
  **8 s au plus par requête** (`bornerDelai` ; délai dépassé = pas de
  réseau, sans message). La visite s'ouvre d'abord sur la copie de
  l'appareil, relue d'un seul tenant (`instantaneEtOperations`, sans le
  verrou), puis la lecture réseau suit ; deux `recharger` simultanés n'en
  font qu'un. Un point ou une entrée dont la pièce a été supprimée au
  bureau est renvoyé sans pièce (23503, `insererSansPieceDisparue`).
  Envoi aussi par `useMoteurSynchro` (`envoyerToutEdl`). Le témoin du
  bandeau du haut reste celui des CR ; le module et la visite comptent
  leurs gestes à envoyer. La visite exige IndexedDB.
- **Photos des points** : compressées comme les CR, `edl/<affaire>/edl/photos/`,
  envoyées en `upsert`. Un point supprimé emporte ses lignes de photos
  mais **pas leurs fichiers** (« Annuler » le rend intact) :
  `fichiers_orphelins()` (079) les rattrape.
- **« Remplacer les plans » toujours proposé, même après une visite**
  (demande de l'agence, 2026-11-18 ; la 079 l'interdisait, la **migration
  080** retire `edl_etats_garde_visites`) : la fenêtre de confirmation dit
  en rouge ce qui sera perdu (`perteRemplacement` : visites, points,
  photos, gestes pas encore envoyés). Tout part par cascade depuis
  `edl_etats` ; `supprimerEtat` lit d'abord les chemins des photos pour
  retirer leurs fichiers, puis l'appareil oublie l'affaire
  (`oublierEdlLocal`, sous le verrou de l'envoi : instantané, file et
  photos locales). Sans la 080, la base refuse (P0001) et l'écran dit de
  passer la migration.
- **Analyse (lot 3)** (`analyse/`, migration 082, plan
  `docs/superpowers/plans/2026-11-18-etat-des-lieux-lot3-analyser.md`) :
  - **Transcription horodatée** (`transcriptionEdl.js`, décisions pures dans
    `transcriptionEdlPasse.js`) : chaque morceau de `jga-audio` marqué
    `edlVisiteId` part à `api/transcrire.js` avec `X-Horodatage: segment` —
    Mistral `timestamp_granularities=segment`, **sans `language`** (les deux
    sont incompatibles, documentation vérifiée le 2026-11-18) ; refus → texte
    seul en `language=fr`. Le chemin des CR (sans l'en-tête) est inchangé.
    Ligne `edl_enregistrements` (id du morceau, `debut` = début du morceau sur
    l'appareil, segments en secondes) ; un morceau est continu (une pause en
    ouvre un nouveau) : heure d'une phrase = `debut + debut_s`. Le son n'est
    effacé qu'après l'écriture réussie ; une visite pas encore en base fait
    attendre (23503 = « pas encore »). **Panne passagère ≠ refus** :
    Mistral 408 / 429 / 5xx (statut porté par `ErreurTranscription`) ou base
    en 5xx / délai (`ecriturePassagere`) arrêtent le passage sans rien
    compter ; seul un vrai 4xx compte (`refusCompte`), noté avec
    `dernierEchec`, et le morceau n'est pas renvoyé avant 10 min. Rien
    d'envoyable ni de purgeable : aucune lecture en ligne (`rienAEnvoyer`).
    Morceaux mis de côté (3 refus) : « Réessayer le son refusé » en
    relecture. « Remplacer les plans » efface aussi le son de l'affaire
    (`effacerAudioEtatDesLieux`, jamais celui des CR). **Purge des morceaux orphelins
    seulement sur preuve** : session valide, lecture de l'affaire qui rend au
    moins une ligne, plus de 10 min, jamais hors ligne (une lecture vide sans
    erreur — session expirée — effaçait du son).
  - **Frise** (`analyseEdlLogique.js`, pur, partagé avec `api/analyser-edl.js`)
    : passages dans la pièce (`intervallesPiece` : à heure égale la sortie
    passe avant l'entrée, la sortie d'une autre pièce ne ferme rien), gestes et
    phrases intercalés « [hh:mm:ss] », points `P<n>`, ligne « — visite du
    JJ/MM/AAAA — », éléments déjà validés à part, **fiche actuelle** envoyée
    (une réanalyse garde ce que l'agence a corrigé). Claude rend fiche +
    éléments (schéma imposé, types de `calquesEdl.js`), écrits en
    **propositions** (`a_valider`) ; les éléments validés ne sont jamais
    touchés.
  - **Quand analyser** (déduit des données, pas de file) : `aAnalyser` (fin
    d'un passage postérieure à `analyse_le`, `maintenant` obligatoire : un
    passage jamais fermé — bouton Retour — compte après 2 h) ; pas tant que du
    son de l'intervalle attend sur l'appareil, ni, sur un appareil qui n'a pas
    ce son, avant que les transcriptions couvrent l'intervalle (ou 2 h). Une
    analyse à la fois (Web Lock `jga-analyse-edl`, pièce relue sous le
    verrou), écriture « à blanc » avant de payer, `analyse_le = max(lecture,
    fin des passages)`, résultat écrit **en une transaction** par la fonction SQL
    `edl_ecrire_analyse` (082 : pièce verrouillée, conflit si `updated_at` a
    bougé, propositions et fiche ensemble ; repli prise → éléments → pièce
    sans elle ; une correction de l'agence pendant l'appel est gardée). Une
    pause ou une coupure d'iOS reprise dans la pièce ne fait pas de trou dans
    la couverture (`arrets` des passages). **Relances payantes
    plafonnées** : 10 min puis 1 h, 3 essais automatiques au plus, `refus`,
    réponse tronquée et frise trop longue définitifs (un motif définitif de
    la base passe avant le suivi de l'appareil) ; ensuite seulement « Réessayer » /
    « Relancer l'analyse » ou une nouvelle visite. Déclencheurs : sortie de
    pièce, ouverture du module ou de la visite en ligne, moteur de synchro
    après une sortie / fin ou une transcription. Limite connue : un appareil
    qui réserve la pièce pendant l'appel de l'autre appareil paie aussi le
    sien (un seul résultat s'écrit).
  - **Écran** : pièces grises (non visitées), sablier (en attente), vertes
    (fiche complète), ambre (rubrique manquante, `completudeFiche`), rouge
    pâle (échec) ; pense-bête coché d'après la fiche. **Deux onglets**
    (demande de l'agence, 2026-11-20 : « un seul visionnage de plans ») :
    **« Plans »** (`PlansEdl.jsx`, anciennement « Fond de plans ») est le
    seul plan — l'éditeur des pièces (`EditeurPieces` : contour, nom,
    numéro, dessin, suppression, ⌘Z) et, dès qu'une visite a laissé quelque
    chose (`releve`), les relevés dessinés comme à la relecture : symbole
    sur disque, pastille d'un point sans type, liaisons, cotes, propositions
    en bleu (`visite/DessinsPlanEdl.jsx`, le même dessin que la visite).
    Un appui (`resoudreToucher`, `plansEdlLogique.js`, testé dans
    `etat-des-lieux-plans.test.js`) : un point (même d'une autre pièce,
    pâlie — sa pièce est choisie avec lui), sinon une liaison ou une cote,
    sinon la plus petite pièce ; les poignées du contour choisi passent
    avant tout (elles captent le doigt). L'éditeur ne lit rien de
    l'analyse : `PlansEdl` lui passe `choisie` / `onChoisir`, `cadre`,
    `superposition` (dessin, appui, panneau du point, poignées masquées
    pendant « Relier ») et `panneauPiece`. Panneau de la pièce choisie :
    nom et numéro, puis « État des lieux de la pièce » (`RevuePiece`,
    état dans `useRevuePiece.js`, tenu par `PlansEdl` pour la pièce
    choisie, vide sans pièce) — fiche modifiable (bleue tant que
    `fiche_a_valider`, modifier vaut validation ; un brouillon modifié
    survit à une nouvelle analyse, `suiteFicheRecue`), éléments par calque
    en bleu avec l'extrait entendu : Valider / Modifier / Écarter
    (confirmation), « Ajouter un élément », points sans élément, liaisons
    et cotes, « Relancer l'analyse » (confirmée : elle se paie) ; une pièce
    sans rien à relire (`pieceSansRevue`) n'y montre que « Pas encore
    visitée » (et « Ajouter un élément »). **« Ajouter un élément » fait
    toucher le plan** (demande de l'agence, 2026-11-20 ; `placement` de
    `useRevuePiece`, logique `toucherPlacement` / `nouveauPointBureau` de
    `plansEdlLogique.js`, testée) : bandeau « Touchez la pièce à l'endroit
    de l'élément » + Annuler, poignées masquées ; le toucher suivant dans la
    pièce choisie (ou sur son mur, à portée du doigt) écrit un point
    `edl_points` — rattaché à la **dernière visite** (`visite_id`
    obligatoire), numéro le plus grand de l'affaire + 1, aucun journal —
    puis le formulaire s'ouvre sur ce point ; l'élément est validé
    (`origine 'main'`) et le point prend son type (`typerPoint`). Annuler,
    ou changer de pièce, retire le point ; hors de la pièce : motif, rien
    créé. Sans visite lue : l'ancien formulaire sans point. Le nom en cours de saisie porte sa pièce et s'enregistre
    quand la pièce choisie change par le plan ou qu'on quitte l'onglet.
    **« État des lieux »** (`analyse/RelectureEdl.jsx`, mis en valeur,
    seulement quand il y a des relevés) n'est plus que la **liste des
    pièces** de l'étage, à valider d'abord ; en toucher une ouvre « Plans »
    sur elle, choisie et **cadrée** (`cadre` de `VisionneusePlan`). Plan
    cadré : le cadre suit la pièce touchée et reste hors des pièces ;
    « Voir tout l'étage » le retire, « Pièce suivante » suit l'ordre de la
    liste. Adresse : `?vue=liste`, ou `?vue=plans&piece=<choisie>&cadre=<cadrée>`
    (`lireVueEdl` / `ecrireVueEdl`) ; un ancien lien
    `?vue=relecture&piece=` ouvre la pièce cadrée, `?vue=relecture` la
    liste.
  - **Statuts et bloc porte** (2026-11-19, **aucune migration** : dans le
    jsonb `edl_pieces.fiche`) : `porte: { huisserie, vantail, quincaillerie }`
    et `statuts: { sol, murs, plafond, plinthes, porte }`, codes de
    `statutsEdl.js` (pur, lu aussi par le serveur : Conserver / Rafraîchir /
    Déposer, ou `null` = « À préciser », jamais enregistré). Une ancienne
    fiche se lit telle quelle (`statutDe` → à préciser, `porteDe` vide).
    Claude propose les statuts d'après ce qui est dit (« à repeindre » →
    rafraîchir, « à remplacer » / « hors service » → déposer, rien sur
    l'état → null ; « porte bois » = huisserie et vantail bois) et garde
    ceux de la fiche actuelle sauf contradiction claire ; schéma fermé,
    statuts en `anyOf` avec `null`. Relecture : un menu de statut à côté de
    chaque rubrique et un bloc « Bloc porte » (`FicheRelecture.jsx`) —
    modifier un statut vaut validation, comme le reste. Le DXF écrit
    « Sol : Carrelage (Conserver) » et la ligne « Porte : … ».
- **Liaisons et cotes** (2026-11-20, migration 084, plan
  `docs/superpowers/plans/2026-11-20-etat-des-lieux-liaisons-cotes.md` ;
  `tracesEdl.js` et `visite/tracesVisiteLogique.js`, purs, testés dans
  `etat-des-lieux-traces.test.js`) : table `edl_traces` — `sorte =
  'commande'` (interrupteur `point_a` → luminaire `point_b`, types de
  `TYPES_INTERRUPTEUR` / `TYPES_LUMINAIRE`, `liaisonPossible`) ou `'cote'`
  (deux angles `xa, ya, xb, yb` en mètres du plan, `valeur` texte
  « 3,45 m », nulle tant que personne ne l'a donnée), `origine` main / ia,
  `a_valider`, `extrait`. Id décidé sur l'appareil, gestes par la file
  (`trace.creer|modifier|supprimer`, 23505 = succès), instantané `traces` ;
  un point supprimé emporte ses liaisons (cascade) et « Annuler » les remet
  (`gesteSuppressionPoint`). **Sans la 084** : lecture → `[]` et
  `tracesDisponibles` faux, « Relier » / « Coter » masqués, ni dessin ni
  rubrique de l'aide-mémoire, journal sans les nouveaux types, analyse et
  exports comme avant (`p_traces` jamais envoyé). **Gestes** : « Relier »
  (panneau d'un interrupteur ou d'un luminaire) puis toucher le point
  compatible — un toucher ailleurs ne pose rien et dit pourquoi, jamais deux
  fois la même liaison ; « Coter » (barre de la pièce) : deux touchers
  accrochés aux angles du contour (44 px, aucun point posé), puis champ
  « Cote (m) » en haut (Valider / Plus tard ; `valeurCote` lit « 3,45 »,
  « 345 cm », « 3 m 45 ») ; toucher une trace l'ouvre (Modifier la valeur,
  Supprimer), ⌘Z défait chaque geste ; une valeur tapée repasse
  `a_valider` à faux (`champsModificationTrace`). **Un seul dessin** écran /
  DXF / planche : `courbeCommande` (Bézier, flèche 20 %, à gauche du sens
  interrupteur → luminaire, calculée en mètres y vers le haut puis portée)
  et `traitsCote` : ligne de cote **décalée dans la pièce**
  (`sensInterieurCote` vote d'après le contour, à défaut à gauche ; 18 px à
  l'écran, 0,60 m au DXF, 6 mm sur la planche — un trait posé sur le mur s'y
  confondait), lignes d'attache depuis chaque angle, obliques à 45°, valeur
  du côté de la pièce, jamais à l'envers (verticale lue de bas en haut) ;
  trait d'encre `#3A3632` (`COULEUR_TRAIT_COTE`), le bleu canard
  `COULEUR_COTE` reste à l'interface. La valeur évite les symboles
  (`placerValeurCote` : glissée le long de la ligne par pas de 5 mm sur la
  planche, 0,50 m au DXF, centrée si rien n'est libre) ; une cote se touche
  aussi sur sa ligne décalée (`traceProche`, `ecartCote`). **Journal** : `point-touche` (tout point existant touché),
  `angle-touche` (`detail.traceId` = la future cote, décidé à l'ouverture
  du mode), `trace`, `trace-supprimee`. **Analyse** : la frise montre ces
  touchers à leur heure (« point P3 (Interrupteur) touché », « angle touché
  (cote C2) »), cotes de la pièce en `C<n>` ; Claude propose `liaisons`
  (deux points de la pièce, ni existante ni en double) et la `valeur` des
  cotes sans valeur (lue par `valeurCote`, sinon écartée) —
  `SCHEMA_ANALYSE_TRACES`, et sans traces lues consignes et schéma d'avant.
  Écrit par `edl_ecrire_analyse(…, p_traces)` (084, même transaction que la
  fiche) : `p_traces` **absent** quand les traces n'ont pas été lues ;
  présent, il remplace liaisons et valeurs proposées non relues de la pièce,
  jamais une valeur tapée ou validée. **Relecture** : section « Liaisons et
  cotes » (`TracesRelecture.jsx`), propositions en bleu avec l'extrait,
  Valider / Modifier (cote) / Écarter (liaison supprimée, valeur retirée),
  comptées dans « à valider ». **Type effectif** (`typeEffectif`,
  `avecTypeEffectif`) : un point posé sans type prend celui d'un élément
  relevé sur lui (validé avant proposition) — « Relier » de la visite,
  frise (« Points sans type : … ») et lecture de la réponse, où les
  éléments de la même réponse comptent aussi. En relecture, « Ajouter une
  liaison » (interrupteurs de l'étage, luminaires de la pièce,
  `choixLiaisonRelecture`, `ajouterLiaison` : main, relue, lignes
  comptées). **Écarter le dernier élément d'un point supprime le point**
  (demande de l'agence, `suiteEcartElement`, `supprimerPoint`) : photos et
  liaisons par cascade, fichiers des photos retirés (lus avant, échec non
  bloquant), la confirmation le dit (« Le point P3 disparaîtra du plan,
  avec ses 2 photos et sa liaison. ») ; « Points sans élément » de la
  pièce avec « Supprimer le point ». La copie de la visite est relue
  (instantané remplacé) ; un geste en attente sur un point disparu
  (modification, photo, liaison 23503 — `pointDisparu`) est tenu pour fait.
  **Symboles sur le plan** (demande de l'agence,
  `symbolesRelectureLogique.js`, dessinés par `PointPlan` de
  `DessinsPlanEdl.jsx` dans l'onglet « Plans » — la visite garde ses
  pastilles) : un point typé montre le symbole des
  planches de son type effectif (un seul par point), même angle
  (`orientationElement`) et couleur de famille, sur un disque de sa
  famille (1,5 fois le symbole), anneau pointillé bleu s'il n'a que des
  propositions, numéro en petit ; sans type, la pastille (0,35 m).
  **À l'échelle du plan** (demande de l'agence, 2026-11-20 : lisible au
  dézoom), visite comprise : symboles, disques, pastilles et valeurs de
  cotes (0,22 m) sont en mètres du plan, convertis en pixels d'écran par
  `pxParMetreEcran` (`taillesPointEcran`, `texteCoteEcran`, testés) ;
  traits, écart de la ligne de cote et zones du doigt (22 px) restent
  constants à l'écran ; sans échelle fiable (`cadrage.pxParMetre`), les
  anciennes tailles d'écran (28 / 40 / 22 px). Un appareil à taille réelle
  garde le disque d'un symbole de 3,8 mm. Toucher
  un point ouvre un panneau en haut du plan (« P3 · … », fermé par ✕) ;
  « Relier » (interrupteur / luminaire, 084) puis toucher un point
  compatible de l'étage : mêmes règles que la visite
  (`debutRelier` / `toucherRelier`), même écriture qu'« Ajouter une
  liaison » ; la liaison prend la pièce du luminaire, à défaut celle de
  l'interrupteur (`pieceDeLiaison`).
  **Exports** : `tracesAExporter`, seule
  lecture (liaison proposée écartée sauf « Inclure les propositions »,
  liaison dont un point manque ou change d'étage omise, cote dont seule la
  valeur est proposée partie avec « ? » — la fenêtre le signale) ; DXF :
  `ARC` sur `EDL-Électricité` (`arcCommande` : cercle par les deux points et
  le sommet de la courbe), cote = deux attaches + `LINE` + deux obliques +
  `TEXT` centré sur `EDL-Cotes` (sa valeur est un obstacle pour cadres et
  libellés, `obstacles` de `placerEtiquettes`), propositions sur `EDL-À
  valider`, unité du plan d'origine ; planche : en mm dans `misePlanche` (emprise, obstacles de la
  légende), dessinées **sous les symboles** (courbe 0,25 mm couleur
  électricité, cote 0,18 mm et attaches 0,13 mm, valeur 2,2 mm sur liseré
  blanc) et toujours,
  donc dans le **fond verrouillé** du Word (non déplaçables) ; légende
  « Commande d'éclairage », « Cote », « Liaison ou cote proposée »
  seulement si présentes.
- **Export (lot 4)** (`export/`, plan
  `docs/superpowers/plans/2026-11-18-etat-des-lieux-lot4-exporter.md`, aucune
  migration, aucun appel payant) : bouton « Exporter » du module → **fenêtre
  d'export** comme celle des plannings (réglages à gauche, aperçu refait
  450 ms après le dernier réglage, « Agrandir ») : onglet « Rapport PDF »
  (vraies pages, pdf.js) et un onglet « DXF — <étage> » par étage (le DXF
  **produit**, relu par `lireDxf` et dessiné, une case par calque). Le ZIP
  reprend les mêmes fichiers : ce qui se voit est ce qui part.
  - **DXF R12** (`exportDxfEdl.js`, pur, relu par `lireDxf` dans les
    tests ; `encodageDxf.js` Windows-1252) : coordonnées et `$INSUNITS` dans
    **l'unité du plan d'origine** (`unites_par_metre`). **Le DXF d'origine
    n'est jamais modifié** (150 Mo, R14 à 2018 : insérer en tenant
    `$HANDSEED` serait fragile) : par étage `…-EDL.dxf` (seuls les calques
    `EDL-`, à **fusionner** dans ArchiCAD) et `…-EDL-avec-plan.dxf` (+ plan
    allégé du fichier vectoriel ; ses textes perdent rotation et alignement).
    Un bloc `EDL_<CODE>` par type, inséré tourné par
    `orientationElement` (voir Symboles), variante `…_R` du bloc quand ses
    textes tomberaient la tête en bas ; libellés « P7 · … » empilés quand plusieurs
    éléments partagent un point ; cotes sur `EDL-Cotes` ; nom, surface, HSP
    (`EDL-Pièces`), finitions (`EDL-Finitions`) ; « Ph n » (`EDL-Photos`) ;
    `%%` échappé. **Aucun texte sur un autre** (demande de l'agence,
    `placementEtiquettes.js`, pur, testé) : nom, surface, HSP et finitions
    (32 caractères par ligne) dans un **cadre** fermé sur `EDL-Pièces`,
    tourné comme la pièce, posé entier dans la pièce sans couvrir de symbole
    au plus près de `pointInterieur`, réduit jusqu'à 0,6 × sinon ; chaque
    libellé d'élément ou de photo prend la première de 8 places autour de
    son symbole (3 anneaux, trait de rappel au-delà du premier) qui ne
    touche ni cadre ni libellé ni symbole — les textes du plan existant ne
    comptent pas. Le plan du PDF pose la désignation par la même règle
    (`placesDesignations`). **Par défaut, seuls les éléments validés** (et les fiches
    validées) ; option « Inclure les propositions » → calque `EDL-À valider`.
    Noms de calques accentués : relus par LibreDWG, **à confirmer au premier
    essai de fusion dans ArchiCAD** (sinon les translittérer en un seul
    endroit, `nomCalqueValide`).
  - **Symboles usuels** (`symbolesEdl.js`, seul catalogue : DXF, PDF, Word,
    écran ; validés par l'agence le 2026-11-18, « à faire évoluer », repris
    le 2026-11-19 d'après sa légende « report relevé ») : appareils de
    plomberie et chauffage à leur taille réelle, ainsi que réglette,
    goulotte et baie de brassage, dont la longueur compte ; autres symboles
    à taille fixe (~0,30 m dans le catalogue, tel quel dans le DXF) ;
    **taille imprimée d'un symbole fixe** : `TAILLES_SYMBOLE_MM` (seul
    tableau, mesuré sur la planche d'exemple de l'agence au 1/100 :
    interrupteur et RJ45 3,2 mm, prise 3,1 mm sans son « ×n », détecteur
    de fumée 3,8, applique 4,1, dalle 4,5, tous les autres 3,8 —
    `tailleSymboleMm`), lu par les planches et le Word (via `misePlanche`)
    et par l'écran (`tailleSymboleMetres` : mm / 10 en mètres du plan) ;
    primitives R12 seulement (ligne, polyligne,
    cercle, arc, texte centré). Changer un symbole = modifier son entrée.
    Types ajoutés le 2026-11-19 (`calquesEdl.js`, seule liste : consignes de
    Claude et barre de la visite suivent) : `rj45`, `applique`, `dalle`,
    `reglette`, `goulotte`, `baie-brassage` ; le détecteur de fumée devient
    un rond noir à point central. **Convention : le dos d'un symbole (côté
    mur) est en −y local** ; `orientationElement` tourne un type de
    `TYPES_MURAUX` à moins de 0,8 m d'un côté de sa pièce contre ce côté
    (+y vers l'intérieur), sinon comme la pièce (`orientationPiece`) — DXF,
    planches et Word passent par elle. `quantiteElement` lit le nombre de
    prises / RJ45 dans le libellé (« ×3 », « 3 prises », « trois », « double »
    → 2…), 1 sinon : « ×n » de la planche, nombres des tableaux. Un symbole
    par type et par point (quantités additionnées, `emplacementsDuPoint`).
    Couleurs par famille (`COULEURS_CALQUES`, calées sur l'exemple :
    électricité bleue, sécurité noire, désordres violets…), distinctes du
    bleu des propositions. Planche dans la fenêtre d'export
    (`PlancheSymboles.jsx`).
  - **Rapport** (refait le 2026-11-19 sur l'exemple de l'agence, planches
    « report relevé » et synthèse par pièce gardés hors dépôt ; plan
    `docs/superpowers/plans/2026-11-19-etat-des-lieux-planches.md`) : garde
    A4 (chiffres clés et points d'attention) → **une planche A3 paysage par
    étage** → **tableaux par niveau** en A3 → **annexe photos** en A4. Plus
    de fiche d'une page par pièce, plus d'extrait de plan par pièce : les
    planches et les tableaux les remplacent (choix de l'agence).
    - **Planche** (`plancheEdl.js`, pur) : `misePlanche` décide tout —
      échelle (1/100, 1/200, 1/250… la première qui fait tenir pièces,
      relevés hors pièces et 1,5 m de marge), repère mètres → mm papier
      (`versMmPlanche`, y vers le bas), symboles **seuls** (ni « P7 » ni
      texte : le plan d'origine porte noms, surfaces et HSP) à leur taille de
      `TAILLES_SYMBOLE_MM` sur le papier quelle que soit l'échelle (les symboles à taille réelle restent
      à l'échelle), « ×n » pour les prises, proposition entourée d'un cercle
      pointillé bleu ; légende encadrée des seuls types présents (entrée
      « à valider » s'il y a lieu), posée dans le coin qui couvre le moins
      le dessin ; cartouche de l'agence (affaire, échelle, format, phase EDL,
      date, **indice**, **N°**, « EXISTANT - Plan <étage> »). Le dessin
      (`dessinPlancheEdl.js`, contexte 2D injecté, sans DOM, testé avec un
      contexte enregistreur) et le Word lisent **la même mise** : ce qui est
      dans le PDF est ce qui est dans le Word. Canevas à 200 dpi (≈ 7,7 Mpx,
      réduit au-delà de 16 Mpx pour l'iPad).
    - **Tableaux** (`tableauxEdlLogique.js`, pur) : une ligne par pièce
      visitée, colonnes Pièce · Sol · Mur · Plafond · Bloc porte ·
      Équipements · Points particuliers ; chaque matériau porte son statut
      en étiquette (Conserver vert cerné, Rafraîchir cerne pointillé ambre,
      Déposer blanc sur rouille, À préciser cerne tireté gris) ; équipements
      regroupés par type et libellé avec leur nombre (`quantiteElement`),
      cotes et « Ph n » ; points particuliers = désordres, remarques, puis
      points sans élément — aucune photo ni aucun point ne disparaît. Ligne
      « Hors pièces » en fin de niveau, pièces non visitées nommées dessous.
      Une pièce trop chargée continue sur une rangée « (suite) »
      (`rangeesDeLigne`, 45 lignes) : pdfmake coupait sans le dire une
      rangée plus haute que la page. **Chiffres clés et points d'attention
      calculés par l'app** (`syntheseRapport`, aucun appel payant).
    - **Assemblage par pdf-lib** (`assemblageRapportEdl.js`, testé dans
      Node) : **pdfmake ne sait pas changer de format en cours de
      document**, donc garde, tableaux et photos sont trois documents
      pdfmake, les planches des pages JPEG pleine page, et pdf-lib met le
      tout bout à bout ; il écrit aussi le pied « Affaire · État des lieux ·
      page n / N » (Helvetica, d'où `texteLatin`) sur toutes les pages sauf
      les planches, qui ont leur cartouche (N compte les planches). L'aperçu
      pdf.js réduit chaque page à la même largeur, A3 et A4 mêlées.
    **Mêmes règles que le DXF** : fiche proposée écartée, statuts, porte et
    HSP (lue sur le plan, sinon dite) par `ficheExportEdl.js` ; pièce d'un
    point posée une fois par `preparerExport` (`pieceDuPoint`, étage du
    point) ; photos numérotées par `numeroterPhotos`. ZIP asynchrone (`zip`
    de fflate, workers) ; un plan existant illisible ne retire que son
    `…-avec-plan.dxf` (avertissement) ; une planche ratée manque seule
    (avertissement), le rapport continue.
  - **Rapport Word** (demande de l'agence, 2026-11-19 : le reprendre à la
    main ; `rapportWordEdl.js`, docx **épinglé 9.15.2**, chargé à la demande,
    testé dans `etat-des-lieux-export-word.test.js`) : **même contenu que le
    PDF** — tout vient de `tableauxDuRapport`, `syntheseRapport` et
    `misePlanche` (plus de `suiteRapportEdl` ni de fiche par pièce) ; ne
    jamais décider un contenu dans l'un seulement. Garde en vrai texte ;
    par étage une section A3 paysage sans marges ni pied : la planche sans
    symboles ni légende en **fond verrouillé** derrière le texte
    (`behindDoc`, `locked`), la légende en image flottante, puis **chaque
    symbole en image flottante déplaçable**, nommée d'après son type, posée
    pour que son point d'insertion tombe à sa place (`imagesPlancheWord`,
    pur ; EMU = mm × 36 000) — l'agence déplace un symbole mal placé sans
    retoucher le plan. Images de symbole partagées par clé (type, angle
    arrondi à 5°, quantité, proposition). Puis les tableaux en vrais
    tableaux Word (en-tête répété, statuts en texte coloré), l'annexe
    photos. Mêmes images : le rapport rend `fabriquerWord()`, qui reprend
    les Blobs dessinés pour le PDF (rien redessiné ni retéléchargé). Case
    « Rapport Word » de la fenêtre (cochée par défaut ; `rapportVoulu` : le
    rapport se fabrique pour le PDF ou le Word) ; l'aperçu reste celui du
    PDF ; le .docx est rangé dans le ZIP sans recompression.
  - **Numéros et indice des planches** (section « Planches » de la
    fenêtre) : un « Indice » (vide : la date du jour au cartouche) et un
    « N° » par étage coché (« EDL-1 », « EDL-2 »… dans l'ordre des étages,
    donnés à chaque étage pour qu'en décocher un ne renumérote pas les
    autres). Dans `cleRapport` (étages retenus seulement, textes lus comme
    le générateur) : aperçu et ZIP suivent, 450 ms après la dernière touche.
    Retenus par affaire sur l'appareil (`jga.edl-export.<affaire>`, lecture
    et écriture sous try/catch, défauts sinon).

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
(sur `accesGestion` ; attend tant qu'il vaut `null` : profil pas encore lu). Outils
déclarés dans `src/gestion/manifest.js` (une entrée = une tuile du tableau
de bord, une entrée de la colonne et une adresse) : calendrier des rendus,
suivi des tâches, associés. **Présenté comme une affaire**, à la demande de
l'agence (`GestionPage.jsx`) : colonne latérale avec « Tableau de bord » mis
en évidence puis les outils, tableau de bord à tuiles résumées
(`TableauBordGestion.jsx` ; un outil sans résumé montre sa description),
titre d'outil comme `TitreModule`. Violet `#7A4E9C`, passé aux composants
de la to-do list par `--affaire-accent`. Bouton violet « Aller à la
gestion d'agence » dans `Topbar`, à côté de la cloche, pour les seuls
associés, sur toutes les pages sauf Gestion d'agence elle-même.

- **Associé** (migration 067) : `profiles.est_associe`, `est_associe()`,
  verrou par déclencheur ; on désigne par `designer_associe(compte,
  valeur)` (un compte ne modifie que sa propre fiche), jamais soi-même
  retiré. Premiers associés : `update profiles set est_associe = true where
  email in (…)` dans l'éditeur SQL — **aucun nom dans le dépôt**.
  `AuthProvider` lit le profil en `select('*')` et garde le statut sur
  l'appareil.
- **Administrateur** (migration 068, `profiles.est_admin`, `est_admin()`,
  `acces_gestion()` = associé ou administrateur) : les accès d'un associé
  (bulle, bouton du bandeau, outils, désigner les associés) **sans en avoir
  le titre** — jamais listé ni compté comme associé, ses initiales restent
  celles d'un collaborateur dans le calendrier. Ne se coche que dans
  l'éditeur SQL (déclencheur `profiles_verrou_admin`). Côté écran : `estAdmin`
  et `accesGestion` (null tant que le profil n'est pas lu) ; l'accès passe
  toujours par `accesGestion`, jamais par `estAssocie` seul. Sur la page
  Associés, personne ne touche à sa propre ligne.
  **L'administrateur écrit partout** (migration 069) : `peut_modifier_affaire`
  et les règles de modification / suppression d'`affaires` l'admettent ;
  `canEdit` vaut toujours vrai pour lui. Le portail lui est présenté comme
  à un collaborateur (ses affaires d'abord, les autres en gris), sans la
  mention « LECTURE SEULE » ni le cadenas (`modifiable` d'`AffaireCard`).
- **Rien n'est recopié** : calendrier et suivi lisent les plannings et
  `todo_elements` de toute l'agence (droits de lecture inchangés).
  Logique pure dans `gestionLogique.js` (testé) : jalon d'étude au
  **vendredi** de sa semaine ISO (`vendrediSemaineIso`, dates en UTC),
  `grilleMois`, `prochaines` (30 jours), `affairesModifiables` (= règle de
  `peut_modifier_affaire`), `groupesTaches`. Le calendrier porte l'**équipe**
  de chaque affaire en **ronds d'initiales**, comme la page d'une affaire
  (`equipeParAffaire` : propriétaire en couleur puis collaborateurs en gris,
  **sans les associés** ni les extérieurs ; initiales = prénom + nom), noms
  complets au survol.
- **Jalons posés depuis le calendrier** (migration 070, `ModaleJalon.jsx`) :
  « + Échéance » ou clic sur un jour vide pour créer (affaire, planning d'étude
  ou chantier proposé d'après la phase, libellé, date, couleur), clic sur un
  jalon pour le modifier ou le supprimer (lien « Ouvrir le planning »). Ils
  s'écrivent dans `planning_jalons` (au jour) ou `planning_etude_jalons` (à
  la semaine ISO de la date, `semaineIso`) : les deux sens passent par les
  mêmes lignes. La 070 ouvre **les seuls jalons** aux associés et à
  l'administrateur (`acces_gestion()` dans les règles restrictives de ces
  deux tables), le reste du planning restant aux collaborateurs. Un jalon
  créé ainsi porte `fixe_direction` : petite mallette dans son étiquette et
  « fixée par la direction » au survol, dans les deux plannings ; il reste
  modifiable par l'équipe. Un jalon accroché garde sa date (elle suit la
  barre). Suppression comptée en lignes (un refus RLS ne rend pas d'erreur).
  L'affaire se choisit par `ChoixAffaire` (recherche), comme dans le suivi
  des tâches.
- **PDF d'un mois** (`exportCalendrier.js`, gabarit pur `htmlCalendrierMois`,
  testé) : page HTML imprimée par le navigateur, comme les plannings, en **A4
  ou A3 paysage** (menu du bouton). La grille tient **toujours sur une seule
  page** (demande de l'agence) : page de la taille exacte de la feuille, et
  un script dans la fenêtre (`SCRIPT_AJUSTEMENT`) qui donne aux semaines leur
  hauteur naturelle, répartit la place restante entre les moins chargées, ou
  élargit puis réduit la grille à l'échelle (`transform: scale`) si le mois
  déborde — essai : 8 échéances le même jour, A3 sans réduction, A4 à 66 %.
  Il tourne dès la fin de la page : dans une fenêtre écrite par
  `document.write`, `load` n'arrive pas toujours. Le détail des rendus suit
  sur des pages à part (date, affaire, rendu, planning, équipe), filtres de
  l'écran rappelés ; tout texte passe par `echapperHtml`.
- Échéances partagées avec Notion : voir la section du même nom.

## Gestion de l'application (`src/admin/`)

5ᵉ bulle de l'accueil, **administrateur seul** (`estAdmin`, route
`/gestion-application` gardée par `AdminSeul`), gris ardoise `#4A5560`
(conception `docs/superpowers/specs/2026-10-22-gestion-application-design.md`).
Tableau de bord : stockage (jauges fichiers / base contre les limites de
l'offre gratuite, `LIMITES` de `gestionAppLogique.js` — **seul endroit à
changer** le jour d'une autre offre ; détail par sorte, affaires les plus
lourdes, « Nettoyer le stockage »), comptes (dernière connexion, comptes
**sans profil** en rouge), santé (version en ligne injectée au build par
`vite.config.js` : `VITE_COMMIT` d'après `VERCEL_GIT_COMMIT_SHA`,
`VITE_CONSTRUIT_LE` ; envois hors ligne en attente sur l'appareil ;
échéances Notion sans carte au-delà du bail), activité. Au-delà de 80 %
(`SEUIL_ALERTE`), la bulle d'accueil porte un avertissement orange
(`alerteAccueil`). Lectures réservées par la **migration 074**
(`admin_stockage`, `admin_base`, `admin_comptes`, `security definer`, refus
de tout autre appelant, aucune table) ; sans elle la page dit ce qui manque.
Calculs purs testés (`tests/gestion-application.test.js`).

**Crédits API Claude** (carte de la page, migration 083,
`consommationIaLogique.js`, testé) : Anthropic ne donne pas le solde des
crédits par API et son API d'administration est fermée aux organisations
individuelles. Chaque fonction `api/` qui appelle Claude note donc le `usage`
de sa réponse dans `ia_consommation` (`noterConsommation` d'`api/_agence.js`,
jeton de l'appelant, jamais bloquant ; écriture agence, lecture administrateur)
— **toute nouvelle fonction qui appelle Claude doit en faire autant**, et son
libellé va dans `LIBELLES_FONCTIONS`. Le flux de `analyser-visite` est relu au
passage (`usageDuFlux`, écriture à la fin du flux). Coût aux prix publics
(`PRIX`, essais d'un repli comptés par `usage.iterations`), période de crédits
du 7 au 6 (`CREDITS_API` : 100 $ du forfait Max, **seul endroit à changer**),
reste, projection, détail par usage, période précédente ; c'est une
estimation, la Console fait foi. Au-delà de 80 %, la bulle d'accueil prévient
(`alerteAccueil`, `credits`).
**API Mistral** (carte voisine, même table, aucune migration de plus) :
`api/transcrire.js` note chaque transcription réussie (`fonction` =
`transcrire`, `usage.prompt_audio_seconds`) ; `resumeMistral` compte le mois
civil (facture Mistral, pas de crédits inclus) à `PRIX_MISTRAL_MINUTE`
(0,0035 $, Voxtral Mini Transcribe 3 relevé le 2026-11-19), minutes, morceaux,
projection, mois précédent. `FONCTIONS_MISTRAL` sépare les deux fournisseurs :
une ligne Mistral ne compte jamais dans les crédits Claude. Mistral a une API
d'administration (`/v1/admin/usage`, clé d'administrateur) si un chiffre exact
devenait nécessaire.

## Échéances partagées avec Notion

Conception : `docs/superpowers/specs/2026-10-12-echeances-notion-design.md`.
Les échéances (jalons) des plannings et du calendrier des rendus sont les
mêmes que les cartes « ECHEANCES RENDUS » du Planning hebdomadaire de
Notion, dans les deux sens. Code dans `src/shared/notion/` ; passeur
serveur `api/notion.js` (+ `api/_agence.js`) ; migration 071.

- **La structure de Notion ne change jamais** (demande de l'agence). Une
  carte est du **texte libre** : titre « N° Affaire », propriétés Jour et
  Semaine ; la base des affaires donne la « Référence ». L'affaire se
  reconnaît **aux 4 chiffres seuls** (`codesAffaire.js`, `numeroAffaire`).
  Les dates se lisent dans le texte (`datesDuTexte`, `lireCarte` : l'année
  la plus proche de la création de la carte). Une date déplacée par l'app
  garde **son format d'origine** (`remplacerDate`) et ne reçoit une année sur
  2 chiffres que si, relue sans elle, elle tomberait une autre année ;
  `formatDateCarte` sert aux cartes nouvelles (`titreCarte`) et à la date
  ajoutée à une carte « à dater ».
- **Règles de rapprochement** (`planSynchro`, pur, dans
  `synchroNotionLogique.js`, testé sur cartes inventées) : une carte à
  **plusieurs dates est en lecture seule dans l'app** (Notion l'emporte) ;
  une carte supprimée dans Notion ne retire que les échéances **à venir** ;
  une **lecture partielle n'efface rien** ; **la modification la plus
  récente l'emporte** (`modifie_le`, migration 071) ; à l'étude le jour de
  semaine de la carte est gardé (`dateEtude`) ; **pas de doublon à la
  première liaison** ; une échéance de l'app déjà passée ne crée aucune
  carte. Une échéance née dans Notion est **grise** (`COULEUR_NOTION`),
  repérée par `MarqueNotion.jsx`. **Carte en cours de frappe** : modifiée
  moins de 3 minutes avant `maintenant` (`GRACE_MS`), elle ne décide rien de
  destructif — numéro effacé ou changé, date disparue, carte devenue « à
  dater » : ses lignes restent telles quelles pour ce passage (sinon
  l'échéance repartirait grise, sans couleur, accroche ni mallette). Une
  ligne en attente **sous bail** (`BAIL_MS`, d'après son `updated_at`) n'est
  ni reliée, ni retirée, et la date libre qui lui correspond n'est pas prise :
  l'appareil qui crée la carte s'en charge.
- **Registre `notion_echeances`** (migration 071) : `date_synchro` = la
  date sur laquelle les deux côtés se sont accordés ; `libelle` (côté
  Notion) et `libelle_app` (côté app) distincts. Chaque opération porte
  l'id de sa ligne de registre : **le registre n'est écrit qu'après
  réussite de l'opération liée** (`appliquerPlan`, `appliquerSynchro.js`,
  testé avec une base et un Notion simulés), sinon la passe
  suivante défairait le geste de l'utilisateur. Les lignes en attente
  (`page_id` nul) sont réservées par un **bail de 2 minutes**, pris juste
  avant chaque **lot de 10 cartes** ; l'adresse (`page_id`) des cartes
  créées est notée **après chaque lot**, pas à la fin (un premier passage de
  centaines de cartes dépasserait le bail). Écriture conditionnelle
  (`page_id` encore nul) ; si elle ne touche rien, la ligne est relue et la
  carte ne part à la corbeille que si la ligne a disparu ou désigne **une
  autre** carte — un autre appareil a pu la relier à la nôtre.
- **Lectures fraîches** : les lectures de la synchro prennent l'alias
  `synchro_id:id` dans leur `select`, **exclu du cache `supabase-api` du
  service worker** (`vite.config.js`) : un repli NetworkFirst nourrirait
  des décisions destructrices avec des données périmées. Pagination par
  1 000 **par identifiant** (`gt('id', dernier)`, pas de rang : une ligne
  supprimée entre deux pages en ferait sauter une).
- **Passeur `api/notion.js`** : vérifie le compte agence (`_agence.js`),
  ne relaie que des opérations validées (`operationValide`,
  `notionApiLogique.js`), API Notion `2025-09-03`, `maxDuration: 60`
  (`vercel.json`). Lecture d'un planning (`numero`) : cartes et base des
  affaires filtrées sur le numéro (`filtreEcheances`, `filtreAtelier`), et
  les cartes déjà liées que le filtre n'a pas rendues sont relues une à une
  (`pages`, `pagesAVerifier`, 25 au plus, sinon lecture incomplète) : un
  numéro effacé ne fait pas croire à une carte supprimée. Variables Vercel `NOTION_TOKEN`,
  `NOTION_PLANNING_SOURCE`, `NOTION_ATELIER_SOURCE` — **jamais `VITE_`**.
- **Déclenchement** : le calendrier appelle `synchroniser` lui-même, à
  l'ouverture, par « Actualiser depuis Notion » et après la fenêtre
  d'échéance (`CalendrierRendus.jsx`, `ModaleJalon.jsx`) ; rien n'y
  s'affiche tant que la première lecture n'a pas dit si Notion est en
  service, puis « Notion lu à HH:MM » et, s'il y en a, « N écritures Notion
  en échec ». Les plannings passent par `useEcheancesNotion` : à
  l'ouverture et **3 s après tout changement de leurs échéances**
  (signature comparée). Jamais pour un compte en lecture seule ;
  silencieux hors ligne ou sans la migration (état `indisponible`).
- **Équipe des cartes** (`equipeNotionLogique.js`, testé) : une carte créée
  par l'app reçoit dans « 👤 Equipe JGA » l'équipe de l'affaire (responsable
  et collaborateurs) — sans quoi elle manquait aux vues par personne du
  Planning. **Jamais les associés** (ni `est_associe` dans l'app, ni rôle
  « Associé » dans Notion), ni extérieurs, ni fiches inactives. Rapprochement
  par le **prénom** (`clePrenom` : sans majuscules, accents, tirets ni
  espaces ; un seul candidat, sinon rien). La base « Equipe JGA » se retrouve
  par la colonne équipe du Planning (`sourceEquipe`) : aucune variable de
  plus. Une carte de l'app (`estCarteApp`, format de `titreCarte`) dont la
  colonne est vide est complétée au passage suivant (action `equipe` du
  passeur) ; une carte écrite à la main, ou déjà remplie, n'est jamais
  touchée. **Dans l'autre sens**, les affaires présentes seulement dans
  Notion ont dans le calendrier les ronds des personnes de leurs cartes
  (`equipesAffairesNotion`, `gestionLogique.js` : sans associés, initiales de
  l'app si le prénom y retrouve un compte) ; `synchroniser` rend pour cela
  `cartes` et `membres`.
- **Limites connues** : ⌘Z juste après une synchro peut défaire un
  changement de Notion qu'elle venait de rapporter. L'ancienne synchro des
  phases (`useNotionSync`, `useNotionGantt`, `notion-sync-server.mjs`,
  `VITE_GANTT_SERVER`) ne fonctionne pas sur le site ; laissée en l'état.

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
- **La fiche de l'affaire** (`affaires` : photo, phase, montants, dates)
  reste au **responsable** — ou à tous si l'affaire n'en a pas, et à
  l'administrateur (règle de la 050, élargie par la 069) ; un collaborateur
  modifie tout le reste. Une écriture refusée par une règle RLS ne rend pas
  d'erreur : la photo d'un collaborateur partait au stockage sans que son
  lien s'enregistre. D'où `peutModifierFiche` (`useAffaireCollaborateurs`) :
  « Modifier » de l'en-tête et de la carte d'informations, choix de la
  phase, enveloppe du suivi financier d'étude, paramètres du suivi
  financier chantier, dates de l'affaire suivant un décalage du planning
  (prop `peutModifierFiche` des modules) ; corbeille du portail
  (`peutSupprimer` : responsable ou administrateur). Sans droit sur la
  fiche, « Gérer les interlocuteurs » ouvre `ModaleContacts` (les seuls
  interlocuteurs, table à part, modifiables par les collaborateurs).
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

- **Feuilles faites par la page** (`miseEnPageExport.js`) : le navigateur
  ne coupe plus les pages. Un script en fin de page range le document dans
  des `.feuille` de la taille exacte de la zone imprimable (format moins les
  10 mm de `@page`, quelques pixels de moins pour qu'un arrondi n'ajoute
  jamais de page blanche). Choix « Mise en page » de la fenêtre
  (`ChoixFeuilles`, `uneFeuille`, **une seule feuille par défaut**) : tout le
  document élargi puis réduit (`zoom`) pour tenir sur une feuille, quel que
  soit le nombre de lignes ; ou plusieurs feuilles, planning réduit à la
  largeur, lignes réparties par `repartirLignes` (pure, testée, recopiée
  dans la page par `toString` : un titre de lot ou de zone ne reste pas
  seul en bas, la fin du document prend sa feuille si elle ne tient pas),
  en-tête du tableau et bande des échéances répétés. Le nom d'une tâche qui
  dépasse à droite est englobé dans le cadre avant la réduction (sinon la
  feuille le coupait). Les flèches du chantier se tracent par bloc
  (`dessinerFleches`) ; coupées par un saut, elles descendent au bas de la
  feuille et reprennent en haut de la suivante. Le script tourne sans
  attendre `load` (document.write) ; l'impression part au `load` ou au bout
  de 2 s. Jamais `transform: scale` + marge négative : sur plusieurs pages,
  la légende remontait sur les dernières lignes.
  Une feuille porte `z-index: 0` (son propre plan) : sans lui, son fond
  blanc dans l'aperçu recouvrait les fonds des périodes (`z-index: -1`).
  Les colonnes s'étirent quand le tableau est plus large que leur somme
  (une feuille) : la bande des échéances place ses flèches **en % du
  tableau**, jamais en mm (elles se décalaient de leur trait).
  Au chantier, **toute longueur horizontale du tableau** (colonnes, barres,
  délais, segments, pauses, fonds de période) s'écrit par `mmK` —
  `calc(Xmm * var(--k, 1))` — et la mise en page règle `--k` pour que les
  colonnes remplissent exactement le cadre (`data-largeur-mm` du tableau).
  En mm fixes, les colonnes s'étiraient seules : sur un grand planning mis
  sur une feuille, les barres s'arrêtaient au milieu de leur dernière
  semaine et les congés ne couvraient pas leur bandeau. L'étude écrit ses
  barres en % des cases : rien à faire.
- **Aperçu dans la fenêtre d'export** (`ApercuPlanning.jsx`, commun aux deux
  fenêtres, réglages à gauche et aperçu à droite, `styleFenetreExport.js`) :
  la **même page** (`htmlApercuChantier` / `htmlApercuEtude`, paramètre
  `apercu` du générateur), dans un cadre isolé (`sandbox="allow-scripts"`)
  réduit à la largeur disponible, refaite 450 ms après le dernier réglage.
  Les paramètres du PDF et de l'aperçu sont un seul objet (`parametresPdf`)
  : ce qui se voit est ce qui s'imprime. En aperçu, les mêmes feuilles,
  entourées de leur marge (`STYLE_APERCU`), et la page envoie hauteur,
  nombre de feuilles et réduction par `postMessage` au lieu d'imprimer :
  « 3 feuilles », « 1 feuille · réduit à 41 % » (`libelleApercu`). Vérifié
  au Chrome sans écran sur 12 cas (chantier et étude, A4 à A1, une ou
  plusieurs feuilles) : nombre de feuilles de l'aperçu = pages imprimées.
  « Agrandir » en plein écran (✕, Échap).

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
  de mois pour que la ligne de mois le traverse. Au chantier en vue
  Semaines, le mois commence à son **premier lundi** et une semaine
  appartient au mois de son lundi (`niveauDuJour(d, 'week')`, `moisDuJour`),
  comme dans l'éditeur : un trait au 1er coupait une semaine en deux. Dans
  cette vue, barres, segments et délais couvrent leurs **semaines entières**,
  du lundi au dimanche (`semainesEntieres`, comme `barreSemaine` de
  l'éditeur) ; au jour près seulement en vue Jours.
- **Périodes** : fond uni (les hachures moiraient à l'impression), trait aux
  vraies dates de début et de fin, bandeau qui les nomme sous les dates. Au
  chantier, **un seul bloc par période et par ligne**, sous la grille
  (`z-index:-1`) : un fond par cellule laissait un fil clair entre deux jours.
- **Barre en pause** : la barre traverse la période bloquante (l'étude aussi,
  sur le papier ; l'écran garde ses fragments), la portion en pause montre la
  période à travers des rayures (`stylePause`).
- **Échéances** (`echeancesExport.js`, commun aux deux PDF, testé) : titre
  en **étiquette de la couleur** de l'échéance, texte blanc ou foncé selon
  la couleur (`couleurTexteSur`), dans la bande au-dessus du tableau —
  jamais sur une tâche ; les étiquettes trop proches passent à la ligne
  suivante d'après leur largeur estimée (`largeurEtiquetteMm`). Dans le
  tableau, trait **plein de 2 px**, `z-index` 7 : devant barres (4),
  délais et segments (3) et pauses (6), derrière les noms des tâches (10),
  qu'il ne doit pas rayer. Au chantier, il traverse aussi les lignes de
  titre de lot ou de zone (`traitsEcheancesLigneEntiere`, sous leur texte).
- **Séparation des noms et du calendrier** : `SEPARATION_NOMS` (2,5 px
  foncé, plus épais qu'un trait de mois pour l'emporter dans la grille
  fusionnée), bord droit de `.plabel` dans les deux PDF.
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
- **Safari (iPad) peint un bloc agrandi par `transform: scale` à sa taille
  d'origine, puis agrandit l'image** : un SVG posé dedans devient flou au
  zoom (contours et points de l'état des lieux, vu le 2026-11-20 ; Chrome
  redessine, lui). Le `calque` de `VisionneusePlan` est donc rendu **hors du
  bloc agrandi**, à la taille de l'écran (largeur × zoom, `zoom` passé à 1),
  placé par `left` / `top`. Tout dessin qui doit rester net au zoom suit la
  même règle (ou passe par le canevas `dessinFond`).
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
- **Barre qui enjambe une période bloquante, à l'écran** (demande de
  l'agence, 2026-11-12) : sur les jours en pause, la barre n'est plus pochée,
  seul son contour reste, sous des hachures de la couleur de la période
  (`shared/planning/pauseBarre.js`, testé dans `pauses-barres.test.js`).
  Chantier : `pausesDeLaBarre` (`geometrie.js`) pour la barre et ses
  segments ; le remplissage et l'avancement sont retirés par un masque CSS
  (`styleMasque`). En vue Semaines, une semaine n'est en pause que si la
  tâche n'y travaille aucun jour. Étude : la barre était déjà coupée en
  fragments ; `pausesEntreFragments` (`types.js`) dessine le contour qui les
  relie. Rien pour les périodes informatives ni pour les segments d'étude
  (ils ne sautent pas les périodes).
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
- **Mode « Résumé » du planning de chantier** (choix « Vue : Détail /
  Résumé » en tête du panneau Options d'affichage, mémorisé par affaire,
  `planning-resume-<affaire>`) : une ligne par lot, ou par zone si le
  planning est groupé par zone. Calcul unique dans `resumeLogique.js`
  (`resumePlanning`, testé) lu par l'écran (`ResumeBarRow` de la timeline,
  `ResumeSidebar`), le PDF (`buildResumeRow`, option `resume`) et l'Excel
  (`emitResumeRow`) : la barre montre les **périodes réelles d'activité**
  (tâches et segments, pas les délais), un morceau par plage — deux plages
  séparées seulement par un week-end ou une fermeture bloquante n'en font
  qu'une (`fusionnerPlages`), un jour ouvré libre fait un trou ; avancement
  pondéré par la durée. Un segment compte pour sa zone, à défaut celle de
  sa tâche ; une tâche d'un lot ou d'une zone supprimés passe sous « Sans
  lot » / « Sans zone ». **Consultation seule** : ni geste sur les lignes, ni
  dessin, ni toucher d'échéance, ni flèches de dépendance. Arrondis à la
  semaine, deux morceaux qui se touchent se fusionnent à l'affichage. La
  fenêtre d'export a son choix « Détail des tâches / Résumé », réglé comme
  l'écran ; le bouton Excel de la barre suit l'écran. Aucune migration.
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
