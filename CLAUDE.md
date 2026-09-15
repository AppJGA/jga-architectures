# Repères pour travailler sur ce dépôt

Gestionnaire d'affaires de l'agence JGA Architectures. React 19 + Vite
(rolldown), Supabase (base, auth, stockage), déployé sur Vercel depuis `main`.

Ce fichier existe pour éviter de re-explorer le dépôt à chaque tâche. Il donne
les points d'entrée ; le détail se lit dans les fichiers cités.

## Commandes

```
npm run dev      # serveur local, port 5173
npm run build    # doit passer avant tout commit
npm test         # 208 tests node --test (plannings, exports, comptes rendus, photos)
npx eslint src   # ~74 problèmes préexistants : comparer, ne pas viser zéro
```

`npm test` couvre, dans `tests/` : les chemins critiques (`planning.test.js`,
`planning-etude.test.js`), la géométrie des barres du Gantt chantier
(`geometrie.test.js`) et les exports (`export.test.js`, `export-etude.test.js`,
`export-chantier-excel.test.js`), ainsi que la reprise et les compteurs des
comptes rendus (`comptes-rendus.test.js`, `photos.test.js`, sur `crLogique.js` et
`photosLogique.js`). Rien ne couvre l'interface : la logique des
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
- **Base** : `supabase/migrations/`, numérotées, 41 fichiers, **passées à la
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
  l'écran d'export.

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
- **Jamais de `Math.floor` sur un écart en millisecondes entre deux dates.**
  Entre l'hiver et l'été, il manque une heure : un lundi tombait dans la
  semaine précédente. Utiliser `joursEntre` (`chantier/planning/geometrie.js`).
- **Plannings : une durée est en jours ouvrés** (semaines pour l'étude), hors
  week-ends et fermetures bloquantes. Toute fin de barre, d'export ou de délai
  passe par `dernierJourTache` ; ne jamais ajouter des jours calendaires à une
  durée.
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
