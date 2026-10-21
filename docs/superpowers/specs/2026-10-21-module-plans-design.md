# Module « Plans » — conception

Validée avec l'agence le 2026-10-21.

## 1. Le besoin

Ranger les plans du projet (PDF) dans l'affaire et les consulter sur la
tablette pendant les réunions de chantier, même sans réseau. La rubrique
« Documents · bientôt » de la colonne de l'affaire devient le module
**« Plans »** (le mot « Documents » prêtait à confusion).

**Pas de doublon** : les plans existent déjà, communs à l'affaire
(`affaire_plans` → `affaire_plan_versions`, migration 041), importés jusqu'ici
depuis la tuile « Plans » d'un compte rendu. Le module montre ces mêmes
plans ; importer d'un côté, c'est importer pour l'autre.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Place | Module de la **phase chantier** du manifeste (tuile + colonne). La rubrique « Documents » de `AffairePage` disparaît. |
| Données | **Aucune migration** : tables et stockage `cr-plans` de la 041, fonctions de `plansStockage.js`, `usePlans`. |
| Format | PDF (et image, comme aujourd'hui) ; chaque page devient une image sur l'appareil (`conversionPlan.js`, 6 000 px, ≈ 1,5 Mo avec l'aperçu). |
| Jeu de plans | **Toutes les pages** d'un PDF proposées, cochées, nom modifiable ; envoi page par page. |
| Doublon | Un plan **du même nom** dans l'affaire → la page devient sa **nouvelle version** (indice suivant), choix modifiable. |
| Nom proposé | Nom du fichier (page seule) ou « nom du fichier – p. 3 ». Pas de lecture du cartouche (aucun exemple pour la régler ; possible plus tard). |
| Hors ligne | Images recopiées sur l'appareil à l'ouverture du module avec réseau et par « Préparer pour le chantier » ; relues sans réseau. |
| Visite | Bouton **« Plans »** dans la barre du mode Visite : liste, visionneuse plein écran, pastilles de la visite en cours. |
| Droits | Ceux d'aujourd'hui : gérer (importer, version, renommer, supprimer) si l'affaire est modifiable ; sinon consulter. Un plan affiché par un CR émis ne se supprime pas (base). |

## 3. Import d'un jeu de plans (`importPlansLogique.js`, pur et testé)

- `pagesProposees(fichiers, plans)` : pour chaque page de chaque PDF (une
  « page » pour une image), `{ fichier, page, nom, coche: true, cible }` —
  `nom` d'après le fichier (sans extension ; « – p. N » s'il a plusieurs
  pages), `cible` = le plan existant de même nom (`cleNom`, sans
  majuscules, accents ni ligatures) ou nul (nouveau plan).
- Renommer une page recalcule sa cible ; on peut forcer « nouveau plan »
  même si un plan du même nom existe.
- Deux pages cochées du même nom dans l'import : la seconde est signalée
  (« même nom qu'une autre page ») et l'import refusé tant que ce n'est pas
  réglé.
- Écran `ImportPlans.jsx` (module) : vignettes des pages (`vignettePage`,
  40 premières par fichier), case, nom, mention « nouveau » ou « nouvelle
  version de … (indice B) ». « Importer N plans » convertit et envoie page
  par page (`convertirPlan`, `importerPlan` / `nouvelleVersionPlan`),
  compteur « 4 / 12 » ; une page en échec est signalée, les autres
  continuent. Fenêtre fermée par ✕ / Annuler / Échap seulement.
- La tuile « Plans » des comptes rendus garde son import d'une page
  (`ImportPlan.jsx`), inchangé.

## 4. Module (`src/modules/chantier/plans/`)

- Grille de vignettes (aperçu, nom, indice, date) ; toucher → visionneuse
  plein écran (`VisionneusePlan`, zoom au doigt), bande de la barre d'état,
  ✕ / Échap.
- Gestion (si modifiable) : « Importer des plans », nouvelle version,
  renommer, supprimer — mêmes appels que la tuile des CR.
- Tuile du tableau de bord : nombre de plans.

## 5. Hors ligne

- À l'ouverture du module avec réseau : `garderImages` (horsLigne/images.js)
  sur les aperçus et les images de la version courante de chaque plan,
  dans le budget existant (60 Mo).
- Sans réseau : liste lue par la mémoire du service worker (`supabase-api`)
  ; images par `liensLocaux` ; un plan sans copie montre « Pas de copie sur
  cet appareil ».
- `etapesPreparation` ajoute « Plans » (`/plans`) ; l'étape attend la copie
  des images comme celle des pièces écrites attend la leur.

## 6. Mode Visite

Bouton « Plans » (si l'affaire a des plans) → panneau liste puis
visionneuse, avec les pastilles des remarques de la visite (même rendu que
`PlansVue`). Images lues comme le reste de la visite (copies emportées).

## 7. Tests

`tests/plans-module.test.js` : noms proposés (page seule, plusieurs pages,
image), cible par nom (accents, majuscules), renommage qui change la cible,
forçage « nouveau plan », doublon dans l'import, pages décochées ignorées ;
`etapesPreparation` contient l'étape Plans. Écran essayé sur une page
d'essai, bureau et tablette.

## 8. Hors portée

Lecture du cartouche, autres documents que des plans, partage ou envoi
des plans.
