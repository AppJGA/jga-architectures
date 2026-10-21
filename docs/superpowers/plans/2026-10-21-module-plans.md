# Module « Plans » — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un module « Plans » de la phase chantier qui montre les plans communs de l'affaire, importe un jeu de plans PDF d'un coup sans doublon, se consulte hors ligne, et s'ouvre aussi depuis le mode Visite.

**Architecture:** aucune donnée nouvelle — `affaire_plans` / `affaire_plan_versions` (041), `usePlans`, `plansStockage.js`, `conversionPlan.js`, `VisionneusePlan`, `garderImages` sont réutilisés. La règle d'import (noms, rapprochement « nouvelle version », doublons) est pure dans `importPlansLogique.js`. Un composant plein écran commun (`PlanPleinEcran`) sert au module et au mode Visite.

**Tech Stack:** React 19, Supabase, pdf.js, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-21-module-plans-design.md`

## Global Constraints

- Français partout ; styles inline ; couleur `var(--affaire-accent, …)` dans le cadre de l'affaire.
- Fenêtres fermées par ✕ / Annuler / Échap seulement ; bande `env(safe-area-inset-top)` en plein écran ; boutons de 44 px au moins en visite.
- Aucune migration ; la tuile « Plans » des CR et son import d'une page restent inchangés.
- `npm run build` et `npm test` avant chaque commit ; commit et push en fin de tâche.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/modules/chantier/plans/importPlansLogique.js` (créé) | `nomPropose`, `pagesProposees`, `renommerPage`, `forcerNouveau`, `problemesImport`, `pagesAEnvoyer`. |
| `tests/plans-module.test.js` (créé) | Tests de la règle d'import et de l'étape de préparation. |
| `src/modules/chantier/plans/ImportPlans.jsx` (créé) | Import d'un jeu de plans (pages, cases, noms, cibles, envoi page par page). |
| `src/modules/chantier/plans/index.jsx` (créé) | Module : grille, plein écran, gestion, copie hors ligne. |
| `src/modules/chantier/comptes-rendus/PlanPleinEcran.jsx` (créé) | Plan en plein écran (portail, ✕ / Échap, barre d'état, pastilles facultatives). |
| `src/modules/chantier/comptes-rendus/PlansVue.jsx` | `CartePlan` exportée pour le module. |
| `src/modules/manifest.js` | Module `plans` (phase chantier, icône `Map`). |
| `src/affaire/AffairePage.jsx` | `Map → IconePlans`, rubrique « Documents » retirée, tuile : nombre de plans. |
| `src/modules/chantier/comptes-rendus/horsLigne/preparationLogique.js` + `preparation.js` | Étape « Plans » qui attend la copie des images. |
| `src/modules/chantier/comptes-rendus/CrDetail.jsx`, `ModeVisite.jsx` | `obtenirLiens` dans `PlansContexte` ; bouton « Plans » de la barre. |

### Task 1 : règle d'import (pure) et tests

**Interfaces — Produces :**
- `nomPropose(nomFichier, page, nbPages) → string` : sans extension ; « – p. N » si `nbPages > 1`.
- `pagesProposees(fichiers: [{ id, nom, nbPages }], plans) → [{ cle, fichierId, page, nom, coche, cible, nouveau }]` — `cible` : id du plan existant de même nom (`cleNom`), `nouveau` : forcé nouveau plan.
- `renommerPage(pages, cle, nom, plans)`, `forcerNouveau(pages, cle, oui)`, `cocherPage(pages, cle, oui)` → nouvelles pages.
- `problemesImport(pages) → Map cle → 'vide' | 'doublon'` (pages cochées seulement ; même nom normalisé = doublon, la première exceptée).
- `pagesAEnvoyer(pages) → pages cochées` (vide si un problème).

- [ ] Tests : page seule / PDF de 3 pages / image ; cible trouvée malgré accents et majuscules ; renommage qui fait perdre ou gagner une cible ; `forcerNouveau` annule la cible ; deux pages cochées de même nom → doublon sur la seconde ; page décochée ignorée ; nom vide → `vide` ; `etapesPreparation` contient l'étape `plans`.
- [ ] Implémentation, tests verts, commit.

### Task 2 : plein écran commun et module

- [ ] `PlanPleinEcran({ titre, sousTitre, version, obtenirLiens, pastilles?, onPastille?, enfants?, onFermer })` : portail vers `body`, zIndex 1000, bande de la barre d'état, en-tête sombre, ✕ / Échap, `VisionneusePlan` dessous.
- [ ] `CartePlan` exportée de `PlansVue.jsx` (inchangée).
- [ ] Module `chantier/plans/index.jsx` : `usePlans(affaireId)` ; grille de `CartePlan` (gestion si `!lectureSeule`) ; « Importer des plans » (PDF ou images, plusieurs) → `ImportPlans` ; « Nouvelle version » → `ImportPlan` existant ; toucher → `PlanPleinEcran`. Avec réseau, après chargement : `garderImages` sur aperçus et images de la version courante de chaque plan ; « N plans gardés sur cet appareil ».
- [ ] `ImportPlans.jsx` : ouvre chaque PDF (`ouvrirPdf`), vignettes (40 premières pages par fichier), `pagesProposees` ; par page : case, vignette, nom, mention « nouveau plan » / « nouvelle version de X (indice B) » avec bascule « en faire un nouveau plan » ; problèmes en rouge ; « Importer N plans » : pour chaque page, `convertirPlan({ doc, page })` puis `plansCr.importer` ou `plansCr.nouvelleVersion` ; compteur « k / N » ; une page en échec est notée, les suivantes continuent.
- [ ] Build, essai à l'écran (page d'essai temporaire), commit.

### Task 3 : manifeste et tableau de bord

- [ ] Manifeste : `{ id: 'plans', label: 'Plans', icon: 'Map', path: 'plans', component: lazy(() => import('./chantier/plans')), enabled: true, description: 'Plans du projet, consultables en visite' }` après « Visites de chantier ».
- [ ] `AffairePage` : `Map: IconePlans` dans `ICON_MAP` ; rubrique « Documents · bientôt » retirée ; stats `plans` (compte `affaire_plans`, silencieux sans la 041) ; tuile : « N plans » ou « Aucun plan — importer le jeu de plans ».
- [ ] Build, commit.

### Task 4 : préparation et mode Visite

- [ ] `etapesPreparation` : `{ cle: 'plans', libelle: 'Plans', chemin: `${base}/plans`, plans: true }` ; `preparation.js` : pour cette étape, lire les plans (`plansDeLAffaire`) et `garderImages` avec des liens signés (`liensSignes`, bucket `cr-plans`), échec noté sinon.
- [ ] `CrDetail` : `obtenirLiens` dans la valeur de `PlansContexte`.
- [ ] `ModeVisite` : bouton « Plans » (si plans) → panneau liste (nom, indice, nombre de pastilles de la visite) → `PlanPleinEcran` avec les pastilles des remarques de la visite (numéro, couleur du statut).
- [ ] Tests, build, commit.

### Task 5 : livraison

- [ ] `npm test`, `npm run build`, eslint sans nouveau problème ; CLAUDE.md (module Plans, tests) ; commit, push.
